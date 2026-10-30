import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { staffError } from '../staff/errors.js';

const execFileAsync = promisify(execFile);

export type ApkToolResult = { code: number; stdout: string; stderr: string };

export type ApkToolRunner = {
  apksigner(apkPath: string): Promise<ApkToolResult>;
  aapt(apkPath: string): Promise<ApkToolResult>;
};

export type ApkIdentity = {
  packageName: string;
  versionCode: number;
  certificateSha256: string;
  sha256: string;
  schemeV2: boolean;
  schemeV3: boolean;
};

export function parseApksignerVerify(stdout: string, exitCode: number): Pick<ApkIdentity, 'schemeV2' | 'schemeV3' | 'certificateSha256'> {
  if (exitCode !== 0) throw staffError('APK_SIGNATURE_INVALID', 400);
  const schemeV2 = /Verified using v2 scheme \(APK Signature Scheme v2\):\s*true/i.test(stdout);
  const schemeV3 = /Verified using v3 scheme \(APK Signature Scheme v3\):\s*true/i.test(stdout);
  if (!schemeV2 && !schemeV3) throw staffError('APK_SIGNATURE_INVALID', 400);
  const digest = stdout.match(/certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/);
  const certificateSha256 = digest?.[1]?.replace(/:/g, '').toLowerCase() ?? '';
  if (!/^[a-f0-9]{64}$/.test(certificateSha256)) throw staffError('APK_SIGNATURE_INVALID', 400);
  return { schemeV2, schemeV3, certificateSha256 };
}

export function parseAaptBadging(stdout: string, exitCode: number): Pick<ApkIdentity, 'packageName' | 'versionCode'> {
  if (exitCode !== 0) throw staffError('APK_MANIFEST_INVALID', 400);
  const match = stdout.match(/package:\s+name='([^']+)'\s+versionCode='(\d+)'/);
  if (!match) throw staffError('APK_MANIFEST_INVALID', 400);
  const versionCode = Number(match[2]);
  if (!Number.isInteger(versionCode)) throw staffError('APK_MANIFEST_INVALID', 400);
  return { packageName: match[1], versionCode };
}

export async function verifyPreparedApk(bytes: Buffer, runner: ApkToolRunner): Promise<ApkIdentity> {
  const dir = await mkdtemp(join(tmpdir(), 'nextpari-apk-'));
  const apkPath = join(dir, 'release.apk');
  try {
    await writeFile(apkPath, bytes);
    const signed = await runner.apksigner(apkPath);
    const signature = parseApksignerVerify(signed.stdout, signed.code);
    const manifest = await runner.aapt(apkPath);
    const identity = parseAaptBadging(manifest.stdout, manifest.code);
    return {
      ...identity,
      ...signature,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertToolPath(file: string, name: string): string {
  const base = basename(file).toLowerCase();
  const allowed = new Set([name, `${name}.bat`, `${name}.exe`]);
  if (!file.trim() || !allowed.has(base) || /["&|<>^%\r\n]/.test(file)) {
    throw staffError('APKSIGNER_REQUIRED', 503);
  }
  return file;
}

async function runTool(file: string, args: string[]): Promise<ApkToolResult> {
  const command = file.toLowerCase().endsWith('.bat') ? (process.env.ComSpec || 'cmd.exe') : file;
  const commandArgs = file.toLowerCase().endsWith('.bat') ? ['/d', '/s', '/c', file, ...args] : args;
  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (error) {
    const failed = error as { code?: number | string; stdout?: string; stderr?: string };
    if (failed.code === 'ENOENT' || failed.code === 'ERR_INVALID_ARG_VALUE') {
      throw staffError('APKSIGNER_REQUIRED', 503);
    }
    if (typeof failed.code === 'number') {
      return { code: failed.code, stdout: String(failed.stdout ?? ''), stderr: String(failed.stderr ?? '') };
    }
    throw staffError('APKSIGNER_REQUIRED', 503);
  }
}

export function androidBuildToolsRunner(): ApkToolRunner {
  const apksigner = assertToolPath(process.env.APKSIGNER ?? '', 'apksigner');
  const aapt = assertToolPath(process.env.AAPT ?? '', 'aapt');
  return {
    apksigner: (apkPath) => runTool(apksigner, ['verify', '--print-certs', '-v', apkPath]),
    aapt: (apkPath) => runTool(aapt, ['dump', 'badging', apkPath]),
  };
}
