import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, History, LogOut, RefreshCw, Shield, User, Users,
} from 'lucide-react';
import { useSecurityAuth } from './auth/SecurityAuthProvider';
import {
  OWNER_SECURITY_RESTRICTION_POLICY,
  ownerSecurityAccountStatusLabel,
  ownerSecurityRestrictionToggle,
  requireOwnerSecurityAccountReason,
} from '../owner/securityAccountActions';
import {
  fetchSecurityActivity,
  fetchSecurityDossier,
  fetchSecurityFlags,
  fetchSecurityOverview,
  fetchSecuritySportsBets,
  fetchSecuritySportsSummary,
  fetchSecurityWinPatternSettings,
  formatSecurityDateTime,
  formatSecurityMoney,
  postSecurityFlagAction,
  setSecurityRestriction,
  requestSecurityPlayerManualVerification,
  type SecurityDossier,
  type SecurityFlag,
  type SecurityOverview,
  type SecuritySportsBet,
  type SecuritySportsPage,
  type SecuritySportsSummary,
  type SecurityActivityRow,
} from './services';
import type { SecurityStaffContext } from './auth/securityAuth';

type SecurityTab = 'flags' | 'players' | 'sports' | 'activity';

export function SecurityDashboard() {
  const { loading, staff, deniedMessage, signOut } = useSecurityAuth();

  useEffect(() => {
    document.title = 'NextPari — Служба безопасности';
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-sm font-semibold text-ink-400">Загрузка кабинета…</p>
      </div>
    );
  }

  if (!staff) {
    return <SecurityLoginScreen deniedMessage={deniedMessage} />;
  }

  return <SecurityShell staff={staff} onLogout={() => { void signOut(); }} />;
}

function SecurityLoginScreen({ deniedMessage }: { deniedMessage: string }) {
  const { signIn } = useSecurityAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await signIn(login, password);
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
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">NextPari · Security</p>
            <h1 className="text-xl font-extrabold text-ink-900">Служба безопасности</h1>
            <p className="text-xs text-gray-500 mt-0.5">Вход по логину сотрудника</p>
          </div>
        </div>
        {shownError && (
          <p className="mb-4 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {shownError}
          </p>
        )}
        <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Логин</label>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 mb-3">
          <User className="w-4 h-4 text-gray-400" />
          <input
            autoComplete="username"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="security01"
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

function SecurityShell({
  staff,
  onLogout,
}: {
  staff: SecurityStaffContext;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<SecurityTab>('flags');
  const [playerId, setPlayerId] = useState('');

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-64 shrink-0 bg-ink-950 text-white flex flex-col min-h-screen">
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.22em] text-brand-400 font-bold">NextPari</p>
          <h1 className="text-lg font-extrabold mt-1">Безопасность</h1>
          <p className="text-xs text-ink-400 mt-2 leading-snug">{staff.displayName || staff.login || 'Security'}</p>
          <span className="inline-flex mt-2 text-[10px] font-bold px-2 py-1 rounded-full bg-brand-600/20 text-brand-300">
            security · расследование
          </span>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          <NavBtn active={tab === 'flags'} onClick={() => setTab('flags')} icon={AlertTriangle} label="Мошенничество и безопасность" />
          <NavBtn active={tab === 'players'} onClick={() => setTab('players')} icon={Users} label="Игроки риска" />
          <NavBtn active={tab === 'sports'} onClick={() => setTab('sports')} icon={Shield} label="Спортивные ставки" />
          <NavBtn active={tab === 'activity'} onClick={() => setTab('activity')} icon={History} label="История действий" />
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
        {tab === 'flags' && <FlagsPanel onOpenPlayer={(id) => { setPlayerId(id); setTab('players'); }} />}
        {tab === 'players' && <PlayersPanel playerId={playerId} onPlayerId={setPlayerId} onOpenSports={() => setTab('sports')} />}
        {tab === 'sports' && <SportsPanel playerId={playerId} onPlayerId={setPlayerId} />}
        {tab === 'activity' && <ActivityPanel />}
      </main>
    </div>
  );
}

function NavBtn({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Shield;
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

function flagLabel(type: string): string {
  if (type === 'SHARED_DEVICE') return 'Общее устройство';
  if (type === 'SHARED_NETWORK') return 'Общая сеть';
  if (type === 'LOGIN_FAILURE_BURST') return 'Неудачные входы';
  if (type === 'AUTH_RATE_LIMITED') return 'Лимит попыток';
  if (type === 'HIGH_WIN_FREQUENCY') return 'Частые выигрыши';
  if (type === 'HIGH_NET_PROFIT') return 'Высокая прибыль';
  if (type === 'HIGH_ROI') return 'Высокий ROI';
  return type;
}

function isWinPatternFlag(type: string): boolean {
  return type === 'HIGH_WIN_FREQUENCY' || type === 'HIGH_NET_PROFIT' || type === 'HIGH_ROI';
}

function winPatternSourceLabel(source: string): string {
  if (source === 'SPORTS') return 'Спорт';
  if (source === 'OWNED_GAMES') return 'Свои игры';
  return source || '—';
}

function detailNum(details: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value != null && value !== '') return String(value);
  }
  return '—';
}

function detailRate(details: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === 'number' && Number.isFinite(value)) return `${(value * 100).toFixed(1)}%`;
  }
  return '—';
}

function statusLabel(status: string): string {
  if (status === 'open') return 'Открыт';
  if (status === 'reviewed') return 'Просмотрен';
  if (status === 'resolved') return 'Закрыт';
  if (status === 'dismissed') return 'Отклонён';
  return status;
}

function WinPatternThresholdsReadOnly() {
  const [rows, setRows] = useState<Array<{ source: string; enabled: boolean; lookbackHours: number; minimumSettledCount: number; minimumTotalStake: number; winRateThreshold: number; netProfitThreshold: number; roiThreshold: number }>>([]);
  useEffect(() => {
    void fetchSecurityWinPatternSettings().then(setRows).catch(() => setRows([]));
  }, []);
  if (!rows.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <h3 className="font-extrabold mb-2">Пороги анализа выигрышей</h3>
      <p className="text-xs text-gray-500 mb-3">Только просмотр. Изменяет Owner.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.source} className="text-xs bg-slate-50 rounded-xl px-3 py-2 space-y-0.5">
            <p className="font-bold">{winPatternSourceLabel(row.source)} · {row.enabled ? 'вкл' : 'выкл'}</p>
            <p>Период {row.lookbackHours}ч · мин. выборка {row.minimumSettledCount} · мин. ставка {row.minimumTotalStake}</p>
            <p>win-rate {(row.winRateThreshold * 100).toFixed(1)}% · прибыль {row.netProfitThreshold} · ROI {(row.roiThreshold * 100).toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagsPanel({ onOpenPlayer }: { onOpenPlayer: (id: string) => void }) {
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [rows, setRows] = useState<SecurityFlag[]>([]);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [flagType, setFlagType] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reasonFor, setReasonFor] = useState<{ flag: SecurityFlag; action: 'resolve' | 'dismiss' } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOverview, nextRows] = await Promise.all([
        fetchSecurityOverview(),
        fetchSecurityFlags({
          status: status || null,
          severity: priority || null,
          flagType: flagType || null,
          playerId: playerId.trim() || null,
        }),
      ]);
      setOverview(nextOverview);
      setRows(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить сигналы');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, priority, flagType, playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = [
    { label: 'Открытые сигналы', value: overview?.openFlags ?? 0 },
    { label: 'Высокий приоритет', value: overview?.highSeverityFlags ?? 0 },
    { label: 'Неудачные входы', value: overview?.loginFailures ?? 0 },
    { label: 'Лимит попыток', value: overview?.rateLimitedAttempts ?? 0 },
    { label: 'Общее устройство', value: overview?.sharedDeviceFlags ?? 0 },
    { label: 'Общая сеть', value: overview?.sharedNetworkFlags ?? 0 },
    { label: 'Ограниченные аккаунты', value: overview?.restrictedAccounts ?? 0 },
  ];

  const runReview = async (flag: SecurityFlag) => {
    setBusyId(flag.id);
    setError('');
    try {
      await postSecurityFlagAction({ flagId: flag.id, action: 'review' });
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
    try {
      await postSecurityFlagAction({ flagId: reasonFor.flag.id, action: reasonFor.action, reason: text });
      setReasonFor(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить флаг');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Мошенничество и безопасность</h2>
          <p className="text-sm text-gray-500 mt-0.5">Только расследование. Баланс, ставки и hard-block недоступны.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-2xl px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="text-2xl font-extrabold text-ink-900 tabular-nums mt-1">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={playerId} onChange={(e) => setPlayerId(e.target.value)} placeholder="ID игрока" className="text-sm border border-slate-200 rounded-xl px-3 py-2 w-32" />
        <select value={flagType} onChange={(e) => setFlagType(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все типы</option>
          <option value="SHARED_DEVICE">Общее устройство</option>
          <option value="SHARED_NETWORK">Общая сеть</option>
          <option value="LOGIN_FAILURE_BURST">Неудачные входы</option>
          <option value="AUTH_RATE_LIMITED">Лимит попыток</option>
          <option value="HIGH_WIN_FREQUENCY">Частые выигрыши</option>
          <option value="HIGH_NET_PROFIT">Высокая прибыль</option>
          <option value="HIGH_ROI">Высокий ROI</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все приоритеты</option>
          <option value="high">Высокий</option>
          <option value="medium">Средний</option>
          <option value="low">Низкий</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <option value="">Все статусы</option>
          <option value="open">Открыт</option>
          <option value="reviewed">Просмотрен</option>
          <option value="resolved">Закрыт</option>
          <option value="dismissed">Отклонён</option>
        </select>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
        {rows.filter((flag) => isWinPatternFlag(flag.flagType)).map((flag) => (
          <div key={flag.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
            <p className="font-extrabold text-ink-900">{flagLabel(flag.flagType)}</p>
            <p className="text-sm">Игрок #{flag.playerPublicId}</p>
            <p className="text-xs text-gray-600">Источник: {winPatternSourceLabel(flag.source || String(flag.details.source ?? ''))}</p>
            <p className="text-xs text-gray-600">Период: {detailNum(flag.details, 'lookback_hours', 'lookbackHours')} ч</p>
            <p className="text-xs text-gray-600">Количество ставок/раундов: {detailNum(flag.details, 'settled_count', 'settledCount')}</p>
            <p className="text-xs text-gray-600">Выигрыши: {detailNum(flag.details, 'win_count', 'winCount')}</p>
            <p className="text-xs text-gray-600">Процент выигрышей: {detailRate(flag.details, 'win_rate', 'winRate')}</p>
            <p className="text-xs text-gray-600">Сумма ставок: {detailNum(flag.details, 'total_stake', 'totalStake')}</p>
            <p className="text-xs text-gray-600">Выплаты: {detailNum(flag.details, 'total_payout', 'totalPayout')}</p>
            <p className="text-xs text-gray-600">Чистая прибыль: {detailNum(flag.details, 'net_profit', 'netProfit')}</p>
            <p className="text-xs text-gray-600">ROI: {detailRate(flag.details, 'roi')}</p>
            <p className="text-xs text-gray-600">Приоритет: {flag.severity}</p>
            <button type="button" className="text-xs font-bold text-brand-700 pt-1" onClick={() => onOpenPlayer(flag.playerPublicId)}>Досье</button>
          </div>
        ))}
      </div>
      <WinPatternThresholdsReadOnly />
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">ID игрока</th>
              <th className="px-4 py-3">Тип</th>
              <th className="px-4 py-3">Приоритет</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((flag) => (
              <tr key={flag.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">{flag.playerPublicId}</td>
                <td className="px-4 py-3">{flagLabel(flag.flagType)}</td>
                <td className="px-4 py-3">{flag.severity}</td>
                <td className="px-4 py-3">{statusLabel(flag.status)}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button type="button" className="text-xs font-bold text-brand-700" onClick={() => onOpenPlayer(flag.playerPublicId)}>Досье</button>
                  <button type="button" disabled={busyId === flag.id} className="text-xs font-bold" onClick={() => void runReview(flag)}>Просмотр</button>
                  <button type="button" className="text-xs font-bold" onClick={() => setReasonFor({ flag, action: 'resolve' })}>Закрыть</button>
                  <button type="button" className="text-xs font-bold" onClick={() => setReasonFor({ flag, action: 'dismiss' })}>Отклонить</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={5} className="px-4 py-6 text-sm text-gray-500">Нет сигналов</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {reasonFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md">
            <h3 className="font-extrabold mb-2">{reasonFor.action === 'resolve' ? 'Закрыть сигнал' : 'Отклонить сигнал'}</h3>
            <p className="text-xs text-gray-500 mb-3">Причина обязательна. Ограничение аккаунта не меняется.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-3" rows={3} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setReasonFor(null); setReason(''); }}>Отмена</button>
              <button type="button" className="font-bold" onClick={() => void submitReason()}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlayersPanel({
  playerId,
  onPlayerId,
  onOpenSports,
}: {
  playerId: string;
  onPlayerId: (id: string) => void;
  onOpenSports: () => void;
}) {
  const [query, setQuery] = useState(playerId);
  const [dossier, setDossier] = useState<SecurityDossier | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [verifyRestrict, setVerifyRestrict] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuery(playerId);
    if (playerId) void load(playerId);
  }, [playerId]);

  const load = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      setDossier(await fetchSecurityDossier(id));
    } catch (err) {
      setDossier(null);
      setError(err instanceof Error ? err.message : 'Не удалось открыть досье');
    } finally {
      setLoading(false);
    }
  };

  const submitRestriction = async () => {
    if (!dossier) return;
    let text: string;
    try {
      text = requireOwnerSecurityAccountReason(reason);
    } catch {
      setError('Укажите причину');
      return;
    }
    const toggle = ownerSecurityRestrictionToggle(dossier.restricted);
    setBusy(true);
    setError('');
    try {
      await setSecurityRestriction({
        playerId: dossier.playerPublicId,
        restricted: toggle.nextRestricted,
        reason: text,
      });
      setReason('');
      await load(dossier.playerPublicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить ограничение');
    } finally {
      setBusy(false);
    }
  };

  const submitVerification = async () => {
    if (!dossier) return;
    let text: string;
    try {
      text = requireOwnerSecurityAccountReason(reason);
    } catch {
      setError('Укажите причину');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestSecurityPlayerManualVerification({
        playerId: dossier.playerPublicId,
        reason: text,
        restrict: verifyRestrict,
      });
      setReason('');
      setVerifyRestrict(false);
      await load(dossier.playerPublicId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запросить верификацию');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-4">Игроки риска</h2>
      <form
        className="flex gap-2 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          onPlayerId(query.trim());
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID игрока" className="text-sm border border-slate-200 rounded-xl px-3 py-2 w-40" />
        <button type="submit" className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white">Открыть досье</button>
      </form>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Загрузка…</p>}
      {dossier && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-lg font-extrabold">Игрок #{dossier.playerPublicId}</p>
            <p className="text-sm text-gray-600 mt-1">Состояние: {ownerSecurityAccountStatusLabel(dossier.restricted)}</p>
            <p className="text-sm text-gray-600">Ограничение: {dossier.restricted ? 'активно' : 'нет'}</p>
            <p className="text-sm text-gray-600">Связанных аккаунтов: {dossier.linkedAccountCount}</p>
            {dossier.restrictionReason && <p className="text-sm text-gray-600">Причина: {dossier.restrictionReason}</p>}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {OWNER_SECURITY_RESTRICTION_POLICY.map((row) => (
                <p key={row.label} className="text-xs bg-slate-50 rounded-lg px-2 py-2">
                  <span className="font-semibold">{row.label}:</span> {row.value}
                </p>
              ))}
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина обязательна" className="mt-3 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={2} />
            <button type="button" disabled={busy} onClick={() => void submitRestriction()} className="mt-2 text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white">
              {ownerSecurityRestrictionToggle(dossier.restricted).buttonLabel}
            </button>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={verifyRestrict}
                onChange={(e) => setVerifyRestrict(e.target.checked)}
                className="mt-0.5"
              />
              Одновременно ограничить аккаунт (только явное действие, не из-за отсутствия email)
            </label>
            <button type="button" disabled={busy} onClick={() => void submitVerification()} className="mt-2 text-sm font-bold px-3 py-2 rounded-xl bg-slate-800 text-white">
              Запросить верификацию
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-extrabold mb-2">Флаги риска</h3>
            {dossier.flags.length === 0 && <p className="text-sm text-gray-500">Нет флагов</p>}
            {dossier.flags.map((flag) => (
              <p key={flag.id} className="text-sm py-1">{flagLabel(flag.flagType)} · {statusLabel(flag.status)} · {flag.severity}{flag.source ? ` · ${winPatternSourceLabel(flag.source)}` : ''}</p>
            ))}
          </div>
          {(dossier.winPattern.linkedSharingFlags.length > 0 || dossier.winPattern.linkedWinPatternOverlap.length > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h3 className="font-extrabold mb-2">Связанные аккаунты и выигрыши</h3>
              {dossier.winPattern.linkedSharingFlags.map((row, index) => (
                <p key={`share-${index}`} className="text-sm py-1">
                  {flagLabel(String(row.flag_type ?? row.flagType ?? ''))} · связанных {String(row.related_player_count ?? row.relatedPlayerCount ?? '—')}
                </p>
              ))}
              {dossier.winPattern.linkedWinPatternOverlap.map((row, index) => (
                <p key={`overlap-${index}`} className="text-sm py-1">
                  #{String(row.player_public_id ?? row.playerPublicId ?? '')} · {flagLabel(String(row.flag_type ?? row.flagType ?? ''))} · {winPatternSourceLabel(String(row.source ?? ''))}
                </p>
              ))}
            </div>
          )}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-extrabold">Спортивные ставки</h3>
              <button type="button" className="text-xs font-bold text-brand-700" onClick={onOpenSports}>Открыть историю</button>
            </div>
            <p className="text-xs text-gray-500">Только расследование. Арбитраж и CLV не вычисляются.</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-extrabold mb-2">Свои игры</h3>
            {dossier.winPattern.ownedGamesRecent.length === 0 && <p className="text-sm text-gray-500">Нет недавних раундов</p>}
            {dossier.winPattern.ownedGamesRecent.map((row, index) => (
              <p key={index} className="text-xs text-gray-600 py-1">
                {String(row.game_code ?? row.gameCode ?? '')} · ставка {String(row.total_stake ?? row.totalStake ?? '')} · выплата {String(row.payout ?? '')} · {String(row.settled_at ?? row.settledAt ?? '')}
              </p>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-extrabold mb-2">Входы и события безопасности</h3>
            {dossier.events.length === 0 && <p className="text-sm text-gray-500">Нет событий</p>}
            {dossier.events.map((event) => (
              <p key={event.id} className="text-xs text-gray-600 py-1">
                {formatSecurityDateTime(event.createdAt)} · {event.eventType}
                {event.deviceRef ? ` · устройство ${event.deviceRef}` : ''}
                {event.networkRef ? ` · сеть ${event.networkRef}` : ''}
              </p>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-extrabold mb-2">История ограничений</h3>
            {dossier.restrictionHistory.length === 0 && <p className="text-sm text-gray-500">Нет записей</p>}
            {dossier.restrictionHistory.map((row, index) => (
              <p key={index} className="text-xs text-gray-600 py-1">
                {formatSecurityDateTime(String(row.created_at ?? row.createdAt ?? ''))} · {String(row.event_type ?? row.eventType ?? '')} · {String(row.reason ?? '')}
              </p>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-extrabold mb-2">Недавние решения Security</h3>
            {dossier.recentDecisions.length === 0 && <p className="text-sm text-gray-500">Нет решений</p>}
            {dossier.recentDecisions.map((row, index) => (
              <p key={index} className="text-xs text-gray-600 py-1">
                {formatSecurityDateTime(String(row.created_at ?? row.createdAt ?? ''))} · {String(row.action ?? '')} · {String(row.reason ?? '')}
              </p>
            ))}
          </div>
          <SportsInvestigation playerId={dossier.playerPublicId} />
        </div>
      )}
    </section>
  );
}

function SportsPanel({
  playerId,
  onPlayerId,
}: {
  playerId: string;
  onPlayerId: (id: string) => void;
}) {
  const [query, setQuery] = useState(playerId);
  useEffect(() => { setQuery(playerId); }, [playerId]);
  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-4">Спортивные ставки</h2>
      <form
        className="flex gap-2 mb-4"
        onSubmit={(event) => {
          event.preventDefault();
          onPlayerId(query.trim());
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID игрока" className="text-sm border border-slate-200 rounded-xl px-3 py-2 w-40" />
        <button type="submit" className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white">Показать</button>
      </form>
      {playerId ? <SportsInvestigation playerId={playerId} /> : <p className="text-sm text-gray-500">Укажите ID игрока</p>}
    </section>
  );
}

function SportsInvestigation({ playerId }: { playerId: string }) {
  const [page, setPage] = useState<SecuritySportsPage | null>(null);
  const [summary, setSummary] = useState<SecuritySportsSummary | null>(null);
  const [error, setError] = useState('');
  const [openBetId, setOpenBetId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchSecuritySportsBets({ playerId, limit: 50, offset: 0 }),
      fetchSecuritySportsSummary({ playerId }),
    ]).then(([nextPage, nextSummary]) => {
      if (cancelled) return;
      setPage(nextPage);
      setSummary(nextSummary);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить ставки');
    });
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-extrabold">Спортивные ставки</h3>
      <p className="text-xs text-gray-500">Индикаторы расследования. Автоматическое ограничение и CLV не применяются.</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {summary && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-1 text-sm">
          <p>Ставок {summary.betsCount} · ставка {formatSecurityMoney(summary.totalStake)} · выплаты {formatSecurityMoney(summary.settledPayout)} · GGR {formatSecurityMoney(summary.sportsGgr)}</p>
          <p className="text-xs text-gray-600">Средняя ставка {formatSecurityMoney(summary.averageStake)} · средний кф {summary.averageAcceptedOdds == null ? '—' : summary.averageAcceptedOdds.toFixed(2)} · одинары {summary.singleCount} / экспрессы {summary.expressCount} · Live {summary.liveCount} / PreMatch {summary.prematchCount}</p>
          {summary.mostUsedLeagues.length > 0 && <p className="text-xs">Лиги: {summary.mostUsedLeagues.map((row) => `${row.label} (${row.count})`).join(', ')}</p>}
          {summary.mostUsedMarkets.length > 0 && <p className="text-xs">Маркеты: {summary.mostUsedMarkets.map((row) => `${row.label} (${row.count})`).join(', ')}</p>}
          {summary.indicators.repeatedFixtures.length > 0 && (
            <p className="text-xs text-amber-800">Повтор матчей: {summary.indicators.repeatedFixtures.map((row) => `${row.fixtureLabel} ×${row.count}`).join(', ')}</p>
          )}
          <p className="text-xs text-amber-800">Быстрые серии: {summary.indicators.rapidSequenceCount}</p>
          {summary.indicators.linkedAccountPublicIds.length > 0 && (
            <p className="text-xs text-amber-800">Связанные ID: {summary.indicators.linkedAccountPublicIds.join(', ')}</p>
          )}
        </div>
      )}
      {(page?.rows ?? []).map((bet) => (
        <SportsBetCard
          key={bet.betId || bet.displayRef}
          bet={bet}
          open={openBetId === bet.betId}
          onToggle={() => setOpenBetId((current) => (current === bet.betId ? '' : bet.betId))}
        />
      ))}
    </div>
  );
}

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

function SportsBetCard({
  bet,
  open,
  onToggle,
}: {
  bet: SecuritySportsBet;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="text-sm font-extrabold">
          {bet.acceptedAt ? formatSecurityDateTime(bet.acceptedAt) : '—'}
          {' · '}
          {sportsFeedLabel(bet.feedType)}
          {' · '}
          {sportsModeLabel(bet.mode)}
        </p>
        <p className="text-xs text-gray-600">
          ставка {formatSecurityMoney(bet.stake, bet.currency)}
          {' · '}кф {bet.acceptedOdds ? bet.acceptedOdds.toFixed(2) : '—'}
          {' · '}выплата {formatSecurityMoney(bet.potentialPayout, bet.currency)}
          {' · '}{bet.status} / {bet.settlementState}
        </p>
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {bet.legs.map((leg, index) => (
            <div key={`${bet.betId}-${leg.outcomeId}-${index}`} className="text-xs bg-slate-50 rounded-lg px-2 py-2">
              <p className="font-bold">{bet.mode === 'express' ? `Исход ${index + 1}: ` : ''}{leg.fixtureLabel || '—'}</p>
              <p>Лига {leg.league || '—'} · маркет {leg.marketKey || '—'} {leg.line ? `· линия ${leg.line}` : ''}</p>
              <p>Исход {leg.outcomeName || '—'} · кф {leg.acceptedOdds ? leg.acceptedOdds.toFixed(2) : '—'}</p>
              <p>Результат {leg.settlementResult || leg.legStatus || '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityPanel() {
  const [rows, setRows] = useState<SecurityActivityRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchSecurityActivity().then(setRows).catch((err) => {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю');
    });
  }, []);

  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-4">История действий</h2>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Время</th>
              <th className="px-4 py-3">Сотрудник</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Игрок</th>
              <th className="px-4 py-3">Причина</th>
              <th className="px-4 py-3">Результат</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.at}-${index}`} className="border-t border-slate-100">
                <td className="px-4 py-3">{row.at ? formatSecurityDateTime(row.at) : '—'}</td>
                <td className="px-4 py-3">{row.employeeName || row.employeeLogin || '—'}</td>
                <td className="px-4 py-3">{row.action}</td>
                <td className="px-4 py-3">{row.playerPublicId || row.target || '—'}</td>
                <td className="px-4 py-3">{row.reason || '—'}</td>
                <td className="px-4 py-3">{row.result || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
