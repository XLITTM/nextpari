import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const callbackIp = '85.122.129.59';
export const testBranch = 'work/casino-demo-softaggregator-w001';
const maxBalance = 1_000_000_000;
export type WalletReply = { error: 0 | 1 | 2; balance: number };
export const walletError: WalletReply = { error: 2, balance: 0 };

type WalletCall = {
  username: string;
  currency: string;
  action: 'balance' | 'debit' | 'credit';
  callHash: string;
  fingerprint: string;
  amount: number;
  rollback: boolean;
  timestampMs: number;
};

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function matchesHex(actual: string | undefined, expected: Buffer) {
  return Boolean(actual && actual.length === expected.length * 2 &&
    /^[a-f0-9]+$/i.test(actual) && timingSafeEqual(Buffer.from(actual, 'hex'), expected));
}

export function isTestIdentity(username: string, currency: string) {
  return /^np_test_[a-f0-9]{24}$/.test(username) && /^[A-Z]{3}$/.test(currency) && currency !== 'TMT';
}

export async function handleTestWalletCallback(
  request: { method?: string; url?: string; signature?: string; sourceIp?: string },
  config: { salt: string; username: string; currency: string; writesApproved: boolean },
  apply: (call: WalletCall) => Promise<WalletReply>,
  now = Date.now,
): Promise<WalletReply> {
  if (request.method !== 'GET' || request.sourceIp !== callbackIp || !request.url ||
      request.url.length > 8192 || !config.salt || !isTestIdentity(config.username, config.currency)) return walletError;

  try {
    const fields = new Map<string, string>();
    for (const [name, value] of new URL(request.url, 'https://callback.invalid').searchParams) {
      // The provider's decoded name=value format cannot disambiguate a literal ampersand.
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(name) || fields.has(name) ||
          /[&\x00-\x1f\ufffd]/.test(value)) return walletError;
      fields.set(name, value);
    }

    const timestamp = fields.get('timestamp') ?? '';
    if (!/^\d{10}(\d{3})?$/.test(timestamp)) return walletError;
    const timestampMs = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
    if (Math.abs(now() - timestampMs) > 30_000) return walletError;
    if (!matchesHex(fields.get('key'), createHash('md5').update(timestamp + config.salt).digest())) return walletError;
    const signed = [...fields.keys()].sort().map((name) => name + '=' + fields.get(name)).join('&');
    if (!matchesHex(request.signature, createHmac('sha256', config.salt).update(signed).digest())) return walletError;

    const username = fields.get('username');
    const currency = fields.get('currency');
    const action = fields.get('action');
    const callId = fields.get('call_id') ?? '';
    const amountText = fields.get('amount') ?? '';
    const rb = fields.get('rb') ?? '0';
    if (username !== config.username || currency !== config.currency || !callId.trim() || callId.length > 200 ||
        (action !== 'balance' && action !== 'debit' && action !== 'credit') ||
        (rb !== '0' && rb !== '1') ||
        (action !== 'balance' && (!config.writesApproved || !/^\d{1,10}$/.test(amountText)))) return walletError;

    const requested = action === 'balance' ? 0 : Number(amountText);
    if (requested > maxBalance) return walletError;
    const rollback = rb === '1';
    const amount = action === 'debit' && !rollback && fields.get('type') === 'bonus_fs' ? 0 : requested;
    return await apply({
      username, currency, action, amount, rollback, timestampMs, callHash: digest(callId),
      fingerprint: digest(JSON.stringify([
        action, requested, amount, rollback, fields.get('round_id') ?? '', fields.get('game_id') ?? '',
      ])),
    });
  } catch {
    return walletError;
  }
}

// Store the balance and durable idempotency result in a single atomic HSET.
const walletTransaction = `
local prior = redis.call('HGET', KEYS[1], ARGV[1])
if prior then
  local entry = cjson.decode(prior)
  if entry.fingerprint ~= ARGV[2] then return {2, 0} end
  return {entry.error, entry.balance}
end

local current = tonumber(redis.call('HGET', KEYS[1], 'balance'))
local limit = tonumber(ARGV[7])
if not current or current < 0 or current > limit or current % 1 ~= 0 then return {2, 0} end
local action = ARGV[3]
local amount = tonumber(ARGV[4])
local next = current
local err = 0
if action == 'debit' then
  if amount > current then err = 1 else next = current - amount end
elseif action == 'credit' then
  if current + amount > limit then err = 2 else next = current + amount end
end
local balance = next
if err == 2 then balance = 0 end
local entry = cjson.encode({ fingerprint = ARGV[2], action = action, amount = amount,
  rollback = ARGV[5] == '1', timestamp_ms = tonumber(ARGV[6]), error = err, balance = balance })
redis.call('HSET', KEYS[1], 'balance', next, ARGV[1], entry)
return {err, balance}
`;

export const testWalletKey = (username: string, currency: string) =>
  'nextpari:softaggregator:operator-test:' + digest(JSON.stringify([username, currency]));

export function createTestWalletStore(endpoint: string, token: string, fetcher: typeof fetch = fetch) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.upstash.io') || url.pathname !== '/' ||
      url.username || url.password || url.port || url.search || url.hash || !token) {
    throw new Error('Invalid isolated test wallet configuration');
  }

  return async (call: WalletCall): Promise<WalletReply> => {
    const response = await fetcher(url.href, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify([
        'EVAL', walletTransaction, '1', testWalletKey(call.username, call.currency),
        'call:' + call.callHash, call.fingerprint, call.action, String(call.amount),
        call.rollback ? '1' : '0', String(call.timestampMs), String(maxBalance),
      ]),
    });
    if (!response.ok) return walletError;
    const { result } = await response.json() as { result?: unknown };
    if (!Array.isArray(result) || result.length !== 2) return walletError;
    const [error, balance] = result;
    if ((error !== 0 && error !== 1 && error !== 2) || !Number.isSafeInteger(balance) ||
        balance < 0 || balance > maxBalance || (error === 2 && balance !== 0)) return walletError;
    return { error, balance };
  };
}
