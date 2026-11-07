import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const officeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('secrets', () => {
  it('keeps provider secrets and browser credential stores out of the source', () => {
    const output = execFileSync(process.execPath, ['scripts/assert-no-secrets.mjs', '--source-only'], {
      cwd: officeRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('Source secret scan passed.');
  });
});
