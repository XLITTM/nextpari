import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTH_TABLES } from './catalog';
import { isOfficeApiPath, serveOfficeApi } from './vercel';

describe('office API routing', () => {
  it('keeps the Vercel rewrite away from the office API', () => {
    const root = join(import.meta.dirname, '..');
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
    };
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
    expect(body.includes('<html')).toBe(false);
  });
});
