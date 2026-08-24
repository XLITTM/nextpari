import { getInplayResponse } from './inplay-cache.js';

export default async function handler(_req, res) {
  try {
    const result = await getInplayResponse();
    res.status(result.status);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=4, s-maxage=4');
    if (result.cached) res.setHeader('X-Sports-Cache', result.paused ? 'PAUSE' : 'HIT');
    else res.setHeader('X-Sports-Cache', 'MISS');
    res.send(result.body);
  } catch (error) {
    res.status(502).json({
      success: 0,
      error: error instanceof Error ? error.message : 'Inplay proxy failed',
      results: [],
    });
  }
}
