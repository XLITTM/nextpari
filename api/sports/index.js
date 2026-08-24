import { getCatalogResponse } from './catalog-cache.js';

export default async function handler(req, res) {
  try {
    const type = req.query?.type ?? new URL(req.url || '/', 'http://localhost').searchParams.get('type');
    const result = await getCatalogResponse(type);
    res.status(result.status);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', result.cached ? 'public, max-age=4, s-maxage=4' : 'public, max-age=2, s-maxage=2');
    res.setHeader('X-Sports-Cache', result.paused ? 'PAUSE' : result.cached ? 'HIT' : 'MISS');
    res.send(result.body);
  } catch (error) {
    res.status(200).json({
      success: 1,
      results: [],
      error: error instanceof Error ? error.message : 'Sports catalog failed',
    });
  }
}
