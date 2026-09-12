import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  HISTORY_PERIOD_PRESETS,
  compareIsoDates,
  formatHistoryDay,
  historyPeriodLabel,
  isSelectableHistoryDate,
  parseLocalIsoDate,
  toLocalIsoDate,
  validateCustomHistoryRange,
  type HistoryPeriodSelection,
} from '../../lib/historyPeriodFilter';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

interface HistoryPeriodSheetProps {
  open: boolean;
  value: HistoryPeriodSelection;
  onApply: (next: HistoryPeriodSelection) => void;
  onClose: () => void;
  now?: number;
}

export function HistoryPeriodSheet({
  open,
  value,
  onApply,
  onClose,
  now = Date.now(),
}: HistoryPeriodSheetProps) {
  const todayIso = toLocalIsoDate(now);
  const [draft, setDraft] = useState<HistoryPeriodSelection>(value);
  const [picking, setPicking] = useState<'from' | 'to'>('from');
  const [cursor, setCursor] = useState(() => {
    const seed = parseLocalIsoDate(value.to || value.from || todayIso) ?? parseLocalIsoDate(todayIso)!;
    return { y: seed.y, m: seed.m };
  });

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setPicking(value.kind === 'custom' && value.from && !value.to ? 'to' : 'from');
    const seed = parseLocalIsoDate(value.to || value.from || todayIso) ?? parseLocalIsoDate(todayIso)!;
    setCursor({ y: seed.y, m: seed.m });
  }, [open, value, todayIso]);

  if (!open) return null;

  const customValid = validateCustomHistoryRange(draft.from, draft.to, now);
  const canApply = draft.kind !== 'custom' || customValid.ok;

  const apply = () => {
    if (!canApply) return;
    onApply(draft.kind === 'custom' ? { kind: 'custom', from: draft.from, to: draft.to } : { kind: draft.kind });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Закрыть" onClick={onClose} />
      <section className="np-panel relative z-10 w-full max-w-[720px] rounded-t-[24px] rounded-b-none px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-[var(--np-text)]">История за период</h2>
          <button
            type="button"
            onClick={onClose}
            className="np-press flex h-9 w-9 items-center justify-center text-[var(--np-text-secondary)]"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {HISTORY_PERIOD_PRESETS.map((preset) => {
            const active = draft.kind === preset.kind;
            return (
              <button
                key={preset.kind}
                type="button"
                onClick={() => setDraft({ kind: preset.kind })}
                className={`np-press h-12 rounded-[16px] px-4 text-left text-[15px] font-semibold ${
                  active
                    ? 'bg-[var(--np-accent)] text-[var(--np-accent-ink)]'
                    : 'bg-[var(--np-surface-muted)] text-[var(--np-text)]'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setDraft((current) => ({
                kind: 'custom',
                from: current.kind === 'custom' ? current.from : undefined,
                to: current.kind === 'custom' ? current.to : undefined,
              }));
              setPicking('from');
            }}
            className={`np-press h-12 rounded-[16px] px-4 text-left text-[15px] font-semibold ${
              draft.kind === 'custom'
                ? 'bg-[var(--np-accent)] text-[var(--np-accent-ink)]'
                : 'bg-[var(--np-surface-muted)] text-[var(--np-text)]'
            }`}
          >
            Свой период
          </button>
        </div>

        {draft.kind === 'custom' && (
          <CustomRange
            draft={draft}
            picking={picking}
            cursor={cursor}
            todayIso={todayIso}
            now={now}
            onPicking={setPicking}
            onCursor={setCursor}
            onDraft={setDraft}
          />
        )}

        <button
          type="button"
          disabled={!canApply}
          onClick={apply}
          className="np-press mt-4 h-12 w-full rounded-2xl bg-[var(--np-accent)] text-[15px] font-extrabold text-[var(--np-accent-ink)] shadow-[var(--np-glow)] disabled:opacity-40"
        >
          Показать историю
        </button>
        <p className="mt-2 text-center text-[12px] text-[var(--np-text-muted)]">
          {draft.kind === 'custom'
            ? customValid.ok
              ? historyPeriodLabel(draft)
              : 'Выберите даты от и до'
            : HISTORY_PERIOD_PRESETS.find((item) => item.kind === draft.kind)?.label}
        </p>
      </section>
    </div>
  );
}

function CustomRange({
  draft,
  picking,
  cursor,
  todayIso,
  now,
  onPicking,
  onCursor,
  onDraft,
}: {
  draft: HistoryPeriodSelection;
  picking: 'from' | 'to';
  cursor: { y: number; m: number };
  todayIso: string;
  now: number;
  onPicking: (next: 'from' | 'to') => void;
  onCursor: (next: { y: number; m: number }) => void;
  onDraft: (next: HistoryPeriodSelection) => void;
}) {
  const days = useMemo(() => monthCells(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const prevMonth = shiftMonth(cursor, -1);
  const nextMonth = shiftMonth(cursor, 1);
  const nextDisabled = `${nextMonth.y}-${String(nextMonth.m).padStart(2, '0')}` > todayIso.slice(0, 7);

  const pick = (iso: string) => {
    if (!isSelectableHistoryDate(iso, now)) return;
    if (picking === 'from') {
      const nextTo = draft.to && compareIsoDates(iso, draft.to) > 0 ? undefined : draft.to;
      onDraft({ kind: 'custom', from: iso, to: nextTo });
      onPicking('to');
      return;
    }
    if (draft.from && compareIsoDates(iso, draft.from) < 0) return;
    onDraft({ kind: 'custom', from: draft.from, to: iso });
  };

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2">
        <DateField
          label="Дата от"
          value={draft.from}
          active={picking === 'from'}
          onClick={() => onPicking('from')}
        />
        <DateField
          label="Дата до"
          value={draft.to}
          active={picking === 'to'}
          onClick={() => onPicking('to')}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          className="np-press flex h-9 w-9 items-center justify-center text-[var(--np-accent)]"
          onClick={() => onCursor(prevMonth)}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
        <p className="text-[15px] font-bold text-[var(--np-text)]">
          {MONTHS[cursor.m - 1]} {cursor.y}
        </p>
        <button
          type="button"
          disabled={nextDisabled}
          className="np-press flex h-9 w-9 items-center justify-center text-[var(--np-accent)] disabled:opacity-30"
          onClick={() => onCursor(nextMonth)}
          aria-label="Следующий месяц"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1 text-center text-[11px] font-semibold text-[var(--np-text-muted)]">
            {day}
          </div>
        ))}
        {days.map((iso, index) => {
          if (!iso) return <div key={`e-${index}`} />;
          const disabled = !isDayEnabled(iso, draft, picking, now);
          const selected = iso === draft.from || iso === draft.to;
          const inRange = isInRange(iso, draft.from, draft.to);
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => pick(iso)}
              className={`np-press h-9 rounded-full text-[13px] font-semibold ${
                selected
                  ? 'bg-[var(--np-accent)] text-[var(--np-accent-ink)]'
                  : inRange
                    ? 'bg-[var(--np-accent-soft)] text-[var(--np-text)]'
                    : 'text-[var(--np-text)]'
              } disabled:opacity-25`}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="np-press mt-2 w-full py-2 text-center text-[13px] font-semibold text-[var(--np-text-secondary)]"
        onClick={() => {
          onDraft({ kind: 'custom' });
          onPicking('from');
        }}
      >
        Сбросить даты
      </button>
    </div>
  );
}

function DateField({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`np-control np-press h-14 px-3 text-left ${active ? 'border-[var(--np-accent)]' : ''}`}
    >
      <span className="block text-[11px] text-[var(--np-text-muted)]">{label}</span>
      <span className="text-[14px] font-bold text-[var(--np-text)]">{value ? formatHistoryDay(value) : '—'}</span>
    </button>
  );
}

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month - 1, 1);
  const weekday = (first.getDay() + 6) % 7;
  const count = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: weekday }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return cells;
}

function shiftMonth(cursor: { y: number; m: number }, delta: number) {
  const date = new Date(cursor.y, cursor.m - 1 + delta, 1);
  return { y: date.getFullYear(), m: date.getMonth() + 1 };
}

function isInRange(iso: string, from?: string, to?: string): boolean {
  if (!from || !to) return false;
  return compareIsoDates(iso, from) >= 0 && compareIsoDates(iso, to) <= 0;
}

function isDayEnabled(
  iso: string,
  draft: HistoryPeriodSelection,
  picking: 'from' | 'to',
  now: number,
): boolean {
  if (!isSelectableHistoryDate(iso, now)) return false;
  if (picking === 'to' && draft.from && compareIsoDates(iso, draft.from) < 0) return false;
  return true;
}
