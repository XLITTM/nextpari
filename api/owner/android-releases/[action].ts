import { handleOwnerAndroidRelease } from '../../../../server/android/androidReleaseHttp.js';

export default async function handler(
  req: Parameters<typeof handleOwnerAndroidRelease>[0] & {
    query?: Record<string, string | string[] | undefined>;
  },
  res: Parameters<typeof handleOwnerAndroidRelease>[1],
): Promise<void> {
  const raw = req.query?.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  await handleOwnerAndroidRelease(req, res, `/api/owner/android-releases/${action ?? ''}`);
}
