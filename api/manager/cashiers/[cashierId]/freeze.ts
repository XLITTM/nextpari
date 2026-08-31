import { vercelManagerParam } from '../../../../server/manager/vercelHandler.js';

export default vercelManagerParam(
  'cashierId',
  (id) => `/api/manager/cashiers/${id}/freeze`,
);
