import { vercelManagerParam } from '../../../server/manager/vercelHandler.js';

export default vercelManagerParam(
  'playerId',
  (id) => `/api/manager/players/${id}`,
);
