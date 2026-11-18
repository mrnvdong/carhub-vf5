// Cloudflare Pages Function: /api/places
// Vietnam place search & nearby VinFast / V-Green EV charging station finder for Cockpit Map

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const mode = url.searchParams.get('mode') || '';
  const lat = parseFloat(url.searchParams.get('lat') || '21.0285');
  const lon = parseFloat(url.searchParams.get('lon') || '105.8542');

  const validLat = !isNaN(lat) ? lat : 21.0285;
  const validLon = !isNaN(lon) ? lon : 105.8542;

  const queries =
    mode === 'ev'
      ? ['Trạm sạc VinFast', 'charging station']
      : q
      ? [q]
      : [];

  if (queries.length === 0) {
    return new Response(JSON.stringify({ success: true, items: [] }), {
      headers: CORS_HEADERS,
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `https://carhub-places.internal/v1?m=${encodeURIComponent(mode)}&q=${encodeURIComponent(
      q
    )}&lat=${validLat.toFixed(2)}&lon=${validLon.toFixed(2)}`
  );

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {}
  }

  const delta = mode === 'ev' ? 0.12 : 0.25;
  const viewbox = `${(validLon - delta).toFixed(4)},${(validLat + delta).toFixed(4)},${(
    validLon + delta
  ).toFixed(4)},${(validLat - delta).toFixed(4)}`;

  const ua = 'CarHub-VF5-CockpitMap/1.2 (https://carhub-vf5.pages.dev)';
  const rawResults: any[] = [];

  await Promise.all(
    queries.map(async (searchText, idx) => {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          searchText
        )}&countrycodes=vn&viewbox=${viewbox}&bounded=${
          mode === 'ev' && idx === 1 ? '1' : '0'
        }&limit=8&accept-language=vi`;

        const res = await fetch(nomUrl, {
          headers: { 'User-Agent': ua, Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const arr = await res.json();
          if (Array.isArray(arr)) {
            rawResults.push(...arr);
          }
        }
      } catch {}
    })
  );

  const seen = new Set<string>();
  const items = rawResults
    .map((r: any) => {
      const itemLat = parseFloat(r.lat);
      const itemLon = parseFloat(r.lon);
      if (isNaN(itemLat) || isNaN(itemLon)) return null;

      const key = `${itemLat.toFixed(4)}:${itemLon.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const parts = String(r.display_name || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);
      const name = r.name || parts[0] || 'Địa điểm';
      const subtitle = parts.slice(1, 4).join(', ');
      const distanceKm = Math.round(haversineKm(validLat, validLon, itemLat, itemLon) * 10) / 10;

      return {
        name,
        subtitle,
        lat: itemLat,
        lon: itemLon,
        distanceKm,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 8);

  const resp = new Response(JSON.stringify({ success: true, items }), {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=600',
    },
  });

  if (cache && items.length > 0) {
    context.waitUntil(cache.put(cacheKey, resp.clone()));
  }

  return resp;
}
