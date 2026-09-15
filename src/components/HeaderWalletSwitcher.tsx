import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useWallet } from '../WalletContext';
import {
  PLAYER_DISPLAY_CURRENCIES,
  PLAYER_REGISTRATION_CURRENCY_OPTIONS,
  displayPlayerCurrency,
} from '../lib/playerCurrency';
import { addPlayerWallet, fetchPlayerWallets, setActivePlayerWallet, type PlayerWalletRow } from '../lib/playerWallets';

export function HeaderWalletSwitcher({ balanceLabel }: { balanceLabel: string }) {
  const { refresh } = useWallet();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PlayerWalletRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetchPlayerWallets().then(setRows).catch(() => setRows([]));
  }, [open]);

  const owned = new Set(rows.map((row) => row.currency));

  const select = async (currency: string) => {
    setBusy(true);
    try {
      await setActivePlayerWallet(currency);
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const add = async (currency: string) => {
    setBusy(true);
    try {
      await addPlayerWallet(currency);
      await refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 py-1 pl-1 pr-2.5 dark:border-gray-700 dark:bg-[#1e293b]"
        aria-label="Кошелёк и валюты"
      >
        <span className="whitespace-nowrap text-sm font-bold tabular-nums text-gray-900 dark:text-white">
          {balanceLabel}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-zinc-900">
          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Мои валюты</p>
          {rows.map((row) => (
            <button
              key={row.walletId}
              type="button"
              disabled={busy}
              onClick={() => void select(row.currency)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-zinc-800"
            >
              <span>{row.isActive ? '✓ ' : '  '}{displayPlayerCurrency(row.currency)}</span>
              <span className="tabular-nums">{Number(row.availableBalance).toLocaleString('ru-RU')}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-gray-100 pt-1 dark:border-gray-800">
            <p className="px-2 py-1 text-[11px] font-bold text-gray-500">+ Добавить валюту</p>
            {PLAYER_DISPLAY_CURRENCIES.filter((code) => !owned.has(code)).map((code) => (
              <button
                key={code}
                type="button"
                disabled={busy}
                onClick={() => void add(code)}
                className="w-full rounded-xl px-2 py-2 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300"
              >
                {PLAYER_REGISTRATION_CURRENCY_OPTIONS.find((row) => row.value === code)?.label ?? code}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
