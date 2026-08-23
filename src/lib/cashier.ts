import { supabase } from './supabase';

export interface CashierSession {
  id: string;
  login: string;
  fullName: string;
  city: string;
  pointName: string;
  floatBalance: number;
}

export interface CashierReceipt {
  ok: boolean;
  type: 'deposit' | 'payout';
  receiptCode: string;
  playerPublicId: string;
  amount: number;
  cashierName: string;
  city: string;
  pointName: string;
  floatBalance: number;
  createdAt: string;
}

export interface PayoutLookup {
  ok: boolean;
  id: string;
  playerPublicId: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface CashierOperation {
  id: string;
  type: 'deposit' | 'payout';
  playerPublicId: string;
  amount: number;
  status: 'completed' | 'failed';
  receiptCode: string;
  createdAt: string;
}

export interface PlayerCashPayout {
  id: string;
  playerPublicId: string;
  secretCode: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paidAt: string | null;
  createdAt: string;
}

const SESSION_KEY = 'mobcash-cashier-session';
const DEMO_STORE_KEY = 'mobcash-demo-store';
const DEMO_CASHIER_ID = '00000000-0000-0000-0000-00000000ca01';

const DEMO_CASHIER: CashierSession = {
  id: DEMO_CASHIER_ID,
  login: 'agent01',
  fullName: 'Азат Мередов',
  city: 'Ашхабад',
  pointName: 'Точка №12 · ул. Махтумкули',
  floatBalance: 5000,
};

interface DemoStore {
  floatBalance: number;
  operations: CashierOperation[];
  payouts: Array<{
    id: string;
    playerPublicId: string;
    secretCode: string;
    amount: number;
    status: 'pending' | 'paid';
    createdAt: string;
  }>;
  playerPayouts: PlayerCashPayout[];
  receiptSeq: number;
}

function emptyDemoStore(): DemoStore {
  return {
    floatBalance: 5000,
    operations: [],
    payouts: [
      {
        id: 'demo-payout-847291',
        playerPublicId: '882341',
        secretCode: '847291',
        amount: 150,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ],
    playerPayouts: [],
    receiptSeq: 1,
  };
}

function loadDemoStore(): DemoStore {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return emptyDemoStore();
    const parsed = JSON.parse(raw) as DemoStore;
    return {
      ...emptyDemoStore(),
      ...parsed,
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      payouts: Array.isArray(parsed.payouts) ? parsed.payouts : emptyDemoStore().payouts,
      playerPayouts: Array.isArray(parsed.playerPayouts) ? parsed.playerPayouts : [],
    };
  } catch {
    return emptyDemoStore();
  }
}

function saveDemoStore(store: DemoStore) {
  localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(store));
}

function nextReceipt(store: DemoStore): string {
  const seq = store.receiptSeq++;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `MC-${day}-${String(seq).padStart(5, '0')}`;
}

function isMissingRpc(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = error?.message ?? '';
  return error?.code === 'PGRST202' || /could not find the function/i.test(msg) || /schema cache/i.test(msg);
}

function demoReceipt(
  type: 'deposit' | 'payout',
  playerId: string,
  amount: number,
  floatBalance: number,
  receiptCode: string,
): CashierReceipt {
  return {
    ok: true,
    type,
    receiptCode,
    playerPublicId: playerId,
    amount,
    cashierName: DEMO_CASHIER.fullName,
    city: DEMO_CASHIER.city,
    pointName: DEMO_CASHIER.pointName,
    floatBalance,
    createdAt: new Date().toISOString(),
  };
}

async function creditPlayerWallet(playerId: string, amount: number): Promise<boolean> {
  const byPublicId = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('public_id', playerId)
    .maybeSingle();
  if (!byPublicId.error && byPublicId.data?.id) {
    const next = Number(byPublicId.data.balance ?? 0) + amount;
    const { error: updateError } = await supabase.from('wallets').update({ balance: next }).eq('id', byPublicId.data.id);
    return !updateError;
  }

  if (playerId === '645912') {
    const first = await supabase.from('wallets').select('id, balance').limit(1).maybeSingle();
    if (first.data?.id) {
      const next = Number(first.data.balance ?? 0) + amount;
      const { error: updateError } = await supabase.from('wallets').update({ balance: next }).eq('id', first.data.id);
      return !updateError;
    }
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
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

function rpcMessage(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? 'Ошибка кассы';
  return raw
    .replace(/^.*ERROR:\s*/i, '')
    .replace(/\s+Where:[\s\S]*$/i, '')
    .trim() || 'Ошибка кассы';
}

function parseSession(raw: Record<string, unknown>): CashierSession {
  return {
    id: str(raw.id),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    city: str(raw.city),
    pointName: str(raw.point_name ?? raw.pointName),
    floatBalance: num(raw.float_balance ?? raw.floatBalance),
  };
}

function parseReceipt(raw: Record<string, unknown>): CashierReceipt {
  const type = str(raw.type) === 'payout' ? 'payout' : 'deposit';
  return {
    ok: true,
    type,
    receiptCode: str(raw.receipt_code ?? raw.receiptCode),
    playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
    amount: num(raw.amount),
    cashierName: str(raw.cashier_name ?? raw.cashierName),
    city: str(raw.city),
    pointName: str(raw.point_name ?? raw.pointName),
    floatBalance: num(raw.float_balance ?? raw.floatBalance),
    createdAt: str(raw.created_at ?? raw.createdAt, new Date().toISOString()),
  };
}

export function loadCashierSession(): CashierSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = parseSession(asRecord(JSON.parse(raw)));
    return parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCashierSession(session: CashierSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    id: session.id,
    login: session.login,
    full_name: session.fullName,
    city: session.city,
    point_name: session.pointName,
    float_balance: session.floatBalance,
  }));
}

export function clearCashierSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function cashierLogin(login: string, pin: string): Promise<CashierSession> {
  const { data, error } = await supabase.rpc('cashier_login', {
    p_login: login.trim(),
    p_pin: pin,
  });
  if (error && isMissingRpc(error)) {
    if (login.trim().toLowerCase() !== DEMO_CASHIER.login || pin !== '1234') {
      throw new Error('Неверный логин или PIN-код');
    }
    const store = loadDemoStore();
    const session = { ...DEMO_CASHIER, floatBalance: store.floatBalance };
    saveCashierSession(session);
    return session;
  }
  if (error) throw new Error(rpcMessage(error));
  const session = parseSession(asRecord(data));
  if (!session.id) throw new Error('Не удалось войти');
  saveCashierSession(session);
  return session;
}

export async function cashierRefresh(cashierId: string): Promise<CashierSession> {
  if (cashierId === DEMO_CASHIER_ID) {
    const store = loadDemoStore();
    const session = { ...DEMO_CASHIER, floatBalance: store.floatBalance };
    saveCashierSession(session);
    return session;
  }
  const { data, error } = await supabase.rpc('cashier_get_session', {
    p_cashier_id: cashierId,
  });
  if (error && isMissingRpc(error)) {
    const store = loadDemoStore();
    const session = { ...DEMO_CASHIER, floatBalance: store.floatBalance };
    saveCashierSession(session);
    return session;
  }
  if (error) throw new Error(rpcMessage(error));
  const session = parseSession(asRecord(data));
  saveCashierSession(session);
  return session;
}

export async function cashierDepositToPlayer(params: {
  cashierId: string;
  playerId: string;
  amount: number;
}): Promise<CashierReceipt> {
  const { data, error } = await supabase.rpc('cashier_deposit_to_player', {
    p_cashier_id: params.cashierId,
    p_player_id: params.playerId,
    p_amount: params.amount,
  });
  if (error && isMissingRpc(error)) {
    if (!/^\d{6}$/.test(params.playerId)) throw new Error('Введите 6-значный ID игрока');
    if (!(params.amount > 0)) throw new Error('Введите сумму пополнения');
    const store = loadDemoStore();
    if (store.floatBalance < params.amount) throw new Error('Недостаточно средств в кассе');
    store.floatBalance = Number((store.floatBalance - params.amount).toFixed(2));
    const receiptCode = nextReceipt(store);
    const credited = await creditPlayerWallet(params.playerId, params.amount);
    if (!credited && params.playerId !== '645912' && params.playerId !== '882341') {
      throw new Error('Игрок с таким ID не найден');
    }
    store.operations.unshift({
      id: crypto.randomUUID(),
      type: 'deposit',
      playerPublicId: params.playerId,
      amount: params.amount,
      status: 'completed',
      receiptCode,
      createdAt: new Date().toISOString(),
    });
    saveDemoStore(store);
    const receipt = demoReceipt('deposit', params.playerId, params.amount, store.floatBalance, receiptCode);
    saveCashierSession({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
    return receipt;
  }
  if (error) throw new Error(rpcMessage(error));
  return parseReceipt(asRecord(data));
}

async function findMobcashOrder(code: string): Promise<PayoutLookup | null> {
  const byCode = await supabase
    .from('mobcash_orders')
    .select('id, player_public_id, amount, status, created_at, cash_code')
    .eq('cash_code', code)
    .eq('type', 'withdraw')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byCode.error || !byCode.data) return null;
  return {
    ok: true,
    id: str(byCode.data.id),
    playerPublicId: str(byCode.data.player_public_id),
    amount: num(byCode.data.amount),
    status: str(byCode.data.status),
    createdAt: str(byCode.data.created_at, new Date().toISOString()),
  };
}

export async function cashierLookupPayoutCode(code: string): Promise<PayoutLookup> {
  const { data, error } = await supabase.rpc('cashier_lookup_payout_code', {
    p_code: code,
  });
  if (error && isMissingRpc(error)) {
    if (!/^\d{6}$/.test(code)) throw new Error('Введите 6-значный PIN-код заявки');
    const fromTable = await findMobcashOrder(code);
    if (fromTable) {
      if (fromTable.status !== 'pending') throw new Error('Заявка уже закрыта');
      return fromTable;
    }
    const store = loadDemoStore();
    const req = [...store.payouts, ...store.playerPayouts.map((item) => ({
      id: item.id,
      playerPublicId: item.playerPublicId,
      secretCode: item.secretCode,
      amount: item.amount,
      status: item.status === 'paid' ? 'paid' as const : 'pending' as const,
      createdAt: item.createdAt,
    }))].find((item) => item.secretCode === code);
    if (!req) throw new Error('Код не найден');
    if (req.status !== 'pending') throw new Error('Заявка уже закрыта');
    return {
      ok: true,
      id: req.id,
      playerPublicId: req.playerPublicId,
      amount: req.amount,
      status: req.status,
      createdAt: req.createdAt,
    };
  }
  if (error) throw new Error(rpcMessage(error));
  const raw = asRecord(data);
  return {
    ok: true,
    id: str(raw.id),
    playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
    amount: num(raw.amount),
    status: str(raw.status),
    createdAt: str(raw.created_at ?? raw.createdAt),
  };
}

export async function cashierPayoutByCode(params: {
  cashierId: string;
  code: string;
}): Promise<CashierReceipt> {
  const { data, error } = await supabase.rpc('cashier_payout_by_code', {
    p_cashier_id: params.cashierId,
    p_code: params.code,
  });
  if (error && isMissingRpc(error)) {
    const lookup = await cashierLookupPayoutCode(params.code);
    await supabase
      .from('mobcash_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('cash_code', params.code)
      .eq('status', 'pending');
    const store = loadDemoStore();
    const markPaid = (list: { secretCode: string; status: string }[]) => {
      const item = list.find((row) => row.secretCode === params.code && row.status === 'pending');
      if (item) item.status = 'paid';
    };
    markPaid(store.payouts);
    markPaid(store.playerPayouts);
    store.floatBalance = Number((store.floatBalance + lookup.amount).toFixed(2));
    const receiptCode = nextReceipt(store);
    store.operations.unshift({
      id: crypto.randomUUID(),
      type: 'payout',
      playerPublicId: lookup.playerPublicId,
      amount: lookup.amount,
      status: 'completed',
      receiptCode,
      createdAt: new Date().toISOString(),
    });
    saveDemoStore(store);
    saveCashierSession({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
    return demoReceipt('payout', lookup.playerPublicId, lookup.amount, store.floatBalance, receiptCode);
  }
  if (error) throw new Error(rpcMessage(error));
  return parseReceipt(asRecord(data));
}

export async function cashierShiftHistory(params: {
  cashierId: string;
  type?: 'deposit' | 'payout' | '';
  status?: 'completed' | 'failed' | '';
}): Promise<CashierOperation[]> {
  const { data, error } = await supabase.rpc('cashier_shift_history', {
    p_cashier_id: params.cashierId,
    p_type: params.type || null,
    p_status: params.status || null,
  });
  if (error && isMissingRpc(error)) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return loadDemoStore().operations.filter((row) => {
      if (new Date(row.createdAt).getTime() < start.getTime()) return false;
      if (params.type && row.type !== params.type) return false;
      if (params.status && row.status !== params.status) return false;
      return true;
    });
  }
  if (error) throw new Error(rpcMessage(error));
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const raw = asRecord(row);
    return {
      id: str(raw.id),
      type: str(raw.type) === 'payout' ? 'payout' : 'deposit',
      playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
      amount: num(raw.amount),
      status: str(raw.status) === 'failed' ? 'failed' : 'completed',
      receiptCode: str(raw.receipt_code ?? raw.receiptCode),
      createdAt: str(raw.created_at ?? raw.createdAt),
    };
  });
}

function randomCashCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

async function insertMobcashOrder(params: {
  walletId?: string;
  playerPublicId: string;
  cashCode: string;
  amount: number;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('mobcash_orders')
    .insert({
      wallet_id: params.walletId ?? null,
      player_public_id: params.playerPublicId,
      type: 'withdraw',
      status: 'pending',
      cash_code: params.cashCode,
      amount: params.amount,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (!/duplicate|unique/i.test(error.message)) {
      console.error('Failed to insert mobcash_orders:', error.message);
    }
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function playerCreateCashPayout(amount: number): Promise<{
  code: string;
  amount: number;
  playerPublicId: string;
  newBalance: number;
}> {
  const { data, error } = await supabase.rpc('player_create_cash_payout', {
    p_amount: amount,
  });
  if (!error) {
    const raw = asRecord(data);
    const code = str(raw.cash_code ?? raw.code);
    const paidAmount = num(raw.amount);
    const publicId = str(raw.player_public_id ?? raw.playerPublicId);
    const wallet = await supabase.from('wallets').select('id').limit(1).maybeSingle();
    if (wallet.data?.id && code) {
      await insertMobcashOrder({
        walletId: String(wallet.data.id),
        playerPublicId: publicId,
        cashCode: code,
        amount: paidAmount,
      });
    }
    return {
      code,
      amount: paidAmount,
      playerPublicId: publicId,
      newBalance: num(raw.new_balance ?? raw.newBalance),
    };
  }
  if (!isMissingRpc(error)) throw new Error(rpcMessage(error));

  if (!(amount > 0)) throw new Error('Введите сумму вывода');
  const primary = await supabase.from('wallets').select('id, balance, public_id').limit(1).maybeSingle();
  const wallet = primary.error
    ? await supabase.from('wallets').select('id, balance').limit(1).maybeSingle()
    : primary;
  const current = Number(wallet.data?.balance ?? 0);
  if (!wallet.data?.id) throw new Error('Кошелёк не найден');
  if (current < amount) throw new Error('Недостаточно средств на балансе');
  const code = randomCashCode();
  const publicId = str((wallet.data as { public_id?: string } | null)?.public_id, '645912');
  const { error: walletError } = await supabase
    .from('wallets')
    .update({ balance: Number((current - amount).toFixed(2)), updated_at: new Date().toISOString() })
    .eq('id', wallet.data.id);
  if (walletError) throw new Error('Не удалось списать баланс');

  const orderId = await insertMobcashOrder({
    walletId: String(wallet.data.id),
    playerPublicId: publicId,
    cashCode: code,
    amount,
  });
  await supabase.from('cashier_payout_requests').insert({
    wallet_id: wallet.data.id,
    player_public_id: publicId,
    secret_code: code,
    amount,
    status: 'pending',
  });
  await supabase.from('transactions').insert({
    type: 'withdraw',
    title: 'Вывод наличными у агента Mobcash',
    amount: -amount,
    status: 'completed',
  });

  const store = loadDemoStore();
  const payout: PlayerCashPayout = {
    id: orderId ?? crypto.randomUUID(),
    playerPublicId: publicId,
    secretCode: code,
    amount,
    status: 'pending',
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  store.playerPayouts.unshift(payout);
  saveDemoStore(store);
  return { code, amount, playerPublicId: publicId, newBalance: Number((current - amount).toFixed(2)) };
}

export async function playerListCashPayouts(): Promise<PlayerCashPayout[]> {
  const { data, error } = await supabase.rpc('player_list_cash_payouts');
  if (error && isMissingRpc(error)) {
    const fromTable = await supabase
      .from('mobcash_orders')
      .select('id, player_public_id, cash_code, amount, status, paid_at, created_at')
      .eq('type', 'withdraw')
      .order('created_at', { ascending: false });
    if (!fromTable.error && fromTable.data?.length) {
      return fromTable.data.map((row) => {
        const raw = asRecord(row);
        const status = str(raw.status);
        return {
          id: str(raw.id),
          playerPublicId: str(raw.player_public_id),
          secretCode: str(raw.cash_code),
          amount: num(raw.amount),
          status: status === 'paid' || status === 'cancelled' ? status : 'pending',
          paidAt: raw.paid_at == null ? null : str(raw.paid_at),
          createdAt: str(raw.created_at),
        };
      });
    }
    return loadDemoStore().playerPayouts;
  }
  if (error) {
    console.error('Failed to load cash payouts:', error.message);
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const raw = asRecord(row);
    const status = str(raw.status);
    return {
      id: str(raw.id),
      playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
      secretCode: str(raw.secret_code ?? raw.secretCode ?? raw.cash_code ?? raw.cashCode),
      amount: num(raw.amount),
      status: status === 'paid' || status === 'cancelled' ? status : 'pending',
      paidAt: raw.paid_at == null && raw.paidAt == null ? null : str(raw.paid_at ?? raw.paidAt),
      createdAt: str(raw.created_at ?? raw.createdAt),
    };
  });
}

export function formatTmtm(value: number): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TMTM`;
}

export function formatCashierDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}, ${hh}:${min}`;
}

export function isAgentTerminalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'agent' || host.startsWith('agent.')) return true;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/agent') return true;
  return window.location.hash.replace(/^#/, '') === '/agent';
}
