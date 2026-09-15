import { createUserJwtClient } from '../supabase/admin.js';
import { loadOwnerAuthEnv, loadPlayerSupportEmail } from '../staff/env.js';
import { extractErrorCode, rpcMessage, staffError, StaffOnboardingError } from '../staff/errors.js';
import { normalizePlayerSupportEmail } from '../email/playerManualVerificationService.js';

export const PLAYER_PERSONAL_DATA_PATH = '/api/player/personal-data';

export const PLAYER_PERSONAL_DATA_IDENTITY_FIELDS = [
  'first_name',
  'last_name',
  'middle_name',
  'date_of_birth',
  'citizenship_country_code',
  'document_type',
  'document_issuing_country_code',
  'document_series',
  'document_number',
  'document_issue_date',
  'document_expiry_date',
  'document_issuing_authority',
] as const;

export const PLAYER_PERSONAL_DATA_RESIDENCE_FIELDS = [
  'residence_country_code',
  'residence_city',
  'address_line_1',
  'address_line_2',
  'postal_code',
] as const;

export const PLAYER_PERSONAL_DATA_REQUIRED_FIELDS = [
  'first_name',
  'last_name',
  'date_of_birth',
  'citizenship_country_code',
  'residence_country_code',
  'residence_city',
  'address_line_1',
  'document_type',
  'document_issuing_country_code',
  'document_number',
  'document_issue_date',
] as const;

export const PLAYER_DOCUMENT_TYPES = [
  'passport',
  'national_id',
  'residence_permit',
  'driver_license',
  'other',
] as const;

const TEXT_MAX: Record<string, number> = {
  first_name: 100,
  last_name: 100,
  middle_name: 100,
  residence_city: 120,
  address_line_1: 200,
  address_line_2: 200,
  postal_code: 20,
  document_series: 32,
  document_number: 64,
  document_issuing_authority: 200,
};

const COUNTRY_KEYS = new Set([
  'citizenship_country_code',
  'residence_country_code',
  'document_issuing_country_code',
]);

const DATE_KEYS = new Set([
  'date_of_birth',
  'document_issue_date',
  'document_expiry_date',
]);

const WHITELIST = new Set<string>([
  ...PLAYER_PERSONAL_DATA_IDENTITY_FIELDS,
  ...PLAYER_PERSONAL_DATA_RESIDENCE_FIELDS,
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function maskDocumentNumber(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

export function personalDataQuestionnaireComplete(fields: Record<string, unknown>): boolean {
  return PLAYER_PERSONAL_DATA_REQUIRED_FIELDS.every((key) => {
    const value = fields[key];
    if (value == null) return false;
    return String(value).trim() !== '';
  });
}

export function normalizePersonalDataText(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > max) throw staffError('PERSONAL_DATA_FIELD_TOO_LONG', 400);
  return text;
}

export function normalizePersonalDataCountry(value: unknown): string | null {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return null;
  if (!/^[A-Z]{2}$/.test(text)) throw staffError('PERSONAL_DATA_COUNTRY_INVALID', 400);
  return text;
}

export function normalizePersonalDataDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw staffError('PERSONAL_DATA_DATE_INVALID', 400);
  return text;
}

export function normalizePersonalDataDocumentType(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (!(PLAYER_DOCUMENT_TYPES as readonly string[]).includes(text)) {
    throw staffError('PERSONAL_DATA_DOCUMENT_TYPE_INVALID', 400);
  }
  return text;
}

export function assertPersonalDataDates(input: {
  dateOfBirth?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
}): void {
  const today = todayIsoDate();
  if (input.dateOfBirth && input.dateOfBirth >= today) {
    throw staffError('PERSONAL_DATA_DOB_INVALID', 400);
  }
  if (input.issueDate && input.issueDate > today) {
    throw staffError('PERSONAL_DATA_ISSUE_DATE_INVALID', 400);
  }
  if (input.issueDate && input.expiryDate && input.expiryDate <= input.issueDate) {
    throw staffError('PERSONAL_DATA_EXPIRY_INVALID', 400);
  }
}

export function pickPlayerPersonalDataPayload(raw: unknown): Record<string, unknown> {
  const rec = asRecord(raw);
  const nested = rec.fields && typeof rec.fields === 'object' && !Array.isArray(rec.fields)
    ? asRecord(rec.fields)
    : rec;
  const out: Record<string, unknown> = {};
  for (const key of WHITELIST) {
    if (!Object.prototype.hasOwnProperty.call(nested, key)) continue;
    out[key] = nested[key];
  }
  return out;
}

export function normalizePlayerPersonalDataPayload(raw: unknown): Record<string, unknown> {
  const picked = pickPlayerPersonalDataPayload(raw);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(picked)) {
    if (COUNTRY_KEYS.has(key)) {
      out[key] = normalizePersonalDataCountry(value);
      continue;
    }
    if (DATE_KEYS.has(key)) {
      out[key] = normalizePersonalDataDate(value);
      continue;
    }
    if (key === 'document_type') {
      out[key] = normalizePersonalDataDocumentType(value);
      continue;
    }
    out[key] = normalizePersonalDataText(value, TEXT_MAX[key] ?? 200);
  }
  assertPersonalDataDates({
    dateOfBirth: out.date_of_birth == null ? null : String(out.date_of_birth),
    issueDate: out.document_issue_date == null ? null : String(out.document_issue_date),
    expiryDate: out.document_expiry_date == null ? null : String(out.document_expiry_date),
  });
  return out;
}

export interface PlayerPersonalDataView {
  hasRow: boolean;
  identityLocked: boolean;
  verificationStatus: string | null;
  questionnaireComplete: boolean;
  questionnaireCompletedAt: string | null;
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  citizenshipCountryCode: string;
  residenceCountryCode: string;
  residenceCity: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  documentType: string;
  documentIssuingCountryCode: string;
  documentSeries: string;
  documentNumber: string;
  documentIssueDate: string;
  documentExpiryDate: string;
  documentIssuingAuthority: string;
  email: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  supportEmail: string | null;
  supportConfigured: boolean;
}

function textField(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (rec[key] == null) continue;
    const value = String(rec[key]).trim();
    if (value) return value;
  }
  return '';
}

export function publicPlayerPersonalData(
  row: Record<string, unknown>,
  supportEmail: string | null = null,
): PlayerPersonalDataView {
  const support = normalizePlayerSupportEmail(supportEmail);
  return {
    hasRow: row.has_row === true || row.hasRow === true,
    identityLocked: row.identity_locked === true || row.identityLocked === true,
    verificationStatus: row.verification_status == null && row.verificationStatus == null
      ? null
      : String(row.verification_status ?? row.verificationStatus),
    questionnaireComplete: row.questionnaire_complete === true || row.questionnaireComplete === true,
    questionnaireCompletedAt: row.questionnaire_completed_at == null && row.questionnaireCompletedAt == null
      ? null
      : String(row.questionnaire_completed_at ?? row.questionnaireCompletedAt),
    firstName: textField(row, 'first_name', 'firstName'),
    lastName: textField(row, 'last_name', 'lastName'),
    middleName: textField(row, 'middle_name', 'middleName'),
    dateOfBirth: textField(row, 'date_of_birth', 'dateOfBirth'),
    citizenshipCountryCode: textField(row, 'citizenship_country_code', 'citizenshipCountryCode').toUpperCase(),
    residenceCountryCode: textField(row, 'residence_country_code', 'residenceCountryCode').toUpperCase(),
    residenceCity: textField(row, 'residence_city', 'residenceCity'),
    addressLine1: textField(row, 'address_line_1', 'addressLine1'),
    addressLine2: textField(row, 'address_line_2', 'addressLine2'),
    postalCode: textField(row, 'postal_code', 'postalCode'),
    documentType: textField(row, 'document_type', 'documentType'),
    documentIssuingCountryCode: textField(row, 'document_issuing_country_code', 'documentIssuingCountryCode').toUpperCase(),
    documentSeries: textField(row, 'document_series', 'documentSeries'),
    documentNumber: textField(row, 'document_number', 'documentNumber'),
    documentIssueDate: textField(row, 'document_issue_date', 'documentIssueDate'),
    documentExpiryDate: textField(row, 'document_expiry_date', 'documentExpiryDate'),
    documentIssuingAuthority: textField(row, 'document_issuing_authority', 'documentIssuingAuthority'),
    email: textField(row, 'email'),
    emailVerified: row.email_verified === true || row.emailVerified === true,
    phone: textField(row, 'phone'),
    phoneVerified: row.phone_verified === true || row.phoneVerified === true,
    createdAt: row.created_at == null && row.createdAt == null
      ? null
      : String(row.created_at ?? row.createdAt),
    updatedAt: row.updated_at == null && row.updatedAt == null
      ? null
      : String(row.updated_at ?? row.updatedAt),
    supportEmail: support,
    supportConfigured: Boolean(support),
  };
}

export function publicStaffPersonalDataSummary(row: Record<string, unknown>, fallbackId = ''): Record<string, unknown> {
  const rec = asRecord(row);
  return {
    playerPublicId: textField(rec, 'player_public_id', 'playerPublicId') || fallbackId,
    hasRow: rec.has_row === true || rec.hasRow === true,
    questionnaireComplete: rec.questionnaire_complete === true || rec.questionnaireComplete === true,
    firstName: textField(rec, 'first_name', 'firstName'),
    lastName: textField(rec, 'last_name', 'lastName'),
    dateOfBirth: textField(rec, 'date_of_birth', 'dateOfBirth'),
    citizenshipCountryCode: textField(rec, 'citizenship_country_code', 'citizenshipCountryCode').toUpperCase(),
    residenceCountryCode: textField(rec, 'residence_country_code', 'residenceCountryCode').toUpperCase(),
    residenceCity: textField(rec, 'residence_city', 'residenceCity'),
    documentType: textField(rec, 'document_type', 'documentType'),
    documentNumberMasked: textField(rec, 'document_number_masked', 'documentNumberMasked'),
    updatedAt: rec.updated_at == null && rec.updatedAt == null
      ? null
      : String(rec.updated_at ?? rec.updatedAt),
  };
}

export function playerPersonalDataHttpBody(view: PlayerPersonalDataView): Record<string, unknown> {
  return {
    ok: true,
    authenticated: true,
    hasRow: view.hasRow,
    identityLocked: view.identityLocked,
    verificationStatus: view.verificationStatus,
    questionnaireComplete: view.questionnaireComplete,
    questionnaireCompletedAt: view.questionnaireCompletedAt,
    firstName: view.firstName,
    lastName: view.lastName,
    middleName: view.middleName,
    dateOfBirth: view.dateOfBirth,
    citizenshipCountryCode: view.citizenshipCountryCode,
    residenceCountryCode: view.residenceCountryCode,
    residenceCity: view.residenceCity,
    addressLine1: view.addressLine1,
    addressLine2: view.addressLine2,
    postalCode: view.postalCode,
    documentType: view.documentType,
    documentIssuingCountryCode: view.documentIssuingCountryCode,
    documentSeries: view.documentSeries,
    documentNumber: view.documentNumber,
    documentIssueDate: view.documentIssueDate,
    documentExpiryDate: view.documentExpiryDate,
    documentIssuingAuthority: view.documentIssuingAuthority,
    email: view.email,
    emailVerified: view.emailVerified,
    phone: view.phone,
    phoneVerified: view.phoneVerified,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    supportEmail: view.supportEmail,
    supportConfigured: view.supportConfigured,
    supportMailto: view.supportEmail ? `mailto:${view.supportEmail}` : null,
  };
}

export function mapPlayerPersonalDataError(error: { message?: string; code?: string }): StaffOnboardingError {
  const text = rpcMessage(error);
  if (error.code === 'PGRST301' || /jwt|expired|unauthorized/i.test(text)) {
    return staffError('JWT_INVALID', 401);
  }
  const code = extractErrorCode(text);
  if (code === 'AUTH_REQUIRED' || code === 'JWT_REQUIRED' || code === 'JWT_INVALID') {
    return staffError(code, 401);
  }
  if (code === 'PERSONAL_DATA_IDENTITY_LOCKED') {
    return staffError(code, 409);
  }
  if (code && (code.startsWith('PERSONAL_DATA_') || code.endsWith('_INVALID') || code.endsWith('_TOO_LONG'))) {
    return staffError(code, 400);
  }
  return staffError('PERSONAL_DATA_UNAVAILABLE', 503);
}

export interface PlayerPersonalDataPorts {
  read: (accessToken: string) => Promise<PlayerPersonalDataView>;
  save: (accessToken: string, payload: Record<string, unknown>) => Promise<PlayerPersonalDataView>;
}

export function livePlayerPersonalDataPorts(): PlayerPersonalDataPorts {
  const env = loadOwnerAuthEnv();
  const support = () => loadPlayerSupportEmail();
  return {
    async read(accessToken) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_personal_data');
      if (error) throw mapPlayerPersonalDataError(error);
      return publicPlayerPersonalData(asRecord(data), support());
    },
    async save(accessToken, payload) {
      const client = createUserJwtClient(env.supabaseUrl, env.supabaseAnonKey, accessToken);
      const { data, error } = await client.rpc('player_save_personal_data', {
        p_payload: payload,
      });
      if (error) throw mapPlayerPersonalDataError(error);
      return publicPlayerPersonalData(asRecord(data), support());
    },
  };
}
