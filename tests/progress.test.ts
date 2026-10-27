import { describe, expect, it } from 'vitest';
import { goalEstimate, latestRate, points, trend } from '../src/core/progress';
import { ValidationError } from '../src/core/analysis';

const bill = (label: string, s: string, e: string, kwh: number, amount = kwh * 5) => ({ label, periodStart: s, periodEnd: e, kwh, amount });

describe('trend', () => {
  it('is empty for no bills and baseline-only for one bill', () => {
    expect(trend([])).toEqual([]);
    const t = trend([bill('A', '2026-01-01', '2026-01-30', 300)]);
    expect(t).toHaveLength(1);
    expect(t[0].kwhPerDay).toBeCloseTo(10);
    expect(t[0].vsBaselinePct).toBeNull();
  });
  it('sorts oldest first and measures against the earliest bill', () => {
    const t = trend([bill('C', '2026-03-01', '2026-03-30', 240), bill('A', '2026-01-01', '2026-01-30', 300), bill('B', '2026-02-01', '2026-02-28', 252)]);
    expect(t.map((p) => p.label)).toEqual(['A', 'B', 'C']);
    expect(t[1].kwhPerDay).toBeCloseTo(9); // 252 / 28 days
    expect(t[1].vsBaselinePct).toBeCloseTo(-10);
    expect(t[2].vsBaselinePct).toBeCloseTo(-20);
    expect(t[2].vsPreviousPct).toBeCloseTo(((8 - 9) / 9) * 100);
  });
  it('does not mistake a longer period for higher use', () => {
    const t = trend([bill('A', '2026-01-01', '2026-01-30', 300), bill('B', '2026-02-01', '2026-03-02', 300)]); // 30 vs 30 days
    expect(Math.abs(t[1].vsBaselinePct!)).toBeLessThan(1e-9);
    const t2 = trend([bill('A', '2026-01-01', '2026-01-30', 300), bill('B', '2026-02-01', '2026-03-12', 410)]); // 30 vs 40 days
    expect(t2[1].kwhPerDay).toBeCloseTo(10.25);
  });
  it('rejects bad input', () => {
    expect(() => trend([bill('A', '2026-02-01', '2026-01-01', 10)])).toThrow(ValidationError);
    expect(() => trend([bill('A', '2026-01-01', '2026-01-02', 0)])).toThrow(ValidationError);
  });
});

describe('points', () => {
  it('counts distinct check-in days', () => {
    expect(points([])).toBe(0);
    expect(points(['2026-01-01', '2026-01-02', '2026-01-02'])).toBe(2);
  });
});

describe('goalEstimate', () => {
  const ac = { name: 'AC', watts: 1500, hoursPerDay: 8 };
  it('uses rated watts x hours saved x 30 days, and the user rate', () => {
    const g = goalEstimate(ac, 7, 6);
    expect(g.kwhPerMonth).toBeCloseTo(45); // 1.5 kW x 1 h x 30
    expect(g.amountPerMonth).toBeCloseTo(270);
  });
  it('has no money figure without a bill', () => {
    expect(goalEstimate(ac, 7, null).amountPerMonth).toBeNull();
  });
  it('rejects goals above current use or outside 0-24', () => {
    expect(() => goalEstimate(ac, 9, 5)).toThrow(ValidationError);
    expect(() => goalEstimate(ac, -1, 5)).toThrow(ValidationError);
  });
});

describe('latestRate', () => {
  it('is amount/units of the most recent period', () => {
    expect(latestRate([])).toBeNull();
    expect(latestRate([bill('A', '2026-01-01', '2026-01-30', 100, 500), bill('B', '2026-02-01', '2026-02-28', 100, 800)])).toBeCloseTo(8);
  });
});
