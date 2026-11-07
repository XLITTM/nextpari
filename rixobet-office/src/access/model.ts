export const OFFICE_ROLES = ['owner', 'manager', 'cashier', 'security'] as const;

export type OfficeRole = (typeof OFFICE_ROLES)[number];

export const PERMISSIONS = [
  'owner.overview',
  'owner.players',
  'owner.managers',
  'owner.cashiers',
  'owner.security_staff',
  'owner.treasury',
  'owner.payments',
  'owner.sportsbook_reports',
  'owner.casino_reports',
  'owner.financial_reports',
  'owner.settings',
  'owner.audit',
  'manager.dashboard',
  'manager.players',
  'manager.cashiers',
  'manager.financial_reports',
  'manager.operations',
  'manager.risk',
  'manager.settings',
  'cashier.dashboard',
  'cashier.balance',
  'cashier.deposits',
  'cashier.withdrawals',
  'cashier.history',
  'cashier.confirmations',
  'cashier.settings',
  'security.overview',
  'security.investigations',
  'security.suspicious',
  'security.restrictions',
  'security.verification',
  'security.incidents',
  'security.audit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<OfficeRole, string> = {
  owner: 'Владелец',
  manager: 'Менеджер',
  cashier: 'Кассир',
  security: 'Безопасность',
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  'owner.overview': 'Обзор',
  'owner.players': 'Игроки',
  'owner.managers': 'Менеджеры',
  'owner.cashiers': 'Кассиры',
  'owner.security_staff': 'Сотрудники безопасности',
  'owner.treasury': 'Казначейство',
  'owner.payments': 'Депозиты и выводы',
  'owner.sportsbook_reports': 'Отчёты спортбука',
  'owner.casino_reports': 'Отчёты казино',
  'owner.financial_reports': 'Финансовые отчёты',
  'owner.settings': 'Права и настройки',
  'owner.audit': 'Журнал действий',
  'manager.dashboard': 'Сводка менеджера',
  'manager.players': 'Назначенные игроки',
  'manager.cashiers': 'Назначенные кассиры',
  'manager.financial_reports': 'Финансовые отчёты менеджера',
  'manager.operations': 'Операции и история',
  'manager.risk': 'Риск-уведомления',
  'manager.settings': 'Личные настройки менеджера',
  'cashier.dashboard': 'Сводка кассира',
  'cashier.balance': 'Кассовый остаток',
  'cashier.deposits': 'Депозиты',
  'cashier.withdrawals': 'Выводы',
  'cashier.history': 'История операций',
  'cashier.confirmations': 'Подтверждения',
  'cashier.settings': 'Личные настройки кассира',
  'security.overview': 'Обзор безопасности',
  'security.investigations': 'Проверки игроков',
  'security.suspicious': 'Подозрительная активность',
  'security.restrictions': 'Ограничения счетов',
  'security.verification': 'Статус верификации',
  'security.incidents': 'История инцидентов',
  'security.audit': 'Журнал аудита',
};

function permissionsFor(role: OfficeRole): readonly Permission[] {
  return PERMISSIONS.filter((permission) => permission.startsWith(`${role}.`));
}

export const ROLE_CEILING: Record<OfficeRole, readonly Permission[]> = {
  owner: permissionsFor('owner'),
  manager: permissionsFor('manager'),
  cashier: permissionsFor('cashier'),
  security: permissionsFor('security'),
};

export function isOfficeRole(value: unknown): value is OfficeRole {
  return typeof value === 'string' && (OFFICE_ROLES as readonly string[]).includes(value);
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

export type FieldKind =
  | 'email'
  | 'personName'
  | 'password'
  | 'amount'
  | 'currency'
  | 'date'
  | 'textarea'
  | 'playerId'
  | 'accountCode'
  | 'operationId'
  | 'timezone'
  | 'search'
  | 'mfa'
  | 'select';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: readonly FieldOption[];
  autoComplete?: string;
}

export interface FormSpec {
  id: string;
  title: string;
  submitLabel: string;
  action: string;
  path: string;
  fixed: Readonly<Record<string, string>>;
  fields: readonly FieldSpec[];
}

export type PageKind = 'metrics' | 'records' | 'accounts';

export type NavSection = 'main' | 'people' | 'money' | 'reports' | 'review' | 'control';

export const SECTION_LABEL: Record<NavSection, string> = {
  main: 'Главное',
  people: 'Люди',
  money: 'Деньги',
  reports: 'Отчёты',
  review: 'Проверки',
  control: 'Контроль',
};

export interface OfficeRoute {
  id: string;
  role: OfficeRole;
  path: string;
  permission: Permission;
  title: string;
  nav: string;
  intro: string;
  section: NavSection;
  home: boolean;
  data: PageKind;
  slots: readonly string[];
  readPath: string;
  readAction: string;
  form: FormSpec | null;
}

export type AccessDecision = 'allow' | 'login' | 'deny';
