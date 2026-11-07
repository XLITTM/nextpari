import { isPermission, type FieldSpec, type FormSpec, type OfficeRole, type OfficeRoute } from '../access/model';

const dates: readonly FieldSpec[] = [
  { name: 'from', label: 'С', kind: 'date', required: true },
  { name: 'to', label: 'По', kind: 'date', required: true },
];

const player: readonly FieldSpec[] = [
  { name: 'playerId', label: 'Идентификатор игрока', kind: 'playerId', required: true, autoComplete: 'off' },
];

const severity: readonly FieldSpec[] = [
  ...dates,
  {
    name: 'severity',
    label: 'Уровень',
    kind: 'select',
    required: true,
    options: [
      { value: 'low', label: 'Низкий' },
      { value: 'medium', label: 'Средний' },
      { value: 'high', label: 'Высокий' },
    ],
  },
];

function invite(role: 'manager' | 'cashier' | 'security'): FormSpec {
  const label = role === 'manager' ? 'Менеджер' : role === 'cashier' ? 'Кассир' : 'Безопасность';
  return {
    id: `invite-${role}`,
    title: `Приглашение: ${label}`,
    submitLabel: 'Отправить приглашение',
    action: `owner.staff.invite.${role}`,
    path: '/owner/staff/invitations',
    fixed: { role },
    fields: [
      { name: 'email', label: 'Почта', kind: 'email', required: true, autoComplete: 'off' },
      { name: 'displayName', label: 'Имя', kind: 'personName', required: true, autoComplete: 'off' },
    ],
  };
}

function report(action: string, path: string): FormSpec {
  return {
    id: action,
    title: 'Период отчёта',
    submitLabel: 'Сформировать отчёт',
    action,
    path,
    fixed: {},
    fields: dates,
  };
}

function money(action: string, path: string, submitLabel: string): FormSpec {
  return {
    id: action,
    title: submitLabel,
    submitLabel,
    action,
    path,
    fixed: {},
    fields: [
      ...player,
      { name: 'currency', label: 'Валюта', kind: 'currency', required: true, autoComplete: 'off' },
      { name: 'amount', label: 'Сумма', kind: 'amount', required: true, autoComplete: 'off' },
      { name: 'note', label: 'Комментарий', kind: 'textarea', required: true },
    ],
  };
}

interface Draft {
  id: string;
  role: OfficeRole;
  path: string;
  title: string;
  nav: string;
  intro: string;
  section: OfficeRoute['section'];
  home?: boolean;
  data: OfficeRoute['data'];
  slots?: readonly string[];
  form?: FormSpec | null;
}

function screen(draft: Draft): OfficeRoute {
  const permission = `${draft.role}.${draft.id}`;
  if (!isPermission(permission)) throw new Error(`Unknown permission ${permission}`);
  return {
    id: `${draft.role}.${draft.id}`,
    role: draft.role,
    path: draft.path,
    permission,
    title: draft.title,
    nav: draft.nav,
    intro: draft.intro,
    section: draft.section,
    home: draft.home ?? false,
    data: draft.data,
    slots: draft.slots ?? [],
    readPath: draft.path,
    readAction: `${permission}.read`,
    form: draft.form ?? null,
  };
}

const managerInvite = invite('manager');
const cashierInvite = invite('cashier');
const securityInvite = invite('security');

export const OFFICE_ROUTES: readonly OfficeRoute[] = [
  screen({
    id: 'overview',
    role: 'owner',
    path: '/owner',
    title: 'Обзор',
    nav: 'Обзор',
    intro: 'Сводка бренда 002. Цифры появляются только в ответе сервера RIXO BET Office.',
    section: 'main',
    home: true,
    data: 'metrics',
    slots: ['Игроки', 'Касса', 'Спортбук', 'Казино'],
  }),
  screen({
    id: 'players',
    role: 'owner',
    path: '/owner/players',
    title: 'Игроки',
    nav: 'Игроки',
    intro: 'Поиск игроков бренда 002. Карточка открывается только из ответа сервера.',
    section: 'people',
    data: 'records',
    form: {
      id: 'owner.players.search',
      title: 'Поиск игрока',
      submitLabel: 'Найти',
      action: 'owner.players.search',
      path: '/owner/players/search',
      fixed: {},
      fields: [{ name: 'query', label: 'Запрос', kind: 'search', required: true, autoComplete: 'off' }],
    },
  }),
  screen({
    id: 'managers',
    role: 'owner',
    path: '/owner/managers',
    title: 'Менеджеры',
    nav: 'Менеджеры',
    intro: 'Приглашение менеджера. Учётная запись создаётся только сервером, роль в запросе зафиксирована.',
    section: 'people',
    data: 'records',
    form: managerInvite,
  }),
  screen({
    id: 'cashiers',
    role: 'owner',
    path: '/owner/cashiers',
    title: 'Кассиры',
    nav: 'Кассиры',
    intro: 'Приглашение кассира. Кассир не получает права владельца.',
    section: 'people',
    data: 'records',
    form: cashierInvite,
  }),
  screen({
    id: 'security_staff',
    role: 'owner',
    path: '/owner/security-staff',
    title: 'Сотрудники безопасности',
    nav: 'Сотрудники безопасности',
    intro: 'Приглашение сотрудника безопасности. Доступ ограничен утверждёнными проверками.',
    section: 'people',
    data: 'records',
    form: securityInvite,
  }),
  screen({
    id: 'treasury',
    role: 'owner',
    path: '/owner/treasury',
    title: 'Казначейство',
    nav: 'Казначейство',
    intro: 'Запрос перевода между счетами бренда 002. Сумма не проводится, пока сервер не запишет операцию и журнал.',
    section: 'money',
    data: 'accounts',
    slots: ['Счета казны'],
    form: {
      id: 'owner.treasury.transfer',
      title: 'Запрос перевода',
      submitLabel: 'Запросить перевод',
      action: 'owner.treasury.transfer',
      path: '/owner/treasury/transfers',
      fixed: {},
      fields: [
        { name: 'sourceAccount', label: 'Счёт списания', kind: 'accountCode', required: true, autoComplete: 'off' },
        { name: 'destinationAccount', label: 'Счёт зачисления', kind: 'accountCode', required: true, autoComplete: 'off' },
        { name: 'currency', label: 'Валюта', kind: 'currency', required: true, autoComplete: 'off' },
        { name: 'amount', label: 'Сумма', kind: 'amount', required: true, autoComplete: 'off' },
        { name: 'reason', label: 'Основание', kind: 'textarea', required: true },
      ],
    },
  }),
  screen({
    id: 'payments',
    role: 'owner',
    path: '/owner/payments',
    title: 'Депозиты и выводы',
    nav: 'Депозиты и выводы',
    intro: 'Просмотр платёжных операций бренда. Список не заполняется локально.',
    section: 'money',
    data: 'records',
    form: {
      id: 'owner.payments.search',
      title: 'Фильтр операций',
      submitLabel: 'Показать операции',
      action: 'owner.payments.search',
      path: '/owner/payments/search',
      fixed: {},
      fields: [
        ...dates,
        {
          name: 'kind',
          label: 'Тип',
          kind: 'select',
          required: true,
          options: [
            { value: 'deposit', label: 'Депозит' },
            { value: 'withdrawal', label: 'Вывод' },
          ],
        },
      ],
    },
  }),
  screen({
    id: 'sportsbook_reports',
    role: 'owner',
    path: '/owner/reports/sportsbook',
    title: 'Отчёты спортбука',
    nav: 'Отчёты спортбука',
    intro: 'Отчёт спортбука за период. Таблица строится только из ответа сервера.',
    section: 'reports',
    data: 'records',
    form: report('owner.reports.sportsbook', '/owner/reports/sportsbook'),
  }),
  screen({
    id: 'casino_reports',
    role: 'owner',
    path: '/owner/reports/casino',
    title: 'Отчёты казино',
    nav: 'Отчёты казино',
    intro: 'Отчёт казино за период. Показатели не подставляются заранее.',
    section: 'reports',
    data: 'records',
    form: report('owner.reports.casino', '/owner/reports/casino'),
  }),
  screen({
    id: 'financial_reports',
    role: 'owner',
    path: '/owner/reports/financial',
    title: 'Финансовые отчёты',
    nav: 'Финансовые отчёты',
    intro: 'Финансовый отчёт владельца. Доступ менеджера к казне сюда не входит.',
    section: 'reports',
    data: 'records',
    form: report('owner.reports.financial', '/owner/reports/financial'),
  }),
  screen({
    id: 'settings',
    role: 'owner',
    path: '/owner/settings',
    title: 'Права и настройки',
    nav: 'Права и настройки',
    intro: 'Потолок прав клиента. Фактический набор каждого сотрудника выдаёт и проверяет сервер.',
    section: 'control',
    data: 'records',
    form: {
      id: 'owner.settings.update',
      title: 'Запрос настройки',
      submitLabel: 'Сохранить запрос',
      action: 'owner.settings.update',
      path: '/owner/settings',
      fixed: {},
      fields: [
        { name: 'supportEmail', label: 'Почта поддержки', kind: 'email', required: true, autoComplete: 'off' },
        { name: 'timezone', label: 'Часовой пояс', kind: 'timezone', required: true, autoComplete: 'off' },
      ],
    },
  }),
  screen({
    id: 'audit',
    role: 'owner',
    path: '/owner/audit',
    title: 'Журнал действий',
    nav: 'Журнал действий',
    intro: 'Журнал привилегированных действий. Клиент не создаёт записей об успехе без ответа сервера.',
    section: 'control',
    data: 'records',
    form: {
      id: 'owner.audit.search',
      title: 'Фильтр журнала',
      submitLabel: 'Запросить журнал',
      action: 'owner.audit.search',
      path: '/owner/audit/search',
      fixed: {},
      fields: [...dates, { name: 'query', label: 'Действие', kind: 'search', required: false, autoComplete: 'off' }],
    },
  }),
  screen({
    id: 'dashboard',
    role: 'manager',
    path: '/manager',
    title: 'Сводка',
    nav: 'Сводка',
    intro: 'Сводка менеджера по назначенному контуру. Казна владельца недоступна.',
    section: 'main',
    home: true,
    data: 'metrics',
    slots: ['Игроки', 'Кассиры', 'Операции', 'Риски'],
  }),
  screen({
    id: 'players',
    role: 'manager',
    path: '/manager/players',
    title: 'Назначенные игроки',
    nav: 'Назначенные игроки',
    intro: 'Только игроки, которых сервер отнёс этому менеджеру.',
    section: 'people',
    data: 'records',
    form: {
      id: 'manager.players.search',
      title: 'Поиск в назначении',
      submitLabel: 'Найти',
      action: 'manager.players.search',
      path: '/manager/players/search',
      fixed: {},
      fields: [{ name: 'query', label: 'Запрос', kind: 'search', required: true, autoComplete: 'off' }],
    },
  }),
  screen({
    id: 'cashiers',
    role: 'manager',
    path: '/manager/cashiers',
    title: 'Назначенные кассиры',
    nav: 'Назначенные кассиры',
    intro: 'Кассиры текущего назначения. Назначение меняет сервер, не адресная строка.',
    section: 'people',
    data: 'records',
    form: {
      id: 'manager.cashiers.search',
      title: 'Поиск кассира',
      submitLabel: 'Найти',
      action: 'manager.cashiers.search',
      path: '/manager/cashiers/search',
      fixed: {},
      fields: [{ name: 'query', label: 'Запрос', kind: 'search', required: true, autoComplete: 'off' }],
    },
  }),
  screen({
    id: 'financial_reports',
    role: 'manager',
    path: '/manager/reports',
    title: 'Финансовые отчёты',
    nav: 'Финансовые отчёты',
    intro: 'Отчёт в пределах прав, которые сервер выдал менеджеру. Переводы казны сюда не входят.',
    section: 'reports',
    data: 'records',
    form: report('manager.reports.financial', '/manager/reports'),
  }),
  screen({
    id: 'operations',
    role: 'manager',
    path: '/manager/operations',
    title: 'Операции и история',
    nav: 'Операции и история',
    intro: 'История операций назначения. Проводки не подтверждаются из этого экрана.',
    section: 'money',
    data: 'records',
    form: {
      id: 'manager.operations.search',
      title: 'Период',
      submitLabel: 'Показать операции',
      action: 'manager.operations.search',
      path: '/manager/operations/search',
      fixed: {},
      fields: dates,
    },
  }),
  screen({
    id: 'risk',
    role: 'manager',
    path: '/manager/risk',
    title: 'Риск-уведомления',
    nav: 'Риск-уведомления',
    intro: 'Уведомления, которые сервер адресовал менеджеру. Локальный список не ведётся.',
    section: 'review',
    data: 'records',
    form: {
      id: 'manager.risk.search',
      title: 'Фильтр',
      submitLabel: 'Показать уведомления',
      action: 'manager.risk.search',
      path: '/manager/risk/search',
      fixed: {},
      fields: severity,
    },
  }),
  screen({
    id: 'settings',
    role: 'manager',
    path: '/manager/settings',
    title: 'Личные настройки',
    nav: 'Личные настройки',
    intro: 'Личные параметры менеджера. Роль и назначение этим запросом не меняются.',
    section: 'control',
    data: 'records',
    form: {
      id: 'manager.settings.update',
      title: 'Личные параметры',
      submitLabel: 'Сохранить запрос',
      action: 'manager.settings.update',
      path: '/manager/settings',
      fixed: {},
      fields: [
        { name: 'displayName', label: 'Отображаемое имя', kind: 'personName', required: true, autoComplete: 'off' },
        { name: 'timezone', label: 'Часовой пояс', kind: 'timezone', required: true, autoComplete: 'off' },
      ],
    },
  }),
  screen({
    id: 'dashboard',
    role: 'cashier',
    path: '/cashier',
    title: 'Сводка',
    nav: 'Сводка',
    intro: 'Смена кассира. Остаток и очередь операций приходят только с сервера.',
    section: 'main',
    home: true,
    data: 'metrics',
    slots: ['Смена', 'Очередь', 'Депозиты', 'Выводы'],
  }),
  screen({
    id: 'balance',
    role: 'cashier',
    path: '/cashier/balance',
    title: 'Кассовый остаток',
    nav: 'Кассовый остаток',
    intro: 'Остаток кассы бренда 002. Клиент не хранит и не вычисляет сумму.',
    section: 'money',
    data: 'accounts',
    slots: ['Остаток'],
  }),
  screen({
    id: 'deposits',
    role: 'cashier',
    path: '/cashier/deposits',
    title: 'Депозиты',
    nav: 'Депозиты',
    intro: 'Запрос на зачисление. Средства не зачисляются, пока сервер не подтвердит проводку и журнал.',
    section: 'money',
    data: 'records',
    form: money('cashier.deposits.create', '/cashier/deposits', 'Запросить депозит'),
  }),
  screen({
    id: 'withdrawals',
    role: 'cashier',
    path: '/cashier/withdrawals',
    title: 'Выводы',
    nav: 'Выводы',
    intro: 'Запрос на выплату. Выплата не отмечается выполненной без ответа сервера.',
    section: 'money',
    data: 'records',
    form: money('cashier.withdrawals.create', '/cashier/withdrawals', 'Запросить вывод'),
  }),
  screen({
    id: 'history',
    role: 'cashier',
    path: '/cashier/history',
    title: 'История операций',
    nav: 'История операций',
    intro: 'История кассы за период. Пустая таблица не означает нулевой оборот.',
    section: 'money',
    data: 'records',
    form: {
      id: 'cashier.history.search',
      title: 'Период',
      submitLabel: 'Показать операции',
      action: 'cashier.history.search',
      path: '/cashier/transactions/search',
      fixed: {},
      fields: dates,
    },
  }),
  screen({
    id: 'confirmations',
    role: 'cashier',
    path: '/cashier/confirmations',
    title: 'Подтверждения',
    nav: 'Подтверждения',
    intro: 'Решение по операции, номер которой выдал сервер. Без номера решение не отправляется.',
    section: 'money',
    data: 'records',
    form: {
      id: 'cashier.confirmations.decide',
      title: 'Решение по операции',
      submitLabel: 'Отправить решение',
      action: 'cashier.confirmations.decide',
      path: '/cashier/confirmations',
      fixed: {},
      fields: [
        { name: 'operationId', label: 'Номер операции', kind: 'operationId', required: true, autoComplete: 'off' },
        {
          name: 'decision',
          label: 'Решение',
          kind: 'select',
          required: true,
          options: [
            { value: 'confirm', label: 'Подтвердить' },
            { value: 'reject', label: 'Отклонить' },
          ],
        },
        { name: 'note', label: 'Комментарий', kind: 'textarea', required: true },
      ],
    },
  }),
  screen({
    id: 'settings',
    role: 'cashier',
    path: '/cashier/settings',
    title: 'Личные настройки',
    nav: 'Личные настройки',
    intro: 'Личные параметры кассира. Права владельца и казны отсюда не запрашиваются.',
    section: 'control',
    data: 'records',
    form: {
      id: 'cashier.settings.update',
      title: 'Личные параметры',
      submitLabel: 'Сохранить запрос',
      action: 'cashier.settings.update',
      path: '/cashier/settings',
      fixed: {},
      fields: [{ name: 'timezone', label: 'Часовой пояс', kind: 'timezone', required: true, autoComplete: 'off' }],
    },
  }),
  screen({
    id: 'overview',
    role: 'security',
    path: '/security',
    title: 'Обзор безопасности',
    nav: 'Обзор безопасности',
    intro: 'Контур проверок бренда 002. Финансовые проводки в этот портал не входят.',
    section: 'main',
    home: true,
    data: 'metrics',
    slots: ['Проверки', 'Сигналы', 'Ограничения', 'Инциденты'],
  }),
  screen({
    id: 'investigations',
    role: 'security',
    path: '/security/investigations',
    title: 'Проверки игроков',
    nav: 'Проверки игроков',
    intro: 'Карточка проверки открывается ответом сервера по идентификатору.',
    section: 'review',
    data: 'records',
    form: {
      id: 'security.investigations.search',
      title: 'Поиск проверки',
      submitLabel: 'Найти',
      action: 'security.investigations.search',
      path: '/security/investigations/search',
      fixed: {},
      fields: player,
    },
  }),
  screen({
    id: 'suspicious',
    role: 'security',
    path: '/security/suspicious',
    title: 'Подозрительная активность',
    nav: 'Подозрительная активность',
    intro: 'Сигналы сервера за период. Клиент не помечает активность сам.',
    section: 'review',
    data: 'records',
    form: {
      id: 'security.suspicious.search',
      title: 'Фильтр сигналов',
      submitLabel: 'Показать сигналы',
      action: 'security.suspicious.search',
      path: '/security/suspicious/search',
      fixed: {},
      fields: severity,
    },
  }),
  screen({
    id: 'restrictions',
    role: 'security',
    path: '/security/restrictions',
    title: 'Ограничения счетов',
    nav: 'Ограничения счетов',
    intro: 'Запрос ограничения. Статус счёта меняется только после записи сервера в журнал.',
    section: 'review',
    data: 'records',
    form: {
      id: 'security.restrictions.create',
      title: 'Запрос ограничения',
      submitLabel: 'Запросить ограничение',
      action: 'security.restrictions.create',
      path: '/security/restrictions',
      fixed: {},
      fields: [
        ...player,
        {
          name: 'restriction',
          label: 'Ограничение',
          kind: 'select',
          required: true,
          options: [
            { value: 'login_freeze', label: 'Блокировка входа' },
            { value: 'withdrawal_freeze', label: 'Блокировка выводов' },
            { value: 'play_freeze', label: 'Блокировка игры' },
          ],
        },
        { name: 'reason', label: 'Основание', kind: 'textarea', required: true },
      ],
    },
  }),
  screen({
    id: 'verification',
    role: 'security',
    path: '/security/verification',
    title: 'Статус верификации',
    nav: 'Статус верификации',
    intro: 'Статус верификации игрока. Документы и решение приходят с сервера.',
    section: 'review',
    data: 'records',
    form: {
      id: 'security.verification.search',
      title: 'Проверка статуса',
      submitLabel: 'Запросить статус',
      action: 'security.verification.search',
      path: '/security/verification/search',
      fixed: {},
      fields: player,
    },
  }),
  screen({
    id: 'incidents',
    role: 'security',
    path: '/security/incidents',
    title: 'История инцидентов',
    nav: 'История инцидентов',
    intro: 'Инциденты за период. Новая запись не создаётся из пустой формы.',
    section: 'control',
    data: 'records',
    form: {
      id: 'security.incidents.search',
      title: 'Период',
      submitLabel: 'Показать инциденты',
      action: 'security.incidents.search',
      path: '/security/incidents/search',
      fixed: {},
      fields: dates,
    },
  }),
  screen({
    id: 'audit',
    role: 'security',
    path: '/security/audit',
    title: 'Журнал аудита',
    nav: 'Журнал аудита',
    intro: 'Аудит действий, доступных службе безопасности. Финансовый журнал владельца сюда не копируется.',
    section: 'control',
    data: 'records',
    form: {
      id: 'security.audit.search',
      title: 'Фильтр журнала',
      submitLabel: 'Запросить журнал',
      action: 'security.audit.search',
      path: '/security/audit/search',
      fixed: {},
      fields: dates,
    },
  }),
];

const byPath = new Map(OFFICE_ROUTES.map((route) => [route.path, route]));

export function matchRoute(pathname: string): OfficeRoute | null {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return byPath.get(path) ?? null;
}

export function routesFor(role: OfficeRole): readonly OfficeRoute[] {
  return OFFICE_ROUTES.filter((route) => route.role === role);
}

export function homeFor(role: OfficeRole): string {
  const home = OFFICE_ROUTES.find((route) => route.role === role && route.home);
  if (!home) throw new Error(`Missing home for ${role}`);
  return home.path;
}

export function productionPaths(includePreview: boolean): string[] {
  const paths = OFFICE_ROUTES.map((route) => route.path);
  if (includePreview) paths.push('/dev/preview/*');
  return paths;
}

export function resolvePreview(pathname: string): OfficeRoute | null {
  if (!pathname.startsWith('/dev/preview')) return null;
  const rest = pathname.slice('/dev/preview'.length) || '/';
  const path = rest.split('?')[0] ?? '/';
  return matchRoute(path === '' || path === '/' ? '/owner' : path);
}

export function fixedRoleLabel(role: string): string {
  if (role === 'manager') return 'Менеджер';
  if (role === 'cashier') return 'Кассир';
  if (role === 'security') return 'Безопасность';
  return role;
}
