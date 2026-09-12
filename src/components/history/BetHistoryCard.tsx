import { Check, Layers, Ticket } from 'lucide-react';
import type { BetHistoryEntry } from '../../types';
import { historyCardView } from '../../lib/betHistoryView';
import { BetStatusDisplay } from './BetStatusDisplay';

interface BetHistoryCardProps {
  bet: BetHistoryEntry;
  onOpen: () => void;
}

export function BetHistoryCard({ bet, onOpen }: BetHistoryCardProps) {
  const view = historyCardView(bet);

  return (
    <article
      className="np-card np-press cursor-pointer px-4 py-4"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--np-accent-soft)]">
            <Ticket className="h-5 w-5 text-[var(--np-accent)]" strokeWidth={2.2} />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--np-accent)] text-[var(--np-accent-ink)]">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] tabular-nums leading-none text-[var(--np-text-secondary)]">
              {view.dateTime} · № {view.couponNo}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <p className="text-[17px] font-extrabold leading-none text-[var(--np-text)]">{view.typeLabel}</p>
              {view.isExpress && (
                <span className="inline-flex items-center gap-1 text-[15px] font-bold text-[var(--np-text)]">
                  <Layers className="h-4 w-4 text-[var(--np-accent)]" strokeWidth={2.2} />
                  {view.legCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <dl className="mt-3.5 flex flex-col gap-1.5">
        <MetaRow label="Коэффициент:" value={view.odds} />
        <MetaRow label="Ставка:" value={view.stake} />
        <MetaRow label="Возможный выигрыш:" value={view.potential} />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[13px] text-[var(--np-text-muted)]">Статус:</dt>
          <dd>
            <BetStatusDisplay status={view.status} label={view.statusLabel} className="text-[14px]" />
          </dd>
        </div>
      </dl>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-[var(--np-text-muted)]">{label}</dt>
      <dd className="text-[15px] font-bold tabular-nums text-[var(--np-text)]">{value}</dd>
    </div>
  );
}
