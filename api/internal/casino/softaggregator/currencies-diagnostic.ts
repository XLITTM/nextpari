import type { IncomingMessage, ServerResponse } from 'node:http';
import { asRecord, readBoundedJson, softAggregatorEndpoint, softAggregatorHeaders } from '../../../../server/casino/softAggregator.js';

const currencyCode = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value);

export default async function currenciesDiagnostic(req: IncomingMessage, res: ServerResponse) {
  const env = process.env;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // The generated deployment hostname is covered by this project's Vercel Authentication.
  if (req.method !== 'GET' || env.VERCEL_ENV !== 'production' ||
      env.VERCEL_GIT_COMMIT_REF !== 'work/casino-demo-softaggregator-w001' ||
      !env.VERCEL_URL?.endsWith('.vercel.app') || req.headers.host !== env.VERCEL_URL) {
    res.statusCode = 404;
    res.end('{}');
    return;
  }

  const method = 'getCurrencies';
  const login = env.SOFTAGGREGATOR_REAL_LOGIN;
  const password = env.SOFTAGGREGATOR_REAL_PASSWORD;
  if (!login || !password) {
    res.statusCode = 503;
    res.end(JSON.stringify({ method, diagnosticError: 'CREDENTIALS_UNAVAILABLE' }));
    return;
  }

  const utc = new Date().toISOString();
  try {
    const response = await fetch(softAggregatorEndpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
      headers: softAggregatorHeaders,
      body: JSON.stringify({ method, api_login: login, api_password: password }),
    });
    const rawRay = response.headers.get('cf-ray') ?? '';
    const rayId = /^[a-f0-9]{8,32}-[A-Z]{3}$/.test(rawRay) ? rawRay : null;
    const raw = asRecord(await readBoundedJson(response).catch(() => null));
    const result = asRecord(raw.response);
    const error = Number.isSafeInteger(raw.error) ? raw.error : null;
    const edgeError = raw.error_code === 1010 || raw.error_name === 'browser_signature_banned' ? 'browser_signature_banned' : null;
    const currencies = Array.isArray(result.currencies) ? result.currencies.filter(currencyCode) : [];
    res.end(JSON.stringify({ method, utc, http: response.status, rayId, error, edgeError,
      ...(response.ok && error === 0 ? { currencies,
        default: currencyCode(result.default) ? result.default : null,
        settlement: currencyCode(result.settlement) ? result.settlement : null } : {}) }));
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ method, utc, diagnosticError: 'UPSTREAM_TRANSPORT_ERROR' }));
  }
}
