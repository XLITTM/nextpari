import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_ERROR,
  PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP,
  PLAYER_PERSONAL_DATA_NOTICE,
  PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK,
  PLAYER_PERSONAL_DATA_VERIFIED_BADGE,
  mapPlayerPersonalDataError,
  playerPersonalDataFromBody,
  playerPersonalDataSavePayload,
} from './playerPersonalData.ts';

const here = dirname(fileURLToPath(import.meta.url));

describe('player personal data UI contract', () => {
  it('explains that filling personal data is not verification', () => {
    const screen = readFileSync(join(here, '../screens/PersonalDataScreen.tsx'), 'utf8');
    assert.equal(PLAYER_PERSONAL_DATA_NOTICE, 'Заполнение личных данных не является верификацией аккаунта.');
    assert.match(screen, /PLAYER_PERSONAL_DATA_NOTICE/);
    assert.match(screen, /PLAYER_PERSONAL_DATA_NOTICE_EXTRA/);
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
});
