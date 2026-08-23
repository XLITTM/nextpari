import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Ban, BarChart3, Building2, CheckCircle2, Download, Landmark,
  LayoutDashboard, LogOut, Plus, RefreshCw, Shield, Snowflake,
  TrendingUp, Unlock, User, Users, Wallet, X,
} from 'lucide-react';
import { PlayersTab } from '../components/backoffice/PlayersTab';
import {
  cashierOpLabel,
  cashierOpRef,
  clearManagerSession,
  collectBackofficeCashier,
  createBackofficeCashier,
  exportCashierLedgerCsv,
  fetchBackofficeCashiers,
  fetchCashierLedger,
  fetchDashboardKpis,
  fetchRiskBets,
  formatBackofficeDateTime,
  formatDayLabel,
  formatTmtmCompact,
  loadManagerSession,
  managerLogin,
  setCashierFrozen,
  settleRiskBet,
  topupBackofficeCashier,
  type BackofficeCashier,
  type CashierLedgerEntry,
  type DashboardKpis,
  type LedgerPeriod,
  type ManagerSession,
  type RiskBet,
  type VerticalKpi,
} from '../lib/backoffice';

type CabinetTab = 'finance' | 'agents' | 'players' | 'risk';

export function ManagerDashboardScreen() {
  const [session, setSession] = useState<ManagerSession | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    document.title = 'NextPari — Кабинет управления';
    setSession(loadManagerSession());
    setBooting(false);
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кабинета…</p>
      </div>
    );
  }

  if (!session) {
    return <BackofficeLogin onSuccess={setSession} />;
  }

  return (
    <BackofficeShell
      session={session}
      onLogout={() => {
        clearManagerSession();
        setSession(null);
      }}
    />
  );
}

function BackofficeLogin({ onSuccess }: { onSuccess: (session: ManagerSession) => void }) {
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      onSuccess(await managerLogin(login, pin));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">NextPari</p>
            <h1 className="text-xl font-extrabold text-ink-900">Кабинет управления</h1>
          </div>
        </div>
        {error && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Логин</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="owner"
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">PIN-код</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="••••"
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-lg font-bold tracking-[0.4em] text-center outline-none mb-4"
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="w-full bg-ink-900 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
        >
          {submitting ? 'Вход…' : 'Войти'}
        </button>
        <div className="mt-4 text-[11px] text-gray-500 space-y-1">
          <p>Superadmin: <span className="font-bold text-gray-700">owner</span> / PIN <span className="font-bold text-gray-700">0000</span></p>
          <p>Manager: <span className="font-bold text-gray-700">manager01</span> / PIN <span className="font-bold text-gray-700">1111</span></p>
        </div>
      </div>
    </div>
  );
}

function BackofficeShell({
  session,
  onLogout,
}: {
  session: ManagerSession;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<CabinetTab>('finance');
  const [notice, setNotice] = useState('');

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">Бэкофис</h1>
          <p className="text-xs text-ink-400 mt-2 leading-snug">{session.fullName}</p>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            {session.role === 'superadmin' ? 'Superadmin · Владелец' : `Manager · ${session.networkName}`}
          </span>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <NavBtn active={tab === 'finance'} onClick={() => setTab('finance')} icon={LayoutDashboard} label="Финансы" />
          <NavBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={Building2} label="Кассы и агенты" />
          <NavBtn active={tab === 'players'} onClick={() => setTab('players')} icon={Users} label="👥 Игроки" />
          <NavBtn active={tab === 'risk'} onClick={() => setTab('risk')} icon={AlertTriangle} label="Риски ставок" />
        </nav>
        <div className="mt-auto p-3">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-300 hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 overflow-x-auto">
        {notice && (
          <div className="mb-4 bg-brand-50 border border-brand-200 text-brand-800 text-sm font-semibold rounded-xl px-4 py-2.5">
            {notice}
          </div>
        )}
        {tab === 'finance' && <FinancePanel session={session} />}
        {tab === 'agents' && <AgentsPanel session={session} onNotice={setNotice} />}
        {tab === 'players' && <PlayersTab session={session} onNotice={setNotice} />}
        {tab === 'risk' && <RiskPanel session={session} onNotice={setNotice} />}
      </main>
    </div>
  );
}

function NavBtn({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutDashboard;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold ${
        active ? 'bg-brand-600 text-white' : 'text-ink-300 hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function FinancePanel({ session }: { session: ManagerSession }) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setKpis(await fetchDashboardKpis(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить показатели');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = kpis
    ? [
        {
          label: session.role === 'superadmin' ? 'Оборот ставок (Turnover)' : 'Оборот кассовой сети',
          value: kpis.turnover,
          icon: TrendingUp,
        },
        {
          label: 'Валовая прибыль (GGR)',
          value: kpis.ggr,
          icon: BarChart3,
          hidden: session.role !== 'superadmin',
        },
        { label: 'Депозиты через Мобкеш', value: kpis.deposits, icon: Landmark },
        { label: 'Выплаты наличными', value: kpis.payouts, icon: Wallet },
        { label: 'Остаток во всех кассах', value: kpis.floatTotal, icon: Building2 },
      ].filter((card) => !card.hidden)
    : [];

  return (
    <section>
      <HeaderRow
        title="Финансовый дашборд"
        subtitle={session.role === 'superadmin' ? 'Вся платформа' : session.networkName}
        onRefresh={() => void load()}
        loading={loading}
      />
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((card) => (
          <article key={card.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 leading-snug pr-2">{card.label}</p>
              <card.icon className="w-4 h-4 text-brand-600 shrink-0" />
            </div>
            <p className="text-2xl font-black tabular-nums text-ink-900">{formatTmtmCompact(card.value)}</p>
          </article>
        ))}
      </div>
      {kpis && session.role === 'superadmin' && (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-4 gap-3">
          <VerticalCard
            emoji="⚽"
            title="Спортбук"
            subtitle="Ставки на спорт"
            kpi={kpis.verticals.sports}
            accent="border-brand-200"
          />
          <VerticalCard
            emoji="🎰"
            title="Казино"
            subtitle="Слоты и Live"
            kpi={kpis.verticals.casino}
            accent="border-violet-200"
          />
          <VerticalCard
            emoji="🚀"
            title="Мини-игры"
            subtitle="Crash / Aviator, Mines, Apple of Fortune"
            kpi={kpis.verticals.games}
            accent="border-orange-200"
          />
          <article className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-ink-900">Доля GGR</h3>
            <p className="text-xs text-gray-500 mb-3">Распределение чистой прибыли</p>
            <ProfitPie verticals={kpis.verticals} />
          </article>
        </div>
      )}
      <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-ink-900 mb-1">Динамика по дням</h3>
        <p className="text-xs text-gray-500 mb-4">
          {session.role === 'superadmin' ? 'Депозиты Мобкеш и оборот ставок' : 'Депозиты Мобкеш по вашей сети'}
        </p>
        {kpis && <TrendChart series={kpis.series} showBets={session.role === 'superadmin'} />}
      </div>
    </section>
  );
}

function VerticalCard({
  emoji, title, subtitle, kpi, accent,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  kpi: VerticalKpi;
  accent: string;
}) {
  return (
    <article className={`bg-white rounded-2xl p-4 border ${accent} shadow-sm`}>
      <p className="text-lg font-extrabold text-ink-900 leading-tight">{emoji} {title}</p>
      <p className="text-[11px] text-gray-500 mb-3">{subtitle}</p>
      <dl className="space-y-1.5">
        <KpiLine label="Оборот" value={formatTmtmCompact(kpi.turnover)} />
        <KpiLine label="Выплаты игрокам" value={formatTmtmCompact(kpi.payouts)} />
        <KpiLine label="Чистая прибыль GGR" value={formatTmtmCompact(kpi.ggr)} strong />
        <KpiLine label="Маржа" value={`${kpi.margin.toFixed(1)}%`} />
      </dl>
    </article>
  );
}

function KpiLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className={`text-sm tabular-nums ${strong ? 'font-black text-ink-900' : 'font-semibold text-gray-800'}`}>
        {value}
      </dd>
    </div>
  );
}

function ProfitPie({ verticals }: { verticals: DashboardKpis['verticals'] }) {
  const slices = [
    { label: 'Спортбук', color: '#16a34a', value: Math.max(0, verticals.sports.ggr) },
    { label: 'Казино', color: '#7c3aed', value: Math.max(0, verticals.casino.ggr) },
    { label: 'Мини-игры', color: '#ea580c', value: Math.max(0, verticals.games.ggr) },
  ];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="w-28 h-28 shrink-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="16" />
        {slices.map((slice) => {
          const len = (slice.value / total) * c;
          const dash = `${len} ${c - len}`;
          const node = (
            <circle
              key={slice.label}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return node;
        })}
      </svg>
      <ul className="space-y-1.5 text-xs font-semibold text-gray-600">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: slice.color }} />
            {slice.label}
            <span className="tabular-nums text-ink-900">
              {total === 1 && slices.every((item) => item.value === 0)
                ? '0%'
                : `${Math.round((slice.value / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendChart({
  series,
  showBets,
}: {
  series: DashboardKpis['series'];
  showBets: boolean;
}) {
  const width = 760;
  const height = 220;
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const max = Math.max(1, ...series.flatMap((row) => (showBets ? [row.bets, row.deposits] : [row.deposits])));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const line = (key: 'bets' | 'deposits') =>
    series.map((row, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(row[key]).toFixed(1)}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px] h-56">
        {[0, 0.5, 1].map((part) => (
          <line
            key={part}
            x1={pad.l}
            x2={width - pad.r}
            y1={y(max * part)}
            y2={y(max * part)}
            stroke="#e2e8f0"
          />
        ))}
        {showBets && <path d={line('bets')} fill="none" stroke="#0f172a" strokeWidth="2.5" />}
        <path d={line('deposits')} fill="none" stroke="#16a34a" strokeWidth="2.5" />
        {series.map((row, i) => (
          <text key={row.day} x={x(i)} y={height - 8} textAnchor="middle" className="fill-slate-400" fontSize="10">
            {formatDayLabel(row.day)}
          </text>
        ))}
      </svg>
      <div className="flex gap-4 text-xs font-semibold text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-brand-600" /> Депозиты
        </span>
        {showBets && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-ink-900" /> Ставки
          </span>
        )}
      </div>
    </div>
  );
}

function AgentsPanel({
  session,
  onNotice,
}: {
  session: ManagerSession;
  onNotice: (value: string) => void;
}) {
  const [rows, setRows] = useState<BackofficeCashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchBackofficeCashiers(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить кассы');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const topupTarget = rows.find((row) => row.id === topupId) ?? null;
  const profile = rows.find((row) => row.id === profileId) ?? null;

  return (
    <section>
      <HeaderRow title="Кассы и агенты" subtitle={`${rows.length} точек`} onRefresh={() => void load()} loading={loading} />
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-ink-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Добавить новую точку / кассира
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Город</th>
              <th className="px-4 py-3">Адрес</th>
              <th className="px-4 py-3 text-right">Остаток кассы</th>
              <th className="px-4 py-3 text-right">Доход кассира</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                onClick={() => setProfileId(row.id)}
              >
                <td className="px-4 py-3 text-gray-700">{row.city}</td>
                <td className="px-4 py-3 text-gray-700">{row.pointName}</td>
                <td className="px-4 py-3 text-right font-extrabold tabular-nums">{formatTmtmCompact(row.floatBalance)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-brand-700">
                  {formatTmtmCompact(row.commissionEarned)}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                    row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {row.isActive ? 'Активна' : 'Заблокирована'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTopupId(row.id);
                      }}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700"
                    >
                      Пополнить
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await setCashierFrozen(session, row.id, row.isActive);
                          onNotice(row.isActive ? `Точка ${row.fullName} заблокирована` : `Точка ${row.fullName} разморожена`);
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                        }
                      }}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${
                        row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      {row.isActive ? 'Блок' : 'Разморозка'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">Касс в этой сети пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {createOpen && (
        <CreateCashierModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (form) => {
            await createBackofficeCashier(session, form);
            onNotice(`Точка ${form.fullName} создана`);
            setCreateOpen(false);
            await load();
          }}
        />
      )}
      {topupTarget && (
        <TopupModal
          cashier={topupTarget}
          onClose={() => setTopupId(null)}
          onSubmit={async (amount) => {
            await topupBackofficeCashier(session, topupTarget.id, amount);
            onNotice(`Касса ${topupTarget.fullName} пополнена на ${formatTmtmCompact(amount)}`);
            setTopupId(null);
            await load();
          }}
        />
      )}
      {profile && (
        <CashierProfileDrawer
          session={session}
          cashier={profile}
          onClose={() => setProfileId(null)}
          onNotice={onNotice}
          onChanged={async () => {
            await load();
          }}
          onTopup={() => {
            setTopupId(profile.id);
          }}
        />
      )}
    </section>
  );
}

function CashierProfileDrawer({
  session,
  cashier,
  onClose,
  onNotice,
  onChanged,
  onTopup,
}: {
  session: ManagerSession;
  cashier: BackofficeCashier;
  onClose: () => void;
  onNotice: (value: string) => void;
  onChanged: () => Promise<void>;
  onTopup: () => void;
}) {
  const [period, setPeriod] = useState<LedgerPeriod>('today');
  const [rows, setRows] = useState<CashierLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collectAmount, setCollectAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchCashierLedger(session, cashier.id, period));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить ленту');
    } finally {
      setLoading(false);
    }
  }, [session, cashier.id, period]);

  useEffect(() => {
    void load();
  }, [load, cashier.floatBalance]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="flex-1 bg-black/40" onClick={onClose} aria-label="Закрыть" />
      <aside className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Профиль кассира</p>
            <h3 className="text-lg font-extrabold text-ink-900">{cashier.fullName}</h3>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoCell label="ФИО" value={cashier.fullName} />
            <InfoCell label="Логин" value={cashier.login} />
            <InfoCell label="Город / точка" value={`${cashier.city} · ${cashier.pointName}`} />
            <InfoCell label="Баланс кассы (Float)" value={formatTmtmCompact(cashier.floatBalance)} />
            <InfoCell label="Комиссия" value={`${cashier.commissionRate.toFixed(2)}%`} />
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Статус</p>
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                cashier.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                {cashier.isActive ? 'Активен' : 'Заблокирован'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTopup}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-brand-50 text-brand-700"
            >
              Пополнить кассу
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await setCashierFrozen(session, cashier.id, cashier.isActive);
                  onNotice(cashier.isActive ? 'Точка заблокирована' : 'Точка разморожена');
                  await onChanged();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                }
              }}
              className={`text-xs font-bold px-3 py-2 rounded-xl inline-flex items-center gap-1 ${
                cashier.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {cashier.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {cashier.isActive ? 'Заморозить' : 'Разморозить'}
            </button>
          </div>

          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[11px] font-semibold text-gray-500 mb-1 block">Сдача инкассации</span>
              <input
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                placeholder="Сумма"
                className="w-full bg-gray-100 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
              />
            </label>
            <button
              type="button"
              onClick={async () => {
                const value = Number(collectAmount);
                if (!(value > 0)) return;
                try {
                  await collectBackofficeCashier(session, cashier.id, value);
                  setCollectAmount('');
                  onNotice('Инкассация проведена');
                  await onChanged();
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка инкассации');
                }
              }}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-ink-900 text-white"
            >
              Сдать
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h4 className="text-sm font-bold text-ink-900">Лента действий</h4>
              <button
                type="button"
                onClick={() => exportCashierLedgerCsv(cashier, rows)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-slate-100"
              >
                <Download className="w-3.5 h-3.5" />
                Выгрузить отчет смены
              </button>
            </div>
            <div className="flex gap-1 mb-3">
              {([
                { id: 'today', label: 'Сегодня' },
                { id: '7d', label: '7 дней' },
                { id: 'month', label: 'Месяц' },
              ] as Array<{ id: LedgerPeriod; label: string }>).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPeriod(item.id)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                    period === item.id ? 'bg-ink-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {error && <p className="text-xs font-semibold text-red-600 mb-2">{error}</p>}
            {loading ? (
              <p className="text-sm text-gray-500 py-6 text-center">Загрузка…</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-left text-gray-400 uppercase tracking-wide">
                  <tr>
                    <th className="pb-2">Время</th>
                    <th className="pb-2">Действие</th>
                    <th className="pb-2">ID / чек</th>
                    <th className="pb-2 text-right">Сумма</th>
                    <th className="pb-2 text-right">После</th>
                    <th className="pb-2">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="py-2 text-gray-500 whitespace-nowrap">{formatBackofficeDateTime(row.createdAt)}</td>
                      <td className="py-2 font-semibold text-ink-900">{cashierOpLabel(row.type)}</td>
                      <td className="py-2 text-gray-600">{cashierOpRef(row)}</td>
                      <td className={`py-2 text-right font-bold tabular-nums ${
                        row.signedAmount >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {row.signedAmount > 0 ? '+' : ''}{row.signedAmount.toLocaleString('ru-RU')}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {row.floatAfter == null ? '—' : row.floatAfter.toLocaleString('ru-RU')}
                      </td>
                      <td className="py-2">
                        <span className={row.status === 'completed' ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                          {row.status === 'completed' ? 'Успешно' : 'Отменено'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">Операций за период нет</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-0.5">{label}</p>
      <p className="font-semibold text-ink-900 leading-snug">{value}</p>
    </div>
  );
}

function CreateCashierModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: {
    login: string;
    pin: string;
    fullName: string;
    city: string;
    pointName: string;
    floatBalance: number;
  }) => Promise<void>;
}) {
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [pointName, setPointName] = useState('');
  const [floatBalance, setFloatBalance] = useState('1000');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Новая точка / кассир" onClose={onClose}>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Имя кассира" value={fullName} onChange={setFullName} placeholder="Азат Мередов" />
      <Field label="Логин" value={login} onChange={setLogin} placeholder="agent03" />
      <Field label="PIN-код" value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} placeholder="1234" />
      <Field label="Город" value={city} onChange={setCity} placeholder="Ашхабад" />
      <Field label="Адрес точки" value={pointName} onChange={setPointName} placeholder="Точка №14 · ул. ..." />
      <Field label="Стартовый лимит кассы" value={floatBalance} onChange={setFloatBalance} placeholder="1000" />
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setError('');
          setSaving(true);
          try {
            await onSubmit({
              login,
              pin,
              fullName,
              city,
              pointName,
              floatBalance: Number(floatBalance),
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать точку');
          } finally {
            setSaving(false);
          }
        }}
        className="w-full bg-ink-900 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-50"
      >
        {saving ? 'Сохранение…' : 'Создать кассира'}
      </button>
    </Modal>
  );
}

function TopupModal({
  cashier,
  onClose,
  onSubmit,
}: {
  cashier: BackofficeCashier;
  onClose: () => void;
  onSubmit: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={`Пополнить кассу · ${cashier.fullName}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">Текущий остаток: {formatTmtmCompact(cashier.floatBalance)}</p>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Сумма перевода в кассу" value={amount} onChange={setAmount} placeholder="500" />
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          const value = Number(amount);
          if (!(value > 0)) {
            setError('Введите сумму');
            return;
          }
          setSaving(true);
          try {
            await onSubmit(value);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось пополнить');
          } finally {
            setSaving(false);
          }
        }}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-50"
      >
        {saving ? 'Перевод…' : 'Перевести в кассу агента'}
      </button>
    </Modal>
  );
}

function RiskPanel({
  session,
  onNotice,
}: {
  session: ManagerSession;
  onNotice: (value: string) => void;
}) {
  const [rows, setRows] = useState<RiskBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchRiskBets(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить ставки');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (bet: RiskBet, action: 'won' | 'void') => {
    const ok = window.confirm(
      action === 'won'
        ? `Рассчитать ставку ${bet.ticketCode || bet.id.slice(0, 8)} как выигрыш и выплатить ${formatTmtmCompact(bet.potentialWin)}?`
        : `Аннулировать ставку и вернуть игроку ${formatTmtmCompact(bet.amount)}?`,
    );
    if (!ok) return;
    try {
      await settleRiskBet(session, bet.id, action);
      onNotice(action === 'won' ? 'Ставка рассчитана вручную' : 'Ставка аннулирована, сумма возвращена');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать ставку');
    }
  };

  return (
    <section>
      <HeaderRow
        title="Мониторинг ставок и рисков"
        subtitle="Крупные и подозрительные открытые купоны · обновление каждые 15 сек"
        onRefresh={() => void load()}
        loading={loading}
      />
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Купон</th>
              <th className="px-4 py-3">Событие</th>
              <th className="px-4 py-3">Исход</th>
              <th className="px-4 py-3 text-right">Ставка</th>
              <th className="px-4 py-3 text-right">Выплата</th>
              <th className="px-4 py-3">Риск</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-bold text-ink-900">№ {row.ticketCode || row.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-400">{row.type === 'express' ? 'Экспресс' : 'Одинар'}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {[row.homeTeam, row.awayTeam].filter(Boolean).join(' — ') || row.matchId || '—'}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.selection || '—'}</p>
                  <p className="text-xs text-gray-400">кф {row.odds.toFixed(2)}</p>
                </td>
                <td className="px-4 py-3 text-right font-extrabold tabular-nums">{formatTmtmCompact(row.amount)}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatTmtmCompact(row.potentialWin)}</td>
                <td className="px-4 py-3">
                  {row.suspicious ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                      <AlertTriangle className="w-3 h-3" />
                      Подозрительная
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-gray-400">Открыта</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void act(row, 'won')}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Рассчитать
                    </button>
                    <button
                      type="button"
                      onClick={() => void act(row, 'void')}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 inline-flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Аннулировать
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">Открытых рисковых ставок нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeaderRow({
  title, subtitle, onRefresh, loading,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h2 className="text-2xl font-extrabold text-ink-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        Обновить
      </button>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-extrabold text-ink-900">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-gray-500 mb-1.5 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
      />
    </label>
  );
}
