import { formatPlayerMoney, useWallet } from '../../WalletContext';

interface GameWalletBadgeProps {
  format?: (value: number) => string;
  labelClassName?: string;
  valueClassName?: string;
}

export function GameWalletBadge({
  format,
  labelClassName = 'text-[8px] font-semibold uppercase tracking-wide opacity-70',
  valueClassName = 'text-[11px] font-black tabular-nums',
}: GameWalletBadgeProps) {
  const { balance, publicId, available, loading } = useWallet();
  const id = (publicId || '').replace(/\D/g, '');
  const value = available && format
    ? format(balance)
    : formatPlayerMoney(balance, available, loading);

  return (
    <>
      <p className={labelClassName}>{id ? `#${id}` : 'Баланс'}</p>
      <p className={valueClassName}>{value}</p>
    </>
  );
}
