const DISABLED = {
  success: 1,
  results: [],
  source: 'disabled',
  reason: 'LEGACY_SPORTS_FEED_DISABLED',
};

export default async function handler(_req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(DISABLED));
}
