import { vercelPlayerGameRound } from '../../../server/player/vercelGamesHandler.js';

export default vercelPlayerGameRound((id) => `/api/player/games/${id}`);
