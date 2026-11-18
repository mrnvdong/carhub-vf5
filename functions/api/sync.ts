// Cloudflare Pages Function: /api/sync
// Zero-login 4-6 digit Car Code Sync (e.g., VF5-6868) for syncing Playlists & Favorites
// between Phone/PC at home and APTV / asCar on VinFast VF5.
// Supports Cloudflare KV (context.env.CARHUB_KV if bound) + Cloudflare Edge Cache (30-day zero-config) + local dev memory store.

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
  return new Request(`https://carhub-vf5-sync.internal/v1/code/${encodeURIComponent(code)}`);
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get('code'));

  if (!code) {
    return new Response(
      JSON.stringify({ success: false, error: 'Mã đồng bộ phải có ít nhất 4 ký tự/chữ số.' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 1. Check Cloudflare KV if bound in Pages settings
  if (env?.CARHUB_KV) {
    try {
      const kvVal = await env.CARHUB_KV.get(`sync:${code}`);
      if (kvVal) {
        return new Response(
          JSON.stringify({
            success: true,
            code,
            storage: 'cloudflare-kv',
            data: JSON.parse(kvVal),
          }),
          {
            headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
          }
        );
      }
    } catch {}
  }

  // 2. Check Cloudflare Edge Cache (zero-config 30-day persistence across local Edge PoP)
  const cache = (caches as any).default;
  if (cache) {
    try {
      const cachedResp = await cache.match(buildEdgeCacheKey(code));
      if (cachedResp) {
        const parsed = await cachedResp.json();
        return new Response(
          JSON.stringify({
            success: true,
            code,
            storage: 'cloudflare-edge',
            data: parsed,
          }),
          {
            headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
          }
        );
      }
    } catch {}
  }

  // 3. Check in-memory fallback (local wrangler pages dev)
  if (memorySyncStore.has(code)) {
    return new Response(
      JSON.stringify({
        success: true,
        code,
        storage: 'memory-dev',
        data: JSON.parse(memorySyncStore.get(code)!),
      }),
      {
        headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
      }
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

  const sanitizeTrack = (v: any) => {
    if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{11}$/.test(v.id)) return null;
    return {
      id: v.id,
      title: String(v.title || '').slice(0, 200),
      uploaderName: String(v.uploaderName || '').slice(0, 100),
      thumbnail: String(v.thumbnail || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`).slice(0, 300),
      duration: typeof v.duration === 'number' ? v.duration : 0,
      durationText: String(v.durationText || '').slice(0, 20),
    };
  };

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

  const payload = {
    updatedAt: new Date().toISOString(),
    favorites,
    playlists,
  };
  const serialized = JSON.stringify(payload);

  // Save to all available layers
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

  return new Response(
    JSON.stringify({
      success: true,
      code,
      storage: storageUsed,
      updatedAt: payload.updatedAt,
      favoritesCount: favorites.length,
      playlistsCount: playlists.length,
    }),
    { headers: CORS_HEADERS }
  );
}
