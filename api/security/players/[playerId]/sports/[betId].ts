import { vercelSecurityControl } from '../../../../../server/security/vercelHandler.js';

export default vercelSecurityControl((query) => {
  const playerId = Array.isArray(query?.playerId) ? query?.playerId[0] ?? '' : query?.playerId ?? '';
  const betId = Array.isArray(query?.betId) ? query?.betId[0] ?? '' : query?.betId ?? '';
  return `/api/security/players/${playerId}/sports/${betId}`;
});
