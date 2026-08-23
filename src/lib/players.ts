import { supabase } from './supabase';
import { formatBackofficeDateTime, type ManagerSession } from './backoffice';

export interface PlayerListItem {
  id: string;
  walletId: string | null;
  publicId: string;
  phone: string;
  email: string;
  balanceTmtm: number;
  balanceUsdt: number;
  turnover: number;
  ggr: number;
  blocked: boolean;
  registeredAt: string;
}

export interface PlayerSummary {
  deposits: number;
  payouts: number;
  profit: number;
  lastLoginAt: string | null;
}

export interface PlayerGameRound {
  id: string;
  game: string;
  stake: number;
  multiplier: number;
  payout: number;
  result: 'win' | 'loss';
  createdAt: string;
}

export interface PlayerSportBet {
  id: string;
  type: 'single' | 'express';
  odds: number;
  amount: number;
  status: string;
  selection: string;
  ticketCode: string;
  createdAt: string;
}

export interface PlayerCashTx {
  id: string;
  type: string;
  title: string;
  amount: number;
  status: string;
  cashierId: string | null;
  cashierLabel: string | null;
  receiptCode: string | null;
  createdAt: string;
}

export interface PlayerDossier {
  player: PlayerListItem;
  summary: PlayerSummary;
  games: PlayerGameRound[];
  sports: PlayerSportBet[];
  transactions: PlayerCashTx[];
}

const DEMO_PLAYERS_KEY = 'nextpari-backoffice-players';

interface PlayerDemoStore {
  blocked: Record<string, boolean>;
  balances: Record<string, { tmtm: number; usdt: number }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function str(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function isMissingRpc(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = error?.message ?? '';
  return error?.code === 'PGRST202' || /could not find the function/i.test(msg) || /schema cache/i.test(msg);
}

function isMissingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = error?.message ?? '';
  return (
    error?.code === 'PGRST205'
    || error?.code === 'PGRST204'
    || error?.code === '42P01'
    || error?.code === '42703'
    || /could not find the table/i.test(msg)
    || /does not exist/i.test(msg)
    || /schema cache/i.test(msg)
  );
}

function rpcMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? 'Ошибка бэкофиса';
  return raw.replace(/^.*ERROR:\s*/i, '').replace(/\s+Where:[\s\S]*$/i, '').trim() || 'Ошибка бэкофиса';
}

async function selectRows(table: string, columns = '*'): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) return [];
  return ((data ?? []) as unknown[]).map((row) => asRecord(row));
}

function loadDemoStore(): PlayerDemoStore {
  try {
    const raw = localStorage.getItem(DEMO_PLAYERS_KEY);
    if (!raw) return { blocked: {}, balances: {} };
    const parsed = JSON.parse(raw) as PlayerDemoStore;
    return {
      blocked: parsed.blocked && typeof parsed.blocked === 'object' ? parsed.blocked : {},
      balances: parsed.balances && typeof parsed.balances === 'object' ? parsed.balances : {},
    };
  } catch {
    return { blocked: {}, balances: {} };
  }
}

function saveDemoStore(store: PlayerDemoStore) {
  localStorage.setItem(DEMO_PLAYERS_KEY, JSON.stringify(store));
}

function displayPublicId(publicId: string, id: string): string {
  const clean = publicId.replace(/^#/, '').trim();
  if (/^\d{4,8}$/.test(clean)) return clean;
  const hex = id.replace(/-/g, '').slice(-6);
  const n = (Number.parseInt(hex, 16) % 90000) + 10000;
  return String(Number.isFinite(n) ? n : 10482);
}

function sportPayout(row: Record<string, unknown>): number {
  const status = str(row.status).toLowerCase();
  if (['won', 'win'].includes(status)) return num(row.potential_win ?? row.potentialWin ?? row.payout);
  if (['void', 'cancelled'].includes(status)) return num(row.amount ?? row.stake);
  return 0;
}

function gameNameOf(row: Record<string, unknown>, fallback: string): string {
  const raw = str(row.game ?? row.game_name ?? row.title ?? row.vertical, fallback).toLowerCase();
  if (raw.includes('apple')) return 'Apple of Fortune';
  if (raw.includes('crystal') || raw.includes('mines')) return 'Crystal';
  if (raw.includes('aviator') || raw.includes('crash')) return 'Aviator';
  if (raw.includes('casino') || raw.includes('slot')) return 'Казино';
  if (raw === 'games') return fallback;
  return str(row.game ?? row.game_name ?? row.title, fallback);
}

function parseGameRound(row: Record<string, unknown>, index: number): PlayerGameRound {
  const stake = num(row.stake ?? row.amount ?? row.bet);
  const payout = num(row.payout ?? row.win ?? row.profit);
  const multiplier = num(row.multiplier ?? row.coeff ?? row.odds ?? row.crash) || (stake > 0 ? payout / stake : 0);
  const gameCycle = ['Apple of Fortune', 'Crystal', 'Aviator'][index % 3];
  return {
    id: str(row.id, `game-${index}`),
    game: gameNameOf(row, gameCycle),
    stake,
    multiplier: Number(multiplier.toFixed(2)),
    payout,
    result: payout > stake ? 'win' : 'loss',
    createdAt: str(row.created_at ?? row.createdAt, new Date().toISOString()),
  };
}

function parseSportBet(row: Record<string, unknown>): PlayerSportBet {
  const type = str(row.type, 'single') === 'express' ? 'express' : 'single';
  return {
    id: str(row.id),
    type,
    odds: num(row.total_odds ?? row.odds),
    amount: num(row.amount),
    status: str(row.status, 'accepted'),
    selection: str(row.selection),
    ticketCode: str(row.ticket_code ?? row.ticketCode),
    createdAt: str(row.created_at ?? row.createdAt),
  };
}

function fallbackPlayers(): PlayerListItem[] {
  return [
    {
      id: '00000000-0000-0000-0000-00000000pl01',
      walletId: null,
      publicId: '10482',
      phone: '+993 65 12 34 56',
      email: 'azat.m@mail.ru',
      balanceTmtm: 240.5,
      balanceUsdt: 18,
      turnover: 3180,
      ggr: 420,
      blocked: false,
      registeredAt: hoursAgo(24 * 48),
    },
    {
      id: '00000000-0000-0000-0000-00000000pl02',
      walletId: null,
      publicId: '645912',
      phone: '+993 61 90 11 22',
      email: 'meret.a@gmail.com',
      balanceTmtm: 86.4,
      balanceUsdt: 0,
      turnover: 1540,
      ggr: 190,
      blocked: false,
      registeredAt: hoursAgo(24 * 20),
    },
    {
      id: '00000000-0000-0000-0000-00000000pl03',
      walletId: null,
      publicId: '882341',
      phone: '+993 64 55 08 17',
      email: 'gulshat.b@yahoo.com',
      balanceTmtm: 0,
      balanceUsdt: 5.2,
      turnover: 870,
      ggr: -40,
      blocked: true,
      registeredAt: hoursAgo(24 * 11),
    },
  ];
}

function applyDemoOverlay(player: PlayerListItem): PlayerListItem {
  const demo = loadDemoStore();
  const blocked = demo.blocked[player.id] ?? demo.blocked[player.publicId];
  const balance = demo.balances[player.id] ?? demo.balances[player.publicId];
  return {
    ...player,
    blocked: blocked ?? player.blocked,
    balanceTmtm: balance?.tmtm ?? player.balanceTmtm,
    balanceUsdt: balance?.usdt ?? player.balanceUsdt,
  };
}

function matchesPlayer(
  row: Record<string, unknown>,
  player: PlayerListItem,
  primaryWalletId: string | null,
): boolean {
  const walletId = str(row.wallet_id ?? row.walletId);
  const publicId = str(row.player_public_id ?? row.playerPublicId ?? row.public_id ?? row.publicId);
  const profileId = str(row.user_id ?? row.profile_id ?? row.player_id);
  if (player.walletId && walletId && walletId === player.walletId) return true;
  if (publicId && publicId === player.publicId) return true;
  if (profileId && (profileId === player.id || profileId === player.walletId)) return true;
  if (!walletId && !publicId && !profileId && primaryWalletId && player.walletId === primaryWalletId) {
    return true;
  }
  return false;
}

interface RawBundle {
  profiles: Record<string, unknown>[];
  wallets: Record<string, unknown>[];
  personal: Record<string, unknown>[];
  bets: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  ops: Record<string, unknown>[];
  games: Record<string, unknown>[];
  casinoBets: Record<string, unknown>[];
  wagers: Record<string, unknown>[];
  cashiers: Record<string, unknown>[];
}

async function loadBundle(): Promise<RawBundle> {
  const [
    profiles, wallets, personal, bets, transactions, ops, games, casinoBets, wagers, cashiers,
  ] = await Promise.all([
    selectRows('profiles'),
    selectRows('wallets'),
    selectRows('personal_data'),
    selectRows('bets'),
    selectRows('transactions'),
    selectRows('cashier_operations'),
    selectRows('game_history'),
    selectRows('casino_bets'),
    selectRows('product_wagers'),
    selectRows('cashiers', 'id, login, full_name, point_name, city'),
  ]);
  return { profiles, wallets, personal, bets, transactions, ops, games, casinoBets, wagers, cashiers };
}

function primaryWalletId(wallets: Record<string, unknown>[]): string | null {
  if (!wallets.length) return null;
  const sorted = [...wallets].sort((a, b) => str(a.created_at).localeCompare(str(b.created_at)));
  return str(sorted[0].id) || null;
}

function personalForIndex(personal: Record<string, unknown>[], index: number): { phone: string; email: string } {
  const row = personal[index] ?? personal[0];
  if (!row) return { phone: '', email: '' };
  return { phone: str(row.phone), email: str(row.email) };
}

function buildPlayers(bundle: RawBundle): PlayerListItem[] {
  const { profiles, wallets, personal, bets, games, casinoBets, wagers, ops } = bundle;
  const primary = primaryWalletId(wallets);
  const byKey = new Map<string, PlayerListItem>();

  const upsert = (item: PlayerListItem) => {
    const key = item.walletId || item.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      return;
    }
    byKey.set(key, {
      ...prev,
      publicId: /^\d+$/.test(item.publicId) ? item.publicId : prev.publicId,
      phone: item.phone || prev.phone,
      email: item.email || prev.email,
      balanceTmtm: item.balanceTmtm || prev.balanceTmtm,
      balanceUsdt: item.balanceUsdt || prev.balanceUsdt,
      blocked: item.blocked || prev.blocked,
      registeredAt: item.registeredAt && item.registeredAt < prev.registeredAt ? item.registeredAt : prev.registeredAt,
      walletId: item.walletId || prev.walletId,
    });
  };

  wallets.forEach((row, index) => {
    const id = str(row.id);
    if (!id) return;
    const currency = str(row.currency, 'TMTM').toUpperCase();
    const balance = num(row.balance);
    const contacts = personalForIndex(personal, index);
    upsert({
      id,
      walletId: id,
      publicId: displayPublicId(str(row.public_id ?? row.publicId), id),
      phone: contacts.phone,
      email: contacts.email,
      balanceTmtm: currency === 'USDT' ? num(row.tmtm_balance) : balance,
      balanceUsdt: currency === 'USDT' ? balance : num(row.usdt_balance),
      turnover: 0,
      ggr: 0,
      blocked: row.is_blocked === true || row.blocked === true || row.is_active === false,
      registeredAt: str(row.created_at ?? row.createdAt, new Date().toISOString()),
    });
  });

  profiles.forEach((row, index) => {
    const id = str(row.id ?? row.user_id ?? row.wallet_id);
    if (!id) return;
    const walletId = str(row.wallet_id ?? row.walletId) || (wallets.some((w) => str(w.id) === id) ? id : null);
    const contacts = personalForIndex(personal, index);
    const balance = num(row.balance ?? row.balance_tmtm);
    upsert({
      id,
      walletId: walletId || null,
      publicId: displayPublicId(str(row.public_id ?? row.publicId ?? row.player_id), id),
      phone: str(row.phone, contacts.phone),
      email: str(row.email, contacts.email),
      balanceTmtm: balance,
      balanceUsdt: num(row.usdt_balance ?? row.balance_usdt),
      turnover: 0,
      ggr: 0,
      blocked: row.is_blocked === true || row.blocked === true,
      registeredAt: str(row.created_at ?? row.createdAt ?? row.last_login_at, new Date().toISOString()),
    });
  });

  const list = [...byKey.values()];
  if (!list.length) {
    const fromOps = [...new Set(ops.map((row) => str(row.player_public_id)).filter((id) => /^\d+$/.test(id)))];
    const seeded = fallbackPlayers().map((player, index) => {
      const publicId = fromOps[index] || player.publicId;
      return { ...player, publicId };
    });
    return seeded.map(applyDemoOverlay);
  }

  return list.map((player) => {
    const sportRows = bets.filter((row) => matchesPlayer(row, player, primary));
    const gameRows = [
      ...games.filter((row) => matchesPlayer(row, player, primary)),
      ...casinoBets.filter((row) => matchesPlayer(row, player, primary)),
      ...wagers.filter((row) => matchesPlayer(row, player, primary)),
    ];
    const sportTurn = sportRows.reduce((sum, row) => sum + num(row.amount), 0);
    const sportPay = sportRows.reduce((sum, row) => sum + sportPayout(row), 0);
    const gameTurn = gameRows.reduce((sum, row) => sum + num(row.stake ?? row.amount ?? row.bet), 0);
    const gamePay = gameRows.reduce((sum, row) => sum + num(row.payout ?? row.win), 0);
    const turnover = sportTurn + gameTurn;
    const ggr = (sportTurn - sportPay) + (gameTurn - gamePay);
    const contacts = player.phone || player.email
      ? { phone: player.phone, email: player.email }
      : personalForIndex(personal, 0);
    return applyDemoOverlay({
      ...player,
      phone: player.phone || contacts.phone,
      email: player.email || contacts.email,
      turnover,
      ggr,
    });
  }).sort((a, b) => a.publicId.localeCompare(b.publicId, 'ru', { numeric: true }));
}

function cashierLabel(cashiers: Record<string, unknown>[], cashierId: string): string | null {
  const row = cashiers.find((item) => str(item.id) === cashierId);
  if (!row) return cashierId ? `Касса ${cashierId.slice(0, 8)}` : null;
  const name = str(row.full_name ?? row.fullName);
  const point = str(row.point_name ?? row.pointName);
  const login = str(row.login);
  return [name || login, point].filter(Boolean).join(' · ') || cashierId.slice(0, 8);
}

function txTitle(row: Record<string, unknown>): string {
  const type = str(row.type);
  if (row.title) return str(row.title);
  if (type === 'deposit') return 'Пополнение через Mobcash';
  if (type === 'payout' || type === 'withdraw') return 'Выплата через Mobcash';
  if (type === 'adjustment' || type === 'adjust') return 'Корректировка баланса';
  if (type === 'bet_placed') return 'Ставка';
  if (type === 'win') return 'Выигрыш';
  return type || 'Операция';
}

function buildDossier(player: PlayerListItem, bundle: RawBundle): PlayerDossier {
  const primary = primaryWalletId(bundle.wallets);
  const sports = bundle.bets
    .filter((row) => matchesPlayer(row, player, primary))
    .map(parseSportBet)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const games = [
    ...bundle.games,
    ...bundle.casinoBets,
    ...bundle.wagers.filter((row) => {
      const vertical = str(row.vertical);
      return vertical === 'games' || vertical === 'casino' || !vertical;
    }),
  ]
    .filter((row) => matchesPlayer(row, player, primary))
    .map((row, index) => parseGameRound(row, index))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const cashOps = bundle.ops
    .filter((row) => matchesPlayer(row, player, primary))
    .map((row) => {
      const type = str(row.type);
      const cashierId = str(row.cashier_id) || null;
      return {
        id: str(row.id),
        type,
        title: type === 'payout' ? 'Выплата через кассу Mobcash' : 'Пополнение через кассу Mobcash',
        amount: type === 'payout' ? -num(row.amount) : num(row.amount),
        status: str(row.status, 'completed'),
        cashierId,
        cashierLabel: cashierId ? cashierLabel(bundle.cashiers, cashierId) : null,
        receiptCode: str(row.receipt_code ?? row.receiptCode) || null,
        createdAt: str(row.created_at ?? row.createdAt),
      } satisfies PlayerCashTx;
    });

  const ledger = bundle.transactions
    .filter((row) => matchesPlayer(row, player, primary))
    .map((row) => ({
      id: str(row.id),
      type: str(row.type),
      title: txTitle(row),
      amount: num(row.amount),
      status: str(row.status, 'completed'),
      cashierId: str(row.cashier_id) || null,
      cashierLabel: str(row.cashier_id) ? cashierLabel(bundle.cashiers, str(row.cashier_id)) : null,
      receiptCode: str(row.receipt_code ?? row.bet_id) || null,
      createdAt: str(row.created_at ?? row.createdAt),
    } satisfies PlayerCashTx));

  const transactions = [...cashOps, ...ledger]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const deposits = cashOps
    .filter((row) => row.type === 'deposit' && row.status === 'completed')
    .reduce((sum, row) => sum + Math.abs(row.amount), 0)
    + ledger.filter((row) => ['deposit', 'topup'].includes(row.type) && row.amount > 0)
      .reduce((sum, row) => sum + row.amount, 0);

  const payouts = cashOps
    .filter((row) => (row.type === 'payout' || row.type === 'withdraw') && row.status === 'completed')
    .reduce((sum, row) => sum + Math.abs(row.amount), 0)
    + ledger.filter((row) => ['payout', 'withdraw'].includes(row.type) && row.amount < 0)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);

  const lastWallet = bundle.wallets.find((row) => str(row.id) === player.walletId);
  const lastLogin = str(
    lastWallet?.last_seen_at
      ?? lastWallet?.updated_at
      ?? bundle.profiles.find((row) => str(row.id) === player.id || str(row.wallet_id) === player.walletId)?.last_login_at
      ?? sports[0]?.createdAt
      ?? games[0]?.createdAt
      ?? transactions[0]?.createdAt
      ?? '',
  ) || null;

  return {
    player,
    summary: {
      deposits,
      payouts,
      profit: player.ggr,
      lastLoginAt: lastLogin,
    },
    games,
    sports,
    transactions,
  };
}

export async function fetchPlayers(_session: ManagerSession): Promise<PlayerListItem[]> {
  const bundle = await loadBundle();
  return buildPlayers(bundle);
}

export async function fetchPlayerDossier(
  _session: ManagerSession,
  playerId: string,
): Promise<PlayerDossier> {
  const bundle = await loadBundle();
  const players = buildPlayers(bundle);
  const player = players.find((row) => row.id === playerId || row.publicId === playerId || row.walletId === playerId);
  if (!player) throw new Error('Игрок не найден');
  return buildDossier(player, bundle);
}

export function playerMatchesQuery(player: PlayerListItem, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  return (
    player.publicId.toLowerCase().includes(q)
    || player.id.toLowerCase().includes(q)
    || player.phone.toLowerCase().replace(/\s/g, '').includes(q.replace(/\s/g, ''))
    || player.email.toLowerCase().includes(q)
  );
}

export async function setPlayerBlocked(
  session: ManagerSession,
  player: PlayerListItem,
  blocked: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('manager_set_player_blocked', {
    p_manager_id: session.id,
    p_player_id: player.walletId || player.id,
    p_blocked: blocked,
  });
  if (!error) {
    const demo = loadDemoStore();
    demo.blocked[player.id] = blocked;
    saveDemoStore(demo);
    return;
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const target = player.walletId || player.id;
  const walletUpdate = await supabase.from('wallets').update({ is_blocked: blocked }).eq('id', target);
  if (walletUpdate.error && !isMissingRelation(walletUpdate.error)) {
    throw new Error(walletUpdate.error.message);
  }
  const profileUpdate = await supabase.from('profiles').update({ is_blocked: blocked }).eq('id', player.id);
  if (profileUpdate.error && !isMissingRelation(profileUpdate.error) && !player.walletId) {
    await supabase.from('profiles').update({ is_blocked: blocked }).eq('wallet_id', target);
  }
  const demo = loadDemoStore();
  demo.blocked[player.id] = blocked;
  demo.blocked[player.publicId] = blocked;
  saveDemoStore(demo);
}

export async function adjustPlayerBalance(
  session: ManagerSession,
  player: PlayerListItem,
  amount: number,
  note: string,
): Promise<number> {
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Введите сумму корректировки');
  const { data, error } = await supabase.rpc('manager_adjust_player_balance', {
    p_manager_id: session.id,
    p_player_id: player.walletId || player.id,
    p_amount: amount,
    p_note: note.trim(),
  });
  if (!error) {
    const next = num(asRecord(data).balance ?? asRecord(data).balance_tmtm);
    const demo = loadDemoStore();
    demo.balances[player.id] = { tmtm: next || player.balanceTmtm + amount, usdt: player.balanceUsdt };
    saveDemoStore(demo);
    return demo.balances[player.id].tmtm;
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  const target = player.walletId || player.id;
  const next = Number((player.balanceTmtm + amount).toFixed(2));
  if (next < 0) throw new Error('Баланс не может быть отрицательным');

  if (player.walletId) {
    const { error: updError } = await supabase
      .from('wallets')
      .update({ balance: next, updated_at: new Date().toISOString() })
      .eq('id', player.walletId);
    if (updError && !isMissingRelation(updError)) throw new Error(updError.message);
  } else {
    const { error: updError } = await supabase.from('profiles').update({ balance: next }).eq('id', target);
    if (updError && !isMissingRelation(updError)) throw new Error(updError.message);
  }

  await supabase.from('transactions').insert({
    type: 'adjustment',
    title: note.trim() || 'Корректировка баланса (бэкофис)',
    amount,
    status: 'completed',
  });

  const demo = loadDemoStore();
  demo.balances[player.id] = { tmtm: next, usdt: player.balanceUsdt };
  demo.balances[player.publicId] = demo.balances[player.id];
  saveDemoStore(demo);
  return next;
}

export function formatPlayerMoney(value: number, currency: 'TMTM' | 'USDT'): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatPlayerBalance(player: PlayerListItem): string {
  return `${formatPlayerMoney(player.balanceTmtm, 'TMTM')} / ${formatPlayerMoney(player.balanceUsdt, 'USDT')}`;
}

export function sportStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (['won', 'win'].includes(value)) return 'Выигрыш';
  if (['lost', 'lose', 'loss'].includes(value)) return 'Проигрыш';
  if (['void', 'cancelled'].includes(value)) return 'Отмена';
  return 'В игре';
}

export function sportStatusClass(status: string): string {
  const value = status.toLowerCase();
  if (['won', 'win'].includes(value)) return 'bg-emerald-50 text-emerald-700';
  if (['lost', 'lose', 'loss'].includes(value)) return 'bg-red-50 text-red-600';
  if (['void', 'cancelled'].includes(value)) return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

export { formatBackofficeDateTime };
