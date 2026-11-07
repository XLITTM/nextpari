import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const entry = join(root, 'api/rixobet/office/v1.js');
const bundle = join(root, 'api/rixobet/office/bundle.js');

function safeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/RYXOBET|DATABASE|SECRET|TOKEN|KEY|PASSWORD|POSTGRES|SUPABASE|SERVICE/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}

describe('compiled office function', () => {
  it('loads the bundled serverless entry in Node and returns JSON', () => {
    const built = spawnSync(process.execPath, ['scripts/bundle-office-function.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: safeEnv(),
    });
    expect(built.status).toBe(0);

    const source = readFileSync(bundle, 'utf8');
    expect(/from\s+['"][^'"]*server\/vercel['"]/.test(source)).toBe(false);
    expect(/from\s+['"]\.\/vercel['"]/.test(source)).toBe(false);
    expect(source.includes('export{serveOfficeApi') || source.includes('serveOfficeApi')).toBe(true);

    const probe = `
      import { pathToFileURL } from 'node:url';
      const mod = await import(pathToFileURL(process.env.OFFICE_FN_ENTRY).href);
      const sink = {
        statusCode: 0,
        headers: {},
        body: '',
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = JSON.stringify(payload); },
      };
      await mod.default({ method: 'GET', url: '/api/rixobet/office/v1?rixo_path=/auth/session', headers: {} }, sink);
      if (sink.statusCode !== 503) throw new Error('status ' + sink.statusCode + ' ' + sink.body);
      const parsed = JSON.parse(sink.body);
      if (parsed.status !== 'unavailable' || parsed.diagnostic !== 'missing_database') throw new Error(sink.body);
      if (sink.body.includes('postgresql://') || sink.body.includes('<html')) throw new Error('unsafe body');
      if (!String(sink.headers['content-type']).includes('application/json')) throw new Error('content type');
    `;
    const ran = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: root,
      encoding: 'utf8',
      env: { ...safeEnv(), OFFICE_FN_ENTRY: entry },
    });
    expect(ran.status, `${ran.stdout}\n${ran.stderr}`).toBe(0);
  });
});
