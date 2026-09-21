export default async function handler(_req, res) {
  res.status(410);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify({
    success: 0,
    error: 'LEGACY_SPORTS_FEED_DISABLED',
  }));
}
