import { fetchBetsApi } from './gateway.js';

export default async function handler(req, res) {
  const rawPath = req.query.path;
  const suffix = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) params.set(key, value[0]);
    else if (value != null) params.set(key, String(value));
  }

  try {
    const result = await fetchBetsApi(suffix, params);
    res.status(result.status);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=4, s-maxage=4');
    if (result.cached) res.setHeader('X-BetsAPI-Cache', 'HIT');
    res.send(result.body);
  } catch (error) {
    res.status(502).json({ success: 0, error: error instanceof Error ? error.message : 'BetsAPI proxy failed' });
  }
}
