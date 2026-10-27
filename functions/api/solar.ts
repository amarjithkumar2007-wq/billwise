// Cloudflare Pages Function: GET /api/solar?lat=..&lon=..&kw=..
// The browser cannot call PVGIS directly (it sends no CORS header), so this tiny proxy does it.
// All logic lives in src/core/solar.ts, which is unit-tested.
import { fetchSolar } from '../../src/core/solar';
import { ValidationError } from '../../src/core/analysis';

export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const q = new URL(request.url).searchParams;
  const json = (body: unknown, status: number, cache = false) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': cache ? 'public, max-age=86400' : 'no-store' },
    });
  try {
    const num = (k: string) => (q.get(k) === null || q.get(k) === '' ? NaN : Number(q.get(k)));
    const s = await fetchSolar({ lat: num('lat'), lon: num('lon'), kw: num('kw') });
    return json(s, 200, true);
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    return json({ error: 'Solar data is not available right now. Try again later.' }, 502);
  }
};
