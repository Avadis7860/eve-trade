export function safeDiv(num: number, den: number, fallback: number = 0.0): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return fallback;
  }
  const result = num / den;
  return Number.isFinite(result) ? result : fallback;
}

export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function sanitizeNumber(val: unknown, fallback: number = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val)) {
    return fallback;
  }
  return val;
}

export function roundIsk(value: number): number {
  if (!Number.isFinite(value)) return 0.0;
  return Math.round(value * 100) / 100;
}

export function roundMoney(value: number, precision: number = 2): number {
  if (!Number.isFinite(value)) return 0.0;
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Calculates official EVE Online minimum price tick size based on 4 significant figures.
 * Minimum tick size in EVE Online is 0.01 ISK.
 */
export function getEveTickSize(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0.01;
  const exponent = Math.floor(Math.log10(price));
  const tickExponent = exponent - 3;
  if (tickExponent <= -2) return 0.01;
  return Math.pow(10, tickExponent);
}

/**
 * Rounds an order price to the valid EVE Online tick size (4 significant figures).
 */
export function roundToEveTick(price: number, mode: 'nearest' | 'floor' | 'ceil' = 'nearest'): number {
  if (!Number.isFinite(price) || price <= 0) return 0.01;
  const tick = getEveTickSize(price);
  let rounded: number;
  if (mode === 'floor') {
    rounded = Math.floor(price / tick) * tick;
  } else if (mode === 'ceil') {
    rounded = Math.ceil(price / tick) * tick;
  } else {
    rounded = Math.round(price / tick) * tick;
  }
  return roundIsk(rounded);
}

export function fmtIsk(value: number | null | undefined, prec: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  const parts = value.toFixed(prec).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return `${integerPart},${parts[1]}\u202fISK`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  const pct = value * 100;
  const parts = pct.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return `${integerPart},${parts[1]}\u202f%`;
}

export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  return value.toLocaleString('fr-FR');
}

export function fmtAge(isoTs: string | null | undefined): string {
  if (!isoTs) return 'jamais';
  try {
    const dt = new Date(isoTs);
    const now = new Date();
    const seconds = Math.max(0, (now.getTime() - dt.getTime()) / 1000);
    if (seconds < 90) {
      return `il y a ${Math.floor(seconds)}\u202fs`;
    }
    if (seconds < 5400) {
      return `il y a ${Math.floor(seconds / 60)}\u202fmin`;
    }
    return `il y a ${(seconds / 3600).toFixed(1)}\u202fh`;
  } catch {
    return isoTs;
  }
}
