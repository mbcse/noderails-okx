export const RAIL_DISPLAY: Record<
  string,
  { code: string; label: string; hint: string; flag: string }
> = {
  usd: { code: 'USD', label: 'United States', hint: 'ACH · Wire · FedNow', flag: 'us' },
  eur: { code: 'EUR', label: 'Europe', hint: 'SEPA', flag: 'eu' },
  mxn: { code: 'MXN', label: 'Mexico', hint: 'SPEI', flag: 'mx' },
  brl: { code: 'BRL', label: 'Brazil', hint: 'Pix', flag: 'br' },
  gbp: { code: 'GBP', label: 'United Kingdom', hint: 'Faster Payments', flag: 'gb' },
  cop: { code: 'COP', label: 'Colombia', hint: 'Local bank transfer', flag: 'co' },
};

export const GLOBAL_RAIL_TAGS = ['ACH', 'Wire', 'FedNow', 'SEPA', 'SPEI', 'Pix', 'FP'] as const;

export const CURRENCY_THEME: Record<string, { header: string; accent: string; symbol: string }> = {
  USD: { header: 'from-slate-900 via-[#0f2744] to-indigo-950', accent: 'text-sky-300', symbol: '$' },
  EUR: { header: 'from-indigo-950 via-violet-950 to-purple-950', accent: 'text-violet-300', symbol: '€' },
  GBP: { header: 'from-blue-950 via-indigo-950 to-slate-900', accent: 'text-blue-300', symbol: '£' },
  MXN: { header: 'from-emerald-950 via-teal-950 to-slate-900', accent: 'text-emerald-300', symbol: '$' },
  BRL: { header: 'from-green-950 via-emerald-950 to-slate-900', accent: 'text-lime-300', symbol: 'R$' },
  COP: { header: 'from-amber-950 via-orange-950 to-slate-900', accent: 'text-amber-300', symbol: '$' },
  OWN: { header: 'from-emerald-950 via-teal-950 to-slate-900', accent: 'text-emerald-300', symbol: '' },
};

export function currencyTheme(code: string) {
  return CURRENCY_THEME[code.toUpperCase()] ?? CURRENCY_THEME.USD;
}

export function railDisplay(rail: string) {
  const key = rail.toLowerCase();
  return RAIL_DISPLAY[key] ?? {
    code: rail.toUpperCase(),
    label: rail.toUpperCase(),
    hint: 'Local bank transfer',
    flag: 'un',
  };
}

export function flagUrl(iso: string) {
  return `https://flagcdn.com/w160/${iso}.png`;
}

const REGION_SCENES: Record<string, string> = {
  us: '/bank/us.jpg',
  eu: '/bank/eu.jpg',
  mx: '/bank/mx.jpg',
  br: '/bank/br.jpg',
  gb: '/bank/gb.jpg',
  co: '/bank/co.jpg',
  own: '/bank/own.jpg',
};

export function regionSceneUrl(flagOrCode: string) {
  return REGION_SCENES[flagOrCode.toLowerCase()] ?? REGION_SCENES.own;
}

export function formatUsd(value: string | number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `$${value ?? '30'}`;
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

export function prettyStatus(value: string | null | undefined) {
  if (!value) return 'not started';
  return value.replaceAll('_', ' ').toLowerCase();
}

export function identityApproved(status?: string | null) {
  if (!status) return false;
  return status.toLowerCase().includes('approved');
}

export function identityRejected(status?: string | null) {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower.includes('declin') || lower.includes('reject')
    || lower.includes('expir') || lower.includes('abandon');
}

/** Finished the Didit UI enough to leave the iframe (approved or in review). */
export function identityPassed(status?: string | null) {
  if (!status) return false;
  const lower = status.toLowerCase();
  return identityApproved(status) || lower.includes('review');
}

export function daysLeft(periodEnd?: string | Date | null) {
  if (!periodEnd) return null;
  return Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}
