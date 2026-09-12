import type { DetailsView } from '../../lib/betHistoryView';
import { BetStatusDisplay } from './BetStatusDisplay';

interface BetSummaryCardProps {
  view: DetailsView;
}

export function BetSummaryCard({ view }: BetSummaryCardProps) {
  const paid = view.status === 'won';

  return (
    <section
      className="np-panel overflow-hidden px-4 py-4"
      style={paid ? { background: 'linear-gradient(180deg, var(--np-surface-mint) 0%, var(--np-surface) 46%)' } : undefined}
    >
      <p className="text-[12px] font-medium tabular-nums text-[var(--np-text-secondary)]">{view.dateTime}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-[22px] font-extrabold leading-tight text-[var(--np-text)]">{view.typeLabel}</h2>
        <span className="text-[13px] font-semibold tabular-nums text-[var(--np-text-secondary)]">№ {view.couponNo}</span>
      </div>

      <div className="my-3 h-px bg-[var(--np-border)]" />

      <dl className="flex flex-col gap-2">
        <MetaRow label="Коэффициент:" value={view.odds} />
        <MetaRow label="Ставка:" value={view.stake} />
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[13px] text-[var(--np-text-muted)]">{view.payoutLabel}</dt>
          <dd className={`text-[16px] font-extrabold tabular-nums ${paid ? 'text-[var(--np-success)]' : 'text-[var(--np-text)]'}`}>
            {view.potential}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[13px] text-[var(--np-text-muted)]">Статус:</dt>
          <dd>
            <BetStatusDisplay
              status={view.status}
              label={view.statusLabel}
              withIcon
              className="text-[14px]"
            />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-[var(--np-text-muted)]">{label}</dt>
      <dd className="text-[16px] font-extrabold tabular-nums text-[var(--np-text)]">{value}</dd>
    </div>
  );
}
