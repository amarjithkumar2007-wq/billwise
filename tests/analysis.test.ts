import { describe, expect, it } from 'vitest';
import { applianceKwhPerDay, billingDays, explainChange, kwhPerDay, scenario, ValidationError } from '../src/core/analysis';
import type { Bill } from '../src/core/types';

const bill = (kwh: number, amount: number, start = '2026-01-01', end = '2026-01-30'): Bill => ({
  label: 'x', periodStart: start, periodEnd: end, kwh, amount,
});

describe('billingDays', () => {
  it('counts inclusively', () => expect(billingDays('2026-01-01', '2026-01-30')).toBe(30));
  it('rejects reversed dates', () => expect(() => billingDays('2026-02-01', '2026-01-01')).toThrow(ValidationError));
  it('rejects garbage', () => expect(() => billingDays('nope', '2026-01-01')).toThrow(ValidationError));
});

describe('kwhPerDay', () => {
  it('divides units by days', () => expect(kwhPerDay(bill(300, 1000))).toBeCloseTo(10));
  it('rejects zero units', () => expect(() => kwhPerDay(bill(0, 100))).toThrow(ValidationError));
});

describe('explainChange', () => {
  it('attributes a rise to usage when the rate is unchanged', () => {
    const r = explainChange(bill(300, 1500), bill(360, 1800));
    expect(r.mainDriver).toBe('usage');
    expect(r.usageEffect).toBeCloseTo(300);
    expect(r.rateEffect).toBeCloseTo(0);
    expect(r.amountDelta).toBeCloseTo(300);
  });
  it('attributes a rise to rate when units are unchanged', () => {
    const r = explainChange(bill(300, 1500), bill(300, 1800));
    expect(r.mainDriver).toBe('rate');
    expect(r.rateEffect).toBeCloseTo(300);
  });
  it('effects always add up to the amount change', () => {
    const r = explainChange(bill(280, 1400, '2026-01-01', '2026-01-28'), bill(350, 2100, '2026-02-01', '2026-03-03'));
    expect(r.usageEffect + r.rateEffect).toBeCloseTo(r.amountDelta, 6);
  });
  it('does not blame usage for a longer billing period', () => {
    const r = explainChange(bill(300, 1500, '2026-01-01', '2026-01-30'), bill(310, 1550, '2026-02-01', '2026-03-03'));
    expect(r.kwhPerDayDelta).toBeCloseTo(0);
    expect(r.usageEffect).toBeCloseTo(0);
  });
  it('reports no driver when bills are equal', () => {
    expect(explainChange(bill(300, 1500), bill(300, 1500)).mainDriver).toBe('none');
  });
});

describe('appliances and scenarios', () => {
  it('computes kWh/day from watts x hours', () => expect(applianceKwhPerDay({ name: 'AC', watts: 1500, hoursPerDay: 8 })).toBeCloseTo(12));
  it('rejects more than 24 hours', () => expect(() => applianceKwhPerDay({ name: 'AC', watts: 1500, hoursPerDay: 25 })).toThrow(ValidationError));
  it('computes monthly saving at the users own rate', () => {
    const s = scenario({ name: 'AC', watts: 1500, hoursPerDay: 8 }, 6, 5);
    expect(s.savedKwhPerMonth).toBeCloseTo(90);
    expect(s.savedAmountPerMonth).toBeCloseTo(450);
  });
  it('shows negative saving when hours increase', () => {
    expect(scenario({ name: 'Fan', watts: 75, hoursPerDay: 5 }, 10, 6).savedAmountPerMonth).toBeLessThan(0);
  });
});

describe('same cases as tests/db (SQL and TS must agree)', () => {
  it('usage-driven: 300->360 kWh at the same rate', () => {
    const r = explainChange(bill(300, 1500, '2026-01-01', '2026-01-30'), bill(360, 1800, '2026-02-01', '2026-03-02'));
    expect(r.mainDriver).toBe('usage');
    expect(r.usageEffect + r.rateEffect).toBeCloseTo(r.amountDelta, 6);
  });
  it('rate-driven: same units, higher amount', () => {
    const r = explainChange(bill(300, 1500, '2026-01-01', '2026-01-30'), bill(300, 1800, '2026-04-01', '2026-04-30'));
    expect(r.mainDriver).toBe('rate');
    expect(r.rateEffect).toBeCloseTo(300, 6);
    expect(r.usageEffect).toBeCloseTo(0, 6);
  });
});

import { periodsOverlap, MAX_PERIOD_DAYS } from '../src/core/analysis';
describe('period rules', () => {
  it('detects overlap, including a shared single day', () => {
    expect(periodsOverlap('2026-01-01', '2026-01-31', '2026-01-31', '2026-02-28')).toBe(true);
    expect(periodsOverlap('2026-01-01', '2026-01-30', '2026-01-31', '2026-02-28')).toBe(false);
  });
  it('allows a one-day period and rejects a too-long one', () => {
    expect(kwhPerDay(bill(5, 30, '2026-01-01', '2026-01-01'))).toBe(5);
    expect(() => kwhPerDay(bill(5, 30, '2026-01-01', '2027-06-01'))).toThrow(ValidationError);
    expect(MAX_PERIOD_DAYS).toBe(366);
  });
  it('rejects NaN and Infinity', () => {
    expect(() => kwhPerDay(bill(NaN, 30))).toThrow(ValidationError);
    expect(() => applianceKwhPerDay({ name: 'x', watts: Infinity, hoursPerDay: 1 })).toThrow(ValidationError);
  });
  it('counts days across a leap day and a month end inclusively', () => {
    expect(billingDays('2028-02-28', '2028-03-01')).toBe(3);
  });
});
