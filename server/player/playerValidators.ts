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
