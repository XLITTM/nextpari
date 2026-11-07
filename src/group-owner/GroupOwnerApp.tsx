import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Building2,
  Landmark,
  LayoutDashboard,
  Menu,
  ScrollText,
  Shield,
  UserRound,
  Users,
} from 'lucide-react';
import { GROUP_BRANDS, type BrandCode } from '../../server/group/catalog.ts';
import { readRecoveryCallback } from './recoveryCallback.ts';
import type { BrandStaffGrant, StaffRole } from '../../server/group/access.ts';
import type { BrandOperationalSnapshot } from '../../server/group/reporting.ts';
import type { DemoAuditEvent } from './demoData.ts';
import {
  ACCOUNT_NOT_CREATED,
  OWNER_PERMISSION_LIST,
  STAFF_PERMISSIONS,
  WRITE_DISABLED,
  auditForBrand,
  brandLabel,
  brandsForFilter,
  buildGroupReport,
  employeeDraftReceipt,
  employeeFieldMessage,
  financeLines,
  grantsForBrand,
  overviewCounts,
  permissionLabel,
  playersForBrand,
  roleLabel,
  statusLabel,
  type BrandFilter,
  type EmployeeDraft,
  type EmployeeField,
  type GroupOwnerPage,
} from './viewModel.ts';

export interface GroupDashboardPlayer {
  brandCode: BrandCode;
  publicId: string;
  label: string;
  source: string;
}

export interface GroupDashboardData {
  grants: readonly BrandStaffGrant[];
  players: readonly GroupDashboardPlayer[];
  operational: readonly BrandOperationalSnapshot[];
  audit: readonly DemoAuditEvent[];
  permissions: readonly string[];
  schemaError: string | null;
  nextpariReason: string | null;
}

export interface GroupOwnerSession {
  ownerId: string;
  permissions: readonly string[];
}

const NAV: Array<{ id: GroupOwnerPage; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Обзор', icon: LayoutDashboard },
  { id: 'brands', label: 'Бренды', icon: Building2 },
  { id: 'employees', label: 'Сотрудники', icon: Users },
  { id: 'players', label: 'Игроки', icon: UserRound },
  { id: 'finance', label: 'Финансы', icon: Landmark },
  { id: 'access', label: 'Доступ', icon: Shield },
  { id: 'audit', label: 'Журнал', icon: ScrollText },
];

const EMPTY_DRAFT: EmployeeDraft = {
  brandCode: '001',
  identity: '',
  role: 'manager',
  permissions: ['players'],
  status: 'active',
};

function statusClass(status: string): string {
  if (status === 'active') return 'chip ok';
  if (status === 'registered' || status === 'provisioning') return 'chip wait';
  return 'chip muted';
}

export function GroupOwnerApp({
  initialPage = 'overview',
  initialBrand = 'all',
  initialSession = null,
  initialSnapshot = null,
}: {
  initialPage?: GroupOwnerPage;
  initialBrand?: BrandFilter;
  initialSession?: GroupOwnerSession | null;
  initialSnapshot?: GroupDashboardData | null;
}) {
  const [page, setPage] = useState<GroupOwnerPage>(initialPage);
  const [brand, setBrand] = useState<BrandFilter>(initialBrand);
  const [navOpen, setNavOpen] = useState(false);
  const [session, setSession] = useState<GroupOwnerSession | null>(initialSession);
  const [snapshot, setSnapshot] = useState<GroupDashboardData | null>(initialSnapshot);
  const report = useMemo(
    () => buildGroupReport(snapshot?.operational ?? [], snapshot?.grants ?? []),
    [snapshot],
  );
  const present = useMemo(() => new Set([
    ...(snapshot?.operational ?? []).map((row) => row.brandCode),
    ...(snapshot?.grants ?? []).map((row) => row.brandCode),
    ...(snapshot?.players ?? []).map((row) => row.brandCode),
  ]), [snapshot]);
  const visible = brandsForFilter(report, brand).filter((item) => present.has(item.code));
  const title = NAV.find((item) => item.id === page)?.label ?? 'Обзор';

  useEffect(() => {
    if (!session || initialSnapshot) return undefined;
    let cancelled = false;
    fetch('/api/group-owner/overview', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json() as { ok?: boolean; error?: string; data?: Record<string, unknown>; nextpari?: { reason?: string } };
        if (cancelled) return;
        if (!response.ok || !body.data) {
          setSnapshot(emptySnapshot(String(body.error ?? 'GROUP_SCHEMA_UNAVAILABLE')));
          return;
        }
        setSnapshot(snapshotFromOverview(body.data, body.nextpari?.reason ?? null));
      })
      .catch(() => {
        if (!cancelled) setSnapshot(emptySnapshot('GROUP_SCHEMA_UNAVAILABLE'));
      });
    return () => {
      cancelled = true;
    };
  }, [session, initialSnapshot]);
  if (!session) {
    return <Login onSignedIn={setSession} />;
  }

  return (
    <div className={navOpen ? 'shell nav-open' : 'shell'}>
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="mark">G</div>
          <div>
            <strong>Владелец группы</strong>
            <span>Сеть брендов</span>
          </div>
        </div>
        <nav className="nav" aria-label="Разделы">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={page === item.id ? 'active' : undefined}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => {
                  setPage(item.id);
                  setNavOpen(false);
                }}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button className="menu-button" type="button" onClick={() => setNavOpen((open) => !open)}>
              <Menu size={16} /> Меню
            </button>
            <h1>{title}</h1>
            <p>Отдельный кабинет сети. Кабинет владельца NextPari не заменяется.</p>
          </div>
          <div className="toolbar">
            <label className="field">
              Бренд
              <select
                aria-label="Фильтр бренда"
                value={brand}
                onChange={(event) => setBrand(event.target.value as BrandFilter)}
              >
                <option value="all">Все</option>
                <option value="001">NextPari</option>
                <option value="002">RYXO</option>
                <option value="003">Будущий бренд</option>
              </select>
            </label>
          </div>
        </header>
        <main className="content">
          <p className="note">Источник: group_control. Показатели появляются только из ответа API.</p>
          {snapshot?.schemaError ? <div className="warning" role="status">{snapshot.schemaError}</div> : null}
          {snapshot?.nextpariReason === 'NEXTPARI_REPORT_ADAPTER_REQUIRED'
            ? <p className="note">Отчёт NextPari не подключён отдельным серверным доступом.</p>
            : null}
          {page === 'overview' ? <Overview reportBrands={visible} /> : null}
          {page === 'brands' ? <Brands filter={brand} rows={visible} /> : null}
          {page === 'employees' ? <Employees filter={brand} grants={snapshot?.grants ?? []} /> : null}
          {page === 'players' ? <Players filter={brand} players={snapshot?.players ?? []} /> : null}
          {page === 'finance' ? <Finance filter={brand} report={report} visible={visible.map((item) => item.code)} /> : null}
          {page === 'access' ? <Access filter={brand} grants={snapshot?.grants ?? []} permissions={snapshot?.permissions ?? session.permissions} /> : null}
          {page === 'audit' ? <Audit filter={brand} events={snapshot?.audit ?? []} /> : null}
        </main>
      </div>
    </div>
  );
}

function Overview({ reportBrands }: { reportBrands: ReturnType<typeof brandsForFilter> }) {
  const counts = overviewCounts(reportBrands);
  return (
    <>
      <section className="cards" aria-label="Сводные показатели">
        <article className="card"><span>Бренды</span><strong>{counts.brandCount}</strong></article>
        <article className="card"><span>Игроки</span><strong>{counts.playerCount}</strong></article>
        <article className="card"><span>Менеджеры</span><strong>{counts.managerCount}</strong></article>
        <article className="card"><span>Кассиры</span><strong>{counts.cashierCount}</strong></article>
        <article className="card"><span>Безопасность</span><strong>{counts.securityCount}</strong></article>
      </section>
      <section className="panel">
        <h2>Операционные статусы</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Бренд</th>
                <th>Код</th>
                <th>Статус</th>
                <th className="num">Игроки</th>
                <th className="num">Менеджеры</th>
                <th className="num">Кассиры</th>
              </tr>
            </thead>
            <tbody>
              {reportBrands.map((item) => (
                <tr key={item.code}>
                  <td>{brandLabel(item.code)}</td>
                  <td>{item.code}</td>
                  <td><span className={statusClass(item.operationalStatus)}>{statusLabel(item.operationalStatus)}</span></td>
                  <td className="num">{item.playerCount}</td>
                  <td className="num">{item.managerCount}</td>
                  <td className="num">{item.cashierCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Brands({ filter, rows }: { filter: BrandFilter; rows: ReturnType<typeof brandsForFilter> }) {
  void filter;
  return (
    <section className="panel">
      <h2>Бренды сети</h2>
      <p className="note">{WRITE_DISABLED} Создание бренда и назначение домена подготовлены, но не выполняются.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Код</th>
              <th>Название</th>
              <th>Статус</th>
              <th>Домен</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.code}>
                <td>{item.code}</td>
                <td>{brandLabel(item.code)}</td>
                <td><span className={statusClass(item.operationalStatus)}>{statusLabel(item.operationalStatus)}</span></td>
                <td>не назначен</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
        <label className="field">Название
          <input type="text" name="brandName" placeholder="Новый бренд" disabled />
        </label>
        <label className="field">Будущий домен
          <input type="text" name="domain" placeholder="example.invalid" disabled />
        </label>
        <div className="actions">
          <button className="primary" type="button" disabled>Создать бренд</button>
          <span>Кнопка не пишет в базу.</span>
        </div>
      </form>
    </section>
  );
}

function Employees({ filter, grants: allGrants }: { filter: BrandFilter; grants: readonly BrandStaffGrant[] }) {
  const [draft, setDraft] = useState<EmployeeDraft>({ ...EMPTY_DRAFT, brandCode: filter === 'all' ? '001' : filter });
  const [errors, setErrors] = useState<EmployeeField[]>([]);
  const [notice, setNotice] = useState('');
  const grants = grantsForBrand(allGrants, filter);

  function update(partial: Partial<EmployeeDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setNotice('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const receipt = employeeDraftReceipt(draft);
    setErrors(receipt.errors);
    if (receipt.errors.length > 0) {
      setNotice('');
      return;
    }
    setNotice(`${ACCOUNT_NOT_CREATED} ${WRITE_DISABLED}`);
  }

  return (
    <section className="panel">
      <h2>Сотрудники бренда</h2>
      <p className="note">Роли менеджера, кассира и безопасности назначаются внутри одного бренда. Один идентификатор в двух базах — это два разных человека.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Бренд</th>
              <th>Роль</th>
              <th>Субъект</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={`${grant.brandCode}-${grant.staffSubject}`}>
                <td>{brandLabel(grant.brandCode)}</td>
                <td>{roleLabel(grant.role)}</td>
                <td>{grant.staffSubject}</td>
                <td><span className="chip wait">только чтение</span></td>
              </tr>
            ))}
            {grants.length === 0 ? <tr><td colSpan={4}>Для выбранного бренда нет назначений.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <h2>Форма назначения</h2>
      <form onSubmit={submit} className="form-grid">
        <label className="field">Бренд / сайт
          <select
            aria-label="Бренд сотрудника"
            value={draft.brandCode}
            onChange={(event) => update({ brandCode: event.target.value })}
          >
            {GROUP_BRANDS.map((item) => (
              <option key={item.code} value={item.code}>{brandLabel(item.code as BrandCode)}</option>
            ))}
          </select>
        </label>
        <label className="field">Имя сотрудника
          <input
            aria-label="Имя сотрудника"
            type="text"
            value={draft.identity}
            onChange={(event) => update({ identity: event.target.value })}
          />
        </label>
        <label className="field">Роль
          <select aria-label="Роль" value={draft.role} onChange={(event) => update({ role: event.target.value })}>
            <option value="manager">Менеджер</option>
            <option value="cashier">Кассир</option>
            <option value="security">Безопасность</option>
          </select>
        </label>
        <label className="field">Статус
          <select aria-label="Статус" value={draft.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="active">Активен</option>
            <option value="suspended">Приостановлен</option>
          </select>
        </label>
        <fieldset className="field" style={{ gridColumn: '1 / -1', border: 0, margin: 0, padding: 0 }}>
          <legend>Права</legend>
          <div className="checks">
            {STAFF_PERMISSIONS.map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={draft.permissions.includes(permission)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...draft.permissions, permission]
                      : draft.permissions.filter((item) => item !== permission);
                    update({ permissions: next });
                  }}
                />
                {permissionLabel(permission)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="actions" style={{ gridColumn: '1 / -1' }}>
          <button className="primary" type="submit">Проверить форму</button>
          <button className="ghost" type="button" disabled>Отправить приглашение</button>
        </div>
      </form>
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((field) => <li key={field}>{employeeFieldMessage(field)}</li>)}
        </ul>
      ) : null}
      {draft.brandCode === '003' ? <p className="note">Бренд запланирован. Назначение не станет действующим доступом.</p> : null}
      {notice ? <p className="warning" role="status">{notice}</p> : null}
    </section>
  );
}

function Players({ filter, players }: { filter: BrandFilter; players: readonly GroupDashboardPlayer[] }) {
  const rows = playersForBrand(players, filter);
  return (
    <section className="panel">
      <h2>Игроки</h2>
      <p className="note">Публичный ID глобально уникален. Список показывает только выбранный бренд и не подмешивает чужие записи.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Публичный ID</th>
              <th>Бренд</th>
              <th>Метка</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => (
              <tr key={player.publicId}>
                <td>{player.publicId}</td>
                <td>{brandLabel(player.brandCode)}</td>
                <td>{player.label}</td>
                <td>{player.source}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4}>У этого бренда нет записей игроков.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Finance({ filter, report, visible }: { filter: BrandFilter; report: ReturnType<typeof buildGroupReport>; visible: string[] }) {
  const lines = financeLines(report, filter).filter((line) => visible.includes(line.brandCode));
  return (
    <section className="panel">
      <h2>Финансы только для чтения</h2>
      <p className="note">Суммы разделены по бренду и валюте. Разные валюты не складываются.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Бренд</th>
              <th>Валюта</th>
              <th className="num">Депозиты</th>
              <th className="num">Выводы</th>
              <th className="num">GGR</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.brandCode}-${line.currency}`}>
                <td>{brandLabel(line.brandCode)}</td>
                <td>{line.currency}</td>
                <td className="num">{line.deposits}</td>
                <td className="num">{line.withdrawals}</td>
                <td className="num">{line.ggr}</td>
              </tr>
            ))}
            {lines.length === 0 ? <tr><td colSpan={5}>Для выбранного бренда нет финансовых строк.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Access({ filter, grants: allGrants, permissions }: { filter: BrandFilter; grants: readonly BrandStaffGrant[]; permissions: readonly string[] }) {
  const grants = grantsForBrand(allGrants, filter);
  return (
    <section className="panel">
      <h2>Доступ владельца группы</h2>
      <p className="note">Вход владельца группы будет проверяться по UUID в базе control-plane. Этот экран не выполняет вход и не содержит обхода прав.</p>
      <ul>
        {(permissions.length > 0 ? permissions : OWNER_PERMISSION_LIST).map((permission) => <li key={permission}>{permissionLabel(permission)}</li>)}
      </ul>
      <h2>Назначения внутри брендов</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Бренд</th>
              <th>Роль</th>
              <th>Субъект бренда</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={`${grant.brandCode}-${grant.role}-${grant.staffSubject}`}>
                <td>{brandLabel(grant.brandCode)}</td>
                <td>{roleLabel(grant.role as StaffRole)}</td>
                <td>{grant.staffSubject}</td>
              </tr>
            ))}
            {grants.length === 0 ? <tr><td colSpan={3}>Нет назначений.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Audit({ filter, events: allEvents }: { filter: BrandFilter; events: readonly DemoAuditEvent[] }) {
  const events = auditForBrand(allEvents, filter);
  return (
    <section className="panel">
      <h2>Журнал</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Бренд</th>
              <th>Субъект</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.at}</td>
                <td>{brandLabel(event.brandCode)}</td>
                <td>{event.actor}</td>
                <td>{event.action}</td>
              </tr>
            ))}
            {events.length === 0 ? <tr><td colSpan={4}>Для выбранного бренда нет записей.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function emptySnapshot(schemaError: string): GroupDashboardData {
  return {
    grants: [],
    players: [],
    operational: [],
    audit: [],
    permissions: [],
    schemaError,
    nextpariReason: null,
  };
}

function snapshotFromOverview(data: Record<string, unknown>, nextpariReason: string | null): GroupDashboardData {
  const list = (value: unknown): Record<string, unknown>[] => (
    Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
  );
  const code = (value: unknown): BrandCode | null => (value === '001' || value === '002' || value === '003' ? value : null);
  return {
    schemaError: null,
    nextpariReason,
    permissions: [],
    grants: list(data.grants).flatMap((row) => {
      const brandCode = code(row.brandCode);
      const role = row.role;
      if (!brandCode || (role !== 'manager' && role !== 'cashier' && role !== 'security')) return [];
      return [{ brandCode, role, staffSubject: String(row.staffSubject ?? '') }];
    }),
    players: list(data.players).flatMap((row) => {
      const brandCode = code(row.brandCode);
      if (!brandCode) return [];
      const publicId = String(row.publicId ?? '');
      return [{ brandCode, publicId, label: publicId, source: String(row.source ?? '') }];
    }),
    operational: list(data.finance).flatMap((row) => {
      const brandCode = code(row.brandCode);
      if (!brandCode) return [];
      const status = String(row.operationalStatus ?? 'planned');
      const operationalStatus = status === 'active' || status === 'registered' || status === 'planned' || status === 'provisioning' || status === 'suspended'
        ? status
        : 'planned';
      return [{
        brandCode,
        playerCount: Number(row.playerCount ?? 0),
        operationalStatus,
        financials: {
          currency: String(row.currency ?? ''),
          deposits: String(row.deposits ?? '0'),
          withdrawals: String(row.withdrawals ?? '0'),
          ggr: String(row.ggr ?? '0'),
        },
      }];
    }),
    audit: list(data.audit).flatMap((row) => {
      const brandCode = code(row.brandCode);
      if (!brandCode) return [];
      return [{ id: String(row.id ?? ''), brandCode, actor: String(row.actor ?? ''), action: String(row.action ?? ''), at: String(row.at ?? '') }];
    }),
  };
}

function Login({ onSignedIn }: { onSignedIn: (session: GroupOwnerSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [mfa, setMfa] = useState(false);
  const [setupUri, setSetupUri] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset' | 'invalid'>('login');

  useEffect(() => {
    const callback = readRecoveryCallback(window.location.hash);
    if (callback.kind === 'none') return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (callback.kind === 'invalid') {
      setMode('invalid');
      return;
    }
    const accessToken = callback.accessToken;
    const refreshToken = callback.refreshToken;
    void (async () => {
      try {
        const response = await fetch('/api/group-owner/auth/recover/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, refreshToken }),
        });
        setMode(response.ok ? 'reset' : 'invalid');
      } catch {
        setMode('invalid');
      }
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
    const response = await fetch(mfa ? '/api/group-owner/auth/mfa' : '/api/group-owner/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mfa ? { factorId, code } : { email, password }),
    });
    const body = await response.json() as {
      ok?: boolean;
      mfaRequired?: boolean;
      enrollmentRequired?: boolean;
      factorId?: string | null;
    };
    if (body.mfaRequired) {
      setMfa(true);
      if (body.factorId) setFactorId(body.factorId);
      if (body.enrollmentRequired) {
        const enrolled = await fetch('/api/group-owner/auth/enroll', {
          method: 'POST',
          credentials: 'include',
        });
        const enrolledBody = await enrolled.json() as { ok?: boolean; factorId?: string; uri?: string };
        if (!enrolled.ok || !enrolledBody.ok || !enrolledBody.factorId || !enrolledBody.uri) {
          setMessage('Вход не выполнен.');
          return;
        }
        setFactorId(enrolledBody.factorId);
        setSetupUri(enrolledBody.uri);
        setMessage('Добавьте адрес MFA в приложение и введите код. Данные не открыты.');
        return;
      }
      setMessage('Нужен код MFA. Данные не открыты.');
      return;
    }
    if (!response.ok || !body.ok) {
      setMessage('Вход не выполнен.');
      return;
    }
    const sessionResponse = await fetch('/api/group-owner/auth/session', { credentials: 'include' });
    const sessionBody = await sessionResponse.json() as { mfa?: string; ownerId?: string; permissions?: string[] };
    if (sessionBody.mfa !== 'aal2' || !sessionBody.ownerId) {
      setMessage('Сессия не подтверждена.');
      return;
    }
    onSignedIn({ ownerId: sessionBody.ownerId, permissions: sessionBody.permissions ?? [] });
    } catch {
      setMessage('Вход не выполнен.');
    }
  }

  async function requestRecovery(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const response = await fetch('/api/group-owner/auth/recover', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json() as { ok?: boolean };
      setMessage(response.ok && body.ok
        ? 'Если для этой учётной записи доступно восстановление, письмо отправлено.'
        : 'Письмо сейчас не отправлено.');
    } catch {
      setMessage('Письмо сейчас не отправлено.');
    }
  }

  async function completeRecovery(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    if (nextPassword.length < 8 || nextPassword !== confirmPassword) {
      setMessage('Пароли не совпадают. Нужно не меньше 8 символов.');
      return;
    }
    try {
      const response = await fetch('/api/group-owner/auth/recover/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: nextPassword, confirm: confirmPassword }),
      });
      const body = await response.json() as { ok?: boolean };
      if (!response.ok || !body.ok) {
        setMode('invalid');
        setMessage('Ссылка недействительна или устарела.');
        return;
      }
      setNextPassword('');
      setConfirmPassword('');
      setMode('login');
      setMessage('Пароль обновлён. Войдите снова. Проверка MFA сохраняется.');
    } catch {
      setMode('invalid');
      setMessage('Ссылка недействительна или устарела.');
    }
  }

  if (mode === 'forgot') {
    return (
      <main className="content" style={{ maxWidth: 460, margin: '10vh auto' }}>
        <section className="panel">
          <h2>Восстановление пароля</h2>
          <p className="note">Письмо придёт только для существующей учётной записи владельца группы.</p>
          <form onSubmit={requestRecovery} className="form-grid">
            <label className="field">Почта
              <input aria-label="Почта" type="text" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
            </label>
            <button className="primary" type="submit">Отправить ссылку</button>
          </form>
          <button className="ghost" type="button" onClick={() => { setMode('login'); setMessage(''); }}>Вернуться ко входу</button>
          {message ? <p className="warning" role="status">{message}</p> : null}
        </section>
      </main>
    );
  }

  if (mode === 'reset') {
    return (
      <main className="content" style={{ maxWidth: 460, margin: '10vh auto' }}>
        <section className="panel">
          <h2>Новый пароль</h2>
          <p className="note">Сессия восстановления проверена. Права владельца и MFA не меняются.</p>
          <form onSubmit={completeRecovery} className="form-grid">
            <label className="field">Новый пароль
              <input aria-label="Новый пароль" type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} autoComplete="new-password" />
            </label>
            <label className="field">Повторите пароль
              <input aria-label="Повторите пароль" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </label>
            <button className="primary" type="submit">Сохранить пароль</button>
          </form>
          {message ? <p className="warning" role="status">{message}</p> : null}
        </section>
      </main>
    );
  }

  if (mode === 'invalid') {
    return (
      <main className="content" style={{ maxWidth: 460, margin: '10vh auto' }}>
        <section className="panel">
          <h2>Ссылка недействительна</h2>
          <p className="warning" role="status">Ссылка недействительна или устарела. Запросите новое письмо.</p>
          <button className="primary" type="button" onClick={() => { setMode('login'); setMessage(''); }}>Вернуться ко входу</button>
        </section>
      </main>
    );
  }

  return (
    <main className="content" style={{ maxWidth: 460, margin: '10vh auto' }}>
      <section className="panel">
        <h2>Вход владельца группы</h2>
        <p className="note">Сессия проверяется на сервере по owner_identities и owner_permissions. Обхода нет.</p>
        <form onSubmit={submit} className="form-grid">
          <label className="field">Почта
            <input aria-label="Почта" type="text" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">Пароль
            <input aria-label="Пароль" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {mfa ? (
            <>
              {setupUri ? <label className="field">Адрес MFA
                <input aria-label="Адрес MFA" type="text" readOnly value={setupUri} />
              </label> : null}
              <label className="field">Код MFA
                <input aria-label="Код MFA" type="text" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
              </label>
              <label className="field">Фактор
                <input aria-label="Фактор" type="text" value={factorId} onChange={(event) => setFactorId(event.target.value)} />
              </label>
            </>
          ) : null}
          <button className="primary" type="submit">Войти</button>
          <button className="ghost" type="button" onClick={() => { setMode('forgot'); setMessage(''); }}>Забыли пароль?</button>
        </form>
        {message ? <p className="warning" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
