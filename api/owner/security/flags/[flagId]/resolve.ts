import { vercelOwnerParam } from '../../../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'flagId',
  (id) => `/api/owner/security/flags/${id}/resolve`,
);
