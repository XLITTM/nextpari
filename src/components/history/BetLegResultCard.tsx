import { SportIcon } from '../SportIcon';
import { TeamLogo } from '../TeamLogo';
import { sportLabel } from '../../lib/betTicket';
import type { DetailsLegView } from '../../lib/betHistoryView';
import { BetStatusDisplay } from './BetStatusDisplay';

interface BetLegResultCardProps {
  leg: DetailsLegView;
}

export function BetLegResultCard({ leg }: BetLegResultCardProps) {
  const leagueLine = [sportLabel(leg.sport), leg.league].filter(Boolean).join('. ') || 'Событие';
  const { main, extra } = splitExistingScore(leg.score);

  return (
    <article className="np-card px-4 py-4">
      <div className="flex items-start gap-2">
        <SportIcon sport={leg.sport || 'football'} className="mt-0.5 h-5 w-5 shrink-0 text-[var(--np-accent)]" />
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-snug text-[var(--np-text-secondary)]">{leagueLine}</p>
          {leg.startTime && (
            <p className="mt-0.5 text-[12px] tabular-nums text-[var(--np-text-muted)]">{leg.startTime}</p>
          )}
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center justify-end gap-2">
          <p className="break-words text-right text-[14px] font-extrabold leading-tight text-[var(--np-text)]">
            {leg.homeTeam}
          </p>
          <TeamLogo teamName={leg.homeTeam} logo={leg.homeLogo} size="md" />
        </div>
        <div className="min-w-[4.5rem] px-1 text-center">
          {main ? (
            <p className="text-[26px] font-black tabular-nums leading-none text-[var(--np-text)]">{main}</p>
          ) : (
            <p className="text-[18px] font-bold text-[var(--np-text-muted)]">:</p>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-start gap-2">
          <TeamLogo teamName={leg.awayTeam} logo={leg.awayLogo} size="md" />
          <p className="break-words text-left text-[14px] font-extrabold leading-tight text-[var(--np-text)]">
            {leg.awayTeam}
          </p>
        </div>
      </div>
      {extra && (
        <p className="mt-1.5 text-center text-[11px] tabular-nums text-[var(--np-text-muted)]">{extra}</p>
      )}

      <div className="my-3 h-px bg-[var(--np-border)]" />

      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-[14px] font-semibold leading-snug text-[var(--np-text)]">
          {leg.marketLine}
        </p>
        <p className="shrink-0 text-[15px] font-extrabold tabular-nums text-[var(--np-text)]">{leg.odds}</p>
      </div>
      {leg.statusLabel && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--np-text-muted)]">Статус:</span>
          <BetStatusDisplay
            status={leg.status}
            label={leg.statusLabel}
            withIcon
            className="text-[13px]"
          />
        </div>
      )}
    </article>
  );
}

function splitExistingScore(score?: string): { main?: string; extra?: string } {
  const trimmed = String(score ?? '').trim();
  if (!trimmed) return {};
  const matched = trimmed.match(/^(.*?)(\s*\(.*\))\s*$/);
  if (matched) {
    return { main: matched[1].replace(/\s+/g, ' ').trim(), extra: matched[2].trim() };
  }
  return { main: trimmed.replace(/\s+/g, ' ') };
}
