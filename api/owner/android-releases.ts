import { handleOwnerAndroidRelease } from '../../../server/android/androidReleaseHttp.js';

export default async function handler(
  req: Parameters<typeof handleOwnerAndroidRelease>[0],
  res: Parameters<typeof handleOwnerAndroidRelease>[1],
): Promise<void> {
  await handleOwnerAndroidRelease(req, res, '/api/owner/android-releases');
}
