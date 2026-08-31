import { vercelOwnerParam } from '../../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'playerId',
  (id) => `/api/owner/players/${id}/block`,
);
