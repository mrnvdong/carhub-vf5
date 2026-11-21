// Cloudflare Pages Function: /api/tv
// Live TV & Radio M3U8/DASH engine for VinFast VF5 CarPlay:
// - GET  action=playlist : Fetches & parses ALL channels from M3U/M3U8 (default https://tinyurl.com/vmt47), 5m Edge Cache
// - GET  action=resolve  : Follows 302/307 redirects with channel User-Agent/Referer -> direct CORS URL or proxy URL
// - GET  action=proxy    : Same-Origin + SSRF-safe CORS proxy for non-CORS / HTTP / custom-header HLS/DASH manifests & segments
// - POST action=ping     : Fast parallel live-status ping for up to 14 channels at once (Same-Origin guarded)

import {
  buildTrustedJsonHeaders,
  getTrustedCorsOrigin,
  isSafeProxyMediaContentType,
  isSafePublicHttpUrl,
  isTrustedAppRequest,
  readJsonBodyLimited,
  readTextLimited,
  safeFetchExternal,
} from '../_lib/security';

const DEFAULT_PLAYLIST_URL = 'https://tinyurl.com/vmt47';

const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const VLC_FALLBACK_UA = 'VLC/3.0.20 LibVLC/3.0.20';

async function fetchStreamUpstream(
  targetUrl: string,
  opts: {
    ua?: string;
    referer?: string;
    origin?: string;
    range?: string | null;
    timeoutMs?: number;
  }
): Promise<{ response: Response; finalUrl: string; usedUa: string }> {
  const buildHeaders = (userAgent: string): Record<string, string> => {
    const h: Record<string, string> = {
      'User-Agent': userAgent,
      Accept: '*/*',
    };
    if (opts.referer && isSafeExternalUrl(opts.referer)) {
      h['Referer'] = opts.referer;
    }
    if (opts.origin) {
      h['Origin'] = opts.origin;
    }
    if (opts.range) {
      h['Range'] = opts.range;
    }
    return h;
  };

  const primaryUa = opts.ua || DEFAULT_UA;
  const first = await safeFetchExternal(
    targetUrl,
    {
      headers: buildHeaders(primaryUa),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
    },
    6
  );

  // Nếu nguồn IPTV từ chối UA trình duyệt (403/404) và kênh không chỉ định UA riêng -> thử lại ngay bằng UA chuẩn VLC!
  if (
    !opts.ua &&
    (first.response.status === 403 || first.response.status === 404) &&
    primaryUa !== VLC_FALLBACK_UA
  ) {
    try {
      await first.response.body?.cancel();
    } catch {}
    const second = await safeFetchExternal(
      targetUrl,
      {
        headers: buildHeaders(VLC_FALLBACK_UA),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 12000),
      },
      6
    );
    return { response: second.response, finalUrl: second.finalUrl, usedUa: VLC_FALLBACK_UA };
  }

  return { response: first.response, finalUrl: first.finalUrl, usedUa: primaryUa };
}

const PRIORITY_GROUPS: string[] = [
  'VTV',
  'Radio',
  'HTV',
  'HTVC',
  'Thể Thao',
  'VTVcab',
  'SCTV',
  'Sự Kiện TV360',
  'Sự Kiện VTVPrime',
  'Giải Trí',
  'LIVE EVENTS 🔴',
  'Địa phương',
  '🌐| Thiết yếu',
  'TVB',
  '🔴 ⚽ COLA TV',
  '🔴 ⚽ 🏐 GÀ VÀNG 24h',
  'Quốc Tế',
];

function isSafeExternalUrl(raw: string): boolean {
  return isSafePublicHttpUrl(raw);
}

interface ParsedChannel {
  id: string;
  name: string;
  group: string;
  logo: string;
  tvgId: string;
  url: string;
  ua?: string;
  referer?: string;
  isRadio: boolean;
  isVod: boolean;
  isDrm: boolean;
  manifestType: 'hls' | 'mpd';
  clearKey?: string;
}

function parseM3uPlaylist(text: string): {
  epgUrl: string | null;
  channels: ParsedChannel[];
  drmCount: number;
} {
  const lines = text.split(/\r?\n/);
  let epgUrl: string | null = null;
  const channels: ParsedChannel[] = [];
  let drmCount = 0;

  let current: {
    name: string;
    group: string;
    logo: string;
    tvgId: string;
    ua?: string;
    referer?: string;
    isDrm: boolean;
    isMpd: boolean;
    clearKey?: string;
  } | null = null;

  let idx = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      const tvgMatch = line.match(/url-tvg="([^"]+)"/i) || line.match(/x-tvg-url="([^"]+)"/i);
      if (tvgMatch?.[1]) epgUrl = tvgMatch[1].trim();
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const idMatch = line.match(/tvg-id="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');
      const name = (commaIdx >= 0 ? line.slice(commaIdx + 1) : 'Kênh TV').trim() || 'Kênh TV';
      current = {
        name,
        group: (groupMatch?.[1] || 'Khác').trim() || 'Khác',
        logo: (logoMatch?.[1] || '').trim(),
        tvgId: (idMatch?.[1] || '').trim(),
        isDrm: false,
        isMpd: false,
      };
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:') && current) {
      const opt = line.slice('#EXTVLCOPT:'.length).trim();
      if (/^http-user-agent=/i.test(opt)) {
        current.ua = opt.slice('http-user-agent='.length).trim();
      } else if (/^http-referrer=/i.test(opt)) {
        current.referer = opt.slice('http-referrer='.length).trim();
      }
      continue;
    }

    if (line.startsWith('#KODIPROP:') && current) {
      const prop = line.slice('#KODIPROP:'.length).trim();
      if (/manifest_type\s*=\s*mpd/i.test(prop)) {
        current.isMpd = true;
      }
      if (/license_type\s*=\s*(clearkey|org\.w3\.clearkey|widevine)/i.test(prop)) {
        current.isDrm = true;
      }
      const keyMatch = prop.match(/license_key\s*=\s*(.+)$/i);
      if (keyMatch?.[1]) {
        current.clearKey = keyMatch[1].trim();
        current.isDrm = true;
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    if (current) {
      const streamUrl = line.split('|')[0].trim();
      if (isSafeExternalUrl(streamUrl)) {
        idx++;
        const urlIsMpd = /\.mpd(\?|$)/i.test(streamUrl) || /\/mpd\.php/i.test(streamUrl);
        const isMpd = current.isMpd || urlIsMpd;
        const isDrm = current.isDrm || isMpd;
        if (isDrm) drmCount++;

        const groupLower = current.group.toLowerCase();
        const nameLower = current.name.toLowerCase();
        const isRadio =
          groupLower.includes('radio') ||
          /\b(vov\s*[1-5]|vov\s*giao\s*thông|voh\s*fm|fm\s*\d+)/i.test(nameLower);
        const isVod =
          groupLower.includes('live events') ||
          /kkphimplayer|opstream|rumble\.com\/hls-vod/i.test(streamUrl);

        channels.push({
          id: `tv_${idx}`,
          name: current.name,
          group: current.group,
          logo: current.logo,
          tvgId: current.tvgId,
          url: streamUrl,
          ua: current.ua,
          referer: current.referer,
          isRadio,
          isVod,
          isDrm,
          manifestType: isMpd ? 'mpd' : 'hls',
          clearKey: current.clearKey,
        });
      }
      current = null;
    }
  }

  return { epgUrl, channels, drmCount };
}

function buildProxyUrl(targetUrl: string, ua?: string, referer?: string): string {
  const params = new URLSearchParams();
  params.set('action', 'proxy');
  params.set('url', targetUrl);
  if (ua) params.set('ua', ua);
  if (referer) params.set('ref', referer);
  return `/api/tv?${params.toString()}`;
}

function rewriteHlsPlaylist(
  body: string,
  baseUrl: string,
  ua?: string,
  referer?: string
): string {
  const resolveAbs = (rel: string): string => {
    try {
      return new URL(rel, baseUrl).toString();
    } catch {
      return rel;
    }
  };

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
            const abs = resolveAbs(rawUri);
            if (!isSafeExternalUrl(abs)) return `URI="${rawUri}"`;
            return `URI="${buildProxyUrl(abs, ua, referer)}"`;
          });
        }
        return line;
      }

      const abs = resolveAbs(trimmed);
      if (!isSafeExternalUrl(abs)) return line;
      return buildProxyUrl(abs, ua, referer);
    })
    .join('\n');
}

async function pingSingleChannel(ch: {
  id: string;
  url: string;
  ua?: string;
  referer?: string;
}): Promise<{
  id: string;
  status: 'live' | 'dead';
  latencyMs: number;
  reason?: string;
}> {
  const t0 = Date.now();
  if (!ch?.url || !isSafeExternalUrl(ch.url)) {
    return { id: ch?.id || '', status: 'dead', latencyMs: 0, reason: 'URL không hợp lệ' };
  }

  try {
    const { response: res, finalUrl } = await fetchStreamUpstream(ch.url, {
      ua: ch.ua,
      referer: ch.referer,
      timeoutMs: 5500,
    });
    const latencyMs = Date.now() - t0;

    if (/\/error\.mp4(\?|$)/i.test(finalUrl)) {
      try {
        await res.body?.cancel();
      } catch {}
      return { id: ch.id, status: 'dead', latencyMs, reason: 'Nguồn bảo trì' };
    }

    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {}
      return { id: ch.id, status: 'dead', latencyMs, reason: `HTTP ${res.status}` };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isHlsCt = ct.includes('mpegurl');
    const isMpdCt = ct.includes('dash+xml') || ct.includes('xml');
    const isAudioCt = !isHlsCt && (ct.includes('audio/') || ct.includes('aacp'));

    if (isAudioCt) {
      try {
        await res.body?.cancel();
      } catch {}
      return { id: ch.id, status: 'live', latencyMs };
    }

    // Đọc tối đa ~2KB đầu để kiểm tra thực sự có #EXTM3U hoặc <MPD (tránh tải file dài!)
    let headText = '';
    try {
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let bytesRead = 0;
        while (bytesRead < 2048) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          headText += decoder.decode(value, { stream: true });
          bytesRead += value.byteLength;
        }
        try {
          await reader.cancel();
        } catch {}
      }
    } catch {}

    const trimmedHead = headText.trimStart();
    const isValidStream =
      trimmedHead.startsWith('#EXTM3U') ||
      trimmedHead.includes('<MPD') ||
      (isHlsCt && trimmedHead.length > 10) ||
      (isMpdCt && trimmedHead.includes('MPD'));

    if (isValidStream) {
      return { id: ch.id, status: 'live', latencyMs };
    }

    return { id: ch.id, status: 'dead', latencyMs, reason: 'Không có tín hiệu' };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    return {
      id: ch.id,
      status: 'dead',
      latencyMs,
      reason: err?.name === 'TimeoutError' ? 'Timeout' : 'Mất kết nối',
    };
  }
}

export async function onRequestOptions(context: any) {
  return new Response(null, {
    status: 204,
    headers: {
      ...buildTrustedJsonHeaders(context.request),
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });
}

export async function onRequestPost(context: any) {
  const { request } = context;
  const JSON_HEADERS = {
    ...buildTrustedJsonHeaders(request),
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  };
  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'ping').trim();

  if (action !== 'ping') {
    return new Response(JSON.stringify({ success: false, error: 'Unsupported POST action' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
      status: 403,
      headers: JSON_HEADERS,
    });
  }

  const parsedBody = await readJsonBodyLimited(request, 32768);
  if (!parsedBody.ok) {
    return new Response(JSON.stringify({ success: false, error: parsedBody.error }), {
      status: parsedBody.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body: any = parsedBody.data;
    const rawList: any[] = Array.isArray(body?.channels) ? body.channels : [];
    const batch = rawList.slice(0, 14).map((c) => ({
      id: String(c?.id || ''),
      url: String(c?.url || ''),
      ua: typeof c?.ua === 'string' ? c.ua : undefined,
      referer: typeof c?.referer === 'string' ? c.referer : undefined,
    }));

    const settled = await Promise.all(batch.map((ch) => pingSingleChannel(ch)));
    const checkedAt = Date.now();
    const results: Record<
      string,
      { status: 'live' | 'dead'; latencyMs: number; checkedAt: number; reason?: string }
    > = {};

    for (const r of settled) {
      if (!r.id) continue;
      results[r.id] = {
        status: r.status,
        latencyMs: r.latencyMs,
        checkedAt,
        reason: r.reason,
      };
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid ping payload' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const JSON_HEADERS = {
    ...buildTrustedJsonHeaders(request),
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  };
  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'playlist').trim();

  // =========================================================================
  // 1. PLAYLIST: Tải & giữ NGUYÊN 100% TẤT CẢ KÊNH từ M3U/M3U8 (không ẩn kênh nào!)
  // =========================================================================
  if (action === 'playlist') {
    if (!isTrustedAppRequest(request)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const sourceParam = (reqUrl.searchParams.get('url') || DEFAULT_PLAYLIST_URL).trim();
    if (!isSafeExternalUrl(sourceParam)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đường dẫn danh sách M3U không hợp lệ.' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const cache = (caches as any).default;
    const cacheKey = new Request(
      `https://carhub-tv-playlist.internal/v3?u=${encodeURIComponent(sourceParam)}`
    );
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) {
          return new Response(hit.body, {
            status: hit.status,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=300, s-maxage=300',
              'X-Cache': 'HIT',
            },
          });
        }
      } catch {}
    }

    try {
      const { response: upstream, finalUrl } = await safeFetchExternal(
        sourceParam,
        {
          headers: {
            'User-Agent': DEFAULT_UA,
            Accept: '*/*',
          },
          signal: AbortSignal.timeout(9000),
        },
        5
      );

      if (!upstream.ok) {
        try {
          await upstream.body?.cancel();
        } catch {}
        return new Response(
          JSON.stringify({
            success: false,
            error: `Không tải được danh sách kênh TV (HTTP ${upstream.status}).`,
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      const readRes = await readTextLimited(upstream, 2 * 1024 * 1024);
      if (!readRes.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Danh sách kênh M3U vượt quá giới hạn 2 MB.',
          }),
          { status: readRes.status, headers: JSON_HEADERS }
        );
      }

      const text = readRes.text;
      if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Đường dẫn này không phải định dạng danh sách kênh M3U / M3U8 hợp lệ.',
          }),
          { status: 422, headers: JSON_HEADERS }
        );
      }

      const { epgUrl, channels, drmCount } = parseM3uPlaylist(text);

      const groupCountMap = new Map<string, number>();
      for (const ch of channels) {
        groupCountMap.set(ch.group, (groupCountMap.get(ch.group) || 0) + 1);
      }

      const groups = Array.from(groupCountMap.entries())
        .sort(([a, ca], [b, cb]) => {
          const ia = PRIORITY_GROUPS.indexOf(a);
          const ib = PRIORITY_GROUPS.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return cb - ca;
        })
        .map(([name, count]) => ({ name, count }));

      const payload = {
        success: channels.length > 0,
        sourceUrl: sourceParam,
        resolvedSourceUrl: finalUrl || sourceParam,
        epgUrl,
        totalRaw: channels.length,
        totalPlayable: channels.length,
        totalDrmCount: drmCount,
        groups,
        channels,
      };

      const serialized = JSON.stringify(payload);
      if (cache && channels.length > 0) {
        context.waitUntil(
          cache.put(
            cacheKey,
            new Response(serialized, {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=300',
              },
            })
          )
        );
      }

      return new Response(serialized, {
        headers: {
          ...JSON_HEADERS,
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          'X-Cache': 'MISS',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err?.message || 'Lỗi kết nối khi tải danh sách kênh TV.',
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 2. RESOLVE: Theo dõi 302/307 bằng đúng User-Agent/Referer của kênh (hỗ trợ HLS, DASH MPD & Audio)
  // =========================================================================
  if (action === 'resolve') {
    if (!isTrustedAppRequest(request)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden origin' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }
    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    const ua = (reqUrl.searchParams.get('ua') || '').trim() || undefined;
    const referer = (reqUrl.searchParams.get('ref') || '').trim() || undefined;

    if (!isSafeExternalUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL kênh không hợp lệ.' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const probeOrigin = getTrustedCorsOrigin(request);

    try {
      const { response: upstream, finalUrl, usedUa } = await fetchStreamUpstream(targetUrl, {
        ua,
        referer,
        origin: probeOrigin,
        timeoutMs: 12000,
      });

      if (/\/error\.mp4(\?|$)/i.test(finalUrl)) {
        try {
          await upstream.body?.cancel();
        } catch {}
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Kênh này đang tạm gián đoạn từ máy chủ phát sóng, vui lòng thử kênh khác.',
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      if (!upstream.ok) {
        try {
          await upstream.body?.cancel();
        } catch {}
        return new Response(
          JSON.stringify({
            success: false,
            error: `Nguồn phát kênh tạm không phản hồi (HTTP ${upstream.status}).`,
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const acao = (upstream.headers.get('access-control-allow-origin') || '').trim();
      const isHttps = finalUrl.startsWith('https://');
      const hasOpenCors =
        acao === '*' ||
        (Boolean(acao) && acao.toLowerCase() === probeOrigin.toLowerCase());
      const isHlsContentType = contentType.includes('mpegurl');
      const isDirectAudio =
        !isHlsContentType &&
        (contentType.includes('audio/') || contentType.includes('aacp'));

      const effectiveUa = ua || (usedUa === VLC_FALLBACK_UA ? VLC_FALLBACK_UA : undefined);

      if (isDirectAudio) {
        try {
          await upstream.body?.cancel();
        } catch {}
        const mode = isHttps ? 'direct' : 'proxy';
        return new Response(
          JSON.stringify({
            success: true,
            mode,
            streamType: 'audio',
            playUrl: mode === 'direct' ? finalUrl : buildProxyUrl(finalUrl, effectiveUa, referer),
            directUrl: isHttps ? finalUrl : null,
            proxyUrl: buildProxyUrl(finalUrl, effectiveUa, referer),
          }),
          { headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } }
        );
      }

      // Đọc tối đa 2KB đầu để nhận diện #EXTM3U hoặc <MPD cực nhanh (không chờ đọc hết file dài!)
      let sampleText = '';
      try {
        const reader = upstream.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let bytesRead = 0;
          while (bytesRead < 2048) {
            const { done, value } = await reader.read();
            if (done || !value) break;
            sampleText += decoder.decode(value, { stream: true });
            bytesRead += value.byteLength;
          }
          try {
            await reader.cancel();
          } catch {}
        }
      } catch {}

      const trimmedSample = sampleText.trimStart();
      const isMpd =
        trimmedSample.includes('<MPD') ||
        contentType.includes('dash+xml') ||
        /\.mpd(\?|$)/i.test(finalUrl);
      const isHls =
        trimmedSample.startsWith('#EXTM3U') ||
        isHlsContentType ||
        /\.m3u8(\?|$)/i.test(finalUrl);

      if (!isHls && !isMpd) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Nguồn kênh không trả về luồng phát HLS/DASH hợp lệ (có thể đang ngoại tuyến).',
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      const canPlayDirect = isHttps && hasOpenCors && !referer;
      const proxyUrl = buildProxyUrl(finalUrl, effectiveUa, referer);

      return new Response(
        JSON.stringify({
          success: true,
          mode: canPlayDirect ? 'direct' : 'proxy',
          streamType: isMpd ? 'mpd' : 'hls',
          playUrl: canPlayDirect ? finalUrl : proxyUrl,
          directUrl: isHttps ? finalUrl : null,
          proxyUrl,
        }),
        { headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            err?.name === 'TimeoutError'
              ? 'Kênh phản hồi quá chậm — có thể luồng trực tiếp chưa lên sóng.'
              : 'Không kết nối được tới máy chủ kênh này.',
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 3. PROXY: Chuyển tiếp HLS/DASH manifest & segment (Chỉ phục vụ Same-Origin CarHub VF5 + Chống SSRF redirect!)
  // =========================================================================
  if (action === 'proxy') {
    const corsOrigin = getTrustedCorsOrigin(request);
    if (!isTrustedAppRequest(request, { allowAppleMediaUa: true })) {
      return new Response('Forbidden', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' },
      });
    }

    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    const ua = (reqUrl.searchParams.get('ua') || '').trim() || undefined;
    const referer = (reqUrl.searchParams.get('ref') || '').trim() || undefined;

    if (!isSafeExternalUrl(targetUrl)) {
      return new Response('Invalid URL', { status: 400 });
    }

    const incomingRange = request.headers.get('Range');

    try {
      const { response: upstream, finalUrl, usedUa } = await fetchStreamUpstream(targetUrl, {
        ua,
        referer,
        range: incomingRange,
        timeoutMs: 15000,
      });
      const effectiveUa = ua || (usedUa === VLC_FALLBACK_UA ? VLC_FALLBACK_UA : undefined);

      if (!upstream.ok && upstream.status !== 206) {
        return new Response(`Upstream error ${upstream.status}`, {
          status: upstream.status,
          headers: { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' },
        });
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const looksLikeM3u8 =
        contentType.includes('mpegurl') ||
        contentType.includes('application/x-mpegurl') ||
        /\.m3u8(\?|$)/i.test(finalUrl);
      const looksLikeMpd =
        contentType.includes('dash+xml') || /\.mpd(\?|$)/i.test(finalUrl);

      const safeMediaHeaders = {
        'Access-Control-Allow-Origin': corsOrigin,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': 'sandbox',
        Vary: 'Origin',
      };

      if (looksLikeM3u8) {
        const readRes = await readTextLimited(upstream, 1024 * 1024);
        if (!readRes.ok) {
          return new Response('Manifest too large', {
            status: readRes.status,
            headers: safeMediaHeaders,
          });
        }
        const text = readRes.text;
        if (text.trimStart().startsWith('#EXTM3U')) {
          const rewritten = rewriteHlsPlaylist(text, finalUrl, effectiveUa, referer);
          return new Response(rewritten, {
            status: 200,
            headers: {
              ...safeMediaHeaders,
              'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          });
        }
        return new Response('Unsupported playlist content', {
          status: 415,
          headers: safeMediaHeaders,
        });
      }

      if (looksLikeMpd) {
        const readRes = await readTextLimited(upstream, 1024 * 1024);
        if (!readRes.ok) {
          return new Response('Manifest too large', {
            status: readRes.status,
            headers: safeMediaHeaders,
          });
        }
        let xml = readRes.text;
        if (!xml.includes('<MPD')) {
          return new Response('Unsupported MPD manifest', {
            status: 415,
            headers: safeMediaHeaders,
          });
        }
        const escapeXml = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        if (!/<BaseURL\b/i.test(xml)) {
          try {
            const baseDir = new URL('./', finalUrl).toString();
            xml = xml.replace(/(<MPD\b[^>]*>)/i, `$1<BaseURL>${escapeXml(baseDir)}</BaseURL>`);
          } catch {}
        } else {
          // Chuyển mọi <BaseURL> tương đối thành URL tuyệt đối an toàn
          xml = xml.replace(/<BaseURL([^>]*)>([^<]+)<\/BaseURL>/gi, (m, attrs, inner) => {
            const trimmed = inner.trim();
            if (/^https?:\/\//i.test(trimmed)) return m;
            try {
              const abs = new URL(trimmed, finalUrl).toString();
              return `<BaseURL${attrs}>${escapeXml(abs)}</BaseURL>`;
            } catch {
              return m;
            }
          });
        }
        return new Response(xml, {
          status: 200,
          headers: {
            ...safeMediaHeaders,
            'Content-Type': 'application/dash+xml; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      }

      // Chặn triệt để Same-Origin XSS: chỉ cho phép pass-through đúng Content-Type media (chặn text/html, svg, js...)
      const rawCt = upstream.headers.get('content-type');
      if (!isSafeProxyMediaContentType(rawCt)) {
        try {
          await upstream.body?.cancel();
        } catch {}
        return new Response('Unsupported media type', {
          status: 415,
          headers: safeMediaHeaders,
        });
      }

      const respHeaders = new Headers();
      respHeaders.set('Content-Type', rawCt || 'video/mp2t');
      respHeaders.set('Access-Control-Allow-Origin', corsOrigin);
      respHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      respHeaders.set('X-Content-Type-Options', 'nosniff');
      respHeaders.set('Content-Security-Policy', 'sandbox');
      respHeaders.set('Vary', 'Origin');
      respHeaders.set('Cache-Control', 'public, max-age=15');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) respHeaders.set('Content-Range', contentRange);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) respHeaders.set('Accept-Ranges', acceptRanges);

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });
    } catch {
      return new Response('Proxy timeout', {
        status: 504,
        headers: { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' },
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Unsupported action' }), {
    status: 400,
    headers: JSON_HEADERS,
  });
}
