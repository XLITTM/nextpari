import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

interface RegistrationMethodCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}

export function RegistrationMethodCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: RegistrationMethodCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[84px] w-full items-center gap-3.5 rounded-[20px] border border-[#E6EBF2] bg-[#F7F9FC] px-4 py-3.5 text-left shadow-[0_6px_18px_rgba(15,23,42,0.04)] transition-transform active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[17px] font-extrabold text-ink-900">{title}</span>
          {badge ? (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-500">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[13px] font-medium leading-snug text-slate-500">
          {description}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" strokeWidth={2.2} />
    </button>
  );
}
