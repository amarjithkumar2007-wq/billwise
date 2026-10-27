import { ValidationError } from './analysis';

/**
 * Rooftop-solar estimate from the public JRC PVGIS service (no key, no account).
 * PVGIS returns the yearly energy of a PV system of a given size at a location,
 * using satellite/reanalysis weather data. We send only rounded coordinates and a size.
 */
export const SYSTEM_LOSS_PERCENT = 14; // PVGIS default for cables, inverter, dirt etc. Shown to the user as an assumption.
const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

export interface SolarInput { lat: number; lon: number; kw: number }

export interface SolarSummary {
  kwhPerYear: number;
  kwhPerDay: number; // yearly average
  slopeDeg: number | null;
  azimuthDeg: number | null;
  radiationDb: string | null;
}

export function validateSolarInput(i: SolarInput): SolarInput {
  const { lat, lon, kw } = i;
  if (![lat, lon, kw].every(Number.isFinite)) throw new ValidationError('Latitude, longitude and system size must be numbers');
  if (lat < -90 || lat > 90) throw new ValidationError('Latitude must be between -90 and 90');
  if (lon < -180 || lon > 180) throw new ValidationError('Longitude must be between -180 and 180');
  if (kw < 0.1 || kw > 100) throw new ValidationError('System size must be between 0.1 and 100 kW');
  // Round the coordinates to 2 decimals (about 1 km): enough for solar, and less precise than a home address.
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, kw: Math.round(kw * 10) / 10 };
}

export function pvgisUrl(i: SolarInput): string {
  const v = validateSolarInput(i);
  return `${PVGIS}?lat=${v.lat}&lon=${v.lon}&peakpower=${v.kw}&loss=${SYSTEM_LOSS_PERCENT}&optimalangles=1&outputformat=json`;
}

/** Read the PVGIS answer; throw if it does not have the numbers we need. */
export function summarizePvgis(json: unknown): SolarSummary {
  const j = json as any;
  const e = j?.outputs?.totals?.fixed?.E_y;
  if (typeof e !== 'number' || !Number.isFinite(e) || e <= 0) throw new Error('Solar service returned an unexpected answer');
  const m = j?.inputs?.mounting_system?.fixed;
  return {
    kwhPerYear: e,
    kwhPerDay: e / 365,
    slopeDeg: typeof m?.slope?.value === 'number' ? m.slope.value : null,
    azimuthDeg: typeof m?.azimuth?.value === 'number' ? m.azimuth.value : null,
    radiationDb: typeof j?.inputs?.meteo_data?.radiation_db === 'string' ? j.inputs.meteo_data.radiation_db : null,
  };
}

/** Call PVGIS. `fetchImpl` is injectable so this can be tested without the network. */
export async function fetchSolar(i: SolarInput, fetchImpl: typeof fetch = fetch, timeoutMs = 10000): Promise<SolarSummary> {
  const url = pvgisUrl(i); // validates
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`Solar service answered ${r.status}`);
    return summarizePvgis(await r.json());
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    if ((e as Error).name === 'AbortError') throw new Error('Solar service took too long');
    throw e instanceof Error ? e : new Error('Solar service failed');
  } finally {
    clearTimeout(timer);
  }
}

export interface SolarVsUse {
  /** Average generation as a percent of the user's average daily use. Can be above 100. */
  generationPctOfUse: number;
  /** Energy per month that could offset the user's own use: the smaller of generation and use. */
  offsetKwhPerMonth: number;
  /** That energy priced at the user's own average price per unit, or null with no bill. Not a quote. */
  offsetAmountPerMonth: number | null;
}

export function solarVsUse(s: SolarSummary, useKwhPerDay: number, ratePerKwh: number | null): SolarVsUse {
  if (!(useKwhPerDay > 0)) throw new ValidationError('Your daily use must be greater than 0');
  const offset = Math.min(s.kwhPerDay, useKwhPerDay) * 30;
  return {
    generationPctOfUse: (s.kwhPerDay / useKwhPerDay) * 100,
    offsetKwhPerMonth: offset,
    offsetAmountPerMonth: ratePerKwh === null ? null : offset * ratePerKwh,
  };
}
