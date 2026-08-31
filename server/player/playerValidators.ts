const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;

export function validatePlayerEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'invalid email';
  if (!EMAIL_RE.test(value)) return 'invalid email';
  return null;
}

export function validatePlayerPassword(password: string): string | null {
  if (password.length < 8) return 'password too short';
  return null;
}

export function validatePlayerPhone(phone: string): string | null {
  const compact = phone.replace(/[\s()-]/g, '');
  if (!PHONE_RE.test(compact)) return 'invalid phone';
  return null;
}

export function normalizePlayerPhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

const NAME_RE = /^[\p{L}\p{M}\s.'-]*$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PlayerProfileFields {
  firstName: string;
  lastName: string;
  middleName: string;
  birthDate: string;
  passport: string;
}

function sanitizeName(value: unknown, max = 80): string | null {
  const text = String(value ?? '').trim();
  if (text.length > max) return null;
  if (text && !NAME_RE.test(text)) return null;
  return text;
}

export function parsePlayerProfileFields(body: Record<string, unknown>): PlayerProfileFields | { error: string } {
  const firstName = sanitizeName(body.firstName);
  const lastName = sanitizeName(body.lastName);
  const middleName = sanitizeName(body.middleName);
  if (firstName == null || lastName == null || middleName == null) {
    return { error: 'INVALID_PROFILE' };
  }
  const birthDate = String(body.birthDate ?? '').trim();
  if (birthDate && !DATE_RE.test(birthDate)) {
    return { error: 'INVALID_PROFILE' };
  }
  const passport = String(body.passport ?? '').trim();
  if (passport.length > 40) {
    return { error: 'INVALID_PROFILE' };
  }
  return { firstName, lastName, middleName, birthDate, passport };
}
