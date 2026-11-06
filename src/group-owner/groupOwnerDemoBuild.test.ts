import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'dist-group-owner');

const PRODUCTION_REWRITES = {
  rewrites: [
    { source: '/api/betsapi/:path*', destination: '/api/betsapi/:path*' },
    {
      source: '/((?!api/|images/|icons/|favicon\\.svg|manifest\\.json|sw\\.js|apple-touch-icon\\.png|25534\\.png).*)',
      destination: '/index.html',
    },
  ],
};

function filesIn(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...filesIn(path));
    else found.push(path);
  }
  return found;
}

describe('group owner demo build', () => {
  it('keeps NextPari production build and vercel routing unchanged', () => {
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as typeof PRODUCTION_REWRITES;
    assert.deepEqual(vercel, PRODUCTION_REWRITES);
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts.build, 'vite build');
    assert.equal(pkg.scripts['build:group-owner'], 'vite build --config vite.group-owner.config.ts');
    const productionVite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    assert.doesNotMatch(productionVite, /group-owner|dist-group-owner/);
    const productionIndex = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(productionIndex, /src\/main\.tsx/);
    assert.doesNotMatch(productionIndex, /group-owner/);
  });

  it('opens from index.html and ships no credentials or live data', () => {
    const index = readFileSync(join(outDir, 'index.html'), 'utf8');
    const named = readFileSync(join(outDir, 'group-owner.html'), 'utf8');
    assert.equal(index, named);
    assert.match(index, /Владелец группы — демонстрация/);
    assert.match(index, /src="\/assets\/[^"]+\.js"/);
    assert.doesNotMatch(index, /supabase|\/api\/|service_role|VITE_/i);

    const bundled = filesIn(outDir)
      .filter((path) => path.endsWith('.js') || path.endsWith('.html') || path.endsWith('.css'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const forbidden = [
      /supabase\.co/i,
      /service_role/i,
      /SUPABASE_SERVICE/i,
      /VITE_SUPABASE/i,
      /eyJhbGci/,
      /GROUP_SERVICE/i,
      /SHARED_KEY/i,
      /sk_live/,
      /postgres:\/\//i,
      /979426/,
      /\/api\/owner/i,
      /\/api\/player/i,
      /\/api\/betconstruct/i,
    ];
    for (const pattern of forbidden) {
      assert.equal(pattern.test(bundled), false, `bundle matched ${pattern}`);
    }
    assert.match(bundled, /Вход владельца группы/);
    assert.match(bundled, /Учётная запись не создана/);
    assert.equal(bundled.includes('900001'), false);
    assert.equal(bundled.includes('Демонстрационные данные'), false);
    const shipped = filesIn(outDir).map((path) => relative(outDir, path).replaceAll('\\', '/'));
    assert.ok(shipped.includes('index.html'));
    assert.equal(shipped.includes('sw.js'), false);
    assert.equal(shipped.includes('manifest.json'), false);
    assert.equal(shipped.some((path) => path.startsWith('images/') || path.startsWith('games/') || path.startsWith('icons/')), false);
    assert.equal(shipped.some((path) => path.startsWith('assets/') && path.endsWith('.js')), true);
  });
});
