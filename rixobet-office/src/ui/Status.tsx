import type { FailureReason } from '../api/http';

export function statusCopy(reason: FailureReason): string {
  if (reason === 'denied') return 'Доступ запрещён';
  if (reason === 'invalid') return 'Сервер не подтвердил операцию';
  return 'Не подключено';
}

export function StatusBanner({
  reason,
  detail,
}: {
  reason: FailureReason;
  detail?: string;
}) {
  const title = statusCopy(reason);
  return (
    <div className={reason === 'disconnected' ? 'rx-offline' : 'rx-status'} role="status">
      <strong>{title}</strong>
      <p>
        {detail ??
          (reason === 'disconnected'
            ? 'Сервер RIXO BET Office не ответил. Данные и проводки не загружены.'
            : 'Запрос не применён. Журнал сервера не обновлён из этого окна.')}
      </p>
    </div>
  );
}
