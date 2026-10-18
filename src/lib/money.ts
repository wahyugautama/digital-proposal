import type { Currency, PaymentMilestone, PricingPhase } from './types';

export const currencyPrecision = (currency: Currency) => currency === 'IDR' ? 0 : 2;

export const parseMoney = (value: string, currency: Currency): number => {
  const normalized = value.replace(/[^0-9.-]/g, '');
  if (!normalized || !Number.isFinite(Number(normalized))) return 0;
  return Math.round(Number(normalized) * 10 ** currencyPrecision(currency));
};

export const formatMoney = (minor: number, currency: Currency): string =>
  new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: currencyPrecision(currency),
  }).format(minor / 10 ** currencyPrecision(currency));

export const calculateInvestment = (
  phases: PricingPhase[], discountMinor = 0, taxBasisPoints = 0,
) => {
  const subtotalMinor = phases.reduce((sum, phase) => sum + Math.max(0, Math.trunc(phase.amountMinor)), 0);
  const discountedMinor = Math.max(0, subtotalMinor - Math.max(0, Math.trunc(discountMinor)));
  const taxMinor = Math.round(discountedMinor * Math.max(0, Math.trunc(taxBasisPoints)) / 10_000);
  return { subtotalMinor, discountMinor: Math.min(discountMinor, subtotalMinor), taxMinor, totalMinor: discountedMinor + taxMinor };
};

export const calculateMilestones = (totalMinor: number, milestones: PaymentMilestone[]) => {
  if (milestones.reduce((sum, item) => sum + item.percentage, 0) !== 100) {
    throw new Error('Payment milestones must total 100%.');
  }
  let allocated = 0;
  return milestones.map((item, index) => {
    const amountMinor = index === milestones.length - 1
      ? totalMinor - allocated
      : Math.round(totalMinor * item.percentage / 100);
    allocated += amountMinor;
    return { ...item, amountMinor };
  });
};
