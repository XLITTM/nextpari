import type { ReactNode } from 'react';

export function AuthSheet({ children }: { children: ReactNode }) {
  return (
    <section className="relative z-10 mx-4 mb-[max(1.25rem,env(safe-area-inset-bottom))] mt-auto w-auto max-w-[500px] self-center rounded-[32px] bg-white px-5 pb-6 pt-7 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:mx-auto sm:w-full max-[480px]:mb-[max(0.75rem,env(safe-area-inset-bottom))] max-[480px]:px-4 max-[480px]:pb-4 max-[480px]:pt-5 [@media(max-width:480px)_and_(max-height:740px)]:pb-3 [@media(max-width:480px)_and_(max-height:740px)]:pt-4">
      {children}
    </section>
  );
}
