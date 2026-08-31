import { vercelOwnerParam } from '../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'managerId',
  (id) => `/api/owner/managers/${id}`,
);
