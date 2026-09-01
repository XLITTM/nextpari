import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { APPLES_LEVELS, APPLES_MATH_UNCHANGED } from './rtp/applesMath.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('phase 031 frontend regressions', () => {
  it('game fetches use no-store', () => {
    const client = read('src/lib/playerGames.ts');
    assert.match(client, /cache: 'no-store'/);
    assert.match(client, /Cache-Control': 'no-store'/);
    assert.match(client, /getAviatorSession/);
  });

  it('fast game auth skips full player snapshot', () => {
    const bff = read('server/player/playerGamesService.ts');
    assert.match(bff, /runPlayerGameRpc/);
    assert.equal(bff.includes('getAuthUser('), false);
    assert.equal(bff.includes('ensurePlayerAccount('), false);
    assert.equal(bff.includes('loadOwnWallet('), false);
    assert.equal(bff.includes('snapshotFromAccessToken'), false);
    assert.match(bff, /refreshSession/);
    assert.match(bff, /retry original game RPC|retryStart|tokens.accessToken/);
  });

  it('sports polling pauses in arcade and hidden tabs', () => {
    const hook = read('src/hooks/useEventsList.ts');
    const gate = read('src/lib/sportsPollGate.ts');
    const app = read('src/App.tsx');
    assert.match(gate, /pharaoh/);
    assert.match(gate, /aviator/);
    assert.match(app, /setArcadeSportsPaused/);
    assert.match(hook, /isArcadeSportsPaused/);
    assert.match(hook, /visibilityState/);
    assert.match(hook, /visibilitychange/);
  });

  it('Pharaoh preloads assets and shortens the old reveal chain', () => {
    const ui = read('src/games/pharaoh/PharaohTreasure.tsx');
    assert.match(ui, /preloadPharaohAssets/);
    assert.match(ui, /PHARAOH_ASSETS/);
    assert.equal(ui.includes('700 + index * 420'), false);
    assert.match(ui, /220 \+ index \* 140/);
  });

  it('Dice uses CSS roll without an 80ms React RNG loop and shows x1.72', () => {
    const ui = read('src/games/dice/DiceGame.tsx');
    assert.equal(ui.includes('setInterval(() =>'), false);
    assert.equal(ui.includes(', 80)'), false);
    assert.equal(ui.includes('Math.random'), false);
    assert.match(ui, /DICE_WIN_MULTIPLIER = 1.72/);
    assert.match(ui, /ставка × \{DICE_WIN_MULTIPLIER\}/);
  });

  it('Blackjack defaults min stake, disables PLAY below min, displays server payout', () => {
    const ui = read('src/games/blackjack/BlackjackGame.tsx');
    assert.match(ui, /useState\(MIN_STAKE\)/);
    assert.match(ui, /playDisabled/);
    assert.match(ui, /balance < MIN_STAKE/);
    assert.match(ui, /payout=\{serverPayout\}/);
    assert.equal(ui.includes('payoutAmount('), false);
    assert.match(ui, /dealerDraws/);
  });

  it('Apples start reaches canonical API and does not force playing phase', () => {
    const ui = read('src/games/apples/ApplesGame.tsx');
    assert.match(ui, /startGame\(\{ gameCode: 'apples'/);
    assert.equal(ui.includes("=== 'playing' ? 'playing' : 'playing'"), false);
    assert.match(ui, /pendingCellId/);
    assert.equal(APPLES_MATH_UNCHANGED, true);
    assert.equal(APPLES_LEVELS[0]?.multiplier, 1.23);
    assert.equal(APPLES_LEVELS[9]?.multiplier, 349);
    const config = read('src/games/apples/appleConfig.ts');
    assert.match(config, /multiplier: 1.23/);
    assert.match(config, /multiplier: 349.00/);
  });

  it('Crystal survivors fall down and new gems enter from above', () => {
    const cascade = read('src/games/crystal/cascade.ts');
    const board = read('src/games/crystal/CrystalBoard.tsx');
    const game = read('src/games/crystal/CrystalGame.tsx');
    assert.match(cascade, /fromRow: row - incomingRows/);
    assert.match(cascade, /toRow: GRID - 1 - stackIndex/);
    assert.match(board, /translate3d/);
    assert.match(board, /data-from-row/);
    assert.match(board, /data-new/);
    assert.match(board, /prefers-reduced-motion|reducedMotion/);
    assert.equal(game.includes('resolveSpin'), false);
    assert.equal(game.includes('Math.random'), false);
    assert.match(game, /setMotion\('fall'\)/);
  });

  it('Aviator uses one shared session, TMTM, and no fake local crash', () => {
    const ui = read('src/games/aviator/AviatorGame.tsx');
    assert.match(ui, /getAviatorSession/);
    assert.match(ui, /sessionId: round.sessionId/);
    assert.equal(ui.includes('setRevealedCrash(2)'), false);
    assert.equal(ui.includes('getGameRound'), false);
    assert.equal(ui.includes('USDT'), false);
    assert.match(ui, /TMTM/);
    assert.equal(ui.includes('setMultiplier(current)'), false);
    assert.match(ui, /onVisualMultiplier/);
    assert.match(ui, /1100/);
  });
});

describe('phase 032 visual restore', () => {
  it('Pharaoh keeps one themed result banner and no win toast', () => {
    const ui = read('src/games/pharaoh/PharaohTreasure.tsx');
    assert.match(ui, /data-pharaoh-result/);
    assert.match(ui, /pharaoh-banner/);
    assert.match(ui, /ВЫИГРЫШ: \$\{formatTmtm\(payout\)\} TMTM!/);
    assert.match(ui, /ВЫ ПРОИГРАЛИ/);
    assert.equal(ui.includes('showToast(`Выигрыш'), false);
    assert.equal(ui.includes('×{prize?.mult}'), false);
  });

  it('Dice shows one result panel from server payout and totals', () => {
    const ui = read('src/games/dice/DiceGame.tsx');
    assert.match(ui, /function DiceResultPanel/);
    assert.match(ui, /data-dice-result/);
    assert.match(ui, /ПОБЕДА/);
    assert.match(ui, /НИЧЬЯ/);
    assert.match(ui, /ПОРАЖЕНИЕ/);
    assert.match(ui, /Выигрыш/);
    assert.match(ui, /Возврат/);
    assert.match(ui, /Проигрыш/);
    assert.match(ui, /Number\(round\.payout\)/);
    assert.equal(ui.includes('stake * DICE_WIN_MULTIPLIER'), false);
    assert.equal(ui.includes('Math.random'), false);
    assert.match(ui, /DICE_WIN_MULTIPLIER = 1.72/);
  });

  it('Blackjack presents both initial dealer cards face-up', () => {
    const ui = read('src/games/blackjack/BlackjackGame.tsx');
    const card = read('src/games/blackjack/Card.tsx');
    assert.match(ui, /isHidden: false/);
    assert.match(ui, /Both initial dealer cards are shown/);
    assert.match(ui, /×1.70 от ставки/);
    assert.match(card, /data-face=\{faceDown \? 'down' : 'up'\}/);
    assert.match(ui, /dealerDraws/);
    assert.match(ui, /payout=\{serverPayout\}/);
  });

  it('Apples pre-round CTA is ИГРАТЬ inside the mobile viewport shell', () => {
    const ui = read('src/games/apples/ApplesGame.tsx');
    assert.match(ui, /data-apples-play="1"/);
    assert.match(ui, /\{busy \? 'ЗАПУСК\.\.\.' : 'ИГРАТЬ'\}/);
    assert.match(ui, /max-h-\[100dvh\]/);
    assert.match(ui, /min-h-0/);
    assert.equal(ui.includes('min-h-screen'), false);
    assert.match(ui, /startGame\(\{ gameCode: 'apples'/);
    assert.equal(ui.includes("=== 'playing' ? 'playing' : 'playing'"), false);
    assert.equal(APPLES_MATH_UNCHANGED, true);
  });

  it('Crystal uses a settled CSS grid and a temporary fall overlay', () => {
    const board = read('src/games/crystal/CrystalBoard.tsx');
    const game = read('src/games/crystal/CrystalGame.tsx');
    assert.match(board, /data-base-grid="7x7"/);
    assert.match(board, /grid-cols-7 gap-1.5 p-2/);
    assert.match(board, /data-resting-transform="none"/);
    assert.match(board, /data-cascade-overlay="1"/);
    assert.match(board, /overlayActive/);
    assert.match(board, /translate3d/);
    assert.match(game, /setMotion\('highlight'\)/);
    assert.match(game, /setMotion\('fall'\)/);
    assert.match(game, /setMotion\('idle'\)/);
    assert.match(game, /setNextBoard\(undefined\)/);
    assert.equal(game.includes('resolveSpin'), false);
    assert.equal(game.includes('Math.random'), false);
  });
});
