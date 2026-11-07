import { serveOfficeApi } from '../../../../server/vercel';

type OfficeRequest = Parameters<typeof serveOfficeApi>[0];
type OfficeResponse = Parameters<typeof serveOfficeApi>[1];

export default async function handler(req: OfficeRequest, res: OfficeResponse): Promise<void> {
  await serveOfficeApi(req, res);
}
