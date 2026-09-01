import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CANONICAL_GAME_CODES, GAME_ADAPTERS, PLAYER_GAME_RPC } from './registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return [path];
  });
}

const migration = read('supabase/migrations/20260901_029_canonical_games_engine.sql');
const rollback = read('supabase/tests/20260901_029_canonical_games_engine.rollback.sql');
const bff = read('server/player/playerGamesService.ts');
const http = read('server/player/playerGamesHttp.ts');
const rpc = read('server/player/playerGameRpc.ts');
const client = read('src/lib/playerGames.ts');
const gate = read('src/lib/playerMoneyGate.ts');

const gameUi = [
  'src/games/pharaoh/PharaohTreasure.tsx',
  'src/games/dice/DiceGame.tsx',
  'src/games/blackjack/BlackjackGame.tsx',
  'src/games/apples/ApplesGame.tsx',
  'src/games/crystal/CrystalGame.tsx',
  'src/games/aviator/AviatorGame.tsx',
];

describe('generic canonical game engine', () => {
  it('creates an extensible catalog instead of a six-game CHECK', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.game_catalog/);
    assert.match(migration, /game_code TEXT PRIMARY KEY/);
    assert.match(migration, /status TEXT NOT NULL DEFAULT 'active'/);
    assert.match(migration, /'active', 'disabled', 'maintenance'/);
    assert.equal(/game_code IN \(\s*'pharaoh'[\s\S]*'aviator'\s*\)/.test(migration), false);
    assert.match(rollback, /no hardcoded six-game CHECK/);
    for (const code of CANONICAL_GAME_CODES) {
      assert.match(migration, new RegExp(`'${code}'`));
    }
  });

  it('uses generic rounds, actions, and public RPCs', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.game_rounds/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.game_actions/);
    assert.match(migration, /REFERENCES private\.game_catalog\(game_code\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.player_game_start/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.player_game_action/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.player_game_get/);
    assert.equal(PLAYER_GAME_RPC.start, 'player_game_start');
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.player_game_start/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.player_game_start[\s\S]*FROM anon/);
    assert.match(migration, /auth\.uid\(\)/);
    assert.match(migration, /SECURITY DEFINER/);
    assert.match(migration, /SET search_path = ''/);
  });

  it('routes money only through Wallet Core casino operations', () => {
    assert.match(migration, /private\.apply_wallet_entry\(/);
    assert.match(migration, /'CASINO_BET'/);
    assert.match(migration, /'CASINO_WIN'/);
    assert.match(migration, /'CASINO_REFUND'/);
    assert.match(migration, /'casino'/);
    assert.match(migration, /'player'/);
    assert.equal(migration.includes('UPDATE public.wallets'), false);
    assert.equal(migration.includes('UPDATE private.wallet_accounts'), false);
    assert.match(migration, /STAFF_CANNOT_PLAY/);
    assert.match(migration, /migration_state NOT IN \('staging', 'active'\)|v_mig NOT IN \('staging', 'active'\)/);
    assert.match(migration, /WALLET_BLOCKED/);
    assert.match(migration, /WALLET_CLOSED/);
    assert.match(migration, /INSUFFICIENT_AVAILABLE_BALANCE|game_apply_bet/);
    assert.match(migration, /IDEMPOTENCY_KEY_CONFLICT/);
    assert.match(migration, /FOR UPDATE/);
    assert.match(migration, /GAME_ROUND_IMMUTABLE/);
  });

  it('keeps adapters generic so Game #7 does not redesign the wallet', () => {
    assert.match(migration, /GAME_ADAPTER_NOT_IMPLEMENTED/);
    assert.match(migration, /private\.game_adapter_start/);
    assert.match(migration, /Future Game #7/);
    assert.equal(GAME_ADAPTERS.length, 6);
    assert.match(migration, /private\.game_adapter_pharaoh_start/);
    assert.match(migration, /private\.game_adapter_dice_start/);
    assert.match(migration, /private\.game_adapter_blackjack/);
    assert.match(migration, /private\.game_adapter_apples/);
    assert.match(migration, /private\.game_adapter_crystal_start/);
    assert.match(migration, /private\.game_adapter_aviator/);
    assert.match(migration, /GAME_DISABLED/);
    assert.match(migration, /GAME_MAINTENANCE/);
  });

  it('implements server RNG and hides private state', () => {
    assert.match(migration, /extensions\.gen_random_bytes/);
    assert.match(migration, /extensions\.hmac/);
    assert.match(migration, /server_seed_hash/);
    assert.match(migration, /WHEN p_round\.state = 'settled' THEN p_round\.server_seed/);
    assert.match(migration, /game_sanitize_options/);
    assert.match(migration, /crashPoint/);
    assert.match(migration, /isHidden/);
    assert.equal(migration.includes('Math.random'), false);
  });
});

describe('game-specific server rules', () => {
  it('Pharaoh selects prize, six tiles, match, and payout on the server', () => {
    assert.match(migration, /FOR v_i IN 1\.\.6 LOOP/);
    assert.match(migration, /v_symbols->v_inner/);
    assert.match(migration, /'matched'/);
  });

  it('Dice compares two player dice against two rival dice', () => {
    assert.match(migration, /playerDice/);
    assert.match(migration, /rivalDice/);
    assert.match(migration, /v_round\.stake \* 2/);
  });

  it('Blackjack is stateful with hit/stand and a hidden hole card', () => {
    assert.match(migration, /'hit','stand'|hit.*stand/s);
    assert.match(migration, /game_bj_draw\(v_deck, true\)/);
    assert.match(migration, /ACTION_NOT_ALLOWED/);
    assert.equal(/p_action.*= 'double'/.test(migration), false);
  });

  it('Apples keeps unrevealed hazards off the public payload', () => {
    assert.match(migration, /THEN v_cell->>'kind'/);
    assert.match(migration, /ELSE NULL/);
    assert.match(migration, /action: 'pick'|v_action IS DISTINCT FROM 'pick'/);
    assert.match(migration, /cashout/);
  });

  it('Crystal settles cascades server-side', () => {
    assert.match(migration, /game_adapter_crystal_start/);
    assert.match(migration, /startBoard/);
    assert.match(migration, /totalWin/);
  });

  it('Aviator seals the crash point and cashes out with server time', () => {
    assert.match(migration, /game_aviator_crash/);
    assert.match(migration, /EXTRACT\(EPOCH FROM/);
    assert.match(migration, /autoCashout/);
    assert.match(migration, /game_adapter_aviator_progress/);
    assert.match(migration, /'phase', 'flying'/);
  });
});

describe('same-origin BFF and frontend client', () => {
  it('exposes generic player game routes and uses the player JWT', () => {
    assert.match(http, /\/api\/player\/games\/start/);
    assert.match(http, /\/action/);
    assert.match(bff, /player_game_start/);
    assert.match(bff, /player_game_action/);
    assert.match(bff, /player_game_get/);
    assert.match(rpc, /createUserJwtClient/);
    assert.equal(rpc.includes('createServiceRoleClient'), false);
    assert.equal(bff.includes('service_role'), false);
    assert.equal(http.includes('service_role'), false);
    assert.match(bff, /delete copy.userId/);
    assert.match(bff, /delete copy.walletId/);
    assert.match(bff, /delete copy.payout/);
    assert.match(client, /\/api\/player\/games\/start/);
    assert.match(client, /credentials: 'same-origin'/);
    assert.equal(client.includes('supabase'), false);
  });

  it('connects all six initial games to the generic client', () => {
    for (const file of gameUi) {
      const source = read(file);
      assert.match(source, /startGame/, file);
      assert.equal(source.includes('persistWalletBalance'), false, file);
      assert.equal(source.includes("rpc('player_game"), false, file);
      assert.equal(source.includes('supabase'), false, file);
    }
    assert.match(read('src/games/blackjack/BlackjackGame.tsx'), /gameAction/);
    assert.match(read('src/games/apples/ApplesGame.tsx'), /gameAction/);
    assert.match(read('src/games/aviator/AviatorGame.tsx'), /gameAction/);
    assert.match(read('src/games/pharaoh/PharaohTreasure.tsx'), /gameCode: 'pharaoh'/);
    assert.match(read('src/games/dice/DiceGame.tsx'), /gameCode: 'dice'/);
    assert.match(read('src/games/crystal/CrystalGame.tsx'), /gameCode: 'crystal'/);
  });

  it('does not leave financial Math.random or client payout in the six UIs', () => {
    assert.equal(read('src/games/pharaoh/PharaohTreasure.tsx').includes('Math.random'), false);
    assert.equal(read('src/games/pharaoh/PharaohTreasure.tsx').includes('pickWeighted'), false);
    assert.equal(read('src/games/blackjack/BlackjackGame.tsx').includes('freshShuffledDeck'), false);
    assert.equal(read('src/games/apples/ApplesGame.tsx').includes('buildBoard'), false);
    assert.equal(read('src/games/crystal/CrystalGame.tsx').includes('resolveSpin'), false);
    assert.equal(read('src/games/aviator/AviatorGame.tsx').includes('resolveCrashRound'), false);
    assert.match(read('src/games/dice/DiceGame.tsx'), /startGame/);
    assert.match(gate, /CANONICAL_SPORTS_BET_ENABLED = false/);
    assert.match(gate, /CANONICAL_GAMES_WAGER_ENABLED = true/);
  });

  it('revokes browser access to private game tables', () => {
    assert.match(migration, /REVOKE ALL ON TABLE private\.game_rounds FROM anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE private\.game_catalog FROM anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON TABLE private\.game_actions FROM anon, authenticated/);
    assert.match(rollback, /BEGIN;/);
    assert.match(rollback, /ROLLBACK;/);
    assert.equal(rollback.includes('SELECT public.player_game_start'), false);
    assert.equal(rollback.includes('private.apply_wallet_entry'), false);
  });
});

describe('static source inventory', () => {
  it('does not add a second wallet engine', () => {
    const sqlFiles = listFiles(join(root, 'supabase/migrations')).filter((file) => file.endsWith('029_canonical_games_engine.sql'));
    assert.equal(sqlFiles.length, 1);
    assert.equal(migration.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
  });
});
