// Cloudflare Pages Function: /api/sync
// Zero-login Car Code Sync (4-8 ký tự, khuyến nghị 6+ ký tự, VD: VF5-686899) backed by Cloudflare KV (CARHUB_KV):
// - Favorites & Playlists (YouTube + SoundCloud)
// - Saved Map Places (Home, Work, EV Chargers)
// - Movie Favorites & Movie Watch History (đồng bộ xem phim dở giữa Điện thoại <-> VF5!)
// - Personal Camera / Road Hazard Pins (tự cảnh báo giọng nói khi đi qua!)
// - Send-to-Car Navigation Target (pendingNav)
// (Legacy anonymous remoteCmd sendCmd disabled -> migrated to /api/remote!)

import {
  buildTrustedJsonHeaders,
  isTrustedAppRequest,
  readJsonBodyLimited,
} from '../_lib/security';

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
    duration: typeof v.duration === 'number' && Number.isFinite(v.duration) ? v.duration : 0,
    durationText: String(v.durationText || '').slice(0, 20),
  };
}

function sanitizePlace(p: any) {
  if (!p) return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
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
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return {
    id: String(nav.id || `nav-${Date.now()}`).slice(0, 64),
    name: String(nav.name || 'Điểm đến từ điện thoại').trim().slice(0, 140),
    subtitle: String(nav.subtitle || '').trim().slice(0, 180),
    lat,
    lon,
    sentAt: String(nav.sentAt || new Date().toISOString()).slice(0, 40),
  };
}

const VALID_MOVIE_SOURCES = new Set(['kkphim', 'vsmov', 'cobephim', 'k20']);

function sanitizeMovieItem(m: any) {
  if (!m || typeof m.slug !== 'string' || !m.slug.trim()) return null;
  const src = VALID_MOVIE_SOURCES.has(String(m.source)) ? String(m.source) : 'kkphim';
  return {
    id: String(m.id || m.slug).slice(0, 100),
    source: src,
    name: String(m.name || '').trim().slice(0, 160),
    originName: String(m.originName || '').trim().slice(0, 160),
    slug: String(m.slug).trim().slice(0, 160),
    type: String(m.type || '').slice(0, 40),
    posterUrl: String(m.posterUrl || '').slice(0, 350),
    thumbUrl: String(m.thumbUrl || '').slice(0, 350),
    year: Number(m.year) || 0,
    quality: String(m.quality || 'HD').slice(0, 24),
    lang: String(m.lang || 'Vietsub').slice(0, 40),
    time: String(m.time || '').slice(0, 40),
    episodeCurrent: String(m.episodeCurrent || '').slice(0, 50),
    episodeTotal: String(m.episodeTotal || '').slice(0, 30),
    chieurap: Boolean(m.chieurap),
    subDocQuyen: Boolean(m.subDocQuyen),
    rating: Number(m.rating) || 0,
    categories: [],
    countries: [],
  };
}

function sanitizeMovieHistoryItem(h: any) {
  if (!h || typeof h.slug !== 'string' || !h.slug.trim()) return null;
  const src = VALID_MOVIE_SOURCES.has(String(h.source)) ? String(h.source) : 'kkphim';
  return {
    source: src,
    slug: String(h.slug).trim().slice(0, 160),
    name: String(h.name || '').trim().slice(0, 160),
    originName: String(h.originName || '').trim().slice(0, 160),
    posterUrl: String(h.posterUrl || '').slice(0, 350),
    thumbUrl: String(h.thumbUrl || '').slice(0, 350),
    year: Number(h.year) || 0,
    quality: String(h.quality || 'HD').slice(0, 24),
    lang: String(h.lang || '').slice(0, 40),
    serverIndex: Math.max(0, Number(h.serverIndex) || 0),
    serverName: String(h.serverName || '').slice(0, 80),
    episodeSlug: String(h.episodeSlug || '').slice(0, 80),
    episodeName: String(h.episodeName || '').slice(0, 60),
    currentTime: Math.max(0, Number(h.currentTime) || 0),
    duration: Math.max(0, Number(h.duration) || 0),
    updatedAt: Number(h.updatedAt) || Date.now(),
  };
}

function sanitizeCustomHazard(p: any) {
  if (!p) return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  const allowedKinds = new Set([
    'camera',
    'no_stopping',
    'no_parking',
    'police',
    'pothole',
    'speedbump',
    'custom',
  ]);
  const kind = allowedKinds.has(String(p.kind)) ? String(p.kind) : 'camera';
  return {
    id: String(p.id || `hz-${Date.now()}`).slice(0, 48),
    kind,
    label: String(p.label || 'Điểm cảnh báo').trim().slice(0, 100),
    lat,
    lon,
    createdAt: Number(p.createdAt) || Date.now(),
  };
}

async function readStoredRecord(code: string, env: any): Promise<{ data: any; storage: string } | null> {
  if (env?.CARHUB_KV) {
    const kvVal = await env.CARHUB_KV.get(`sync:${code}`);
    if (!kvVal) return null;
    try {
      return { data: JSON.parse(kvVal), storage: 'cloudflare-kv' };
    } catch {
      return null;
    }
  }

  if (memorySyncStore.has(code)) {
    try {
      return { data: JSON.parse(memorySyncStore.get(code)!), storage: 'memory-dev' };
    } catch {
      return null;
    }
  }

  return null;
}

async function writeStoredRecord(code: string, payload: any, env: any): Promise<string> {
  const serialized = JSON.stringify(payload);

  if (env?.CARHUB_KV) {
    await env.CARHUB_KV.put(`sync:${code}`, serialized, {
      expirationTtl: 31536000, // 365 days
    });
    return 'cloudflare-kv';
  }

  if (memorySyncStore.size > 200) {
    const oldest = memorySyncStore.keys().next().value;
    if (oldest) memorySyncStore.delete(oldest);
  }
  memorySyncStore.set(code, serialized);
  return 'memory-dev';
}

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request, env } = context;
  const headers = { ...buildTrustedJsonHeaders(request), 'Cache-Control': 'no-store' };

  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
      status: 403,
      headers,
    });
  }

  const url = new URL(request.url);
  const code = normalizeCode(url.searchParams.get('code'));
  const navOnly = url.searchParams.get('navOnly') === '1';

  if (!code) {
    return new Response(
      JSON.stringify({ success: false, error: 'Mã đồng bộ phải có ít nhất 4 ký tự/chữ số.' }),
      { status: 400, headers }
    );
  }

  try {
    const record = await readStoredRecord(code, env);

    if (navOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          code,
          pendingNav: record?.data?.pendingNav || null,
          remoteCmd: null,
        }),
        { headers }
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
            movieFavorites: Array.isArray(record.data.movieFavorites) ? record.data.movieFavorites : [],
            movieHistory: Array.isArray(record.data.movieHistory) ? record.data.movieHistory : [],
            customHazards: Array.isArray(record.data.customHazards) ? record.data.customHazards : [],
            pendingNav: record.data.pendingNav || null,
            remoteCmd: null,
          },
        }),
        { headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Chưa tìm thấy dữ liệu cho mã VF5-${code}. Hãy bấm "Đẩy lên mây" từ điện thoại/máy tính trước.`,
      }),
      { status: 404, headers }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Hệ thống đồng bộ đám mây tạm gián đoạn.' }),
      { status: 503, headers }
    );
  }
}

export async function onRequestPost(context: any) {
  const { request, env } = context;
  const headers = { ...buildTrustedJsonHeaders(request), 'Cache-Control': 'no-store' };

  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
      status: 403,
      headers,
    });
  }

  const parsed = await readJsonBodyLimited(request, 262144);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ success: false, error: parsed.error }), {
      status: parsed.status,
      headers,
    });
  }
  const body = parsed.data;

  const code = normalizeCode(body?.code);
  if (!code) {
    return new Response(
      JSON.stringify({ success: false, error: 'Mã xe phải từ 4 đến 8 ký tự số hoặc chữ.' }),
      { status: 400, headers }
    );
  }

  const action: string = body?.action || 'full';

  // Chặn sớm kênh sendCmd cũ (không cần đọc KV)
  if (action === 'sendCmd') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Kênh điều khiển cũ đã ngừng hỗ trợ vì bảo mật — hãy quét mã QR phiên mới trên màn hình xe VF5.',
      }),
      { status: 410, headers }
    );
  }

  try {
    const existing = (await readStoredRecord(code, env))?.data || null;

    const baseRecord = {
      updatedAt: existing?.updatedAt || new Date().toISOString(),
      favorites: Array.isArray(existing?.favorites) ? existing.favorites : [],
      playlists: Array.isArray(existing?.playlists) ? existing.playlists : [],
      savedPlaces: Array.isArray(existing?.savedPlaces) ? existing.savedPlaces : [],
      movieFavorites: Array.isArray(existing?.movieFavorites) ? existing.movieFavorites : [],
      movieHistory: Array.isArray(existing?.movieHistory) ? existing.movieHistory : [],
      customHazards: Array.isArray(existing?.customHazards) ? existing.customHazards : [],
      pendingNav: existing?.pendingNav || null,
      remoteCmd: null,
    };

    // 1. Send-to-Car Navigation
    if (action === 'sendNav') {
      const cleanNav = sanitizePendingNav(body?.pendingNav);
      if (!cleanNav) {
        return new Response(
          JSON.stringify({ success: false, error: 'Tọa độ điểm đến gửi lên xe không hợp lệ.' }),
          { status: 400, headers }
        );
      }

      const storageUsed = await writeStoredRecord(code, { ...baseRecord, pendingNav: cleanNav }, env);
      return new Response(
        JSON.stringify({ success: true, code, storage: storageUsed, pendingNav: cleanNav }),
        { headers }
      );
    }

    // 2. Clear pendingNav
    if (action === 'clearNav') {
      if (existing?.pendingNav) {
        await writeStoredRecord(code, { ...baseRecord, pendingNav: null }, env);
      }
      return new Response(JSON.stringify({ success: true, code }), { headers });
    }

    // 3. Clear legacy remoteCmd if present
    if (action === 'clearCmd') {
      if (existing?.remoteCmd) {
        await writeStoredRecord(code, { ...baseRecord, remoteCmd: null }, env);
      }
      return new Response(JSON.stringify({ success: true, code }), { headers });
    }

    // 4. Partial sync for Movies & Custom Hazards
    if (action === 'syncExtras') {
      const movieFavorites = Array.isArray(body?.movieFavorites)
        ? body.movieFavorites.map(sanitizeMovieItem).filter(Boolean).slice(0, 60)
        : baseRecord.movieFavorites;
      const movieHistory = Array.isArray(body?.movieHistory)
        ? body.movieHistory.map(sanitizeMovieHistoryItem).filter(Boolean).slice(0, 40)
        : baseRecord.movieHistory;
      const customHazards = Array.isArray(body?.customHazards)
        ? body.customHazards.map(sanitizeCustomHazard).filter(Boolean).slice(0, 50)
        : baseRecord.customHazards;

      const payload = {
        ...baseRecord,
        updatedAt: new Date().toISOString(),
        movieFavorites,
        movieHistory,
        customHazards,
      };
      const storageUsed = await writeStoredRecord(code, payload, env);
      return new Response(
        JSON.stringify({
          success: true,
          code,
          storage: storageUsed,
          updatedAt: payload.updatedAt,
        }),
        { headers }
      );
    }

    // 5. Full Sync
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
      : baseRecord.savedPlaces;
    const savedPlaces = rawSavedPlaces.map(sanitizePlace).filter(Boolean).slice(0, 20);

    const movieFavorites = Array.isArray(body?.movieFavorites)
      ? body.movieFavorites.map(sanitizeMovieItem).filter(Boolean).slice(0, 60)
      : baseRecord.movieFavorites;
    const movieHistory = Array.isArray(body?.movieHistory)
      ? body.movieHistory.map(sanitizeMovieHistoryItem).filter(Boolean).slice(0, 40)
      : baseRecord.movieHistory;
    const customHazards = Array.isArray(body?.customHazards)
      ? body.customHazards.map(sanitizeCustomHazard).filter(Boolean).slice(0, 50)
      : baseRecord.customHazards;

    const payload = {
      updatedAt: new Date().toISOString(),
      favorites,
      playlists,
      savedPlaces,
      movieFavorites,
      movieHistory,
      customHazards,
      pendingNav: baseRecord.pendingNav,
      remoteCmd: null,
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
        movieFavoritesCount: movieFavorites.length,
        movieHistoryCount: movieHistory.length,
        customHazardsCount: customHazards.length,
      }),
      { headers }
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Không thể lưu dữ liệu đám mây lúc này (KV tạm quá tải hoặc bảo trì). Vui lòng thử lại sau.',
      }),
      { status: 503, headers }
    );
  }
}
