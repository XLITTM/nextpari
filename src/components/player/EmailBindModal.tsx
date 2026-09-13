import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import {
  PlayerEmailBindError,
  startPlayerEmailBinding,
  verifyPlayerEmailBinding,
} from '../../lib/playerAuth';

interface EmailBindModalProps {
  open: boolean;
  verifiedEmail: string;
  onClose: () => void;
  onVerified: () => void;
}

export function EmailBindModal({ open, verifiedEmail, onClose, onVerified }: EmailBindModalProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('email');
      setEmail('');
      setCode('');
      setMasked('');
      setError('');
      setSubmitting(false);
      setCooldown(0);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!open) return null;

  const sendCode = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const result = await startPlayerEmailBinding(email);
      setMasked(result.maskedEmail);
      setCooldown(result.resendAfterSeconds);
      setStep('code');
    } catch (err) {
      setError(err instanceof PlayerEmailBindError ? err.message : 'Не удалось отправить код. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmCode = async () => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await verifyPlayerEmailBinding(code);
      onVerified();
    } catch (err) {
      setError(err instanceof PlayerEmailBindError ? err.message : 'Не удалось подтвердить почту. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-end sm:items-center justify-center overflow-x-hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[100svh] overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-[#1e293b] flex items-center justify-center shrink-0">
            <Mail className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {verifiedEmail ? 'Изменить почту' : 'Привязать почту'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Электронная почта</p>
          </div>
        </div>

        {step === 'email' ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode();
            }}
          >
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">
                Введите электронную почту
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full min-w-0 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600"
              />
            </label>
            {error ? <p className="text-sm font-semibold text-red-500 break-words">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Отправка…' : 'Отправить код'}
            </button>
            <button type="button" onClick={onClose} className="w-full text-gray-500 dark:text-gray-300 font-semibold py-2 text-sm">
              Отмена
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmCode();
            }}
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">
              На {masked || 'указанный адрес'} отправлен код
            </p>
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">
                6-значный код
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full min-w-0 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold tracking-[0.3em] rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600"
              />
            </label>
            {error ? <p className="text-sm font-semibold text-red-500 break-words">{error}</p> : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Проверка…' : 'Подтвердить'}
            </button>
            <button
              type="button"
              disabled={submitting || cooldown > 0}
              onClick={() => void sendCode()}
              className="w-full text-gray-500 dark:text-gray-300 font-semibold py-2 text-sm disabled:opacity-50"
            >
              {cooldown > 0 ? `Отправить код повторно (${cooldown}с)` : 'Отправить код повторно'}
            </button>
            <button type="button" onClick={onClose} className="w-full text-gray-500 dark:text-gray-300 font-semibold py-2 text-sm">
              Отмена
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
