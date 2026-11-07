export function CrownMark() {
  return (
    <svg className="rx-crown" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 24 8 11l5.2 8.2L16 6l2.8 13.2L24 11l5 13H3z" />
      <rect x="4.5" y="24.5" width="23" height="3.2" rx="1" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? 'rx-word rx-word-compact' : 'rx-word'}>
      <CrownMark />
      <span>
        <span className="rx-word-rixo">RIXO</span>
        <span className="rx-word-bet">BET</span>
      </span>
    </span>
  );
}
