import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTH_TABLES, OPERATIONAL_FLAGS } from './catalog';
import { handleOffice, officeFor } from './handler';
import { createMemoryOffice } from './memory';
import { safeDatabaseDiagnostic } from './production';
import { isOfficeApiPath, resolveOfficeApiPath, serveOfficeApi } from './vercel';

describe('office API routing', () => {
  it('keeps the Vercel rewrite away from the office API', () => {
    const root = join(import.meta.dirname, '..');
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      functions?: Record<string, { maxDuration?: number }>;
      rewrites: { source: string; destination: string }[];
    };
    const api = config.rewrites[0];
    expect(api?.source).toBe('/api/rixobet/office/v1/:path*');
    expect(api?.destination).toBe('/api/rixobet/office/v1?rixo_path=/:path*');
    expect(config.functions?.['api/rixobet/office/v1.ts']?.maxDuration).toBe(15);
    expect(existsSync(join(root, 'api/rixobet/office/v1.ts'))).toBe(true);
    expect(existsSync(join(root, 'api/rixobet/office/v1/[[...path]].ts'))).toBe(false);
    const entry = readFileSync(join(root, 'api/rixobet/office/v1.ts'), 'utf8');
    expect(entry.includes('serveOfficeApi')).toBe(true);
    expect(entry.includes('[[...path]]')).toBe(false);
    const spa = config.rewrites.find((rewrite) => rewrite.destination === '/index.html');
    expect(spa?.source).toBe('/((?!api/).*)');
    expect(isOfficeApiPath('/api/rixobet/office/v1/auth/login')).toBe(true);
    expect(isOfficeApiPath('/login')).toBe(false);
    const sql = readFileSync(join(root, 'server/postgres.ts'), 'utf8');
    const catalog = readFileSync(join(root, 'server/catalog.ts'), 'utf8');
    for (const name of Object.values(AUTH_TABLES)) expect(catalog.includes(`'${name}'`)).toBe(true);
    expect(sql.includes('invitation_expires_at')).toBe(true);
    expect(sql.includes('invitation_consumed_at is null')).toBe(true);
    expect(sql.includes('mfa_satisfied')).toBe(true);
    expect(sql.includes('consumed_at is null')).toBe(true);
    expect(sql.includes("st.status = 'active'")).toBe(true);
    expect(sql.includes('auth_user_id =')).toBe(false);
  });

  it('returns JSON instead of the Vite page when database credentials are absent', async () => {
    const headers = new Map<string, string | string[]>();
    let status = 0;
    let body = '';
    await serveOfficeApi(
      { method: 'POST', url: '/api/rixobet/office/v1/auth/login', headers: {}, body: { brandCode: '002' } },
      {
        setHeader(name, value) {
          headers.set(name, value);
        },
        status(code) {
          status = code;
          return this;
        },
        json(payload) {
          body = JSON.stringify(payload);
        },
      },
    );
    expect(status).toBe(503);
    expect(headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(body).toContain('"status":"unavailable"');
    expect(body).toContain('"diagnostic":"missing_database"');
    expect(body.includes('<html')).toBe(false);
    expect(body.includes('postgresql://')).toBe(false);
    expect(body.includes('RYXOBET_OFFICE_DATABASE_URL')).toBe(false);
  });

  it('maps a rewritten session request to JSON and keeps diagnostics free of credentials', async () => {
    expect(resolveOfficeApiPath('/api/rixobet/office/v1/auth/session')).toBe('/api/rixobet/office/v1/auth/session');
    expect(resolveOfficeApiPath('/api/rixobet/office/v1?rixo_path=/auth/session')).toBe('/api/rixobet/office/v1/auth/session');
    expect(resolveOfficeApiPath('/api/rixobet/office/v1?rixo_path=//evil.example')).toBe('/api/rixobet/office/v1');
    expect(resolveOfficeApiPath('/api/rixobet/office/v1?rixo_path=/../owner')).toBe('/api/rixobet/office/v1');
    expect(
      resolveOfficeApiPath('/api/rixobet/office/v1', { 'x-forwarded-uri': '/api/rixobet/office/v1/auth/session' }),
    ).toBe('/api/rixobet/office/v1/auth/session');

    const repository = createMemoryOffice({
      staff: [],
      flags: OPERATIONAL_FLAGS.map((key) => ({ key, brandCode: '002', enabled: false })),
    });
    const session = await handleOffice(
      {
        method: 'GET',
        path: resolveOfficeApiPath('/api/rixobet/office/v1?rixo_path=/auth/session'),
        headers: {},
        body: {},
      },
      officeFor(repository, 'rixo-office-session-pepper-32bytes', () => Date.parse('2026-11-07T12:00:00.000Z'), true),
    );
    expect(session.status).toBe(401);
    expect(session.body).toMatchObject({ brandCode: '002', accepted: false });
    expect(JSON.stringify(session.body).includes('<html')).toBe(false);

    expect(safeDatabaseDiagnostic(new Error('DATABASE_ROLE_FORBIDDEN'))).toBe('database_role');
    expect(safeDatabaseDiagnostic(new Error('CATALOG_staff'))).toBe('catalog_staff');
    expect(safeDatabaseDiagnostic(new Error('connect ECONNREFUSED postgresql://secret@db/postgres'))).toBe(
      'database_unavailable',
    );
  });
});
