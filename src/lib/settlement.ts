import { supabase } from './supabase';
import type { NormalizedMatch } from './betsapi';

const OPEN_STATUSES = new Set(['accepted', 'pending', 'in_progress', 'open', 'placed']);

export type SettleResult = 'won' | 'lost' | 'void' | 'pending';

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function signedLine(raw: string): number {
  return Number(String(raw).replace(',', '.').replace(/^\+/, ''));
}

export function settleSelection(
  selection: string,
  market: string,
  homeScore: number,
  awayScore: number,
): SettleResult {
  const total = homeScore + awayScore;
  const sel = selection.trim();
  const blob = `${market} ${sel}`.trim();
  const key = sel.toUpperCase().replace('Х', 'X').replace(/\s+/g, '');

  const over = sel.match(/(?:ТБ|OVER|O)\s*([+-]?\d+(?:[.,]\d+)?)/i);
  const under = sel.match(/(?:ТМ|UNDER|U)\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (over && !/ТМ|UNDER/i.test(sel)) {
    const line = signedLine(over[1]);
    if (total === line) return 'void';
    return total > line ? 'won' : 'lost';
  }
  if (under) {
    const line = signedLine(under[1]);
    if (total === line) return 'void';
    return total < line ? 'won' : 'lost';
  }

  const homeHandicap = blob.match(/Ф1\s*\(([^)]+)\)/i);
  const awayHandicap = blob.match(/Ф2\s*\(([^)]+)\)/i);
  if (homeHandicap) {
    const line = signedLine(homeHandicap[1]);
    const diff = homeScore + line - awayScore;
    if (diff === 0) return 'void';
    return diff > 0 ? 'won' : 'lost';
  }
  if (awayHandicap) {
    const line = signedLine(awayHandicap[1]);
    const diff = awayScore + line - homeScore;
    if (diff === 0) return 'void';
    return diff > 0 ? 'won' : 'lost';
  }

  if (['П1', '1', 'W1', 'HOME'].includes(key)) return homeScore > awayScore ? 'won' : 'lost';
  if (['П2', '2', 'W2', 'AWAY'].includes(key)) return awayScore > homeScore ? 'won' : 'lost';
  if (['X', 'НИЧЬЯ', 'DRAW', 'Н'].includes(key)) return homeScore === awayScore ? 'won' : 'lost';
  return 'pending';
}

function combineLegs(results: SettleResult[]): SettleResult {
  if (results.some((row) => row === 'pending')) return 'pending';
  if (results.some((row) => row === 'lost')) return 'lost';
  if (results.length > 0 && results.every((row) => row === 'void')) return 'void';
  if (results.some((row) => row === 'won')) return 'won';
  return 'pending';
}

async function creditWallet(params: {
  walletId: string | null;
  amount: number;
  betId: string;
  title: string;
  type: string;
}): Promise<void> {
  if (params.amount <= 0) return;
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('bet_id', params.betId)
    .in('type', ['bet_won', 'bet_payout', 'win', 'bet_refund'])
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  let walletId = params.walletId;
  let balance = 0;
  if (walletId) {
    const { data } = await supabase.from('wallets').select('id, balance').eq('id', walletId).maybeSingle();
    if (data?.id) {
      walletId = data.id as string;
      balance = toNum(data.balance);
    } else {
      walletId = null;
    }
  }
  if (!walletId) {
    const { data } = await supabase.from('wallets').select('id, balance').limit(1).maybeSingle();
    if (!data?.id) return;
    walletId = data.id as string;
    balance = toNum(data.balance);
  }

  const next = Number((balance + params.amount).toFixed(2));
  const { error } = await supabase
    .from('wallets')
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq('id', walletId);
  if (error) {
    console.error('Failed to credit wallet:', error.message);
    return;
  }

  const { error: txError } = await supabase.from('transactions').insert({
    type: params.type,
    title: params.title,
    amount: params.amount,
    status: 'completed',
    bet_id: params.betId,
  });
  if (txError) console.error('Failed to insert payout transaction:', txError.message);
}

async function updateLeg(itemId: string, result: SettleResult, liveStatus: string): Promise<void> {
  const matchStatus = result === 'won' ? 'Зашел' : result === 'lost' ? 'Не зашел' : result === 'void' ? 'Возврат' : liveStatus;
  await supabase
    .from('bet_items')
    .update({ match_status: matchStatus, live_status: liveStatus, is_live: false })
    .eq('id', itemId);
}

function teamsKey(home: string, away: string): string {
  return `${home.trim().toLowerCase()}|${away.trim().toLowerCase()}`;
}

function indexFinishedMatches(finished: NormalizedMatch[]) {
  const byId = new Map<string, { home: number; away: number; finished: boolean; liveStatus: string }>();
  const byTeams = new Map<string, { home: number; away: number; finished: boolean; liveStatus: string }>();
  for (const match of finished) {
    if (match.status !== 'finished') continue;
    const row = {
      home: match.homeScore,
      away: match.awayScore,
      finished: true,
      liveStatus: match.liveStatus || 'Завершён',
    };
    if (match.externalId) byId.set(String(match.externalId), row);
    const key = teamsKey(match.homeTeam, match.awayTeam);
    if (key !== '|') byTeams.set(key, row);
  }
  return { byId, byTeams };
}

export async function settleOpenBets(finishedMatches: NormalizedMatch[] = []): Promise<number> {
  const { data: bets, error } = await supabase.from('bets').select('*').order('created_at', { ascending: false }).limit(250);
  if (error) {
    console.error('Failed to load bets for settlement:', error.message);
    return 0;
  }

  const open = ((bets ?? []) as Record<string, unknown>[]).filter((row) =>
    OPEN_STATUSES.has(String(row.status ?? '').toLowerCase()),
  );
  if (!open.length) return 0;

  const ids = open.map((row) => String(row.id));
  const { data: items } = await supabase.from('bet_items').select('*').in('bet_id', ids);
  const itemsByBet = new Map<string, Record<string, unknown>[]>();
  for (const raw of (items ?? []) as Record<string, unknown>[]) {
    const betId = String(raw.bet_id ?? '');
    const list = itemsByBet.get(betId) ?? [];
    list.push(raw);
    itemsByBet.set(betId, list);
  }

  const { byId, byTeams } = indexFinishedMatches(finishedMatches);

  let settled = 0;
  for (const bet of open) {
    const betId = String(bet.id);
    const legs = itemsByBet.get(betId) ?? [];
    const events = Array.isArray(bet.events) ? (bet.events as Record<string, unknown>[]) : [];
    const fallbackLeg: Record<string, unknown> = {
      match_id: bet.match_id,
      selection: bet.selection,
      outcome: bet.selection,
      market: bet.market,
      home_team: bet.home_team,
      away_team: bet.away_team,
    };
    const source = legs.length ? legs : [fallbackLeg];
    const results: SettleResult[] = [];

    for (let i = 0; i < source.length; i++) {
      const leg = source[i];
      const event = events[i] ?? {};
      const id = String(leg.match_id ?? event.matchId ?? event.match_id ?? bet.match_id ?? '');
      const homeTeam = String(leg.home_team ?? event.homeTeam ?? event.home_team ?? bet.home_team ?? '');
      const awayTeam = String(leg.away_team ?? event.awayTeam ?? event.away_team ?? bet.away_team ?? '');
      const match = (id ? byId.get(id) : undefined) ?? byTeams.get(teamsKey(homeTeam, awayTeam));
      if (!match?.finished) {
        results.push('pending');
        continue;
      }
      const result = settleSelection(
        String(leg.selection ?? leg.outcome ?? ''),
        String(leg.market ?? ''),
        match.home,
        match.away,
      );
      results.push(result);
      if (leg.id) await updateLeg(String(leg.id), result, match.liveStatus || 'Завершён');
    }

    const combined = combineLegs(results);
    if (combined === 'pending') continue;

    const nextStatus = combined === 'won' ? 'won' : combined === 'void' ? 'void' : 'lost';
    const { error: betError } = await supabase.from('bets').update({ status: nextStatus }).eq('id', betId);
    if (betError) {
      console.error(`Failed to settle bet ${betId}:`, betError.message);
      continue;
    }

    if (combined === 'won') {
      await creditWallet({
        walletId: bet.wallet_id ? String(bet.wallet_id) : null,
        amount: toNum(bet.potential_win),
        betId,
        title: 'Выигрыш по ставке',
        type: 'bet_won',
      });
    } else if (combined === 'void') {
      await creditWallet({
        walletId: bet.wallet_id ? String(bet.wallet_id) : null,
        amount: toNum(bet.amount ?? bet.stake),
        betId,
        title: 'Возврат ставки',
        type: 'bet_refund',
      });
    }

    settled += 1;
  }

  return settled;
}
