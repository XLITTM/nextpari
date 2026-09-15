import { useCallback, useEffect, useState } from 'react';
import { fetchOwnerUsdtRates, saveOwnerUsdtRate, type OwnerUsdtRateRow } from './services';

const ORDER = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'];

export function OwnerUsdtRatesPanel() {
  const [rows, setRows] = useState<OwnerUsdtRateRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    const next = await fetchOwnerUsdtRates();
    setRows(next.sort((a, b) => ORDER.indexOf(a.targetCurrencyCode) - ORDER.indexOf(b.targetCurrencyCode)));
    setDraft(Object.fromEntries(next.map((row) => [row.targetCurrencyCode, row.rate == null ? '' : String(row.rate)])));
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить курсы');
    });
  }, [load]);

  const save = async (code: string, enabled: boolean) => {
    const rate = Number(draft[code]);
    setBusy(true);
    try {
      await saveOwnerUsdtRate({ targetCurrencyCode: code, rate, enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить курс');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="text-base font-bold text-gray-900">Курсы USDT</h3>
      <p className="mt-1 text-xs text-gray-500">Сколько единиц валюты игрок получит за 1 USDT</p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 space-y-2">
        {ORDER.map((code) => {
          const row = rows.find((item) => item.targetCurrencyCode === code);
          return (
            <div key={code} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
              <span className="w-28 text-sm font-bold">USDT → {code}</span>
              <input
                value={draft[code] ?? ''}
                onChange={(event) => setDraft((prev) => ({ ...prev, [code]: event.target.value }))}
                placeholder="не задан"
                className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              />
              <span className="text-xs text-gray-500">{row?.enabled ? 'включён' : 'выключен'}</span>
              <button type="button" disabled={busy} onClick={() => void save(code, true)} className="text-xs font-bold text-brand-700">
                Сохранить и включить
              </button>
              <button type="button" disabled={busy} onClick={() => void save(code, false)} className="text-xs font-semibold text-gray-500">
                Выключить
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
