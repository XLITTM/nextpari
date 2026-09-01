import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchOwnerGameRtpReport,
  formatTmtmCompact,
  type GameRtpMetrics,
  type GameRtpPeriodKind,
  type GameRtpReport,
} from './services';

const TIMEZONES = ['Asia/Ashgabat', 'UTC'] as const;

function pct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function money(value: number): string {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="bg-slate-50 rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p> : null}
    </article>
  );
}

function MetricsGrid({ metrics }: { metrics: GameRtpMetrics }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      <Metric label="Поставлено" value={`${money(metrics.totalWagered)} TMTM`} />
      <Metric label="Выплаты" value={`${money(metrics.totalPayouts)} TMTM`} />
      <Metric label="GGR" value={`${money(metrics.ggr)} TMTM`} hint="ставка − выплаты" />
      <Metric label="Реализованный RTP" value={pct(metrics.realizedRtp)} hint={`hold ${pct(metrics.realizedHold)}`} />
    </div>
  );
}

export function GameRtpReportPanel() {
  const [period, setPeriod] = useState<GameRtpPeriodKind>('today');
  const [timezone, setTimezone] = useState<string>('Asia/Ashgabat');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<GameRtpReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchOwnerGameRtpReport({
        period,
        timezone,
        from: period === 'custom' ? from : null,
        to: period === 'custom' ? to : null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить RTP-отчёт');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [from, period, timezone, to]);

  useEffect(() => {
    if (period === 'custom' && (!from || !to)) return;
    void load();
  }, [load, period, from, to]);

  const periodLabel = useMemo(() => {
    if (!report) return 'Сегодня / один календарный день';
    if (report.period.kind === 'today') return `${report.period.from} · один день`;
    return `${report.period.from} → ${report.period.to}`;
  }, [report]);

  return (
    <section className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-ink-900">Дневной RTP / прибыль по играм</h3>
          <p className="text-xs text-gray-500 mt-0.5">{periodLabel} · {timezone}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['today', 'Сегодня'],
            ['7d', '7 дней'],
            ['30d', '30 дней'],
            ['custom', 'Свой период'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPeriod(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                period === id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-ink-700'
              }`}
            >
              {label}
            </button>
          ))}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
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
        </div>
      )}

      {error && <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>}
      {loading && <p className="text-xs text-gray-400 mb-3">Загрузка отчёта…</p>}

      {report && (
        <>
          <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
            Теоретический RTP контролируемых игр ≈ {(report.theoreticalRtp * 100).toFixed(1)}%.
            Календарный день — окно отчёта, а не повод менять исходы.
            Дневной hold колеблется из‑за дисперсии.
          </p>
          <MetricsGrid metrics={report.totals} />
          <p className="mt-2 text-[11px] text-gray-500">
            Раундов {report.totals.rounds} · выигрышных {report.totals.winningRounds}
            {loading ? '' : ` · ${formatTmtmCompact(report.totals.ggr)} GGR`}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-3 font-semibold">Игра</th>
                  <th className="py-2 pr-3 font-semibold">Ставки</th>
                  <th className="py-2 pr-3 font-semibold">Выплаты</th>
                  <th className="py-2 pr-3 font-semibold">Раунды</th>
                  <th className="py-2 pr-3 font-semibold">Выигрыши</th>
                  <th className="py-2 pr-3 font-semibold">GGR</th>
                  <th className="py-2 pr-3 font-semibold">RTP</th>
                  <th className="py-2 font-semibold">Hold</th>
                </tr>
              </thead>
              <tbody>
                {report.games.map((game) => (
                  <tr key={game.gameCode} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-bold text-ink-900">{game.displayName}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(game.totalWagered)}</td>
                    <td className="py-2 pr-3 tabular-nums">{money(game.totalPayouts)}</td>
                    <td className="py-2 pr-3 tabular-nums">{game.rounds}</td>
                    <td className="py-2 pr-3 tabular-nums">{game.winningRounds}</td>
                    <td className="py-2 pr-3 tabular-nums font-semibold">{money(game.ggr)}</td>
                    <td className="py-2 pr-3 tabular-nums">{pct(game.realizedRtp)}</td>
                    <td className="py-2 tabular-nums">{pct(game.realizedHold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.days.length > 1 && (
            <div className="mt-4 overflow-x-auto">
              <p className="text-xs font-bold text-ink-800 mb-2">По календарным дням</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3 font-semibold">День</th>
                    <th className="py-2 pr-3 font-semibold">Ставки</th>
                    <th className="py-2 pr-3 font-semibold">GGR</th>
                    <th className="py-2 pr-3 font-semibold">RTP</th>
                    <th className="py-2 font-semibold">Hold</th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.map((day) => (
                    <tr key={day.date} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-semibold">{day.date}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(day.totals.totalWagered)}</td>
                      <td className="py-2 pr-3 tabular-nums">{money(day.totals.ggr)}</td>
                      <td className="py-2 pr-3 tabular-nums">{pct(day.totals.realizedRtp)}</td>
                      <td className="py-2 tabular-nums">{pct(day.totals.realizedHold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
