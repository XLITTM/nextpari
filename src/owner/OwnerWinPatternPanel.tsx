import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchOwnerWinPatternSettings,
  saveOwnerWinPatternSettings,
  type OwnerWinPatternSettings,
} from './services';

function sourceLabel(source: string): string {
  if (source === 'SPORTS') return 'Спорт';
  if (source === 'OWNED_GAMES') return 'Свои игры NextPari';
  return source;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function SettingsCard({
  row,
  onSave,
  busy,
}: {
  row: OwnerWinPatternSettings;
  onSave: (next: OwnerWinPatternSettings) => Promise<void>;
  busy: boolean;
}) {
  const [form, setForm] = useState(row);
  useEffect(() => { setForm(row); }, [row]);

  return (
    <form
      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(form);
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-extrabold text-ink-900">{sourceLabel(form.source)}</h3>
        <label className="text-sm font-semibold flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Включено
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Сигналы только для расследования. Минимум выборки и суммы ставки обязательны, чтобы 1/1 не создавал флаг.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-gray-600">Период, часов
          <input type="number" min={24} max={2160} value={form.lookbackHours} onChange={(e) => setForm({ ...form, lookbackHours: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Мин. выборка
          <input type="number" min={10} value={form.minimumSettledCount} onChange={(e) => setForm({ ...form, minimumSettledCount: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Мин. сумма ставок
          <input type="number" min={100} step="0.01" value={form.minimumTotalStake} onChange={(e) => setForm({ ...form, minimumTotalStake: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Порог win-rate ({percent(form.winRateThreshold)})
          <input type="number" min={0.5} max={0.99} step="0.01" value={form.winRateThreshold} onChange={(e) => setForm({ ...form, winRateThreshold: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Порог прибыли
          <input type="number" min={100} step="0.01" value={form.netProfitThreshold} onChange={(e) => setForm({ ...form, netProfitThreshold: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-semibold text-gray-600">Порог ROI ({percent(form.roiThreshold)})
          <input type="number" min={0.1} max={10} step="0.01" value={form.roiThreshold} onChange={(e) => setForm({ ...form, roiThreshold: Number(e.target.value) })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
        </label>
      </div>
      <button type="submit" disabled={busy} className="text-sm font-bold px-3 py-2 rounded-xl bg-ink-900 text-white disabled:opacity-40">
        Сохранить
      </button>
    </form>
  );
}

export function OwnerWinPatternPanel() {
  const [rows, setRows] = useState<OwnerWinPatternSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchOwnerWinPatternSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить пороги');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (next: OwnerWinPatternSettings) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveOwnerWinPatternSettings(next);
      setNotice('Пороги сохранены. Автоограничение не применяется.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-ink-900">Анализ выигрышей</h2>
          <p className="text-sm text-gray-500 mt-0.5">Пороги расследования для спорта и своих игр. Служба безопасности видит значения, но не меняет их.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>
      {notice && <p className="text-sm font-semibold text-emerald-700 mb-3">{notice}</p>}
      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((row) => (
          <SettingsCard key={row.source} row={row} onSave={save} busy={busy} />
        ))}
      </div>
    </section>
  );
}
