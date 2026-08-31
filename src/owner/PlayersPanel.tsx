import { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw, Search, Unlock, Users, Wallet, X } from 'lucide-react';
import {
  fetchOwnerPlayerDossier,
  fetchOwnerPlayers,
  formatBackofficeDateTime,
  formatTmtmCompact,
  setOwnerPlayerBlocked,
  type OwnerPlayerDossier,
  type OwnerPlayerListItem,
} from './services';

type DossierTab =
  | 'overview'
  | 'wallet'
  | 'ledger'
  | 'bets'
  | 'casino'
  | 'cash'
  | 'vip'
  | 'risk'
  | 'messages';

const TABS: Array<{ id: DossierTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'bets', label: 'Bets' },
  { id: 'casino', label: 'Casino/Originals' },
  { id: 'cash', label: 'Deposits & Withdrawals' },
  { id: 'vip', label: 'VIP' },
  { id: 'risk', label: 'Risk' },
  { id: 'messages', label: 'Messages' },
];

export function PlayersPanel() {
  const [rows, setRows] = useState<OwnerPlayerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchOwnerPlayers({ search, limit: 50, offset: 0 });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить игроков');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Игроки</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {rows.length} из {total} профилей · JWT owner_list_players
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>
      {notice && (
        <p className="mb-3 text-sm font-semibold text-brand-800 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}
      <div className="mb-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setSearch(query.trim());
          }}
          placeholder="ID игрока, телефон, email или UUID"
          className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
        />
        <button
          type="button"
          onClick={() => setSearch(query.trim())}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-ink-900 text-white"
        >
          Найти
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">ID игрока</th>
                <th className="px-4 py-3">Контакты</th>
                <th className="px-4 py-3 text-right">Доступно</th>
                <th className="px-4 py-3 text-right">Legacy</th>
                <th className="px-4 py-3">Кошелёк</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.publicId || row.id)}
                      className="inline-flex items-center font-extrabold text-[12px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      #{row.publicId || row.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{row.phone || '—'}</p>
                    <p className="text-xs text-gray-400">{row.email || 'нет email'}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold tabular-nums">
                    {formatTmtmCompact(row.availableBalance)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {formatTmtmCompact(row.legacyBalance)}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-600">{row.walletStatus}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      row.blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                    }`}>
                      {row.blocked ? 'Заблокирован' : 'Активен'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {row.createdAt ? formatBackofficeDateTime(row.createdAt) : '—'}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    {search ? 'Игроки по запросу не найдены' : 'Профили игроков пока не загружены'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selectedId && (
        <PlayerDossierModal
          playerId={selectedId}
          onClose={() => setSelectedId(null)}
          onNotice={setNotice}
          onChanged={load}
        />
      )}
    </section>
  );
}

function PlayerDossierModal({
  playerId,
  onClose,
  onNotice,
  onChanged,
}: {
  playerId: string;
  onClose: () => void;
  onNotice: (value: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [dossier, setDossier] = useState<OwnerPlayerDossier | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DossierTab>('overview');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDossier(await fetchOwnerPlayerDossier(playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть досье');
      setDossier(null);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const publicId = String(dossier?.profile.public_id ?? dossier?.wallet.public_id ?? playerId);
  const blocked = Boolean(dossier?.risk.is_blocked);

  const toggleBlock = async () => {
    const next = !blocked;
    const ok = window.confirm(
      next ? `Заблокировать игрока #${publicId}?` : `Разблокировать игрока #${publicId}?`,
    );
    if (!ok) return;
    const reason = window.prompt('Причина (необязательно)') ?? '';
    setBusy(true);
    try {
      await setOwnerPlayerBlocked({
        playerId: publicId || playerId,
        blocked: next,
        reason,
      });
      onNotice(next ? `Игрок #${publicId} заблокирован` : `Игрок #${publicId} разблокирован`);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Досье игрока</p>
            <div className="flex items-center gap-2 mt-1">
              <Users className="w-4 h-4 text-emerald-600" />
              <h3 className="text-lg font-extrabold text-ink-900">#{publicId}</h3>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
              }`}>
                {blocked ? 'Заблокирован' : 'Активен'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {String(dossier?.profile.phone || 'телефон не указан')} · {String(dossier?.profile.email || 'email не указан')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-2 text-sm font-bold rounded-t-lg whitespace-nowrap ${
                tab === item.id ? 'text-brand-700 bg-brand-50' : 'text-gray-500 hover:text-ink-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
          {loading && <p className="text-sm text-gray-500">Загрузка досье…</p>}
          {dossier && <DossierBody tab={tab} dossier={dossier} />}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !dossier}
            onClick={() => void toggleBlock()}
            className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl disabled:opacity-50 ${
              blocked ? 'bg-slate-200 text-slate-800' : 'bg-red-50 text-red-600'
            }`}
          >
            {blocked ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
            {blocked ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
          </button>
          <button
            type="button"
            disabled
            title="Функция переводится на защищённое ядро"
            className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed"
          >
            <Wallet className="w-4 h-4" />
            Корректировка баланса
          </button>
        </div>
      </div>
    </div>
  );
}

function DossierBody({ tab, dossier }: { tab: DossierTab; dossier: OwnerPlayerDossier }) {
  if (tab === 'overview') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <InfoCell label="Public ID" value={String(dossier.profile.public_id ?? dossier.wallet.public_id ?? '—')} />
        <InfoCell label="Wallet ID" value={String(dossier.wallet.wallet_id ?? '—')} />
        <InfoCell label="Email" value={String(dossier.profile.email || '—')} />
        <InfoCell label="Телефон" value={String(dossier.profile.phone || '—')} />
        <InfoCell label="Статус кошелька" value={String(dossier.wallet.status ?? '—')} />
        <InfoCell label="Регистрация" value={formatMaybeDate(dossier.profile.created_at)} />
      </div>
    );
  }
  if (tab === 'wallet') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <InfoCell label="Доступно" value={formatTmtmCompact(Number(dossier.wallet.available_balance ?? 0))} />
        <InfoCell label="Заблокировано" value={formatTmtmCompact(Number(dossier.wallet.locked_balance ?? 0))} />
        <InfoCell label="Legacy баланс" value={formatTmtmCompact(Number(dossier.wallet.legacy_balance ?? 0))} />
        <InfoCell label="USDT" value={String(dossier.wallet.usdt_balance ?? 0)} />
        <InfoCell label="Статус" value={String(dossier.wallet.status ?? '—')} />
        <InfoCell label="Blocked" value={dossier.wallet.is_blocked ? 'да' : 'нет'} />
      </div>
    );
  }
  if (tab === 'ledger') return <SectionTable section={dossier.ledger} columns={['created_at', 'operation_type', 'available_delta', 'available_after']} />;
  if (tab === 'bets') return <SectionTable section={dossier.sportsBets} columns={['created_at', 'ticket_code', 'selection', 'amount', 'status']} />;
  if (tab === 'casino') return <SectionTable section={dossier.casino} columns={['created_at', 'game', 'stake', 'payout']} />;
  if (tab === 'cash') {
    return (
      <div className="space-y-5">
        <SectionTable section={dossier.depositsWithdrawals} columns={['created_at', 'source', 'type', 'amount', 'status']} />
        {dossier.depositsWithdrawals.payoutRequests && dossier.depositsWithdrawals.payoutRequests.length > 0 && (
          <SectionTable
            section={{ supported: true, rows: dossier.depositsWithdrawals.payoutRequests }}
            columns={['created_at', 'player_public_id', 'amount', 'status', 'cashier_id', 'paid_at']}
            empty="Нет данных"
          />
        )}
      </div>
    );
  }
  if (tab === 'vip') {
    return <EmptyState text={dossier.vip.supported ? 'Нет данных' : 'Нет данных'} />;
  }
  if (tab === 'risk') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <InfoCell label="Профиль заблокирован" value={dossier.risk.profile_blocked ? 'да' : 'нет'} />
        <InfoCell label="Кошелёк заблокирован" value={dossier.risk.wallet_blocked ? 'да' : 'нет'} />
        <InfoCell label="Wallet status" value={String(dossier.risk.wallet_status ?? '—')} />
        <InfoCell label="Итог" value={dossier.risk.is_blocked ? 'blocked' : 'active'} />
      </div>
    );
  }
  if (tab === 'messages') {
    return <SectionTable section={dossier.messages} columns={['created_at', 'title', 'recipient_id']} />;
  }
  return <EmptyState text="Нет данных" />;
}

function SectionTable({
  section,
  columns,
  empty = 'Нет данных',
}: {
  section: { supported: boolean; rows: Record<string, unknown>[] };
  columns: string[];
  empty?: string;
}) {
  if (!section.supported || section.rows.length === 0) {
    return <EmptyState text={empty} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {columns.map((col) => (
              <th key={col} className="pb-2 pr-3">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, index) => (
            <tr key={String(row.id ?? index)} className="border-t border-slate-100">
              {columns.map((col) => (
                <td key={col} className="py-2 pr-3 text-ink-900">
                  {formatCell(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return formatBackofficeDateTime(value);
  }
  return String(value);
}

function formatMaybeDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  return formatBackofficeDateTime(value);
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-gray-500">{text}</p>;
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
      <p className="text-[11px] font-semibold text-gray-500 mb-1">{label}</p>
      <p className="font-semibold text-ink-900 break-all">{value}</p>
    </div>
  );
}
