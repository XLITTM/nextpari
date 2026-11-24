import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ProviderOfficeError } from './errors.js';
import { activeContract } from './contract.js';
import {
  type ProviderDirectory,
  type ReportingScope,
} from './terms.js';

const BRAND_CODE = /^[0-9]{3}$/;

export type OfficeActor =
  | { kind: 'group_owner' }
  | { kind: 'brand_office'; brandCode: string }
  | { kind: 'provider'; providerId: string };

export interface AuthorizedReport {
  providerId: string;
  brandCode: string;
  scope: ReportingScope;
  access: 'read';
}

const FORBIDDEN_RESPONSE_KEYS = new Set([
  'email',
  'phone',
  'phonenumber',
  'playeremail',
  'document',
  'documents',
  'passport',
  'firstname',
  'lastname',
  'playername',
  'wallet',
  'walletid',
  'balance',
  'deposit',
  'deposits',
  'withdrawal',
  'withdrawals',
  'password',
  'secret',
  'apikey',
  'sharedkey',
  'service_role',
  'servicerole',
  'playerid',
  'playeruserid',
  'player_user_id',
]);

export function authorizeReport(
  actor: OfficeActor,
  directory: ProviderDirectory,
  requested: { providerId: string; brandCode: string | null; scope: ReportingScope; onDate: string },
): AuthorizedReport {
  const provider = directory.providers.find((item) => item.id === requested.providerId);
  if (!provider) throw new ProviderOfficeError('PROVIDER_NOT_FOUND');
  if (actor.kind === 'provider' && actor.providerId !== requested.providerId) {
    throw new ProviderOfficeError('PROVIDER_ISOLATION');
  }
  const contract = activeContract(directory, requested.providerId, requested.onDate);
  if (!contract) throw new ProviderOfficeError('CONTRACT_NOT_FOUND');
  let brandCode = requested.brandCode;
  if (actor.kind === 'brand_office') {
    if (brandCode && brandCode !== actor.brandCode) throw new ProviderOfficeError('BRAND_ISOLATION');
    brandCode = actor.brandCode;
  }
  if (!brandCode) brandCode = onlyAssignedBrand(actor, directory, requested.providerId, requested.scope);
  if (!BRAND_CODE.test(brandCode)) throw new ProviderOfficeError('BRAND_INVALID');
  if (!contract.coveredBrandCodes.includes(brandCode)) throw new ProviderOfficeError('BRAND_NOT_COVERED');

  const assignment = directory.assignments.find((item) => (
    item.providerId === requested.providerId
    && item.contractId === contract.id
    && item.brandCode === brandCode
    && item.status === 'active'
    && item.access === 'read'
    && item.scopes.includes(requested.scope)
  ));
  if (!assignment) throw new ProviderOfficeError('BRAND_NOT_AUTHORIZED');
  if (actor.kind === 'provider' && assignment.access !== 'read') {
    throw new ProviderOfficeError('READ_ONLY');
  }
  return { providerId: requested.providerId, brandCode, scope: requested.scope, access: 'read' };
}

export function assignBrand(
  directory: ProviderDirectory,
  providerId: string,
  brandCode: string,
  onDate: string,
): ProviderDirectory {
  if (!BRAND_CODE.test(brandCode)) throw new ProviderOfficeError('BRAND_INVALID');
  const contract = activeContract(directory, providerId, onDate);
  if (!contract) throw new ProviderOfficeError('CONTRACT_NOT_FOUND');
  if (!contract.coveredBrandCodes.includes(brandCode)) throw new ProviderOfficeError('BRAND_NOT_COVERED');
  if (directory.assignments.some((item) => item.providerId === providerId && item.brandCode === brandCode && item.status === 'active')) {
    return directory;
  }
  return {
    ...directory,
    assignments: [
      ...directory.assignments,
      {
        providerId,
        contractId: contract.id,
        brandCode,
        access: 'read',
        scopes: contract.providerId === providerId && directory.providers.find((item) => item.id === providerId)?.product === 'casino'
          ? ['casino_ggr']
          : ['sportsbook_ggr'],
        status: 'active',
      },
    ],
  };
}

export function stripForbidden<T>(value: T): T {
  return walk(value) as T;
}

export function containsForbidden(value: unknown): boolean {
  return walkFind(value);
}

export interface Invitation {
  id: string;
  providerId: string;
  tokenHash: string;
  expiresAt: number;
  accepted: boolean;
}

export function createInvitation(
  store: Map<string, Invitation>,
  providerId: string,
  now: number,
): { invitationId: string; token: string } {
  const token = randomBytes(32).toString('hex');
  const id = randomBytes(16).toString('hex');
  store.set(id, {
    id,
    providerId,
    tokenHash: hashToken(token),
    expiresAt: now + 24 * 60 * 60 * 1000,
    accepted: false,
  });
  return { invitationId: id, token };
}

export function acceptInvitation(store: Map<string, Invitation>, invitationId: string, token: string, now: number): string {
  const invitation = store.get(invitationId);
  if (!invitation || invitation.accepted || invitation.expiresAt <= now) {
    throw new ProviderOfficeError('INVITE_NOT_FOUND');
  }
  const given = hashToken(token);
  const left = Buffer.from(invitation.tokenHash, 'hex');
  const right = Buffer.from(given, 'hex');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ProviderOfficeError('INVITE_NOT_FOUND');
  }
  invitation.accepted = true;
  return invitation.providerId;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function onlyAssignedBrand(
  actor: OfficeActor,
  directory: ProviderDirectory,
  providerId: string,
  scope: ReportingScope,
): string {
  if (actor.kind === 'brand_office') return actor.brandCode;
  const brands = directory.assignments
    .filter((item) => item.providerId === providerId && item.status === 'active' && item.scopes.includes(scope))
    .map((item) => item.brandCode);
  if (actor.kind === 'provider') {
    if (brands.length !== 1) throw new ProviderOfficeError('BRAND_NOT_AUTHORIZED');
    return brands[0] ?? '';
  }
  if (brands.length !== 1) throw new ProviderOfficeError('BRAND_REQUIRED');
  return brands[0] ?? '';
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''))) continue;
    output[key] = walk(entry);
  }
  return output;
}

function walkFind(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => walkFind(item));
  if (!value || typeof value !== 'object') return false;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''))) return true;
    if (walkFind(entry)) return true;
  }
  return false;
}
