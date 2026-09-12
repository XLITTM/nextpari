import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthInputProps {
  icon: ReactNode;
  trailing?: ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  placeholder: string;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  name?: string;
}

export function AuthInput({
  icon,
  trailing,
  label,
  value,
  onChange,
  type,
  placeholder,
  autoComplete,
  inputMode,
  name,
}: AuthInputProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-semibold text-ink-700 max-[480px]:mb-1.5">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          name={name}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`h-16 w-full rounded-[18px] border border-[#D8DEE8] bg-[#F8FAFC] pl-12 text-[16px] font-semibold text-ink-900 outline-none placeholder:font-medium placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 max-[480px]:h-14 ${
            trailing ? 'pr-12' : 'pr-4'
          }`}
        />
        {trailing ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>
    </label>
  );
}
