import type { ReactNode } from 'react';

export function AuthSheet({ children }: { children: ReactNode }) {
  return (
    <section className="relative z-10 mx-4 mb-[max(1.25rem,env(safe-area-inset-bottom))] mt-auto w-auto max-w-[500px] self-center rounded-[32px] bg-white px-5 pb-6 pt-7 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:mx-auto sm:w-full">
      {children}
    </section>
  );
}
