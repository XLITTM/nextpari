function svgCover(title: string, from: string, to: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="320" height="420" rx="28" fill="url(#g)"/>
    <circle cx="260" cy="70" r="70" fill="${accent}" opacity="0.28"/>
    <circle cx="40" cy="360" r="80" fill="#fff" opacity="0.12"/>
    <text x="24" y="360" fill="#fff" font-size="26" font-family="Arial,sans-serif" font-weight="800">${title}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const CASINO_COVERS: Record<string, string> = {
  c1: svgCover('Sweet Bonanza', '#EC4899', '#9D174D', '#F9A8D4'),
  c2: svgCover('Olympus', '#8B5CF6', '#4C1D95', '#C4B5FD'),
  c3: svgCover('Crazy Time', '#EF4444', '#7F1D1D', '#FCA5A5'),
  c4: svgCover('Aviator', '#7C3AED', '#EA580C', '#FDBA74'),
  aviator: svgCover('Aviator', '#7C3AED', '#EA580C', '#FDBA74'),
  apples: svgCover('Apple Fortune', '#16A34A', '#14532D', '#86EFAC'),
  crystal: svgCover('Crystal', '#06B6D4', '#4F46E5', '#A5F3FC'),
  c5: svgCover('Big Bass', '#0EA5E9', '#0F766E', '#67E8F9'),
  c6: svgCover('Mega Moolah', '#EAB308', '#B45309', '#FDE68A'),
  c7: svgCover('Lightning', '#F97316', '#9A3412', '#FDBA74'),
  c8: svgCover('JetX', '#3B82F6', '#1E3A8A', '#93C5FD'),
  c9: svgCover('Wolf Gold', '#D97706', '#7C2D12', '#FCD34D'),
  c10: svgCover('Book of Dead', '#7C3AED', '#2E1065', '#DDD6FE'),
  c11: svgCover('Plinko', '#14B8A6', '#115E59', '#5EEAD4'),
  c12: svgCover('Monopoly', '#0891B2', '#155E75', '#67E8F9'),
  blackjack: svgCover('21 / Очко', '#0F766E', '#064E3B', '#6EE7B7'),
  'western-slot': '/images/games/western-slot.svg',
  'burning-hot': '/images/games/burning-hot.svg',
};

export function coverForGame(id: string, fallback?: string): string | undefined {
  return CASINO_COVERS[id] ?? fallback;
}
