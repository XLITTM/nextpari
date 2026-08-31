import { supabase } from './supabase';
import {
  creditPlayerBalanceLocal,
  notifyWalletSync,
  persistLocalBalance,
} from './playerProfile';
import { assertCashierOperational, getCashierAccess, syncCashierFloatFromPos } from './backoffice';

export interface CashierSession {
  id: string;
  login: string;
  fullName: string;
  city: string;
  pointName: string;
  floatBalance: number;
  isActive: boolean;
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
  city?: string;
  point?: string;
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
  city?: string;
  point?: string;
}

export interface CashPayoutMeta {
  city: string;
  point: string;
  playerPublicId?: string;
  amount?: number;
}

const SESSION_KEY = 'mobcash-cashier-session';
const DEMO_STORE_KEY = 'mobcash-demo-store';
const PAYOUT_META_KEY = 'mobcash-payout-meta.v1';
const DEMO_CASHIER_ID = '00000000-0000-0000-0000-00000000ca01';

const DEMO_CASHIER: CashierSession = {
  id: DEMO_CASHIER_ID,
  login: 'agent01',
  fullName: 'Азат Мередов',
  city: 'Ашхабад',
  pointName: 'Точка №12 · ул. Махтумкули',
  floatBalance: 5000,
  isActive: true,
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
    city?: string;
    point?: string;
  }>;
  playerPayouts: PlayerCashPayout[];
  receiptSeq: number;
}

function loadPayoutMeta(): Record<string, CashPayoutMeta> {
  try {
    const raw = localStorage.getItem(PAYOUT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CashPayoutMeta>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePayoutMeta(map: Record<string, CashPayoutMeta>) {
  localStorage.setItem(PAYOUT_META_KEY, JSON.stringify(map));
}

export function rememberPayoutMeta(code: string, meta: CashPayoutMeta) {
  if (!/^\d{6}$/.test(code)) return;
  const map = loadPayoutMeta();
  map[code] = meta;
  savePayoutMeta(map);
}

export function getPayoutMeta(code: string): CashPayoutMeta | null {
  return loadPayoutMeta()[code] ?? null;
}

function withPickupMeta<T extends { city?: string; point?: string }>(
  code: string,
  row: T,
): T & { city?: string; point?: string } {
  const meta = getPayoutMeta(code);
  return {
    ...row,
    city: row.city || meta?.city,
    point: row.point || meta?.point,
  };
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

function isValidPlayerId(playerId: string): boolean {
  return /^\d{5,6}$/.test(playerId);
}

/** Credits any 5–6 digit player ID: Supabase wallet when possible + localStorage bridge. */
async function creditPlayerWallet(playerId: string, amount: number): Promise<number> {
  let nextBalance = creditPlayerBalanceLocal(amount);

  const byPublicId = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('public_id', playerId)
    .maybeSingle();

  if (!byPublicId.error && byPublicId.data?.id) {
    const next = Number((Number(byPublicId.data.balance ?? 0) + amount).toFixed(2));
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: next, updated_at: new Date().toISOString() })
      .eq('id', byPublicId.data.id);
    if (!updateError) {
      nextBalance = next;
      persistLocalBalance(next);
      return nextBalance;
    }
  }

  // Fallback: credit the primary wallet (demo / single-tenant) and attach public_id when empty.
  const first = await supabase.from('wallets').select('id, balance, public_id').limit(1).maybeSingle();
  if (!first.error && first.data?.id) {
    const next = Number((Number(first.data.balance ?? 0) + amount).toFixed(2));
    const patch: Record<string, unknown> = {
      balance: next,
      updated_at: new Date().toISOString(),
    };
    if (!first.data.public_id) patch.public_id = playerId;
    const { error: updateError } = await supabase.from('wallets').update(patch).eq('id', first.data.id);
    if (!updateError) {
      nextBalance = next;
      persistLocalBalance(next);
      return nextBalance;
    }
  }

  persistLocalBalance(nextBalance);
  return nextBalance;
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

function withNetworkState(session: CashierSession): CashierSession {
  const access = getCashierAccess(session.id);
  const byLogin = access.found ? access : getCashierAccess(session.login);
  if (!byLogin.found) return { ...session, isActive: session.isActive !== false };
  return {
    ...session,
    floatBalance: byLogin.floatBalance,
    isActive: byLogin.isActive,
  };
}

function parseSession(raw: Record<string, unknown>): CashierSession {
  return withNetworkState({
    id: str(raw.id),
    login: str(raw.login),
    fullName: str(raw.full_name ?? raw.fullName),
    city: str(raw.city),
    pointName: str(raw.point_name ?? raw.pointName),
    floatBalance: num(raw.float_balance ?? raw.floatBalance),
    isActive: raw.is_active !== false && raw.isActive !== false,
  });
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
    is_active: session.isActive !== false,
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
    const session = withNetworkState({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
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
    const session = withNetworkState({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
    saveCashierSession(session);
    return session;
  }
  const { data, error } = await supabase.rpc('cashier_get_session', {
    p_cashier_id: cashierId,
  });
  if (error && isMissingRpc(error)) {
    const store = loadDemoStore();
    const session = withNetworkState({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
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
    assertCashierOperational(params.cashierId);
    if (!isValidPlayerId(params.playerId)) throw new Error('Неверный ID');
    if (!(params.amount > 0)) throw new Error('Введите сумму пополнения');
    const store = loadDemoStore();
    if (store.floatBalance < params.amount) throw new Error('Недостаточно средств в кассе');
    store.floatBalance = Number((store.floatBalance - params.amount).toFixed(2));
    const receiptCode = nextReceipt(store);
    await creditPlayerWallet(params.playerId, params.amount);
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
    notifyWalletSync();
    syncCashierFloatFromPos(params.cashierId, store.floatBalance);
    const receipt = demoReceipt('deposit', params.playerId, params.amount, store.floatBalance, receiptCode);
    saveCashierSession({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
    return receipt;
  }
  if (error) throw new Error(rpcMessage(error));
  // RPC already credited the remote wallet — mirror the delta into localStorage for the player UI.
  creditPlayerBalanceLocal(params.amount);
  notifyWalletSync();
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
  return withPickupMeta(code, {
    ok: true,
    id: str(byCode.data.id),
    playerPublicId: str(byCode.data.player_public_id),
    amount: num(byCode.data.amount),
    status: str(byCode.data.status),
    createdAt: str(byCode.data.created_at, new Date().toISOString()),
  });
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
      city: item.city,
      point: item.point,
    }))].find((item) => item.secretCode === code);
    if (!req) throw new Error('Код не найден');
    if (req.status !== 'pending') throw new Error('Заявка уже закрыта');
    return withPickupMeta(code, {
      ok: true,
      id: req.id,
      playerPublicId: req.playerPublicId,
      amount: req.amount,
      status: req.status,
      createdAt: req.createdAt,
      city: req.city,
      point: req.point,
    });
  }
  if (error) throw new Error(rpcMessage(error));
  const raw = asRecord(data);
  return withPickupMeta(code, {
    ok: true,
    id: str(raw.id),
    playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
    amount: num(raw.amount),
    status: str(raw.status),
    createdAt: str(raw.created_at ?? raw.createdAt),
  });
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
    assertCashierOperational(params.cashierId);
    const lookup = await cashierLookupPayoutCode(params.code);
    if (lookup.status !== 'pending') throw new Error('Заявка уже закрыта');
    const store = loadDemoStore();
    if (store.floatBalance < lookup.amount) {
      throw new Error('Недостаточно средств в кассе для выдачи');
    }
    await supabase
      .from('mobcash_orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('cash_code', params.code)
      .eq('status', 'pending');
    await supabase
      .from('cashier_payout_requests')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('secret_code', params.code)
      .eq('status', 'pending');
    const markPaid = (list: { secretCode: string; status: string }[]) => {
      const item = list.find((row) => row.secretCode === params.code && row.status === 'pending');
      if (item) item.status = 'paid';
    };
    markPaid(store.payouts);
    markPaid(store.playerPayouts);
    store.floatBalance = Number((store.floatBalance - lookup.amount).toFixed(2));
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
    syncCashierFloatFromPos(params.cashierId, store.floatBalance);
    saveCashierSession({ ...DEMO_CASHIER, floatBalance: store.floatBalance });
    const { markWithdrawalPaidByPin } = await import('./withdrawalRequests');
    markWithdrawalPaidByPin(params.code);
    return demoReceipt('payout', lookup.playerPublicId, lookup.amount, store.floatBalance, receiptCode);
  }
  if (error) throw new Error(rpcMessage(error));
  const receipt = parseReceipt(asRecord(data));
  const { markWithdrawalPaidByPin } = await import('./withdrawalRequests');
  markWithdrawalPaidByPin(params.code);
  return receipt;
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
  return Math.floor(100000 + Math.random() * 900000).toString();
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

export async function playerCreateCashPayout(
  amount: number,
  pickup?: { city: string; point: string; pinCode?: string },
): Promise<{
  code: string;
  amount: number;
  playerPublicId: string;
  newBalance: number;
  city?: string;
  point?: string;
}> {
  const attachMeta = (code: string, publicId: string, paidAmount: number) => {
    if (!pickup?.city || !pickup?.point) return;
    rememberPayoutMeta(code, {
      city: pickup.city,
      point: pickup.point,
      playerPublicId: publicId,
      amount: paidAmount,
    });
  };

  const preferredPin =
    pickup?.pinCode && /^\d{6}$/.test(pickup.pinCode) ? pickup.pinCode : null;

  // Without a fixed PIN, prefer the RPC so the server allocates a unique cash_code.
  if (!preferredPin) {
    const { data, error } = await supabase.rpc('player_create_cash_payout', {
      p_amount: amount,
    });
    if (!error && data) {
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
      attachMeta(code, publicId, paidAmount);
      const store = loadDemoStore();
      store.playerPayouts.unshift({
        id: str(raw.id, crypto.randomUUID()),
        playerPublicId: publicId,
        secretCode: code,
        amount: paidAmount,
        status: 'pending',
        paidAt: null,
        createdAt: new Date().toISOString(),
        city: pickup?.city,
        point: pickup?.point,
      });
      saveDemoStore(store);
      notifyWalletSync();
      return {
        code,
        amount: paidAmount,
        playerPublicId: publicId,
        newBalance: num(raw.new_balance ?? raw.newBalance),
        city: pickup?.city,
        point: pickup?.point,
      };
    }
    if (error && !isMissingRpc(error)) throw new Error(rpcMessage(error));
  }

  if (!(amount > 0)) throw new Error('Введите сумму вывода');
  const primary = await supabase.from('wallets').select('id, balance, public_id').limit(1).maybeSingle();
  const wallet = primary.error
    ? await supabase.from('wallets').select('id, balance').limit(1).maybeSingle()
    : primary;
  const current = Number(wallet.data?.balance ?? 0);
  const publicId = str((wallet.data as { public_id?: string } | null)?.public_id, '645912');
  if (wallet.data?.id && current < amount) throw new Error('Недостаточно средств на балансе');
  if (!wallet.data?.id && amount <= 0) throw new Error('Кошелёк не найден');
  const code = preferredPin ?? randomCashCode();
  const newBalance = Number((Math.max(0, current - amount)).toFixed(2));
  if (wallet.data?.id) {
    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', wallet.data.id);
    if (walletError) {
      console.error('Wallet update failed, using local Mobcash order:', walletError.message);
    }
    await insertMobcashOrder({
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
      title: pickup
        ? `Вывод наличными Mobcash · ${pickup.city} · ${pickup.point}`
        : 'Вывод наличными у агента Mobcash',
      amount: -amount,
      status: 'completed',
    });
  }

  attachMeta(code, publicId, amount);
  const store = loadDemoStore();
  const payout: PlayerCashPayout = {
    id: crypto.randomUUID(),
    playerPublicId: publicId,
    secretCode: code,
    amount,
    status: 'pending',
    paidAt: null,
    createdAt: new Date().toISOString(),
    city: pickup?.city,
    point: pickup?.point,
  };
  store.playerPayouts.unshift(payout);
  saveDemoStore(store);
  notifyWalletSync();
  return {
    code,
    amount,
    playerPublicId: publicId,
    newBalance,
    city: pickup?.city,
    point: pickup?.point,
  };
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
        const secretCode = str(raw.cash_code);
        return withPickupMeta(secretCode, {
          id: str(raw.id),
          playerPublicId: str(raw.player_public_id),
          secretCode,
          amount: num(raw.amount),
          status: (status === 'paid' || status === 'cancelled' ? status : 'pending') as PlayerCashPayout['status'],
          paidAt: raw.paid_at == null ? null : str(raw.paid_at),
          createdAt: str(raw.created_at),
        });
      });
    }
    return loadDemoStore().playerPayouts.map((row) => withPickupMeta(row.secretCode, row));
  }
  if (error) {
    console.error('Failed to load cash payouts:', error.message);
    return loadDemoStore().playerPayouts.map((row) => withPickupMeta(row.secretCode, row));
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const raw = asRecord(row);
    const status = str(raw.status);
    const secretCode = str(raw.secret_code ?? raw.secretCode ?? raw.cash_code ?? raw.cashCode);
    return withPickupMeta(secretCode, {
      id: str(raw.id),
      playerPublicId: str(raw.player_public_id ?? raw.playerPublicId),
      secretCode,
      amount: num(raw.amount),
      status: (status === 'paid' || status === 'cancelled' ? status : 'pending') as PlayerCashPayout['status'],
      paidAt: raw.paid_at == null && raw.paidAt == null ? null : str(raw.paid_at ?? raw.paidAt),
      createdAt: str(raw.created_at ?? raw.createdAt),
    });
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

export { isAgentTerminalPath } from '../cashier/isAgentPath';
