import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validCasinoDemoId } from '../../src/lib/casinoDemo.js';
import { readPlayerCookies, requestIsSecure } from '../player/playerCookies.js';
import { livePlayerAuthPorts, resolvePlayerSession } from '../player/playerAuthService.js';
import { staffError, StaffOnboardingError } from '../staff/errors.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { parseJsonPayload, writeStaffJson, type StaffJsonResponse } from '../staff/httpHandler.js';
import { createServiceRoleClient } from '../supabase/admin.js';
import { asRecord, createSoftAggregator } from './softAggregator.js';
import { handleWalletCallback, walletError, type WalletReply } from './softAggregatorTestWallet.js';

const provider = createSoftAggregator(process.env, fetch, Date.now, 'standard');
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const providerUsername = /^np_real_([a-f0-9]{32})$/;

function serviceClient() {
  const env = loadStaffOnboardingEnv();
  return createServiceRoleClient(env.supabaseUrl, env.supabaseServiceRoleKey);
}

function value(headers: IncomingMessage['headers'], key: string) {
  const input = headers[key];
  return typeof input === 'string' ? input : undefined;
}

function sameOrigin(headers: IncomingMessage['headers']) {
  const host = value(headers, 'host');
  return host && (host === 'nextpari.net' || host === process.env.VERCEL_URL) &&
    value(headers, 'origin') === 'https://' + host ? 'https://' + host : null;
}

export function deriveProviderPlayer(secret: string, player: string, game: string, version: string) {
  const id = createHmac('sha256', secret).update(JSON.stringify([player, game, version])).digest('hex').slice(0, 32);
  const session = [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
  return { session, username: 'np_real_' + id,
    password: createHmac('sha256', secret).update('player-password:' + id).digest('hex') };
}

export async function standardCasinoVercel(
  req: Pick<IncomingMessage, 'method' | 'url' | 'headers'> & { body?: unknown },
  res: StaffJsonResponse,
) {
  const env = process.env;
  let cookies: string[] | undefined;
  try {
    if (env.SOFTAGGREGATOR_REAL_CATALOG_ENABLED !== '1') throw staffError('CASINO_STANDARD_DISABLED', 503);
    const raw = value(req.headers, 'cookie');
    const parsed = readPlayerCookies(raw);
    if (!parsed.accessToken && !parsed.refreshToken) throw staffError('JWT_REQUIRED', 401);
    const ports = livePlayerAuthPorts();
    const session = await resolvePlayerSession(ports, raw, requestIsSecure(req.headers));
    cookies = session.cookies;
    const { id: player } = await ports.getAuthUser(session.accessToken);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pilot = env.SOFTAGGREGATOR_REAL_PILOT_PLAYER;
    const launchEnabled = (env.VERCEL_ENV === 'production' || (env.VERCEL_ENV === 'preview' && pilot === player)) &&
      env.SOFTAGGREGATOR_REAL_NEW_PLAY_ENABLED === '1' &&
      env.SOFTAGGREGATOR_REAL_CALLBACK_ENABLED === '1' && env.SOFTAGGREGATOR_REAL_CALLBACK_VERIFIED === '1' &&
      env.SOFTAGGREGATOR_REAL_OPERATOR_CREDIT_READY === '1' &&
      (!pilot || pilot === player);
    const origin = sameOrigin(req.headers);

    async function quote(args: Record<string, unknown> = {}) {
      const { data, error } = await serviceClient().rpc('softaggregator_session', { p_player: player, ...args });
      if (error) {
        if (/PLAYER_INELIGIBLE|SECURITY_CASINO_RESTRICTED/.test(error.message)) throw staffError('CASINO_STANDARD_INELIGIBLE', 403);
        if (error.message.includes('SOFTAGGREGATOR_RATE_CHANGED')) throw staffError('CASINO_STANDARD_RATE_CHANGED', 409);
        throw staffError('CASINO_STANDARD_UNAVAILABLE', 503);
      }
      const { usdtTmt, usdtUsd, rateVersion, balanceUsdMinor, country } = asRecord(data);
      if (typeof usdtTmt !== 'string' || typeof usdtUsd !== 'string' ||
          typeof rateVersion !== 'string' || !/^[a-f0-9]{32}$/.test(rateVersion) ||
          typeof balanceUsdMinor !== 'number' || !Number.isSafeInteger(balanceUsdMinor) || balanceUsdMinor < 0 ||
          typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)) throw staffError('CASINO_STANDARD_UNAVAILABLE', 503);
      if (!(env.SOFTAGGREGATOR_REAL_COUNTRIES ?? '').split(',').map((code) => code.trim()).includes(country)) {
        throw staffError('CASINO_STANDARD_INELIGIBLE', 403);
      }
      return { usdtTmt, usdtUsd, rateVersion, balanceUsdMinor, country };
    }

    if (req.method === 'GET') {
      const { country: _country, ...conversion } = await quote();
      const catalog = url.searchParams.get('quote') === '1' ? null : await provider.list(url.searchParams);
      writeStaffJson(res, { status: 200, headers, cookies, body: { ok: true, launchEnabled, conversion, ...catalog } });
      return;
    }

    if (req.method !== 'POST' || !origin ||
        !/^application\/json(?:;|$)/i.test(value(req.headers, 'content-type') ?? '')) throw staffError('CASINO_STANDARD_REQUEST_DENIED', 403);
    if (!launchEnabled || !env.SOFTAGGREGATOR_REAL_PLAYER_SECRET || env.SOFTAGGREGATOR_REAL_PLAYER_SECRET.length < 32) {
      throw staffError('CASINO_STANDARD_DISABLED', 503);
    }

    const body = asRecord(parseJsonPayload(req.body));
    if (typeof body.id !== 'string' || !validCasinoDemoId(body.id) || typeof body.rateVersion !== 'string' ||
        (body.device !== 'mobile' && body.device !== 'desktop')) throw staffError('BODY_INVALID', 400);

    const entry = await provider.standardGame(body.id);
    const identity = deriveProviderPlayer(env.SOFTAGGREGATOR_REAL_PLAYER_SECRET, player, entry.sourceId, body.rateVersion);
    const conversion = await quote({ p_session: identity.session, p_game: entry.sourceId, p_rate_version: body.rateVersion });
    const game = await provider.launchStandard(entry, { ...identity, country: conversion.country }, body.device, origin);
    const { error: confirmError } = await serviceClient().rpc('softaggregator_session', {
      p_player: player, p_session: identity.session, p_game: entry.sourceId,
      p_rate_version: body.rateVersion, p_confirm_launch: true,
    });
    if (confirmError) throw staffError('CASINO_STANDARD_UNAVAILABLE', 503);
    writeStaffJson(res, { status: 200, headers, cookies, body: { ok: true, ...game } });
  } catch (error) {
    const status = error instanceof StaffOnboardingError ? error.httpStatus : 503;
    const code = error instanceof StaffOnboardingError ? error.code : 'CASINO_STANDARD_UNAVAILABLE';
    writeStaffJson(res, { status, headers, cookies, body: { ok: false, error: code } });
  }
}

export async function standardWalletVercel(req: IncomingMessage, res: ServerResponse) {
  const env = process.env;
  let reply = walletError;
  if ((env.VERCEL_ENV === 'production' || (env.VERCEL_ENV === 'preview' && env.SOFTAGGREGATOR_REAL_PILOT_PLAYER)) &&
      env.SOFTAGGREGATOR_REAL_CALLBACK_ENABLED === '1' && env.SOFTAGGREGATOR_REAL_SALT &&
      env.SOFTAGGREGATOR_REAL_CALLBACK_HOST && value(req.headers, 'host') === env.SOFTAGGREGATOR_REAL_CALLBACK_HOST) {
    reply = await handleWalletCallback({
      method: req.method, url: req.url, signature: value(req.headers, 'x-signature'),
      sourceIp: value(req.headers, 'x-vercel-forwarded-for'),
    }, {
      salt: env.SOFTAGGREGATOR_REAL_SALT, writesApproved: true,
      matchesIdentity: (username, currency) => currency === 'USD' && providerUsername.test(username),
    }, async (call): Promise<WalletReply> => {
      const id = providerUsername.exec(call.username)?.[1];
      if (!id) return walletError;
      const session = [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
      const { data, error } = await serviceClient().rpc('softaggregator_apply_callback', {
        p_session: session, p_call: call.callHash, p_fingerprint: call.fingerprint, p_action: call.action,
        p_amount: call.amount, p_rollback: call.rollback, p_game: call.gameId, p_round: call.roundId,
        p_new_debits: env.SOFTAGGREGATOR_REAL_NEW_PLAY_ENABLED === '1' &&
          env.SOFTAGGREGATOR_REAL_OPERATOR_CREDIT_READY === '1',
      });
      if (error) return walletError;
      const { error: code, balance } = asRecord(data);
      return (code === 0 || code === 1 || code === 2) && typeof balance === 'number' &&
        Number.isSafeInteger(balance) && balance >= 0 ? { error: code, balance } : walletError;
    });
  }
  res.statusCode = 200;
  for (const [name, val] of Object.entries(headers)) res.setHeader(name, val);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(reply));
}
