export const GLOBAL_BANK_RAILS = [
  { rail: 'usd', currency: 'USD', label: 'United States', endorsement: 'base' },
  { rail: 'eur', currency: 'EUR', label: 'Euro area', endorsement: 'sepa' },
  { rail: 'mxn', currency: 'MXN', label: 'Mexico', endorsement: 'spei' },
  { rail: 'brl', currency: 'BRL', label: 'Brazil', endorsement: 'pix' },
  { rail: 'gbp', currency: 'GBP', label: 'United Kingdom', endorsement: 'faster_payments' },
  { rail: 'cop', currency: 'COP', label: 'Colombia', endorsement: 'cop' },
] as const;

export type GlobalBankRail = (typeof GLOBAL_BANK_RAILS)[number]['rail'];

export function isGlobalBankRail(value: string): value is GlobalBankRail {
  return GLOBAL_BANK_RAILS.some((row) => row.rail === value);
}

export function railMeta(rail: string) {
  return GLOBAL_BANK_RAILS.find((row) => row.rail === rail);
}

export const ALL_BRIDGE_ENDORSEMENTS = GLOBAL_BANK_RAILS.map((row) => row.endorsement);

const BRIDGE_CHAIN_RAILS: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  11155111: 'ethereum',
  84532: 'base',
  421614: 'arbitrum',
};

export function bridgePaymentRail(chainId: number): string {
  return BRIDGE_CHAIN_RAILS[chainId] ?? 'ethereum';
}
