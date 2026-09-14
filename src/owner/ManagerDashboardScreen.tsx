import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, BarChart3, Building2, CheckCircle2, Download, Landmark,
  LayoutDashboard, LogOut, Mail, RefreshCw, Scale, Shield, Snowflake,
  TrendingUp, User, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { useOwnerAuth } from './auth/OwnerAuthProvider';
import { isOperationalAccountActive } from '../shared/staff/financeGate';
import { MessagesPanel } from './MessagesPanel';
import { OwnerManagersPanel } from './OwnerManagersPanel';
import { PlayersPanel } from './PlayersPanel';
import { OwnerMoneyDialog, OwnerTreasuryPanel, ownerTreasuryIsActive, type OwnerMoneyDialogState } from './OwnerMoneyControls';
import { GameRtpReportPanel } from './GameRtpReport';
import { ProviderSettlementsPanel } from './ProviderSettlementsPanel';
import { WithdrawalsPanel } from './WithdrawalsPanel';
import {
  fetchOwnerCashierLedger,
  fetchOwnerCashierOperationalMap,
  fetchOwnerCashiers,
  fetchOwnerDashboard,
  fetchOwnerRiskBets,
  fetchOwnerSecurityFlags,
  fetchOwnerSecurityOverview,
  fetchOwnerPlayerSecurity,
  fetchOwnerPlayerSecurityRestriction,
  fetchOwnerPlayerSportsBets,
  fetchOwnerPlayerSportsSummary,
  fetchOwnerTreasury,
  resolveOwnerSecurityFlag,
  setOwnerPlayerSecurityRestriction,
  ledgerPeriodFrom,
  cashierOpLabel,
  cashierOpRef,
  exportCashierLedgerCsv,
  formatBackofficeDateTime,
  formatDayLabel,
  formatTmtmCompact,
  setOwnerCashierFrozen,
  type BackofficeCashier,
  type CashierLedgerEntry,
  type DashboardKpis,
  type LedgerPeriod,
  type OwnerManagerCashierRow,
  type OwnerStaffContext,
  type RiskBet,
  type OwnerSecurityFlag,
  type OwnerSecurityOverview,
  type OwnerPlayerSecurityDossier,
  type OwnerSecuritySportsBet,
  type OwnerSecuritySportsPage,
  type OwnerSecuritySportsSummary,
  type VerticalKpi,
} from './services';
import {
  OWNER_SECURITY_ACCOUNT_LABEL,
  OWNER_SECURITY_DOSSIER_LABEL,
  OWNER_SECURITY_RESTRICTION_POLICY,
  OWNER_SECURITY_REVIEW_LABEL,
  ownerSecurityAccountStatusLabel,
  ownerSecurityRestrictionToggle,
  requireOwnerSecurityAccountReason,
} from './securityAccountActions';

type CabinetTab = 'finance' | 'providerSettlements' | 'managers' | 'agents' | 'players' | 'messages' | 'risk';

export function ManagerDashboardScreen() {
  const { loading, staff, deniedMessage, signOut } = useOwnerAuth();

  useEffect(() => {
    document.title = 'NextPari — Бэкофис владельца';
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кабинета…</p>
      </div>
    );
  }

  if (!staff) {
    return <BackofficeLogin deniedMessage={deniedMessage} />;
  }

  return (
    <BackofficeShell
      staff={staff}
      onLogout={() => { void signOut(); }}
    />
  );
}

function BackofficeLogin({ deniedMessage }: { deniedMessage: string }) {
  const { signIn } = useOwnerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = error || deniedMessage;

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">NextPari · Owner</p>
            <h1 className="text-xl font-extrabold text-ink-900">Бэкофис владельца</h1>
            <p className="text-xs text-gray-500 mt-0.5">Вход по email и паролю Supabase Auth</p>
          </div>
        </div>
        {shownError && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {shownError}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Email</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@nextpari.net"
            className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
          />
        </div>
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Пароль</label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-gray-100 rounded-xl px-4 py-3 text-sm font-semibold outline-none mb-4"
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
      </div>
    </div>
  );
}

function BackofficeShell({
  staff,
  onLogout,
}: {
  staff: OwnerStaffContext;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<CabinetTab>('finance');

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">Бэкофис</h1>
          <p className="text-xs text-ink-400 mt-2 leading-snug">{staff.displayName || 'Owner'}</p>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            {staff.role} · Владелец
          </span>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <NavBtn active={tab === 'finance'} onClick={() => setTab('finance')} icon={LayoutDashboard} label="Финансы сети" />
          <NavBtn active={tab === 'providerSettlements'} onClick={() => setTab('providerSettlements')} icon={Scale} label="Расчёты с провайдерами" />
          <NavBtn active={tab === 'managers'} onClick={() => setTab('managers')} icon={UserCog} label="Менеджеры" />
          <NavBtn active={tab === 'agents'} onClick={() => setTab('agents')} icon={Building2} label="Все кассы" />
          <NavBtn active={tab === 'players'} onClick={() => setTab('players')} icon={Users} label="Игроки" />
          <NavBtn active={tab === 'messages'} onClick={() => setTab('messages')} icon={Mail} label="Сообщения" />
          <NavBtn active={tab === 'risk'} onClick={() => setTab('risk')} icon={AlertTriangle} label="Риски" />
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
        {tab === 'finance' && <FinancePanel />}
        {tab === 'providerSettlements' && <ProviderSettlementsPanel />}
        {tab === 'managers' && <OwnerManagersPanel />}
        {tab === 'agents' && <AgentsPanel />}
        {tab === 'players' && <PlayersPanel />}
        {tab === 'messages' && <MessagesPanel />}
        {tab === 'risk' && <RiskPanel />}
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

function FinancePanel() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setKpis(await fetchOwnerDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить показатели');
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = kpis
    ? [
        { label: 'Оборот ставок (Turnover)', value: kpis.turnover, icon: TrendingUp },
        { label: 'Валовая прибыль (GGR)', value: kpis.ggr, icon: BarChart3 },
        { label: 'Депозиты через Мобкеш', value: kpis.deposits, icon: Landmark },
        { label: 'Выплаты наличными', value: kpis.payouts, icon: Wallet },
        { label: 'Остаток во всех кассах', value: kpis.floatTotal, icon: Building2 },
      ]
    : [];

  return (
    <section>
      <OwnerTreasuryPanel onAfterMoney={load} />
      <HeaderRow
        title="Финансовый дашборд"
        subtitle="Вся платформа"
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
      {kpis && (
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
      <GameRtpReportPanel />
      <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-ink-900 mb-1">Динамика по дням</h3>
        <p className="text-xs text-gray-500 mb-4">Депозиты Мобкеш и оборот ставок</p>
        {kpis && <TrendChart series={kpis.series} showBets />}
      </div>
      <div className="mt-5">
        <WithdrawalsPanel />
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

function AgentsPanel() {
  const [rows, setRows] = useState<BackofficeCashier[]>([]);
  const [opsMap, setOpsMap] = useState<Record<string, OwnerManagerCashierRow>>({});
  const [treasuryActive, setTreasuryActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [fund, setFund] = useState<OwnerMoneyDialogState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cashiers, ops, treasury] = await Promise.all([
        fetchOwnerCashiers(),
        fetchOwnerCashierOperationalMap().catch(() => ({}) as Record<string, OwnerManagerCashierRow>),
        fetchOwnerTreasury().catch(() => null),
      ]);
      setRows(cashiers);
      setOpsMap(ops);
      setTreasuryActive(ownerTreasuryIsActive(treasury));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить кассы');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const managerOptions = useMemo(() => {
    const ids = [...new Set(rows.map((row) => row.managerId).filter((id): id is string => Boolean(id)))];
    return ids;
  }, [rows]);

  const visibleRows = useMemo(
    () => (managerFilter ? rows.filter((row) => row.managerId === managerFilter) : rows),
    [rows, managerFilter],
  );
  const profile = rows.find((row) => row.id === profileId) ?? null;

  return (
    <section>
      <HeaderRow
        title="Кассы и агенты"
        subtitle={managerFilter ? `${visibleRows.length} из ${rows.length} точек` : `${rows.length} точек`}
        onRefresh={() => void load()}
        loading={loading}
      />
      <p className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4">
        Прямое пополнение кассы идёт из казны владельца, минуя баланс менеджера. Инкассация по-прежнему недоступна здесь.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilter(e.target.value)}
          className="bg-white border border-slate-200 text-sm font-semibold px-3 py-2.5 rounded-xl outline-none min-w-[240px]"
          aria-label="Фильтр по менеджеру"
        >
          <option value="">Все менеджеры (Все кассы)</option>
          {managerOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled
          title="Функция переводится на защищённое ядро"
          className="inline-flex items-center gap-2 bg-ink-900/40 text-white text-sm font-bold px-4 py-2.5 rounded-xl cursor-not-allowed"
        >
          Добавить новую точку / кассира
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 whitespace-nowrap">Имя / название точки</th>
              <th className="px-4 py-3 whitespace-nowrap">Город и адрес</th>
              <th className="px-4 py-3 whitespace-nowrap">Менеджер</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Операционный остаток</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Доход кассира</th>
              <th className="px-4 py-3 whitespace-nowrap">Статус</th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Действия</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                onClick={() => setProfileId(row.id)}
              >
                <td className="px-4 py-3 align-top">
                  <p className="font-bold text-ink-900">{row.fullName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{row.pointName}</p>
                </td>
                <td className="px-4 py-3 align-top text-gray-700">
                  <p>{row.city || '—'}</p>
                  {row.pointName ? <p className="text-xs text-gray-500 mt-0.5">{row.pointName}</p> : null}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded-lg text-xs">
                    <User className="w-3.5 h-3.5 shrink-0" />
                    {row.managerId || 'Владелец (Прямой)'}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-right font-extrabold tabular-nums whitespace-nowrap">
                  {opsMap[row.id]?.operationalBalance == null
                    ? 'недоступен'
                    : formatTmtmCompact(opsMap[row.id].operationalBalance)}
                </td>
                <td className="px-4 py-3 align-top text-right font-semibold tabular-nums text-brand-700 whitespace-nowrap">
                  {formatTmtmCompact(row.commissionEarned)}
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                    row.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {row.isActive ? 'Активна' : 'Заблокирована'}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={
                        !treasuryActive
                        || !isOperationalAccountActive({
                          status: opsMap[row.id]?.operationalStatus,
                          migrationState: opsMap[row.id]?.operationalMigrationState,
                        })
                      }
                      title={
                        treasuryActive
                          && isOperationalAccountActive({
                            status: opsMap[row.id]?.operationalStatus,
                            migrationState: opsMap[row.id]?.operationalMigrationState,
                          })
                          ? 'Пополнить напрямую из казны'
                          : 'Казна или касса не активны'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        setFund({
                          type: 'cashier',
                          cashier: {
                            cashierId: row.id,
                            fullName: row.fullName,
                            login: row.login,
                            operationalBalance: opsMap[row.id]?.operationalBalance ?? null,
                            operationalStatus: opsMap[row.id]?.operationalStatus ?? '',
                            operationalMigrationState: opsMap[row.id]?.operationalMigrationState ?? '',
                          },
                        });
                      }}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-ink-900 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      Пополнить напрямую
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const frozen = row.isActive;
                        const ok = window.confirm(
                          frozen ? `Заморозить кассу ${row.fullName}?` : `Разморозить кассу ${row.fullName}?`,
                        );
                        if (!ok) return;
                        const reason = window.prompt('Причина (необязательно)') ?? '';
                        try {
                          await setOwnerCashierFrozen({
                            cashierId: row.id,
                            frozen,
                            reason,
                          });
                          await load();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                        }
                      }}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${
                        row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Snowflake className="w-3.5 h-3.5" />
                      {row.isActive ? 'Блок' : 'Разморозка'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  {managerFilter ? 'У этого менеджера пока нет касс' : 'Касс в этой сети пока нет'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {profile && (
        <CashierProfileDrawer
          cashier={profile}
          ops={opsMap[profile.id] ?? null}
          treasuryActive={treasuryActive}
          onClose={() => setProfileId(null)}
          onChanged={async () => {
            await load();
          }}
          onFund={() => setFund({
            type: 'cashier',
            cashier: {
              cashierId: profile.id,
              fullName: profile.fullName,
              login: profile.login,
              operationalBalance: opsMap[profile.id]?.operationalBalance ?? null,
              operationalStatus: opsMap[profile.id]?.operationalStatus ?? '',
              operationalMigrationState: opsMap[profile.id]?.operationalMigrationState ?? '',
            },
          })}
        />
      )}
      {fund && (
        <OwnerMoneyDialog
          state={fund}
          treasuryActive={treasuryActive}
          onClose={() => setFund(null)}
          onSuccess={async () => {
            await load();
          }}
        />
      )}
    </section>
  );
}

function CashierProfileDrawer({
  cashier,
  ops,
  treasuryActive,
  onClose,
  onChanged,
  onFund,
}: {
  cashier: BackofficeCashier;
  ops: OwnerManagerCashierRow | null;
  treasuryActive: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onFund: () => void;
}) {
  const [period, setPeriod] = useState<LedgerPeriod>('today');
  const [rows, setRows] = useState<CashierLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchOwnerCashierLedger({
        cashierId: cashier.id,
        from: ledgerPeriodFrom(period),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить ленту');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cashier.id, period]);

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
            <InfoCell
              label="Операционный остаток"
              value={ops?.operationalBalance == null ? 'недоступен' : formatTmtmCompact(ops.operationalBalance)}
            />
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

          <p className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            Прямое пополнение идёт из казны владельца. Инкассация здесь недоступна.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                !treasuryActive
                || !isOperationalAccountActive({
                  status: ops?.operationalStatus,
                  migrationState: ops?.operationalMigrationState,
                })
              }
              title={
                treasuryActive && isOperationalAccountActive({
                  status: ops?.operationalStatus,
                  migrationState: ops?.operationalMigrationState,
                })
                  ? 'Пополнить напрямую из казны'
                  : 'Казна или касса не активны'
              }
              onClick={onFund}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              Пополнить напрямую
            </button>
            <button
              type="button"
              onClick={async () => {
                const frozen = cashier.isActive;
                const ok = window.confirm(
                  frozen ? 'Заморозить эту кассу?' : 'Разморозить эту кассу?',
                );
                if (!ok) return;
                const reason = window.prompt('Причина (необязательно)') ?? '';
                try {
                  await setOwnerCashierFrozen({
                    cashierId: cashier.id,
                    frozen,
                    reason,
                  });
                  await onChanged();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                }
              }}
              className={`text-xs font-bold px-3 py-2 rounded-xl inline-flex items-center gap-1 ${
                cashier.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5" />
              {cashier.isActive ? 'Заморозить' : 'Разморозить'}
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

function RiskPanel() {
  return (
    <div className="space-y-8">
      <SecurityPanel />
      <RiskBetsPanel />
    </div>
  );
}

function securityFlagLabel(type: string): string {
  if (type === 'SHARED_DEVICE') return 'Общее устройство';
  if (type === 'SHARED_NETWORK') return 'Общая сеть';
  if (type === 'LOGIN_FAILURE_BURST') return 'Всплеск неудачных входов';
  if (type === 'AUTH_RATE_LIMITED') return 'Лимит попыток входа';
  return type;
}

function securitySeverityLabel(value: string): string {
  if (value === 'high') return 'Высокий';
  if (value === 'medium') return 'Средний';
  if (value === 'low') return 'Низкий';
  return value;
}

function securityStatusLabel(value: string): string {
  if (value === 'open') return 'Открыт';
  if (value === 'reviewed') return 'Просмотрен';
  if (value === 'resolved') return 'Закрыт';
  if (value === 'dismissed') return 'Отклонён';
  return value;
}

function SecurityPanel() {
  const [overview, setOverview] = useState<OwnerSecurityOverview | null>(null);
  const [rows, setRows] = useState<OwnerSecurityFlag[]>([]);
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [flagType, setFlagType] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reasonFor, setReasonFor] = useState<{ flag: OwnerSecurityFlag; action: 'resolve' | 'dismiss' } | null>(null);
  const [reason, setReason] = useState('');
  const [dossierId, setDossierId] = useState('');
  const [accountFor, setAccountFor] = useState<OwnerSecurityFlag | null>(null);
  const [accountRestricted, setAccountRestricted] = useState<boolean | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountConfirm, setAccountConfirm] = useState(false);
  const [accountReason, setAccountReason] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOverview, nextRows] = await Promise.all([
        fetchOwnerSecurityOverview(),
        fetchOwnerSecurityFlags({
          status: status || null,
          severity: severity || null,
          flagType: flagType || null,
          playerId: playerId.trim() || null,
        }),
      ]);
      setOverview(nextOverview);
      setRows(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сигналы безопасности');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, severity, flagType, playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runReview = async (flag: OwnerSecurityFlag) => {
    setBusyId(flag.id);
    setError('');
    try {
      await resolveOwnerSecurityFlag({ flagId: flag.id, action: 'review' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить флаг');
    } finally {
      setBusyId('');
    }
  };

  const submitReason = async () => {
    if (!reasonFor) return;
    const text = reason.trim();
    if (!text) {
      setError('Укажите причину');
      return;
    }
    setBusyId(reasonFor.flag.id);
    setError('');
    setNotice('');
    try {
      await resolveOwnerSecurityFlag({
        flagId: reasonFor.flag.id,
        action: reasonFor.action,
        reason: text,
      });
      setReasonFor(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить флаг');
    } finally {
      setBusyId('');
    }
  };

  const openAccount = async (flag: OwnerSecurityFlag) => {
    setAccountFor(flag);
    setAccountRestricted(null);
    setAccountConfirm(false);
    setAccountReason('');
    setAccountLoading(true);
    setError('');
    try {
      const status = await fetchOwnerPlayerSecurityRestriction(flag.playerPublicId);
      setAccountRestricted(Boolean(status.restricted));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статус игрока');
      setAccountFor(null);
    } finally {
      setAccountLoading(false);
    }
  };

  const submitAccount = async () => {
    if (!accountFor || accountRestricted === null) return;
    let text: string;
    try {
      text = requireOwnerSecurityAccountReason(accountReason);
    } catch {
      setError('Укажите причину');
      return;
    }
    const toggle = ownerSecurityRestrictionToggle(accountRestricted);
    setBusyId(accountFor.id);
    setError('');
    setNotice('');
    try {
      await setOwnerPlayerSecurityRestriction({
        playerId: accountFor.playerPublicId,
        restricted: toggle.nextRestricted,
        reason: text,
      });
      setNotice(toggle.successMessage(accountFor.playerPublicId));
      const status = await fetchOwnerPlayerSecurityRestriction(accountFor.playerPublicId);
      setAccountRestricted(Boolean(status.restricted));
      setAccountConfirm(false);
      setAccountReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить ограничение');
    } finally {
      setBusyId('');
    }
  };

  const cards = [
    { label: 'Открытые сигналы', value: overview?.openFlags ?? 0 },
    { label: 'Высокий приоритет', value: overview?.highSeverityFlags ?? 0 },
    { label: 'Неудачные входы', value: overview?.loginFailures ?? 0 },
    { label: 'Лимит попыток', value: overview?.rateLimitedAttempts ?? 0 },
    { label: 'Общее устройство', value: overview?.sharedDeviceFlags ?? 0 },
    { label: 'Общая сеть', value: overview?.sharedNetworkFlags ?? 0 },
  ];

  return (
    <section>
      <HeaderRow
        title="Мошенничество и безопасность"
        subtitle="Сигналы для ручного разбора. Ограничение аккаунта не закрывает флаг и не меняет баланс"
        onRefresh={() => void load()}
        loading={loading}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="text-2xl font-extrabold text-ink-900 tabular-nums mt-1">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все статусы</option>
          <option value="open">Открыт</option>
          <option value="reviewed">Просмотрен</option>
          <option value="resolved">Закрыт</option>
          <option value="dismissed">Отклонён</option>
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все приоритеты</option>
          <option value="high">Высокий</option>
          <option value="medium">Средний</option>
          <option value="low">Низкий</option>
        </select>
        <select value={flagType} onChange={(e) => setFlagType(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все типы</option>
          <option value="SHARED_DEVICE">Общее устройство</option>
          <option value="SHARED_NETWORK">Общая сеть</option>
          <option value="LOGIN_FAILURE_BURST">Всплеск неудачных входов</option>
          <option value="AUTH_RATE_LIMITED">Лимит попыток</option>
        </select>
        <input
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          placeholder="ID игрока"
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 w-32"
        />
      </div>
      {notice && <p className="text-sm font-semibold text-emerald-700 mb-3">{notice}</p>}
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">ID игрока</th>
              <th className="px-4 py-3">Флаг</th>
              <th className="px-4 py-3">Приоритет</th>
              <th className="px-4 py-3 text-right">Сигналы</th>
              <th className="px-4 py-3 text-right">Связанные</th>
              <th className="px-4 py-3">Первый</th>
              <th className="px-4 py-3">Последний</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="font-bold text-brand-700 hover:underline"
                    onClick={() => setDossierId(row.playerPublicId)}
                  >
                    {row.playerPublicId || '—'}
                  </button>
                </td>
                <td className="px-4 py-3 font-semibold">{securityFlagLabel(row.flagType)}</td>
                <td className="px-4 py-3">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                    row.severity === 'high'
                      ? 'bg-red-100 text-red-700'
                      : row.severity === 'medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {securitySeverityLabel(row.severity)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{row.signalCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{row.relatedPlayerCount}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatBackofficeDateTime(row.firstSeenAt)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatBackofficeDateTime(row.lastSeenAt)}</td>
                <td className="px-4 py-3">{securityStatusLabel(row.status)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status !== 'open'}
                      onClick={() => void runReview(row)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 disabled:opacity-40"
                    >
                      {OWNER_SECURITY_REVIEW_LABEL}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === 'resolved' || row.status === 'dismissed'}
                      onClick={() => { setReasonFor({ flag: row, action: 'resolve' }); setReason(''); }}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 disabled:opacity-40"
                    >
                      Закрыть
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === 'resolved' || row.status === 'dismissed'}
                      onClick={() => { setReasonFor({ flag: row, action: 'dismiss' }); setReason(''); }}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 disabled:opacity-40"
                    >
                      Отклонить
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || !row.playerPublicId}
                      onClick={() => void openAccount(row)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-800 text-white disabled:opacity-40"
                    >
                      {OWNER_SECURITY_ACCOUNT_LABEL}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">Открытых сигналов нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {reasonFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-extrabold text-ink-900 mb-1">
              {reasonFor.action === 'resolve' ? 'Закрыть сигнал' : 'Отклонить сигнал'}
            </h3>
            <p className="text-sm text-gray-500 mb-3">Причина обязательна. Баланс игрока не изменяется.</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-4"
              placeholder="Причина решения"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReasonFor(null)} className="text-sm font-bold px-3 py-2 rounded-xl bg-slate-100">
                Отмена
              </button>
              <button type="button" onClick={() => void submitReason()} className="text-sm font-bold px-3 py-2 rounded-xl bg-brand-600 text-white">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {accountFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-extrabold text-ink-900 mb-3">Аккаунт игрока</h3>
            {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
            {notice && <p className="text-sm font-semibold text-emerald-700 mb-3">{notice}</p>}
            {accountLoading || accountRestricted === null ? (
              <p className="text-sm text-gray-500 mb-4">Загрузка статуса…</p>
            ) : (
              <>
                <p className="text-sm text-ink-900 mb-1">Игрок: #{accountFor.playerPublicId}</p>
                <p className="text-sm text-ink-900 mb-3">
                  Статус: {ownerSecurityAccountStatusLabel(accountRestricted)}
                </p>
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4 space-y-0.5">
                  {OWNER_SECURITY_RESTRICTION_POLICY.map((row) => (
                    <p key={row.label}>{row.label}: {row.value}</p>
                  ))}
                </div>
                {accountConfirm ? (
                  <>
                    <p className="text-sm font-semibold text-ink-900 mb-2">
                      {ownerSecurityRestrictionToggle(accountRestricted).confirmLabel}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">Причина обязательна. Баланс, ставки и жёсткая блокировка не изменяются.</p>
                    <textarea
                      value={accountReason}
                      onChange={(e) => setAccountReason(e.target.value)}
                      rows={3}
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 mb-4"
                      placeholder="Причина решения"
                    />
                    <div className="flex justify-end gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => { setAccountConfirm(false); setAccountReason(''); }}
                        className="text-sm font-bold px-3 py-2 rounded-xl bg-slate-100"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={busyId === accountFor.id}
                        onClick={() => void submitAccount()}
                        className={`text-sm font-bold px-3 py-2 rounded-xl text-white disabled:opacity-40 ${
                          accountRestricted ? 'bg-emerald-600' : 'bg-red-600'
                        }`}
                      >
                        {ownerSecurityRestrictionToggle(accountRestricted).buttonLabel}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === accountFor.id}
                    onClick={() => { setAccountConfirm(true); setAccountReason(''); setError(''); }}
                    className={`w-full text-sm font-bold px-3 py-2 rounded-xl text-white mb-4 disabled:opacity-40 ${
                      accountRestricted ? 'bg-emerald-600' : 'bg-red-600'
                    }`}
                  >
                    {ownerSecurityRestrictionToggle(accountRestricted).buttonLabel}
                  </button>
                )}
              </>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const playerId = accountFor.playerPublicId;
                  setAccountFor(null);
                  setAccountConfirm(false);
                  setAccountReason('');
                  setDossierId(playerId);
                }}
                className="text-sm font-bold px-3 py-2 rounded-xl bg-slate-100 text-slate-800"
              >
                {OWNER_SECURITY_DOSSIER_LABEL}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccountFor(null);
                  setAccountConfirm(false);
                  setAccountReason('');
                }}
                className="text-sm font-bold px-3 py-2 rounded-xl bg-white border border-slate-200"
              >
                Закрыть окно
              </button>
            </div>
          </div>
        </div>
      )}
      {dossierId && (
        <PlayerSecurityModal playerId={dossierId} onClose={() => setDossierId('')} />
      )}
    </section>
  );
}

function PlayerSecurityModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const [dossier, setDossier] = useState<OwnerPlayerSecurityDossier | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetchOwnerPlayerSecurity(playerId).then((next) => {
      if (!cancelled) setDossier(next);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
    });
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-ink-900">Безопасность игрока {playerId}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Только история сигналов и спортивных ставок. Хеши скрыты. Деньги не меняются.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-72px)] space-y-5">
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <div>
            <h4 className="text-sm font-extrabold mb-2">Флаги</h4>
            {(dossier?.flags ?? []).length === 0 && <p className="text-sm text-gray-500">Нет флагов</p>}
            {(dossier?.flags ?? []).map((flag) => (
              <p key={flag.id} className="text-sm py-1">
                <span className="font-semibold">{securityFlagLabel(flag.flagType)}</span>
                {' · '}
                {securityStatusLabel(flag.status)}
                {' · '}
                сигналов {flag.signalCount}, связанных {flag.relatedPlayerCount}
              </p>
            ))}
          </div>
          <div>
            <h4 className="text-sm font-extrabold mb-2">История</h4>
            {(dossier?.events ?? []).length === 0 && <p className="text-sm text-gray-500">Нет событий</p>}
            {(dossier?.events ?? []).map((event) => (
              <p key={event.id} className="text-xs text-gray-600 py-1">
                {formatBackofficeDateTime(event.createdAt)} · {event.eventType}
                {event.deviceRef ? ` · устройство ${event.deviceRef}` : ''}
                {event.networkRef ? ` · сеть ${event.networkRef}` : ''}
              </p>
            ))}
          </div>
          <PlayerSportsInvestigation playerId={playerId} />
        </div>
      </div>
    </div>
  );
}

const SPORTS_PAGE_SIZE = 50;

function sportsFeedLabel(feed: string): string {
  if (feed === 'inplay' || feed === 'live') return 'Live';
  if (feed === 'prematch' || feed === 'pre-match' || feed === 'line') return 'PreMatch';
  return feed || '—';
}

function sportsModeLabel(mode: string): string {
  if (mode === 'express') return 'Экспресс';
  if (mode === 'single') return 'Одинар';
  return mode || '—';
}

function sportsStatusLabel(status: string, settlement: string, bucket: string): string {
  const parts = [status, settlement, bucket].filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

function sportsMoney(value: number | null | undefined, currency = 'TMTM'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatTmtmCompact(value)} ${currency}`;
}

function PlayerSportsInvestigation({ playerId }: { playerId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [feedType, setFeedType] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [league, setLeague] = useState('');
  const [fixture, setFixture] = useState('');
  const [market, setMarket] = useState('');
  const [minStake, setMinStake] = useState('');
  const [minOdds, setMinOdds] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<OwnerSecuritySportsPage | null>(null);
  const [summary, setSummary] = useState<OwnerSecuritySportsSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [openBetId, setOpenBetId] = useState('');

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError('');
    try {
      const range = {
        from: from.trim() ? new Date(from).toISOString() : null,
        to: to.trim() ? new Date(to).toISOString() : null,
      };
      const [nextPage, nextSummary] = await Promise.all([
        fetchOwnerPlayerSportsBets({
          playerId,
          ...range,
          feedType: feedType || null,
          mode: mode || null,
          status: status || null,
          league: league.trim() || null,
          fixture: fixture.trim() || null,
          market: market.trim() || null,
          minStake: minStake.trim() ? Number(minStake) : null,
          minOdds: minOdds.trim() ? Number(minOdds) : null,
          limit: SPORTS_PAGE_SIZE,
          offset: nextOffset,
        }),
        fetchOwnerPlayerSportsSummary({ playerId, ...range }),
      ]);
      setPage(nextPage);
      setSummary(nextSummary);
      setOffset(nextOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить спортивные ставки');
    } finally {
      setLoading(false);
    }
  }, [playerId, from, to, feedType, mode, status, league, fixture, market, minStake, minOdds]);

  useEffect(() => {
    void load(0);
    // Filters apply via the form, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const indicators = summary?.indicators;
  const rows = page?.rows ?? [];

  return (
    <div className="space-y-3 border-t border-slate-200 pt-5">
      <div>
        <h4 className="text-sm font-extrabold">Спортивные ставки</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Только просмотр канонической истории. Ставки, коэффициенты и расчёты не изменяются.
        </p>
      </div>
      <form
        className="grid grid-cols-2 md:grid-cols-4 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(0);
        }}
      >
        <label className="text-[11px] font-semibold text-gray-500">
          С
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          По
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Live / PreMatch
          <select value={feedType} onChange={(e) => setFeedType(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200">
            <option value="">Все</option>
            <option value="inplay">Live</option>
            <option value="prematch">PreMatch</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Тип
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200">
            <option value="">Все</option>
            <option value="single">Одинар</option>
            <option value="express">Экспресс</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200">
            <option value="">Все</option>
            <option value="open">Открыта</option>
            <option value="settled">Рассчитана</option>
            <option value="void">Возврат</option>
            <option value="cancelled">Отменена</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Лига
          <input value={league} onChange={(e) => setLeague(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Матч
          <input value={fixture} onChange={(e) => setFixture(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Маркет
          <input value={market} onChange={(e) => setMarket(e.target.value)} className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Мин. ставка
          <input value={minStake} onChange={(e) => setMinStake(e.target.value)} inputMode="decimal" className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <label className="text-[11px] font-semibold text-gray-500">
          Мин. кф
          <input value={minOdds} onChange={(e) => setMinOdds(e.target.value)} inputMode="decimal" className="mt-1 w-full text-sm px-2 py-1.5 rounded-lg border border-slate-200" />
        </label>
        <div className="col-span-2 md:col-span-4 flex justify-end">
          <button type="submit" className="text-sm font-semibold px-3 py-2 rounded-xl bg-ink-900 text-white">
            {loading ? 'Загрузка…' : 'Применить фильтры'}
          </button>
        </div>
      </form>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {summary && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">Сводка</p>
          <p className="text-sm text-ink-900">
            Ставок {summary.betsCount}
            {' · '}ставка {sportsMoney(summary.totalStake)}
            {' · '}выплаты {summary.settledPayout == null ? 'нет расчётов' : sportsMoney(summary.settledPayout)}
            {' · '}GGR {summary.sportsGgr == null ? 'нет расчётов' : sportsMoney(summary.sportsGgr)}
          </p>
          <p className="text-xs text-gray-600">
            Средняя ставка {summary.averageStake == null ? '—' : sportsMoney(summary.averageStake)}
            {' · '}средний кф {summary.averageAcceptedOdds == null ? '—' : summary.averageAcceptedOdds.toFixed(2)}
            {' · '}одинары {summary.singleCount} / экспрессы {summary.expressCount}
            {' · '}Live {summary.liveCount} / PreMatch {summary.prematchCount}
          </p>
          {summary.mostUsedLeagues.length > 0 && (
            <p className="text-xs text-gray-600">
              Лиги: {summary.mostUsedLeagues.map((row) => `${row.label} (${row.count})`).join(', ')}
            </p>
          )}
          {summary.mostUsedMarkets.length > 0 && (
            <p className="text-xs text-gray-600">
              Маркеты: {summary.mostUsedMarkets.map((row) => `${row.label} (${row.count})`).join(', ')}
            </p>
          )}
          {indicators && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-2 space-y-1">
              <p className="font-bold">Индикаторы для расследования — автоматическое ограничение не применяется</p>
              {indicators.repeatedFixtures.length > 0 && (
                <p>Повтор матчей: {indicators.repeatedFixtures.map((row) => `${row.fixtureLabel} ×${row.count}`).join(', ')}</p>
              )}
              <p>Быстрые серии: {indicators.rapidSequenceCount}</p>
              {indicators.linkedAccountPublicIds.length > 0 && (
                <p>
                  Связанные ID: {indicators.linkedAccountPublicIds.join(', ')}
                  {indicators.linkedSharedFixtures > 0 ? ` · общие матчи ${indicators.linkedSharedFixtures}` : ''}
                </p>
              )}
              <p>Закрывающие коэффициенты недоступны до интеграции BetB2B</p>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        {rows.length === 0 && !loading && <p className="text-sm text-gray-500">Спортивных ставок нет</p>}
        {rows.map((bet) => (
          <SportsBetCard
            key={bet.betId || bet.displayRef}
            bet={bet}
            open={openBetId === bet.betId}
            onToggle={() => setOpenBetId((current) => (current === bet.betId ? '' : bet.betId))}
          />
        ))}
      </div>
      {(page?.total ?? 0) > SPORTS_PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
          <span>
            {offset + 1}–{Math.min(offset + rows.length, page?.total ?? 0)} из {page?.total ?? 0}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - SPORTS_PAGE_SIZE))} className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
              Назад
            </button>
            <button type="button" disabled={offset + rows.length >= (page?.total ?? 0) || loading} onClick={() => void load(offset + SPORTS_PAGE_SIZE)} className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40">
              Дальше
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SportsBetCard({
  bet,
  open,
  onToggle,
}: {
  bet: OwnerSecuritySportsBet;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="text-sm font-extrabold text-ink-900">
          {bet.displayRef || bet.betId}
          {' · '}
          {sportsModeLabel(bet.mode)}
          {' · '}
          {sportsFeedLabel(bet.feedType)}
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          Принята {bet.acceptedAt ? formatBackofficeDateTime(bet.acceptedAt) : '—'}
          {' · '}ставка {sportsMoney(bet.stake, bet.currency)}
          {' · '}кф {bet.acceptedOdds ? bet.acceptedOdds.toFixed(2) : '—'}
          {' · '}выплата {sportsMoney(bet.potentialPayout, bet.currency)}
        </p>
        <p className="text-xs text-gray-500">
          {sportsStatusLabel(bet.status, bet.settlementState, bet.statusBucket)}
          {bet.settledAt ? ` · расчёт ${formatBackofficeDateTime(bet.settledAt)}` : ''}
          {bet.provider ? ` · ${bet.provider}` : ''}
        </p>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {bet.legs.length === 0 && <p className="text-xs text-gray-500">Исходы недоступны</p>}
          {bet.legs.map((leg, index) => (
            <div key={`${bet.betId}-${leg.outcomeId}-${index}`} className="text-xs text-gray-700 bg-slate-50 rounded-lg px-2 py-2">
              <p className="font-bold text-ink-900">
                {bet.mode === 'express' ? `Исход ${index + 1}: ` : ''}
                {leg.fixtureLabel || (leg.fixtureId ? `Матч ${leg.fixtureId}` : '—')}
              </p>
              <p>
                Лига {leg.league || '—'}
                {leg.fixtureId ? ` · fixture ${leg.fixtureId}` : ''}
              </p>
              <p>
                Маркет {leg.marketKey || '—'}
                {leg.marketId ? ` · ${leg.marketId}` : ''}
                {leg.line ? ` · линия ${leg.line}` : ''}
              </p>
              <p>
                Исход {leg.outcomeName || '—'}
                {leg.outcomeId ? ` · ${leg.outcomeId}` : ''}
                {' · '}кф {leg.acceptedOdds ? leg.acceptedOdds.toFixed(2) : '—'}
              </p>
              <p>
                Статус маркета {leg.marketStatus || '—'}
                {' · '}ноги {leg.legStatus || '—'}
                {' · '}результат {leg.settlementResult || '—'}
              </p>
              {leg.providerLastUpdate && <p>Обновление провайдера {leg.providerLastUpdate}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RiskBetsPanel() {
  const [rows, setRows] = useState<RiskBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchOwnerRiskBets());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить ставки');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section>
      <HeaderRow
        title="Мониторинг ставок и рисков"
        subtitle="Крупные и подозрительные открытые купоны · обновление каждые 15 сек"
        onRefresh={() => void load()}
        loading={loading}
      />
      <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4">
        Функция переводится на защищённое ядро — расчёт и аннулирование ставок недоступны.
      </p>
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
                      disabled
                      title="Функция переводится на защищённое ядро"
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Рассчитать
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Функция переводится на защищённое ядро"
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed inline-flex items-center gap-1"
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
