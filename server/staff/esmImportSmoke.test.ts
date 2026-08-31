import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const RUNTIME_GRAPH = [
  'api/owner/staff/manager.ts',
  'api/owner/staff/cashier.ts',
  'api/owner/auth/login.ts',
  'api/owner/auth/session.ts',
  'api/owner/auth/logout.ts',
  'api/manager/auth/login.ts',
  'api/manager/auth/session.ts',
  'api/manager/auth/logout.ts',
  'api/cashier/auth/login.ts',
  'api/cashier/auth/session.ts',
  'api/cashier/auth/logout.ts',
  'api/owner/dashboard.ts',
  'api/owner/me.ts',
  'api/owner/cashiers.ts',
  'api/owner/risk-bets.ts',
  'api/owner/players.ts',
  'api/owner/withdrawals.ts',
  'api/owner/messages.ts',
  'api/manager/me.ts',
  'api/manager/dashboard.ts',
  'api/manager/cashiers.ts',
  'api/manager/risk-bets.ts',
  'api/manager/players.ts',
  'api/manager/messages.ts',
  'api/manager/finance.ts',
  'api/manager/transfers.ts',
  'api/cashier/me.ts',
  'api/cashier/finance.ts',
  'api/cashier/transfers.ts',
  'server/staff/vercelHandler.ts',
  'server/staff/httpHandler.ts',
  'server/staff/ownerAuthHttp.ts',
  'server/staff/ownerAuthService.ts',
  'server/staff/ownerCookies.ts',
  'server/staff/ownerContext.ts',
  'server/staff/managerAuthHttp.ts',
  'server/staff/managerAuthService.ts',
  'server/staff/managerCookies.ts',
  'server/staff/managerContext.ts',
  'server/staff/cashierAuthHttp.ts',
  'server/staff/cashierAuthService.ts',
  'server/staff/cashierCookies.ts',
  'server/staff/cashierContext.ts',
  'server/staff/staffOnboardingService.ts',
  'server/staff/staffAuthAdmin.ts',
  'server/staff/env.ts',
  'server/staff/errors.ts',
  'server/staff/types.ts',
  'server/owner/ownerRpc.ts',
  'server/owner/ownerControlHttp.ts',
  'server/owner/vercelHandler.ts',
  'server/manager/managerRpc.ts',
  'server/manager/managerControlHttp.ts',
  'server/manager/vercelHandler.ts',
  'server/cashier/cashierRpc.ts',
  'server/cashier/cashierControlHttp.ts',
  'server/cashier/vercelHandler.ts',
  'server/supabase/admin.ts',
] as const;

const EXTENSIONLESS_RELATIVE =
  /from\s+['"](\.\.?\/[^'"]+?)(?<!\.js)['"]|import\s*\(\s*['"](\.\.?\/[^'"]+?)(?<!\.js)['"]\s*\)/;

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('staff onboarding Node ESM import graph', () => {
  it('runtime sources use explicit .js relative specifiers', () => {
    const files = [
      ...listTsFiles(join(root, 'api')),
      ...listTsFiles(join(root, 'server/staff')),
      ...listTsFiles(join(root, 'server/owner')),
      ...listTsFiles(join(root, 'server/manager')),
      ...listTsFiles(join(root, 'server/cashier')),
      join(root, 'server/supabase/admin.ts'),
    ].filter((path) => !path.endsWith('.test.ts'));

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const match = source.match(EXTENSIONLESS_RELATIVE);
      assert.equal(
        match,
        null,
        `${file} has extensionless relative import: ${match?.[0] ?? ''}`,
      );
    }
  });

  it('compiled serverless entries load in Node ESM without ERR_MODULE_NOT_FOUND', () => {
    const outDir = join(root, '.tmp', 'staff-esm-smoke');
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    try {
      for (const rel of RUNTIME_GRAPH) {
        const source = readFileSync(join(root, rel), 'utf8');
        const { outputText } = transpileModule(source, {
          compilerOptions: {
            module: ModuleKind.ESNext,
            target: ScriptTarget.ES2022,
            isolatedModules: true,
          },
          fileName: rel,
          reportDiagnostics: false,
        });
        const outFile = join(outDir, rel.replace(/\.ts$/, '.js'));
        mkdirSync(dirname(outFile), { recursive: true });
        writeFileSync(outFile, outputText);
      }

      const staffEntries = ['api/owner/staff/manager.js', 'api/owner/staff/cashier.js'];
      const authEntries = [
        'api/owner/auth/login.js',
        'api/owner/auth/session.js',
        'api/owner/auth/logout.js',
        'api/manager/auth/login.js',
        'api/manager/auth/session.js',
        'api/manager/auth/logout.js',
        'api/cashier/auth/login.js',
        'api/cashier/auth/session.js',
        'api/cashier/auth/logout.js',
      ];
      const controlEntries = [
        'api/owner/dashboard.js',
        'api/owner/me.js',
        'api/owner/cashiers.js',
        'api/owner/risk-bets.js',
        'api/owner/players.js',
        'api/owner/withdrawals.js',
        'api/owner/messages.js',
      ];
      const managerControlEntries = [
        'api/manager/me.js',
        'api/manager/dashboard.js',
        'api/manager/cashiers.js',
        'api/manager/risk-bets.js',
        'api/manager/players.js',
        'api/manager/messages.js',
        'api/manager/finance.js',
        'api/manager/transfers.js',
      ];
      const cashierControlEntries = [
        'api/cashier/me.js',
        'api/cashier/finance.js',
        'api/cashier/transfers.js',
      ];

      for (const rel of staffEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/\.\.\/server\/staff\/httpHandler\.js['"]/);
        assert.match(compiled, /from ['"]\.\.\/\.\.\/\.\.\/server\/staff\/vercelHandler\.js['"]/);
      }

      for (const rel of controlEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/server\/owner\/vercelHandler\.js['"]/);
      }

      for (const rel of managerControlEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/server\/manager\/vercelHandler\.js['"]/);
      }

      for (const rel of cashierControlEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/server\/cashier\/vercelHandler\.js['"]/);
      }

      for (const rel of [...staffEntries, ...authEntries, ...controlEntries, ...managerControlEntries, ...cashierControlEntries]) {
        const fileUrl = pathToFileURL(join(outDir, rel)).href;
        const loaded = spawnSync(
          process.execPath,
          ['--input-type=module', '-e', `await import(${JSON.stringify(fileUrl)})`],
          { cwd: root, encoding: 'utf8' },
        );
        assert.equal(
          loaded.status,
          0,
          `${rel} failed to load:\n${loaded.stdout}\n${loaded.stderr}`,
        );
        assert.equal(loaded.stderr.includes('ERR_MODULE_NOT_FOUND'), false, loaded.stderr);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
