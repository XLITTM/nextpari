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
const behavior = read('supabase/tests/20260901_029_canonical_games_engine.behavior.rollback.sql');
const bff = read('server/player/playerGamesService.ts');

function extractFn(sql: string, name: string): string {
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION ${name.replace(/[.]/g, '\\.')}[\\s\\S]*?\\n\\$fn\\$;`,
  );
  const match = sql.match(re);
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

function idx(src: string, needle: string) {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `missing ${needle}`);
  return i;
}
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

describe('029A pre-production hardening', () => {
  it('does not let generic game_engine_action roll back an Aviator settlement', () => {
    const action = extractFn(migration, 'private.game_engine_action');
    const adapter = extractFn(migration, 'private.game_adapter_aviator_action');
    const getter = extractFn(migration, 'private.game_engine_get');
    assert.equal(action.includes('game_adapter_aviator_progress'), false);
    assert.match(action, /game_adapter_action/);
    assert.match(action, /Do not pre-progress Aviator/);
    assert.match(adapter, /game_adapter_aviator_progress/);
    assert.match(adapter, /IF v_round\.state IS DISTINCT FROM 'open' THEN\s+RETURN v_round/);
    assert.match(getter, /game_adapter_aviator_progress/);
  });

  it('does not exclusive-lock game_catalog on every start', () => {
    const catalog = extractFn(migration, 'private.game_require_catalog');
    assert.equal(/WHERE c\.game_code = v_code\s+FOR UPDATE/.test(catalog), false);
    assert.match(catalog, /FROM private\.game_catalog AS c/);
    assert.match(catalog, /WHERE c\.game_code = v_code;/);
    assert.match(catalog, /GAME_DISABLED/);
    assert.match(catalog, /GAME_MAINTENANCE/);
    assert.match(catalog, /status IS DISTINCT FROM 'active'/);
  });

  it('keeps per-round and per-wallet FOR UPDATE locks', () => {
    const ctx = extractFn(migration, 'private.game_require_player_context');
    const lock = extractFn(migration, 'private.game_lock_round_owned');
    assert.match(ctx, /FROM private\.wallet_accounts AS a[\s\S]*FOR UPDATE/);
    assert.match(lock, /FROM private\.game_rounds AS r[\s\S]*FOR UPDATE/);
  });

  it('keeps sports gated off and games enabled on this branch', () => {
    assert.match(gate, /CANONICAL_SPORTS_BET_ENABLED = false/);
    assert.match(gate, /CANONICAL_GAMES_WAGER_ENABLED = true/);
  });

  it('does not update wallet balances outside Wallet Core', () => {
    assert.equal(migration.includes('UPDATE public.wallets'), false);
    assert.equal(/UPDATE\s+private\.wallet_accounts/.test(migration), false);
    assert.equal(/SET\s+available_balance\s*=/.test(migration), false);
    assert.match(migration, /private\.apply_wallet_entry\(/);
  });

  it('keeps financial RNG off the six browser game UIs', () => {
    for (const file of gameUi) {
      const source = read(file);
      assert.match(source, /startGame/, file);
      assert.equal(source.includes('persistWalletBalance'), false, file);
    }
    assert.equal(read('src/games/pharaoh/PharaohTreasure.tsx').includes('Math.random'), false);
    assert.equal(read('src/games/pharaoh/PharaohTreasure.tsx').includes('pickWeighted'), false);
    assert.equal(read('src/games/blackjack/BlackjackGame.tsx').includes('freshShuffledDeck'), false);
    assert.equal(read('src/games/apples/ApplesGame.tsx').includes('buildBoard'), false);
    assert.equal(read('src/games/crystal/CrystalGame.tsx').includes('resolveSpin'), false);
    assert.equal(read('src/games/aviator/AviatorGame.tsx').includes('resolveCrashRound'), false);
  });

  it('adds a real BEGIN/ROLLBACK behavioral probe that is not executed here', () => {
    assert.match(behavior, /^BEGIN;/m);
    assert.match(behavior, /^ROLLBACK;/m);
    assert.match(behavior, /Do NOT run against production/);
    assert.match(behavior, /public\.player_game_start/);
    assert.match(behavior, /public\.player_game_action/);
    assert.match(behavior, /public\.player_game_get/);
    assert.match(behavior, /duplicate start idempotency does not double debit/);
    assert.match(behavior, /IDEMPOTENCY_KEY_CONFLICT/);
    assert.match(behavior, /losing round creates CASINO_BET only/);
    assert.match(behavior, /winning round creates CASINO_BET \+ CASINO_WIN/);
    assert.match(behavior, /game round belongs only to the JWT player/);
    assert.match(behavior, /WALLET_BLOCKED/);
    assert.match(behavior, /np_force_aviator_elapsed/);
    assert.match(behavior, /cashout after crash settles as a loss/);
    assert.match(behavior, /crash settlement remains committed/);
    assert.match(behavior, /later action cannot undo or double-settle auto cashout/);
    assert.match(behavior, /private\.apply_wallet_entry\(/);
    assert.equal(behavior.includes('COMMIT;'), false);
  });
});

describe('phase 031 stability and shared Aviator', () => {
  const sql031 = read('supabase/migrations/20260901_031_game_stability_shared_aviator_rtp.sql');
  const rollback031 = read('supabase/tests/20260901_031_game_stability_shared_aviator_rtp.rollback.sql');
  const bff = read('server/player/playerGamesService.ts');
  const cache = read('server/games/httpCache.ts');

  it('does not depend on unapplied migration 028', () => {
    assert.match(sql031, /Does not depend on unapplied migration 028/);
    assert.equal(/20260901_028/.test(sql031), false);
  });

  it('adds math_version and shared sessions without rewriting historical rounds', () => {
    assert.match(sql031, /math_version TEXT/);
    assert.match(sql031, /CREATE TABLE IF NOT EXISTS private.game_sessions/);
    assert.match(sql031, /session_id UUID/);
    assert.equal(/UPDATE private\.game_rounds[\s\S]{0,80}math_version =/.test(sql031.split('CREATE OR REPLACE')[0] ?? ''), false);
    assert.match(sql031, /pharaoh-v2-rtp875/);
    assert.match(sql031, /dice-v2-rtp875/);
    assert.match(sql031, /blackjack-v2-rtp875/);
    assert.match(sql031, /crystal-v2-rtp875/);
    assert.match(sql031, /aviator-v2-rtp875/);
  });

  it('keeps Apples financial config and 030B report on game_rounds', () => {
    assert.equal(sql031.includes('game_adapter_apples_start'), false);
    assert.match(sql031, /apples-v1-progressive/);
    assert.match(sql031, /Does not change Apples financial math/);
    assert.match(read('supabase/migrations/20260901_030_game_rtp_daily_report.sql'), /owner_game_rtp_report/);
  });

  it('pays Dice x1.72 and uses shared Aviator advisory lock', () => {
    assert.match(sql031, /winMultiplier', 1.72/);
    assert.match(sql031, /v_win NUMERIC := 1.72/);
    assert.match(sql031, /pg_advisory_xact_lock/);
    assert.match(sql031, /player_game_session_get/);
    assert.match(sql031, /game_aviator_multiplier/);
  });

  it('keeps lightweight JWT game auth, no-store, and Server-Timing', () => {
    assert.match(bff, /runPlayerGameRpc/);
    assert.equal(bff.includes('ensurePlayerAccount('), false);
    assert.match(cache, /no-store/);
    assert.match(cache, /Server-Timing|auth;dur=/);
    assert.match(http, /PLAYER_GAMES_AVIATOR_SESSION_PATH|session\/aviator/);
  });

  it('rollback probe is write-only BEGIN/ROLLBACK', () => {
    assert.match(rollback031, /^BEGIN;/m);
    assert.match(rollback031, /^ROLLBACK;/m);
    assert.equal(rollback031.includes('COMMIT;'), false);
    assert.match(rollback031, /1.72/);
    assert.match(rollback031, /pg_advisory_xact_lock/);
  });

  it('never exposes Aviator crashAt, crashPoint, or session seed before crash', () => {
    const pub = extractFn(sql031, 'private.game_aviator_session_public');
    assert.match(pub, /v_reveal := p_session\.state = 'crashed'/);
    assert.match(pub, /'crashAt', CASE WHEN v_reveal THEN p_session\.crash_at ELSE NULL END/);
    assert.match(pub, /'crashPoint', CASE WHEN v_reveal THEN v_crash ELSE NULL END/);
    assert.match(pub, /'serverSeed', CASE WHEN v_reveal THEN p_session\.server_seed ELSE NULL END/);
    assert.equal(pub.includes("'crashAt', p_session.crash_at"), false);
    assert.equal(pub.includes('LEAST(v_crash'), false);
    const progress = extractFn(sql031, 'private.game_adapter_aviator_progress');
    assert.equal(progress.includes('LEAST(v_crash'), false);
    assert.equal(/'crashPoint',\s*v_crash/.test(progress), false);
    const action = extractFn(sql031, 'private.game_adapter_aviator_action');
    assert.equal(/phase', 'cashed'[\s\S]*'crashPoint'/.test(action), false);
    assert.match(pub, /Never cap the public multiplier by the hidden crash point/);
  });

  it('uses the shared session seed as Aviator proof and hides it until crash', () => {
    const roundJson = extractFn(sql031, 'private.game_round_json');
    assert.match(roundJson, /p_round\.game_code = 'aviator' AND p_round\.session_id IS NOT NULL/);
    assert.match(roundJson, /v_hash := v_session\.server_seed_hash/);
    assert.match(roundJson, /WHEN v_session\.state = 'crashed' THEN v_session\.server_seed/);
    assert.match(roundJson, /Historical session_id NULL rounds/);
    assert.match(sql031, /session:crash:1/);
    const start = extractFn(sql031, 'private.game_adapter_aviator_start');
    assert.match(start, /'serverSeedHash', v_session\.server_seed_hash/);
    assert.equal(start.includes('v_round.server_seed_hash'), false);
  });

  it('session GET uses read-only viewer context without wallet locks', () => {
    const getter = extractFn(sql031, 'public.player_game_session_get');
    const viewer = extractFn(sql031, 'private.game_require_session_viewer');
    const start = extractFn(sql031, 'private.game_engine_start');
    assert.match(getter, /game_require_session_viewer/);
    assert.equal(getter.includes('game_require_player_context'), false);
    assert.equal(viewer.includes('FOR UPDATE'), false);
    assert.equal(viewer.includes('wallet_accounts'), false);
    assert.match(viewer, /STAFF_CANNOT_PLAY/);
    assert.match(viewer, /PLAYER_PROFILE_MISSING/);
    assert.match(viewer, /auth\.uid\(\)/);
    assert.match(start, /game_require_player_context/);
    assert.match(extractFn(sql031, 'private.game_engine_get'), /game_require_player_context/);
  });

  it('rollback fixture proves shared-session behavior without COMMIT', () => {
    assert.match(rollback031, /player A bet 1 joins session S/);
    assert.match(rollback031, /player A bet 2 joins same session S/);
    assert.match(rollback031, /player B bet joins same session S/);
    assert.match(rollback031, /same session_id/);
    assert.match(rollback031, /one serverSeedHash/);
    assert.match(rollback031, /independent stake/);
    assert.match(rollback031, /repeated cashout cannot create duplicate payout/);
    assert.match(rollback031, /same action idempotency returns same settlement/);
    assert.match(rollback031, /advisory lock/);
    assert.match(rollback031, /historical settled rows are not modified/);
    assert.match(rollback031, /np_force_session_flying/);
    assert.match(rollback031, /public\.player_game_session_get/);
    assert.match(rollback031, /crashAt/);
    assert.equal(rollback031.includes('COMMIT;'), false);
  });

  it('acquires the canonical Aviator advisory lock before wallet, round, and session locks', () => {
    const helper = extractFn(sql031, 'private.game_aviator_lock_current');
    const start = extractFn(sql031, 'private.game_engine_start');
    const action = extractFn(sql031, 'private.game_engine_action');
    const getter = extractFn(sql031, 'private.game_engine_get');
    const create = extractFn(sql031, 'private.game_aviator_get_or_create_current_session');
    const sessGet = extractFn(sql031, 'public.player_game_session_get');
    assert.match(helper, /pg_catalog\.pg_advisory_xact_lock/);
    assert.match(helper, /pg_catalog\.hashtextextended\(\s*'nextpari:aviator:current',\s*0\s*\)/);
    assert.equal((sql031.match(/'nextpari:aviator:current'/g) || []).length, 1);
    assert.match(sql031, /AVIATOR_ADVISORY/);
    assert.match(sql031, /REVOKE ALL ON FUNCTION private\.game_aviator_lock_current/);
    assert.equal(sql031.includes('GRANT EXECUTE ON FUNCTION private.game_aviator_lock_current'), false);

    assert.ok(idx(start, 'game_aviator_lock_current') < idx(start, 'game_require_player_context'));
    assert.match(start, /IF v_code = 'aviator' THEN\s+PERFORM private\.game_aviator_lock_current\(\)/);
    assert.ok(idx(start, 'game_aviator_lock_current') < idx(start, 'FOR UPDATE'));

    assert.ok(idx(action, 'INTO v_peek_code') < idx(action, 'game_aviator_lock_current'));
    assert.ok(idx(action, 'game_aviator_lock_current') < idx(action, 'game_require_player_context'));
    assert.ok(idx(action, 'game_aviator_lock_current') < idx(action, 'game_lock_round_owned'));
    assert.equal(
      action.slice(idx(action, 'INTO v_peek_code'), idx(action, 'game_aviator_lock_current')).includes('FOR UPDATE'),
      false,
    );
    assert.match(action, /Not used for ownership/);
    assert.match(action, /Do not pre-progress Aviator/);

    assert.ok(idx(getter, 'INTO v_peek_code') < idx(getter, 'game_aviator_lock_current'));
    assert.ok(idx(getter, 'game_aviator_lock_current') < idx(getter, 'game_require_player_context'));
    assert.ok(idx(getter, 'game_aviator_lock_current') < idx(getter, 'game_lock_round_owned'));

    assert.ok(idx(create, 'game_aviator_lock_current') < idx(create, 'FOR UPDATE'));
    assert.equal(create.includes('hashtextextended'), false);
    assert.ok(idx(sessGet, 'game_require_session_viewer') < idx(sessGet, 'game_aviator_get_or_create_current_session'));

    assert.equal(extractFn(sql031, 'private.game_adapter_dice_start').includes('game_aviator_lock_current'), false);
    assert.equal(extractFn(sql031, 'private.game_adapter_pharaoh_start').includes('game_aviator_lock_current'), false);
    assert.equal(sql031.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.match(rollback031, /AVIATOR_ADVISORY/);
    assert.match(rollback031, /Lock order: AVIATOR_ADVISORY then wallet \/ round \/ session then Wallet Core/);
  });

  it('has balanced SQL dollar-quote delimiters and no duplicate function closures', () => {
    const sql = sql031.replace(/\r\n/g, '\n');
    const rollback = rollback031.replace(/\r\n/g, '\n');
    const trimmed = sql.trim();
    assert.ok(trimmed.startsWith('BEGIN;'));
    assert.ok(trimmed.endsWith('COMMIT;'));
    assert.equal(/END;\n\$fn\$;\n+END;\n\$fn\$;/.test(sql), false);

    const fnOpens = sql.match(/^AS \$fn\$/gm) ?? [];
    const fnCloses = sql.match(/^\$fn\$;/gm) ?? [];
    assert.equal(fnOpens.length, fnCloses.length, `$fn$ open ${fnOpens.length} close ${fnCloses.length}`);

    const creates = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([^\s(]+)/gm)].map((m) => m[1]);
    assert.ok(creates.length >= 20);
    assert.equal(new Set(creates).size, creates.length, 'duplicate CREATE OR REPLACE FUNCTION name');

    const startClose = sql.indexOf('CREATE OR REPLACE FUNCTION private.game_engine_action');
    const beforeAction = sql.slice(0, startClose);
    assert.match(beforeAction, /CREATE OR REPLACE FUNCTION private\.game_engine_start\(/);
    assert.match(beforeAction, /\nEND;\n\$fn\$;\n+$/);
    assert.equal(/END;\n\$fn\$;\n+END;\n\$fn\$;\n+$/.test(beforeAction), false);

    let depth = 0;
    let doFk = 0;
    for (const line of sql.split('\n')) {
      if (line === 'DO $fk$') doFk += 1;
      if (line === '$fk$;') doFk -= 1;
      if (line === 'AS $fn$') depth += 1;
      if (line === '$fn$;') depth -= 1;
      assert.ok(depth >= 0, 'orphan $fn$;');
      assert.ok(doFk >= 0, 'orphan $fk$;');
    }
    assert.equal(depth, 0, 'unfinished $fn$ body');
    assert.equal(doFk, 0, 'unfinished DO $fk$ block');

    assert.match(rollback, /^BEGIN;/m);
    assert.ok(rollback.trim().endsWith('ROLLBACK;'));
    assert.equal(rollback.includes('COMMIT;'), false);
  });
});

describe('phase 032 blackjack visible-dealer calibration', () => {
  const sql032 = read('supabase/migrations/20260901_032_blackjack_visible_dealer_rtp.sql');

  it('updates only blackjack catalog payout and mathVersion', () => {
    assert.match(sql032, /^BEGIN;/m);
    assert.match(sql032, /^COMMIT;/m);
    assert.match(sql032, /blackjack-v3-visible-dealer-rtp875/);
    assert.match(sql032, /winPayout', 1.70/);
    assert.match(sql032, /goldenPayout', 2.00/);
    assert.match(sql032, /pushPayout', 1.00/);
    assert.match(sql032, /v_win NUMERIC := 1.70/);
    assert.match(sql032, /private\.game_math_version\('blackjack'\)/);
    assert.equal(sql032.includes('UPDATE private.game_rounds'), false);
    assert.equal(sql032.includes('game_adapter_apples'), false);
    assert.equal(sql032.includes('game_adapter_dice'), false);
    assert.equal(sql032.includes('game_adapter_pharaoh'), false);
    assert.equal(sql032.includes('game_adapter_crystal'), false);
    assert.equal(sql032.includes('game_adapter_aviator'), false);
    assert.equal(sql032.includes('apply_wallet_entry'), false);
  });
});
