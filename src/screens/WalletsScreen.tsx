import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useWallet } from '../WalletContext';
import {
  PLAYER_DISPLAY_CURRENCIES,
  PLAYER_REGISTRATION_CURRENCY_OPTIONS,
  displayPlayerCurrency,
} from '../lib/playerCurrency';
import { addPlayerWallet, fetchPlayerWallets, setActivePlayerWallet, type PlayerWalletRow } from '../lib/playerWallets';

export function WalletsScreen({ onBack }: { onBack: () => void }) {
  const { refresh } = useWallet();
  const { showToast } = useToast();
  const [rows, setRows] = useState<PlayerWalletRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const next = await fetchPlayerWallets();
    setRows(next);
  };

  useEffect(() => {
    void load().catch(() => setRows([]));
  }, []);

  const owned = new Set(rows.map((row) => row.currency));

  const select = async (currency: string) => {
    setBusy(true);
    try {
      await setActivePlayerWallet(currency);
      await load();
      await refresh();
      showToast(`Активная валюта: ${displayPlayerCurrency(currency)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось переключить валюту');
    } finally {
      setBusy(false);
    }
  };

  const add = async (currency: string) => {
    setBusy(true);
    try {
      await addPlayerWallet(currency);
      await load();
      await refresh();
      showToast(`Добавлена валюта ${displayPlayerCurrency(currency)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось добавить валюту');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Кошелёк и валюты</h1>
      </div>
      <div className="space-y-3 px-3">
        {rows.map((row) => (
          <button
            key={row.walletId}
            type="button"
            disabled={busy}
            onClick={() => void select(row.currency)}
            className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {row.isActive ? '✓ ' : ''}{displayPlayerCurrency(row.currency)}
              </p>
              <p className="text-xs text-gray-500">{row.displayNameRu}</p>
            </div>
            <p className="text-sm font-extrabold tabular-nums">
              {Number(row.availableBalance).toLocaleString('ru-RU')}
            </p>
          </button>
        ))}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-2 text-sm font-bold">Добавить валюту</p>
          {PLAYER_DISPLAY_CURRENCIES.filter((code) => !owned.has(code)).map((code) => (
            <button
              key={code}
              type="button"
              disabled={busy}
              onClick={() => void add(code)}
              className="mb-2 w-full rounded-xl bg-gray-100 py-2 text-sm font-semibold dark:bg-gray-700"
            >
              {PLAYER_REGISTRATION_CURRENCY_OPTIONS.find((row) => row.value === code)?.label ?? code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
