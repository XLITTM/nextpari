import { useId, type ReactNode } from 'react';

interface SportIconProps {
  sport: string;
  className?: string;
}

const ink = '#ffffff';

function FilledBall({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const clipId = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx="12" cy="12" r="10" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10" fill="#4ade80" />
      <g clipPath={`url(#${clipId})`}>{children}</g>
    </svg>
  );
}

export function SportIcon({ sport, className = 'w-7 h-7 text-[#4ade80]' }: SportIconProps) {
  switch (sport) {
    case 'all':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <rect x="3" y="3" width="8" height="8" rx="1.8" fill="#4ade80" />
          <rect x="13" y="3" width="8" height="8" rx="1.8" fill="#4ade80" />
          <rect x="3" y="13" width="8" height="8" rx="1.8" fill="#4ade80" />
          <rect x="13" y="13" width="8" height="8" rx="1.8" fill="#4ade80" />
        </svg>
      );
    case 'football':
    case 'futsal':
      return (
        <FilledBall className={className}>
          <path fill={ink} d="M12 7.35l2.9 2.1-1.1 3.4h-3.6l-1.1-3.4z" />
          <path
            d="M12 7.35V2.2M14.9 9.45l5.1-1.7M13.8 12.85l3.15 4.35M10.2 12.85L7.05 17.2M9.1 9.45 4 7.75"
            fill="none"
            stroke={ink}
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.2 11.3c1.6 1.1 2.4 2.5 2.4 4.3M18.8 11.3c-1.6 1.1-2.4 2.5-2.4 4.3M8.2 18.4c1.1 1.1 2.4 1.8 3.8 1.8s2.7-.7 3.8-1.8"
            fill="none"
            stroke={ink}
            strokeWidth="1.15"
            strokeLinecap="round"
          />
        </FilledBall>
      );
    case 'basketball':
      return (
        <FilledBall className={className}>
          <path
            d="M12 2v20M2 12h20M4.2 5.2c4.2 2.6 5.8 5.4 5.8 6.8s-1.6 4.2-5.8 6.8M19.8 5.2c-4.2 2.6-5.8 5.4-5.8 6.8s1.6 4.2 5.8 6.8"
            fill="none"
            stroke={ink}
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </FilledBall>
      );
    case 'tennis':
      return (
        <FilledBall className={className}>
          <path
            d="M3.3 8.4c4.8 2.1 7.4 2.4 8.7 3.6 1.3 1.2 3.9 1.5 8.7 3.6"
            fill="none"
            stroke={ink}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M3.3 15.6c4.8-2.1 7.4-2.4 8.7-3.6 1.3-1.2 3.9-1.5 8.7-3.6"
            fill="none"
            stroke={ink}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </FilledBall>
      );
    case 'table-tennis':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <circle cx="8" cy="9" r="5.2" fill="#4ade80" />
          <circle cx="16.5" cy="14.5" r="4.2" fill="#4ade80" />
          <path d="M11.2 5.8L18 18.5" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'badminton':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Shuttlecock */}
          <path d="M14 4.5l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M15 5.5c1.5 0 2.5 1 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M13.2 6c1.8 0 3 1.2 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11.5 6.8c2.3 0 3.8 1.5 3.8 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18.5" cy="9" r="1.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
          {/* Racket */}
          <ellipse cx="9" cy="15" rx="4.5" ry="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-35 9 15)" />
          <path d="M6.5 17.5L4 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M7.5 13L5.5 11M10.5 11.5L8.5 9.5M11.5 14.5L9.5 12.5M9 17L7 15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'baseball':
      return (
        <FilledBall className={className}>
          <path d="M6.1 4.4c2.2 3.2 2.2 12 0 15.2" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M17.9 4.4c-2.2 3.2-2.2 12 0 15.2" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M6.3 7.2l1.6-.8M5.9 10.4l1.9-.4M5.9 13.6l1.9.4M6.3 16.8l1.6.8M17.7 7.2l-1.6-.8M18.1 10.4l-1.9-.4M18.1 13.6l-1.9.4M17.7 16.8l-1.6.8" fill="none" stroke={ink} strokeWidth="1.05" strokeLinecap="round" />
        </FilledBall>
      );
    case 'polo':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Horse body */}
          <path
            d="M3.5 15c1-2 3-3 5-3h4l3-4c0.5-1 1.5-1.5 2.5-1.5h2l-1 2h-1.5l-1 2.5 2 1.5v2.5h-2v-1.5l-2.5-1h-4c-1 0-1.5 0.5-2 1.5l-0.5 1h-2z"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Tail */}
          <path d="M3.5 15c-1 0-1.5-1-1-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Ear */}
          <path d="M17 6.5l1-2 1 2z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          {/* Mallet */}
          <path d="M14 8l4-4M18 4l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'cricket':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Ball */}
          <circle cx="8" cy="16" r="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Stumps (3) */}
          <path d="M15 5v9M17 5v9M19 5v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Bails */}
          <path d="M14.8 5.2h2.4M16.8 5.2h2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'beach-volleyball':
      return (
        <FilledBall className={className}>
          <path d="M12 2c-2.2 5.4-3.4 9.4-2.2 20" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
          <path d="M20.2 6.6c-4.2 1.2-8 4.2-9.4 9.4-1 3.6-1 6.2-.4 6" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
          <path d="M3.8 8.2c3.8 3.2 8.6 4.8 16.4 4.2" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
        </FilledBall>
      );
    case 'snooker':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Red ball */}
          <circle cx="9" cy="12" r="5.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
          {/* White cue ball */}
          <circle cx="17.5" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {/* Cue stick */}
          <path d="M19 8.5L4 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Cue tip */}
          <path d="M3.5 20.5l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'elections':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Ballot box */}
          <rect x="4" y="8" width="16" height="13" rx="1.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" />
          {/* Slot */}
          <path d="M9 8V5h6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Ballot sticking out */}
          <rect x="10" y="2.5" width="4" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          {/* Checkmark on ballot */}
          <path d="M11 4.2l0.6 0.6L13 3.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          {/* Stars on box */}
          <path d="M8 14l0.5 1 1 0.1-0.8 0.7 0.3 1-0.9-0.5-0.9 0.5 0.3-1-0.8-0.7 1-0.1z" fill="currentColor" />
        </svg>
      );
    case 'pickleball':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Paddle */}
          <path
            d="M14 3.5c-3 0-5 2-5 5 0 2 1 3.5 2.5 5l-4 4c-0.8 0.8-0.8 2 0 2.8l1.2 1.2c0.8 0.8 2 0.8 2.8 0l4-4c1.5 1.5 3 2.5 5 2.5 3 0 5-2 5-5s-2-5-5-5h-1z"
            fill="currentColor"
            fillOpacity="0.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            transform="scale(0.65) translate(3 3)"
          />
          {/* Holes on paddle */}
          <circle cx="10" cy="9" r="0.8" fill="currentColor" />
          <circle cx="12" cy="7.5" r="0.8" fill="currentColor" />
          <circle cx="11" cy="11" r="0.8" fill="currentColor" />
          {/* Ball */}
          <circle cx="19" cy="17" r="2.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="18" cy="16.5" r="0.4" fill="currentColor" />
          <circle cx="20" cy="17.5" r="0.4" fill="currentColor" />
        </svg>
      );
    case 'fifa':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Trophy */}
          <path
            d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5V4z"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Handle left */}
          <path d="M8 5.5C6 5.5 5 6.5 5 8s1 2.5 3 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* Handle right */}
          <path d="M16 5.5c2 0 3 1 3 2.5s-1 2.5-3 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* Stem */}
          <path d="M12 13v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Base */}
          <path d="M9 19h6v2H9z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10 16h4v3h-4z" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Star */}
          <path d="M12 6.5l0.6 1.2 1.3 0.2-1 0.9 0.2 1.3-1.1-0.6-1.1 0.6 0.2-1.3-1-0.9 1.3-0.2z" fill="currentColor" />
        </svg>
      );
    case 'mk':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Fist / fighter silhouette */}
          <path
            d="M7 10c0-2 1-3.5 2.5-3.5h5c1.5 0 2.5 1.5 2.5 3.5v5c0 2-1.5 4-3.5 4h-3c-2 0-3.5-2-3.5-4v-5z"
            fill="currentColor"
            fillOpacity="0.12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Knuckle lines */}
          <path d="M9 10v-3M11 9.5V6M13 9.5V6M15 10V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Thumb */}
          <path d="M7 11c-1.5 0-2.5-1-2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* Lightning bolt emblem */}
          <path d="M12 12.5l-1.5 3h1.2l-0.7 2.5 2.5-3.5h-1.3z" fill="currentColor" />
        </svg>
      );
    case 'polybet':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Central hexagon */}
          <path
            d="M12 3l6 3.5v7L12 17l-6-3.5v-7z"
            fill="currentColor"
            fillOpacity="0.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Inner honeycomb hexagons (suggested) */}
          <path d="M12 7l3 1.7v3.6L12 14l-3-1.7V8.7z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          {/* Surrounding hex fragments */}
          <path d="M6 6.5L3 8M6 10.5L3 10M6 13.5L3 14.5M18 6.5L21 8M18 10.5L21 10M18 13.5L21 14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );
    case 'ufc':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Octagon cage shape */}
          <path
            d="M8 3h8l4 4v10l-4 4H8l-4-4V7z"
            fill="currentColor"
            fillOpacity="0.08"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* Inner octagon */}
          <path
            d="M9 6h6l2.5 2.5v7L15 18H9l-2.5-2.5v-7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* Fists crossing */}
          <path d="M9 10l-2 3 2 3M15 10l2 3-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'filter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          {/* Three horizontal slider lines with knobs */}
          <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          {/* Knobs */}
          <circle cx="8" cy="6" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="15" cy="12" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="18" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'hockey':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <circle cx="12" cy="12" r="10" fill="#4ade80" />
          <circle cx="12" cy="12" r="6.2" fill="none" stroke={ink} strokeWidth="1.5" />
        </svg>
      );
    case 'volleyball':
      return (
        <FilledBall className={className}>
          <path d="M12 2c-2.2 5.4-3.4 9.4-2.2 20" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
          <path d="M20.2 6.6c-4.2 1.2-8 4.2-9.4 9.4-1 3.6-1 6.2-.4 6" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
          <path d="M3.8 8.2c3.8 3.2 8.6 4.8 16.4 4.2" fill="none" stroke={ink} strokeWidth="1.35" strokeLinecap="round" />
        </FilledBall>
      );
    case 'esports':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
          <path
            fill="#4ade80"
            d="M7.2 7.6h9.6c2.6 0 4.7 2.15 4.7 4.9 0 2.35-1.55 4.25-3.55 4.25-.85 0-1.6-.35-2.2-1l-.85-.85H8.1l-.85.85c-.6.65-1.35 1-2.2 1-2 0-3.55-1.9-3.55-4.25 0-2.75 2.1-4.9 4.7-4.9z"
          />
          <path d="M6.9 11.35v3.1M5.35 12.9h3.1" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="15.15" cy="11.55" r="1" fill={ink} />
          <circle cx="17.15" cy="13.05" r="1" fill={ink} />
          <circle cx="13.2" cy="13.05" r="1" fill={ink} />
          <circle cx="15.15" cy="14.55" r="1" fill={ink} />
        </svg>
      );
    default:
      return (
        <FilledBall className={className}>
          <path fill={ink} d="M12 7.35l2.9 2.1-1.1 3.4h-3.6l-1.1-3.4z" />
        </FilledBall>
      );
  }
}
