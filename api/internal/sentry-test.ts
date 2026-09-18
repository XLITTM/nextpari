import { INTERNAL_SENTRY_TEST_PATH, handleVercelSentryTest } from '../../server/observability/sentryTestHttp.js';

export default async function handler(
  req: {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: {
    status: (code: number) => unknown;
    setHeader: (name: string, value: string | string[]) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  await handleVercelSentryTest(req, res, INTERNAL_SENTRY_TEST_PATH);
}
