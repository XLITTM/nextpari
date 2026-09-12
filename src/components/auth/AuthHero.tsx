import { ArrowLeft } from 'lucide-react';

export const AUTH_SPORTS_BG = '/images/auth/nextpari-auth-sports-bg.png';

interface AuthHeroProps {
  showBack?: boolean;
  onBack?: () => void;
}

export function AuthHero({ showBack = false, onBack }: AuthHeroProps) {
  return (
    <div className="relative shrink-0 px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="absolute left-4 top-[max(1.25rem,env(safe-area-inset-top))] z-20 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white active:scale-95"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.2} />
        </button>
      ) : null}

      <div className="flex flex-col items-center pt-8">
        <img
          src="/logo.png"
          alt="NextPari"
          className="h-[4.5rem] w-[4.5rem] rounded-[22px] object-cover shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
        />
        <h1 className="mt-4 text-[34px] font-extrabold leading-none tracking-tight text-white">
          NextPari
        </h1>
        <p className="mt-2 text-[15px] font-medium text-white/80">Ставки на спорт онлайн</p>
      </div>
    </div>
  );
}
