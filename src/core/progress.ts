import { billingDays, scenario, ValidationError } from './analysis';
import type { Bill } from './types';

export interface TrendPoint {
  label: string;
  periodStart: string;
  days: number;
  kwhPerDay: number;
  /** Percent change against the earliest bill (the baseline). null for the baseline itself. */
  vsBaselinePct: number | null;
  /** Percent change against the bill before this one. null for the first bill. */
  vsPreviousPct: number | null;
}

/**
 * Daily energy use across the user's saved bills, oldest first.
 * Each bill is divided by its own number of days, so a 28-day and a 33-day bill compare fairly.
 * The earliest bill is the baseline. This describes what happened; it does not say why.
 */
export function trend(bills: Bill[]): TrendPoint[] {
  const sorted = [...bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const points = sorted.map((b) => {
    if (!(b.kwh > 0)) throw new ValidationError('Units (kWh) must be greater than 0');
    const days = billingDays(b.periodStart, b.periodEnd);
    return { label: b.label, periodStart: b.periodStart, days, kwhPerDay: b.kwh / days };
  });
  const base = points[0]?.kwhPerDay;
  return points.map((p, i) => ({
    ...p,
    vsBaselinePct: i === 0 ? null : ((p.kwhPerDay - base) / base) * 100,
    vsPreviousPct: i === 0 ? null : ((p.kwhPerDay - points[i - 1].kwhPerDay) / points[i - 1].kwhPerDay) * 100,
  }));
}

/** Self-reported points: one point per check-in day. */
export function points(checkinDays: string[]): number {
  return new Set(checkinDays).size;
}

export interface GoalEstimate {
  /** Estimated kWh per month if the goal is kept every day (rated watts x hours; an estimate, not a measurement). */
  kwhPerMonth: number;
  /** Same saving at the user's own average price per unit, or null when there is no bill yet. */
  amountPerMonth: number | null;
}

export function goalEstimate(
  appliance: { name: string; watts: number; hoursPerDay: number },
  targetHours: number,
  ratePerKwh: number | null,
): GoalEstimate {
  if (targetHours > appliance.hoursPerDay) throw new ValidationError('Goal must not be more hours than the appliance runs now');
  const s = scenario(appliance, targetHours, ratePerKwh ?? 0);
  return { kwhPerMonth: s.savedKwhPerMonth, amountPerMonth: ratePerKwh === null ? null : s.savedAmountPerMonth };
}

export function latestRate(bills: Bill[]): number | null {
  if (bills.length === 0) return null;
  const last = [...bills].sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0];
  return last.amount / last.kwh;
}
