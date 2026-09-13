import { vercelOwnerControl } from '../../../../../server/owner/vercelHandler.js';

export default vercelOwnerControl((query) => {
  const playerId = Array.isArray(query?.playerId) ? query?.playerId[0] ?? '' : query?.playerId ?? '';
  const betId = Array.isArray(query?.betId) ? query?.betId[0] ?? '' : query?.betId ?? '';
  return `/api/owner/players/${playerId}/sports/${betId}`;
});
