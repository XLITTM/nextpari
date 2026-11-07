import { describe, expect, it } from 'vitest';
import { safeDatabaseDiagnostic } from './production';

describe('safe office database diagnostics', () => {
  it.each([
    ['SELF_SIGNED_CERT_IN_CHAIN', 'database_tls'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'database_tls'],
    ['CERT_HAS_EXPIRED', 'database_tls'],
    ['28P01', 'database_auth'],
    ['28000', 'database_auth'],
    ['ENOTFOUND', 'database_network'],
    ['ECONNREFUSED', 'database_network'],
    ['ETIMEDOUT', 'database_network'],
    ['42501', 'database_permissions'],
    ['3D000', 'database_name'],
  ])('maps %s to a fixed non-secret code', (code, expected) => {
    const error = Object.assign(new Error('postgresql://fixture:fixture@private.example/db?token=fixture'), { code });
    expect(safeDatabaseDiagnostic(error)).toBe(expected);
  });

  it('recognizes a pooler routing error without exposing its message', () => {
    expect(safeDatabaseDiagnostic(Object.assign(new Error('Tenant or user not found'), { code: 'XX000' }))).toBe('database_pooler');
  });

  it('does not reflect arbitrary database error messages or codes', () => {
    expect(safeDatabaseDiagnostic(Object.assign(new Error('private connection details'), { code: 'PRIVATE_CODE' }))).toBe('database_unavailable');
    expect(safeDatabaseDiagnostic('private connection details')).toBe('database_unavailable');
    expect(safeDatabaseDiagnostic(new Error('CATALOG_private_value'))).toBe('database_unavailable');
  });
});
