import { useState, type FormEvent } from 'react';

export function ManualVerificationAction({
  playerId, onConfirm, disabled = false,
}: {
  playerId: string;
  onConfirm: (reason: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(false);
    setConfirmed(false);
    setReason('');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || !reason.trim() || saving || disabled) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подтвердить верификацию');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      <button type="button" disabled={disabled || open} onClick={() => setOpen(true)} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
        Подтвердить верификацию
      </button>
      {open && (
        <form aria-label={`Подтверждение верификации игрока ${playerId}`} onSubmit={(event) => void submit(event)} className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
          <p className="font-semibold">Игрок #{playerId}</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={saving} />
            Подтверждаю, что проверил личность, возраст и необходимые личные данные игрока.
          </label>
          <label className="block">
            Причина подтверждения
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required disabled={saving} rows={2} className="mt-1 block w-full rounded-lg border border-slate-200 p-2" />
          </label>
          {error && <p role="alert" className="text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={close} className="rounded-lg border border-slate-200 px-3 py-2">Отмена</button>
            <button type="submit" disabled={saving || disabled || !confirmed || !reason.trim()} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-50">Сохранить подтверждение</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function manualVerificationLabel(status: string | null | undefined) {
  if (status === undefined) return 'статус недоступен';
  if (status === 'VERIFIED') return 'пройдена';
  if (status === 'VERIFICATION_REQUIRED') return 'требуется';
  return 'не запрошена';
}
