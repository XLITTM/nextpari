import { vercelOwnerParam } from '../../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'authUserId',
  (id) => `/api/owner/security-staff/${id}/reset-password`,
);
