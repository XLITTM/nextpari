import { Copy, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../ToastContext';
import { ensureLocalGuest } from '../../lib/playerProfile';

interface DepositModalProps {
  publicId: string | null;
  onClose: () => void;
  onWallet: () => void;
}

export function DepositModal({ publicId, onClose, onWallet }: DepositModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const playerId = (publicId || ensureLocalGuest().publicId).replace(/\D/g, '');

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(playerId);
      setCopied(true);
      showToast('ID игрока скопирован');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast('Не удалось скопировать ID');
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/60 p-3 sm:items-center">
      <div className="w-full rounded-2xl bg-[#161c28] p-4 ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black">Пополнение через Mobcash</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-medium text-slate-300">
          Пополните счёт через агента Mobcash. Назовите ID игрока кассиру.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-black/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ID игрока</p>
            <p className="text-lg font-black tabular-nums tracking-widest">#{playerId}</p>
          </div>
          <button
            type="button"
            onClick={() => void copyId()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300 active:scale-95"
            aria-label="Скопировать ID игрока"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        {copied && <p className="mt-2 text-xs font-semibold text-emerald-400">Скопировано</p>}
        <button
          type="button"
          onClick={onWallet}
          className="mt-4 w-full rounded-xl bg-[#c89247] py-3 text-sm font-black text-white active:scale-[0.98]"
        >
          Открыть кошелёк
        </button>
      </div>
    </div>
  );
}
