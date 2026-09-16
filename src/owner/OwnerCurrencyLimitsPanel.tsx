import { useCallback, useEffect, useState } from 'react';
import {
  fetchOwnerCurrencyLimits,
  saveOwnerCurrencyLimits,
  setOwnerCurrencySportsEnabled,
  type OwnerCurrencyLimitRow,
} from './services';

const ORDER = ['TMT', 'USD', 'TRY', 'UZS', 'RUB', 'KZT'];

const EMPTY_DRAFT = {
  minStake: '',
  maxStake: '',
  maxPayout: '',
  minDeposit: '',
  minWithdrawal: '',
};

type LimitDraft = typeof EMPTY_DRAFT;

function moneyText(value: string | null | undefined): string {
  return value == null || value === '' ? '' : String(value);
}

export function OwnerCurrencyLimitsPanel() {
  const [rows, setRows] = useState<OwnerCurrencyLimitRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, LimitDraft>>({});

  const load = useCallback(async () => {
    setError('');
    const next = await fetchOwnerCurrencyLimits();
    const sorted = next.sort((a, b) => ORDER.indexOf(a.currency) - ORDER.indexOf(b.currency));
    setRows(sorted);
    setDraft(Object.fromEntries(sorted.map((row) => [row.currency, {
      minStake: moneyText(row.minStake),
      maxStake: moneyText(row.maxStake),
      maxPayout: moneyText(row.maxPayout),
      minDeposit: moneyText(row.minDeposit),
      minWithdrawal: moneyText(row.minWithdrawal),
    }])));
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить лимиты валют');
    });
  }, [load]);

  const patchDraft = (code: string, field: keyof LimitDraft, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [code]: { ...(prev[code] ?? EMPTY_DRAFT), [field]: value },
    }));
  };

  const saveLimits = async (code: string) => {
    const values = draft[code] ?? EMPTY_DRAFT;
    setBusy(true);
    try {
      await saveOwnerCurrencyLimits({
        currency: code,
        minStake: values.minStake,
        maxStake: values.maxStake,
        maxPayout: values.maxPayout,
        minDeposit: values.minDeposit,
        minWithdrawal: values.minWithdrawal,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить лимиты');
    } finally {
      setBusy(false);
    }
  };

  const toggleSports = async (code: string, enabled: boolean) => {
    setBusy(true);
    try {
      await setOwnerCurrencySportsEnabled({ currency: code, enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить спорт');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="text-base font-bold text-gray-900">Лимиты валют</h3>
      <p className="mt-1 text-xs text-gray-500">
        Значения задаются владельцем отдельно для каждой валюты. Курсовая конвертация не используется.
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {ORDER.map((code) => {
          const row = rows.find((item) => item.currency === code);
          const values = draft[code] ?? EMPTY_DRAFT;
          return (
            <article key={code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-ink-900">{code}</p>
                  <p className="text-xs text-gray-500">
                    {row?.displayNameRu || '—'}
                    {row?.symbol ? ` · ${row.symbol}` : ''}
                  </p>
                </div>
                <span className={`text-xs font-bold ${row?.limitsConfigured ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {row?.limitsConfigured ? 'Лимиты настроены' : 'Не настроены'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold text-gray-500">
                  Минимальная ставка
                  <input
                    value={values.minStake}
                    onChange={(event) => patchDraft(code, 'minStake', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500">
                  Максимальная ставка
                  <input
                    value={values.maxStake}
                    onChange={(event) => patchDraft(code, 'maxStake', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500">
                  Максимальная выплата
                  <input
                    value={values.maxPayout}
                    onChange={(event) => patchDraft(code, 'maxPayout', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500">
                  Минимальное пополнение
                  <input
                    value={values.minDeposit}
                    onChange={(event) => patchDraft(code, 'minDeposit', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-500 sm:col-span-2">
                  Минимальный вывод
                  <input
                    value={values.minWithdrawal}
                    onChange={(event) => patchDraft(code, 'minWithdrawal', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveLimits(code)}
                  className="text-xs font-bold text-brand-700"
                >
                  Сохранить лимиты
                </button>
                <span className="text-xs text-gray-500">
                  Спорт {row?.sportsEnabled ? 'включён' : 'выключен'}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleSports(code, !(row?.sportsEnabled === true))}
                  className="text-xs font-semibold text-gray-700"
                >
                  {row?.sportsEnabled ? 'Выключить спорт' : 'Включить спорт'}
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-600">
                {code === 'TMT'
                  ? 'Собственные игры: текущее поведение TMT сохраняется.'
                  : 'Будет доступно после завершения настройки математики собственных игр.'}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
