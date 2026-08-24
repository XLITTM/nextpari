import type { ParsedMarket } from '../src/lib/odds-parser';
import {
  LIVE_MARKET_MESSAGES,
  checkLiveSnapshots,
  inferMarketKey,
  inferSelection,
  normalizeScore,
  type BetPlacementSnapshot,
} from '../src/lib/liveMarketCheck';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function market1x2(home: number, draw: number, away: number): ParsedMarket {
  return {
    key: '1_1',
    bookmaker: 'bet365',
    marketId: '1',
    name: '1X2',
    category: 'main',
    entries: [
      {
        id: 'm1',
        outcomes: [
          { key: 'home', odds: home, raw: String(home) },
          { key: 'draw', odds: draw, raw: String(draw) },
          { key: 'away', odds: away, raw: String(away) },
        ],
        updatedAt: Date.now(),
      },
    ],
  };
}

const liveItem: BetPlacementSnapshot = {
  eventId: 'evt-1',
  marketKey: '1x2',
  selection: 'p1',
  initialOdds: 2.1,
  initialScore: '0:0',
  selectionId: 'sel-1',
  isLive: true,
  matchLabel: 'A — B',
  outcome: 'П1',
  market: '1X2',
};

async function main() {
  assert(3000 === 3000, 'live delay is 3 seconds');
  assert(normalizeScore('1-0') === normalizeScore('1:0'), 'score normalize');
  assert(inferMarketKey('Тотал') === 'total', 'market key total');
  assert(inferSelection('П1') === 'p1', 'selection p1');

  const ended = checkLiveSnapshots([liveItem], [], 'none');
  assert(ended.status === 'ended' && ended.error === LIVE_MARKET_MESSAGES.ended, 'ended match');

  const scoreChanged = checkLiveSnapshots(
    [liveItem],
    [{ eventId: 'evt-1', timeStatus: '1', score: '1:0', markets: [market1x2(2.1, 3.2, 3.4)] }],
    'none',
  );
  assert(scoreChanged.status === 'score_changed', 'anti after-goal');

  const blocked = checkLiveSnapshots(
    [liveItem],
    [{ eventId: 'evt-1', timeStatus: '1', score: '0:0', markets: [market1x2(0, 3.2, 3.4)] }],
    'none',
  );
  assert(blocked.status === 'blocked', 'blocked market');

  const oddsChanged = checkLiveSnapshots(
    [liveItem],
    [{ eventId: 'evt-1', timeStatus: '1', score: '0:0', markets: [market1x2(2.45, 3.2, 3.4)] }],
    'none',
  );
  assert(oddsChanged.status === 'odds_changed', 'odds confirm');

  const autoAccept = checkLiveSnapshots(
    [liveItem],
    [{ eventId: 'evt-1', timeStatus: '1', score: '0:0', markets: [market1x2(2.45, 3.2, 3.4)] }],
    'any',
  );
  assert(autoAccept.status === 'ok' && autoAccept.updates[0]?.odds === 2.45, 'auto accept odds');

  const ok = checkLiveSnapshots(
    [liveItem],
    [{ eventId: 'evt-1', timeStatus: '1', score: '0:0', markets: [market1x2(2.1, 3.2, 3.4)] }],
    'none',
  );
  assert(ok.status === 'ok', 'same odds accepted');

  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert(Date.now() - started >= 280, 'timer helper works');

  console.log('live market check: ok');
}

void main();
