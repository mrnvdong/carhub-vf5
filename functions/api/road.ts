// Cloudflare Pages Function: /api/road
// Real-time road infrastructure, Vietnamese speed limit (QCVN 41 / Thông tư 38/2024),
// Camera phạt nguội CSGT, Biển P.130 (Cấm dừng & Cấm đỗ), Biển P.131a (Cấm đỗ xe),
// road name, lane count, and nearby camera/sign overlay via OpenStreetMap + Vietnam Camera DB.

import { VIETNAM_TRAFFIC_POINTS, VietnamTrafficPoint } from '../_lib/vietnamCameras';
import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

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
  type: 'camera' | 'no_stopping' | 'no_parking' | 'toll' | 'railway' | 'school' | 'signals';
  label: string;
  detail?: string;
  signCode?: 'P.130' | 'P.131a';
  distanceM: number;
  lat: number;
  lon: number;
}

interface ParkingRestrictionInfo {
  type: 'no_stopping' | 'no_parking';
  signCode: 'P.130' | 'P.131a';
  label: string;
  reason: string;
  isVerified: boolean;
  hasCamera?: boolean;
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
  return Math.abs(((a - b + 540) % 360) - 180);
}

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
  // Tách chữ số đầu tiên thay vì gộp chuỗi (tránh "50;60" -> 5060!)
  const match = raw.match(/\b(\d{2,3})\b/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (Number.isFinite(num) && num >= 15 && num <= 130) {
    return raw.toLowerCase().includes('mph') ? Math.round(num * 1.609) : num;
  }
  return null;
}

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

// Phân tích biển Cấm dừng & Cấm đỗ (P.130) / Cấm đỗ xe (P.131a) từ thẻ OSM + Luật GTĐB VN
function detectParkingRestrictionFromWay(
  tags: Record<string, string>,
  isReverseOnTwoWay: boolean
): ParkingRestrictionInfo | null {
  const side = isReverseOnTwoWay ? 'left' : 'right';
  const vals = [
    tags['parking:both:restriction'],
    tags[`parking:${side}:restriction`],
    tags['parking:condition:both'],
    tags[`parking:condition:${side}`],
    tags['parking:both'],
    tags[`parking:${side}`],
    tags['parking:lane:both'],
    tags[`parking:lane:${side}`],
    tags.traffic_sign,
    tags.no_stopping === 'yes' ? 'no_stopping' : '',
    tags.no_parking === 'yes' ? 'no_parking' : '',
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  const joined = vals.join(' ');

  if (
    joined.includes('no_stopping') ||
    joined.includes('p.130') ||
    joined.includes('vn:p.130') ||
    joined.includes('no_standing')
  ) {
    return {
      type: 'no_stopping',
      signCode: 'P.130',
      label: 'Cấm dừng & Cấm đỗ',
      reason: 'Biển P.130 trên tuyến đường (OSM)',
      isVerified: true,
    };
  }

  if (
    joined.includes('no_parking') ||
    joined.includes('p.131') ||
    joined.includes('vn:p.131') ||
    vals.some((v) => v === 'no')
  ) {
    return {
      type: 'no_parking',
      signCode: 'P.131a',
      label: 'Cấm đỗ xe',
      reason: 'Biển P.131a trên tuyến đường (OSM)',
      isVerified: true,
    };
  }

  // Luật TTATGTĐB Việt Nam: Cấm dừng & cấm đỗ tuyệt đối trên Cao tốc, Cầu, Hầm đường bộ!
  if (tags.tunnel === 'yes' || tags.tunnel === 'building_passage') {
    return {
      type: 'no_stopping',
      signCode: 'P.130',
      label: 'Cấm dừng & Cấm đỗ',
      reason: 'Trong hầm đường bộ (Luật GTĐB)',
      isVerified: true,
    };
  }
  if (tags.bridge === 'yes' || tags.bridge === 'viaduct') {
    return {
      type: 'no_stopping',
      signCode: 'P.130',
      label: 'Cấm dừng & Cấm đỗ',
      reason: 'Trên cầu / cầu cạn (Luật GTĐB)',
      isVerified: true,
    };
  }
  if (tags.highway === 'motorway' || tags.highway === 'motorway_link') {
    return {
      type: 'no_stopping',
      signCode: 'P.130',
      label: 'Cấm dừng & Cấm đỗ',
      reason: 'Cao tốc — chỉ dừng làn khẩn cấp khi gặp sự cố',
      isVerified: true,
    };
  }

  return null;
}

function classifyOsmNodeHazard(t: Record<string, string>): {
  type: HazardItem['type'];
  shortLabel: string;
  detail?: string;
  signCode?: 'P.130' | 'P.131a';
} | null {
  const ts = String(t.traffic_sign || '').toLowerCase();
  if (ts.includes('p.130') || ts.includes('no_stopping') || t.enforcement === 'not_stopping') {
    return {
      type: 'no_stopping',
      shortLabel: 'Cấm dừng & đỗ',
      detail: 'Biển P.130 cấm dừng & đỗ xe',
      signCode: 'P.130',
    };
  }
  if (ts.includes('p.131') || ts.includes('no_parking') || t.enforcement === 'parking') {
    return {
      type: 'no_parking',
      shortLabel: 'Cấm đỗ xe',
      detail: 'Biển P.131a cấm đỗ xe',
      signCode: 'P.131a',
    };
  }
  if (
    t.highway === 'speed_camera' ||
    t.enforcement === 'maxspeed' ||
    t.enforcement === 'traffic_signals' ||
    (t.man_made === 'surveillance' &&
      (t['surveillance:type'] === 'camera' ||
        t.surveillance === 'traffic' ||
        t['surveillance:zone'] === 'traffic' ||
        t['surveillance:zone'] === 'road'))
  ) {
    const detail =
      t.enforcement === 'traffic_signals'
        ? 'Camera phạt nguội vượt đèn đỏ'
        : t.maxspeed
        ? `Camera phạt nguội tốc độ ${t.maxspeed} km/h`
        : 'Camera phạt nguội giao thông';
    return { type: 'camera', shortLabel: 'Camera phạt nguội', detail };
  }
  if (t.barrier === 'toll_booth') {
    return { type: 'toll', shortLabel: 'Trạm thu phí' };
  }
  if (t.railway === 'level_crossing') {
    return { type: 'railway', shortLabel: 'Đường sắt' };
  }
  if (t.amenity === 'school') {
    return { type: 'school', shortLabel: 'Gần trường học' };
  }
  if (t.highway === 'traffic_signals') {
    return { type: 'signals', shortLabel: 'Đèn giao thông' };
  }
  return null;
}

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const CORS_HEADERS = buildTrustedJsonHeaders(request);
  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }
  const url = new URL(request.url);
  const mode = (url.searchParams.get('mode') || '').trim().toLowerCase();
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

  // =========================================================================
  // MODE = CAMERAS: Trả về toàn bộ điểm Camera Phạt Nguội + Biển P.130/P.131a trong bán kính radiusKm
  // để hiển thị thành lớp cảnh báo trực quan trên Bản đồ 3D Cockpit (như Vietmap Live!)
  // =========================================================================
  if (mode === 'cameras') {
    const radiusKmRaw = parseFloat(url.searchParams.get('radiusKm') || '10');
    const radiusM = Math.max(1000, Math.min(35000, (isNaN(radiusKmRaw) ? 10 : radiusKmRaw) * 1000));

    const nearbyPoints: Array<VietnamTrafficPoint & { distanceM: number }> = [];
    for (const pt of VIETNAM_TRAFFIC_POINTS) {
      const distM = Math.round(haversineM(lat, lon, pt.lat, pt.lon));
      if (distM <= radiusM) {
        nearbyPoints.push({ ...pt, distanceM: distM });
      }
    }
    nearbyPoints.sort((a, b) => a.distanceM - b.distanceM);

    return new Response(
      JSON.stringify({
        success: true,
        count: nearbyPoints.length,
        points: nearbyPoints.slice(0, 60),
      }),
      {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
      }
    );
  }

  // =========================================================================
  // MODE MẶC ĐỊNH: Hạ tầng đường bộ, biển P.127, Camera phạt nguội & Cấm dừng/Cấm đỗ (P.130/P.131a)
  // =========================================================================
  const gridLat = Math.round(lat * 900) / 900;
  const gridLon = Math.round(lon * 900) / 900;
  const d = 0.0022; // ~245m radius quanh ô lưới
  const osmUrl = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${(gridLon - d).toFixed(
    5
  )},${(gridLat - d).toFixed(5)},${(gridLon + d).toFixed(5)},${(gridLat + d).toFixed(5)}`;

  const cache = (caches as any).default;
  const osmCacheKey = new Request(
    `https://carhub-osm-grid.internal/v3/${gridLat.toFixed(4)}/${gridLon.toFixed(4)}`
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
          'User-Agent': 'CarHub-VF5-HUD/2.1 (https://carhub-vf5.pages.dev)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4500),
      });

      if (osmRes.ok) {
        const osmJson: any = await osmRes.json();
        const rawElements: any[] = Array.isArray(osmJson?.elements) ? osmJson.elements : [];

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
                bridge: el.tags.bridge,
                tunnel: el.tags.tunnel,
                traffic_sign: el.tags.traffic_sign,
                no_stopping: el.tags.no_stopping,
                no_parking: el.tags.no_parking,
                'parking:both': el.tags['parking:both'],
                'parking:right': el.tags['parking:right'],
                'parking:left': el.tags['parking:left'],
                'parking:both:restriction': el.tags['parking:both:restriction'],
                'parking:right:restriction': el.tags['parking:right:restriction'],
                'parking:left:restriction': el.tags['parking:left:restriction'],
                'parking:lane:both': el.tags['parking:lane:both'],
                'parking:lane:right': el.tags['parking:lane:right'],
                'parking:lane:left': el.tags['parking:lane:left'],
                'parking:condition:both': el.tags['parking:condition:both'],
                'parking:condition:right': el.tags['parking:condition:right'],
                'parking:condition:left': el.tags['parking:condition:left'],
              },
            });
            for (const nid of el.nodes) neededNodeIds.add(nid);
          }
        }

        const keptNodes: any[] = [];
        for (const el of rawElements) {
          if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
            const hz = el.tags ? classifyOsmNodeHazard(el.tags) : null;
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

  // 1) Thu thập cảnh báo từ OSM nodes
  const nodeMap = new Map<number, OsmNode>();
  const hazards: HazardItem[] = [];
  let nearbyZoneParkingRestriction: ParkingRestrictionInfo | null = null;

  if (Array.isArray(elements)) {
    for (const el of elements) {
      if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
        nodeMap.set(el.id, el);
        const t = el.tags;
        if (!t) continue;
        const classified = classifyOsmNodeHazard(t);
        if (!classified) continue;

        const distM = Math.round(haversineM(lat, lon, el.lat, el.lon));
        const maxDist = classified.type === 'camera' ? 400 : 300;
        if (distM > maxDist) continue;

        // Cấm dừng / Cấm đỗ áp dụng quanh xe (không cần lọc hướng); các loại khác lọc hướng phía trước
        if (
          classified.type !== 'no_stopping' &&
          classified.type !== 'no_parking' &&
          heading !== null &&
          distM > 30
        ) {
          const brg = bearingDeg(lat, lon, el.lat, el.lon);
          if (angleDiff(heading, brg) > 85) continue;
        }

        if (classified.type === 'school' && distM > 180) continue;
        if (classified.type === 'signals' && distM > 150) continue;

        hazards.push({
          type: classified.type,
          label:
            classified.type === 'school'
              ? classified.shortLabel
              : `${classified.shortLabel} ${distM}m`,
          detail: classified.detail,
          signCode: classified.signCode,
          distanceM: distM,
          lat: el.lat,
          lon: el.lon,
        });

        if (
          (classified.type === 'no_stopping' || classified.type === 'no_parking') &&
          distM <= 160 &&
          !nearbyZoneParkingRestriction
        ) {
          nearbyZoneParkingRestriction = {
            type: classified.type,
            signCode: classified.signCode || (classified.type === 'no_stopping' ? 'P.130' : 'P.131a'),
            label: classified.shortLabel,
            reason: classified.detail || 'Biển cấm dừng/đỗ trên bản đồ',
            isVerified: true,
          };
        }
      }
    }
  }

  // 2) Ghép thêm dữ liệu Camera Phạt Nguội & Tuyến Cấm Dừng/Cấm Đỗ trọng điểm Việt Nam (bán kính 550m!)
  for (const pt of VIETNAM_TRAFFIC_POINTS) {
    const distM = Math.round(haversineM(lat, lon, pt.lat, pt.lon));
    const isParkingType = pt.kind === 'no_stopping' || pt.kind === 'no_parking';
    const maxDist = isParkingType ? 280 : 550;
    if (distM > maxDist) continue;

    if (!isParkingType && heading !== null && distM > 45) {
      const brg = bearingDeg(lat, lon, pt.lat, pt.lon);
      if (angleDiff(heading, brg) > 85) continue;
    }

    if (isParkingType) {
      const signCode = pt.signCode || (pt.kind === 'no_stopping' ? 'P.130' : 'P.131a');
      hazards.push({
        type: pt.kind,
        label:
          pt.kind === 'no_stopping'
            ? `Cấm dừng & đỗ (${signCode})`
            : `Cấm đỗ xe (${signCode})`,
        detail: pt.note || pt.name,
        signCode,
        distanceM: distM,
        lat: pt.lat,
        lon: pt.lon,
      });
      if (distM <= 240) {
        // Không để biển P.131a (nhẹ hơn) ghi đè biển P.130 (cấm dừng & đỗ — nghiêm trọng hơn)
        if (!nearbyZoneParkingRestriction || pt.kind === 'no_stopping') {
          nearbyZoneParkingRestriction = {
            type: pt.kind,
            signCode,
            label: pt.kind === 'no_stopping' ? 'Cấm dừng & Cấm đỗ' : 'Cấm đỗ xe',
            reason: pt.note || `${pt.name} (${pt.road})`,
            isVerified: true,
            hasCamera: Boolean(pt.hasCamera),
          };
        }
      }
    } else {
      const camLabel =
        pt.kind === 'camera_speed'
          ? `Cam tốc độ ${distM}m`
          : pt.kind === 'camera_redlight'
          ? `Cam phạt nguội ${distM}m`
          : `Cam làn đường ${distM}m`;
      hazards.push({
        type: 'camera',
        label: camLabel,
        detail: `${pt.name}${pt.note ? ` • ${pt.note}` : ''}`,
        distanceM: distM,
        lat: pt.lat,
        lon: pt.lon,
      });
    }
  }

  // 3) Sắp xếp & khử trùng theo tọa độ gần nhau (giữ tối đa 4 cảnh báo ưu tiên: Camera > P.130 > P.131a > Tàu > Trạm phí)
  const priorityOrder: Record<HazardItem['type'], number> = {
    camera: 1,
    no_stopping: 2,
    no_parking: 3,
    railway: 4,
    toll: 5,
    school: 6,
    signals: 7,
  };
  hazards.sort(
    (a, b) => priorityOrder[a.type] - priorityOrder[b.type] || a.distanceM - b.distanceM
  );
  const uniqueHazards: HazardItem[] = [];
  const seenKey = new Set<string>();
  for (const h of hazards) {
    const k = `${h.type}:${h.lat.toFixed(3)},${h.lon.toFixed(3)}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    uniqueHazards.push(h);
    if (uniqueHazards.length >= 4) break;
  }

  // 4) Tìm đoạn đường chính xác xe đang chạy để đọc biển P.127 & P.130/P.131a theo mặt đường
  let bestWay: any = null;
  let bestScore = Infinity;
  let bestReverse = false;

  if (Array.isArray(elements)) {
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
          if (diffForward > 95) score += 35;
        } else if (isOneWayRev) {
          if (diffBackward > 95) score += 35;
          isReverse = true;
        } else {
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
        parkingRestriction: nearbyZoneParkingRestriction,
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
  const wayParking = detectParkingRestrictionFromWay(t, bestReverse);
  // Ưu tiên P.130 (cấm dừng & đỗ) nếu có giữa cả 2 nguồn (tuyến cấm cố định hoặc thẻ OSM đường bộ)
  const parkingRestriction =
    nearbyZoneParkingRestriction?.type === 'no_stopping'
      ? nearbyZoneParkingRestriction
      : wayParking || nearbyZoneParkingRestriction;

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
      parkingRestriction,
      hazards: uniqueHazards,
    }),
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
  );
}
