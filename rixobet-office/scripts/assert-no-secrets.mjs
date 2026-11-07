import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requireDist = process.argv.includes('--require-dist');
const sourceOnly = process.argv.includes('--source-only');
const textExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.svg', '.json']);

const forbidden = [
  ['supabase', /supabase/i],
  ['service role', /service[_-]?role/i],
  ['live secret', /sk_live_/],
  ['private key', /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/],
  ['postgres url', /postgres(?:ql)?:\/\//i],
  ['mongo url', /mongodb(?:\+srv)?:\/\//i],
  ['aws key', /AKIA[0-9A-Z]{16}/],
  ['slack token', /xox[baprs]-/],
  ['jwt header', /eyJhbGciOi/],
  ['shared key', /SHARED_KEY/],
  ['provider secret', /BETCONSTRUCT|LSPORTS/i],
  ['foreign host', /nextpari/i],
  ['browser credential store', /localStorage|sessionStorage|document\.cookie/],
];

const previewMarkers = ['Макет интерфейса', '/src/preview/main.tsx'];

function filesIn(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...filesIn(path));
      continue;
    }
    if (textExt.has(extname(entry))) found.push(path);
  }
  return found;
}

function scan(path, rules) {
  const text = readFileSync(path, 'utf8');
  const hits = [];
  for (const [name, rule] of rules) {
    if (rule.test(text)) hits.push(name);
  }
  return hits;
}

const sourceRoots = ['src', 'public'].map((dir) => join(root, dir));
const sourceFiles = [
  ...sourceRoots.flatMap((dir) => filesIn(dir)),
  join(root, 'index.html'),
  join(root, 'preview.html'),
  join(root, 'package.json'),
  join(root, 'vite.config.ts'),
];

let failed = false;
for (const file of sourceFiles) {
  const hits = scan(file, forbidden);
  if (hits.length > 0) {
    failed = true;
    console.error(`${file}: ${hits.join(', ')}`);
  }
}

const distDir = join(root, 'dist');
if (!sourceOnly) {
  let distFiles = [];
  try {
    distFiles = filesIn(distDir);
  } catch {
    distFiles = [];
  }
  if (requireDist && distFiles.length === 0) {
    console.error('Production bundle is missing.');
    failed = true;
  }
  for (const file of distFiles) {
    const text = readFileSync(file, 'utf8');
    const hits = [];
    for (const [name, rule] of forbidden) {
      if (rule.test(text)) hits.push(name);
    }
    for (const marker of previewMarkers) {
      if (text.includes(marker)) hits.push(marker);
    }
    if (hits.length > 0) {
      failed = true;
      console.error(`${file}: ${hits.join(', ')}`);
    }
  }
}

if (failed) process.exit(1);
console.log(sourceOnly ? 'Source secret scan passed.' : 'Secret scan passed.');
