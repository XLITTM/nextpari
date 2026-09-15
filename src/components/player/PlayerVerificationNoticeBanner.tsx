import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { EmailBindModal } from './EmailBindModal';
import { useProfile } from '../../ProfileContext';
import {
  PLAYER_VERIFICATION_BIND_ACTION,
  PLAYER_VERIFICATION_SUPPORT_ACTION,
  PLAYER_VERIFICATION_SUPPORT_FALLBACK,
  fetchPlayerVerificationNotice,
  playerSupportMailto,
  type PlayerVerificationNotice,
} from '../../lib/playerVerification';

export function PlayerVerificationNoticeBanner({ enabled }: { enabled: boolean }) {
  const { personalData, refresh } = useProfile();
  const [notice, setNotice] = useState<PlayerVerificationNotice | null>(null);
  const [bindOpen, setBindOpen] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setNotice(null);
      return;
    }
    const next = await fetchPlayerVerificationNotice();
    setNotice(next);
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled || !notice?.verificationRequested) return null;

  const mailto = notice.supportConfigured ? playerSupportMailto(notice.supportEmail) : null;
  const requestedAt = notice.requestedAt
    ? new Date(notice.requestedAt).toLocaleString('ru-RU')
    : null;

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-extrabold">{notice.title}</p>
      {requestedAt ? <p className="mt-1 text-xs text-amber-800">Запрошено: {requestedAt}</p> : null}
      <p className="mt-1 font-semibold">{notice.message}</p>
      <p className="mt-1 text-xs">
        Подтверждённый email: {notice.hasVerifiedEmail ? 'есть' : 'нет'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {notice.bindEmailRequired ? (
          <button
            type="button"
            onClick={() => setBindOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-ink-900 px-3 py-2 text-xs font-bold text-white"
          >
            <Mail className="h-4 w-4" />
            {PLAYER_VERIFICATION_BIND_ACTION}
          </button>
        ) : null}
        {mailto ? (
          <a
            href={mailto}
            className="inline-flex items-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-ink-900 ring-1 ring-amber-200"
          >
            {PLAYER_VERIFICATION_SUPPORT_ACTION}
          </a>
        ) : (
          <p className="text-xs font-semibold text-amber-900">
            {notice.supportMessage ?? PLAYER_VERIFICATION_SUPPORT_FALLBACK}
          </p>
        )}
      </div>
      <EmailBindModal
        open={bindOpen}
        verifiedEmail={personalData.email_verified ? personalData.email : ''}
        onClose={() => setBindOpen(false)}
        onVerified={() => {
          setBindOpen(false);
          void refresh();
          void load();
        }}
      />
    </div>
  );
}
