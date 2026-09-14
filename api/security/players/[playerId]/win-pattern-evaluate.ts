import { vercelSecurityParam } from '../../../../server/security/vercelHandler.js';

export default vercelSecurityParam(
  'playerId',
  (id) => `/api/security/players/${id}/win-pattern-evaluate`,
);
