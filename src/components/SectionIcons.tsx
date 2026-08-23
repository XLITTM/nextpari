type IconProps = { className?: string; strokeWidth?: number; fill?: string; stroke?: string; color?: string };

const ink = '#ffffff';
const fillGreen = '#4ade80';

export function IconTop({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={fillGreen} className={className} aria-hidden>
      <path d="M12 2c1.4 3.2-.6 5.2 1.6 8.4-2.6-.4-4-2.2-4.6 1.6C8.6 8.4 9.6 5.2 12 2z" />
      <path d="M16.2 4.2c.9 2.4-.2 4.2 1.6 6.6-2.3-.1-3.6-1.6-4.2 1.4.3-3.2 1.2-5.4 2.6-8z" />
      <path d="M8.6 9.2C6.4 11.6 6 14.2 7.4 16.6c1.2 2.1 3.4 3.4 5.8 3.4 4.2 0 7-3.2 6.4-7.2-.4-2.4-2.2-3.6-4.2-3.2-1.2-2.2-3.6-2.4-6.8-.4z" />
    </svg>
  );
}

export function IconSport({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill={fillGreen}
        d="M11.8 1.5c.5 2.6-1.5 3.8.8 6.8-2.4-.6-3.4-2.2-4.1.8C8.6 6.2 9.7 3.4 11.8 1.5z"
      />
      <path
        fill={fillGreen}
        d="M15.6 2.8c.7 2.2-.3 3.8 1.4 6-2-.2-3-1.5-3.7.9.4-2.6 1.2-4.6 2.3-6.9z"
      />
      <circle cx="12" cy="15.2" r="7.4" fill={fillGreen} />
      <path fill={ink} d="M12 12.35l1.75 1.27-.67 2.06h-2.16l-.67-2.06z" />
      <path
        d="M12 12.35v-2.7M13.75 13.62l2.35-1.05M13.08 15.68l1.35 2.05M10.92 15.68l-1.35 2.05M10.25 13.62l-2.35-1.05"
        fill="none"
        stroke={ink}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconEsports({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill={fillGreen}
        d="M7.2 7.6h9.6c2.6 0 4.7 2.15 4.7 4.9 0 2.35-1.55 4.25-3.55 4.25-.85 0-1.6-.35-2.2-1l-.85-.85H8.1l-.85.85c-.6.65-1.35 1-2.2 1-2 0-3.55-1.9-3.55-4.25 0-2.75 2.1-4.9 4.7-4.9z"
      />
      <path d="M6.9 11.35v3.1M5.35 12.9h3.1" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="15.15" cy="11.55" r="1" fill={ink} />
      <circle cx="17.15" cy="13.05" r="1" fill={ink} />
      <circle cx="13.2" cy="13.05" r="1" fill={ink} />
      <circle cx="15.15" cy="14.55" r="1" fill={ink} />
    </svg>
  );
}

export function IconCasino({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="5.5" y="2.6" width="13" height="18.8" rx="2.2" fill={fillGreen} />
      <path
        fill={ink}
        d="M12 16.6c-2.85-2.15-4.45-3.75-4.45-5.55 0-1.3.95-2.25 2.2-2.25.85 0 1.6.5 2.25 1.35.65-.85 1.4-1.35 2.25-1.35 1.25 0 2.2.95 2.2 2.25 0 1.8-1.6 3.4-4.45 5.55z"
      />
      <path
        fill={ink}
        d="M7.6 5.1h1.15l.85 2.15.85-2.15H11.6l-1.4 3.15v1.85H9v-1.85z"
      />
    </svg>
  );
}

export function IconGames({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="9.2" y="3.2" width="11" height="11" rx="2" fill={fillGreen} />
      <circle cx="12.2" cy="6.2" r="0.95" fill={ink} />
      <circle cx="17.2" cy="11.2" r="0.95" fill={ink} />
      <circle cx="14.7" cy="8.7" r="0.95" fill={ink} />
      <rect x="3.6" y="9.6" width="11.2" height="11.2" rx="2" fill={fillGreen} />
      <circle cx="7" cy="13" r="0.95" fill={ink} />
      <circle cx="11.4" cy="13" r="0.95" fill={ink} />
      <circle cx="7" cy="17.4" r="0.95" fill={ink} />
      <circle cx="11.4" cy="17.4" r="0.95" fill={ink} />
      <circle cx="9.2" cy="15.2" r="0.95" fill={ink} />
    </svg>
  );
}
