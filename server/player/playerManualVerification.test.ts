import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_EMAIL_START_PATH,
  PLAYER_EMAIL_VERIFY_PATH,
  PLAYER_VERIFICATION_NOTICE_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import {
  deliverPendingManualVerificationInstructions,
  PLAYER_VERIFICATION_BIND_ACTION,
  PLAYER_VERIFICATION_BIND_HINT,
  PLAYER_VERIFICATION_EMAIL_SUBJECT,
  PLAYER_VERIFICATION_NOTICE_TITLE,
  PLAYER_VERIFICATION_SUPPORT_FALLBACK,
  publicPlayerVerificationNotice,
  playerSupportMailto,
  type ManualVerificationDeliveryPorts,
} from '../email/playerManualVerificationService.js';
import {
  generatePlayerEmailOtp,
  hashPlayerEmailOtp,
  verifyPlayerEmailBinding,
  type PlayerEmailChallengeRow,
  type PlayerEmailPorts,
} from '../email/playerEmailService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import type { OwnerRpcPort } from '../owner/ownerRpc.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleSecurityControlRequest } from '../security/securityControlHttp.js';
import { SECURITY_DENIED_RPCS } from '../security/securityRpc.js';
import type { SecurityAuthGatewayPorts } from '../staff/securityAuthService.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from '../staff/securityCookies.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const USER = '11111111-2222-4333-8444-555555555555';
const PLAYER_ID = '110790';
const PEPPER = 'test-pepper-not-for-production';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260915010000_player_manual_verification_055.sql'),
  'utf8',
);
const sql051 = readFileSync(
  join(root, 'supabase/migrations/20260914033000_security_staff_portal_051.sql'),
  'utf8',
);
const sql052 = readFileSync(
  join(root, 'supabase/migrations/20260914043000_player_win_pattern_risk_signals_052.sql'),
  'utf8',
);
const sql053 = readFileSync(
  join(root, 'supabase/migrations/20260914050000_fix_owner_financial_dashboard_053.sql'),
  'utf8',
);
const sql054 = readFileSync(
  join(root, 'supabase/migrations/20260914060000_player_password_recovery_054.sql'),
  'utf8',
);

function extractActionCheck(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, marker);
  const open = source.indexOf('IN (', start);
  const close = source.indexOf(')', open);
  assert.ok(open > start && close > open, marker);
  return [...source.slice(open, close).matchAll(/'([^']+)'/g)].map((row) => row[1]);
}

function cookie(): string {
  return `${PLAYER_ACCESS_COOKIE}=${ACCESS}; ${PLAYER_REFRESH_COOKIE}=${REFRESH}`;
}

function createAuthPorts(): PlayerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async signUp() { throw new Error('signUp should not run'); },
    async refreshSession() { throw staffError('JWT_INVALID', 401); },
    async getAuthUser() { return { id: USER, email: 'player@nextpari.test', emailConfirmed: false }; },
    async ensurePlayerAccount() {
      return { walletId: 'w', publicId: PLAYER_ID, legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 42, currency: 'TMTM', status: 'active', publicId: PLAYER_ID };
    },
    async savePlayerProfile() { throw new Error('savePlayerProfile should not run'); },
  };
}

describe('manual player verification SQL contract', () => {
  it('stores a request without inferring restriction from email or verification status', () => {
    const requestStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.request_player_manual_verification(');
    const requestEnd = sql.indexOf('CREATE OR REPLACE FUNCTION private.read_player_manual_verification(');
    const request = sql.slice(requestStart, requestEnd);
    assert.match(sql, /CHECK \(status IN \('VERIFICATION_REQUIRED', 'VERIFIED'\)\)/);
    assert.match(request, /status = 'VERIFICATION_REQUIRED'/);
    assert.match(request, /requested_by/);
    assert.match(request, /requested_by_role/);
    assert.match(request, /restriction_enabled_with_request = TRUE/);
    assert.equal(request.includes('p_restrict'), false);
    assert.equal(request.includes('COALESCE(p_restrict'), false);
    assert.equal(/v_restrict :=\s*NOT/.test(request), false);
    assert.equal(request.includes('IF NOT private.player_has_verified_email'), false);
    const restrictCall = request.indexOf('PERFORM private.set_player_security_restriction');
    assert.equal(restrictCall > 0, true);
    assert.match(request, /set_player_security_restriction\([\s\S]*TRUE/);
    assert.equal(request.includes('owner_set_player_blocked'), false);
    assert.equal(request.includes('apply_wallet_entry'), false);
    assert.equal(request.includes('UPDATE public.wallets'), false);
    assert.equal(sql.includes('INSERT INTO private.wallet_ledger'), false);

    const noticeStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_manual_verification_safe_notice(');
    const notice = sql.slice(noticeStart, sql.indexOf('CREATE OR REPLACE FUNCTION private.player_manual_verification_claim_instruction_send('));
    assert.equal(notice.includes('set_player_security_restriction'), false);
    assert.equal(notice.includes('requested_by'), false);
    assert.equal(notice.includes('reason_code'), false);
    assert.match(notice, /has_verified_email/);
    assert.match(notice, /bind_email_required/);
    assert.match(notice, /VERIFICATION_REQUIRED/);

    const claim = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.player_manual_verification_claim_instruction_send('),
      sql.indexOf('CREATE OR REPLACE FUNCTION private.player_manual_verification_mark_instructions_sent('),
    );
    assert.equal(claim.includes('set_player_security_restriction'), false);
    assert.match(claim, /instructions_sent_at IS NOT NULL/);
    assert.match(claim, /private\.player_verified_email/);
    assert.equal(claim.includes('p_email'), false);
  });

  it('denies browser table access and keeps service-role execute-only on delivery RPCs', () => {
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_manual_verification_requests FROM anon, authenticated/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_manual_verification_requests FROM service_role/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_request_player_manual_verification\(TEXT, TEXT, TEXT\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_complete_player_manual_verification\(TEXT\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.security_complete_player_manual_verification\(TEXT\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_manual_verification_notice\(\) TO authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_manual_verification_claim_instruction_send\(UUID\) FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_manual_verification_claim_instruction_send\(UUID\) TO service_role/);
    assert.equal(sql.includes('GRANT EXECUTE ON FUNCTION public.player_manual_verification_claim_instruction_send(UUID) TO authenticated'), false);
    assert.equal(sql.includes('GRANT ALL ON TABLE auth.users'), false);
    const files = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.includes('_055.sql'));
    assert.deepEqual(files, ['20260915010000_player_manual_verification_055.sql']);
  });

  it('extends security_staff_actions_action_check for verification audit actions', () => {
    const previous = extractActionCheck(
      sql051,
      'CONSTRAINT security_staff_actions_action_check CHECK (action IN (',
    );
    assert.deepEqual(previous, [
      'SECURITY_FLAG_REVIEWED',
      'SECURITY_FLAG_RESOLVED',
      'SECURITY_FLAG_DISMISSED',
      'SECURITY_RESTRICTION_APPLIED',
      'SECURITY_RESTRICTION_REMOVED',
      'OWNER_CREATED_SECURITY_STAFF',
      'OWNER_SET_SECURITY_STAFF_STATUS',
      'OWNER_RESET_SECURITY_PASSWORD',
    ]);
    assert.equal(sql052.includes('security_staff_actions_action_check'), false);
    assert.equal(sql053.includes('security_staff_actions_action_check'), false);
    assert.equal(sql054.includes('security_staff_actions_action_check'), false);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS\s+security_staff_actions_action_check/);
    const extended = extractActionCheck(
      sql,
      'ADD CONSTRAINT security_staff_actions_action_check CHECK (action IN (',
    );
    assert.deepEqual(extended, [
      ...previous,
      'PLAYER_MANUAL_VERIFICATION_REQUESTED',
      'PLAYER_MANUAL_VERIFICATION_COMPLETED',
    ]);
    const requestFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_request_player_manual_verification('),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_complete_player_manual_verification('),
    );
    const completeFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_complete_player_manual_verification('),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_manual_verification_notice('),
    );
    assert.match(requestFn, /PERFORM private\.security_record_action\([\s\S]*'PLAYER_MANUAL_VERIFICATION_REQUESTED'/);
    assert.match(completeFn, /PERFORM private\.security_record_action\([\s\S]*'PLAYER_MANUAL_VERIFICATION_COMPLETED'/);
    const recorded = [...sql.matchAll(/PERFORM private\.security_record_action\(([\s\S]*?)\);/g)]
      .map((row) => [...row[1].matchAll(/'([^']+)'/g)].map((item) => item[1]))
      .map((values) => values[1]);
    assert.deepEqual(recorded, [
      'PLAYER_MANUAL_VERIFICATION_REQUESTED',
      'PLAYER_MANUAL_VERIFICATION_COMPLETED',
    ]);
    for (const action of recorded) {
      assert.equal(extended.includes(action), true, action);
    }
  });
});

describe('player verification notice HTTP', () => {
  it('exposes a safe notice and never returns internal risk metadata', async () => {
    const deliveries: string[] = [];
    const result = await handlePlayerAuthRequest(
      { method: 'GET', pathname: PLAYER_VERIFICATION_NOTICE_PATH, cookie: cookie(), cookieSecure: true },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      {
        async readNotice() {
          return publicPlayerVerificationNotice({
            verification_requested: true,
            verification_status: 'VERIFICATION_REQUIRED',
            requested_at: '2026-09-15T00:00:00.000Z',
            has_verified_email: false,
            bind_email_required: true,
            instructions_sent: false,
            requested_by: 'staff-uuid',
            reason: 'INTERNAL_FRAUD_NOTE',
            reason_code: 'RM-9',
          }, null);
        },
        async deliverInstructions(playerUserId) {
          deliveries.push(playerUserId);
        },
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.verificationRequested, true);
    assert.equal(result.body.verificationStatus, 'VERIFICATION_REQUIRED');
    assert.equal(result.body.hasVerifiedEmail, false);
    assert.equal(result.body.bindEmailRequired, true);
    assert.equal(result.body.title, PLAYER_VERIFICATION_NOTICE_TITLE);
    assert.equal(result.body.message, PLAYER_VERIFICATION_BIND_HINT);
    assert.equal(result.body.supportConfigured, false);
    assert.equal(result.body.supportEmail, null);
    assert.equal(result.body.supportMessage, PLAYER_VERIFICATION_SUPPORT_FALLBACK);
    assert.equal(JSON.stringify(result.body).includes('staff-uuid'), false);
    assert.equal(JSON.stringify(result.body).includes('INTERNAL_FRAUD_NOTE'), false);
    assert.equal(JSON.stringify(result.body).includes('RM-9'), false);
    assert.equal(JSON.stringify(result.body).includes('mailto:'), false);
    assert.deepEqual(deliveries, [USER]);
  });

  it('shows support mailto only when a real support address is configured', () => {
    const missing = publicPlayerVerificationNotice({ verification_requested: true }, null);
    assert.equal(missing.supportConfigured, false);
    assert.equal(playerSupportMailto(missing.supportEmail), null);
    const configured = publicPlayerVerificationNotice(
      { verification_requested: true, has_verified_email: true },
      'support@example.test',
    );
    assert.equal(configured.supportConfigured, true);
    assert.equal(
      playerSupportMailto(configured.supportEmail),
      `mailto:support@example.test?subject=${encodeURIComponent(PLAYER_VERIFICATION_EMAIL_SUBJECT)}`,
    );
    const client = readFileSync(join(root, 'src/lib/playerVerification.ts'), 'utf8');
    const banner = readFileSync(join(root, 'src/components/player/PlayerVerificationNoticeBanner.tsx'), 'utf8');
    assert.match(client, /PLAYER_SUPPORT_EMAIL|supportEmail/);
    assert.equal(client.includes('support@nextpari.com'), false);
    assert.match(banner, /playerSupportMailto/);
    assert.equal(banner.includes('mailto:support@'), false);
    assert.equal(banner.includes('support@nextpari.com'), false);
    assert.match(banner, /PLAYER_VERIFICATION_BIND_ACTION/);
    assert.match(banner, /EmailBindModal/);
    assert.equal(banner.includes('<input'), false);
    assert.equal(PLAYER_VERIFICATION_BIND_ACTION, 'Привязать email');
  });
});

describe('instruction delivery idempotency', () => {
  it('sends once for an active request and does not change restriction state', async () => {
    const sent: string[] = [];
    const marked: string[] = [];
    const restrictionCalls: string[] = [];
    let claimed = false;
    const ports: ManualVerificationDeliveryPorts = {
      async claimInstructionSend() {
        if (claimed) return { ok: false, alreadySent: true };
        claimed = true;
        return { ok: true, alreadySent: false, email: 'player@nextpari.test' };
      },
      async markInstructionsSent(playerUserId) { marked.push(playerUserId); },
      async releaseInstructionSend() {},
      async sendEmail(message) {
        sent.push(message.to);
        assert.equal(message.subject, PLAYER_VERIFICATION_EMAIL_SUBJECT);
        assert.equal(message.text.includes('парол'), true);
        assert.equal(message.text.includes('INTERNAL'), false);
      },
    };
    const first = await deliverPendingManualVerificationInstructions(USER, ports);
    const second = await deliverPendingManualVerificationInstructions(USER, ports);
    assert.deepEqual(first, { sent: true, alreadySent: false });
    assert.deepEqual(second, { sent: false, alreadySent: true });
    assert.deepEqual(sent, ['player@nextpari.test']);
    assert.deepEqual(marked, [USER]);
    assert.deepEqual(restrictionCalls, []);
  });
});

describe('email bind still works and can deliver pending instructions', () => {
  it('keeps the existing OTP bind flow and delivers instructions only after verify', async () => {
    const after: Array<{ userId: string; email: string }> = [];
    const code = '654321';
    const active: PlayerEmailChallengeRow | null = {
      id: 'challenge-1',
      email_normalized: 'new@nextpari.test',
      code_hash: hashPlayerEmailOtp(code, PEPPER),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      attempt_count: 0,
      max_attempts: 5,
      consumed_at: null,
    };
    const ports: PlayerEmailPorts = {
      async getAuthUser() { return { id: USER, email: '' }; },
      async refreshSession() { throw staffError('JWT_INVALID', 401); },
      async sendEmail() {},
      generateCode: () => code,
      hashCode: (value) => hashPlayerEmailOtp(value, PEPPER),
      async isEmailTaken() { return false; },
      async createChallenge() { return { id: 'challenge-1' }; },
      async markChallengeUnusable() {},
      async loadActiveChallenge() { return active; },
      async registerFailure() { return 1; },
      async consumeChallenge() { return true; },
      async updateAuthEmail() {},
      async syncProfileEmail() {},
      async afterEmailVerified(userId, email) { after.push({ userId, email }); },
    };
    const verified = await verifyPlayerEmailBinding(ports, cookie(), { code }, true);
    assert.equal(verified.status, 200);
    assert.deepEqual(after, [{ userId: USER, email: 'new@nextpari.test' }]);
    assert.equal(typeof generatePlayerEmailOtp, 'function');
    assert.equal(PLAYER_EMAIL_START_PATH.includes('/api/player/email/start'), true);
    assert.equal(PLAYER_EMAIL_VERIFY_PATH.includes('/api/player/email/verify'), true);
  });
});

describe('owner and security verification request HTTP', () => {
  it('owner request verification always enables the existing Security restriction without a browser p_restrict flag', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const result = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/players/${PLAYER_ID}/verification-request`,
        cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
        cookieSecure: true,
        body: { reason: 'manual review', restrict: false },
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async signOutCurrentSession() {},
          async currentStaffContext() {
            return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
          },
        } as OwnerAuthGatewayPorts,
        rpcFactory: (): OwnerRpcPort => ({
          async invoke(name, args) {
            calls.push({ name, args });
            return {
              ok: true,
              player_user_id: USER,
              has_verified_email: false,
              restriction_enabled_with_request: true,
              restricted: true,
              status: 'VERIFICATION_REQUIRED',
            };
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0]?.name, 'owner_request_player_manual_verification');
    assert.equal('p_restrict' in (calls[0]?.args ?? {}), false);
    assert.equal(calls[0]?.args?.p_reason, 'manual review');
    assert.equal(calls.some((call) => call.name === 'owner_set_player_blocked'), false);
    const http = readFileSync(join(root, 'server/owner/ownerControlHttp.ts'), 'utf8');
    const requestInvoke = http.slice(
      http.indexOf("case 'playerManualVerificationSet'"),
      http.indexOf("case 'playerManualVerificationComplete'"),
    );
    assert.equal(requestInvoke.includes('p_restrict'), false);
  });

  it('security request verification always enables restriction without a browser p_restrict flag', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const result = await handleSecurityControlRequest(
      {
        method: 'POST',
        pathname: `/api/security/players/${PLAYER_ID}/verification-request`,
        cookie: `${SECURITY_ACCESS_COOKIE}=sec-access; ${SECURITY_REFRESH_COOKIE}=sec-refresh`,
        cookieSecure: true,
        body: { reason: 'docs', restrict: false },
      },
      {
        sessionPorts: {
          async lookupLoginEmail() { return 'sec@nextpari.test'; },
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async signOutCurrentSession() {},
          async currentStaffContext() {
            return { role: 'security', status: 'active', auth_user_id: 'sec-uid', display_name: 'Sec', login: 'security01' };
          },
        } as SecurityAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name, args) {
            calls.push({ name, args });
            return {
              ok: true,
              player_user_id: USER,
              restriction_enabled_with_request: true,
              has_verified_email: false,
              restricted: true,
              status: 'VERIFICATION_REQUIRED',
            };
          },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(calls[0]?.name, 'security_request_player_manual_verification');
    assert.equal('p_restrict' in (calls[0]?.args ?? {}), false);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_set_player_blocked'), true);
  });

  it('owner and security can mark verification VERIFIED without removing restriction', async () => {
    const ownerCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const owner = await handleOwnerControlRequest(
      {
        method: 'POST',
        pathname: `/api/owner/players/${PLAYER_ID}/verification-complete`,
        cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
        cookieSecure: true,
        body: {},
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async signOutCurrentSession() {},
          async currentStaffContext() {
            return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
          },
        } as OwnerAuthGatewayPorts,
        rpcFactory: (): OwnerRpcPort => ({
          async invoke(name, args) {
            ownerCalls.push({ name, args });
            return { ok: true, status: 'VERIFIED', restricted: true };
          },
        }),
      },
    );
    assert.equal(owner.status, 200);
    assert.equal(ownerCalls[0]?.name, 'owner_complete_player_manual_verification');
    assert.equal(ownerCalls.some((call) => call.name === 'owner_set_player_security_restriction'), false);

    const securityCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const security = await handleSecurityControlRequest(
      {
        method: 'POST',
        pathname: `/api/security/players/${PLAYER_ID}/verification-complete`,
        cookie: `${SECURITY_ACCESS_COOKIE}=sec-access; ${SECURITY_REFRESH_COOKIE}=sec-refresh`,
        cookieSecure: true,
        body: {},
      },
      {
        sessionPorts: {
          async lookupLoginEmail() { return 'sec@nextpari.test'; },
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async signOutCurrentSession() {},
          async currentStaffContext() {
            return { role: 'security', status: 'active', auth_user_id: 'sec-uid', display_name: 'Sec', login: 'security01' };
          },
        } as SecurityAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name, args) {
            securityCalls.push({ name, args });
            return { ok: true, status: 'VERIFIED', restricted: true };
          },
        }),
      },
    );
    assert.equal(security.status, 200);
    assert.equal(securityCalls[0]?.name, 'security_complete_player_manual_verification');
    assert.equal(securityCalls.some((call) => call.name === 'security_set_player_security_restriction'), false);
  });
});

describe('security restriction remains explicit-only', () => {
  it('automated verification delivery and email bind never enable Security restriction', () => {
    const autoFns = [
      'private.player_manual_verification_safe_notice',
      'private.player_manual_verification_claim_instruction_send',
      'private.player_manual_verification_mark_instructions_sent',
      'private.player_manual_verification_release_instruction_send',
      'private.complete_player_manual_verification',
      'public.player_manual_verification_notice',
    ];
    for (const name of autoFns) {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      assert.equal(start >= 0, true, name);
      const next = sql.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
      const body = next >= 0 ? sql.slice(start, next) : sql.slice(start);
      assert.equal(body.includes('set_player_security_restriction'), false, name);
      assert.equal(body.includes('owner_set_player_blocked'), false, name);
      assert.equal(body.includes('apply_wallet_entry'), false, name);
    }
    const completeStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.complete_player_manual_verification(');
    const complete = sql.slice(completeStart, sql.indexOf('CREATE OR REPLACE FUNCTION private.player_manual_verification_safe_notice('));
    assert.match(complete, /status = 'VERIFIED'/);
    assert.match(complete, /VERIFICATION_COMPLETED/);
    assert.equal(complete.includes('set_player_security_restriction'), false);
    assert.match(sql, /VERIFICATION_REQUESTED/);
    assert.match(sql, /VERIFICATION_COMPLETED/);

    const delivery = readFileSync(join(root, 'server/email/playerManualVerificationService.ts'), 'utf8');
    const emailBind = readFileSync(join(root, 'server/email/playerEmailService.ts'), 'utf8');
    const playerHttp = readFileSync(join(root, 'server/player/playerAuthHttp.ts'), 'utf8');
    const env = readFileSync(join(root, 'server/staff/env.ts'), 'utf8');
    const flagsSql = readFileSync(join(root, 'supabase/migrations/20260913234500_player_fraud_security_foundation_048.sql'), 'utf8');
    assert.equal(delivery.includes('set_player_security_restriction'), false);
    assert.equal(delivery.includes('owner_set_player_blocked'), false);
    assert.equal(delivery.includes("'VERIFIED'"), false);
    assert.match(emailBind, /afterEmailVerified/);
    assert.match(emailBind, /deliverPendingManualVerificationInstructions/);
    assert.equal(emailBind.includes('set_player_security_restriction'), false);
    assert.equal(emailBind.includes('complete_player_manual_verification'), false);
    assert.equal(emailBind.includes("'VERIFIED'"), false);
    assert.match(playerHttp, /PLAYER_VERIFICATION_NOTICE_PATH/);
    assert.equal(playerHttp.includes('set_player_security_restriction'), false);
    assert.equal(playerHttp.includes('verification-complete'), false);
    assert.equal(playerHttp.includes('complete_player_manual_verification'), false);
    assert.match(env, /PLAYER_SUPPORT_EMAIL/);
    assert.equal(env.includes('support@nextpari.com'), false);
    assert.equal(flagsSql.includes('request_player_manual_verification'), false);
    const ownerApi = readFileSync(join(root, 'api/owner/players/[playerId]/verification-request.ts'), 'utf8');
    const securityApi = readFileSync(join(root, 'api/security/players/[playerId]/verification-request.ts'), 'utf8');
    const ownerComplete = readFileSync(join(root, 'api/owner/players/[playerId]/verification-complete.ts'), 'utf8');
    const securityComplete = readFileSync(join(root, 'api/security/players/[playerId]/verification-complete.ts'), 'utf8');
    const playerApi = readFileSync(join(root, 'api/player/verification-notice.ts'), 'utf8');
    assert.match(ownerApi, /verification-request/);
    assert.match(securityApi, /verification-request/);
    assert.match(ownerComplete, /verification-complete/);
    assert.match(securityComplete, /verification-complete/);
    assert.match(playerApi, /PLAYER_VERIFICATION_NOTICE_PATH/);
  });
});
