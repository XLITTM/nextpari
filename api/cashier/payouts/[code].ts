import { vercelCashierParam } from '../../../server/cashier/vercelHandler.js';

export default vercelCashierParam('code', (code) => `/api/cashier/payouts/${code}`);
