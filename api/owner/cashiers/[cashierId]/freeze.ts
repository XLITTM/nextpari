import { vercelOwnerParam } from '../../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'cashierId',
  (id) => `/api/owner/cashiers/${id}/freeze`,
);
