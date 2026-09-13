import { vercelOwnerParam } from '../../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'withdrawalId',
  (id) => `/api/owner/withdrawals/${id}/paid`,
);
