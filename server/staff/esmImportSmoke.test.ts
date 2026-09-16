import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
  'api/player/auth/login.ts',
  'api/player/auth/register.ts',
  'api/player/auth/logout.ts',
  'api/player/auth/change-password.ts',
  'api/player/email/start.ts',
  'api/player/email/verify.ts',
  'api/player/password-recovery/start.ts',
  'api/player/password-recovery/verify.ts',
  'api/player/password-recovery/reset.ts',
  'api/player/me.ts',
  'api/player/wallet.ts',
  'api/player/profile.ts',
  'api/player/personal-data.ts',
  'api/player/wallets.ts',
  'api/player/wallets/add.ts',
  'api/player/wallets/active.ts',
  'api/player/crypto/usdt-targets.ts',
  'api/player/crypto/usdt-quote.ts',
  'api/player/games/start.ts',
  'api/player/games/session/aviator.ts',
  'api/player/games/[roundId].ts',
  'api/player/games/[roundId]/action.ts',
  'api/player/sports/place.ts',
  'api/player/sports/bets.ts',
  'api/player/withdrawals.ts',
  'api/owner/withdrawals/[withdrawalId]/approve.ts',
  'api/owner/withdrawals/[withdrawalId]/reject.ts',
  'api/owner/withdrawals/[withdrawalId]/paid.ts',
  'api/internal/sports/settle.ts',
  'api/owner/dashboard.ts',
  'api/owner/me.ts',
  'api/owner/cashiers.ts',
  'api/owner/cashiers/[cashierId]/currencies.ts',
  'api/owner/risk-bets.ts',
  'api/owner/players.ts',
  'api/owner/withdrawals.ts',
  'api/owner/messages.ts',
  'api/owner/managers.ts',
  'api/owner/managers/[managerId].ts',
  'api/owner/managers/[managerId]/currencies.ts',
  'api/owner/treasury.ts',
  'api/owner/treasury/capital-in.ts',
  'api/owner/usdt-rates.ts',
  'api/owner/fund.ts',
  'api/owner/fund/currency.ts',
  'api/owner/games/report.ts',
  'api/owner/players/[playerId]/debit.ts',
  'api/owner/security/overview.ts',
  'api/owner/security/flags.ts',
  'api/owner/security/flags/[flagId]/resolve.ts',
  'api/owner/security/win-pattern-settings.ts',
  'api/owner/players/[playerId]/security.ts',
  'api/owner/players/[playerId]/personal-data.ts',
  'api/owner/players/[playerId]/win-pattern-evaluate.ts',
  'api/owner/security-staff.ts',
  'api/owner/security-staff/activity.ts',
  'api/owner/security-staff/[authUserId]/status.ts',
  'api/owner/security-staff/[authUserId]/reset-password.ts',
  'api/security/auth/login.ts',
  'api/security/auth/me.ts',
  'api/security/auth/logout.ts',
  'api/security/overview.ts',
  'api/security/flags.ts',
  'api/security/win-pattern-settings.ts',
  'api/security/activity.ts',
  'api/security/flags/[flagId]/review.ts',
  'api/security/flags/[flagId]/resolve.ts',
  'api/security/flags/[flagId]/dismiss.ts',
  'api/security/players/[playerId].ts',
  'api/security/players/[playerId]/security-restriction.ts',
  'api/security/players/[playerId]/personal-data.ts',
  'api/security/players/[playerId]/win-pattern-evaluate.ts',
  'api/security/players/[playerId]/sports.ts',
  'api/security/players/[playerId]/sports/summary.ts',
  'api/security/players/[playerId]/sports/[betId].ts',
  'api/manager/me.ts',
  'api/manager/dashboard.ts',
  'api/manager/cashiers.ts',
  'api/manager/cashiers/[cashierId]/currencies.ts',
  'api/manager/risk-bets.ts',
  'api/manager/players.ts',
  'api/manager/messages.ts',
  'api/manager/finance.ts',
  'api/manager/transfers.ts',
  'api/cashier/me.ts',
  'api/cashier/finance.ts',
  'api/cashier/transfers.ts',
  'api/cashier/deposits.ts',
  'api/cashier/deposits/[transferId]/reverse.ts',
  'api/cashier/payouts/[code].ts',
  'api/cashier/payouts/[code]/confirm.ts',
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
  'server/staff/securityAuthHttp.ts',
  'server/staff/securityAuthService.ts',
  'server/staff/securityCookies.ts',
  'server/staff/securityContext.ts',
  'server/player/playerAuthHttp.ts',
  'server/player/playerAuthService.ts',
  'server/player/playerCookies.ts',
  'server/player/playerValidators.ts',
  'server/player/vercelGamesHandler.ts',
  'server/player/playerGamesHttp.ts',
  'server/player/playerGamesService.ts',
  'server/player/playerGameRpc.ts',
  'server/games/httpCache.ts',
  'server/staff/staffOnboardingService.ts',
  'server/staff/staffHierarchyService.ts',
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
  'server/cashier/cashierPayoutRateLimit.ts',
  'server/cashier/vercelHandler.ts',
  'server/security/securityRpc.ts',
  'server/security/securityControlHttp.ts',
  'server/security/vercelHandler.ts',
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

function toPosix(rel: string): string {
  return rel.replaceAll('\\', '/');
}

function resolveImportedSource(fromRel: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = join(dirname(join(root, fromRel)), specifier);
  const noJs = resolved.replace(/\.js$/i, '');
  const candidates = [`${noJs}.ts`, `${noJs}.tsx`, `${noJs}.js`, join(noJs, 'index.ts')];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const rel = toPosix(candidate.slice(root.length + 1));
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return null;
    return rel;
  }
  return null;
}

function collectRuntimeGraph(entryRels: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entryRels];
  while (queue.length) {
    const rel = toPosix(queue.pop()!);
    if (seen.has(rel)) continue;
    seen.add(rel);
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, 'utf8');
    const matches = [
      ...source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g),
      ...source.matchAll(/import\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g),
    ];
    for (const match of matches) {
      const spec = match[1];
      const idx = match.index ?? 0;
      const lineStart = source.lastIndexOf('\n', idx) + 1;
      const lineEnd = source.indexOf('\n', idx);
      const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
      if (/\bimport\s+type\b/.test(line) || /\bexport\s+type\s+\{/.test(line)) continue;
      const next = resolveImportedSource(rel, spec);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

describe('staff onboarding Node ESM import graph', () => {
  it('runtime sources use explicit .js relative specifiers', () => {
    const files = [
      ...listTsFiles(join(root, 'api')),
      ...listTsFiles(join(root, 'server/staff')),
      ...listTsFiles(join(root, 'server/player')),
      ...listTsFiles(join(root, 'server/owner')),
      ...listTsFiles(join(root, 'server/manager')),
      ...listTsFiles(join(root, 'server/cashier')),
      ...listTsFiles(join(root, 'server/security')),
      ...listTsFiles(join(root, 'server/auth')),
      ...(existsSync(join(root, 'server/email')) ? listTsFiles(join(root, 'server/email')) : []),
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
      for (const rel of collectRuntimeGraph(RUNTIME_GRAPH)) {
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
        'api/security/auth/login.js',
        'api/security/auth/me.js',
        'api/security/auth/logout.js',
      ];
      const playerAuthEntries = [
        'api/player/auth/login.js',
        'api/player/auth/register.js',
        'api/player/auth/logout.js',
        'api/player/auth/change-password.js',
        'api/player/email/start.js',
        'api/player/email/verify.js',
        'api/player/password-recovery/start.js',
        'api/player/password-recovery/verify.js',
        'api/player/password-recovery/reset.js',
        'api/player/me.js',
        'api/player/wallet.js',
        'api/player/profile.js',
        'api/player/personal-data.js',
      ];
      const playerGameEntries = [
        'api/player/games/start.js',
        'api/player/games/session/aviator.js',
        'api/player/games/[roundId].js',
        'api/player/games/[roundId]/action.js',
        'api/player/sports/place.js',
        'api/player/sports/bets.js',
        'api/player/withdrawals.js',
      ];
      const controlEntries = [
        'api/owner/dashboard.js',
        'api/owner/me.js',
        'api/owner/cashiers.js',
        'api/owner/risk-bets.js',
        'api/owner/players.js',
        'api/owner/withdrawals.js',
        'api/owner/messages.js',
        'api/owner/managers.js',
        'api/owner/treasury.js',
        'api/owner/fund.js',
        'api/owner/security-staff.js',
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
      const securityControlEntries = [
        'api/security/overview.js',
        'api/security/flags.js',
        'api/security/win-pattern-settings.js',
        'api/security/activity.js',
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

      for (const rel of securityControlEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/\.\.\/server\/security\/vercelHandler\.js['"]/);
      }

      for (const rel of playerAuthEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"]\.\.\/(?:\.\.\/)?\.\.\/server\/player\/playerAuthHttp\.js['"]/);
      }

      for (const rel of playerGameEntries) {
        const compiled = readFileSync(join(outDir, rel), 'utf8');
        assert.match(compiled, /from ['"].*server\/player\/(?:playerGamesHttp|vercelGamesHandler|sportsPlaceHttp|playerWithdrawalHttp)\.js['"]/);
      }
      const settleCompiled = readFileSync(join(outDir, 'api/internal/sports/settle.js'), 'utf8');
      assert.match(settleCompiled, /from ['"].*server\/sports\/settleHttp\.js['"]/);

      for (const rel of [...staffEntries, ...authEntries, ...playerAuthEntries, ...playerGameEntries, ...controlEntries, ...managerControlEntries, ...cashierControlEntries, ...securityControlEntries, 'api/internal/sports/settle.js', 'api/owner/withdrawals/[withdrawalId]/approve.js', 'api/owner/withdrawals/[withdrawalId]/reject.js', 'api/owner/withdrawals/[withdrawalId]/paid.js', 'api/owner/players/[playerId]/debit.js', 'api/owner/security/overview.js', 'api/owner/security/flags.js', 'api/owner/security/flags/[flagId]/resolve.js', 'api/owner/security/win-pattern-settings.js', 'api/owner/players/[playerId]/security.js', 'api/cashier/deposits/[transferId]/reverse.js']) {
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
