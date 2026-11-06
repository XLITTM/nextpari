import type { BrandStaffGrant } from '../../server/group/access.ts';
import type { BrandCode } from '../../server/group/catalog.ts';
import type { BrandOperationalSnapshot } from '../../server/group/reporting.ts';

export interface DemoPlayer {
  brandCode: BrandCode;
  publicId: string;
  label: string;
  state: 'demo-active' | 'demo-limited';
}

export interface DemoAuditEvent {
  id: string;
  brandCode: BrandCode;
  actor: string;
  action: string;
  at: string;
}

/** Synthetic subjects for the local demonstration. They are not accounts and cannot sign in. */
export const DEMO_GRANTS: readonly BrandStaffGrant[] = [
  { brandCode: '001', role: 'manager', staffSubject: '00000000-0000-4000-8000-0000000000a1' },
  { brandCode: '001', role: 'cashier', staffSubject: '00000000-0000-4000-8000-0000000000a2' },
  { brandCode: '002', role: 'manager', staffSubject: '00000000-0000-4000-8000-0000000000b1' },
  { brandCode: '002', role: 'security', staffSubject: '00000000-0000-4000-8000-0000000000b2' },
];

export const DEMO_PLAYERS: readonly DemoPlayer[] = [
  { brandCode: '001', publicId: '900001', label: 'Демо-игрок A', state: 'demo-active' },
  { brandCode: '001', publicId: '900002', label: 'Демо-игрок B', state: 'demo-active' },
  { brandCode: '001', publicId: '900003', label: 'Демо-игрок C', state: 'demo-limited' },
  { brandCode: '001', publicId: '900004', label: 'Демо-игрок D', state: 'demo-active' },
  { brandCode: '002', publicId: '910001', label: 'Демо-игрок E', state: 'demo-active' },
  { brandCode: '002', publicId: '910002', label: 'Демо-игрок F', state: 'demo-limited' },
];

export const DEMO_SNAPSHOTS: readonly BrandOperationalSnapshot[] = [
  {
    brandCode: '001',
    playerCount: 4,
    operationalStatus: 'active',
    financials: { currency: 'TMT', deposits: '120.00', withdrawals: '40.00', ggr: '15.50' },
  },
  {
    brandCode: '002',
    playerCount: 2,
    operationalStatus: 'registered',
    financials: { currency: 'USD', deposits: '80.00', withdrawals: '10.00', ggr: '6.00' },
  },
];

export const DEMO_AUDIT: readonly DemoAuditEvent[] = [
  {
    id: 'demo-audit-1',
    brandCode: '001',
    actor: 'Демонстрационный субъект',
    action: 'Открыт обзор сети',
    at: '2026-11-06 09:00',
  },
  {
    id: 'demo-audit-2',
    brandCode: '002',
    actor: 'Демонстрационный субъект',
    action: 'Просмотрен список сотрудников',
    at: '2026-11-06 09:15',
  },
  {
    id: 'demo-audit-3',
    brandCode: '003',
    actor: 'Демонстрационный субъект',
    action: 'Открыта подготовка бренда',
    at: '2026-11-06 09:20',
  },
];
