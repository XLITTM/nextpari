import { createServiceRoleClient } from '../supabase/admin.js';
import { staffError } from '../staff/errors.js';
import {
  emptySettings,
  type AndroidArtifactStore,
  type AndroidDownloadSettings,
  type AndroidReleaseAudit,
  type AndroidReleasePorts,
  type AndroidReleaseRecord,
  type AndroidReleaseRepository,
  type ReleaseStatus,
  type UpdateMode,
} from './androidRelease.js';

function serviceClient() {
  const url = process.env.SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url.trim() || !key.trim()) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
  return createServiceRoleClient(url, key);
}

function asRelease(row: Record<string, unknown>): AndroidReleaseRecord {
  return {
    versionCode: Number(row.version_code),
    versionName: String(row.version_name ?? ''),
    releaseNotes: String(row.release_notes ?? ''),
    sha256: String(row.sha256 ?? ''),
    sizeBytes: Number(row.size_bytes),
    minSdk: Number(row.min_sdk),
    artifactKey: String(row.artifact_key ?? ''),
    certificateSha256: String(row.certificate_sha256 ?? ''),
    effectiveOn: String(row.effective_on ?? ''),
    status: String(row.status ?? 'draft') as ReleaseStatus,
    publishedAt: row.published_at == null ? null : String(row.published_at),
    retiredAt: row.retired_at == null ? null : String(row.retired_at),
  };
}

export class SupabaseAndroidReleaseRepository implements AndroidReleaseRepository {
  async list(): Promise<AndroidReleaseRecord[]> {
    const db = serviceClient();
    const { data, error } = await db.from('android_app_releases').select('*').order('version_code', { ascending: false });
    if (error) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
    return (data ?? []).map((row) => asRelease(row as Record<string, unknown>));
  }

  async settings(): Promise<AndroidDownloadSettings> {
    const db = serviceClient();
    const { data, error } = await db.from('android_download_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
    if (!data) return emptySettings();
    const row = data as Record<string, unknown>;
    return {
      bannerEnabled: row.banner_enabled === true,
      bannerTitle: String(row.banner_title ?? emptySettings().bannerTitle),
      bannerBody: String(row.banner_body ?? emptySettings().bannerBody),
      updateMode: (row.update_mode === 'recommended' ? 'recommended' : 'none') as UpdateMode,
      minimumVersionCode: Number(row.minimum_version_code ?? 0),
    };
  }

  async save(release: AndroidReleaseRecord): Promise<void> {
    const db = serviceClient();
    const { error } = await db.from('android_app_releases').upsert({
      version_code: release.versionCode,
      version_name: release.versionName,
      release_notes: release.releaseNotes,
      sha256: release.sha256,
      size_bytes: release.sizeBytes,
      min_sdk: release.minSdk,
      artifact_key: release.artifactKey,
      certificate_sha256: release.certificateSha256,
      effective_on: release.effectiveOn,
      status: release.status,
      published_at: release.publishedAt,
      retired_at: release.retiredAt,
    }, { onConflict: 'version_code' });
    if (error) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
  }

  async saveSettings(settings: AndroidDownloadSettings): Promise<void> {
    const db = serviceClient();
    const { error } = await db.from('android_download_settings').upsert({
      id: 1,
      banner_enabled: settings.bannerEnabled,
      banner_title: settings.bannerTitle,
      banner_body: settings.bannerBody,
      update_mode: settings.updateMode,
      minimum_version_code: settings.minimumVersionCode,
      updated_at: new Date().toISOString(),
    });
    if (error) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
  }

  async audit(entry: AndroidReleaseAudit): Promise<void> {
    const db = serviceClient();
    const { error } = await db.from('android_app_release_audit').insert({
      at: entry.at,
      actor_id: entry.actorId,
      action: entry.action,
      version_code: entry.versionCode,
    });
    if (error) throw staffError('ANDROID_RELEASE_STORE_NOT_READY', 503);
  }
}

export class SupabaseAndroidArtifactStore implements AndroidArtifactStore {
  configured(): boolean {
    return Boolean(process.env.ANDROID_RELEASE_BUCKET?.trim());
  }

  async read(key: string): Promise<Buffer | null> {
    const bucket = process.env.ANDROID_RELEASE_BUCKET?.trim();
    if (!bucket || key.includes('..') || key.startsWith('/') || key.includes('://')) return null;
    const db = serviceClient();
    const { data, error } = await db.storage.from(bucket).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
}

export function productionAndroidReleasePorts(): AndroidReleasePorts {
  const fingerprint = process.env.ANDROID_RELEASE_CERT_SHA256?.trim().toLowerCase() || null;
  return {
    repo: new SupabaseAndroidReleaseRepository(),
    artifacts: new SupabaseAndroidArtifactStore(),
    certificateSha256: fingerprint,
  };
}
