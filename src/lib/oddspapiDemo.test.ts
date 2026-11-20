import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isOddsPapiDemoEntry } from './oddspapiDemo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('oddspapi preview demo entry', () => {
  it('recognizes only the preview demo hash', () => {
    assert.equal(isOddsPapiDemoEntry('#/oddspapi-demo'), true);
    assert.equal(isOddsPapiDemoEntry('#/backoffice'), false);
    assert.equal(isOddsPapiDemoEntry(''), false);
  });

  it('keeps the demo screen away from wallet and bet placement', () => {
    const screen = readFileSync(join(root, 'src/screens/OddsPapiDemoScreen.tsx'), 'utf8');
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
    assert.equal(screen.includes('WalletProvider'), false);
    assert.equal(screen.includes('BetSlipProvider'), false);
    assert.equal(screen.includes('supabase'), false);
    assert.equal(screen.includes('sportsPlace'), false);
    assert.equal(screen.includes('Название недоступно'), true);
    assert.equal(screen.includes('Время недоступно'), true);
    assert.equal(screen.includes('MatchCard'), false);
    assert.equal(screen.includes('function PriceCell'), true);
    assert.equal(app.includes('isOddsPapiDemoEntry(window.location.hash)'), true);
    assert.equal(app.includes('<AuthScreen'), true);
  });
});
