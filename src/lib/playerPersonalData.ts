export const PLAYER_PERSONAL_DATA_NOTICE =
  'Заполнение личных данных не является верификацией аккаунта.';
export const PLAYER_PERSONAL_DATA_NOTICE_EXTRA =
  'Служба поддержки или владелец сайта могут отдельно запросить подтверждение личности, если это потребуется.';
export const PLAYER_PERSONAL_DATA_VERIFIED_BADGE = 'Личность подтверждена';
export const PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP =
  'Для изменения подтверждённых идентификационных данных обратитесь в службу поддержки.';
export const PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK =
  'Свяжитесь со службой поддержки, чтобы изменить подтверждённые идентификационные данные.';
export const PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_ERROR =
  'Подтверждённые идентификационные данные нельзя изменить самостоятельно.';

export const PLAYER_DOCUMENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Не выбрано' },
  { value: 'passport', label: 'Паспорт' },
  { value: 'national_id', label: 'Национальное удостоверение' },
  { value: 'residence_permit', label: 'Вид на жительство' },
  { value: 'driver_license', label: 'Водительское удостоверение' },
  { value: 'other', label: 'Другой документ' },
];

export const PLAYER_COUNTRY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Не выбрано' },
  { value: 'TM', label: 'Туркменистан' },
  { value: 'RU', label: 'Россия' },
  { value: 'UZ', label: 'Узбекистан' },
  { value: 'KZ', label: 'Казахстан' },
  { value: 'TJ', label: 'Таджикистан' },
  { value: 'KG', label: 'Кыргызстан' },
  { value: 'AZ', label: 'Азербайджан' },
  { value: 'AM', label: 'Армения' },
  { value: 'GE', label: 'Грузия' },
  { value: 'TR', label: 'Турция' },
  { value: 'UA', label: 'Украина' },
  { value: 'BY', label: 'Беларусь' },
  { value: 'MD', label: 'Молдова' },
  { value: 'IR', label: 'Иран' },
  { value: 'AF', label: 'Афганистан' },
  { value: 'CN', label: 'Китай' },
  { value: 'IN', label: 'Индия' },
  { value: 'PK', label: 'Пакистан' },
  { value: 'AE', label: 'ОАЭ' },
  { value: 'SA', label: 'Саудовская Аравия' },
  { value: 'QA', label: 'Катар' },
  { value: 'KW', label: 'Кувейт' },
  { value: 'BH', label: 'Бахрейн' },
  { value: 'OM', label: 'Оман' },
  { value: 'EG', label: 'Египет' },
  { value: 'DE', label: 'Германия' },
  { value: 'FR', label: 'Франция' },
  { value: 'GB', label: 'Великобритания' },
  { value: 'IT', label: 'Италия' },
  { value: 'ES', label: 'Испания' },
  { value: 'PL', label: 'Польша' },
  { value: 'NL', label: 'Нидерланды' },
  { value: 'US', label: 'США' },
  { value: 'CA', label: 'Канада' },
  { value: 'BR', label: 'Бразилия' },
  { value: 'AU', label: 'Австралия' },
  { value: 'JP', label: 'Япония' },
  { value: 'KR', label: 'Республика Корея' },
];

export interface PlayerPersonalDataQuestionnaire {
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
  supportEmail: string | null;
  supportConfigured: boolean;
  supportMailto: string | null;
}

export const EMPTY_PLAYER_PERSONAL_DATA: PlayerPersonalDataQuestionnaire = {
  hasRow: false,
  identityLocked: false,
  verificationStatus: null,
  questionnaireComplete: false,
  questionnaireCompletedAt: null,
  firstName: '',
  lastName: '',
  middleName: '',
  dateOfBirth: '',
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
  email: '',
  emailVerified: false,
  phone: '',
  phoneVerified: false,
  supportEmail: null,
  supportConfigured: false,
  supportMailto: null,
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function text(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (rec[key] == null) continue;
    const value = String(rec[key]).trim();
    if (value) return value;
  }
  return '';
}

export function playerPersonalDataFromBody(raw: unknown): PlayerPersonalDataQuestionnaire {
  const rec = asRecord(raw);
  const supportEmail = text(rec, 'supportEmail', 'support_email') || null;
  const mailto = text(rec, 'supportMailto', 'support_mailto') || null;
  return {
    hasRow: rec.hasRow === true || rec.has_row === true,
    identityLocked: rec.identityLocked === true || rec.identity_locked === true,
    verificationStatus: rec.verificationStatus == null && rec.verification_status == null
      ? null
      : String(rec.verificationStatus ?? rec.verification_status),
    questionnaireComplete: rec.questionnaireComplete === true || rec.questionnaire_complete === true,
    questionnaireCompletedAt: rec.questionnaireCompletedAt == null && rec.questionnaire_completed_at == null
      ? null
      : String(rec.questionnaireCompletedAt ?? rec.questionnaire_completed_at),
    firstName: text(rec, 'firstName', 'first_name'),
    lastName: text(rec, 'lastName', 'last_name'),
    middleName: text(rec, 'middleName', 'middle_name'),
    dateOfBirth: text(rec, 'dateOfBirth', 'date_of_birth'),
    citizenshipCountryCode: text(rec, 'citizenshipCountryCode', 'citizenship_country_code').toUpperCase(),
    residenceCountryCode: text(rec, 'residenceCountryCode', 'residence_country_code').toUpperCase(),
    residenceCity: text(rec, 'residenceCity', 'residence_city'),
    addressLine1: text(rec, 'addressLine1', 'address_line_1'),
    addressLine2: text(rec, 'addressLine2', 'address_line_2'),
    postalCode: text(rec, 'postalCode', 'postal_code'),
    documentType: text(rec, 'documentType', 'document_type'),
    documentIssuingCountryCode: text(rec, 'documentIssuingCountryCode', 'document_issuing_country_code').toUpperCase(),
    documentSeries: text(rec, 'documentSeries', 'document_series'),
    documentNumber: text(rec, 'documentNumber', 'document_number'),
    documentIssueDate: text(rec, 'documentIssueDate', 'document_issue_date'),
    documentExpiryDate: text(rec, 'documentExpiryDate', 'document_expiry_date'),
    documentIssuingAuthority: text(rec, 'documentIssuingAuthority', 'document_issuing_authority'),
    email: text(rec, 'email'),
    emailVerified: rec.emailVerified === true || rec.email_verified === true,
    phone: text(rec, 'phone'),
    phoneVerified: rec.phoneVerified === true || rec.phone_verified === true,
    supportEmail,
    supportConfigured: rec.supportConfigured === true || rec.support_configured === true,
    supportMailto: mailto && mailto.startsWith('mailto:') ? mailto : null,
  };
}

export function mapPlayerPersonalDataError(code: string): string {
  if (code === 'PERSONAL_DATA_IDENTITY_LOCKED') return PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_ERROR;
  if (code === 'PERSONAL_DATA_COUNTRY_INVALID') return 'Укажите код страны из двух латинских букв.';
  if (code === 'PERSONAL_DATA_DOB_INVALID') return 'Дата рождения должна быть в прошлом.';
  if (code === 'PERSONAL_DATA_ISSUE_DATE_INVALID') return 'Дата выдачи документа не может быть в будущем.';
  if (code === 'PERSONAL_DATA_EXPIRY_INVALID') return 'Срок действия должен быть позже даты выдачи.';
  if (code === 'PERSONAL_DATA_FIELD_TOO_LONG') return 'Слишком длинное значение поля.';
  if (code === 'PERSONAL_DATA_DOCUMENT_TYPE_INVALID') return 'Выберите тип документа из списка.';
  return 'Не удалось сохранить анкету.';
}

export async function fetchPlayerPersonalData(): Promise<PlayerPersonalDataQuestionnaire | null> {
  const res = await fetch('/api/player/personal-data', { credentials: 'same-origin' });
  if (res.status === 401 || res.status === 403) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok || asRecord(body).ok !== true) return null;
  return playerPersonalDataFromBody(body);
}

export async function savePlayerPersonalData(
  input: Record<string, string>,
): Promise<PlayerPersonalDataQuestionnaire> {
  const res = await fetch('/api/player/personal-data', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = asRecord(await res.json().catch(() => ({})));
  if (!res.ok || body.ok !== true) {
    throw new Error(mapPlayerPersonalDataError(String(body.error ?? '')));
  }
  return playerPersonalDataFromBody(body);
}

export function playerPersonalDataSavePayload(fields: {
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
}): Record<string, string> {
  return {
    first_name: fields.firstName,
    last_name: fields.lastName,
    middle_name: fields.middleName,
    date_of_birth: fields.dateOfBirth,
    citizenship_country_code: fields.citizenshipCountryCode,
    residence_country_code: fields.residenceCountryCode,
    residence_city: fields.residenceCity,
    address_line_1: fields.addressLine1,
    address_line_2: fields.addressLine2,
    postal_code: fields.postalCode,
    document_type: fields.documentType,
    document_issuing_country_code: fields.documentIssuingCountryCode,
    document_series: fields.documentSeries,
    document_number: fields.documentNumber,
    document_issue_date: fields.documentIssueDate,
    document_expiry_date: fields.documentExpiryDate,
    document_issuing_authority: fields.documentIssuingAuthority,
  };
}
