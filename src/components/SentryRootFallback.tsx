export function SentryRootFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-ink-900 via-ink-850 to-ink-950 px-6 py-10 text-center">
      <p className="text-lg font-extrabold text-white">Произошла ошибка</p>
      <p className="max-w-xs text-sm font-medium text-ink-300">
        Обновите страницу и попробуйте снова.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95"
      >
        Обновить страницу
      </button>
    </div>
  );
}
