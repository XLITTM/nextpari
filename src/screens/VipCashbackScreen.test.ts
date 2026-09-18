import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'VipCashbackScreen.tsx'), 'utf8');
const app = readFileSync(join(here, '../App.tsx'), 'utf8');

describe('VIP cashback approved UI', () => {
  it('keeps all eight preview level names', () => {
    for (const name of [
      'Медный',
      'Бронзовый',
      'Серебряный',
      'Золотой',
      'Рубиновый',
      'Сапфировый',
      'Бриллиантовый',
      'Статус VIP',
    ]) {
      assert.match(screen, new RegExp(`name: '${name}'`));
    }
    assert.match(screen, /id: 1/);
    assert.match(screen, /id: 8/);
  });

  it('renders VIP and cashback tabs with approved artwork and no fake rewards', () => {
    assert.match(screen, /VIP уровни/);
    assert.match(screen, /Кешбэк/);
    assert.match(screen, /\/assets\/vip\/vip_tiger_hero_reference\.png/);
    assert.match(screen, /\/assets\/vip\/vip_cashback_coin_reference\.png/);
    assert.equal(screen.includes('vip_cashback_reference.png'), false);
    assert.equal(screen.includes('vip_tier_cards_reference.png'), false);
    assert.equal(screen.includes('CopperMedal'), false);
    assert.equal(screen.includes('#194bb8'), false);
    assert.equal(screen.includes('#12388e'), false);
    assert.equal(screen.includes('bg-[#f0f4fa]'), false);
    assert.equal(app.includes("screen.name === 'vip-cashback'"), true);
    assert.equal(/\b(?:5|10|15)\s*%/.test(screen), false);
    assert.equal(/\$\d/.test(screen), false);
    assert.equal(/\bclaim\b/i.test(screen), false);
    assert.match(screen, /useState<VipTab>\('levels'\)/);
    assert.match(screen, /useState\(4\)/);
    assert.equal(screen.includes('BottomNav'), false);
  });
});
