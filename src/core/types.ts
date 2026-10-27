export interface Bill {
  id?: string;
  label: string;
  periodStart: string; // ISO date, inclusive
  periodEnd: string; // ISO date, inclusive
  kwh: number; // units consumed in the period
  amount: number; // total payable, in the user's currency
}

export interface Appliance {
  id?: string;
  name: string;
  watts: number;
  hoursPerDay: number;
}

export interface BillChange {
  daysA: number;
  daysB: number;
  kwhPerDayA: number;
  kwhPerDayB: number;
  kwhPerDayDelta: number;
  kwhPerDayPct: number | null;
  ratePerKwhA: number;
  ratePerKwhB: number;
  amountDelta: number;
  /** Part of the amount change caused by using more or fewer units. */
  usageEffect: number;
  /** Part of the amount change caused by a different average price per unit. */
  rateEffect: number;
  mainDriver: 'usage' | 'rate' | 'none';
}

export interface Scenario {
  appliance: string;
  currentKwhPerDay: number;
  newKwhPerDay: number;
  savedKwhPerMonth: number;
  savedAmountPerMonth: number;
}
