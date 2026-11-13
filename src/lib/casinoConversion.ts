export interface CasinoConversion {
  usdtTmt: string;
  usdtUsd: string;
  rateVersion: string;
  balanceUsdMinor: number;
}

function decimal(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}

export function casinoRateLabel(conversion: CasinoConversion) {
  const tmt = decimal(conversion.usdtTmt);
  const usd = decimal(conversion.usdtUsd);
  let remainder = tmt.units * usd.scale;
  const divisor = usd.units * tmt.scale;
  const whole = remainder / divisor;
  remainder %= divisor;
  let fraction = '';
  while (remainder && fraction.length < 12) {
    remainder *= 10n;
    fraction += String(remainder / divisor);
    remainder %= divisor;
  }
  if (remainder) return `1 USD = ${conversion.usdtTmt} ÷ ${conversion.usdtUsd} TMT`;
  return `1 USD = ${whole}${fraction ? '.' + fraction : ''} TMT`;
}

export function casinoUsdLabel(minor: number) {
  const amount = BigInt(minor);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')} USD`;
}
