import { describe, expect, it } from 'vitest';
import { calculateInvestment, calculateMilestones, formatMoney, parseMoney } from './money';

describe('money calculations', () => {
  it('uses minor units for USD and whole units for IDR', () => {
    expect(parseMoney('11000.25', 'USD')).toBe(1_100_025);
    expect(parseMoney('17500000', 'IDR')).toBe(17_500_000);
    expect(formatMoney(1_100_025, 'USD')).toContain('11,000.25');
  });

  it('applies discount before basis-point tax without floats', () => {
    expect(calculateInvestment([
      { id: '1', name: 'Design', description: '', amountMinor: 400_000 },
      { id: '2', name: 'Build', description: '', amountMinor: 700_000 },
    ], 100_000, 1_100)).toEqual({ subtotalMinor: 1_100_000, discountMinor: 100_000, taxMinor: 110_000, totalMinor: 1_110_000 });
  });

  it('allocates rounding residue to the last milestone', () => {
    const result = calculateMilestones(10_001, [
      { id: 'a', percentage: 40, description: 'Start' }, { id: 'b', percentage: 30, description: 'Approval' }, { id: 'c', percentage: 30, description: 'Delivery' },
    ]);
    expect(result.map(item => item.amountMinor)).toEqual([4_000, 3_000, 3_001]);
    expect(result.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(10_001);
  });

  it('rejects schedules that do not equal 100 percent', () => {
    expect(() => calculateMilestones(100, [{ id: 'a', percentage: 90, description: 'Start' }])).toThrow(/100%/);
  });
});
