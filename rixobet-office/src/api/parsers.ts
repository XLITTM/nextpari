import { BRAND } from '../brand';
import type { PageKind } from '../access/model';
import { parseSession, type OfficeSession } from '../access/session';

export interface MetricItem {
  key: string;
  label: string;
  value: string;
}

export interface RecordItem {
  id: string;
  title: string;
  detail: string;
  status: string;
}

export interface AccountItem {
  id: string;
  label: string;
  currency: string;
  amount: string;
}

export type PageData =
  | { kind: 'metrics'; generatedAt: string; metrics: MetricItem[] }
  | { kind: 'records'; generatedAt: string; records: RecordItem[] }
  | { kind: 'accounts'; generatedAt: string; accounts: AccountItem[] };

export interface Acceptance {
  brandCode: typeof BRAND.code;
  auditId: string;
  operationId: string;
  idempotencyKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  if (/[<>\u0000-\u001F]/.test(trimmed)) return null;
  return trimmed;
}

function token(value: unknown, min: number, max: number): string | null {
  const text = plainText(value, max);
  if (!text || text.length < min) return null;
  if (!/^[A-Za-z0-9:_-]+$/.test(text)) return null;
  return text;
}

function envelope(input: unknown): { generatedAt: string; body: Record<string, unknown> } | null {
  if (!isRecord(input) || input.brandCode !== BRAND.code) return null;
  if (typeof input.generatedAt !== 'string' || !Number.isFinite(Date.parse(input.generatedAt))) return null;
  return { generatedAt: new Date(Date.parse(input.generatedAt)).toISOString(), body: input };
}

export function parsePage(kind: PageKind, input: unknown): PageData | null {
  const wrapped = envelope(input);
  if (!wrapped) return null;
  if (kind === 'metrics') {
    if (!Array.isArray(wrapped.body.metrics) || wrapped.body.metrics.length > 24) return null;
    const metrics: MetricItem[] = [];
    for (const entry of wrapped.body.metrics) {
      if (!isRecord(entry)) return null;
      const key = token(entry.key, 2, 40);
      const label = plainText(entry.label, 80);
      const value = plainText(entry.value, 40);
      if (!key || !label || !value) return null;
      metrics.push({ key, label, value });
    }
    return { kind, generatedAt: wrapped.generatedAt, metrics };
  }
  if (kind === 'records') {
    if (!Array.isArray(wrapped.body.records) || wrapped.body.records.length > 200) return null;
    const records: RecordItem[] = [];
    for (const entry of wrapped.body.records) {
      if (!isRecord(entry)) return null;
      const id = token(entry.id, 2, 80);
      const title = plainText(entry.title, 120);
      const detail = plainText(entry.detail, 240);
      const status = plainText(entry.status, 40);
      if (!id || !title || !detail || !status) return null;
      records.push({ id, title, detail, status });
    }
    return { kind, generatedAt: wrapped.generatedAt, records };
  }
  if (!Array.isArray(wrapped.body.accounts) || wrapped.body.accounts.length > 100) return null;
  const accounts: AccountItem[] = [];
  for (const entry of wrapped.body.accounts) {
    if (!isRecord(entry)) return null;
    const id = token(entry.id, 2, 64);
    const label = plainText(entry.label, 80);
    const currency = plainText(entry.currency, 3);
    const amount = plainText(entry.amount, 20);
    if (!id || !label || !currency || !amount) return null;
    if (!/^[A-Z]{3}$/.test(currency) || !/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(amount)) return null;
    accounts.push({ id, label, currency, amount });
  }
  return { kind: 'accounts', generatedAt: wrapped.generatedAt, accounts };
}

export function parseAcceptance(input: unknown, idempotencyKey: string): Acceptance | null {
  if (!isRecord(input)) return null;
  if (input.brandCode !== BRAND.code || input.accepted !== true) return null;
  if (input.idempotencyKey !== idempotencyKey) return null;
  const auditId = token(input.auditId, 8, 80);
  const operationId = token(input.operationId, 8, 80);
  if (!auditId || !operationId) return null;
  return { brandCode: BRAND.code, auditId, operationId, idempotencyKey };
}

export interface MfaChallenge {
  challengeId: string;
}

export function parseActivationStart(input: unknown): { otpauthUri: string } | null {
  if (!isRecord(input)) return null;
  if (input.brandCode !== BRAND.code || input.status !== 'verification_required') return null;
  if ('sessionId' in input || 'role' in input || 'permissions' in input) return null;
  if (typeof input.otpauthUri !== 'string' || !input.otpauthUri.startsWith('otpauth://totp/')) return null;
  if (input.otpauthUri.length > 500) return null;
  return { otpauthUri: input.otpauthUri };
}

export function parseActivationComplete(input: unknown): 'activated' | 'identity_verified' | null {
  if (!isRecord(input)) return null;
  if (input.brandCode !== BRAND.code) return null;
  if ('sessionId' in input || 'role' in input || 'permissions' in input) return null;
  if (input.status === 'activated' || input.status === 'identity_verified') return input.status;
  return null;
}

export function parseMfaChallenge(input: unknown): MfaChallenge | null {
  if (!isRecord(input)) return null;
  if (input.brandCode !== BRAND.code || input.status !== 'mfa_required') return null;
  if ('sessionId' in input || 'role' in input || 'permissions' in input) return null;
  const challengeId = token(input.challengeId, 12, 80);
  if (!challengeId) return null;
  return { challengeId };
}

export function parseLoginResult(
  input: unknown,
): { kind: 'mfa'; challengeId: string } | { kind: 'session'; session: OfficeSession } | null {
  if (!isRecord(input)) return null;
  if (input.status === 'mfa_required') {
    if ('sessionId' in input || 'role' in input || 'permissions' in input) return null;
    const challenge = parseMfaChallenge(input);
    return challenge ? { kind: 'mfa', challengeId: challenge.challengeId } : null;
  }
  const session = parseSession(input);
  return session.ok ? { kind: 'session', session: session.session } : null;
}
