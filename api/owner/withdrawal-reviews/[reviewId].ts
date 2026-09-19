import { vercelOwnerParam } from '../../../server/owner/vercelHandler.js';

export default vercelOwnerParam(
  'reviewId',
  (id) => `/api/owner/withdrawal-reviews/${id}`,
);
