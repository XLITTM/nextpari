export interface CasinoDisplayConversion {
  usdtTmt: string;
  usdtUsd: string;
  balanceUsdMinor: number;
}

export interface CasinoConversion extends CasinoDisplayConversion {
  rateVersion: string;
}

function decimal(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return { units: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}

export function casinoRateLabel(conversion: CasinoDisplayConversion) {
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

// The existing player endpoint only returns rates for eligible wallets the player owns.
export async function fetchCasinoDisplayConversion(signal: AbortSignal): Promise<CasinoDisplayConversion | null> {
  const response = await fetch('/api/player/crypto/usdt-targets', { signal, cache: 'no-store' });
  if (!response.ok) return null;
  const body = await response.json() as { ok?: boolean; targets?: unknown };
  if (body.ok !== true || !Array.isArray(body.targets)) return null;
  const rows = body.targets.filter((row): row is Record<string, unknown> =>
    row !== null && typeof row === 'object' && row.enabled === true);
  const tmt = rows.filter((row) => row.currency === 'TMT');
  const usd = rows.filter((row) => row.currency === 'USD');
  if (tmt.length !== 1 || usd.length !== 1) return null;

  function parse(value: unknown) {
    const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
    return /^\d{1,16}(?:\.\d{1,12})?$/.test(text) ? { text, ...decimal(text) } : null;
  }

  const tmtRate = parse(tmt[0].rate);
  const usdRate = parse(usd[0].rate);
  const tmtBalance = parse(tmt[0].availableBalance);
  if (!tmtRate?.units || !usdRate?.units || !tmtBalance) return null;

  const minor = (tmtBalance.units * usdRate.units * tmtRate.scale * 100n) /
    (tmtBalance.scale * usdRate.scale * tmtRate.units);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { usdtTmt: tmtRate.text, usdtUsd: usdRate.text, balanceUsdMinor: Number(minor) };
}
