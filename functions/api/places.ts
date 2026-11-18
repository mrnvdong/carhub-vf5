// Cloudflare Pages Function: /api/places
// High-recall Vietnam place search combining:
// 1. Photon (Komoot OSM) for fast fuzzy & unaccented Vietnamese autocomplete ("ho guom", "san bay", "vincom")
// 2. Nominatim OSM for exact Vietnamese street numbers & addresses
// 3. Overpass API for real nearby POIs (VinFast/V-Green EV chargers, parking lots, cafes, malls)

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

interface PlaceCandidate {
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  distanceKm: number;
  score: number;
}

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

async function fetchOverpassNearby(
  mode: string,
  lat: number,
  lon: number
): Promise<PlaceCandidate[]> {
  let filter = '';
  let radius = 5000;
  let defaultLabel = 'Địa điểm';

  if (mode === 'ev') {
    radius = 12000;
    filter = `nwr(around:${radius},${lat.toFixed(4)},${lon.toFixed(4)})["amenity"="charging_station"];`;
    defaultLabel = 'Trạm sạc xe điện';
  } else if (mode === 'parking') {
    radius = 4500;
    filter = `nwr(around:${radius},${lat.toFixed(4)},${lon.toFixed(4)})["amenity"="parking"];`;
    defaultLabel = 'Bãi đỗ xe ô tô';
  } else if (mode === 'cafe') {
    radius = 3000;
    filter = `nwr(around:${radius},${lat.toFixed(4)},${lon.toFixed(4)})["amenity"="cafe"]["name"];`;
    defaultLabel = 'Quán cà phê';
  } else if (mode === 'mall') {
    radius = 10000;
    filter = `nwr(around:${radius},${lat.toFixed(4)},${lon.toFixed(4)})["shop"="mall"]["name"];`;
    defaultLabel = 'Trung tâm thương mại';
  } else {
    return [];
  }

  const query = `[out:json][timeout:2];(${filter});out center 15;`;
  const endpoints = ['https://overpass-api.de/api/interpreter'];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'CarHub-VF5-Places/2.1 (https://carhub-vf5.pages.dev)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(1800),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      if (!Array.isArray(data?.elements)) continue;

      const out: PlaceCandidate[] = [];
      for (const el of data.elements) {
        const elLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
        const elLon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
        if (typeof elLat !== 'number' || typeof elLon !== 'number') continue;

        const tags = el.tags || {};
        const rawName =
          tags['name:vi'] ||
          tags.name ||
          tags.brand ||
          tags.operator ||
          defaultLabel;
        const name =
          mode === 'ev' && !/trạm sạc|vinfast|v-green|ev/i.test(rawName)
            ? `Trạm sạc ${rawName}`
            : String(rawName);

        const subParts = [
          tags['addr:housenumber'] && tags['addr:street']
            ? `${tags['addr:housenumber']} ${tags['addr:street']}`
            : tags['addr:street'],
          tags['addr:suburb'] || tags['addr:quarter'],
          tags['addr:district'] || tags['addr:city'],
          tags.operator && tags.operator !== rawName ? tags.operator : '',
        ].filter(Boolean);

        const distanceKm = Math.round(haversineKm(lat, lon, elLat, elLon) * 10) / 10;
        const isVinFast = /vinfast|v-green|vinbus|vinhomes|vincom/i.test(
          `${name} ${tags.operator || ''} ${tags.brand || ''}`
        );

        out.push({
          name,
          subtitle: subParts.join(', ') || (mode === 'ev' ? 'Trạm sạc gần vị trí xe' : 'Gần vị trí hiện tại'),
          lat: elLat,
          lon: elLon,
          distanceKm,
          score: (isVinFast ? 25 : 10) - distanceKm,
        });
      }
      if (out.length > 0) return out;
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchNominatim(
  searchText: string,
  lat: number,
  lon: number,
  bounded: boolean
): Promise<PlaceCandidate[]> {
  try {
    const delta = bounded ? 0.15 : 0.35;
    const viewbox = `${(lon - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(
      lon + delta
    ).toFixed(4)},${(lat - delta).toFixed(4)}`;

    const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      searchText
    )}&countrycodes=vn&viewbox=${viewbox}&bounded=${bounded ? '1' : '0'}&limit=10&accept-language=vi`;

    const res = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'CarHub-VF5-Places/2.0 (https://carhub-vf5.pages.dev)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const arr: any = await res.json();
    if (!Array.isArray(arr)) return [];

    return arr
      .map((r: any) => {
        const itemLat = parseFloat(r.lat);
        const itemLon = parseFloat(r.lon);
        if (isNaN(itemLat) || isNaN(itemLon)) return null;
        const parts = String(r.display_name || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => Boolean(s) && !/^\d{5,6}$/.test(s) && s !== 'Việt Nam');
        const name = r.name || parts[0] || 'Địa điểm';
        const subtitle = parts
          .filter((p: string) => p !== name)
          .slice(0, 3)
          .join(', ');
        const distanceKm = Math.round(haversineKm(lat, lon, itemLat, itemLon) * 10) / 10;
        return {
          name,
          subtitle,
          lat: itemLat,
          lon: itemLon,
          distanceKm,
          score: 18 - Math.min(distanceKm * 0.35, 15),
        };
      })
      .filter((x): x is PlaceCandidate => Boolean(x));
  } catch {
    return [];
  }
}

async function fetchPhoton(
  searchText: string,
  lat: number,
  lon: number
): Promise<PlaceCandidate[]> {
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      searchText
    )}&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&limit=12`;

    const res = await fetch(photonUrl, {
      headers: {
        'User-Agent': 'CarHub-VF5-Places/2.0 (https://carhub-vf5.pages.dev)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    if (!Array.isArray(data?.features)) return [];

    return data.features
      .map((f: any) => {
        const props = f?.properties || {};
        const coords = f?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        if (props.countrycode && String(props.countrycode).toUpperCase() !== 'VN') {
          return null;
        }
        const itemLon = Number(coords[0]);
        const itemLat = Number(coords[1]);
        if (isNaN(itemLat) || isNaN(itemLon)) return null;

        const name = props.name || props.street || props.locality || '';
        if (!name) return null;

        const subParts = [
          props.housenumber && props.street
            ? `${props.housenumber} ${props.street}`
            : props.street && props.street !== name
            ? props.street
            : '',
          props.locality && props.locality !== name ? props.locality : '',
          props.district,
          props.city || props.state,
        ].filter(Boolean);

        const distanceKm = Math.round(haversineKm(lat, lon, itemLat, itemLon) * 10) / 10;
        return {
          name: String(name),
          subtitle: subParts.slice(0, 3).join(', '),
          lat: itemLat,
          lon: itemLon,
          distanceKm,
          score: 16 - Math.min(distanceKm * 0.35, 14),
        };
      })
      .filter((x): x is PlaceCandidate => Boolean(x));
  } catch {
    return [];
  }
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const mode = (url.searchParams.get('mode') || '').trim();
  const lat = parseFloat(url.searchParams.get('lat') || '21.0285');
  const lon = parseFloat(url.searchParams.get('lon') || '105.8542');

  const validLat = !isNaN(lat) ? lat : 21.0285;
  const validLon = !isNaN(lon) ? lon : 105.8542;

  if (!mode && !q) {
    return new Response(JSON.stringify({ success: true, items: [] }), {
      headers: CORS_HEADERS,
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `https://carhub-places.internal/v3?m=${encodeURIComponent(mode)}&q=${encodeURIComponent(
      q.toLowerCase()
    )}&lat=${validLat.toFixed(2)}&lon=${validLon.toFixed(2)}`
  );

  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {}
  }

  const tasks: Promise<PlaceCandidate[]>[] = [];

  if (mode) {
    tasks.push(fetchOverpassNearby(mode, validLat, validLon));
    if (mode === 'ev') {
      tasks.push(fetchPhoton('VinFast', validLat, validLon));
      tasks.push(fetchNominatim('Trạm sạc VinFast', validLat, validLon, false));
    } else if (mode === 'parking') {
      tasks.push(fetchPhoton('Bãi đỗ xe', validLat, validLon));
      tasks.push(fetchPhoton('Parking', validLat, validLon));
      tasks.push(fetchNominatim('Bãi đỗ xe', validLat, validLon, true));
    } else if (mode === 'cafe') {
      tasks.push(fetchPhoton('Cafe', validLat, validLon));
      tasks.push(fetchPhoton('Highlands Coffee', validLat, validLon));
      tasks.push(fetchPhoton('Cộng Cà Phê', validLat, validLon));
    } else if (mode === 'mall') {
      tasks.push(fetchPhoton('Vincom', validLat, validLon));
      tasks.push(fetchPhoton('Aeon Mall', validLat, validLon));
      tasks.push(fetchPhoton('Big C', validLat, validLon));
    }
  } else if (q) {
    tasks.push(fetchNominatim(q, validLat, validLon, false));
    tasks.push(fetchPhoton(q, validLat, validLon));
  }

  const batches = await Promise.all(tasks);
  const merged = batches.flat();

  const seen = new Set<string>();
  const deduped: PlaceCandidate[] = [];

  // Sort by score (proximity + exactness) when mode is used, or relevance + proximity for free text
  merged.sort((a, b) =>
    mode ? a.distanceKm - b.distanceKm : b.score - a.score || a.distanceKm - b.distanceKm
  );

  for (const item of merged) {
    const coordKey = `${item.lat.toFixed(3)}:${item.lon.toFixed(3)}`;
    if (seen.has(coordKey)) continue;
    seen.add(coordKey);
    deduped.push(item);
    if (deduped.length >= 10) break;
  }

  const items = deduped.map(({ name, subtitle, lat: iLat, lon: iLon, distanceKm }) => ({
    name,
    subtitle,
    lat: iLat,
    lon: iLon,
    distanceKm,
  }));

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
