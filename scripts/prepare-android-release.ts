import { readFile } from 'node:fs/promises';
import { androidBuildToolsRunner, verifyPreparedApk } from '../server/android/apkVerify.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run android:release:prepare -- path/to/app-release.apk');
  process.exit(2);
}

try {
  const bytes = await readFile(file);
  const identity = await verifyPreparedApk(bytes, androidBuildToolsRunner());
  process.stdout.write(`${JSON.stringify({
    packageName: identity.packageName,
    versionCode: identity.versionCode,
    sha256: identity.sha256,
    certificateSha256: identity.certificateSha256,
    schemeV2: identity.schemeV2,
    schemeV3: identity.schemeV3,
  })}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'APK_VERIFY_FAILED');
  process.exit(1);
}
