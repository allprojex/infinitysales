import { describe, expect, it } from 'vitest';

import { rateValue } from './vat-report';

describe('VAT report rate fallback', () => {
  it('preserves normal numeric tax rates', () => {
    expect(rateValue(15, 12.5)).toBe(15);
    expect(rateValue('2.5', 1)).toBe(2.5);
    expect(rateValue(0, 15)).toBe(0);
    expect(rateValue('0', 15)).toBe(0);
  });

  it('uses the fallback for missing, null, and corrupt rate values', () => {
    expect(rateValue(null, 15)).toBe(15);
    expect(rateValue(undefined, 2.5)).toBe(2.5);
    expect(rateValue('', 2.5)).toBe(2.5);
    expect(rateValue('   ', 2.5)).toBe(2.5);
    expect(rateValue('not-a-number', 15)).toBe(15);
    expect(rateValue(Number.NaN, 15)).toBe(15);
    expect(rateValue(Number.POSITIVE_INFINITY, 15)).toBe(15);
  });
});
