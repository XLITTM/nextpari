import { readOfficeConfig, type ConfigRejection } from './env';
import { handleOffice, officeFor, type OfficeRequest, type OfficeResponse } from './handler';
import { openPostgresOffice } from './postgres';
import type { OfficeRepository } from './repository';

export type OfficeHandler = (request: OfficeRequest) => Promise<OfficeResponse>;

const CATALOG_REASONS = ['schema', 'table_count', 'rls', 'staff', 'sessions', 'challenges', 'flags'] as const;

export type OfficeDiagnostic = ConfigRejection | `catalog_${(typeof CATALOG_REASONS)[number]}` | 'database_role' | 'database_tls' | 'database_auth' | 'database_network' | 'database_permissions' | 'database_name' | 'database_pooler' | 'database_unavailable';

export function safeDatabaseDiagnostic(error: unknown): OfficeDiagnostic {
  const message = error instanceof Error ? error.message : '';
  if (message === 'DATABASE_ROLE_FORBIDDEN' || message === 'DATABASE_TARGET_FORBIDDEN') return 'database_role';
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED'].includes(code)) return 'database_tls';
  if (code === '28P01' || code === '28000') return 'database_auth';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) return 'database_network';
  if (code === '42501') return 'database_permissions';
  if (code === '3D000') return 'database_name';
  if (code === 'XX000' && message.includes('Tenant or user not found')) return 'database_pooler';
  if (message.startsWith('CATALOG_')) {
    const reason = message.slice('CATALOG_'.length);
    if ((CATALOG_REASONS as readonly string[]).includes(reason)) return `catalog_${reason}` as OfficeDiagnostic;
  }
  return 'database_unavailable';
}

export function createProductionHandler(env: Readonly<Record<string, string | undefined>> = process.env): OfficeHandler {
  const config = readOfficeConfig(env);
  if (!config.ok) return (request) => handleOffice(request, null, config.reason);
  let opening: Promise<OfficeRepository | null> | null = null;
  let diagnostic: OfficeDiagnostic = 'database_unavailable';
  return async (request) => {
    opening ??= openPostgresOffice(config.config).catch((error: unknown) => {
      diagnostic = safeDatabaseDiagnostic(error);
      return null;
    });
    const repository = await opening;
    if (!repository) return handleOffice(request, null, diagnostic);
    return handleOffice(request, officeFor(repository, config.config.sessionPepper));
  };
}
