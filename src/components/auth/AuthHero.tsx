import { ArrowLeft } from 'lucide-react';

export const AUTH_SPORTS_BG = '/images/auth/nextpari-auth-sports-bg.png';

interface AuthHeroProps {
  showBack?: boolean;
  onBack?: () => void;
}

export function AuthHero({ showBack = false, onBack }: AuthHeroProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] max-[480px]:pb-3 max-[480px]:pt-[max(0.75rem,env(safe-area-inset-top))] [@media(max-width:480px)_and_(max-height:740px)]:pb-2">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="absolute left-4 top-[max(1.25rem,env(safe-area-inset-top))] z-20 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white active:scale-95 max-[480px]:h-11 max-[480px]:w-11"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <img
          src="/logo.png"
          alt="NextPari"
          className="h-20 w-20 rounded-[24px] object-cover shadow-[0_8px_28px_rgba(0,0,0,0.35)] max-[480px]:h-[4.5rem] max-[480px]:w-[4.5rem] max-[480px]:rounded-[22px] [@media(max-width:480px)_and_(max-height:740px)]:h-16 [@media(max-width:480px)_and_(max-height:740px)]:w-16 [@media(max-width:480px)_and_(max-height:740px)]:rounded-[20px]"
        />
        <p className="mt-3 text-center text-[15px] font-medium text-white/80 max-[480px]:mt-2.5 [@media(max-width:480px)_and_(max-height:740px)]:mt-1.5">
          Ставки на спорт онлайн
        </p>
      </div>
    </div>
  );
}
