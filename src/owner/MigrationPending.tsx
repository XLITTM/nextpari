export function MigrationPending({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <section>
      <h2 className="text-2xl font-extrabold text-ink-900 mb-2">{title}</h2>
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-sm font-semibold">
        <p>Функция переводится на защищённое ядро</p>
        {detail ? <p className="mt-1 text-xs font-medium text-amber-800">{detail}</p> : null}
      </div>
    </section>
  );
}
