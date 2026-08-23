import { startSportsFeed } from '../src/services/sportsWorker';

console.log('[sports-worker] BetsAPI live sync every 15s, prematch/settlement every 2m');
startSportsFeed(15_000);
