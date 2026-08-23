import { supabase } from './supabase';
import { generateTicketCode } from '../betslipLogic';
import { tournamentLine } from './betTicket';
import type { BetEvent, BetHistoryEntry, BetSelection, BetStatus, SportId } from '../types';

export interface WalletRow {
  id: string;
  balance: number;
  publicId: string | null;
}

export async function fetchWallet(): Promise<WalletRow | null> {
  const withPublicId = await supabase
    .from('wallets')
    .select('id, balance, public_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!withPublicId.error && withPublicId.data?.id) {
    return {
      id: withPublicId.data.id as string,
      balance: Number(withPublicId.data.balance ?? 0),
      publicId: (withPublicId.data.public_id as string | null) ?? null,
    };
  }

  const { data, error } = await supabase
    .from('wallets')
    .select('id, balance')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Failed to load wallet:', error.message);
    return null;
  }
  if (!data?.id) return null;
  return { id: data.id as string, balance: Number(data.balance ?? 0), publicId: null };
}

export async function fetchWalletBalance(): Promise<number | null> {
  const wallet = await fetchWallet();
  return wallet?.balance ?? null;
}

function splitTeams(label: string): { homeTeam: string; awayTeam: string } {
  const parts = label.split(/\s+[—–-]\s+/);
  return { homeTeam: parts[0]?.trim() ?? '', awayTeam: parts[1]?.trim() ?? '' };
}

function teamsOf(selection: BetSelection) {
  if (selection.homeTeam || selection.awayTeam) {
    return { homeTeam: selection.homeTeam ?? '', awayTeam: selection.awayTeam ?? '' };
  }
  return splitTeams(selection.matchLabel);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbMatchId(matchId?: string): string | undefined {
  if (!matchId || !UUID_RE.test(matchId)) return undefined;
  return matchId;
}

export async function placeBet(params: {
  selections: BetSelection[];
  stake: number;
  mode: 'single' | 'express';
}): Promise<{ ok: true; newBalance: number } | { ok: false; error: string }> {
  const { selections, stake, mode } = params;
  if (!selections.length) return { ok: false, error: 'Купон пуст' };
  if (!Number.isFinite(stake) || stake <= 0) return { ok: false, error: 'Введите сумму ставки' };

  const isExpress = mode === 'express' && selections.length >= 2;
  const totalOdds = isExpress
    ? selections.reduce((acc, item) => acc * item.odds, 1)
    : selections.length === 1
      ? selections[0].odds
      : selections.reduce((acc, item) => acc + item.odds, 0);
  const totalStake = isExpress || selections.length === 1 ? stake : stake * selections.length;
  const potentialWin = isExpress || selections.length === 1
    ? stake * (isExpress ? selections.reduce((acc, item) => acc * item.odds, 1) : selections[0].odds)
    : selections.reduce((acc, item) => acc + stake * item.odds, 0);

  const wallet = await fetchWallet();
  if (!wallet) return { ok: false, error: 'Кошелёк не найден' };
  if (totalStake > wallet.balance) return { ok: false, error: 'Недостаточно средств' };

  const first = selections[0];
  const teams = teamsOf(first);
  const couponType = selections.length > 1 ? 'express' : 'single';
  const events = selections.map((item) => {
    const names = teamsOf(item);
    const matchLabel = item.matchLabel || [names.homeTeam, names.awayTeam].filter(Boolean).join(' — ');
    const tournament = tournamentLine({
      tournament: item.tournament,
      sport: item.sport,
      country: item.country,
      league: item.league,
    });
    return {
      matchId: item.matchId,
      matchLabel,
      homeTeam: names.homeTeam,
      awayTeam: names.awayTeam,
      tournament,
      sport: item.sport ?? null,
      country: item.country ?? null,
      league: item.league ?? null,
      market: item.market,
      selection: item.outcome,
      outcome: item.outcome,
      odds: item.odds,
      isLive: Boolean(item.isLive),
      liveStatus: item.liveStatus ?? null,
      matchStatus: item.isLive ? item.liveStatus || 'LIVE' : 'Не начался',
    };
  });

  const fullPayload = {
    ...(dbMatchId(first.matchId) ? { match_id: dbMatchId(first.matchId) } : {}),
    selection: isExpress ? selections.map((item) => item.outcome).join(', ') : first.outcome,
    odds: Number(totalOdds.toFixed(4)),
    amount: Number(totalStake.toFixed(2)),
    potential_win: Number(potentialWin.toFixed(2)),
    status: 'accepted',
    wallet_id: wallet.id,
    home_team: teams.homeTeam,
    away_team: teams.awayTeam,
    market: first.market,
    type: couponType,
    total_odds: Number(totalOdds.toFixed(4)),
    events,
    ticket_code: generateTicketCode(),
  };

  let bet = await supabase.from('bets').insert(fullPayload).select('id').single();
  if (bet.error) {
    bet = await supabase
      .from('bets')
      .insert({
        ...(dbMatchId(first.matchId) ? { match_id: dbMatchId(first.matchId) } : {}),
        selection: fullPayload.selection,
        odds: fullPayload.odds,
        amount: fullPayload.amount,
        potential_win: fullPayload.potential_win,
        status: 'accepted',
        wallet_id: wallet.id,
      })
      .select('id')
      .single();
  }
  if (bet.error || !bet.data?.id) {
    const retry = await supabase
      .from('bets')
      .insert({
        ...(dbMatchId(first.matchId) ? { match_id: dbMatchId(first.matchId) } : {}),
        selection: fullPayload.selection,
        odds: fullPayload.odds,
        amount: fullPayload.amount,
        potential_win: fullPayload.potential_win,
        status: 'pending',
        wallet_id: wallet.id,
      })
      .select('id')
      .single();
    if (retry.error || !retry.data?.id) {
      console.error('Failed to insert bet:', bet.error?.message ?? retry.error?.message);
      return { ok: false, error: 'Не удалось сохранить ставку' };
    }
    bet = retry;
  }

  const newBalance = Number((wallet.balance - totalStake).toFixed(2));
  const { error: walletError } = await supabase
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', wallet.id);

  if (walletError) {
    console.error('Failed to update wallet:', walletError.message);
    return { ok: false, error: 'Не удалось списать баланс' };
  }

  const { error: txError } = await supabase.from('transactions').insert({
    type: 'bet_placed',
    title: couponType === 'express' ? `Ставка: экспресс (${events.length} событий)` : `Ставка: ${first.matchLabel}`,
    amount: -totalStake,
    status: 'completed',
    bet_id: bet.data.id,
  });
  if (txError) console.error('Failed to insert transaction:', txError.message);

  const itemRows = events.map((event) => ({
    bet_id: bet.data.id,
    ...(dbMatchId(event.matchId) ? { match_id: dbMatchId(event.matchId) } : {}),
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    match_label: event.matchLabel,
    tournament: event.tournament,
    sport: event.sport,
    country: event.country,
    market: event.market,
    selection: event.selection,
    outcome: event.outcome,
    odds: event.odds,
    is_live: event.isLive,
    live_status: event.liveStatus,
    match_status: event.matchStatus,
  }));
  const { error: itemsError } = await supabase.from('bet_items').insert(itemRows);
  if (itemsError) {
    const coreRows = itemRows.map((row) => {
      const next = { ...row } as Record<string, unknown>;
      delete next.tournament;
      delete next.sport;
      delete next.country;
      delete next.selection;
      return next;
    });
    const { error: retryItems } = await supabase.from('bet_items').insert(coreRows);
    if (retryItems) console.error('Failed to insert bet_items:', retryItems.message);
  }

  return { ok: true, newBalance };
}

function mapStatus(value: string | undefined): BetStatus {
  if (value === 'won' || value === 'win') return 'won';
  if (value === 'lost' || value === 'lose') return 'lost';
  return 'in_progress';
}

export async function fetchBets(): Promise<BetHistoryEntry[]> {
  const { data, error } = await supabase.from('bets').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to load bets:', error.message);
    return [];
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((row) => String(row.id));
  const itemsByBet = new Map<string, BetHistoryEntry['events']>();

  if (ids.length) {
    const { data: items } = await supabase.from('bet_items').select('*').in('bet_id', ids);
    for (const raw of (items ?? []) as Record<string, unknown>[]) {
      const betId = String(raw.bet_id ?? '');
      const list = itemsByBet.get(betId) ?? [];
      list.push(mapItem(raw));
      itemsByBet.set(betId, list);
    }
  }

  return rows.map((row) => {
    const fromItems = itemsByBet.get(String(row.id));
    const fromJson = parseEventsJson(row.events);
    const fallback = [
      {
        matchId: row.match_id ? String(row.match_id) : undefined,
        matchLabel: [row.home_team, row.away_team].filter(Boolean).join(' — ') || String(row.selection ?? ''),
        market: String(row.market ?? ''),
        outcome: String(row.selection ?? ''),
        selection: String(row.selection ?? ''),
        odds: Number(row.odds ?? row.total_odds ?? 0),
        homeTeam: row.home_team ? String(row.home_team) : undefined,
        awayTeam: row.away_team ? String(row.away_team) : undefined,
        matchStatus: 'Принята',
      },
    ];
    const events = fromItems && fromItems.length > 0 ? fromItems : fromJson.length > 0 ? fromJson : fallback;

    const created = row.created_at ? new Date(String(row.created_at)) : new Date();
    const type = events.length > 1 || row.type === 'express' ? 'express' : 'single';
    const totalOdds = Number(row.total_odds ?? row.odds ?? 0);
    const amount = Number(row.amount ?? row.stake ?? 0);

    return {
      id: String(row.id),
      type,
      events,
      totalOdds,
      amount,
      payout: Number(row.potential_win ?? row.payout ?? 0),
      status: mapStatus(String(row.status ?? '')),
      date: created.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      ticketCode: row.ticket_code ? String(row.ticket_code) : undefined,
    };
  });
}

function mapEvent(raw: Record<string, unknown>): BetEvent {
  const home = String(raw.homeTeam ?? raw.home_team ?? '');
  const away = String(raw.awayTeam ?? raw.away_team ?? '');
  const outcome = String(raw.outcome ?? raw.selection ?? '');
  const sport = (raw.sport ? String(raw.sport) : undefined) as SportId | undefined;
  const country = raw.country ? String(raw.country) : undefined;
  const league = raw.league ? String(raw.league) : undefined;
  const tournament = tournamentLine({
    tournament: raw.tournament ? String(raw.tournament) : undefined,
    sport,
    country,
    league,
  });
  const isLive = Boolean(raw.isLive ?? raw.is_live);
  const liveStatus = raw.liveStatus ? String(raw.liveStatus) : raw.live_status ? String(raw.live_status) : undefined;

  return {
    matchId: raw.matchId ? String(raw.matchId) : raw.match_id ? String(raw.match_id) : undefined,
    matchLabel: String(raw.matchLabel ?? raw.match_label ?? [home, away].filter(Boolean).join(' — ')),
    market: String(raw.market ?? ''),
    outcome,
    selection: String(raw.selection ?? outcome),
    odds: Number(raw.odds ?? 0),
    homeTeam: home || undefined,
    awayTeam: away || undefined,
    sport,
    country,
    league,
    tournament: tournament || undefined,
    isLive,
    liveStatus,
    matchStatus: String(raw.matchStatus ?? raw.match_status ?? (isLive ? 'LIVE' : 'Не начался')),
  };
}

function mapItem(raw: Record<string, unknown>): BetEvent {
  return mapEvent(raw);
}

function parseEventsJson(value: unknown): BetEvent[] {
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((event) => mapEvent(event as Record<string, unknown>));
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
