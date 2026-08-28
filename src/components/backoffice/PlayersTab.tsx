import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban, Search, RefreshCw, Unlock, Wallet, X, Users,
} from 'lucide-react';
import { SendPlayerMessageForm } from './SendPlayerMessageForm';
import type { ManagerSession } from '../../lib/backoffice';
import {
  adjustPlayerBalance,
  fetchPlayerDossier,
  fetchPlayers,
  formatPlayerBalance,
  formatPlayerMoney,
  playerMatchesQuery,
  setPlayerBlocked,
  sportStatusClass,
  sportStatusLabel,
  formatBackofficeDateTime,
  type PlayerDossier,
  type PlayerListItem,
} from '../../lib/players';

type ProfileTab = 'summary' | 'games' | 'sports' | 'transactions';

export function PlayersTab({
  session,
  onNotice,
  showMessageForm = true,
}: {
  session: ManagerSession;
  onNotice: (value: string) => void;
  showMessageForm?: boolean;
}) {
  const [rows, setRows] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchPlayers(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить игроков');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => rows.filter((row) => playerMatchesQuery(row, query)),
    [rows, query],
  );

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Игроки</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {visible.length} из {rows.length} профилей · поиск по ID, телефону или email
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

      {showMessageForm && (
        <div className="mb-5">
          <SendPlayerMessageForm />
        </div>
      )}

      <div className="mb-4 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ID игрока, телефон или email"
          className="flex-1 bg-transparent py-3 text-sm font-semibold outline-none"
        />
      </div>

      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">ID игрока</th>
                <th className="px-4 py-3">Контакты</th>
                <th className="px-4 py-3 text-right">Баланс</th>
                <th className="px-4 py-3 text-right">Оборот</th>
                <th className="px-4 py-3 text-right">GGR / Профит</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="inline-flex items-center font-extrabold text-[12px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      #{row.publicId}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink-900">{row.phone || '—'}</p>
                    <p className="text-xs text-gray-400">{row.email || 'нет email'}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold tabular-nums text-ink-900">
                    {formatPlayerBalance(row)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatPlayerMoney(row.turnover, 'TMTM')}
                  </td>
                  <td className={`px-4 py-3 text-right font-extrabold tabular-nums ${
                    row.ggr >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {row.ggr >= 0 ? '+' : ''}{formatPlayerMoney(row.ggr, 'TMTM')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                      row.blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                    }`}>
                      {row.blocked ? 'Заблокирован' : 'Активен'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatBackofficeDateTime(row.registeredAt)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    {query.trim() ? 'Игроки по запросу не найдены' : 'Профили игроков пока не загружены'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <PlayerProfileModal
          session={session}
          playerId={selectedId}
          canManage={session.role === 'superadmin'}
          onClose={() => setSelectedId(null)}
          onNotice={onNotice}
          onChanged={load}
        />
      )}
    </section>
  );
}

function PlayerProfileModal({
  session,
  playerId,
  canManage,
  onClose,
  onNotice,
  onChanged,
}: {
  session: ManagerSession;
  playerId: string;
  canManage: boolean;
  onClose: () => void;
  onNotice: (value: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [dossier, setDossier] = useState<PlayerDossier | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>('summary');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDossier(await fetchPlayerDossier(session, playerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть досье');
    } finally {
      setLoading(false);
    }
  }, [session, playerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const player = dossier?.player;

  const toggleBlock = async () => {
    if (!player) return;
    const next = !player.blocked;
    const ok = window.confirm(
      next
        ? `Заблокировать игрока #${player.publicId}?`
        : `Разблокировать игрока #${player.publicId}?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await setPlayerBlocked(session, player, next);
      onNotice(next ? `Игрок #${player.publicId} заблокирован` : `Игрок #${player.publicId} разблокирован`);
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
              <h3 className="text-lg font-extrabold text-ink-900">
                {player ? `#${player.publicId}` : 'Загрузка…'}
              </h3>
              {player && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  player.blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                }`}>
                  {player.blocked ? 'Заблокирован' : 'Активен'}
                </span>
              )}
            </div>
            {player && (
              <p className="text-xs text-gray-500 mt-1">
                {player.phone || 'телефон не указан'} · {player.email || 'email не указан'}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-1 border-b border-slate-200 overflow-x-auto">
          <TabBtn active={tab === 'summary'} onClick={() => setTab('summary')} label="Сводка" />
          <TabBtn active={tab === 'games'} onClick={() => setTab('games')} label="Мини-игры и Казино" />
          <TabBtn active={tab === 'sports'} onClick={() => setTab('sports')} label="Ставки на спорт" />
          <TabBtn active={tab === 'transactions'} onClick={() => setTab('transactions')} label="Транзакции" />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
          {loading && <p className="text-sm text-gray-500">Загрузка досье…</p>}
          {dossier && tab === 'summary' && <SummaryTab dossier={dossier} />}
          {dossier && tab === 'games' && <GamesTab rounds={dossier.games} />}
          {dossier && tab === 'sports' && <SportsTab bets={dossier.sports} />}
          {dossier && tab === 'transactions' && <TxTab rows={dossier.transactions} />}
        </div>

        {canManage && player && (
          <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleBlock()}
              className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl disabled:opacity-50 ${
                player.blocked ? 'bg-slate-200 text-slate-800' : 'bg-red-50 text-red-600'
              }`}
            >
              {player.blocked ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              {player.blocked ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAdjustOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              Корректировка баланса
            </button>
          </div>
        )}
      </div>

      {adjustOpen && player && (
        <AdjustBalanceModal
          player={player}
          onClose={() => setAdjustOpen(false)}
          onSubmit={async (amount, note) => {
            await adjustPlayerBalance(session, player, amount, note);
            onNotice(`Баланс #${player.publicId} скорректирован на ${formatPlayerMoney(amount, 'TMTM')}`);
            setAdjustOpen(false);
            await load();
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-bold rounded-t-lg whitespace-nowrap ${
        active ? 'text-brand-700 bg-brand-50' : 'text-gray-500 hover:text-ink-900'
      }`}
    >
      {label}
    </button>
  );
}

function SummaryTab({ dossier }: { dossier: PlayerDossier }) {
  const { player, summary } = dossier;
  const cards = [
    { label: 'Суммарные депозиты', value: formatPlayerMoney(summary.deposits, 'TMTM') },
    { label: 'Выплаты', value: formatPlayerMoney(summary.payouts, 'TMTM') },
    {
      label: 'Профит с игрока',
      value: `${summary.profit >= 0 ? '+' : ''}${formatPlayerMoney(summary.profit, 'TMTM')}`,
      tone: summary.profit >= 0 ? 'text-emerald-600' : 'text-red-600',
    },
    {
      label: 'Последний вход',
      value: summary.lastLoginAt ? formatBackofficeDateTime(summary.lastLoginAt) : 'нет данных',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <article key={card.label} className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">{card.label}</p>
            <p className={`text-lg font-black tabular-nums ${card.tone ?? 'text-ink-900'}`}>{card.value}</p>
          </article>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <InfoCell label="Текущий баланс" value={formatPlayerBalance(player)} />
        <InfoCell label="Оборот ставок" value={formatPlayerMoney(player.turnover, 'TMTM')} />
        <InfoCell label="Дата регистрации" value={formatBackofficeDateTime(player.registeredAt)} />
      </div>
    </div>
  );
}

function GamesTab({ rounds }: { rounds: PlayerDossier['games'] }) {
  if (!rounds.length) {
    return <EmptyState text="История мини-игр и казино пока пуста" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="pb-2">Игра</th>
            <th className="pb-2 text-right">Ставка</th>
            <th className="pb-2 text-right">Множитель</th>
            <th className="pb-2">Результат</th>
            <th className="pb-2">Дата</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="py-2.5 font-semibold text-ink-900">{row.game}</td>
              <td className="py-2.5 text-right tabular-nums">{formatPlayerMoney(row.stake, 'TMTM')}</td>
              <td className="py-2.5 text-right tabular-nums font-bold">x{row.multiplier.toFixed(2)}</td>
              <td className="py-2.5">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                  row.result === 'win' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  {row.result === 'win'
                    ? `Выигрыш ${formatPlayerMoney(row.payout, 'TMTM')}`
                    : 'Проигрыш'}
                </span>
              </td>
              <td className="py-2.5 text-gray-500 whitespace-nowrap">{formatBackofficeDateTime(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SportsTab({ bets }: { bets: PlayerDossier['sports'] }) {
  if (!bets.length) {
    return <EmptyState text="Купонов на спорт пока нет" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="pb-2">Купон</th>
            <th className="pb-2">Тип</th>
            <th className="pb-2 text-right">Коэффициент</th>
            <th className="pb-2 text-right">Ставка</th>
            <th className="pb-2">Статус</th>
            <th className="pb-2">Дата</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="py-2.5">
                <p className="font-bold text-ink-900">№ {row.ticketCode || row.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-400">{row.selection || '—'}</p>
              </td>
              <td className="py-2.5 font-semibold">{row.type === 'express' ? 'Экспресс' : 'Ординар'}</td>
              <td className="py-2.5 text-right tabular-nums font-bold">{row.odds.toFixed(2)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatPlayerMoney(row.amount, 'TMTM')}</td>
              <td className="py-2.5">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${sportStatusClass(row.status)}`}>
                  {sportStatusLabel(row.status)}
                </span>
              </td>
              <td className="py-2.5 text-gray-500 whitespace-nowrap">{formatBackofficeDateTime(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TxTab({ rows }: { rows: PlayerDossier['transactions'] }) {
  if (!rows.length) {
    return <EmptyState text="Транзакций Mobcash и корректировок пока нет" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="pb-2">Операция</th>
            <th className="pb-2">Агент / касса</th>
            <th className="pb-2 text-right">Сумма</th>
            <th className="pb-2">Статус</th>
            <th className="pb-2">Дата</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="py-2.5">
                <p className="font-semibold text-ink-900">{row.title}</p>
                <p className="text-xs text-gray-400">{row.receiptCode || row.type}</p>
              </td>
              <td className="py-2.5 text-gray-700">
                {row.cashierLabel || '—'}
                {row.cashierId && (
                  <span className="block text-[11px] text-gray-400 font-mono">ID {row.cashierId.slice(0, 8)}</span>
                )}
              </td>
              <td className={`py-2.5 text-right font-extrabold tabular-nums ${
                row.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {row.amount >= 0 ? '+' : ''}{formatPlayerMoney(row.amount, 'TMTM')}
              </td>
              <td className="py-2.5 text-xs font-bold text-gray-500">
                {row.status === 'completed' ? 'Успешно' : row.status}
              </td>
              <td className="py-2.5 text-gray-500 whitespace-nowrap">{formatBackofficeDateTime(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdjustBalanceModal({
  player,
  onClose,
  onSubmit,
}: {
  player: PlayerListItem;
  onClose: () => void;
  onSubmit: (amount: number, note: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-extrabold text-ink-900">Корректировка · #{player.publicId}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Текущий баланс: {formatPlayerBalance(player)}</p>
        {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
        <label className="block mb-3">
          <span className="text-xs font-semibold text-gray-500 mb-1.5 block">Сумма (+ начисление / − списание)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100 или -50"
            className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
          />
        </label>
        <label className="block mb-3">
          <span className="text-xs font-semibold text-gray-500 mb-1.5 block">Комментарий</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Причина корректировки"
            className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const value = Number(amount.replace(',', '.'));
            if (!Number.isFinite(value) || value === 0) {
              setError('Введите сумму');
              return;
            }
            setSaving(true);
            setError('');
            try {
              await onSubmit(value, note);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Не удалось скорректировать баланс');
            } finally {
              setSaving(false);
            }
          }}
          className="w-full bg-ink-900 text-white font-bold py-3 rounded-xl mt-2 disabled:opacity-50"
        >
          {saving ? 'Сохранение…' : 'Применить корректировку'}
        </button>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-bold text-ink-900">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-500 py-8 text-center">{text}</p>;
}
