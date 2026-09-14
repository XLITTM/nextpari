import { vercelSecurityParam } from '../../../../server/security/vercelHandler.js';

export default vercelSecurityParam(
  'flagId',
  (id) => `/api/security/flags/${id}/review`,
);
