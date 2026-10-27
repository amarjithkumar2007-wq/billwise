import { describe, expect, it } from 'vitest';
import { fetchSolar, pvgisUrl, solarVsUse, summarizePvgis, validateSolarInput } from '../src/core/solar';
import { ValidationError } from '../src/core/analysis';

// Shape taken from a real PVGIS 5.3 PVcalc answer for 17.385, 78.487, 1 kW (fixture trimmed).
const fixture = {
  inputs: { mounting_system: { fixed: { slope: { value: 22, optimal: true }, azimuth: { value: -10, optimal: true } } }, meteo_data: { radiation_db: 'PVGIS-ERA5' } },
  outputs: { totals: { fixed: { E_d: 4.13, E_m: 125.63, E_y: 1507.58 } } },
};
const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe('validateSolarInput', () => {
  it('rounds coordinates to 2 decimals and size to 0.1', () => {
    expect(validateSolarInput({ lat: 17.38512, lon: 78.48719, kw: 2.345 })).toEqual({ lat: 17.39, lon: 78.49, kw: 2.3 });
  });
  it('rejects out of range and non numbers', () => {
    for (const bad of [{ lat: 91, lon: 0, kw: 1 }, { lat: 0, lon: 181, kw: 1 }, { lat: 0, lon: 0, kw: 0 }, { lat: 0, lon: 0, kw: 101 }, { lat: NaN, lon: 0, kw: 1 }])
      expect(() => validateSolarInput(bad)).toThrow(ValidationError);
  });
});

describe('pvgisUrl', () => {
  it('sends only rounded coordinates, size and the stated loss assumption', () => {
    const u = pvgisUrl({ lat: 17.385, lon: 78.487, kw: 1 });
    expect(u).toContain('lat=17.39&lon=78.49&peakpower=1&loss=14&optimalangles=1');
  });
});

describe('summarizePvgis', () => {
  it('reads yearly energy and the angles used', () => {
    const s = summarizePvgis(fixture);
    expect(s.kwhPerYear).toBeCloseTo(1507.58);
    expect(s.kwhPerDay).toBeCloseTo(1507.58 / 365);
    expect(s.slopeDeg).toBe(22);
    expect(s.radiationDb).toBe('PVGIS-ERA5');
  });
  it('throws on a missing or nonsense answer', () => {
    expect(() => summarizePvgis({})).toThrow();
    expect(() => summarizePvgis({ outputs: { totals: { fixed: { E_y: -5 } } } })).toThrow();
    expect(() => summarizePvgis(null)).toThrow();
  });
});

describe('fetchSolar', () => {
  it('returns a summary on success', async () => {
    expect((await fetchSolar({ lat: 17.38, lon: 78.48, kw: 1 }, ok(fixture))).kwhPerYear).toBeCloseTo(1507.58);
  });
  it('fails clearly when the service errors, times out or returns garbage', async () => {
    const bad = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    await expect(fetchSolar({ lat: 1, lon: 1, kw: 1 }, bad)).rejects.toThrow(/503/);
    const slow = ((_u: string, o: { signal: AbortSignal }) => new Promise((_r, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    await expect(fetchSolar({ lat: 1, lon: 1, kw: 1 }, slow, 20)).rejects.toThrow(/too long/);
    await expect(fetchSolar({ lat: 1, lon: 1, kw: 1 }, ok({ nope: 1 }))).rejects.toThrow(/unexpected/);
  });
  it('rejects bad input before any network call', async () => {
    let called = false;
    const spy = (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch;
    await expect(fetchSolar({ lat: 200, lon: 0, kw: 1 }, spy)).rejects.toThrow(ValidationError);
    expect(called).toBe(false);
  });
});

describe('solarVsUse', () => {
  const s = { kwhPerYear: 3650, kwhPerDay: 10, slopeDeg: null, azimuthDeg: null, radiationDb: null };
  it('caps the upper bound at the user average use', () => {
    const big = solarVsUse(s, 4, 6);
    expect(big.generationPctOfUse).toBeCloseTo(250);
    expect(big.maxOffsetKwhPerMonth).toBeCloseTo(120); // 4 kWh/day x 30, not 10 x 30
    expect(big.maxOffsetAmountPerMonth).toBeCloseTo(720);
    const small = solarVsUse(s, 20, 5);
    expect(small.maxOffsetKwhPerMonth).toBeCloseTo(300);
    expect(small.generationPctOfUse).toBeCloseTo(50);
  });
  it('has no money without a bill and rejects zero use', () => {
    expect(solarVsUse(s, 10, null).maxOffsetAmountPerMonth).toBeNull();
    expect(() => solarVsUse(s, 0, 5)).toThrow(ValidationError);
  });
});
