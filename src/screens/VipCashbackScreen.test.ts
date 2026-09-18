import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'VipCashbackScreen.tsx'), 'utf8');
const app = readFileSync(join(here, '../App.tsx'), 'utf8');

const CASHBACK_LABELS = ['5%', '6%', '7%', '8%', '9%', '10%', '11%', '0.05–0.25%'];
const CASHBACK_PERIODS = [
  'Раз в 7 дней',
  'Раз в 6 дней',
  'Раз в 5 дней',
  'Раз в 4 дня',
  'Раз в 3 дня',
  'Раз в 2 дня',
  'Ежедневно',
];

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

  it('keeps the exact planned cashback percentage and cadence table in VIP_LEVELS', () => {
    for (const label of CASHBACK_LABELS) {
      assert.equal(screen.includes(`cashbackLabel: '${label}'`), true, label);
    }
    for (const period of CASHBACK_PERIODS) {
      assert.equal(screen.includes(`cashbackPeriod: '${period}'`), true, period);
    }
    assert.match(screen, /name: 'Статус VIP', cashbackLabel: '0\.05–0\.25%', cashbackPeriod: null/);
    assert.equal(screen.includes("cashbackPeriod: 'Ежедневно'"), true);
    assert.equal((screen.match(/cashbackPeriod: null/g) ?? []).length, 1);
    assert.equal(screen.includes('12%'), false);
    assert.match(screen, /\{tier\.cashbackLabel\}/);
    assert.match(screen, /\{selected\.cashbackLabel\}/);
    assert.match(screen, /\{selected\.cashbackPeriod\}/);
    assert.match(screen, /\{tier\.cashbackPeriod\}/);
  });

  it('renders VIP and cashback tabs with approved artwork and no live claim', () => {
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
    assert.equal(/\$\d/.test(screen), false);
    assert.equal(/\bclaim\b/i.test(screen), false);
    assert.equal(screen.includes('Получить кешбэк'), false);
    assert.equal(screen.includes('следующ'), false);
    assert.match(screen, /не зачисляются автоматически/);
    assert.match(screen, /selected\.cashbackPeriod \?/);
    assert.match(screen, /tier\.cashbackPeriod \?/);
    assert.match(screen, /useState<VipTab>\('levels'\)/);
    assert.match(screen, /useState\(4\)/);
    assert.equal(screen.includes('BottomNav'), false);
    assert.equal(screen.includes('supabase'), false);
    assert.equal(screen.includes('apply_wallet_entry'), false);
  });
});
