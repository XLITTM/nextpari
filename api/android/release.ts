import { handlePublicAndroidRelease } from '../../server/android/androidReleaseHttp.js';

export default async function handler(
  req: Parameters<typeof handlePublicAndroidRelease>[0],
  res: Parameters<typeof handlePublicAndroidRelease>[1],
): Promise<void> {
  await handlePublicAndroidRelease(req, res);
}
