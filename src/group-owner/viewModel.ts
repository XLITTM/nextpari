import { OWNER_PERMISSIONS, type BrandStaffGrant, type StaffRole } from '../../server/group/access.ts';
import { GROUP_BRANDS, type BrandCode } from '../../server/group/catalog.ts';
import { aggregateGroupReport, type BrandOperationalSnapshot, type BrandReport, type GroupReport } from '../../server/group/reporting.ts';
import type { DemoAuditEvent, DemoPlayer } from './demoData.ts';

export const WRITE_DISABLED = 'Запись отключена. Казначейские и денежные операции не открыты.';
export const ACCOUNT_NOT_CREATED = 'Учётная запись не создана. Приглашение не отправлено.';
export const NOT_CONNECTED = 'Не подключено';

export const PAGES = ['overview', 'brands', 'employees', 'players', 'finance', 'access', 'audit'] as const;
export type GroupOwnerPage = (typeof PAGES)[number];

export type BrandFilter = 'all' | BrandCode;

export const STAFF_PERMISSIONS = ['players', 'balances', 'transactions', 'staff'] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const STAFF_ROLES: readonly StaffRole[] = ['manager', 'cashier', 'security'];

export interface EmployeeDraft {
  brandCode: string;
  identity: string;
  role: string;
  permissions: readonly string[];
  status: string;
}

export type EmployeeField = 'brandCode' | 'identity' | 'role' | 'permissions' | 'status';

export interface EmployeeReceipt {
  accountCreated: false;
  invitationSent: false;
  errors: EmployeeField[];
}

const IDENTITY_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{1,62}[\p{L}\p{N}]$/u;

export function validateEmployeeDraft(draft: EmployeeDraft): EmployeeField[] {
  const errors: EmployeeField[] = [];
  if (draft.brandCode !== '001' && draft.brandCode !== '002' && draft.brandCode !== '003') errors.push('brandCode');
  const identity = draft.identity.trim();
  if (identity.length < 3 || identity.length > 64 || identity.includes('@') || !IDENTITY_RE.test(identity)) {
    errors.push('identity');
  }
  if (!STAFF_ROLES.includes(draft.role as StaffRole)) errors.push('role');
  const permissions = new Set(draft.permissions);
  if (permissions.size === 0 || [...permissions].some((item) => !STAFF_PERMISSIONS.includes(item as StaffPermission))) {
    errors.push('permissions');
  }
  if (draft.status !== 'active' && draft.status !== 'suspended') errors.push('status');
  return errors;
}

export function employeeDraftReceipt(draft: EmployeeDraft): EmployeeReceipt {
  return {
    accountCreated: false,
    invitationSent: false,
    errors: validateEmployeeDraft(draft),
  };
}

export function employeeFieldMessage(field: EmployeeField): string {
  switch (field) {
    case 'brandCode':
      return 'Выберите бренд.';
    case 'identity':
      return 'Укажите имя из 3–64 символов без адреса почты.';
    case 'role':
      return 'Выберите роль: менеджер, кассир или безопасность.';
    case 'permissions':
      return 'Отметьте хотя бы одно право.';
    case 'status':
      return 'Выберите статус.';
    default:
      return 'Проверьте поле.';
  }
}

export function buildGroupReport(
  snapshots: readonly BrandOperationalSnapshot[] = [],
  grants: readonly BrandStaffGrant[] = [],
): GroupReport {
  return aggregateGroupReport(snapshots, grants);
}

export function brandsForFilter(report: GroupReport, filter: BrandFilter): BrandReport[] {
  if (filter === 'all') return report.brands;
  return report.brands.filter((brand) => brand.code === filter);
}

export function playersForBrand<T extends { brandCode: BrandCode }>(players: readonly T[], filter: BrandFilter): T[] {
  if (filter === 'all') return [...players];
  return players.filter((player) => player.brandCode === filter);
}

export function grantsForBrand(grants: readonly BrandStaffGrant[], filter: BrandFilter): BrandStaffGrant[] {
  if (filter === 'all') return [...grants];
  return grants.filter((grant) => grant.brandCode === filter);
}

export function auditForBrand(events: readonly DemoAuditEvent[], filter: BrandFilter): DemoAuditEvent[] {
  if (filter === 'all') return [...events];
  return events.filter((event) => event.brandCode === filter);
}

export interface FinanceLine {
  brandCode: BrandCode;
  displayName: string;
  currency: string;
  deposits: string;
  withdrawals: string;
  ggr: string;
}

export function financeLines(report: GroupReport, filter: BrandFilter): FinanceLine[] {
  return brandsForFilter(report, filter).flatMap((brand) =>
    brand.financials.map((line) => ({
      brandCode: brand.code,
      displayName: brand.displayName,
      currency: line.currency,
      deposits: line.deposits,
      withdrawals: line.withdrawals,
      ggr: line.ggr,
    })),
  );
}

export interface AssignedBrand {
  code: BrandCode;
  displayName: string;
  status: string;
}

export interface AssignedBrandView {
  code: BrandCode;
  displayName: string;
  status: string;
  playerCount: number | null;
  managerCount: number;
  cashierCount: number;
  securityCount: number;
  financials: BrandReport['financials'] | null;
}

export function assignedBrandViews(
  brands: readonly AssignedBrand[],
  snapshots: readonly BrandOperationalSnapshot[],
  grants: readonly BrandStaffGrant[],
): AssignedBrandView[] {
  return brands.map((brand) => {
    const rows = snapshots.filter((row) => row.brandCode === brand.code);
    const staff = grants.filter((grant) => grant.brandCode === brand.code);
    const connected = rows.length > 0;
    return {
      code: brand.code,
      displayName: brand.displayName,
      status: brand.status,
      playerCount: connected ? rows[0]!.playerCount : null,
      managerCount: staff.filter((grant) => grant.role === 'manager').length,
      cashierCount: staff.filter((grant) => grant.role === 'cashier').length,
      securityCount: staff.filter((grant) => grant.role === 'security').length,
      financials: connected ? rows.map((row) => row.financials) : null,
    };
  });
}

export function countLabel(value: number | null): string {
  return value == null ? NOT_CONNECTED : String(value);
}

export function totalPlayers(brands: readonly AssignedBrandView[]): number | null {
  if (brands.length === 0 || brands.some((brand) => brand.playerCount == null)) return null;
  return brands.reduce((sum, brand) => sum + (brand.playerCount ?? 0), 0);
}

export function overviewCounts(brands: readonly BrandReport[]): {
  brandCount: number;
  playerCount: number;
  managerCount: number;
  cashierCount: number;
  securityCount: number;
} {
  return {
    brandCount: brands.length,
    playerCount: brands.reduce((sum, brand) => sum + brand.playerCount, 0),
    managerCount: brands.reduce((sum, brand) => sum + brand.managerCount, 0),
    cashierCount: brands.reduce((sum, brand) => sum + brand.cashierCount, 0),
    securityCount: brands.reduce((sum, brand) => sum + brand.securityCount, 0),
  };
}

export function brandLabel(code: BrandCode): string {
  return GROUP_BRANDS.find((brand) => brand.code === code)?.displayName ?? code;
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Активен';
    case 'registered':
      return 'Зарегистрирован';
    case 'planned':
      return 'Запланирован';
    case 'provisioning':
      return 'Подготовка';
    case 'suspended':
      return 'Приостановлен';
    default:
      return status;
  }
}

export function roleLabel(role: StaffRole): string {
  switch (role) {
    case 'manager':
      return 'Менеджер';
    case 'cashier':
      return 'Кассир';
    case 'security':
      return 'Безопасность';
    default:
      return role;
  }
}

export function permissionLabel(permission: string): string {
  switch (permission) {
    case 'players':
      return 'Игроки';
    case 'balances':
      return 'Балансы';
    case 'transactions':
      return 'Операции';
    case 'staff':
      return 'Сотрудники';
    case 'brands.read':
      return 'Чтение брендов';
    case 'reports.read':
      return 'Чтение отчётов';
    case 'brands.register':
      return 'Регистрация бренда';
    case 'staff.map':
      return 'Назначение сотрудников';
    case 'ids.reserve':
      return 'Резерв идентификаторов';
    default:
      return permission;
  }
}

export const OWNER_PERMISSION_LIST = OWNER_PERMISSIONS;

export function publicIdsAreGloballyUnique(players: readonly DemoPlayer[]): boolean {
  return new Set(players.map((player) => player.publicId)).size === players.length;
}

export function playerIdsLeakAcrossBrands(players: readonly DemoPlayer[], filter: BrandFilter): boolean {
  if (filter === 'all') return false;
  return playersForBrand(players, filter).some((player) => player.brandCode !== filter);
}
