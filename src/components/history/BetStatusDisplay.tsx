import { Check, Minus } from 'lucide-react';
import type { BetDisplayStatus } from '../../types';
import { playerStatusClass } from '../../lib/betHistoryView';

interface BetStatusDisplayProps {
  status: BetDisplayStatus | null | undefined;
  label: string;
  withIcon?: boolean;
  className?: string;
}

export function BetStatusDisplay({
  status,
  label,
  withIcon = false,
  className = '',
}: BetStatusDisplayProps) {
  if (!label) return null;
  const tone = status ? playerStatusClass(status) : 'text-[var(--np-text-secondary)]';
  const showCheck = withIcon && status === 'won';
  const showLost = withIcon && status === 'lost';

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${tone} ${className}`}>
      {showCheck && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--np-success)] text-[var(--np-accent-ink)]">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      {showLost && (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--np-danger)] text-white">
          <Minus className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      {label}
    </span>
  );
}
