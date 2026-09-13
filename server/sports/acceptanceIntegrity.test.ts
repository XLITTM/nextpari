import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import { mapPlayerGameRpcError } from '../player/playerGameRpc.js';
import {
  PLAYER_SPORTS_PLACE_PATH,
  handlePlayerSportsRequest,
} from '../player/sportsPlaceHttp.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from '../player/playerCookies.js';
import type { SportsPlacePorts } from '../player/sportsPlaceService.js';
import { decideSportsQuote } from './quote.js';
import { evaluateSportsRisk } from './risk.js';
import { sanitizeSportsAcceptanceSnapshot } from './acceptanceAudit.js';
import {
  UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS,
  evaluateSportsAcceptanceGuardrails,
  potentialPayoutFromAcceptedOdds,
  sportsPlaceRequestFingerprint,
  type SportsAcceptanceSettings,
} from './acceptanceGuardrails.js';
import type { SportsQuote, SportsQuoteRequest } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL_047 = 'supabase/migrations/20260913230000_sports_bet_acceptance_integrity_047.sql';
const PLAYER_ID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

const sql = read(SQL_047);

const OPEN: SportsQuote = {
  provider: 'provider-a',
  feedType: 'inplay',
  fixtureId: '100',
  marketId: '1',
  marketKey: '100:1:',
  line: '',
  outcomeId: 'out-1',
  outcomeName: '1',
  price: 1.85,
  status: 'open',
  selectable: true,
  updatedAt: null,
  health: 'HEALTHY',
  heartbeatAgeMs: 40,
};

function requestFor(overrides: Partial<SportsQuoteRequest> = {}): SportsQuoteRequest {
  return {
    provider: 'provider-a',
    fixtureId: '100',
    marketId: '1',
    marketKey: '100:1:',
    line: '',
    outcomeId: 'out-1',
    price: 1.85,
    ...overrides,
  };
}

interface EngineBet {
  id: string;
  playerUserId: string;
  idempotencyKey: string;
  fingerprint: string;
  stake: number;
  acceptedOdds: number;
  potentialPayout: number;
  status: string;
}

interface EngineLeg {
  betId: string;
  provider: string;
  fixtureId: string;
  marketId: string;
  marketKey: string;
  outcomeId: string;
  acceptedOdds: number;
}

interface EngineLedger {
  id: string;
  walletId: string;
  availableDelta: number;
  lockedDelta: number;
  type: string;
  sourceType: string;
  sourceId: string;
}

interface EngineAudit {
  idempotencyKey: string;
  playerUserId: string;
  betId: string | null;
  providers: string;
  mode: string;
  stake: number;
  potentialPayout: number | null;
  decision: 'accepted' | 'rejected';
  decisionCode: string;
  oddsSnapshot: Record<string, unknown>;
}

class PlaceAttemptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PlaceAttemptError';
  }
}

class SportsAcceptanceEngine {
  settings: SportsAcceptanceSettings = { ...UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS };
  wallet = { available: 100, locked: 0 };
  bets = new Map<string, EngineBet>();
  legs: EngineLeg[] = [];
  ledger: EngineLedger[] = [];
  audits: EngineAudit[] = [];
  failWallet = false;
  failBet = false;
  private seq = 0;
  private lockTail = new Map<string, Promise<void>>();

  private key(playerUserId: string, idempotencyKey: string): string {
    return `${playerUserId}:${idempotencyKey}`;
  }

  private snapshot() {
    return {
      wallet: { ...this.wallet },
      bets: new Map([...this.bets].map(([key, bet]) => [key, { ...bet }])),
      legs: this.legs.map((leg) => ({ ...leg })),
      ledger: this.ledger.map((row) => ({ ...row })),
      audits: this.audits.map((row) => ({ ...row, oddsSnapshot: { ...row.oddsSnapshot } })),
    };
  }

  private restore(snapshot: ReturnType<SportsAcceptanceEngine['snapshot']>): void {
    this.wallet = snapshot.wallet;
    this.bets = snapshot.bets;
    this.legs = snapshot.legs;
    this.ledger = snapshot.ledger;
    this.audits = snapshot.audits;
  }

  private async withLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.lockTail.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockTail.set(lockKey, previous.then(() => gate, () => gate));
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async place(input: {
    playerUserId: string;
    idempotencyKey: string;
    stake: number;
    mode: 'single' | 'express';
    legs: Array<Record<string, unknown>>;
  }): Promise<{ betId: string; isDuplicate: boolean; acceptedOdds: number }> {
    const stake = Math.round((input.stake + Number.EPSILON) * 100) / 100;
    if (stake <= 0) throw new PlaceAttemptError('STAKE_NOT_POSITIVE');
    if (!input.legs.length) throw new PlaceAttemptError('SPORTS_LEGS_REQUIRED');
    if (input.mode === 'single' && input.legs.length !== 1) {
      throw new PlaceAttemptError('SPORTS_SINGLE_REQUIRES_ONE_LEG');
    }
    if (input.mode === 'express' && input.legs.length < 2) {
      throw new PlaceAttemptError('SPORTS_EXPRESS_REQUIRES_LEGS');
    }

    const acceptedOdds: number[] = [];
    const providers: string[] = [];
    for (const leg of input.legs) {
      const provider = String(leg.provider ?? '').trim().toLowerCase();
      if (!provider) throw new PlaceAttemptError('EVENT_UNAVAILABLE');
      if (!String(leg.fixtureId ?? '').trim()) throw new PlaceAttemptError('MISSING_FIXTURE');
      if (!String(leg.outcomeId ?? '').trim()) throw new PlaceAttemptError('MISSING_BET_ID');
      const price = Number(leg.acceptedOdds);
      if (!Number.isFinite(price) || price <= 1) throw new PlaceAttemptError('INVALID_PRICE');
      acceptedOdds.push(Math.round(price * 1000) / 1000);
      if (!providers.includes(provider)) providers.push(provider);
    }

    const combined = acceptedOdds.reduce((product, price) => product * price, 1);
    const payout = potentialPayoutFromAcceptedOdds(stake, acceptedOdds);
    const guard = evaluateSportsAcceptanceGuardrails(
      { stake, mode: input.mode, legCount: input.legs.length, potentialPayout: payout },
      this.settings,
    );
    if (!guard.ok) throw new PlaceAttemptError(guard.code);

    const fingerprint = sportsPlaceRequestFingerprint({
      stake,
      mode: input.mode,
      legs: input.legs,
    });
    const lockKey = this.key(input.playerUserId, input.idempotencyKey);

    try {
      return await this.withLock(lockKey, async () => {
        const snapshot = this.snapshot();
        try {
          await Promise.resolve();
          const existing = this.bets.get(lockKey);
          if (existing) {
            if (existing.fingerprint && existing.fingerprint !== fingerprint) {
              throw new PlaceAttemptError('SPORTS_BET_IDEMPOTENCY_CONFLICT');
            }
            return {
              betId: existing.id,
              isDuplicate: true,
              acceptedOdds: existing.acceptedOdds,
            };
          }

          if (this.failBet) throw new PlaceAttemptError('SPORTS_BET_INSERT_FAILED');

          this.seq += 1;
          const betId = `bet-${this.seq}`;
          const bet: EngineBet = {
            id: betId,
            playerUserId: input.playerUserId,
            idempotencyKey: input.idempotencyKey,
            fingerprint,
            stake,
            acceptedOdds: combined,
            potentialPayout: payout,
            status: 'accepted',
          };
          this.bets.set(lockKey, bet);
          for (const leg of input.legs) {
            this.legs.push({
              betId,
              provider: String(leg.provider ?? '').trim().toLowerCase(),
              fixtureId: String(leg.fixtureId ?? ''),
              marketId: String(leg.marketId ?? ''),
              marketKey: String(leg.marketKey ?? ''),
              outcomeId: String(leg.outcomeId ?? ''),
              acceptedOdds: Number(leg.acceptedOdds),
            });
          }

          if (this.failWallet) throw new PlaceAttemptError('WALLET_WRITE_FAILED');
          if (this.wallet.available < stake) throw new PlaceAttemptError('INSUFFICIENT_AVAILABLE_BALANCE');

          this.wallet.available -= stake;
          this.ledger.push({
            id: `led-${this.seq}`,
            walletId: 'wallet-1',
            availableDelta: -stake,
            lockedDelta: 0,
            type: 'CASINO_BET',
            sourceType: 'sports_bet',
            sourceId: betId,
          });

          this.audits.push({
            idempotencyKey: input.idempotencyKey,
            playerUserId: input.playerUserId,
            betId,
            providers: providers.join(','),
            mode: input.mode,
            stake,
            potentialPayout: payout,
            decision: 'accepted',
            decisionCode: 'ACCEPTED',
            oddsSnapshot: {
              acceptedOdds: combined,
              legs: input.legs.map((leg) => ({
                provider: leg.provider,
                fixtureId: leg.fixtureId,
                outcomeId: leg.outcomeId,
                acceptedOdds: leg.acceptedOdds,
              })),
            },
          });

          return { betId, isDuplicate: false, acceptedOdds: combined };
        } catch (error) {
          this.restore(snapshot);
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof PlaceAttemptError) {
        this.audits.push({
          idempotencyKey: input.idempotencyKey,
          playerUserId: input.playerUserId,
          betId: null,
          providers: providers.join(','),
          mode: input.mode,
          stake,
          potentialPayout: payout,
          decision: 'rejected',
          decisionCode: error.code,
          oddsSnapshot: { acceptedOdds },
        });
      }
      throw error;
    }
  }
}

function singleLeg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'provider-a',
    fixtureId: '100',
    marketId: '1',
    marketKey: '100:1:',
    line: '',
    outcomeId: 'out-1',
    acceptedOdds: 1.85,
    ...overrides,
  };
}

describe('047 sports bet acceptance SQL contract', () => {
  it('keeps one atomic place transaction on Wallet Ledger without rewriting money primitives', () => {
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /SET LOCAL statement_timeout = '10min'/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION private\.sports_engine_place_as\(/);
    assert.match(sql, /INSERT INTO private\.sports_bets \(/);
    assert.match(sql, /INSERT INTO private\.sports_bet_legs \(/);
    assert.match(sql, /private\.apply_wallet_entry\(/);
    assert.match(sql, /'CASINO_BET'/);
    assert.match(sql, /'sports-bet:' \|\| v_bet\.id::TEXT/);
    assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/);
    assert.match(sql, /WHEN unique_violation THEN/);
    assert.match(sql, /sports_bets_player_idempotency/);
    assert.match(sql, /t\.leg_json->>'acceptedOdds'/);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION private.apply_wallet_entry'), false);
    assert.equal(sql.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('INSERT INTO public.wallets'), false);
    assert.equal(sql.includes('CREATE OR REPLACE FUNCTION public.sports_place_for_player'), false);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.player_sports_place'), false);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.player_sports_place\(TEXT, NUMERIC, TEXT, JSONB\) FROM PUBLIC/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.player_sports_place\(TEXT, NUMERIC, TEXT, JSONB\) FROM anon, authenticated, service_role/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.sports_place_for_player\(UUID, TEXT, NUMERIC, TEXT, JSONB\) TO service_role/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.sports_place_for_player\(UUID, TEXT, NUMERIC, TEXT, JSONB\) FROM anon, authenticated/,
    );
  });

  it('adds fingerprint conflict, nullable guardrails, and append-only acceptance audit', () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS request_fingerprint TEXT/);
    assert.match(sql, /SPORTS_BET_IDEMPOTENCY_CONFLICT/);
    assert.match(sql, /private\.sports_place_request_fingerprint\(/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.sports_acceptance_settings/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.sports_bet_acceptance_events/);
    assert.match(sql, /SPORTS_STAKE_LIMIT/);
    assert.match(sql, /SPORTS_PAYOUT_LIMIT/);
    assert.match(sql, /SPORTS_EXPRESS_LEG_LIMIT/);
    assert.match(sql, /INSERT INTO private\.sports_acceptance_settings \(id, sports_betting_enabled\)/);
    assert.match(sql, /max_stake NUMERIC\(20, 2\),/);
    assert.match(sql, /max_potential_payout NUMERIC\(20, 2\),/);
    assert.match(sql, /max_express_legs INTEGER,/);
    assert.equal(/max_stake NUMERIC\(20, 2\)\s+NOT NULL/.test(sql), false);
    assert.equal(/max_potential_payout NUMERIC\(20, 2\)\s+NOT NULL/.test(sql), false);
    assert.equal(/max_stake\s*=\s*[0-9]/.test(sql), false);
    assert.equal(/max_potential_payout\s*=\s*[0-9]/.test(sql), false);
    assert.equal(/max_express_legs\s*=\s*[0-9]/.test(sql), false);
    assert.match(sql, /IF v_leg_provider IS NULL THEN/);
    assert.match(sql, /RAISE EXCEPTION 'EVENT_UNAVAILABLE'/);
    assert.equal(sql.includes("COALESCE(v_provider, 'lsports')"), false);
    assert.equal(sql.includes("DEFAULT 'lsports'"), false);
    assert.equal(sql.includes('BETB2B_'), false);
    assert.equal(sql.includes('https://'), false);
    assert.equal(/event liability|full risk management|fraud scoring/i.test(sql), false);
  });

  it('keeps settings and audit off browser roles and forbids secret material in audit inserts', () => {
    assert.match(sql, /REVOKE ALL ON TABLE private\.sports_acceptance_settings FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.sports_acceptance_settings FROM anon, authenticated/);
    assert.match(sql, /GRANT SELECT, UPDATE ON TABLE private\.sports_acceptance_settings TO service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.sports_bet_acceptance_events FROM PUBLIC/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.sports_bet_acceptance_events FROM anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON TABLE private\.sports_bet_acceptance_events TO service_role/);
    assert.equal(/GRANT[^\n]*INSERT[^\n]*private\.sports_bet_acceptance_events/.test(sql), false);
    assert.equal(/GRANT[^\n]*UPDATE[^\n]*private\.sports_bet_acceptance_events/.test(sql), false);
    assert.equal(/GRANT[^\n]*DELETE[^\n]*private\.sports_bet_acceptance_events/.test(sql), false);
    assert.equal(/GRANT[^\n]*authenticated/.test(sql), false);
    assert.equal(/GRANT[^\n]*anon/.test(sql), false);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.sports_record_acceptance_event\([^)]+\) FROM anon/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.sports_record_acceptance_event\([^)]+\) FROM authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.sports_record_acceptance_event\([^)]+\) TO service_role/,
    );
    assert.match(sql, /SPORTS_ACCEPTANCE_SECRET_FORBIDDEN/);
    assert.match(sql, /password\|authorization\|bearer \|service_role/);
    assert.equal(/UPDATE\s+private\.sports_bet_acceptance_events/.test(sql), false);
    assert.equal(/DELETE\s+FROM\s+private\.sports_bet_acceptance_events/.test(sql), false);
  });
});

describe('Nextpari sports acceptance guardrails', () => {
  it('does not invent a monetary or express-leg limit when values are NULL', () => {
    const huge = evaluateSportsAcceptanceGuardrails({
      stake: 1_000_000,
      mode: 'express',
      legCount: 40,
      potentialPayout: 9_999_999,
    });
    assert.deepEqual(huge, { ok: true });
    assert.equal(UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS.maxStake, null);
    assert.equal(UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS.maxPotentialPayout, null);
    assert.equal(UNCONFIGURED_SPORTS_ACCEPTANCE_SETTINGS.maxExpressLegs, null);
  });

  it('blocks configured max stake, payout, and express legs with stable codes', () => {
    const settings: SportsAcceptanceSettings = {
      sportsBettingEnabled: true,
      maxStake: 50,
      maxPotentialPayout: 100,
      maxExpressLegs: 3,
    };
    assert.equal(
      (evaluateSportsAcceptanceGuardrails(
        { stake: 50.01, mode: 'single', legCount: 1, potentialPayout: 90 },
        settings,
      ) as { ok: false; code: string }).code,
      'SPORTS_STAKE_LIMIT',
    );
    assert.equal(
      (evaluateSportsAcceptanceGuardrails(
        { stake: 10, mode: 'single', legCount: 1, potentialPayout: 100.01 },
        settings,
      ) as { ok: false; code: string }).code,
      'SPORTS_PAYOUT_LIMIT',
    );
    assert.equal(
      (evaluateSportsAcceptanceGuardrails(
        { stake: 10, mode: 'express', legCount: 4, potentialPayout: 40 },
        settings,
      ) as { ok: false; code: string }).code,
      'SPORTS_EXPRESS_LEG_LIMIT',
    );
    assert.deepEqual(
      evaluateSportsAcceptanceGuardrails(
        { stake: 50, mode: 'express', legCount: 3, potentialPayout: 100 },
        settings,
      ),
      { ok: true },
    );
  });

  it('computes potential payout from accepted odds for singles and express', () => {
    assert.equal(potentialPayoutFromAcceptedOdds(10, [1.85]), 18.5);
    assert.equal(potentialPayoutFromAcceptedOdds(10, [1.5, 2]), 30);
  });

  it('changes fingerprint when stake, selection, or odds change', () => {
    const base = {
      stake: 10,
      mode: 'single' as const,
      legs: [singleLeg()],
    };
    const same = sportsPlaceRequestFingerprint(base);
    assert.equal(sportsPlaceRequestFingerprint({ ...base }), same);
    assert.notEqual(sportsPlaceRequestFingerprint({ ...base, stake: 11 }), same);
    assert.notEqual(
      sportsPlaceRequestFingerprint({ ...base, legs: [singleLeg({ outcomeId: 'out-2' })] }),
      same,
    );
    assert.notEqual(
      sportsPlaceRequestFingerprint({ ...base, legs: [singleLeg({ acceptedOdds: 1.9 })] }),
      same,
    );
  });

  it('keeps evaluateSportsRisk as a no-op with no invented limits', () => {
    const decision = evaluateSportsRisk({
      stake: 1_000_000,
      mode: 'express',
      quotes: [OPEN, { ...OPEN, fixtureId: '200', outcomeId: 'out-2', price: 9.9 }],
    });
    assert.deepEqual(decision, { ok: true });
    const src = read('server/sports/risk.ts');
    assert.match(src, /Do not hardcode production stake\/event limits/);
  });
});

describe('fail-closed quote acceptance', () => {
  it('rejects stale, missing, suspended, non-selectable, invalid, changed, and mismatched-provider quotes', () => {
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, health: 'STALE' }) as { reason: string }).reason,
      'FEED_STALE',
    );
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, status: 'missing' }) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, status: 'suspended' }) as { reason: string }).reason,
      'MARKET_SUSPENDED',
    );
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, selectable: false }) as { reason: string }).reason,
      'MARKET_SUSPENDED',
    );
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, price: 1 }) as { reason: string }).reason,
      'INVALID_PRICE',
    );
    assert.equal(
      (decideSportsQuote(requestFor({ price: 9.99 }), OPEN) as { reason: string }).reason,
      'ODDS_CHANGED',
    );
    assert.equal(
      (decideSportsQuote(requestFor(), { ...OPEN, provider: 'provider-b' }) as { reason: string }).reason,
      'EVENT_UNAVAILABLE',
    );
    const ok = decideSportsQuote(requestFor(), OPEN);
    assert.equal(ok.ok, true);
  });
});

describe('atomic sports place engine', () => {
  it('debits exactly once for a successful single and stores server-accepted odds', async () => {
    const engine = new SportsAcceptanceEngine();
    const first = await engine.place({
      playerUserId: PLAYER_ID,
      idempotencyKey: 'single-1',
      stake: 10,
      mode: 'single',
      legs: [singleLeg({ acceptedOdds: 1.85 })],
    });
    assert.equal(first.isDuplicate, false);
    assert.equal(engine.bets.size, 1);
    assert.equal(engine.legs.length, 1);
    assert.equal(engine.ledger.length, 1);
    assert.equal(engine.ledger[0]?.availableDelta, -10);
    assert.equal(engine.ledger[0]?.type, 'CASINO_BET');
    assert.equal(engine.wallet.available, 90);
    assert.equal(engine.legs[0]?.acceptedOdds, 1.85);
    assert.equal(engine.audits.filter((row) => row.decision === 'accepted').length, 1);
  });

  it('debits exactly once for a successful express using canonical accepted odds', async () => {
    const engine = new SportsAcceptanceEngine();
    const placed = await engine.place({
      playerUserId: PLAYER_ID,
      idempotencyKey: 'express-1',
      stake: 10,
      mode: 'express',
      legs: [
        singleLeg({ acceptedOdds: 1.5 }),
        singleLeg({ fixtureId: '200', outcomeId: 'out-2', acceptedOdds: 2 }),
      ],
    });
    assert.equal(placed.isDuplicate, false);
    assert.equal(engine.ledger.length, 1);
    assert.equal(engine.ledger[0]?.availableDelta, -10);
    assert.equal(engine.bets.values().next().value?.potentialPayout, 30);
    assert.equal(engine.legs.length, 2);
  });

  it('returns the same bet on exact retry without a second debit', async () => {
    const engine = new SportsAcceptanceEngine();
    const args = {
      playerUserId: PLAYER_ID,
      idempotencyKey: 'retry-1',
      stake: 10,
      mode: 'single' as const,
      legs: [singleLeg()],
    };
    const first = await engine.place(args);
    const second = await engine.place(args);
    assert.equal(first.betId, second.betId);
    assert.equal(second.isDuplicate, true);
    assert.equal(engine.ledger.length, 1);
    assert.equal(engine.bets.size, 1);
    assert.equal(engine.wallet.available, 90);
  });

  it('rejects same-key retries that change stake, selection, or odds', async () => {
    const engine = new SportsAcceptanceEngine();
    await engine.place({
      playerUserId: PLAYER_ID,
      idempotencyKey: 'conflict-1',
      stake: 10,
      mode: 'single',
      legs: [singleLeg()],
    });

    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'conflict-1',
        stake: 15,
        mode: 'single',
        legs: [singleLeg()],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_BET_IDEMPOTENCY_CONFLICT',
    );
    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'conflict-1',
        stake: 10,
        mode: 'single',
        legs: [singleLeg({ outcomeId: 'out-other' })],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_BET_IDEMPOTENCY_CONFLICT',
    );
    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'conflict-1',
        stake: 10,
        mode: 'single',
        legs: [singleLeg({ acceptedOdds: 2.1 })],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_BET_IDEMPOTENCY_CONFLICT',
    );
    assert.equal(engine.bets.size, 1);
    assert.equal(engine.ledger.length, 1);
    assert.equal(engine.wallet.available, 90);
  });

  it('creates exactly one bet and one debit for concurrent same-key requests', async () => {
    const engine = new SportsAcceptanceEngine();
    const args = {
      playerUserId: PLAYER_ID,
      idempotencyKey: 'race-1',
      stake: 10,
      mode: 'single' as const,
      legs: [singleLeg()],
    };
    const [left, right] = await Promise.all([engine.place(args), engine.place(args)]);
    const originals = [left, right].filter((row) => row.isDuplicate === false);
    const duplicates = [left, right].filter((row) => row.isDuplicate === true);
    assert.equal(originals.length, 1);
    assert.equal(duplicates.length, 1);
    assert.equal(left.betId, right.betId);
    assert.equal(engine.bets.size, 1);
    assert.equal(engine.ledger.length, 1);
    assert.equal(engine.wallet.available, 90);
  });

  it('does not create a bet, legs, or wallet movement when a guardrail fails', async () => {
    const engine = new SportsAcceptanceEngine();
    engine.settings = {
      sportsBettingEnabled: true,
      maxStake: 5,
      maxPotentialPayout: 20,
      maxExpressLegs: 2,
    };
    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'limit-stake',
        stake: 10,
        mode: 'single',
        legs: [singleLeg()],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_STAKE_LIMIT',
    );
    engine.settings.maxStake = null;
    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'limit-payout',
        stake: 10,
        mode: 'single',
        legs: [singleLeg({ acceptedOdds: 3 })],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_PAYOUT_LIMIT',
    );
    await assert.rejects(
      () => engine.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'limit-legs',
        stake: 5,
        mode: 'express',
        legs: [
          singleLeg({ acceptedOdds: 1.2 }),
          singleLeg({ fixtureId: '200', outcomeId: 'out-2', acceptedOdds: 1.2 }),
          singleLeg({ fixtureId: '300', outcomeId: 'out-3', acceptedOdds: 1.2 }),
        ],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_EXPRESS_LEG_LIMIT',
    );
    assert.equal(engine.bets.size, 0);
    assert.equal(engine.legs.length, 0);
    assert.equal(engine.ledger.length, 0);
    assert.equal(engine.wallet.available, 100);
    assert.equal(engine.audits.every((row) => row.decision === 'rejected'), true);
  });

  it('rolls back the bet when wallet write fails and leaves wallet unchanged when bet insert fails', async () => {
    const walletFail = new SportsAcceptanceEngine();
    walletFail.failWallet = true;
    await assert.rejects(
      () => walletFail.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'wallet-fail',
        stake: 10,
        mode: 'single',
        legs: [singleLeg()],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'WALLET_WRITE_FAILED',
    );
    assert.equal(walletFail.bets.size, 0);
    assert.equal(walletFail.legs.length, 0);
    assert.equal(walletFail.ledger.length, 0);
    assert.equal(walletFail.wallet.available, 100);

    const betFail = new SportsAcceptanceEngine();
    betFail.failBet = true;
    await assert.rejects(
      () => betFail.place({
        playerUserId: PLAYER_ID,
        idempotencyKey: 'bet-fail',
        stake: 10,
        mode: 'single',
        legs: [singleLeg()],
      }),
      (error: unknown) => error instanceof PlaceAttemptError && error.code === 'SPORTS_BET_INSERT_FAILED',
    );
    assert.equal(betFail.ledger.length, 0);
    assert.equal(betFail.wallet.available, 100);
    assert.equal(betFail.bets.size, 0);
  });

  it('writes accepted and rejected audit rows without secret material', async () => {
    const engine = new SportsAcceptanceEngine();
    await engine.place({
      playerUserId: PLAYER_ID,
      idempotencyKey: 'audit-ok',
      stake: 10,
      mode: 'single',
      legs: [singleLeg()],
    });
    await assert.rejects(() => engine.place({
      playerUserId: PLAYER_ID,
      idempotencyKey: 'audit-ok',
      stake: 11,
      mode: 'single',
      legs: [singleLeg()],
    }));
    const accepted = engine.audits.find((row) => row.decision === 'accepted');
    const rejected = engine.audits.find((row) => row.decision === 'rejected');
    assert.ok(accepted);
    assert.ok(rejected);
    assert.equal(accepted?.betId, 'bet-1');
    assert.equal(rejected?.decisionCode, 'SPORTS_BET_IDEMPOTENCY_CONFLICT');
    const serialized = JSON.stringify(engine.audits);
    assert.equal(/password|authorization|bearer |service_role|eyJ[A-Za-z0-9_-]{20,}/i.test(serialized), false);

    const cleaned = sanitizeSportsAcceptanceSnapshot({
      acceptedOdds: 1.85,
      password: 'secret',
      authorization: 'Bearer aaa',
      serviceRoleKey: 'super-secret',
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aa.bb',
    });
    assert.equal(cleaned.acceptedOdds, 1.85);
    assert.equal(cleaned.password, '[redacted]');
    assert.equal(cleaned.authorization, '[redacted]');
    assert.equal(cleaned.serviceRoleKey, '[redacted]');
    assert.equal(cleaned.jwt, '[redacted]');
  });
});

describe('player sports place HTTP acceptance integrity', () => {
  const enabled = { CANONICAL_SPORTS_BET_ENABLED: '1' };

  function cookieHeader(): string {
    return `${PLAYER_ACCESS_COOKIE}=player-access-token; ${PLAYER_REFRESH_COOKIE}=player-refresh-token`;
  }

  function createPorts(init?: {
    quote?: SportsQuote;
    fetchQuote?: (request: SportsQuoteRequest) => Promise<SportsQuote>;
    placeImpl?: SportsPlacePorts['placeAsVerifiedPlayer'];
  }) {
    const places: Array<Record<string, unknown>> = [];
    const audits: Array<{ decision: string; decisionCode: string }> = [];
    const ports: SportsPlacePorts & {
      places: Array<Record<string, unknown>>;
      audits: Array<{ decision: string; decisionCode: string }>;
    } = {
      places,
      audits,
      async signInWithPassword() {
        throw staffError('AUTH_FAILED', 401);
      },
      async signUp() {
        throw staffError('AUTH_FAILED', 401);
      },
      async refreshSession() {
        return { accessToken: 'a', refreshToken: 'r' };
      },
      async getAuthUser() {
        return { id: PLAYER_ID, email: 'player@nextpari.test' };
      },
      async ensurePlayerAccount() {
        return {
          walletId: '11111111-2222-3333-4444-555555555555',
          publicId: '110790',
          legacyBalance: 50,
          migrationState: 'staging',
        };
      },
      async loadOwnWallet() {
        return { balance: 50, currency: 'TMTM', status: 'active', publicId: '110790' };
      },
      async savePlayerProfile() {},
      fetchQuote: async (request) => {
        if (init?.fetchQuote) return init.fetchQuote(request);
        return init?.quote ?? { ...OPEN, fixtureId: String(request.fixtureId), outcomeId: String(request.outcomeId) };
      },
      placeAsVerifiedPlayer: init?.placeImpl ?? (async (args) => {
        places.push(args as unknown as Record<string, unknown>);
        return {
          ok: true,
          isDuplicate: false,
          betId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          stake: args.stake,
          acceptedOdds: args.legs[0]?.acceptedOdds,
          balanceAfter: 40,
        };
      }),
      async recordAcceptance(event) {
        audits.push({ decision: event.decision, decisionCode: event.decisionCode });
      },
      gameRpc() {
        return { async invoke() { return { ok: true }; } };
      },
    };
    return ports;
  }

  async function place(ports: SportsPlacePorts, body: Record<string, unknown>) {
    return handlePlayerSportsRequest(
      {
        method: 'POST',
        pathname: PLAYER_SPORTS_PLACE_PATH,
        cookie: cookieHeader(),
        cookieSecure: true,
        body,
      },
      ports,
      { error() {} },
      enabled,
    );
  }

  it('persists server-accepted odds instead of a client acceptedOdds field and records quote rejects', async () => {
    const ports = createPorts({
      quote: { ...OPEN, fixtureId: '19981248', marketId: '1', marketKey: '19981248:1:', outcomeId: '117469638719981250', price: 1.85 },
    });
    const ok = await place(ports, {
      stake: 10,
      mode: 'single',
      idempotencyKey: 'server-odds',
      selections: [{
        provider: 'provider-a',
        fixtureId: '19981248',
        marketId: '1',
        marketKey: '19981248:1:',
        outcomeId: '117469638719981250',
        price: 1.85,
        acceptedOdds: 99.99,
      }],
    });
    assert.equal(ok.status, 200);
    const placed = ports.places[0] as { legs: Array<{ acceptedOdds: number }> };
    assert.equal(placed.legs[0]?.acceptedOdds, 1.85);

    const stale = createPorts({
      quote: { ...OPEN, fixtureId: '19981248', marketId: '1', marketKey: '19981248:1:', outcomeId: '117469638719981250', health: 'STALE' },
    });
    const staleResult = await place(stale, {
      stake: 10,
      mode: 'single',
      idempotencyKey: 'stale',
      selections: [{
        provider: 'provider-a',
        fixtureId: '19981248',
        marketId: '1',
        marketKey: '19981248:1:',
        outcomeId: '117469638719981250',
        price: 1.85,
      }],
    });
    assert.equal(staleResult.body.error, 'FEED_STALE');
    assert.equal(stale.places.length, 0);
    assert.deepEqual(stale.audits[0], { decision: 'rejected', decisionCode: 'FEED_STALE' });

    const missing = createPorts({
      quote: { ...OPEN, fixtureId: '19981248', marketId: '1', marketKey: '19981248:1:', outcomeId: '117469638719981250', status: 'missing' },
    });
    const missingResult = await place(missing, {
      stake: 10,
      mode: 'single',
      idempotencyKey: 'missing',
      selections: [{
        provider: 'provider-a',
        fixtureId: '19981248',
        marketId: '1',
        marketKey: '19981248:1:',
        outcomeId: '117469638719981250',
        price: 1.85,
      }],
    });
    assert.equal(missingResult.body.error, 'EVENT_UNAVAILABLE');
    assert.equal(missing.places.length, 0);

    const mismatch = createPorts({
      quote: { ...OPEN, provider: 'provider-b', fixtureId: '19981248', marketId: '1', marketKey: '19981248:1:', outcomeId: '117469638719981250' },
    });
    const mismatchResult = await place(mismatch, {
      stake: 10,
      mode: 'single',
      idempotencyKey: 'mismatch',
      selections: [{
        provider: 'provider-a',
        fixtureId: '19981248',
        marketId: '1',
        marketKey: '19981248:1:',
        outcomeId: '117469638719981250',
        price: 1.85,
      }],
    });
    assert.equal(mismatchResult.body.error, 'EVENT_UNAVAILABLE');
    assert.equal(mismatch.places.length, 0);
  });

  it('maps new integrity codes and does not expose a browser money RPC', () => {
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_BET_IDEMPOTENCY_CONFLICT' }).code, 'SPORTS_BET_IDEMPOTENCY_CONFLICT');
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_STAKE_LIMIT' }).code, 'SPORTS_STAKE_LIMIT');
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_PAYOUT_LIMIT' }).code, 'SPORTS_PAYOUT_LIMIT');
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_EXPRESS_LEG_LIMIT' }).code, 'SPORTS_EXPRESS_LEG_LIMIT');
    assert.equal(mapPlayerGameRpcError({ message: 'SPORTS_STAKE_LIMIT' }).httpStatus, 409);

    const placeSrc = read('server/player/sportsPlaceService.ts');
    const rpcSrc = read('server/sports/placeRpc.ts');
    assert.match(placeSrc, /acceptedOdds: decision\.quote\.price/);
    assert.equal(placeSrc.includes('player_sports_place'), false);
    assert.equal(placeSrc.includes('UPDATE public.wallets'), false);
    assert.equal(rpcSrc.includes('sports_place_for_player'), true);
    assert.equal(rpcSrc.includes('player_sports_place'), false);
  });
});
