// Cloudflare Pages Function: /api/road
// Real-time road infrastructure, Vietnamese speed limit (QCVN 41 / Thông tư 38/2024),
// road name, lane count, and forward hazard/camera detection via OpenStreetMap 0.6 JSON API.

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

const DRIVABLE_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service',
]);

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface HazardItem {
  type: 'camera' | 'toll' | 'railway' | 'school' | 'signals';
  label: string;
  distanceM: number;
  lat: number;
  lon: number;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

// Perpendicular distance from point P to segment AB in meters (local equirectangular projection)
function pointToSegmentDistM(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { distM: number; segBearing: number } {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * cosLat;

  const ax = (aLon - pLon) * mPerDegLon;
  const ay = (aLat - pLat) * mPerDegLat;
  const bx = (bLon - pLon) * mPerDegLon;
  const by = (bLat - pLat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0.0001) {
    t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  }

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const distM = Math.sqrt(cx * cx + cy * cy);
  const segBearing = bearingDeg(aLat, aLon, bLat, bLon);
  return { distM, segBearing };
}

function parseMaxspeed(tags: Record<string, string>, isReverseOnTwoWay: boolean): number | null {
  const raw = isReverseOnTwoWay
    ? tags['maxspeed:backward'] || tags.maxspeed
    : tags['maxspeed:forward'] || tags.maxspeed;
  if (!raw) return null;
  const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (!isNaN(num) && num >= 15 && num <= 130) {
    return raw.toLowerCase().includes('mph') ? Math.round(num * 1.609) : num;
  }
  return null;
}

// Fallback statutory speed limit reference in Vietnam (Thông tư 38/2024/TT-BGTVT)
function inferVietnamStatutoryLimit(tags: Record<string, string>): {
  limit: number;
  roadTypeLabel: string;
} {
  const hw = tags.highway || 'residential';
  const isDividedOneWay = tags.oneway === 'yes' || tags.oneway === '1';

  switch (hw) {
    case 'motorway':
      return { limit: 100, roadTypeLabel: 'Cao tốc' };
    case 'motorway_link':
      return { limit: 60, roadTypeLabel: 'Nhánh cao tốc' };
    case 'trunk':
      return {
        limit: isDividedOneWay ? 60 : 50,
        roadTypeLabel: 'Quốc lộ / Trục chính',
      };
    case 'trunk_link':
      return { limit: 50, roadTypeLabel: 'Nhánh quốc lộ' };
    case 'primary':
    case 'primary_link':
      return {
        limit: isDividedOneWay ? 60 : 50,
        roadTypeLabel: 'Đường chính',
      };
    case 'secondary':
    case 'secondary_link':
    case 'tertiary':
    case 'tertiary_link':
      return {
        limit: isDividedOneWay ? 60 : 50,
        roadTypeLabel: 'Đường đô thị',
      };
    case 'living_street':
    case 'service':
      return { limit: 30, roadTypeLabel: 'Đường nội bộ' };
    default:
      return { limit: 50, roadTypeLabel: 'Khu dân cư' };
  }
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat') || '');
  const lon = parseFloat(url.searchParams.get('lon') || '');
  const headingParam = url.searchParams.get('heading');
  const heading =
    headingParam !== null && headingParam !== '' && !isNaN(Number(headingParam))
      ? ((Number(headingParam) % 360) + 360) % 360
      : null;

  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid coordinates' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Cache pruned road/hazard OSM grid cell (~110m grid, ~210m bbox radius) for 24h at Cloudflare Edge
  const gridLat = Math.round(lat * 900) / 900;
  const gridLon = Math.round(lon * 900) / 900;
  const d = 0.0019; // ~210m radius around grid center (2.2x smaller payload than 0.0028)
  const osmUrl = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${(gridLon - d).toFixed(
    5
  )},${(gridLat - d).toFixed(5)},${(gridLon + d).toFixed(5)},${(gridLat + d).toFixed(5)}`;

  const cache = (caches as any).default;
  const osmCacheKey = new Request(
    `https://carhub-osm-grid.internal/v2/${gridLat.toFixed(4)}/${gridLon.toFixed(4)}`
  );

  let elements: any[] | null = null;

  if (cache) {
    try {
      const cachedOsm = await cache.match(osmCacheKey);
      if (cachedOsm) {
        const parsed = await cachedOsm.json();
        elements = parsed?.elements || null;
      }
    } catch {}
  }

  if (!elements) {
    try {
      const osmRes = await fetch(osmUrl, {
        headers: {
          'User-Agent': 'CarHub-VF5-HUD/2.0 (https://carhub-vf5.pages.dev)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4500),
      });

      if (osmRes.ok) {
        const osmJson: any = await osmRes.json();
        const rawElements: any[] = Array.isArray(osmJson?.elements) ? osmJson.elements : [];

        // Prune buildings/trees/relations before caching: keep ONLY drivable highway ways,
        // their referenced geometry nodes, and traffic hazard/camera nodes (>80% smaller!).
        const neededNodeIds = new Set<number>();
        const keptWays: any[] = [];
        for (const el of rawElements) {
          if (
            el.type === 'way' &&
            el.tags?.highway &&
            DRIVABLE_HIGHWAYS.has(el.tags.highway) &&
            Array.isArray(el.nodes)
          ) {
            keptWays.push({
              type: 'way',
              id: el.id,
              nodes: el.nodes,
              tags: {
                highway: el.tags.highway,
                name: el.tags.name,
                'name:vi': el.tags['name:vi'],
                ref: el.tags.ref,
                maxspeed: el.tags.maxspeed,
                'maxspeed:forward': el.tags['maxspeed:forward'],
                'maxspeed:backward': el.tags['maxspeed:backward'],
                lanes: el.tags.lanes,
                oneway: el.tags.oneway,
              },
            });
            for (const nid of el.nodes) neededNodeIds.add(nid);
          }
        }

        const isHazardTag = (t: Record<string, string> | undefined) => {
          if (!t) return false;
          return (
            t.highway === 'speed_camera' ||
            t.enforcement === 'maxspeed' ||
            (t.man_made === 'surveillance' &&
              (t['surveillance:type'] === 'camera' || t.surveillance === 'traffic')) ||
            t.barrier === 'toll_booth' ||
            t.railway === 'level_crossing' ||
            t.amenity === 'school' ||
            t.highway === 'traffic_signals'
          );
        };

        const keptNodes: any[] = [];
        for (const el of rawElements) {
          if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
            const hz = isHazardTag(el.tags);
            if (hz || neededNodeIds.has(el.id)) {
              keptNodes.push(
                hz
                  ? { type: 'node', id: el.id, lat: el.lat, lon: el.lon, tags: el.tags }
                  : { type: 'node', id: el.id, lat: el.lat, lon: el.lon }
              );
            }
          }
        }

        elements = [...keptNodes, ...keptWays];
        if (cache && elements.length > 0) {
          const toCache = new Response(JSON.stringify({ elements }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=86400, s-maxage=86400',
            },
          });
          context.waitUntil(cache.put(osmCacheKey, toCache));
        }
      }
    } catch (err) {
      console.warn('OSM bbox fetch failed:', err);
    }
  }

  if (!elements || elements.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        roadName: null,
        speedLimit: null,
        isVerifiedLimit: false,
        hazards: [],
      }),
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=30' } }
    );
  }

  // Index nodes & detect nearby traffic hazards/cameras
  const nodeMap = new Map<number, OsmNode>();
  const hazards: HazardItem[] = [];

  for (const el of elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeMap.set(el.id, el);
      const t = el.tags;
      if (!t) continue;

      const distM = Math.round(haversineM(lat, lon, el.lat, el.lon));
      if (distM > 320) continue;

      // Filter out hazards that are already behind the car (> 80° off current heading)
      if (heading !== null && distM > 25) {
        const brg = bearingDeg(lat, lon, el.lat, el.lon);
        if (angleDiff(heading, brg) > 80) continue;
      }

      if (
        t.highway === 'speed_camera' ||
        t.enforcement === 'maxspeed' ||
        (t.man_made === 'surveillance' &&
          (t['surveillance:type'] === 'camera' || t.surveillance === 'traffic'))
      ) {
        hazards.push({ type: 'camera', label: `Camera ${distM}m`, distanceM: distM, lat: el.lat, lon: el.lon });
      } else if (t.barrier === 'toll_booth') {
        hazards.push({ type: 'toll', label: `Trạm thu phí ${distM}m`, distanceM: distM, lat: el.lat, lon: el.lon });
      } else if (t.railway === 'level_crossing') {
        hazards.push({ type: 'railway', label: `Đường sắt ${distM}m`, distanceM: distM, lat: el.lat, lon: el.lon });
      } else if (t.amenity === 'school' && distM <= 180) {
        hazards.push({ type: 'school', label: 'Gần trường học', distanceM: distM, lat: el.lat, lon: el.lon });
      } else if (t.highway === 'traffic_signals' && distM <= 150) {
        hazards.push({ type: 'signals', label: `Đèn giao thông ${distM}m`, distanceM: distM, lat: el.lat, lon: el.lon });
      }
    }
  }

  // Deduplicate hazards by type (keep closest of each type, prioritize camera/railway/toll first)
  const priorityOrder: Record<HazardItem['type'], number> = {
    camera: 1,
    railway: 2,
    toll: 3,
    school: 4,
    signals: 5,
  };
  hazards.sort(
    (a, b) => priorityOrder[a.type] - priorityOrder[b.type] || a.distanceM - b.distanceM
  );
  const uniqueHazards: HazardItem[] = [];
  const seenTypes = new Set<string>();
  for (const h of hazards) {
    if (seenTypes.has(h.type)) continue;
    seenTypes.add(h.type);
    uniqueHazards.push(h);
    if (uniqueHazards.length >= 2) break;
  }

  // Find the exact road way the vehicle is currently driving on
  let bestWay: any = null;
  let bestScore = Infinity;
  let bestReverse = false;

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.highway || !Array.isArray(el.nodes)) continue;
    const hw = el.tags.highway;
    if (!DRIVABLE_HIGHWAYS.has(hw)) continue;

    let minWayDist = Infinity;
    let closestBearing = 0;

    for (let i = 0; i < el.nodes.length - 1; i++) {
      const nA = nodeMap.get(el.nodes[i]);
      const nB = nodeMap.get(el.nodes[i + 1]);
      if (!nA || !nB) continue;

      const { distM, segBearing } = pointToSegmentDistM(
        lat,
        lon,
        nA.lat,
        nA.lon,
        nB.lat,
        nB.lon
      );
      if (distM < minWayDist) {
        minWayDist = distM;
        closestBearing = segBearing;
      }
    }

    if (minWayDist > 65) continue;

    // Score penalty: penalize unnamed service alleys if a real street is within GPS tolerance,
    // and penalize wrong-way carriageways on divided highways when heading is available.
    let score = minWayDist;
    if (hw === 'service' && !el.tags.name) score += 22;
    else if (hw === 'service') score += 12;

    let isReverse = false;
    if (heading !== null) {
      const diffForward = angleDiff(heading, closestBearing);
      const diffBackward = angleDiff(heading, (closestBearing + 180) % 360);
      const isOneWay = el.tags.oneway === 'yes' || el.tags.oneway === '1';
      const isOneWayRev = el.tags.oneway === '-1';

      if (isOneWay) {
        if (diffForward > 95) score += 35; // Opposite carriageway on divided highway!
      } else if (isOneWayRev) {
        if (diffBackward > 95) score += 35;
        isReverse = true;
      } else {
        // Two-way road: align along either forward or backward bearing
        if (Math.min(diffForward, diffBackward) > 65) score += 10;
        if (diffBackward < diffForward) isReverse = true;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestWay = el;
      bestReverse = isReverse;
    }
  }

  if (!bestWay) {
    return new Response(
      JSON.stringify({
        success: true,
        roadName: null,
        roadRef: null,
        roadTypeLabel: null,
        speedLimit: null,
        isVerifiedLimit: false,
        lanes: null,
        oneway: false,
        hazards: uniqueHazards,
      }),
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
    );
  }

  const t = bestWay.tags || {};
  const verifiedSpeed = parseMaxspeed(t, bestReverse);
  const statutory = inferVietnamStatutoryLimit(t);
  const finalLimit = verifiedSpeed ?? statutory.limit;
  const lanesNum = t.lanes ? parseInt(t.lanes, 10) : null;

  return new Response(
    JSON.stringify({
      success: true,
      roadName: t.name || t['name:vi'] || statutory.roadTypeLabel,
      roadRef: t.ref || null,
      roadTypeLabel: statutory.roadTypeLabel,
      speedLimit: finalLimit,
      isVerifiedLimit: verifiedSpeed !== null,
      lanes: lanesNum && !isNaN(lanesNum) ? lanesNum : null,
      oneway: t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1',
      hazards: uniqueHazards,
    }),
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
  );
}
