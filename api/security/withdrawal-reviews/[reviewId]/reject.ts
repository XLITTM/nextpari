import { vercelSecurityParam } from '../../../../server/security/vercelHandler.js';

export default vercelSecurityParam(
  'reviewId',
  (id) => `/api/security/withdrawal-reviews/${id}/reject`,
);
