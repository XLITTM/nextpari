import type { FieldSpec } from '../access/model';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AMOUNT = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const PLAYER = /^[A-Za-z0-9:_-]{4,64}$/;
const ACCOUNT = /^[A-Z0-9_-]{2,32}$/;
const OPERATION = /^[A-Za-z0-9:_-]{8,80}$/;
const TIMEZONE = /^[A-Za-z0-9_+/-]{1,64}$/;
const NAME = /^[\p{L}][\p{L}\s'.-]{1,79}$/u;

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fieldError(field: FieldSpec, value: string): string | null {
  if (!value) return field.required ? 'Заполните поле' : null;
  switch (field.kind) {
    case 'email':
      return value.length <= 120 && EMAIL.test(value) ? null : 'Укажите почту';
    case 'personName':
      return NAME.test(value) ? null : 'Укажите имя';
    case 'password':
      return value.length >= 12 && value.length <= 128 ? null : 'Минимум 12 символов';
    case 'amount': {
      if (!AMOUNT.test(value)) return 'Укажите сумму';
      const numeric = Number(value);
      return numeric > 0 && numeric <= 1_000_000_000_000 ? null : 'Укажите сумму';
    }
    case 'currency':
      return CURRENCY.test(value) ? null : 'Код валюты из 3 букв';
    case 'date':
      return isCalendarDate(value) ? null : 'Укажите дату';
    case 'textarea':
      return value.length >= 8 && value.length <= 500 ? null : 'От 8 до 500 символов';
    case 'playerId':
      return PLAYER.test(value) ? null : 'Укажите идентификатор';
    case 'accountCode':
      return ACCOUNT.test(value) ? null : 'Укажите код счёта';
    case 'operationId':
      return OPERATION.test(value) ? null : 'Укажите номер операции';
    case 'timezone':
      return TIMEZONE.test(value) ? null : 'Укажите часовой пояс';
    case 'search':
      return value.length >= 2 && value.length <= 80 ? null : 'Минимум 2 символа';
    case 'mfa':
      return /^\d{6}$/.test(value) ? null : 'Код из 6 цифр';
    case 'select':
      return field.options?.some((option) => option.value === value) ? null : 'Выберите значение';
    default:
      return 'Заполните поле';
  }
}

export function validateFields(
  fields: readonly FieldSpec[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? '';
    const value = field.kind === 'password' ? raw : raw.trim();
    const error = fieldError(field, value);
    if (error) errors[field.name] = error;
  }
  const from = (values.from ?? '').trim();
  const to = (values.to ?? '').trim();
  if (from && to && !errors.from && !errors.to && from > to) {
    errors.to = 'Дата окончания раньше даты начала';
  }
  const source = (values.sourceAccount ?? '').trim();
  const destination = (values.destinationAccount ?? '').trim();
  if (source && destination && !errors.sourceAccount && !errors.destinationAccount && source === destination) {
    errors.destinationAccount = 'Счета должны различаться';
  }
  return errors;
}

export function trimmedValues(
  fields: readonly FieldSpec[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim();
    if (value) next[field.name] = value;
  }
  return next;
}
