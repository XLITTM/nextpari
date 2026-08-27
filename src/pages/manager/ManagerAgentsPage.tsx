import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Snowflake, Unlock, X } from 'lucide-react';
import {
  createBackofficeCashier,
  formatTmtmCompact,
  subscribeNetworkSync,
  type ManagerSession,
} from '../../lib/backoffice';
import {
  collectAgentToManager,
  creditAgentFromLimit,
  toggleAgentBlockStatus,
  useBackofficeStore,
} from '../../stores/backofficeStore';

export function ManagerAgentsPage({
  session,
  onNotice,
}: {
  session: ManagerSession;
  onNotice: (value: string) => void;
}) {
  const hydrate = useBackofficeStore((s) => s.hydrate);
  const cashiers = useBackofficeStore((s) => s.cashiers.filter((row) => row.managerId === session.id));
  const limit = useBackofficeStore((s) => s.managerLimit(session.id));
  const [createOpen, setCreateOpen] = useState(false);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [collectId, setCollectId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    hydrate();
    return subscribeNetworkSync(() => hydrate());
  }, [hydrate]);

  const topupTarget = cashiers.find((row) => row.id === topupId) ?? null;
  const collectTarget = cashiers.find((row) => row.id === collectId) ?? null;

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Мои кассы и кассиры</h2>
          <p className="text-sm text-gray-500 mt-0.5">{cashiers.length} точек · лимит {formatTmtmCompact(limit)}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-ink-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Добавить кассира / точку
        </button>
      </div>
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Имя точки / кассира</th>
              <th className="px-4 py-3">Адрес точки</th>
              <th className="px-4 py-3 text-right">Остаток в кассе</th>
              <th className="px-4 py-3 text-right">Доход за смену</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {cashiers.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-bold text-ink-900">{row.pointName}</p>
                  <p className="text-xs text-gray-500">{row.fullName} · {row.login}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">{row.city}</td>
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
                  {row.blockedBy === 'owner' && !row.isActive && (
                    <p className="text-[10px] font-bold text-red-500 mt-1">Блок владельца</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTopupId(row.id)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center gap-1"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      Пополнить баланс кассы
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollectId(row.id)}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 inline-flex items-center gap-1"
                    >
                      <ArrowUpFromLine className="w-3.5 h-3.5" />
                      Инкассация
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (row.blockedBy === 'owner' && !row.isActive) {
                          setError('Касса заблокирована владельцем. Разблокировать может только владелец.');
                          return;
                        }
                        try {
                          const next = toggleAgentBlockStatus(row.id, 'manager');
                          onNotice(next.isActive ? `Касса ${row.fullName} разблокирована` : `Касса ${row.fullName} заблокирована`);
                          setError('');
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Ошибка блокировки');
                        }
                      }}
                      className={`text-xs font-bold px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 ${
                        row.isActive ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.isActive ? <Snowflake className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      {row.isActive ? 'Блокировать' : 'Разблокировать'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {cashiers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">Касс в вашей сети пока нет</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {createOpen && (
        <CreateCashierModal
          limit={limit}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (form) => {
            if (form.floatBalance > limit) throw new Error('Стартовый баланс не может превышать доступный лимит');
            await createBackofficeCashier(session, form);
            hydrate();
            onNotice(`Касса ${form.pointName} создана`);
            setCreateOpen(false);
          }}
        />
      )}
      {topupTarget && (
        <AmountModal
          title={`Пополнить кассу · ${topupTarget.fullName}`}
          hint={`Спишется с лимита менеджера. Доступно: ${formatTmtmCompact(limit)}`}
          confirm="Перевести в кассу"
          onClose={() => setTopupId(null)}
          onSubmit={(amount) => {
            creditAgentFromLimit(session.id, topupTarget.id, amount);
            onNotice(`Касса ${topupTarget.fullName} пополнена на ${formatTmtmCompact(amount)}`);
            setTopupId(null);
          }}
        />
      )}
      {collectTarget && (
        <AmountModal
          title={`Инкассация · ${collectTarget.fullName}`}
          hint={`Забрать в баланс менеджера. В кассе: ${formatTmtmCompact(collectTarget.floatBalance)}`}
          confirm="Забрать в лимит"
          onClose={() => setCollectId(null)}
          onSubmit={(amount) => {
            collectAgentToManager(session.id, collectTarget.id, amount);
            onNotice(`Инкассация ${formatTmtmCompact(amount)} зачислена в лимит менеджера`);
            setCollectId(null);
          }}
        />
      )}
    </section>
  );
}

function CreateCashierModal({
  limit,
  onClose,
  onSubmit,
}: {
  limit: number;
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
  const [pointName, setPointName] = useState('');
  const [city, setCity] = useState('');
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [floatBalance, setFloatBalance] = useState('1000');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <Modal title="Новый кассир / точка" onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">Доступный лимит: <span className="font-extrabold text-ink-900">{formatTmtmCompact(limit)}</span></p>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Название точки" value={pointName} onChange={setPointName} placeholder="Точка №14 · ул. Махтумкули" />
      <Field label="Адрес" value={city} onChange={setCity} placeholder="Ашхабад" />
      <Field label="Логин кассира" value={login} onChange={setLogin} placeholder="agent04" />
      <Field label="Пароль" value={pin} onChange={setPin} placeholder="1234" />
      <Field label="Стартовый баланс" value={floatBalance} onChange={setFloatBalance} placeholder="1000" />
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
              fullName: pointName.trim() || login.trim(),
              city,
              pointName,
              floatBalance: Number(floatBalance),
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось создать кассу');
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

function AmountModal({
  title,
  hint,
  confirm,
  onClose,
  onSubmit,
}: {
  title: string;
  hint: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">{hint}</p>
      {error && <p className="text-xs font-semibold text-red-600 mb-3">{error}</p>}
      <Field label="Сумма" value={amount} onChange={setAmount} placeholder="500" />
      <button
        type="button"
        onClick={() => {
          const value = Number(amount);
          if (!(value > 0)) {
            setError('Введите сумму');
            return;
          }
          try {
            onSubmit(value);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка операции');
          }
        }}
        className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl mt-2"
      >
        {confirm}
      </button>
    </Modal>
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
