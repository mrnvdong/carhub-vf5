// Cloudflare Pages Function: /api/route
// High-reliability car routing for Vietnam combining FOSSGIS OSRM (routing.openstreetmap.de)
// and project-osrm fallback, returning GeoJSON polyline + Vietnamese turn-by-turn steps.

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
};

interface TurnStep {
  lat: number;
  lon: number;
  distanceM: number;
  instruction: string;
  arrow: string;
}

function translateManeuver(step: any): { instruction: string; arrow: string } {
  const m = step?.maneuver || {};
  const type = String(m.type || '');
  const mod = String(m.modifier || '');
  const road = step?.name ? ` vào ${step.name}` : '';

  if (type === 'arrive') {
    return { instruction: 'Đến điểm đích', arrow: '🏁' };
  }
  if (type === 'depart') {
    return { instruction: `Xuất phát${road}`, arrow: '⬆️' };
  }
  if (type === 'roundabout' || type === 'rotary') {
    const exit = m.exit ? ` (lối ra thứ ${m.exit})` : '';
    return { instruction: `Vào vòng xuyến${exit}${road}`, arrow: '🔄' };
  }
  if (mod.includes('uturn')) {
    return { instruction: `Quay đầu xe${road}`, arrow: '↩️' };
  }
  if (mod === 'sharp right') {
    return { instruction: `Rẽ ngoặt phải${road}`, arrow: '⤵️' };
  }
  if (mod === 'right') {
    return { instruction: `Rẽ phải${road}`, arrow: '➡️' };
  }
  if (mod === 'slight right') {
    return { instruction: `Chếch sang phải${road}`, arrow: '↗️' };
  }
  if (mod === 'sharp left') {
    return { instruction: `Rẽ ngoặt trái${road}`, arrow: '⤶' };
  }
  if (mod === 'left') {
    return { instruction: `Rẽ trái${road}`, arrow: '⬅️' };
  }
  if (mod === 'slight left') {
    return { instruction: `Chếch sang trái${road}`, arrow: '↖️' };
  }
  return {
    instruction: step?.name ? `Đi thẳng theo ${step.name}` : 'Tiếp tục đi thẳng',
    arrow: '⬆️',
  };
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const fromLat = parseFloat(url.searchParams.get('fromLat') || '');
  const fromLon = parseFloat(url.searchParams.get('fromLon') || '');
  const toLat = parseFloat(url.searchParams.get('toLat') || '');
  const toLon = parseFloat(url.searchParams.get('toLon') || '');

  if ([fromLat, fromLon, toLat, toLon].some((n) => isNaN(n))) {
    return new Response(JSON.stringify({ success: false, error: 'Tọa độ không hợp lệ.' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const coordsPair = `${fromLon.toFixed(5)},${fromLat.toFixed(5)};${toLon.toFixed(
    5
  )},${toLat.toFixed(5)}`;

  const endpoints = [
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsPair}?overview=full&geometries=geojson&steps=true`,
    `https://router.project-osrm.org/route/v1/driving/${coordsPair}?overview=full&geometries=geojson&steps=true`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'CarHub-VF5-Router/1.2 (https://carhub-vf5.pages.dev)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) continue;
      const data: any = await res.json();
      const route = data?.routes?.[0];
      if (!route?.geometry) continue;

      const rawSteps: any[] = route?.legs?.[0]?.steps || [];
      const steps: TurnStep[] = rawSteps
        .map((st: any) => {
          const loc = st?.maneuver?.location;
          if (!Array.isArray(loc) || loc.length < 2) return null;
          const { instruction, arrow } = translateManeuver(st);
          return {
            lon: Number(loc[0]),
            lat: Number(loc[1]),
            distanceM: Math.round(Number(st.distance || 0)),
            instruction,
            arrow,
          };
        })
        .filter((x): x is TurnStep => Boolean(x));

      return new Response(
        JSON.stringify({
          success: true,
          distanceKm: Math.round((Number(route.distance || 0) / 1000) * 10) / 10,
          durationMin: Math.max(1, Math.round(Number(route.duration || 0) / 60)),
          geometry: route.geometry,
          steps,
        }),
        {
          headers: {
            ...CORS_HEADERS,
            'Cache-Control': 'public, max-age=120',
          },
        }
      );
    } catch {
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Không tìm được đường đi ô tô tới địa điểm này. Vui lòng thử địa điểm khác.',
    }),
    { status: 502, headers: CORS_HEADERS }
  );
}
