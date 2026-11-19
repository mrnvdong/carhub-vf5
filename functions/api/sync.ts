// Cloudflare Pages Function: /api/sync
// Zero-login 4-8 char Car Code Sync (e.g., VF5-6868) for syncing:
// - Favorites & Playlists
// - Saved Map Places (Home, Work, EV Chargers)
// - Send-to-Car Navigation Target (pendingNav: phone sends destination -> VF5 Cockpit auto-routes!)
// Backed by Cloudflare KV (CARHUB_KV) + Edge Cache + local dev memory fallback.

const memorySyncStore = new Map<string, string>();

function normalizeCode(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/^VF5[-_\s]?/, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  if (cleaned.length < 4) return null;
  return cleaned;
}

function buildEdgeCacheKey(code: string): Request {
  return new Request(`https://carhub-vf5-sync.internal/v2/code/${encodeURIComponent(code)}`);
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sanitizeTrack(v: any) {
  if (!v || typeof v.id !== 'string' || !/^([a-zA-Z0-9_-]{11}|sc_\d{4,16})$/.test(v.id)) {
    return null;
  }
  const isSc = v.id.startsWith('sc_') || v.source === 'soundcloud';
  return {
    id: v.id,
    source: isSc ? 'soundcloud' : 'youtube',
    title: String(v.title || '').slice(0, 200),
    uploaderName: String(v.uploaderName || '').slice(0, 100),
    thumbnail: String(
      v.thumbnail || (isSc ? '' : `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`)
    ).slice(0, 300),
    duration: typeof v.duration === 'number' ? v.duration : 0,
    durationText: String(v.durationText || '').slice(0, 20),
  };
}

function sanitizePlace(p: any) {
  if (!p) return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const slot = p.slot === 'home' || p.slot === 'work' ? p.slot : 'custom';
  return {
    id: String(p.id || `${slot}-${Date.now()}`).slice(0, 48),
    slot,
    icon: String(p.icon || (slot === 'home' ? '🏠' : slot === 'work' ? '🏢' : '⭐')).slice(0, 8),
    name: String(p.name || 'Địa điểm đã ghim').trim().slice(0, 120),
    subtitle: String(p.subtitle || '').trim().slice(0, 180),
    lat,
    lon,
  };
}

function sanitizePendingNav(nav: any) {
  if (!nav) return null;
  const lat = Number(nav.lat);
  const lon = Number(nav.lon);
  if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    id: String(nav.id || `nav-${Date.now()}`).slice(0, 64),
    name: String(nav.name || 'Điểm đến từ điện thoại').trim().slice(0, 140),
    subtitle: String(nav.subtitle || '').trim().slice(0, 180),
    lat,
    lon,
    sentAt: String(nav.sentAt || new Date().toISOString()).slice(0, 40),
  };
}

async function readStoredRecord(code: string, env: any): Promise<{ data: any; storage: string } | null> {
  if (env?.CARHUB_KV) {
    try {
      const kvVal = await env.CARHUB_KV.get(`sync:${code}`);
      if (kvVal) {
        return { data: JSON.parse(kvVal), storage: 'cloudflare-kv' };
      }
    } catch {}
  }

  const cache = (caches as any).default;
  if (cache) {
    try {
      const cachedResp = await cache.match(buildEdgeCacheKey(code));
      if (cachedResp) {
        return { data: await cachedResp.json(), storage: 'cloudflare-edge' };
      }
    } catch {}
  }

  if (memorySyncStore.has(code)) {
    return { data: JSON.parse(memorySyncStore.get(code)!), storage: 'memory-dev' };
  }

  return null;
}

async function writeStoredRecord(code: string, payload: any, env: any): Promise<string> {
  const serialized = JSON.stringify(payload);
  let storageUsed = 'memory-dev';

  memorySyncStore.set(code, serialized);

  const cache = (caches as any).default;
  if (cache) {
    try {
      const cacheResp = new Response(serialized, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=2592000, s-maxage=2592000',
        },
      });
      await cache.put(buildEdgeCacheKey(code), cacheResp);
      storageUsed = 'cloudflare-edge';
    } catch {}
  }

  if (env?.CARHUB_KV) {
    try {
      await env.CARHUB_KV.put(`sync:${code}`, serialized, {
        expirationTtl: 31536000, // 365 days
      });
      storageUsed = 'cloudflare-kv';
    } catch {}
  }

  return storageUsed;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get('code'));
  const navOnly = url.searchParams.get('navOnly') === '1';

  if (!code) {
    return new Response(
      JSON.stringify({ success: false, error: 'Mã đồng bộ phải có ít nhất 4 ký tự/chữ số.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const record = await readStoredRecord(code, env);

  if (navOnly) {
    return new Response(
      JSON.stringify({
        success: true,
        code,
        pendingNav: record?.data?.pendingNav || null,
      }),
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
    );
  }

  if (record) {
    return new Response(
      JSON.stringify({
        success: true,
        code,
        storage: record.storage,
        data: {
          updatedAt: record.data.updatedAt || new Date().toISOString(),
          favorites: Array.isArray(record.data.favorites) ? record.data.favorites : [],
          playlists: Array.isArray(record.data.playlists) ? record.data.playlists : [],
          savedPlaces: Array.isArray(record.data.savedPlaces) ? record.data.savedPlaces : [],
          pendingNav: record.data.pendingNav || null,
        },
      }),
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: false,
      error: `Chưa tìm thấy dữ liệu cho mã VF5-${code}. Hãy bấm "Đẩy lên mây" từ điện thoại/máy tính trước.`,
    }),
    { status: 404, headers: CORS_HEADERS }
  );
}

export async function onRequestPost(context: any) {
  const { request, env } = context;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Dữ liệu gửi lên không hợp lệ.' }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const code = normalizeCode(body?.code);
  if (!code) {
    return new Response(
      JSON.stringify({ success: false, error: 'Mã xe phải từ 4 đến 8 ký tự số hoặc chữ.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const action: string = body?.action || 'full';
  const existing = (await readStoredRecord(code, env))?.data || null;

  // 1. Send-to-Car Navigation: update ONLY pendingNav without overwriting music playlists!
  if (action === 'sendNav') {
    const cleanNav = sanitizePendingNav(body?.pendingNav);
    if (!cleanNav) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tọa độ điểm đến gửi lên xe không hợp lệ.' }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const nextPayload = {
      updatedAt: existing?.updatedAt || new Date().toISOString(),
      favorites: Array.isArray(existing?.favorites) ? existing.favorites : [],
      playlists: Array.isArray(existing?.playlists) ? existing.playlists : [],
      savedPlaces: Array.isArray(existing?.savedPlaces) ? existing.savedPlaces : [],
      pendingNav: cleanNav,
    };

    const storageUsed = await writeStoredRecord(code, nextPayload, env);
    return new Response(
      JSON.stringify({
        success: true,
        code,
        storage: storageUsed,
        pendingNav: cleanNav,
      }),
      { headers: CORS_HEADERS }
    );
  }

  // 2. Clear pendingNav once the VF5 Cockpit has received and started routing
  if (action === 'clearNav') {
    if (existing && existing.pendingNav) {
      const nextPayload = {
        ...existing,
        pendingNav: null,
      };
      await writeStoredRecord(code, nextPayload, env);
    }
    return new Response(JSON.stringify({ success: true, code }), { headers: CORS_HEADERS });
  }

  // 3. Full Sync (Favorites + Playlists + Saved Places)
  const rawFavorites = Array.isArray(body?.favorites) ? body.favorites : [];
  const favorites = rawFavorites.map(sanitizeTrack).filter(Boolean).slice(0, 200);

  const rawPlaylists = Array.isArray(body?.playlists) ? body.playlists : [];
  const playlists = rawPlaylists
    .slice(0, 15)
    .map((pl: any) => {
      if (!pl || typeof pl.name !== 'string') return null;
      const items = (Array.isArray(pl.items) ? pl.items : [])
        .map(sanitizeTrack)
        .filter(Boolean)
        .slice(0, 150);
      return {
        id: String(pl.id || Date.now()).slice(0, 40),
        name: String(pl.name).trim().slice(0, 50) || 'Playlist VF5',
        icon: String(pl.icon || '🎵').slice(0, 8),
        items,
      };
    })
    .filter(Boolean);

  const rawSavedPlaces = Array.isArray(body?.savedPlaces)
    ? body.savedPlaces
    : Array.isArray(existing?.savedPlaces)
    ? existing.savedPlaces
    : [];
  const savedPlaces = rawSavedPlaces.map(sanitizePlace).filter(Boolean).slice(0, 20);

  const payload = {
    updatedAt: new Date().toISOString(),
    favorites,
    playlists,
    savedPlaces,
    pendingNav: existing?.pendingNav || null,
  };

  const storageUsed = await writeStoredRecord(code, payload, env);

  return new Response(
    JSON.stringify({
      success: true,
      code,
      storage: storageUsed,
      updatedAt: payload.updatedAt,
      favoritesCount: favorites.length,
      playlistsCount: playlists.length,
      savedPlacesCount: savedPlaces.length,
    }),
    { headers: CORS_HEADERS }
  );
}
