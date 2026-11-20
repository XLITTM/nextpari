import { BETSAPI_PREVIEW_PATH, handleBetsApiPreviewRequest } from '../../server/betsapi/previewHttp.js';

export default async function handler(
  req: {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, unknown>;
  },
  res: {
    status: (code: number) => { setHeader: (name: string, value: string) => unknown; json: (body: unknown) => unknown };
    setHeader: (name: string, value: string) => unknown;
    json: (body: unknown) => unknown;
  },
): Promise<void> {
  const result = await handleBetsApiPreviewRequest({
    method: req.method,
    url: req.url ?? BETSAPI_PREVIEW_PATH,
    headers: req.headers,
    query: req.query,
  });
  res.status(result.status);
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  res.json(result.body);
}
