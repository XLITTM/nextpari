import { createHash, timingSafeEqual } from 'node:crypto';
import { staffError } from '../staff/errors.js';

export const ANDROID_PACKAGE = 'com.nextpari.app';
export const ANDROID_DOWNLOAD_PATH = '/api/android/release/download';
export const ANDROID_DOWNLOAD_URL_TTL_SECONDS = 60;
export const ANDROID_MIN_SDK = 26;
export const ANDROID_MAX_APK_BYTES = 80_000_000;

const VERSION_NAME = /^\d+\.\d+\.\d+(?:-[a-z0-9][a-z0-9.]*)?$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ReleaseStatus = 'draft' | 'published' | 'superseded' | 'retired';
export type UpdateMode = 'none' | 'recommended';

export type AndroidReleaseRecord = {
  versionCode: number;
  versionName: string;
  releaseNotes: string;
  sha256: string;
  sizeBytes: number;
  minSdk: number;
  artifactKey: string;
  certificateSha256: string;
  effectiveOn: string;
  status: ReleaseStatus;
  publishedAt: string | null;
  retiredAt: string | null;
};

export type AndroidDownloadSettings = {
  bannerEnabled: boolean;
  bannerTitle: string;
  bannerBody: string;
  updateMode: UpdateMode;
  minimumVersionCode: number;
};

export type AndroidReleaseAudit = {
  at: string;
  actorId: string;
  action: string;
  versionCode: number | null;
};

export type AndroidReleaseRepository = {
  list(): Promise<AndroidReleaseRecord[]>;
  settings(): Promise<AndroidDownloadSettings>;
  save(release: AndroidReleaseRecord): Promise<void>;
  saveSettings(settings: AndroidDownloadSettings): Promise<void>;
  audit(entry: AndroidReleaseAudit): Promise<void>;
};

export type ApkIdentity = {
  packageName: string;
  versionCode: number;
  certificateSha256: string;
  sha256: string;
  schemeV2: boolean;
  schemeV3: boolean;
};

export type AndroidArtifactStore = {
  configured(): boolean;
  read(key: string): Promise<Buffer | null>;
  signedDownloadUrl(key: string): Promise<string | null>;
};

export type AndroidReleasePorts = {
  repo: AndroidReleaseRepository;
  artifacts: AndroidArtifactStore;
  /** SHA-256 of the owner release certificate. Not a private key. */
  certificateSha256: string | null;
  /** Host allowed to serve the temporary APK URL. Not a caller-supplied address. */
  storageHost: string;
  verifyApk: (bytes: Buffer) => Promise<ApkIdentity>;
  now?: () => Date;
};

export type PublicAndroidRelease =
  | { ok: true; published: false }
  | {
      ok: true;
      published: true;
      versionCode: number;
      versionName: string;
      releaseNotes: string;
      sizeBytes: number;
      releasedAt: string;
      effectiveOn: string;
      sha256: string;
      minSdk: number;
      downloadPath: typeof ANDROID_DOWNLOAD_PATH;
      banner: { enabled: boolean; title: string; body: string };
      update: { mode: UpdateMode; minimumVersionCode: number };
    };

const DEFAULT_SETTINGS: AndroidDownloadSettings = {
  bannerEnabled: false,
  bannerTitle: 'Nextpari для Android',
  bannerBody: 'Скачайте официальное приложение',
  updateMode: 'none',
  minimumVersionCode: 0,
};

export function artifactKeyFor(versionCode: number, sha256: string): string {
  return `${ANDROID_PACKAGE}/${versionCode}/${sha256}.apk`;
}

export function emptySettings(): AndroidDownloadSettings {
  return { ...DEFAULT_SETTINGS };
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertSignedDownloadUrl(raw: string, artifactKey: string, storageHost: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw staffError('APK_REDIRECT_UNTRUSTED', 502);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw staffError('APK_REDIRECT_UNTRUSTED', 502);
  if (!storageHost || url.host !== storageHost) throw staffError('APK_REDIRECT_UNTRUSTED', 502);
  if (/[\r\n]/.test(url.toString())) throw staffError('APK_REDIRECT_UNTRUSTED', 502);
  const path = decodeURIComponent(url.pathname);
  if (!path.includes(`/${artifactKey}`)) throw staffError('APK_REDIRECT_UNTRUSTED', 502);
  return url.toString();
}

function assertSha(value: string, code: string): string {
  const hex = value.trim().toLowerCase();
  if (!SHA256_HEX.test(hex)) throw staffError(code, 400);
  return hex;
}

function sameSha(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertDraftInput(input: {
  versionCode: unknown;
  versionName: unknown;
  releaseNotes: unknown;
  sha256: unknown;
  sizeBytes: unknown;
  minSdk: unknown;
  certificateSha256: unknown;
  effectiveOn: unknown;
  artifactUrl?: unknown;
}): Omit<AndroidReleaseRecord, 'artifactKey' | 'status' | 'publishedAt' | 'retiredAt'> {
  if (input.artifactUrl != null && String(input.artifactUrl).trim()) {
    throw staffError('ARTIFACT_URL_FORBIDDEN', 400);
  }
  const versionCode = input.versionCode;
  if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode < 2) {
    throw staffError('VERSION_CODE_INVALID', 400);
  }
  const versionName = String(input.versionName ?? '').trim();
  if (!VERSION_NAME.test(versionName) || versionName.includes('debug')) {
    throw staffError('VERSION_NAME_INVALID', 400);
  }
  const releaseNotes = String(input.releaseNotes ?? '').trim();
  if (!releaseNotes || releaseNotes.length > 4000) throw staffError('RELEASE_NOTES_INVALID', 400);
  const sha256 = assertSha(String(input.sha256 ?? ''), 'APK_SHA256_INVALID');
  const sizeBytes = input.sizeBytes;
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > ANDROID_MAX_APK_BYTES) {
    throw staffError('APK_SIZE_INVALID', 400);
  }
  const minSdk = input.minSdk == null ? ANDROID_MIN_SDK : input.minSdk;
  if (typeof minSdk !== 'number' || !Number.isInteger(minSdk) || minSdk < ANDROID_MIN_SDK || minSdk > 40) {
    throw staffError('MIN_SDK_INVALID', 400);
  }
  const certificateSha256 = assertSha(String(input.certificateSha256 ?? ''), 'CERT_SHA256_INVALID');
  const effectiveOn = String(input.effectiveOn ?? '').trim();
  if (!DAY.test(effectiveOn)) throw staffError('EFFECTIVE_DATE_INVALID', 400);
  return {
    versionCode,
    versionName,
    releaseNotes,
    sha256,
    sizeBytes,
    minSdk,
    certificateSha256,
    effectiveOn,
  };
}

export class AndroidReleaseService {
  constructor(private readonly ports: AndroidReleasePorts) {}

  async publicRelease(): Promise<PublicAndroidRelease> {
    const releases = await this.ports.repo.list();
    const current = releases.find((row) => row.status === 'published') ?? null;
    if (!current) return { ok: true, published: false };
    const settings = await this.ports.repo.settings();
    return {
      ok: true,
      published: true,
      versionCode: current.versionCode,
      versionName: current.versionName,
      releaseNotes: current.releaseNotes,
      sizeBytes: current.sizeBytes,
      releasedAt: current.publishedAt ?? current.effectiveOn,
      effectiveOn: current.effectiveOn,
      sha256: current.sha256,
      minSdk: current.minSdk,
      downloadPath: ANDROID_DOWNLOAD_PATH,
      banner: {
        enabled: settings.bannerEnabled,
        title: settings.bannerTitle,
        body: settings.bannerBody,
      },
      update: {
        mode: settings.updateMode,
        minimumVersionCode: settings.minimumVersionCode,
      },
    };
  }

  async ownerView(): Promise<{
    releases: AndroidReleaseRecord[];
    settings: AndroidDownloadSettings;
    storageReady: boolean;
    signingReady: boolean;
  }> {
    return {
      releases: await this.ports.repo.list(),
      settings: await this.ports.repo.settings(),
      storageReady: this.ports.artifacts.configured(),
      signingReady: Boolean(this.ports.certificateSha256),
    };
  }

  async createDraft(actorId: string, input: Parameters<typeof assertDraftInput>[0]): Promise<AndroidReleaseRecord> {
    const draft = assertDraftInput(input);
    this.assertCertificate(draft.certificateSha256);
    const releases = await this.ports.repo.list();
    if (releases.some((row) => row.versionCode === draft.versionCode)) {
      throw staffError('VERSION_EXISTS', 409);
    }
    const highest = Math.max(0, ...releases.map((row) => row.versionCode));
    if (draft.versionCode <= highest) throw staffError('VERSION_NOT_NEWER', 400);
    const row: AndroidReleaseRecord = {
      ...draft,
      artifactKey: artifactKeyFor(draft.versionCode, draft.sha256),
      status: 'draft',
      publishedAt: null,
      retiredAt: null,
    };
    await this.ports.repo.save(row);
    await this.audit(actorId, 'draft', row.versionCode);
    return row;
  }

  async publish(actorId: string, versionCode: number): Promise<AndroidReleaseRecord> {
    const releases = await this.ports.repo.list();
    const row = this.require(releases, versionCode);
    if (row.status === 'published') return row;
    if (row.status !== 'draft') throw staffError('RELEASE_NOT_DRAFT', 409);
    this.assertCertificate(row.certificateSha256);
    if (!this.ports.artifacts.configured()) throw staffError('ANDROID_RELEASE_STORAGE_UNAVAILABLE', 503);
    const bytes = await this.ports.artifacts.read(row.artifactKey);
    if (!bytes) throw staffError('APK_ARTIFACT_MISSING', 409);
    if (bytes.length !== row.sizeBytes) throw staffError('APK_SIZE_MISMATCH', 400);
    const actual = sha256Hex(bytes);
    if (!sameSha(actual, row.sha256)) throw staffError('APK_SHA256_MISMATCH', 400);
    const identity = await this.ports.verifyApk(bytes);
    if (!identity.schemeV2 && !identity.schemeV3) throw staffError('APK_SIGNATURE_INVALID', 400);
    if (identity.packageName === `${ANDROID_PACKAGE}.debug` || identity.packageName.endsWith('.debug')) {
      throw staffError('APK_DEBUG_PACKAGE', 400);
    }
    if (identity.packageName !== ANDROID_PACKAGE) throw staffError('APK_PACKAGE_MISMATCH', 400);
    if (identity.versionCode !== row.versionCode) throw staffError('APK_VERSION_CODE_MISMATCH', 400);
    if (!sameSha(identity.sha256, row.sha256)) throw staffError('APK_SHA256_MISMATCH', 400);
    if (!sameSha(identity.certificateSha256, row.certificateSha256)) throw staffError('CERT_SHA256_MISMATCH', 400);
    const now = (this.ports.now ?? (() => new Date()))().toISOString();
    for (const current of releases) {
      if (current.status === 'published') {
        await this.ports.repo.save({ ...current, status: 'superseded' });
      }
    }
    const published: AndroidReleaseRecord = { ...row, status: 'published', publishedAt: now, retiredAt: null };
    await this.ports.repo.save(published);
    await this.audit(actorId, 'publish', versionCode);
    return published;
  }

  async retire(actorId: string, versionCode: number): Promise<AndroidReleaseRecord> {
    const releases = await this.ports.repo.list();
    const row = this.require(releases, versionCode);
    if (row.status !== 'published') throw staffError('RELEASE_NOT_PUBLISHED', 409);
    const retired: AndroidReleaseRecord = {
      ...row,
      status: 'retired',
      retiredAt: (this.ports.now ?? (() => new Date()))().toISOString(),
    };
    await this.ports.repo.save(retired);
    const settings = await this.ports.repo.settings();
    if (settings.bannerEnabled) {
      await this.ports.repo.saveSettings({ ...settings, bannerEnabled: false });
    }
    await this.audit(actorId, 'retire', versionCode);
    return retired;
  }

  async rollback(actorId: string): Promise<AndroidReleaseRecord> {
    const releases = await this.ports.repo.list();
    const current = releases.find((row) => row.status === 'published');
    if (!current) throw staffError('RELEASE_NOT_PUBLISHED', 409);
    const previous = releases
      .filter((row) => row.status === 'superseded')
      .sort((a, b) => b.versionCode - a.versionCode)[0];
    if (!previous) throw staffError('ROLLBACK_UNAVAILABLE', 409);
    const now = (this.ports.now ?? (() => new Date()))().toISOString();
    await this.ports.repo.save({ ...current, status: 'retired', retiredAt: now });
    const restored: AndroidReleaseRecord = { ...previous, status: 'published', retiredAt: null };
    await this.ports.repo.save(restored);
    await this.audit(actorId, 'rollback', restored.versionCode);
    return restored;
  }

  async updateBanner(
    actorId: string,
    input: { enabled: unknown; title: unknown; body: unknown },
  ): Promise<AndroidDownloadSettings> {
    const title = String(input.title ?? '').trim();
    const body = String(input.body ?? '').trim();
    if (!title || title.length > 80 || !body || body.length > 160) {
      throw staffError('BANNER_TEXT_INVALID', 400);
    }
    const enabled = input.enabled === true;
    if (enabled) {
      const published = (await this.ports.repo.list()).some((row) => row.status === 'published');
      if (!published) throw staffError('BANNER_REQUIRES_PUBLISHED_RELEASE', 409);
    }
    const next: AndroidDownloadSettings = { ...(await this.ports.repo.settings()), bannerEnabled: enabled, bannerTitle: title, bannerBody: body };
    await this.ports.repo.saveSettings(next);
    await this.audit(actorId, enabled ? 'banner_on' : 'banner_off', null);
    return next;
  }

  async updatePolicy(
    actorId: string,
    input: { mode: unknown; minimumVersionCode: unknown },
  ): Promise<AndroidDownloadSettings> {
    if (input.mode === 'forced') throw staffError('FORCED_UPDATE_FORBIDDEN', 400);
    if (input.mode !== 'none' && input.mode !== 'recommended') throw staffError('UPDATE_MODE_INVALID', 400);
    const minimumVersionCode = input.minimumVersionCode;
    if (typeof minimumVersionCode !== 'number' || !Number.isInteger(minimumVersionCode) || minimumVersionCode < 0) {
      throw staffError('MINIMUM_VERSION_INVALID', 400);
    }
    const published = (await this.ports.repo.list()).filter((row) => row.status === 'published');
    const current = published[0]?.versionCode ?? 0;
    if (minimumVersionCode > current) throw staffError('MINIMUM_VERSION_ABOVE_PUBLISHED', 400);
    const next: AndroidDownloadSettings = {
      ...(await this.ports.repo.settings()),
      updateMode: input.mode,
      minimumVersionCode,
    };
    await this.ports.repo.saveSettings(next);
    await this.audit(actorId, 'policy', current || null);
    return next;
  }

  async downloadRedirect(): Promise<{ location: string }> {
    const current = (await this.ports.repo.list()).find((row) => row.status === 'published');
    if (!current || !this.ports.artifacts.configured()) throw staffError('ANDROID_RELEASE_UNPUBLISHED', 404);
    const signed = await this.ports.artifacts.signedDownloadUrl(current.artifactKey);
    if (!signed) throw staffError('ANDROID_RELEASE_UNPUBLISHED', 404);
    return { location: assertSignedDownloadUrl(signed, current.artifactKey, this.ports.storageHost) };
  }

  private assertCertificate(presented: string): void {
    const expected = this.ports.certificateSha256;
    if (!expected) throw staffError('ANDROID_RELEASE_SIGNING_UNCONFIGURED', 503);
    if (!sameSha(assertSha(expected, 'CERT_SHA256_INVALID'), presented)) {
      throw staffError('CERT_SHA256_MISMATCH', 400);
    }
  }

  private require(releases: AndroidReleaseRecord[], versionCode: number): AndroidReleaseRecord {
    const row = releases.find((item) => item.versionCode === versionCode);
    if (!row) throw staffError('RELEASE_NOT_FOUND', 404);
    return row;
  }

  private async audit(actorId: string, action: string, versionCode: number | null): Promise<void> {
    await this.ports.repo.audit({
      at: (this.ports.now ?? (() => new Date()))().toISOString(),
      actorId,
      action,
      versionCode,
    });
  }
}

export class MemoryAndroidReleaseRepository implements AndroidReleaseRepository {
  readonly audits: AndroidReleaseAudit[] = [];

  constructor(
    private releases: AndroidReleaseRecord[] = [],
    private current: AndroidDownloadSettings = emptySettings(),
  ) {}

  async list(): Promise<AndroidReleaseRecord[]> {
    return this.releases.map((row) => ({ ...row }));
  }

  async settings(): Promise<AndroidDownloadSettings> {
    return { ...this.current };
  }

  async save(release: AndroidReleaseRecord): Promise<void> {
    const index = this.releases.findIndex((row) => row.versionCode === release.versionCode);
    if (index >= 0) this.releases[index] = { ...release };
    else this.releases.push({ ...release });
  }

  async saveSettings(settings: AndroidDownloadSettings): Promise<void> {
    this.current = { ...settings };
  }

  async audit(entry: AndroidReleaseAudit): Promise<void> {
    this.audits.push({ ...entry });
  }
}

export class MemoryArtifactStore implements AndroidArtifactStore {
  private readonly objects = new Map<string, Buffer>();

  constructor(private readonly ready: boolean) {}

  configured(): boolean {
    return this.ready;
  }

  put(key: string, bytes: Buffer): void {
    this.objects.set(key, Buffer.from(bytes));
  }

  async read(key: string): Promise<Buffer | null> {
    const found = this.objects.get(key);
    return found ? Buffer.from(found) : null;
  }

  async signedDownloadUrl(key: string): Promise<string | null> {
    if (!this.ready || !this.objects.has(key)) return null;
    return `https://storage.nextpari.test/storage/v1/object/sign/android-releases/${key}?token=temp`;
  }
}
