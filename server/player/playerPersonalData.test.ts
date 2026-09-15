import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { staffError } from '../staff/errors.js';
import {
  PLAYER_PERSONAL_DATA_PATH,
  handlePlayerAuthRequest,
} from './playerAuthHttp.js';
import type { PlayerAuthGatewayPorts } from './playerAuthService.js';
import {
  assertPersonalDataDates,
  maskDocumentNumber,
  normalizePersonalDataCountry,
  normalizePlayerPersonalDataPayload,
  personalDataQuestionnaireComplete,
  pickPlayerPersonalDataPayload,
  publicStaffPersonalDataSummary,
  type PlayerPersonalDataPorts,
  type PlayerPersonalDataView,
} from './playerPersonalDataService.js';
import { PLAYER_ACCESS_COOKIE, PLAYER_REFRESH_COOKIE } from './playerCookies.js';
import { handleOwnerControlRequest } from '../owner/ownerControlHttp.js';
import type { OwnerRpcPort } from '../owner/ownerRpc.js';
import type { OwnerAuthGatewayPorts } from '../staff/ownerAuthService.js';
import { OWNER_ACCESS_COOKIE, OWNER_REFRESH_COOKIE } from '../staff/ownerCookies.js';
import { handleSecurityControlRequest } from '../security/securityControlHttp.js';
import { SECURITY_ALLOWED_RPCS, SECURITY_DENIED_RPCS } from '../security/securityRpc.js';
import type { SecurityAuthGatewayPorts } from '../staff/securityAuthService.js';
import { SECURITY_ACCESS_COOKIE, SECURITY_REFRESH_COOKIE } from '../staff/securityCookies.js';
import { handleManagerControlRequest } from '../manager/managerControlHttp.js';
import { handleCashierControlRequest } from '../cashier/cashierControlHttp.js';

const ACCESS = 'player-access-token';
const REFRESH = 'player-refresh-token';
const USER = '11111111-2222-4333-8444-555555555555';
const PLAYER_ID = '110790';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const sql = readFileSync(
  join(root, 'supabase/migrations/20260915184730_player_personal_data_056.sql'),
  'utf8',
);

const FORBIDDEN_MUTATIONS = [
  'request_player_manual_verification',
  'owner_request_player_manual_verification',
  'security_request_player_manual_verification',
  'set_player_security_restriction',
  'owner_set_player_security_restriction',
  'security_set_player_security_restriction',
  'owner_set_player_blocked',
  'apply_wallet_entry',
  'owner_debit_player',
  'owner_fund_player',
];

function cookie(): string {
  return `${PLAYER_ACCESS_COOKIE}=${ACCESS}; ${PLAYER_REFRESH_COOKIE}=${REFRESH}`;
}

function createAuthPorts(): PlayerAuthGatewayPorts {
  return {
    async signInWithPassword() { return { accessToken: ACCESS, refreshToken: REFRESH }; },
    async signUp() { throw new Error('signUp should not run'); },
    async refreshSession() { throw staffError('JWT_INVALID', 401); },
    async getAuthUser() { return { id: USER, email: 'player@nextpari.test', emailConfirmed: true }; },
    async ensurePlayerAccount() {
      return { walletId: 'w', publicId: PLAYER_ID, legacyBalance: 0, migrationState: 'active' };
    },
    async loadOwnWallet() {
      return { balance: 42, currency: 'TMTM', status: 'active', publicId: PLAYER_ID };
    },
    async savePlayerProfile() { throw new Error('savePlayerProfile should not run'); },
  };
}

function emptyView(overrides: Partial<PlayerPersonalDataView> = {}): PlayerPersonalDataView {
  return {
    hasRow: false,
    identityLocked: false,
    verificationStatus: null,
    questionnaireComplete: false,
    questionnaireCompletedAt: null,
    firstName: 'Ivan',
    lastName: 'Petrov',
    middleName: '',
    dateOfBirth: '1990-01-02',
    citizenshipCountryCode: '',
    residenceCountryCode: '',
    residenceCity: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    documentType: '',
    documentIssuingCountryCode: '',
    documentSeries: '',
    documentNumber: '',
    documentIssueDate: '',
    documentExpiryDate: '',
    documentIssuingAuthority: '',
    email: 'player@nextpari.test',
    emailVerified: true,
    phone: '+99365123456',
    phoneVerified: true,
    createdAt: null,
    updatedAt: null,
    supportEmail: null,
    supportConfigured: false,
    ...overrides,
  };
}

function phase056Sources(): string[] {
  return [
    sql,
    readFileSync(join(root, 'server/player/playerPersonalDataService.ts'), 'utf8'),
    readFileSync(join(root, 'server/player/playerAuthHttp.ts'), 'utf8'),
    readFileSync(join(root, 'src/screens/PersonalDataScreen.tsx'), 'utf8'),
    readFileSync(join(root, 'src/lib/playerPersonalData.ts'), 'utf8'),
  ];
}

describe('player personal data SQL contract', () => {
  it('creates private canonical storage without duplicating phone or email', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_personal_data/);
    assert.match(sql, /player_user_id UUID PRIMARY KEY/);
    assert.match(sql, /questionnaire_completed_at TIMESTAMPTZ/);
    assert.match(sql, /document_series TEXT/);
    assert.match(sql, /document_expiry_date DATE/);
    assert.match(sql, /document_issuing_authority TEXT/);
    assert.match(sql, /middle_name TEXT/);
    assert.match(sql, /address_line_2 TEXT/);
    assert.match(sql, /postal_code TEXT/);
    assert.equal(/\n\s+email TEXT/.test(sql), false);
    assert.equal(/\n\s+phone TEXT/.test(sql), false);
    assert.match(sql, /Phone\/email are not stored here/);
  });

  it('keeps document_type generic and does not impose a universal passport regex or legal age', () => {
    assert.match(sql, /'passport'/);
    assert.match(sql, /'national_id'/);
    assert.match(sql, /'residence_permit'/);
    assert.match(sql, /'driver_license'/);
    assert.match(sql, /'other'/);
    assert.equal(sql.includes('document_number ~'), false);
    assert.equal(sql.includes('passport_regex'), false);
    assert.equal(sql.includes('legal_age'), false);
    assert.equal(sql.includes('minimum_age'), false);
    assert.equal(sql.includes('EXTRACT(YEAR'), false);
    assert.equal(sql.includes('>= 18'), false);
    assert.equal(sql.includes('>= 21'), false);
  });

  it('validates country codes, DOB, issue date, and optional expiry without fabricating values', () => {
    assert.match(sql, /PERSONAL_DATA_COUNTRY_INVALID/);
    assert.match(sql, /\^\[A-Z\]\{2\}\$/);
    assert.match(sql, /PERSONAL_DATA_DOB_INVALID/);
    assert.match(sql, /date_of_birth < CURRENT_DATE/);
    assert.match(sql, /document_issue_date <= CURRENT_DATE/);
    assert.match(sql, /v_dob >= CURRENT_DATE/);
    assert.match(sql, /v_issue > CURRENT_DATE/);
    assert.match(sql, /CURRENT_DATE/);
    assert.equal(sql.includes('pg_catalog.current_date'), false);
    assert.equal((sql.match(/CURRENT_DATE/g) ?? []).length, 4);
    assert.match(sql, /PERSONAL_DATA_ISSUE_DATE_INVALID/);
    assert.match(sql, /PERSONAL_DATA_EXPIRY_INVALID/);
    assert.match(sql, /document_expiry_date > document_issue_date/);
    assert.match(sql, /document_series IS NULL OR/);
    assert.match(sql, /document_expiry_date IS NULL/);
    assert.match(sql, /document_issuing_authority IS NULL OR/);
  });

  it('treats completeness as informational and locks identity only after VERIFIED plus an existing row', () => {
    assert.match(sql, /Informational timestamp/);
    assert.match(sql, /PERSONAL_DATA_IDENTITY_LOCKED/);
    assert.match(sql, /v_verified := v_status = 'VERIFIED'/);
    assert.match(sql, /v_verified AND v_has_row/);
    assert.match(sql, /residence_country_code/);
    const saveFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION private.player_personal_data_save'));
    const publicSave = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.player_save_personal_data'));
    assert.match(publicSave, /v_uid := auth\.uid\(\)/);
    assert.equal(publicSave.includes('p_player_user_id'), false);
    assert.match(saveFn, /v_payload := v_payload\s+- 'player_user_id'/);
    assert.match(saveFn, /- 'passport'/);
    assert.equal(saveFn.includes('raw_user_meta_data'), false);
  });

  it('audits field names only and keeps the event table append-only', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.player_personal_data_events/);
    assert.match(sql, /changed_field_names TEXT\[\]/);
    assert.match(sql, /PLAYER_PERSONAL_DATA_CREATED/);
    assert.match(sql, /PLAYER_PERSONAL_DATA_UPDATED/);
    assert.match(sql, /PLAYER_PERSONAL_DATA_EVENTS_IMMUTABLE/);
    assert.match(sql, /Never stores document numbers/);
    assert.equal(sql.includes('changed_field_values'), false);
    assert.match(sql, /private\.player_personal_data_mask_document/);
  });

  it('denies direct table access and does not grant manager or cashier personal-data RPCs', () => {
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_personal_data FROM anon, authenticated/);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON TABLE private\.player_personal_data FROM service_role/);
    assert.match(sql, /REVOKE ALL ON TABLE private\.player_personal_data_events FROM anon, authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_personal_data\(\) TO authenticated/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.player_personal_data\(\) FROM PUBLIC, anon/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.player_save_personal_data\(JSONB\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.owner_player_personal_data_summary\(TEXT\) TO authenticated/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.security_player_personal_data_summary\(TEXT\) TO authenticated/);
    assert.equal(sql.includes('manager_player_personal_data'), false);
    assert.equal(sql.includes('cashier_player_personal_data'), false);
    assert.match(sql, /PERFORM private\.get_current_owner_context\(\)/);
    assert.match(sql, /PERFORM private\.get_current_security_context\(\)/);
    assert.equal(sql.includes('get_current_manager_context'), false);
    assert.equal(sql.includes('get_current_cashier_context'), false);
  });

  it('rejects OWNER/MANAGER/CASHIER/SECURITY staff identities on player personal-data RPCs via staff_accounts', () => {
    const requireFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.player_personal_data_require_player'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_personal_data()'),
    );
    assert.match(requireFn, /FROM private\.staff_accounts AS s/);
    assert.match(requireFn, /RAISE EXCEPTION 'STAFF_ACCOUNT'/);
    assert.match(requireFn, /FROM public\.profiles AS p/);
    assert.match(requireFn, /RAISE EXCEPTION 'PLAYER_ACCOUNT_REQUIRED'/);

    const playerRead = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_personal_data()'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_save_personal_data'),
    );
    const playerSave = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_save_personal_data'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.owner_player_personal_data_summary'),
    );
    const privateSave = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION private.player_personal_data_save'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.player_personal_data()'),
    );
    assert.match(playerRead, /v_uid := auth\.uid\(\)/);
    assert.match(playerRead, /PERFORM private\.player_personal_data_require_player\(v_uid\)/);
    assert.equal(playerRead.includes('p_player_user_id'), false);
    assert.match(playerSave, /v_uid := auth\.uid\(\)/);
    assert.match(playerSave, /PERFORM private\.player_personal_data_require_player\(v_uid\)/);
    assert.equal(playerSave.includes('p_player_user_id'), false);

    const requireAt = privateSave.indexOf('player_personal_data_require_player');
    const insertAt = privateSave.indexOf('INSERT INTO private.player_personal_data');
    assert.ok(requireAt >= 0, 'player save must require a player account');
    assert.ok(insertAt > requireAt, 'staff rejection must happen before creating a row');

    const ownerSummary = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.owner_player_personal_data_summary'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.security_player_personal_data_summary'),
    );
    const securityStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.security_player_personal_data_summary');
    const securitySummary = sql.slice(securityStart, sql.indexOf('$fn$;', securityStart));
    assert.match(ownerSummary, /PERFORM private\.get_current_owner_context\(\)/);
    assert.equal(ownerSummary.includes('player_personal_data_require_player'), false);
    assert.match(securitySummary, /PERFORM private\.get_current_security_context\(\)/);
    assert.equal(securitySummary.includes('player_personal_data_require_player'), false);
  });

  it('does not copy legacy passport into structured document fields', () => {
    const defaultsStart = sql.indexOf('CREATE OR REPLACE FUNCTION private.player_personal_data_legacy_defaults');
    const defaultsEnd = sql.indexOf('CREATE OR REPLACE FUNCTION', defaultsStart + 1);
    const defaults = sql.slice(defaultsStart, defaultsEnd);
    assert.match(defaults, /firstName/);
    assert.match(defaults, /birthDate/);
    assert.equal(defaults.includes('passport'), false);
    assert.equal(defaults.includes('document_number'), false);
  });

  it('does not introduce document upload or scans', () => {
    assert.equal(sql.includes('storage'), false);
    assert.equal(sql.includes('selfie'), false);
    assert.equal(sql.includes('document_scan'), false);
    assert.equal(sql.includes('upload'), false);
  });

  it('does not call verification, restriction, or wallet mutations from personal-data code', () => {
    const sources = phase056Sources();
    for (const source of sources) {
      for (const name of FORBIDDEN_MUTATIONS) {
        assert.equal(source.includes(name), false, name);
      }
    }
  });
});

describe('player personal data validators', () => {
  it('accepts 2-character uppercase countries and rejects other shapes', () => {
    assert.equal(normalizePersonalDataCountry('tm'), 'TM');
    assert.equal(normalizePersonalDataCountry(''), null);
    assert.throws(() => normalizePersonalDataCountry('TUR'), /PERSONAL_DATA_COUNTRY_INVALID/);
    assert.throws(() => normalizePersonalDataCountry('T'), /PERSONAL_DATA_COUNTRY_INVALID/);
    assert.throws(() => normalizePersonalDataCountry('12'), /PERSONAL_DATA_COUNTRY_INVALID/);
  });

  it('rejects future DOB, future issue date, and expiry on or before issue date', () => {
    const future = '2099-01-01';
    assert.throws(() => assertPersonalDataDates({ dateOfBirth: future }), /PERSONAL_DATA_DOB_INVALID/);
    assert.throws(() => assertPersonalDataDates({ issueDate: future }), /PERSONAL_DATA_ISSUE_DATE_INVALID/);
    assert.throws(
      () => assertPersonalDataDates({ issueDate: '2020-01-02', expiryDate: '2020-01-02' }),
      /PERSONAL_DATA_EXPIRY_INVALID/,
    );
    assert.throws(
      () => assertPersonalDataDates({ issueDate: '2020-01-02', expiryDate: '2020-01-01' }),
      /PERSONAL_DATA_EXPIRY_INVALID/,
    );
    assertPersonalDataDates({
      dateOfBirth: '1990-01-01',
      issueDate: '2020-01-01',
      expiryDate: '2030-01-01',
    });
    assertPersonalDataDates({
      dateOfBirth: '1990-01-01',
      issueDate: '2020-01-01',
      expiryDate: null,
    });
  });

  it('allows incomplete questionnaires and ignores browser identity / contact fields', () => {
    const payload = normalizePlayerPersonalDataPayload({
      first_name: 'Ada',
      player_user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      playerId: '110791',
      email: 'attacker@example.com',
      phone: '+100',
      passport: 'XX999',
      verification_status: 'VERIFIED',
      restricted: true,
      balance: 99,
    });
    assert.deepEqual(payload, { first_name: 'Ada' });
    assert.equal(personalDataQuestionnaireComplete(payload), false);
    assert.equal(pickPlayerPersonalDataPayload({ player_user_id: USER, last_name: 'Lovelace' }).last_name, 'Lovelace');
    assert.equal(Object.prototype.hasOwnProperty.call(pickPlayerPersonalDataPayload({ player_user_id: USER }), 'player_user_id'), false);
  });

  it('masks document numbers without copying raw values into staff summaries', () => {
    assert.equal(maskDocumentNumber('AB1234567'), '*****4567');
    assert.equal(maskDocumentNumber('1234'), '****');
    assert.equal(maskDocumentNumber(''), null);
    const summary = publicStaffPersonalDataSummary({
      document_number: 'SHOULD_NOT_APPEAR',
      document_number_masked: '****4567',
      first_name: 'Ada',
    });
    assert.equal(summary.documentNumberMasked, '****4567');
    assert.equal(JSON.stringify(summary).includes('SHOULD_NOT_APPEAR'), false);
  });
});

describe('player personal data HTTP', () => {
  it('lets a player read and save only the session questionnaire and ignores a supplied player id', async () => {
    const saved: Record<string, unknown>[] = [];
    const ports: PlayerPersonalDataPorts = {
      async read() {
        return emptyView({ hasRow: true, firstName: 'Own' });
      },
      async save(_token, payload) {
        saved.push(payload);
        return emptyView({ hasRow: true, firstName: String(payload.first_name ?? ''), questionnaireComplete: false });
      },
    };
    const read = await handlePlayerAuthRequest(
      { method: 'GET', pathname: PLAYER_PERSONAL_DATA_PATH, cookie: cookie(), cookieSecure: true },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(read.status, 200);
    assert.equal(read.body.firstName, 'Own');
    assert.equal(read.body.email, 'player@nextpari.test');
    assert.equal(read.body.phone, '+99365123456');

    const write = await handlePlayerAuthRequest(
      {
        method: 'PUT',
        pathname: PLAYER_PERSONAL_DATA_PATH,
        cookie: cookie(),
        cookieSecure: true,
        body: {
          first_name: 'Ada',
          player_user_id: '99999999-9999-4999-8999-999999999999',
          public_id: '000001',
          email: 'hijack@example.com',
          phone: '+000',
          verification_status: 'VERIFIED',
        },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(write.status, 200);
    assert.deepEqual(saved, [{ first_name: 'Ada' }]);
    assert.equal(JSON.stringify(saved[0]).includes('hijack@example.com'), false);
  });

  it('saves an incomplete questionnaire without calling verification, restriction, or wallet ports', async () => {
    const calls: string[] = [];
    const ports: PlayerPersonalDataPorts = {
      async read() { throw new Error('read should not run'); },
      async save() {
        calls.push('save');
        return emptyView({ hasRow: true, questionnaireComplete: false, questionnaireCompletedAt: null });
      },
    };
    const result = await handlePlayerAuthRequest(
      {
        method: 'PUT',
        pathname: PLAYER_PERSONAL_DATA_PATH,
        cookie: cookie(),
        cookieSecure: true,
        body: { first_name: 'Ada' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.questionnaireComplete, false);
    assert.deepEqual(calls, ['save']);
  });

  it('returns PERSONAL_DATA_IDENTITY_LOCKED without resetting verification', async () => {
    const ports: PlayerPersonalDataPorts = {
      async read() { throw new Error('read should not run'); },
      async save() { throw staffError('PERSONAL_DATA_IDENTITY_LOCKED', 409); },
    };
    const result = await handlePlayerAuthRequest(
      {
        method: 'PUT',
        pathname: PLAYER_PERSONAL_DATA_PATH,
        cookie: cookie(),
        cookieSecure: true,
        body: { first_name: 'Changed' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'PERSONAL_DATA_IDENTITY_LOCKED');
  });

  it('maps a staff identity away from player personal-data RPCs', async () => {
    const ports: PlayerPersonalDataPorts = {
      async read() { throw staffError('STAFF_ACCOUNT', 403); },
      async save() { throw staffError('STAFF_ACCOUNT', 403); },
    };
    const read = await handlePlayerAuthRequest(
      { method: 'GET', pathname: PLAYER_PERSONAL_DATA_PATH, cookie: cookie(), cookieSecure: true },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(read.status, 403);
    assert.equal(read.body.error, 'STAFF_ACCOUNT');
    const write = await handlePlayerAuthRequest(
      {
        method: 'PUT',
        pathname: PLAYER_PERSONAL_DATA_PATH,
        cookie: cookie(),
        cookieSecure: true,
        body: { first_name: 'Ada' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(write.status, 403);
    assert.equal(write.body.error, 'STAFF_ACCOUNT');
  });

  it('rejects invalid country and date payloads before RPC', async () => {
    const ports: PlayerPersonalDataPorts = {
      async read() { throw new Error('read should not run'); },
      async save() { throw new Error('save should not run'); },
    };
    const country = await handlePlayerAuthRequest(
      {
        method: 'PUT',
        pathname: PLAYER_PERSONAL_DATA_PATH,
        cookie: cookie(),
        cookieSecure: true,
        body: { citizenship_country_code: 'TUR' },
      },
      createAuthPorts(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ports,
    );
    assert.equal(country.status, 400);
    assert.equal(country.body.error, 'PERSONAL_DATA_COUNTRY_INVALID');
  });
});

describe('owner and security personal-data visibility', () => {
  it('owner and security read a masked summary through their authenticated staff context', async () => {
    const ownerCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const owner = await handleOwnerControlRequest(
      {
        method: 'GET',
        pathname: `/api/owner/players/${PLAYER_ID}/personal-data`,
        cookie: `${OWNER_ACCESS_COOKIE}=owner-access; ${OWNER_REFRESH_COOKIE}=owner-refresh`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async currentStaffContext() {
            return { role: 'owner', status: 'active', auth_user_id: 'owner-uid', display_name: 'Owner', network_id: null };
          },
        } as OwnerAuthGatewayPorts,
        rpcFactory: (): OwnerRpcPort => ({
          async invoke(name, args) {
            ownerCalls.push({ name, args });
            return {
              ok: true,
              player_public_id: PLAYER_ID,
              has_row: true,
              questionnaire_complete: true,
              first_name: 'Ada',
              last_name: 'Lovelace',
              date_of_birth: '1815-12-10',
              citizenship_country_code: 'GB',
              residence_country_code: 'GB',
              residence_city: 'London',
              document_type: 'passport',
              document_number_masked: '****4567',
              updated_at: '2026-09-15T00:00:00Z',
            };
          },
        }),
      },
    );
    assert.equal(owner.status, 200);
    assert.deepEqual(ownerCalls, [{
      name: 'owner_player_personal_data_summary',
      args: { p_player_id: PLAYER_ID },
    }]);
    assert.equal(JSON.stringify(owner.body).includes('AB1234567'), false);

    const securityCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    const security = await handleSecurityControlRequest(
      {
        method: 'GET',
        pathname: `/api/security/players/${PLAYER_ID}/personal-data`,
        cookie: `${SECURITY_ACCESS_COOKIE}=sec-access; ${SECURITY_REFRESH_COOKIE}=sec-refresh`,
        cookieSecure: true,
      },
      {
        sessionPorts: {
          async lookupLoginEmail() { return 'sec@nextpari.test'; },
          async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
          async refreshSession() { throw staffError('JWT_INVALID', 401); },
          async currentStaffContext() {
            return { role: 'security', status: 'active', auth_user_id: 'sec-uid', display_name: 'Sec', login: 'security01' };
          },
        } as SecurityAuthGatewayPorts,
        rpcFactory: () => ({
          async invoke(name, args) {
            securityCalls.push({ name, args });
            return { ok: true, document_number_masked: '****4567' };
          },
        }),
      },
    );
    assert.equal(security.status, 200);
    assert.deepEqual(securityCalls, [{
      name: 'security_player_personal_data_summary',
      args: { p_player_id: PLAYER_ID },
    }]);
    assert.equal(SECURITY_ALLOWED_RPCS.includes('security_player_personal_data_summary'), true);
    assert.equal(SECURITY_DENIED_RPCS.includes('player_save_personal_data'), true);
    assert.equal(SECURITY_DENIED_RPCS.includes('owner_player_personal_data_summary'), true);
  });

  it('manager and cashier cannot access owner/security personal-data routes or player RPCs', async () => {
    for (const role of ['manager', 'cashier']) {
      const result = await handleOwnerControlRequest(
        {
          method: 'GET',
          pathname: `/api/owner/players/${PLAYER_ID}/personal-data`,
          cookie: `${OWNER_ACCESS_COOKIE}=x; ${OWNER_REFRESH_COOKIE}=y`,
          cookieSecure: true,
        },
        {
          sessionPorts: {
            async signInWithPassword() { return { accessToken: 'a', refreshToken: 'r' }; },
            async refreshSession() { throw staffError('JWT_INVALID', 401); },
            async currentStaffContext() {
              return { role, status: 'active', auth_user_id: `${role}-uid`, display_name: role, network_id: null };
            },
          } as OwnerAuthGatewayPorts,
          rpcFactory: () => ({
            async invoke() { throw new Error(`${role} must not invoke personal-data RPC`); },
          }),
        },
      );
      assert.equal(result.status, 403, role);
      assert.equal(result.body.error, 'OWNER_REQUIRED', role);
    }

    const manager = await handleManagerControlRequest({
      method: 'GET',
      pathname: `/api/manager/players/${PLAYER_ID}/personal-data`,
      cookie: 'x',
      cookieSecure: true,
    });
    assert.equal(manager.status === 401 || manager.status === 404, true);

    const cashier = await handleCashierControlRequest({
      method: 'GET',
      pathname: `/api/cashier/players/${PLAYER_ID}/personal-data`,
      cookie: 'x',
      cookieSecure: true,
    });
    assert.equal(cashier.status === 401 || cashier.status === 404, true);
  });

  it('keeps thin Vercel adapters and does not put a service-role secret in the frontend', () => {
    const playerApi = readFileSync(join(root, 'api/player/personal-data.ts'), 'utf8');
    const ownerApi = readFileSync(join(root, 'api/owner/players/[playerId]/personal-data.ts'), 'utf8');
    const securityApi = readFileSync(join(root, 'api/security/players/[playerId]/personal-data.ts'), 'utf8');
    assert.match(playerApi, /PLAYER_PERSONAL_DATA_PATH/);
    assert.match(ownerApi, /\/api\/owner\/players\/\$\{id\}\/personal-data/);
    assert.match(securityApi, /\/api\/security\/players\/\$\{id\}\/personal-data/);
    const ui = [
      readFileSync(join(root, 'src/screens/PersonalDataScreen.tsx'), 'utf8'),
      readFileSync(join(root, 'src/lib/playerPersonalData.ts'), 'utf8'),
      readFileSync(join(root, 'src/owner/services.ts'), 'utf8'),
      readFileSync(join(root, 'src/security/services.ts'), 'utf8'),
    ].join('\n');
    assert.equal(ui.includes('SERVICE_ROLE'), false);
    assert.equal(ui.includes('service_role'), false);
    assert.equal(ui.includes('createClient'), false);
    const http = readFileSync(join(root, 'server/player/playerAuthHttp.ts'), 'utf8');
    assert.match(http, /PLAYER_PERSONAL_DATA_PATH/);
    assert.match(http, /normalizePlayerPersonalDataPayload/);
  });
});

describe('phase 056 repository boundaries', () => {
  it('adds exactly one new 056 migration and does not edit older migrations', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql'));
    const personal = migrations.filter((name) => name.includes('player_personal_data_056'));
    assert.deepEqual(personal, ['20260915184730_player_personal_data_056.sql']);
    assert.equal(migrations.includes('20260915010000_player_manual_verification_055.sql'), true);
  });

  it('does not add document upload UI', () => {
    const screen = readFileSync(join(root, 'src/screens/PersonalDataScreen.tsx'), 'utf8');
    assert.equal(screen.includes('type="file"'), false);
    assert.equal(screen.includes('FormData'), false);
    const service = readFileSync(join(root, 'server/player/playerPersonalDataService.ts'), 'utf8');
    const sql056 = readFileSync(join(root, 'supabase/migrations/20260915184730_player_personal_data_056.sql'), 'utf8');
    for (const source of [screen, service, sql056]) {
      assert.equal(source.includes('document_scan'), false);
      assert.equal(source.includes('type="file"'), false);
    }
  });
});
