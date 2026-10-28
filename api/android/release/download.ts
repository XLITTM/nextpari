import { handlePublicAndroidDownload } from '../../../server/android/androidReleaseHttp.js';

export default async function handler(
  req: Parameters<typeof handlePublicAndroidDownload>[0],
  res: Parameters<typeof handlePublicAndroidDownload>[1],
): Promise<void> {
  await handlePublicAndroidDownload(req, res);
}
