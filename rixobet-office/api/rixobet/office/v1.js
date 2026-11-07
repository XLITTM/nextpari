import { serveOfficeApi } from './bundle.js';

export default async function handler(req, res) {
  await serveOfficeApi(req, res);
}
