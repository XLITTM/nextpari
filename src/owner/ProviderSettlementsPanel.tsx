import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  formatNullableProviderMoney,
  formatProviderCommercialTerms,
} from './providerSettlementDisplay';
import {
  fetchOwnerProviderGgrSummary,
  fetchOwnerProviderSettlements,
  formatTmtmCompact,
  type ProviderGgrSummary,
  type ProviderSettlementFilters,
  type ProviderSettlementList,
  type ProviderSettlementRow,
  type ProviderSettlementStatus,
} from './services';

function currentUtcMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function money(value: number, currency: string): string {
  if (currency === 'TMTM') return formatTmtmCompact(value);
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function nullableMoney(value: number | null, currency: string): string {
  return formatNullableProviderMoney(value, (amount) => money(amount, currency));
}

function commercialLabel(row: ProviderSettlementRow): string {
  return formatProviderCommercialTerms({
    commissionFee: row.commissionFee,
    commercialTerms: row.commercialTerms,
    formatMoney: (amount) => money(amount, row.currency),
  });
}

function statusLabel(status: string): string {
  if (status === 'open') return 'open';
  if (status === 'reconciled') return 'reconciled';
  if (status === 'invoiced') return 'invoiced';
  if (status === 'paid') return 'paid';
  if (status === 'dispute') return 'dispute';
  return status || '—';
}

function periodLabel(row: ProviderSettlementRow): string {
  const start = row.periodStart.slice(0, 10);
  const end = row.periodEnd.slice(0, 10);
  if (start && end) return `${start} → ${end}`;
  return start || '—';
}

function refundVoidRollback(row: ProviderSettlementRow): string {
  const total = row.refundTotal + row.voidTotal + row.rollbackTotal;
  return money(total, row.currency);
}

const STATUS_OPTIONS: Array<['' | ProviderSettlementStatus, string]> = [
  ['', 'Все статусы'],
  ['open', 'open'],
  ['reconciled', 'reconciled'],
  ['invoiced', 'invoiced'],
  ['paid', 'paid'],
  ['dispute', 'dispute'],
];

export function ProviderSettlementsPanel() {
  const [period, setPeriod] = useState<ProviderSettlementFilters['period']>('month');
  const [month, setMonth] = useState(currentUtcMonth);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [provider, setProvider] = useState('');
  const [product, setProduct] = useState<'' | 'sports' | 'casino'>('');
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState<'' | ProviderSettlementStatus>('');
  const [summary, setSummary] = useState<ProviderGgrSummary | null>(null);
  const [list, setList] = useState<ProviderSettlementList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const filters = useMemo<ProviderSettlementFilters>(() => ({
    period,
    month: period === 'month' ? month : null,
    from: period === 'custom' ? from : null,
    to: period === 'custom' ? to : null,
    provider: provider.trim() || null,
    product,
    currency: currency.trim() || null,
    status,
  }), [currency, from, month, period, product, provider, status, to]);

  const load = useCallback(async () => {
    if (period === 'custom' && (!from || !to)) return;
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextList] = await Promise.all([
        fetchOwnerProviderGgrSummary(filters),
        fetchOwnerProviderSettlements(filters),
      ]);
      setSummary(nextSummary);
      setList(nextList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить расчёты с провайдерами');
      setSummary(null);
      setList(null);
    } finally {
      setLoading(false);
    }
  }, [filters, from, period, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = list?.rows ?? [];
  const hasProviderData = summary?.hasProviderData === true || list?.hasProviderData === true;
  const zeroState = !loading && !error && !hasProviderData;

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-ink-900">Расчёты с провайдерами</h2>
            <p className="text-xs text-gray-500 mt-1 max-w-2xl">
              Внутренний GGR Nextpari считается по каноническому provider ledger отдельно от GGR,
              который сообщит провайдер. Сверка со statement/API будет добавлена позже.
              Планируемый провайдер — BetB2B. Коммерческие ставки не заданы, пока нет договора.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-ink-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              period === 'month' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-700'
            }`}
          >
            Месяц
          </button>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              period === 'custom' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-700'
            }`}
          >
            Свой период
          </button>
          {period === 'month' ? (
            <label className="text-xs font-semibold text-gray-500">
              Месяц (UTC)
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <>
              <label className="text-xs font-semibold text-gray-500">
                С
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-gray-500">
                По
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
            </>
          )}
          <label className="text-xs font-semibold text-gray-500">
            Провайдер
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="ключ"
              className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Продукт
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value as '' | 'sports' | 'casino')}
              className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Все</option>
              <option value="sports">sports</option>
              <option value="casino">casino</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Валюта
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="TMTM"
              className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Статус
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | ProviderSettlementStatus)}
              className="mt-1 block border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              {STATUS_OPTIONS.map(([id, label]) => (
                <option key={id || 'all'} value={id}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
        {loading && <p className="text-xs text-gray-400 mb-3">Загрузка расчётов…</p>}

        {zeroState && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-gray-600">
            <p className="font-semibold text-ink-800">Данные расчётов с провайдерами ещё не подключены.</p>
            <p className="mt-1">
              Отчётность и сверка с BetB2B появятся после подключения адаптера. Сейчас нет
              provider-транзакций, фейковые цифры не показываются.
            </p>
          </div>
        )}

        {summary && hasProviderData && summary.currencies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mb-4">
            {summary.currencies.map((bucket) => (
              <article key={bucket.currency} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-semibold text-gray-500">GGR Nextpari · {bucket.currency}</p>
                <p className="mt-1 text-lg font-black tabular-nums text-ink-900">
                  {money(bucket.internalGgr, bucket.currency)}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  ставки {money(bucket.stakeTotal, bucket.currency)} − выплаты {money(bucket.payoutTotal, bucket.currency)}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      {hasProviderData && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">Нет расчётов за выбранный период.</p>
          ) : (
            <table className="w-full text-xs text-left min-w-[1100px]">
              <thead>
                <tr className="text-gray-500 border-b border-slate-100">
                  <th className="py-2 pr-3 font-semibold">Провайдер</th>
                  <th className="py-2 pr-3 font-semibold">Период</th>
                  <th className="py-2 pr-3 font-semibold">Продукт</th>
                  <th className="py-2 pr-3 font-semibold">Валюта</th>
                  <th className="py-2 pr-3 font-semibold">Ставки</th>
                  <th className="py-2 pr-3 font-semibold">Выплаты</th>
                  <th className="py-2 pr-3 font-semibold">Refund / Void / Rollback</th>
                  <th className="py-2 pr-3 font-semibold">GGR Nextpari</th>
                  <th className="py-2 pr-3 font-semibold">GGR провайдера</th>
                  <th className="py-2 pr-3 font-semibold">Расхождение</th>
                  <th className="py-2 pr-3 font-semibold">Комиссия / сбор</th>
                  <th className="py-2 pr-3 font-semibold">К оплате</th>
                  <th className="py-2 font-semibold">Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.id ?? row.providerKey}-${row.product}-${row.currency}-${row.periodStart}`} className="border-b border-slate-50">
                    <td className="py-2 pr-3 font-semibold text-ink-800">{row.providerKey}</td>
                    <td className="py-2 pr-3 tabular-nums">{periodLabel(row)}</td>
                    <td className="py-2 pr-3">{row.product}</td>
                    <td className="py-2 pr-3">{row.currency}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(row.stakeTotal, row.currency)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(row.payoutTotal, row.currency)}</td>
                    <td className="py-2 pr-3 tabular-nums">{refundVoidRollback(row)}</td>
                    <td className="py-2 pr-3 tabular-nums font-semibold">{money(row.internalGgr, row.currency)}</td>
                    <td className="py-2 pr-3 tabular-nums">{nullableMoney(row.providerReportedGgr, row.currency)}</td>
                    <td className="py-2 pr-3 tabular-nums">{nullableMoney(row.discrepancy, row.currency)}</td>
                    <td className="py-2 pr-3">{commercialLabel(row)}</td>
                    <td className="py-2 pr-3 tabular-nums">{nullableMoney(row.amountDue, row.currency)}</td>
                    <td className="py-2">{statusLabel(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
