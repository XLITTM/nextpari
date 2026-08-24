export function SkeletonLoader({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3 px-4 py-2" aria-busy="true" aria-label="Загрузка матчей">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-[#1e293b]"
        >
          <div className="h-8 bg-gray-200 dark:bg-slate-700/80" />
          <div className="space-y-3 p-4">
            <div className="mx-auto h-4 w-2/3 rounded bg-gray-200 dark:bg-slate-700/80" />
            <div className="h-10 rounded-xl bg-gray-200 dark:bg-slate-700/70" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-9 rounded-xl bg-gray-200 dark:bg-slate-700/70" />
              <div className="h-9 rounded-xl bg-gray-200 dark:bg-slate-700/70" />
              <div className="h-9 rounded-xl bg-gray-200 dark:bg-slate-700/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
