import { Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../ToastContext';
import { formatPlayerMoney } from '../../WalletContext';
import { createUsdtQuote, fetchUsdtQuoteTargets } from '../../lib/playerWallets';
import { displayPlayerCurrency } from '../../lib/playerCurrency';

interface DepositModalProps {
  publicId: string | null;
  onClose: () => void;
  onWallet: () => void;
}

export function DepositModal({ publicId, onClose, onWallet }: DepositModalProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [usdtAmount, setUsdtAmount] = useState('100');
  const [targetWallet, setTargetWallet] = useState('');
  const [targets, setTargets] = useState<Array<{ walletId: string; currency: string; rate: number }>>([]);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const playerId = (publicId || '').replace(/\D/g, '');
  const playerIdLabel = playerId || formatPlayerMoney(0, false);

  useEffect(() => {
    void fetchUsdtQuoteTargets().then((next) => {
      setTargets(next);
      setTargetWallet(next[0]?.walletId ?? '');
    }).catch(() => setTargets([]));
  }, []);

  const copyId = async () => {
    if (!playerId) {
      showToast('ID игрока недоступен');
      return;
    }
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
            <p className="text-lg font-black tabular-nums tracking-widest">#{playerIdLabel}</p>
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
        <div className="mt-5 border-t border-white/10 pt-4">
          <h3 className="text-sm font-black">Криптовалюта → USDT</h3>
          <p className="mt-1 text-xs text-slate-400">Только котировка. Реальный платёж провайдера не создаётся.</p>
          {targets.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">Сначала добавьте валюту в разделе Кошелёк и валюты.</p>
          ) : (
            <>
              <input
                value={usdtAmount}
                onChange={(event) => setUsdtAmount(event.target.value)}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm"
                placeholder="Сумма USDT"
              />
              <select
                value={targetWallet}
                onChange={(event) => setTargetWallet(event.target.value)}
                className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm"
              >
                {targets.map((row) => (
                  <option key={row.walletId} value={row.walletId}>
                    {displayPlayerCurrency(row.currency)} · 1 USDT = {row.rate}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const amount = usdtAmount;
                  const walletId = targetWallet || targets[0]?.walletId;
                  if (!walletId) return;
                  void createUsdtQuote(amount, walletId)
                    .then((next) => {
                      setQuote(next);
                      showToast('Котировка создана. Оплата недоступна.');
                    })
                    .catch((err: unknown) => {
                      showToast(err instanceof Error ? err.message : 'Не удалось создать котировку');
                    });
                }}
                className="mt-2 w-full rounded-xl bg-white/10 py-2 text-sm font-bold"
              >
                Получить котировку
              </button>
              {quote ? (
                <p className="mt-2 text-xs text-slate-300">
                  Вы отправляете: {String(quote.sourceAmount)} USDT. Курс Nextpari: 1 USDT = {String(quote.rateSnapshot)} {displayPlayerCurrency(String(quote.targetCurrencyCode))}. К зачислению: {String(quote.creditAmount)}. Кошелёк: {displayPlayerCurrency(String(quote.targetCurrencyCode))}. Статус: {String(quote.status)}. Провайдер не подключён.
                </p>
              ) : null}
            </>
          )}
        </div>
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
