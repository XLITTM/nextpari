import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validCasinoDemoId } from '../../src/lib/casinoDemo.js';
import { readPlayerCookies, requestIsSecure } from '../player/playerCookies.js';
import { livePlayerAuthPorts, resolvePlayerSession } from '../player/playerAuthService.js';
import { staffError, StaffOnboardingError } from '../staff/errors.js';
import { loadStaffOnboardingEnv } from '../staff/env.js';
import { parseJsonPayload, writeStaffJson, type StaffJsonResponse } from '../staff/httpHandler.js';
import { createServiceRoleClient } from '../supabase/admin.js';
import { asRecord, createSoftAggregator, softAggregatorCatalogOnly } from './softAggregator.js';
import { handleWalletCallback, walletError, type WalletReply } from './softAggregatorTestWallet.js';

const provider = createSoftAggregator(process.env, fetch, Date.now, 'standard');
const previewCatalog = createSoftAggregator(process.env, fetch, Date.now, 'preview-catalog');
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const providerUsername = /^np_real_([a-f0-9]{32})$/;

export function standardCasinoGates(env: NodeJS.ProcessEnv, player?: string) {
  const pilot = env.SOFTAGGREGATOR_REAL_PILOT_PLAYER;
  const production = env.VERCEL_ENV === 'production';
  const callback = (production || (env.VERCEL_ENV === 'preview' && Boolean(pilot))) &&
    env.SOFTAGGREGATOR_REAL_CALLBACK_ENABLED === '1' && Boolean(env.SOFTAGGREGATOR_REAL_SALT) &&
    Boolean(env.SOFTAGGREGATOR_REAL_CALLBACK_HOST);
  const approvedWallet = callback && !softAggregatorCatalogOnly(env) &&
    env.SOFTAGGREGATOR_REAL_CALLBACK_VERIFIED === '1' && env.SOFTAGGREGATOR_REAL_WALLET_VERIFIED === '1';
  const launch = callback && !softAggregatorCatalogOnly(env) &&
    (production || pilot === player) && (!pilot || pilot === player) &&
    env.SOFTAGGREGATOR_REAL_LAUNCH_ENABLED === '1' && env.SOFTAGGREGATOR_REAL_OPERATOR_CREDIT_READY === '1' &&
    (env.SOFTAGGREGATOR_REAL_PLAYER_SECRET?.length ?? 0) >= 32;
  return { callback, launch, approvedWallet,
    newDebits: approvedWallet && env.SOFTAGGREGATOR_REAL_NEW_PLAY_ENABLED === '1' &&
      env.SOFTAGGREGATOR_REAL_OPERATOR_CREDIT_READY === '1' };
}

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
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (softAggregatorCatalogOnly(env)) {
      if (req.method !== 'GET' || url.searchParams.get('quote') === '1') throw staffError('CASINO_STANDARD_DISABLED', 503);
      const catalog = await previewCatalog.list(url.searchParams);
      writeStaffJson(res, { status: 200, headers, body: { ok: true, launchEnabled: false, catalogPreview: true, ...catalog } });
      return;
    }
    if (env.SOFTAGGREGATOR_REAL_CATALOG_ENABLED !== '1') throw staffError('CASINO_STANDARD_DISABLED', 503);
    const raw = value(req.headers, 'cookie');
    const parsed = readPlayerCookies(raw);
    if (!parsed.accessToken && !parsed.refreshToken) throw staffError('JWT_REQUIRED', 401);
    const ports = livePlayerAuthPorts();
    const session = await resolvePlayerSession(ports, raw, requestIsSecure(req.headers));
    cookies = session.cookies;
    const { id: player } = await ports.getAuthUser(session.accessToken);
    const gates = standardCasinoGates(env, player);
    const launchEnabled = gates.launch && provider.standardLaunchConfigured;
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
      if (url.searchParams.get('quote') === '1') {
        if (!launchEnabled) throw staffError('CASINO_STANDARD_DISABLED', 503);
        const { country: _country, ...conversion } = await quote();
        writeStaffJson(res, { status: 200, headers, cookies, body: { ok: true, launchEnabled, conversion } });
        return;
      }
      const catalog = await provider.list(url.searchParams);
      try {
        if (!launchEnabled) throw staffError('CASINO_STANDARD_DISABLED', 503);
        const { country: _country, ...conversion } = await quote();
        writeStaffJson(res, { status: 200, headers, cookies, body: { ok: true, launchEnabled, conversion, ...catalog } });
      } catch (error) {
        if (!(error instanceof StaffOnboardingError)) throw error;
        writeStaffJson(res, { status: 200, headers, cookies,
          body: { ok: true, launchEnabled: false, catalogPreview: true, ...catalog } });
      }
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
    if (gates.newDebits) {
      const { error } = await serviceClient().rpc('softaggregator_session', {
        p_player: player, p_session: identity.session, p_game: entry.sourceId,
        p_rate_version: body.rateVersion, p_confirm_launch: true,
      });
      if (error?.message.includes('SOFTAGGREGATOR_RATE_CHANGED')) throw staffError('CASINO_STANDARD_RATE_CHANGED', 409);
      if (error) throw staffError('CASINO_STANDARD_UNAVAILABLE', 503);
    }
    writeStaffJson(res, { status: 200, headers, cookies, body: { ok: true, ...game } });
  } catch (error) {
    const status = error instanceof StaffOnboardingError ? error.httpStatus : 503;
    const code = error instanceof StaffOnboardingError ? error.code : 'CASINO_STANDARD_UNAVAILABLE';
    writeStaffJson(res, { status, headers, cookies, body: { ok: false, error: code } });
  }
}

export async function standardWalletVercel(req: IncomingMessage, res: ServerResponse) {
  const env = process.env;
  const gates = standardCasinoGates(env);
  let reply = walletError;
  if (gates.callback && env.SOFTAGGREGATOR_REAL_SALT &&
      value(req.headers, 'host') === env.SOFTAGGREGATOR_REAL_CALLBACK_HOST) {
    reply = await handleWalletCallback({
      method: req.method, url: req.url, signature: value(req.headers, 'x-signature'),
      sourceIp: value(req.headers, 'x-vercel-forwarded-for'),
    }, {
      salt: env.SOFTAGGREGATOR_REAL_SALT, writesApproved: gates.approvedWallet,
      matchesIdentity: (username, currency) => currency === 'USD' && providerUsername.test(username),
    }, async (call): Promise<WalletReply> => {
      const id = providerUsername.exec(call.username)?.[1];
      if (!id) return walletError;
      const session = [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-');
      const { data, error } = await serviceClient().rpc('softaggregator_apply_callback', {
        p_session: session, p_call: call.callHash, p_fingerprint: call.fingerprint, p_action: call.action,
        p_amount: call.amount, p_rollback: call.rollback, p_game: call.gameId, p_round: call.roundId,
        p_new_debits: gates.newDebits,
      });
      if (error) return walletError;
      const { error: code, balance } = asRecord(data);
      if (code === 0 && call.action === 'balance' && !gates.approvedWallet) {
        console.info('softaggregator_signed_balance_verified');
      }
      return (code === 0 || code === 1 || code === 2) && typeof balance === 'number' &&
        Number.isSafeInteger(balance) && balance >= 0 ? { error: code, balance } : walletError;
    });
  }
  res.statusCode = 200;
  for (const [name, val] of Object.entries(headers)) res.setHeader(name, val);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(reply));
}
