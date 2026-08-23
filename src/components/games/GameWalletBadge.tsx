import { useWallet } from '../../WalletContext';

interface GameWalletBadgeProps {
  format?: (value: number) => string;
  labelClassName?: string;
  valueClassName?: string;
}

export function GameWalletBadge({
  format = (value) => value.toFixed(2),
  labelClassName = 'text-[8px] font-semibold uppercase tracking-wide opacity-70',
  valueClassName = 'text-[11px] font-black tabular-nums',
}: GameWalletBadgeProps) {
  const { balance, publicId } = useWallet();
  const id = (publicId || '').replace(/\D/g, '');

  return (
    <>
      <p className={labelClassName}>{id ? `#${id}` : 'Баланс'}</p>
      <p className={valueClassName}>{format(balance)}</p>
    </>
  );
}
