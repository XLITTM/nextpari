import { useEffect, useRef, useState } from 'react';

export type OddsFlash = 'up' | 'down' | null;

export function useOddsFlash(price: number): OddsFlash {
  const prevPrice = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState<OddsFlash>(null);

  useEffect(() => {
    const prev = prevPrice.current;
    prevPrice.current = price;
    if (prev === undefined || prev === price) return;

    setFlash(price > prev ? 'up' : 'down');
    const timer = window.setTimeout(() => setFlash(null), 1000);
    return () => window.clearTimeout(timer);
  }, [price]);

  return flash;
}

export function oddsFlashButtonClass(flash: OddsFlash): string {
  if (flash === 'up') {
    return 'bg-[rgba(16,185,129,0.2)] border-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.35)]';
  }
  if (flash === 'down') {
    return 'bg-[rgba(239,68,68,0.2)] border-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.35)]';
  }
  return '';
}

export function oddsFlashTextClass(flash: OddsFlash): string {
  if (flash === 'up') return 'text-[#10B981]';
  if (flash === 'down') return 'text-[#EF4444]';
  return '';
}
