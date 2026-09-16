import { displayPlayerCurrency } from './playerCurrency';

export interface PlayerWalletRow {
  walletId: string;
  currency: string;
  availableBalance: number;
  lockedBalance: number;
  isActive: boolean;
  displayNameRu: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return asRecord(await res.json().catch(() => ({})));
}

function walletFromBody(raw: Record<string, unknown>): PlayerWalletRow {
  return {
    walletId: String(raw.walletId ?? raw.wallet_id ?? ''),
    currency: displayPlayerCurrency(String(raw.currency ?? '')),
    availableBalance: Number(raw.availableBalance ?? raw.available_balance ?? 0),
    lockedBalance: Number(raw.lockedBalance ?? raw.locked_balance ?? 0),
    isActive: raw.isActive === true || raw.is_active === true,
    displayNameRu: String(raw.displayNameRu ?? raw.display_name_ru ?? ''),
  };
}

export async function fetchPlayerWallets(): Promise<PlayerWalletRow[]> {
  const res = await fetch('/api/player/wallets', { credentials: 'same-origin' });
  const body = await readJson(res);
  if (!res.ok || body.ok !== true) throw new Error(String(body.error ?? 'WALLET_UNAVAILABLE'));
  const rows = Array.isArray(body.wallets) ? body.wallets : [];
  return rows.map((row) => walletFromBody(asRecord(row)));
}

export async function addPlayerWallet(currency: string): Promise<PlayerWalletRow> {
  const res = await fetch('/api/player/wallets/add', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency }),
  });
  const body = await readJson(res);
  if (!res.ok || body.ok !== true) throw new Error(String(body.error ?? 'WALLET_UNAVAILABLE'));
  return walletFromBody(body);
}

export async function setActivePlayerWallet(currency: string): Promise<PlayerWalletRow> {
  const res = await fetch('/api/player/wallets/active', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currency }),
  });
  const body = await readJson(res);
  if (!res.ok || body.ok !== true) throw new Error(String(body.error ?? 'WALLET_UNAVAILABLE'));
  return walletFromBody(body);
}

export async function fetchUsdtQuoteTargets(): Promise<Array<{
  walletId: string;
  currency: string;
  rate: number;
  enabled: boolean;
}>> {
  const res = await fetch('/api/player/crypto/usdt-targets', { credentials: 'same-origin' });
  const body = await readJson(res);
  if (!res.ok || body.ok !== true) throw new Error(String(body.error ?? 'USDT_RATE_UNAVAILABLE'));
  const rows = Array.isArray(body.targets) ? body.targets : [];
  return rows.map((row) => {
    const rec = asRecord(row);
    return {
      walletId: String(rec.walletId ?? rec.wallet_id ?? ''),
      currency: displayPlayerCurrency(String(rec.currency ?? '')),
      rate: Number(rec.rate ?? 0),
      enabled: rec.enabled === true,
    };
  });
}

export async function createUsdtQuote(sourceAmount: string, walletId: string): Promise<Record<string, unknown>> {
  const res = await fetch('/api/player/crypto/usdt-quote', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceAmount, walletId }),
  });
  const body = await readJson(res);
  if (!res.ok || body.ok !== true) throw new Error(String(body.error ?? 'USDT_RATE_UNAVAILABLE'));
  return body;
}
