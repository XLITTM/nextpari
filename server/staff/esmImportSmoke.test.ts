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
  'server/staff/vercelHandler.ts',
  'server/staff/httpHandler.ts',
  'server/staff/staffOnboardingService.ts',
  'server/staff/staffAuthAdmin.ts',
  'server/staff/env.ts',
  'server/staff/errors.ts',
  'server/staff/types.ts',
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
      ...listTsFiles(join(root, 'api/owner/staff')),
      ...listTsFiles(join(root, 'server/staff')),
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

      for (const entry of ['manager.js', 'cashier.js']) {
        const compiled = readFileSync(join(outDir, 'api/owner/staff', entry), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/\.\.\/server\/staff\/httpHandler\.js['"]/);
        assert.match(compiled, /from ['"]\.\.\/\.\.\/\.\.\/server\/staff\/vercelHandler\.js['"]/);
        assert.equal(compiled.includes("from '../../../server/staff/httpHandler';"), false);
        assert.equal(compiled.includes("from '../../../server/staff/vercelHandler';"), false);

        const fileUrl = pathToFileURL(join(outDir, 'api/owner/staff', entry)).href;
        const loaded = spawnSync(
          process.execPath,
          ['--input-type=module', '-e', `await import(${JSON.stringify(fileUrl)})`],
          { cwd: root, encoding: 'utf8' },
        );
        assert.equal(
          loaded.status,
          0,
          `${entry} failed to load:\n${loaded.stdout}\n${loaded.stderr}`,
        );
        assert.equal(loaded.stderr.includes('ERR_MODULE_NOT_FOUND'), false, loaded.stderr);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
