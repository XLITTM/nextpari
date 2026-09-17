import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ISO_3166_ALPHA2_COUNTRIES,
  PLAYER_COUNTRY_OPTIONS,
  PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_ERROR,
  PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP,
  PLAYER_PERSONAL_DATA_LOAD_ERROR,
  PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK,
  PLAYER_PERSONAL_DATA_VERIFIED_BADGE,
  canSavePlayerPersonalData,
  loadPlayerPersonalDataQuestionnaire,
  mapPlayerPersonalDataError,
  playerPersonalDataFromBody,
  playerPersonalDataSavePayload,
} from './playerPersonalData.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('player personal data UI contract', () => {
  it('does not show a personal-data-is-not-verification banner', () => {
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.equal(screen.includes('PLAYER_PERSONAL_DATA_NOTICE'), false);
    assert.equal(screen.includes('PLAYER_PERSONAL_DATA_NOTICE_EXTRA'), false);
    assert.equal(screen.includes('Заполнение личных данных не является верификацией'), false);
    assert.match(screen, /PLAYER_PERSONAL_DATA_VERIFIED_BADGE/);
    assert.equal(PLAYER_PERSONAL_DATA_VERIFIED_BADGE, 'Личность подтверждена');
    assert.equal(
      PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP,
      'Для изменения подтверждённых идентификационных данных обратитесь в службу поддержки.',
    );
    assert.equal(screen.includes('риск'), false);
    assert.equal(screen.includes('staff'), false);
    assert.equal(screen.includes('reason_code'), false);
  });

  it('keeps email and phone read-only and does not send them in the questionnaire payload', () => {
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.match(screen, /value=\{data\.phone\}/);
    assert.match(screen, /value=\{data\.email\}/);
    assert.match(screen, /readOnly/);
    const payload = playerPersonalDataSavePayload({
      firstName: 'Ada',
      lastName: 'Lovelace',
      middleName: '',
      dateOfBirth: '1815-12-10',
      citizenshipCountryCode: 'GB',
      residenceCountryCode: 'GB',
      residenceCity: 'London',
      addressLine1: 'Street 1',
      addressLine2: '',
      postalCode: '',
      documentType: 'passport',
      documentIssuingCountryCode: 'GB',
      documentSeries: '',
      documentNumber: 'AB1234567',
      documentIssueDate: '2020-01-01',
      documentExpiryDate: '',
      documentIssuingAuthority: '',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'email'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'phone'), false);
    assert.equal(payload.document_series, '');
    assert.equal(payload.document_expiry_date, '');
    assert.equal(payload.document_issuing_authority, '');
  });

  it('locks identity fields after verification and uses configured support contact without a hardcoded address', () => {
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.match(screen, /identityLocked/);
    assert.match(screen, /supportMailto/);
    assert.match(screen, /PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK/);
    assert.equal(screen.includes('mailto:support@'), false);
    assert.equal(PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK.includes('@'), false);
    const parsed = playerPersonalDataFromBody({
      ok: true,
      identityLocked: true,
      verificationStatus: 'VERIFIED',
      supportEmail: 'help@nextpari.test',
      supportConfigured: true,
      supportMailto: 'mailto:help@nextpari.test',
    });
    assert.equal(parsed.identityLocked, true);
    assert.equal(parsed.supportMailto, 'mailto:help@nextpari.test');
    assert.equal(mapPlayerPersonalDataError('PERSONAL_DATA_IDENTITY_LOCKED'), PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_ERROR);
  });

  it('does not enable Save or issue PUT after a failed initial GET, and hydrates after retry', async () => {
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.match(screen, /disabled=\{!saveEnabled\}/);
    assert.match(screen, /canSavePlayerPersonalData\(loadState\)/);
    assert.match(screen, /if \(!canSavePlayerPersonalData\(loadState\)\) return;/);
    assert.match(screen, /\{ready \? \(/);
    assert.match(screen, /PLAYER_PERSONAL_DATA_RETRY/);
    assert.match(screen, /PLAYER_PERSONAL_DATA_LOAD_ERROR/);
    assert.match(screen, /loadPlayerPersonalDataQuestionnaire/);
    assert.equal(screen.includes('localStorage'), false);
    assert.equal(screen.includes('sessionStorage'), false);
    assert.equal(canSavePlayerPersonalData({ kind: 'loading' }), false);
    assert.equal(canSavePlayerPersonalData({ kind: 'error', message: PLAYER_PERSONAL_DATA_LOAD_ERROR }), false);
    assert.equal(canSavePlayerPersonalData({ kind: 'auth' }), false);

    const methods: string[] = [];
    const failed = await loadPlayerPersonalDataQuestionnaire(async (_url, init) => {
      methods.push(String(init?.method ?? 'GET').toUpperCase());
      return {
        ok: false,
        status: 503,
        json: async () => ({ ok: false, error: 'PERSONAL_DATA_UNAVAILABLE' }),
      } as Response;
    });
    assert.equal(failed.kind, 'error');
    assert.equal(failed.kind === 'error' ? failed.message : '', PLAYER_PERSONAL_DATA_LOAD_ERROR);
    assert.equal(canSavePlayerPersonalData(failed), false);
    assert.equal(methods.includes('PUT'), false);
    assert.equal(methods.includes('POST'), false);

    const authFailed = await loadPlayerPersonalDataQuestionnaire(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: 'AUTH_REQUIRED' }),
    }) as Response);
    assert.equal(authFailed.kind, 'auth');
    assert.equal(canSavePlayerPersonalData(authFailed), false);

    const emptyOk = await loadPlayerPersonalDataQuestionnaire(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, hasRow: false, firstName: '', lastName: '' }),
    }) as Response);
    assert.equal(emptyOk.kind, 'ready');
    if (emptyOk.kind === 'ready') {
      assert.equal(emptyOk.data.hasRow, false);
      assert.equal(emptyOk.data.firstName, '');
    }
    assert.equal(canSavePlayerPersonalData(emptyOk), true);

    let calls = 0;
    const retryFetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ ok: false }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          hasRow: true,
          firstName: 'Ada',
          lastName: 'Lovelace',
          citizenshipCountryCode: 'IQ',
          residenceCountryCode: 'AR',
        }),
      } as Response;
    }) as typeof fetch;
    const first = await loadPlayerPersonalDataQuestionnaire(retryFetch);
    assert.equal(first.kind, 'error');
    assert.equal(canSavePlayerPersonalData(first), false);
    const second = await loadPlayerPersonalDataQuestionnaire(retryFetch);
    assert.equal(second.kind, 'ready');
    if (second.kind === 'ready') {
      assert.equal(second.data.firstName, 'Ada');
      assert.equal(second.data.citizenshipCountryCode, 'IQ');
      assert.equal(second.data.residenceCountryCode, 'AR');
    }
    assert.equal(canSavePlayerPersonalData(second), true);
  });

  it('offers complete ISO 3166-1 alpha-2 country codes including previously missing IQ/AR/ZA/NZ', () => {
    const codes = ISO_3166_ALPHA2_COUNTRIES.map((row) => row.value);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.length >= 240, `expected full ISO list, got ${codes.length}`);
    for (const code of ['IQ', 'AR', 'ZA', 'NZ', 'TM', 'RU', 'US']) {
      assert.equal(codes.includes(code), true, code);
    }
    for (const row of ISO_3166_ALPHA2_COUNTRIES) {
      assert.match(row.value, /^[A-Z]{2}$/);
      assert.ok(row.label.trim().length > 0);
    }
    assert.equal(PLAYER_COUNTRY_OPTIONS[0]?.value, '');
    assert.equal(PLAYER_COUNTRY_OPTIONS.some((row) => row.value === 'IQ' && row.label === 'Ирак'), true);
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.match(screen, /PLAYER_COUNTRY_OPTIONS/);
    assert.equal(screen.includes('passport_regex'), false);
  });
});
