export function roundMoney(value: number, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
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
