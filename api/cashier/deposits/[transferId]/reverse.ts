import { vercelCashierParam } from '../../../../server/cashier/vercelHandler.js';

export default vercelCashierParam(
  'transferId',
  (transferId) => `/api/cashier/deposits/${transferId}/reverse`,
);
