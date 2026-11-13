import type { IncomingMessage, ServerResponse } from 'node:http';
import { createTestWalletStore, handleTestWalletCallback, testBranch, walletError } from '../../../../server/casino/softAggregatorTestWallet.js';

function header(req: IncomingMessage, name: string) {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

export default async function softAggregatorTestCallback(req: IncomingMessage, res: ServerResponse) {
  const env = process.env;
  let reply = walletError;
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_GIT_COMMIT_REF === testBranch &&
      env.SOFTAGGREGATOR_TEST_CALLBACK_ENABLED === '1' && env.SOFTAGGREGATOR_TEST_CALLBACK_HOST &&
      header(req, 'host') === env.SOFTAGGREGATOR_TEST_CALLBACK_HOST &&
      env.SOFTAGGREGATOR_TEST_SALT && env.SOFTAGGREGATOR_TEST_USERNAME && env.SOFTAGGREGATOR_TEST_CURRENCY &&
      env.SOFTAGGREGATOR_TEST_REDIS_URL && env.SOFTAGGREGATOR_TEST_REDIS_TOKEN) {
    try {
      reply = await handleTestWalletCallback({
        method: req.method, url: req.url, signature: header(req, 'x-signature'),
        sourceIp: header(req, 'x-vercel-forwarded-for'),
      }, {
        salt: env.SOFTAGGREGATOR_TEST_SALT, username: env.SOFTAGGREGATOR_TEST_USERNAME,
        currency: env.SOFTAGGREGATOR_TEST_CURRENCY,
        writesApproved: env.SOFTAGGREGATOR_TEST_STANDARD_LAUNCH_APPROVED === '1',
      }, createTestWalletStore(env.SOFTAGGREGATOR_TEST_REDIS_URL, env.SOFTAGGREGATOR_TEST_REDIS_TOKEN));
    } catch {
      // Never log the signed URL, credentials or provider/storage error payloads.
    }
  }
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(reply));
}
