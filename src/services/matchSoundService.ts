import { isEventFavorite, type FavoriteableEvent } from '@/stores/favoritesStore';
import type { BetsEvent } from '@/lib/betsapi';

export type MatchSoundKind = 'GOAL' | 'RED_CARD' | 'PENALTY' | 'WHISTLE';

const MUTE_KEY = 'nextpari_match_sounds_muted';

type ToastListener = (payload: { kind: MatchSoundKind; title: string; body: string }) => void;

const listeners = new Set<ToastListener>();
let audioCtx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(MUTE_KEY) === '1';
}

function getAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ??= new Ctx();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function tone(freq: number, duration: number, type: OscillatorType, gain = 0.12, slideTo?: number) {
  const ctx = getAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), ctx.currentTime + duration);
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function subscribeMatchSoundToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const matchSoundService = {
  get isMuted() {
    return muted;
  },
  setMuted(next: boolean) {
    muted = next;
    if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  },
  playGoalSound() {
    tone(523, 0.18, 'triangle', 0.14);
    window.setTimeout(() => tone(659, 0.18, 'triangle', 0.14), 120);
    window.setTimeout(() => tone(784, 0.32, 'triangle', 0.16), 240);
  },
  playRedCardSound() {
    tone(180, 0.45, 'square', 0.1);
  },
  playPenaltySound() {
    tone(880, 0.16, 'sine', 0.12);
    window.setTimeout(() => tone(440, 0.28, 'sine', 0.12), 160);
  },
  playWhistleSound() {
    tone(2100, 0.22, 'sawtooth', 0.06, 2600);
  },
  notify(kind: MatchSoundKind, match: FavoriteableEvent & { team1?: string; team2?: string; home?: { name?: string }; away?: { name?: string } }) {
    const isFav = isEventFavorite(match);
    if (muted || !isFav) return;

    if (kind === 'GOAL') this.playGoalSound();
    if (kind === 'RED_CARD') this.playRedCardSound();
    if (kind === 'PENALTY') this.playPenaltySound();
    if (kind === 'WHISTLE') this.playWhistleSound();

    const home = match.team1 || match.home?.name || 'Home';
    const away = match.team2 || match.away?.name || 'Away';
    const titles: Record<MatchSoundKind, string> = {
      GOAL: 'Гол!',
      RED_CARD: 'Красная карточка',
      PENALTY: 'Пенальти',
      WHISTLE: 'Свисток',
    };
    const payload = { kind, title: titles[kind], body: `${home} — ${away}` };
    listeners.forEach((listener) => listener(payload));
  },
};

function goalsOf(score?: string): number {
  const match = String(score ?? '').match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]);
}

function endedStatus(status?: string): boolean {
  return ['3', '4', '5', '8'].includes(String(status ?? '').trim());
}

const SPORT_BY_ID: Record<string, string> = {
  '1': 'football',
  '13': 'tennis',
  '17': 'hockey',
  '18': 'basketball',
  '91': 'esports',
  '151': 'esports',
};

export function detectMatchSoundEvents(
  prev: { event: BetsEvent; score: string } | undefined,
  nextEvent: BetsEvent,
  nextScore: string,
): void {
  if (!prev) return;
  const match = {
    id: nextEvent.id,
    leagueId: nextEvent.league?.id,
    league: nextEvent.league,
    sport: SPORT_BY_ID[String(nextEvent.sport_id ?? '')],
    sport_id: nextEvent.sport_id,
    home: nextEvent.home,
    away: nextEvent.away,
  };

  if (goalsOf(nextScore) > goalsOf(prev.score)) {
    matchSoundService.notify('GOAL', match);
  }
  if ((nextEvent.red_cards ?? 0) > (prev.event.red_cards ?? 0)) {
    matchSoundService.notify('RED_CARD', match);
  }
  if (nextEvent.has_penalty && !prev.event.has_penalty) {
    matchSoundService.notify('PENALTY', match);
  }
  if (endedStatus(nextEvent.time_status) && !endedStatus(prev.event.time_status)) {
    matchSoundService.notify('WHISTLE', match);
  }
  if (nextEvent.period === 'HT' && prev.event.period !== 'HT') {
    matchSoundService.notify('WHISTLE', match);
  }
}
