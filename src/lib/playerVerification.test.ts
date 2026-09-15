import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_VERIFICATION_BIND_ACTION,
  PLAYER_VERIFICATION_BIND_HINT,
  PLAYER_VERIFICATION_EMAIL_SUBJECT,
  PLAYER_VERIFICATION_NOTICE_TITLE,
  PLAYER_VERIFICATION_SUPPORT_FALLBACK,
  fetchPlayerVerificationNotice,
  playerSupportMailto,
} from './playerVerification';

const here = dirname(fileURLToPath(import.meta.url));
const originalFetch = globalThis.fetch;

describe('player verification client', () => {
  it('keeps support contact configuration-driven and omits empty mailto', () => {
    assert.equal(playerSupportMailto(null), null);
    assert.equal(playerSupportMailto(''), null);
    assert.equal(playerSupportMailto('not-an-email'), null);
    assert.equal(
      playerSupportMailto('Help@Example.test'),
      `mailto:help@example.test?subject=${encodeURIComponent(PLAYER_VERIFICATION_EMAIL_SUBJECT)}`,
    );
    assert.equal(PLAYER_VERIFICATION_NOTICE_TITLE, 'Требуется верификация аккаунта.');
    assert.equal(PLAYER_VERIFICATION_BIND_HINT.includes('привяжите и подтвердите email'), true);
    assert.equal(PLAYER_VERIFICATION_BIND_ACTION, 'Привязать email');
    assert.equal(PLAYER_VERIFICATION_SUPPORT_FALLBACK.includes('службой поддержки'), true);
    const env = readFileSync(join(here, '../../server/staff/env.ts'), 'utf8');
    assert.match(env, /PLAYER_SUPPORT_EMAIL/);
    assert.match(env, /VITE_PLAYER_SUPPORT_EMAIL_FORBIDDEN/);
    const server = readFileSync(join(here, '../../server/email/playerManualVerificationService.ts'), 'utf8');
    assert.equal(server.includes('support@nextpari.com'), false);
    assert.equal(server.includes('set_player_security_restriction'), false);
  });

  it('maps the safe notice payload and ignores internal fields', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: true,
      verificationRequested: true,
      verificationStatus: 'VERIFICATION_REQUIRED',
      requestedAt: '2026-09-15T00:00:00.000Z',
      hasVerifiedEmail: false,
      bindEmailRequired: true,
      instructionsSent: false,
      supportEmail: null,
      supportConfigured: false,
      title: PLAYER_VERIFICATION_NOTICE_TITLE,
      message: PLAYER_VERIFICATION_BIND_HINT,
      supportMessage: PLAYER_VERIFICATION_SUPPORT_FALLBACK,
      requestedBy: 'hidden',
      reason: 'hidden-reason',
    }), { status: 200 })) as typeof fetch;
    try {
      const notice = await fetchPlayerVerificationNotice();
      assert.equal(notice?.verificationRequested, true);
      assert.equal(notice?.bindEmailRequired, true);
      assert.equal(notice?.supportConfigured, false);
      assert.equal('requestedBy' in (notice ?? {}), false);
      assert.equal('reason' in (notice ?? {}), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
