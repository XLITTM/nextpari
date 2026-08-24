import { startSportsFeed } from '../src/services/sportsWorker';

console.log('[sports-worker] BetsAPI requests at most every 12s, live tick 15s, 429 backoff from 60s');
startSportsFeed(15_000);
