import type { Appliance, Bill, BillChange, Scenario } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export class ValidationError extends Error {}

/** Inclusive number of days between two ISO dates (YYYY-MM-DD). */
export function billingDays(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e)) throw new ValidationError('Invalid date');
  if (e < s) throw new ValidationError('Period end is before period start');
  return Math.round((e - s) / DAY_MS) + 1;
}

export function validateBill(b: Bill): void {
  if (!(b.kwh > 0)) throw new ValidationError('Units (kWh) must be greater than 0');
  if (!(b.amount >= 0)) throw new ValidationError('Amount cannot be negative');
  billingDays(b.periodStart, b.periodEnd);
}

export function kwhPerDay(b: Bill): number {
  validateBill(b);
  return b.kwh / billingDays(b.periodStart, b.periodEnd);
}

/**
 * Explain why bill B differs from bill A.
 * amount = units * rate, so the change splits exactly into
 *   usageEffect = (unitsB - unitsA) * rateA   (you used more/less)
 *   rateEffect  = (rateB - rateA) * unitsB    (each unit cost more/less)
 * Units are scaled to the same number of days (30 days) so a longer
 * billing period is not mistaken for higher usage.
 */
export function explainChange(a: Bill, b: Bill): BillChange {
  const kA = kwhPerDay(a);
  const kB = kwhPerDay(b);
  const daysA = billingDays(a.periodStart, a.periodEnd);
  const daysB = billingDays(b.periodStart, b.periodEnd);
  const rateA = a.amount / a.kwh;
  const rateB = b.amount / b.kwh;

  // Compare on B's period length so the two effects add up to the real change.
  const unitsAOnB = kA * daysB;
  const amountAOnB = unitsAOnB * rateA;
  const usageEffect = (b.kwh - unitsAOnB) * rateA;
  const rateEffect = (rateB - rateA) * b.kwh;
  const amountDelta = b.amount - amountAOnB;

  let mainDriver: BillChange['mainDriver'] = 'none';
  if (Math.abs(usageEffect) > 0.005 || Math.abs(rateEffect) > 0.005) {
    mainDriver = Math.abs(usageEffect) >= Math.abs(rateEffect) ? 'usage' : 'rate';
  }

  return {
    daysA,
    daysB,
    kwhPerDayA: kA,
    kwhPerDayB: kB,
    kwhPerDayDelta: kB - kA,
    kwhPerDayPct: kA === 0 ? null : ((kB - kA) / kA) * 100,
    ratePerKwhA: rateA,
    ratePerKwhB: rateB,
    amountDelta,
    usageEffect,
    rateEffect,
    mainDriver,
  };
}

export function applianceKwhPerDay(a: Appliance): number {
  if (!(a.watts >= 0) || !(a.hoursPerDay >= 0) || a.hoursPerDay > 24) {
    throw new ValidationError('Watts must be >= 0 and hours per day between 0 and 24');
  }
  return (a.watts * a.hoursPerDay) / 1000;
}

/**
 * What-if: run an appliance fewer hours per day. The money saved uses the
 * user's own average price per unit (their bill amount / units), never a
 * built-in tariff.
 */
export function scenario(a: Appliance, newHoursPerDay: number, ratePerKwh: number): Scenario {
  if (!(ratePerKwh >= 0)) throw new ValidationError('Rate cannot be negative');
  const current = applianceKwhPerDay(a);
  const next = applianceKwhPerDay({ ...a, hoursPerDay: newHoursPerDay });
  const savedKwhPerMonth = (current - next) * 30;
  return {
    appliance: a.name,
    currentKwhPerDay: current,
    newKwhPerDay: next,
    savedKwhPerMonth,
    savedAmountPerMonth: savedKwhPerMonth * ratePerKwh,
  };
}
