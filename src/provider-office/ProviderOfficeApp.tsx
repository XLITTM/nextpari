import { useEffect, useState, type FormEvent } from 'react';

export type OfficeLanguage = 'en' | 'ru';
export type OfficePage = 'overview' | 'stakes' | 'winnings' | 'refunds' | 'sports' | 'monthly' | 'billing' | 'account';

export interface OfficeSession {
  legalEntity: string;
  access: 'read';
}

export interface OfficeReportView {
  readOnly: true;
  legalEntity: string;
  brandCode: string;
  period: { start: string; end: string };
  lastSuccessfulUpdate: string | null;
  counts: { settledBetCount: number; wonCount: number; lostCount: number; refundCount: number; cancelledCount: number };
  reporting: {
    currency: 'USD';
    status: 'final' | 'provisional' | 'rate_required';
    eligibleStakes: string | null;
    winnings: string | null;
    refundedStakes: string | null;
    cancelledStakes: string | null;
    ggr: string | null;
    margin: string | null;
    rate: { rate: string; source: string; effectiveDate: string; status: string } | null;
  };
  fee: { monthlyFee: string; revenueShareBps: number; topUpFee: string | null; totalMonthlyFee: string | null; status: string };
  sports: { status: string; rows: Array<{ sport: string; ggr: string }> };
  closedSnapshot: boolean;
}

const COPY = {
  en: {
    title: 'Provider Office',
    badge: 'Read only',
    login: 'Sign in',
    email: 'Email',
    password: 'Password',
    code: 'Authentication code',
    continue: 'Continue',
    unavailable: 'The reporting source is unavailable. No figures are shown.',
    overview: 'Overview',
    stakes: 'Settled stakes',
    winnings: 'Winnings',
    refunds: 'Refunds and voids',
    sports: 'Sports breakdown',
    monthly: 'Monthly reports',
    billing: 'Billing',
    account: 'Account and security',
    period: 'Reporting period',
    export: 'Export CSV',
    language: 'Language',
    stakesLabel: 'Eligible settled stakes',
    winningsLabel: 'Winnings paid or payable',
    refundsLabel: 'Refunded stakes',
    cancelledLabel: 'Cancelled bets',
    countLabel: 'Settled bets',
    wonLabel: 'Won bets',
    lostLabel: 'Lost bets',
    ggr: 'Sportsbook GGR',
    margin: 'GGR margin',
    currency: 'Reporting currency',
    updated: 'Last successful update',
    monthlyFee: 'Monthly fee',
    share: 'Revenue share',
    topUp: 'Top-up fee',
    total: 'Total monthly contractual fee',
    provisional: 'Provisional until the contractual rate is verified',
    rateMissing: 'Contractual TMT/USD rate is required',
    noSport: 'Settled bets have no sport tag, so no sport split is shown.',
    formula: 'Top-up fee = max(0, sports GGR × revenue share − monthly fee).',
    brand: 'Authorized brand',
    nextpari: 'NextPari',
  },
  ru: {
    title: 'Кабинет провайдера',
    badge: 'Только чтение',
    login: 'Вход',
    email: 'Почта',
    password: 'Пароль',
    code: 'Код подтверждения',
    continue: 'Продолжить',
    unavailable: 'Источник отчёта недоступен. Суммы не показываются.',
    overview: 'Обзор',
    stakes: 'Рассчитанные ставки',
    winnings: 'Выигрыши',
    refunds: 'Возвраты и отмены',
    sports: 'Разбивка по видам спорта',
    monthly: 'Месячные отчёты',
    billing: 'Биллинг',
    account: 'Аккаунт и безопасность',
    period: 'Отчётный период',
    export: 'Экспорт CSV',
    language: 'Язык',
    stakesLabel: 'Допустимые рассчитанные ставки',
    winningsLabel: 'Выплаченные или подлежащие выплате выигрыши',
    refundsLabel: 'Возвращённые ставки',
    cancelledLabel: 'Отменённые ставки',
    countLabel: 'Рассчитанные ставки, шт.',
    wonLabel: 'Выигрышные',
    lostLabel: 'Проигрышные',
    ggr: 'GGR спортсбука',
    margin: 'Маржа GGR',
    currency: 'Валюта отчёта',
    updated: 'Последнее успешное обновление',
    monthlyFee: 'Месячная плата',
    share: 'Доля выручки',
    topUp: 'Доплата',
    total: 'Итоговая месячная плата',
    provisional: 'Предварительно, пока договорный курс не подтверждён',
    rateMissing: 'Нужен договорный курс TMT/USD',
    noSport: 'У рассчитанных ставок нет вида спорта, поэтому разбивка не строится.',
    formula: 'Доплата = max(0, GGR спортсбука × доля − месячная плата).',
    brand: 'Разрешённый бренд',
    nextpari: 'NextPari',
  },
} as const satisfies Record<OfficeLanguage, Record<string, string>>;

const PAGES: OfficePage[] = ['overview', 'stakes', 'winnings', 'refunds', 'sports', 'monthly', 'billing', 'account'];

export function ProviderOfficeApp({
  initialSession = null,
  initialReport = undefined,
  initialLanguage = 'en',
}: {
  initialSession?: OfficeSession | null;
  initialReport?: OfficeReportView | { ok: false; error: string };
  initialLanguage?: OfficeLanguage;
}) {
  const [session, setSession] = useState<OfficeSession | null>(initialSession);
  const [language, setLanguage] = useState<OfficeLanguage>(initialLanguage);
  const [page, setPage] = useState<OfficePage>('overview');
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(initialReport);
  const copy = COPY[language];

  useEffect(() => {
    if (!session || initialReport) return undefined;
    let cancelled = false;
    fetch('/api/provider-office/report', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json() as { ok?: boolean; error?: string; report?: OfficeReportView };
        if (cancelled) return;
        if (!response.ok || !body.report) setReport({ ok: false, error: String(body.error ?? 'REPORTING_SOURCE_UNAVAILABLE') });
        else setReport(body.report);
      })
      .catch(() => {
        if (!cancelled) setReport({ ok: false, error: 'REPORTING_SOURCE_UNAVAILABLE' });
      });
    return () => {
      cancelled = true;
    };
  }, [session, initialReport]);

  if (!session) return <Login copy={copy} onLanguage={setLanguage} language={language} onSignedIn={setSession} />;

  const failed = !report || !('reporting' in report);
  const error = failed ? ('error' in (report ?? {}) ? String((report as { error?: string }).error ?? 'REPORTING_SOURCE_UNAVAILABLE') : 'REPORTING_SOURCE_UNAVAILABLE') : '';
  const view = failed ? null : report;

  return (
    <div className={open ? 'shell nav-open' : 'shell'}>
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">N</div>
          <div>
            <strong>NextPari</strong>
            <span>{copy.title}</span>
          </div>
        </div>
        <nav className="nav" aria-label={copy.title}>
          {PAGES.map((id) => (
            <button key={id} type="button" className={page === id ? 'active' : undefined} onClick={() => { setPage(id); setOpen(false); }}>
              {copy[id]}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button className="menu" type="button" onClick={() => setOpen((value) => !value)}>Menu</button>
            <h1>{copy[page]}</h1>
            <p className="muted">{session.legalEntity}</p>
          </div>
          <div className="toolbar">
            <span className="badge">{copy.badge}</span>
            <label>
              {copy.language}
              <select aria-label={copy.language} value={language} onChange={(event) => setLanguage(event.target.value as OfficeLanguage)}>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            {view ? (
              <label>
                {copy.period}
                <select aria-label={copy.period} defaultValue={view.period.start}>
                  <option value={view.period.start}>{view.period.start} – {view.period.end}</option>
                </select>
              </label>
            ) : null}
          </div>
        </header>
        <main className="content">
          {view ? <ReportPage page={page} copy={copy} report={view} /> : <div className="warning" role="alert">{copy.unavailable} {error}</div>}
        </main>
      </div>
    </div>
  );
}

function ReportPage({ page, copy, report }: { page: OfficePage; copy: (typeof COPY)[OfficeLanguage]; report: OfficeReportView }) {
  const money = report.reporting;
  const show = (value: string | null) => value ?? '—';
  if (page === 'account') {
    return (
      <section className="panel">
        <h2>{copy.account}</h2>
        <p>{report.legalEntity}</p>
        <p className="note">{copy.badge}. MFA required. Sessions can be revoked.</p>
      </section>
    );
  }
  return (
    <>
      {money.status === 'provisional' ? <p className="provisional">{copy.provisional}</p> : null}
      {money.status === 'rate_required' ? <p className="warning" role="status">{copy.rateMissing}</p> : null}
      <section className="cards" aria-label={copy.overview}>
        <article className="card"><span>{copy.ggr}</span><strong>{show(money.ggr)}</strong></article>
        <article className="card"><span>{copy.stakesLabel}</span><strong>{show(money.eligibleStakes)}</strong></article>
        <article className="card"><span>{copy.winningsLabel}</span><strong>{show(money.winnings)}</strong></article>
        <article className="card"><span>{copy.margin}</span><strong>{money.margin ?? '—'}</strong></article>
      </section>
      <section className="panel">
        <h2>{copy[page]}</h2>
        <p className="note">{copy.brand}: {report.brandCode === '001' ? copy.nextpari : report.brandCode}. {copy.currency}: {money.currency}. {copy.updated}: {report.lastSuccessfulUpdate ?? '—'}</p>
        {page === 'stakes' || page === 'overview' || page === 'monthly' ? <Metric label={copy.stakesLabel} value={show(money.eligibleStakes)} /> : null}
        {page === 'winnings' || page === 'overview' ? <Metric label={copy.winningsLabel} value={show(money.winnings)} /> : null}
        {page === 'refunds' || page === 'overview' ? (
          <>
            <Metric label={copy.refundsLabel} value={show(money.refundedStakes)} />
            <Metric label={copy.cancelledLabel} value={String(report.counts.cancelledCount)} />
          </>
        ) : null}
        {page === 'overview' || page === 'monthly' ? (
          <>
            <Metric label={copy.countLabel} value={String(report.counts.settledBetCount)} />
            <Metric label={copy.wonLabel} value={String(report.counts.wonCount)} />
            <Metric label={copy.lostLabel} value={String(report.counts.lostCount)} />
          </>
        ) : null}
        {page === 'sports' ? <Sports copy={copy} report={report} /> : null}
        {page === 'overview' || page === 'billing' || page === 'monthly' ? <Billing copy={copy} report={report} /> : null}
        {page === 'overview' || page === 'monthly' ? (
          <p className="actions">
            <a className="primary" href={`/api/provider-office/report?format=csv&period=${report.period.start}`}>{copy.export}</a>
          </p>
        ) : null}
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <p><span className="muted">{label}</span> <strong className="num">{value}</strong></p>;
}

function Sports({ copy, report }: { copy: (typeof COPY)[OfficeLanguage]; report: OfficeReportView }) {
  if (report.sports.status !== 'allocated' || report.sports.rows.length === 0) return <p className="note">{copy.noSport}</p>;
  const max = Math.max(...report.sports.rows.map((row) => Math.abs(Number(row.ggr))));
  return (
    <div className="bars">
      {report.sports.rows.map((row) => (
        <div className="bar-row" key={row.sport}>
          <span>{row.sport}</span>
          <div className="track"><span style={{ width: `${max > 0 ? Math.abs(Number(row.ggr)) / max * 100 : 0}%` }} /></div>
          <strong>{row.ggr}</strong>
        </div>
      ))}
    </div>
  );
}

function Billing({ copy, report }: { copy: (typeof COPY)[OfficeLanguage]; report: OfficeReportView }) {
  return (
    <div className="table-wrap">
      <p className="note">{copy.formula}</p>
      <table>
        <tbody>
          <tr><th>{copy.monthlyFee}</th><td className="num">{report.fee.monthlyFee}</td></tr>
          <tr><th>{copy.share}</th><td className="num">{(report.fee.revenueShareBps / 100).toFixed(0)}%</td></tr>
          <tr><th>{copy.topUp}</th><td className="num">{report.fee.topUpFee ?? '—'}</td></tr>
          <tr><th>{copy.total}</th><td className="num">{report.fee.totalMonthlyFee ?? '—'}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Login({
  copy,
  language,
  onLanguage,
  onSignedIn,
}: {
  copy: (typeof COPY)[OfficeLanguage];
  language: OfficeLanguage;
  onLanguage: (language: OfficeLanguage) => void;
  onSignedIn: (session: OfficeSession) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'password' | 'mfa'>('password');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const path = stage === 'password' ? '/api/provider-office/auth/login' : '/api/provider-office/auth/mfa';
    const body = stage === 'password' ? { email, password } : { code };
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; legalEntity?: string };
      if (!response.ok || !payload.ok) {
        setError(String(payload.error ?? 'AUTH_FAILED'));
        return;
      }
      if (stage === 'password') {
        setStage('mfa');
        return;
      }
      onSignedIn({ legalEntity: payload.legalEntity ?? '55 Tech Limited', access: 'read' });
    } catch {
      setError('AUTH_NOT_CONFIGURED');
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <div className="brand">
          <div className="mark">N</div>
          <div><strong>NextPari</strong><span>{copy.title}</span></div>
        </div>
        <span className="badge">{copy.badge}</span>
        <label>
          {copy.language}
          <select aria-label={copy.language} value={language} onChange={(event) => onLanguage(event.target.value as OfficeLanguage)}>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </label>
        {stage === 'password' ? (
          <>
            <label>{copy.email}<input aria-label={copy.email} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
            <label>{copy.password}<input aria-label={copy.password} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          </>
        ) : (
          <label>{copy.code}<input aria-label={copy.code} value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" /></label>
        )}
        {error ? <p className="warning" role="alert">{error}</p> : null}
        <button className="primary" type="submit">{stage === 'password' ? copy.login : copy.continue}</button>
      </form>
    </div>
  );
}
