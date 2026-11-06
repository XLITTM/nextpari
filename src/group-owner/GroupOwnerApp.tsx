import { useMemo, useState, type FormEvent } from 'react';
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
import type { StaffRole } from '../../server/group/access.ts';
import {
  ACCOUNT_NOT_CREATED,
  DEMO_AUDIT,
  DEMO_BANNER,
  DEMO_GRANTS,
  DEMO_PLAYERS,
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
}: {
  initialPage?: GroupOwnerPage;
  initialBrand?: BrandFilter;
}) {
  const [page, setPage] = useState<GroupOwnerPage>(initialPage);
  const [brand, setBrand] = useState<BrandFilter>(initialBrand);
  const [navOpen, setNavOpen] = useState(false);
  const report = useMemo(() => buildGroupReport(), []);
  const title = NAV.find((item) => item.id === page)?.label ?? 'Обзор';

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
          <div className="banner" role="status">{DEMO_BANNER}</div>
          {page === 'overview' ? <Overview reportBrands={brandsForFilter(report, brand)} /> : null}
          {page === 'brands' ? <Brands filter={brand} /> : null}
          {page === 'employees' ? <Employees filter={brand} /> : null}
          {page === 'players' ? <Players filter={brand} /> : null}
          {page === 'finance' ? <Finance filter={brand} /> : null}
          {page === 'access' ? <Access filter={brand} /> : null}
          {page === 'audit' ? <Audit filter={brand} /> : null}
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
        <article className="card"><span>Бренды</span><strong>{counts.brandCount}</strong><em>ДЕМО</em></article>
        <article className="card"><span>Игроки</span><strong>{counts.playerCount}</strong><em>ДЕМО</em></article>
        <article className="card"><span>Менеджеры</span><strong>{counts.managerCount}</strong><em>ДЕМО</em></article>
        <article className="card"><span>Кассиры</span><strong>{counts.cashierCount}</strong><em>ДЕМО</em></article>
        <article className="card"><span>Безопасность</span><strong>{counts.securityCount}</strong><em>ДЕМО</em></article>
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

function Brands({ filter }: { filter: BrandFilter }) {
  const rows = GROUP_BRANDS.filter((item) => filter === 'all' || item.code === filter);
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
                <td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td>
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

function Employees({ filter }: { filter: BrandFilter }) {
  const [draft, setDraft] = useState<EmployeeDraft>({ ...EMPTY_DRAFT, brandCode: filter === 'all' ? '001' : filter });
  const [errors, setErrors] = useState<EmployeeField[]>([]);
  const [notice, setNotice] = useState('');
  const grants = grantsForBrand(DEMO_GRANTS, filter);

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
                <td><span className="chip wait">демо, не учётная запись</span></td>
              </tr>
            ))}
            {grants.length === 0 ? <tr><td colSpan={4}>Для выбранного бренда нет демонстрационных назначений.</td></tr> : null}
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

function Players({ filter }: { filter: BrandFilter }) {
  const rows = playersForBrand(DEMO_PLAYERS, filter);
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
                <td>{player.state === 'demo-active' ? 'демо-активен' : 'демо-ограничен'}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4}>У этого бренда нет демонстрационных игроков.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Finance({ filter }: { filter: BrandFilter }) {
  const lines = financeLines(buildGroupReport(), filter);
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

function Access({ filter }: { filter: BrandFilter }) {
  const grants = grantsForBrand(DEMO_GRANTS, filter);
  return (
    <section className="panel">
      <h2>Доступ владельца группы</h2>
      <p className="note">Вход владельца группы будет проверяться по UUID в базе control-plane. Этот экран не выполняет вход и не содержит обхода прав.</p>
      <ul>
        {OWNER_PERMISSION_LIST.map((permission) => <li key={permission}>{permissionLabel(permission)}</li>)}
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
            {grants.length === 0 ? <tr><td colSpan={3}>Нет демонстрационных назначений.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Audit({ filter }: { filter: BrandFilter }) {
  const events = auditForBrand(DEMO_AUDIT, filter);
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
