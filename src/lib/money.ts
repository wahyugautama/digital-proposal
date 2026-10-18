import type { Currency, PaymentMilestone, PricingPhase } from './types';

export const currencyPrecision = (currency: Currency) => currency === 'IDR' ? 0 : 2;

export const parseMoney = (value: string, currency: Currency): number => {
  const normalized = value.replace(/[^0-9.-]/g, '');
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  const precision = currencyPrecision(currency);
  if (!match || (match[3]?.length ?? 0) > precision) return 0;
  const units = BigInt(match[2]) * 10n ** BigInt(precision);
  const fraction = BigInt((match[3] ?? '').padEnd(precision, '0') || '0');
  const result = (match[1] ? -1n : 1n) * (units + fraction);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(result) : 0;
};

export const formatMoney = (minor: number, currency: Currency): string => {
  if (!Number.isSafeInteger(minor)) throw new Error('Amount must be a safe integer.');
  const negative = minor < 0 ? '−' : '';
  const absolute = BigInt(Math.abs(minor));
  if (currency === 'IDR') return `${negative}Rp ${new Intl.NumberFormat('id-ID').format(absolute)}`;
  const whole = absolute / 100n;
  const cents = absolute % 100n;
  return `${negative}$${new Intl.NumberFormat('en-US').format(whole)}${cents ? `.${cents.toString().padStart(2, '0')}` : ''}`;
};

export const calculateInvestment = (
  phases: PricingPhase[], discountMinor = 0, taxBasisPoints = 0,
) => {
  const subtotalMinor = phases.reduce((sum, phase) => sum + Math.max(0, Math.trunc(phase.amountMinor)), 0);
  const discountedMinor = Math.max(0, subtotalMinor - Math.max(0, Math.trunc(discountMinor)));
  const taxMinor = Number((BigInt(discountedMinor) * BigInt(Math.max(0, Math.trunc(taxBasisPoints))) + 5_000n) / 10_000n);
  return { subtotalMinor, discountMinor: Math.min(discountMinor, subtotalMinor), taxMinor, totalMinor: discountedMinor + taxMinor };
};

export const calculateMilestones = (totalMinor: number, milestones: PaymentMilestone[]) => {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error('Investment must be a non-negative safe amount.');
  if (milestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) {
    throw new Error('Payment milestones must total 100%.');
  }
  if (milestones.some(item => !Number.isInteger(item.percentage) || item.percentage < 0)) throw new Error('Milestone percentages must be whole non-negative numbers.');
  let allocated = 0;
  return milestones.map((item, index) => {
    const amountMinor = index === milestones.length - 1
      ? totalMinor - allocated
      : Number((BigInt(totalMinor) * BigInt(item.percentage) + 50n) / 100n);
    allocated += amountMinor;
    return { ...item, amountMinor };
  });
};
