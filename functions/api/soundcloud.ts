// Cloudflare Pages Function: /api/soundcloud
// Zero-API-key SoundCloud v2 integration for VinFast VF5 CarPlay:
// - Auto-discovers & caches SoundCloud public client_id (6h Edge Cache + auto-refresh on 401/403)
// - action=search: Full-length track search (filters out 30s Go+ SNIP previews) with HD t500x500 artwork
// - action=stream: Resolves verified progressive MP3 or AAC fMP4 HLS stream URL (CORS-enabled!)
// - action=related: Fetches related tracks for endless Auto-Mix Radio

import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let memoryClientId: { id: string; fetchedAt: number } | null = null;

function formatDuration(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function upgradeArtworkUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/-large(\.[a-z0-9]+)$/i, '-t500x500$1');
}

function mapSoundCloudTrack(t: any) {
  if (!t || !t.id || !t.title) return null;
  if (t.policy === 'BLOCK' || t.policy === 'SNIP') return null;
  if (t.streamable === false) return null;

  const transcodings: any[] = t.media?.transcodings || [];
  if (transcodings.length === 0) return null;

  const durationSec = Math.round(Number(t.duration || 0) / 1000);
  const fullDurationSec = Math.round(Number(t.full_duration || t.duration || 0) / 1000);
  // Bỏ qua các bài chỉ cho nghe thử 30s (preview Go+)
  if (durationSec <= 35 && fullDurationSec > durationSec + 10) return null;

  const artwork =
    upgradeArtworkUrl(t.artwork_url) ||
    upgradeArtworkUrl(t.user?.avatar_url) ||
    'https://a-v2.sndcdn.com/assets/images/sc-icons/ios-a62dfc8fe7.png';

  const plays = Number(t.playback_count || 0);
  const viewsText = plays > 0 ? `${plays.toLocaleString('vi-VN')} lượt nghe` : 'SoundCloud';

  return {
    id: `sc_${t.id}`,
    source: 'soundcloud' as const,
    title: String(t.title).trim(),
    uploaderName: String(t.user?.username || t.user?.full_name || 'SoundCloud Artist').trim(),
    thumbnail: artwork,
    duration: durationSec,
    durationText: durationSec > 0 ? formatDuration(durationSec) : '',
    viewsText,
    uploadedDate: t.created_at ? String(t.created_at).slice(0, 10) : '',
  };
}

async function fetchFreshClientId(): Promise<string | null> {
  try {
    const htmlRes = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!htmlRes.ok) return null;
    const html = await htmlRes.text();

    const scriptUrls = Array.from(
      html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
    ).map((m) => m[1]);

    // Check scripts in reverse order (client_id usually lives in one of the last bundles)
    for (const scriptUrl of scriptUrls.reverse().slice(0, 8)) {
      try {
        const jsRes = await fetch(scriptUrl, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(3500),
        });
        if (!jsRes.ok) continue;
        const js = await jsRes.text();
        const match = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{20,40})"/);
        if (match?.[1]) {
          return match[1];
        }
      } catch {
        continue;
      }
    }
  } catch {}
  return null;
}

async function getClientId(context: any, forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && memoryClientId && now - memoryClientId.fetchedAt < 4 * 60 * 60 * 1000) {
    return memoryClientId.id;
  }

  const cache = (caches as any).default;
  const cacheKey = new Request('https://carhub-sc-clientid.internal/v1');

  if (!forceRefresh && cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const data: any = await hit.json();
        if (data?.clientId) {
          memoryClientId = { id: data.clientId, fetchedAt: now };
          return data.clientId;
        }
      }
    } catch {}
  }

  const fresh = await fetchFreshClientId();
  if (fresh) {
    memoryClientId = { id: fresh, fetchedAt: now };
    if (cache) {
      const resp = new Response(JSON.stringify({ clientId: fresh }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=21600, s-maxage=21600',
        },
      });
      context.waitUntil(cache.put(cacheKey, resp));
    }
  }
  return fresh;
}

async function fetchSoundCloudJson(
  pathAndQuery: string,
  context: any
): Promise<{ ok: boolean; data: any; clientId: string } | null> {
  try {
    let clientId = await getClientId(context, false);
    if (!clientId) return null;

    const sep = pathAndQuery.includes('?') ? '&' : '?';
    let res = await fetch(`https://api-v2.soundcloud.com${pathAndQuery}${sep}client_id=${clientId}`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5500),
    });

    // Auto-refresh client_id once if SoundCloud rotated keys
    if (res.status === 401 || res.status === 403) {
      try {
        await res.body?.cancel();
      } catch {}
      clientId = await getClientId(context, true);
      if (!clientId) return null;
      res = await fetch(`https://api-v2.soundcloud.com${pathAndQuery}${sep}client_id=${clientId}`, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(5500),
      });
    }

    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {}
      return { ok: false, data: null, clientId };
    }
    const data = await res.json();
    return { ok: true, data, clientId };
  } catch {
    return null;
  }
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
  const action = (url.searchParams.get('action') || 'search').trim();

  // =========================================================================
  // 1. RESOLVE LIVE AUDIO STREAM URL (progressive MP3 or AAC fMP4 HLS)
  // =========================================================================
  if (action === 'stream') {
    const rawId = (url.searchParams.get('id') || '').replace(/^sc_/, '').trim();
    if (!/^\d{4,16}$/.test(rawId)) {
      return new Response(JSON.stringify({ success: false, error: 'ID bài SoundCloud không hợp lệ.' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const trackResp = await fetchSoundCloudJson(`/tracks/${rawId}`, context);
    if (!trackResp?.ok || !trackResp.data) {
      return new Response(
        JSON.stringify({ success: false, error: 'Không tải được thông tin luồng âm thanh SoundCloud.' }),
        { status: 502, headers: CORS_HEADERS }
      );
    }

    const track = trackResp.data;
    const transcodings: any[] = Array.isArray(track.media?.transcodings)
      ? track.media.transcodings
      : [];

    // Ưu tiên: 1) progressive MP3 (native mọi trình duyệt) -> 2) HLS AAC/MP4 (200 OK trên iOS + hls.js) -> 3) HLS khác
    const ranked = [...transcodings].sort((a, b) => {
      const score = (tc: any) => {
        const proto = tc?.format?.protocol || '';
        const mime = tc?.format?.mime_type || '';
        if (proto === 'progressive' && mime.includes('mpeg')) return 1;
        if (proto === 'progressive') return 2;
        if (proto === 'hls' && mime.includes('mp4')) return 3;
        if (proto === 'hls') return 4;
        return 5;
      };
      return score(a) - score(b);
    });

    const authParam = track.track_authorization
      ? `&track_authorization=${encodeURIComponent(track.track_authorization)}`
      : '';

    for (const tc of ranked) {
      if (!tc?.url) continue;
      try {
        const joiner = String(tc.url).includes('?') ? '&' : '?';
        const resolveUrl = `${tc.url}${joiner}client_id=${trackResp.clientId}${authParam}`;
        const r = await fetch(resolveUrl, {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
        });
        if (!r.ok) {
          try {
            await r.body?.cancel();
          } catch {}
          continue;
        }
        const j: any = await r.json();
        if (j?.url && typeof j.url === 'string') {
          return new Response(
            JSON.stringify({
              success: true,
              streamUrl: j.url,
              protocol: tc.format?.protocol === 'progressive' ? 'progressive' : 'hls',
              mimeType: tc.format?.mime_type || '',
              duration: Math.round(Number(track.duration || 0) / 1000),
            }),
            {
              headers: {
                ...CORS_HEADERS,
                'Cache-Control': 'no-store',
              },
            }
          );
        }
      } catch {
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Bài nhạc này bị chủ sở hữu hạn chế phát trực tuyến trên SoundCloud.',
      }),
      { status: 404, headers: CORS_HEADERS }
    );
  }

  // =========================================================================
  // 2. RELATED TRACKS (cho Đài phát vô tận Auto-Mix trên SoundCloud)
  // =========================================================================
  if (action === 'related') {
    const rawId = (url.searchParams.get('id') || '').replace(/^sc_/, '').trim();
    if (!/^\d{4,16}$/.test(rawId)) {
      return new Response(JSON.stringify({ success: false, items: [] }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const cache = (caches as any).default;
    const cacheKey = new Request(`https://carhub-sc-rel.internal/v1/${rawId}`);
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) {
          return new Response(hit.body, {
            status: hit.status,
            headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=600' },
          });
        }
      } catch {}
    }

    const relResp = await fetchSoundCloudJson(`/tracks/${rawId}/related?limit=25`, context);
    const items = (relResp?.data?.collection || [])
      .map(mapSoundCloudTrack)
      .filter((x: any): x is NonNullable<typeof x> => Boolean(x));

    const resp = new Response(JSON.stringify({ success: items.length > 0, items }), {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': items.length > 0 ? 'public, max-age=600' : 'no-store',
      },
    });
    if (cache && items.length > 0) {
      context.waitUntil(cache.put(cacheKey, resp.clone()));
    }
    return resp;
  }

  // =========================================================================
  // 3. SEARCH FULL-LENGTH TRACKS ON SOUNDCLOUD (có phân trang & bỏ qua trang toàn SNIP)
  // =========================================================================
  const query = (url.searchParams.get('q') || 'vinahouse nonstop remix').trim().slice(0, 120);
  const initialOffset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `https://carhub-sc-search.internal/v2?q=${encodeURIComponent(query.toLowerCase())}&o=${initialOffset}`
  );
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) {
        return new Response(hit.body, {
          status: hit.status,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
        });
      }
    } catch {}
  }

  const limit = 25;
  const seen = new Set<string>();
  const items: NonNullable<ReturnType<typeof mapSoundCloudTrack>>[] = [];
  let cursorOffset = initialOffset;
  let nextOffset: number | null = null;
  let anySuccess = false;

  // Tối đa gom 2 trang liên tiếp nếu trang đầu có nhiều bản nghe thử 30s (Go+ SNIP) bị lọc bỏ
  for (let attempt = 0; attempt < 2; attempt++) {
    const searchResp = await fetchSoundCloudJson(
      `/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}&offset=${cursorOffset}&linked_partitioning=1`,
      context
    );

    if (!searchResp?.ok || !searchResp.data) {
      if (attempt === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            items: [],
            nextContinuation: null,
            error: 'Không kết nối được tới máy chủ SoundCloud.',
          }),
          { status: 502, headers: CORS_HEADERS }
        );
      }
      break;
    }

    anySuccess = true;
    const rawCollection: any[] = Array.isArray(searchResp.data.collection)
      ? searchResp.data.collection
      : [];

    for (const rawTrack of rawCollection) {
      const mapped = mapSoundCloudTrack(rawTrack);
      if (mapped && !seen.has(mapped.id)) {
        seen.add(mapped.id);
        items.push(mapped);
      }
    }

    // Xác định offset tiếp theo từ next_href của SoundCloud (hoặc total_results)
    let computedNextOffset: number | null = null;
    if (typeof searchResp.data.next_href === 'string' && searchResp.data.next_href.length > 0) {
      try {
        const nextUrl = new URL(searchResp.data.next_href);
        const parsedOff = parseInt(nextUrl.searchParams.get('offset') || '', 10);
        if (!isNaN(parsedOff) && parsedOff > cursorOffset) {
          computedNextOffset = parsedOff;
        } else {
          computedNextOffset = cursorOffset + Math.max(rawCollection.length, limit);
        }
      } catch {
        computedNextOffset = cursorOffset + Math.max(rawCollection.length, limit);
      }
    } else if (
      rawCollection.length > 0 &&
      Number(searchResp.data.total_results || 0) > cursorOffset + rawCollection.length
    ) {
      computedNextOffset = cursorOffset + rawCollection.length;
    }

    if (computedNextOffset !== null && computedNextOffset < 500 && rawCollection.length > 0) {
      nextOffset = computedNextOffset;
      cursorOffset = computedNextOffset;
    } else {
      nextOffset = null;
      break;
    }

    // Đủ số bài phát được -> dừng sớm, không tốn thêm request
    if (items.length >= 12) break;
  }

  const nextContinuation = nextOffset !== null ? `sc_offset:${nextOffset}` : null;

  const resp = new Response(
    JSON.stringify({
      success: anySuccess && (items.length > 0 || nextContinuation !== null),
      source: 'soundcloud-v2',
      items,
      nextContinuation,
    }),
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': items.length > 0 ? 'public, max-age=300' : 'no-store',
      },
    }
  );

  if (cache && items.length > 0) {
    context.waitUntil(cache.put(cacheKey, resp.clone()));
  }

  return resp;
}
