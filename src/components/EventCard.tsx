import { Radio, Clock } from 'lucide-react';
import type { BetsEvent } from '@/lib/betsapi';
import { isLive, liveMinuteLabel } from '@/lib/betsapi';

export function EventCard({ event, onOpen }: { event: BetsEvent; onOpen?: (id: string) => void }) {
  const live = isLive(event);
  const startMs = Number(event.start_time) * 1000;
  const minute = liveMinuteLabel(event);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(event.id)}
      className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-900 p-4 hover:bg-slate-800 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{event.league.name}</span>
        {live ? (
          <span className="flex items-center gap-1 text-xs font-bold text-red-400">
            <Radio className="w-3 h-3 animate-pulse" /> LIVE
            {minute ? <span className="font-semibold">{minute}</span> : null}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {Number.isFinite(startMs) && startMs > 0
              ? new Date(startMs).toLocaleString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })
              : 'Скоро'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex-1 text-left">
          <p className="font-semibold text-white">{event.home.name}</p>
          <p className="font-semibold text-white">{event.away.name}</p>
        </div>
        {live && event.ss && (
          <div className="text-2xl font-bold text-white font-mono px-4">{event.ss}</div>
        )}
      </div>
    </button>
  );
}
