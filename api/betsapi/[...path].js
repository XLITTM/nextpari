export default async function handler(req, res) {
  const token = process.env.BETSAPI_TOKEN || process.env.VITE_BETSAPI_TOKEN || '';
  const rawPath = req.query.path;
  const suffix = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const dest = new URL(`https://api.betsapi.com/${suffix.replace(/^\/+/, '')}`);

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) dest.searchParams.set(key, value[0]);
    else if (value != null) dest.searchParams.set(key, String(value));
  }
  if (token) dest.searchParams.set('token', token);

  try {
    const response = await fetch(dest.toString(), {
      headers: { Accept: 'application/json' },
    });
    const body = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3, s-maxage=3');
    res.send(body);
  } catch (error) {
    res.status(502).json({ success: 0, error: error instanceof Error ? error.message : 'BetsAPI proxy failed' });
  }
}
