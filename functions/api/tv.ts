// Cloudflare Pages Function: /api/tv
// Live TV & Radio M3U8/DASH engine for VinFast VF5 CarPlay:
// - GET  action=playlist : Fetches & parses ALL channels from M3U/M3U8 (default https://tinyurl.com/vmt47), 5m Edge Cache
// - GET  action=resolve  : Follows 302/307 redirects with channel User-Agent/Referer -> direct CORS URL or proxy URL
// - GET  action=proxy    : SSRF-safe CORS proxy for non-CORS / HTTP / custom-header HLS/DASH manifests & segments
// - POST action=ping     : Fast parallel live-status ping for up to 16 channels at once (live/dead + latencyMs)

const DEFAULT_PLAYLIST_URL = 'https://tinyurl.com/vmt47';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

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
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = Number(ipv4[1]);
      const b = Number(ipv4[2]);
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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

  const headers: Record<string, string> = {
    'User-Agent': ch.ua || DEFAULT_UA,
    Accept: '*/*',
  };
  if (ch.referer && isSafeExternalUrl(ch.referer)) {
    headers['Referer'] = ch.referer;
  }

  try {
    const res = await fetch(ch.url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - t0;
    const finalUrl = res.url || ch.url;

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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context: any) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'ping').trim();

  if (action !== 'ping') {
    return new Response(JSON.stringify({ success: false, error: 'Unsupported POST action' }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body: any = await request.json();
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
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
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
  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'playlist').trim();

  // =========================================================================
  // 1. PLAYLIST: Tải & giữ NGUYÊN 100% TẤT CẢ KÊNH từ M3U/M3U8 (không ẩn kênh nào!)
  // =========================================================================
  if (action === 'playlist') {
    const sourceParam = (reqUrl.searchParams.get('url') || DEFAULT_PLAYLIST_URL).trim();
    if (!isSafeExternalUrl(sourceParam)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Đường dẫn danh sách M3U không hợp lệ.' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const cache = (caches as any).default;
    const cacheKey = new Request(
      `https://carhub-tv-playlist.internal/v2?u=${encodeURIComponent(sourceParam)}`
    );
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      } catch {}
    }

    try {
      const upstream = await fetch(sourceParam, {
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: '*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
      });

      if (!upstream.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Không tải được danh sách kênh TV (HTTP ${upstream.status}).`,
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      const text = await upstream.text();
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
        resolvedSourceUrl: upstream.url || sourceParam,
        epgUrl,
        totalRaw: channels.length,
        totalPlayable: channels.length,
        totalDrmCount: drmCount,
        groups,
        channels,
      };

      const resp = new Response(JSON.stringify(payload), {
        headers: {
          ...JSON_HEADERS,
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
      if (cache && channels.length > 0) {
        context.waitUntil(cache.put(cacheKey, resp.clone()));
      }
      return resp;
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
    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    const ua = (reqUrl.searchParams.get('ua') || '').trim() || undefined;
    const referer = (reqUrl.searchParams.get('ref') || '').trim() || undefined;

    if (!isSafeExternalUrl(targetUrl)) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL kênh không hợp lệ.' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const headers: Record<string, string> = {
      'User-Agent': ua || DEFAULT_UA,
      Accept: '*/*',
    };
    if (referer && isSafeExternalUrl(referer)) {
      headers['Referer'] = referer;
    }

    try {
      const upstream = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });

      const finalUrl = upstream.url || targetUrl;
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
      const hasOpenCors = acao === '*';
      const isHlsContentType = contentType.includes('mpegurl');
      const isDirectAudio =
        !isHlsContentType &&
        (contentType.includes('audio/') || contentType.includes('aacp'));

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
            playUrl: mode === 'direct' ? finalUrl : buildProxyUrl(finalUrl, ua, referer),
            directUrl: finalUrl,
            proxyUrl: buildProxyUrl(finalUrl, ua, referer),
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
      const proxyUrl = buildProxyUrl(finalUrl, ua, referer);

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
  // 3. PROXY: Chuyển tiếp HLS/DASH manifest & segment với CORS:*
  // =========================================================================
  if (action === 'proxy') {
    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    const ua = (reqUrl.searchParams.get('ua') || '').trim() || undefined;
    const referer = (reqUrl.searchParams.get('ref') || '').trim() || undefined;

    if (!isSafeExternalUrl(targetUrl)) {
      return new Response('Invalid URL', { status: 400 });
    }

    const headers: Record<string, string> = {
      'User-Agent': ua || DEFAULT_UA,
      Accept: '*/*',
    };
    if (referer && isSafeExternalUrl(referer)) {
      headers['Referer'] = referer;
    }

    try {
      const upstream = await fetch(targetUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
      });

      if (!upstream.ok) {
        return new Response(`Upstream error ${upstream.status}`, {
          status: upstream.status,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }

      const finalUrl = upstream.url || targetUrl;
      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const looksLikeM3u8 =
        contentType.includes('mpegurl') ||
        contentType.includes('application/x-mpegurl') ||
        /\.m3u8(\?|$)/i.test(finalUrl);
      const looksLikeMpd =
        contentType.includes('dash+xml') || /\.mpd(\?|$)/i.test(finalUrl);

      if (looksLikeM3u8) {
        const text = await upstream.text();
        if (text.trimStart().startsWith('#EXTM3U')) {
          const rewritten = rewriteHlsPlaylist(text, finalUrl, ua, referer);
          return new Response(rewritten, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store',
            },
          });
        }
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': contentType || 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }

      if (looksLikeMpd) {
        let xml = await upstream.text();
        if (xml.includes('<MPD') && !/<BaseURL\b/i.test(xml)) {
          try {
            const baseDir = new URL('./', finalUrl).toString();
            const safeBase = baseDir.replace(/&/g, '&amp;');
            xml = xml.replace(/(<MPD\b[^>]*>)/i, `$1<BaseURL>${safeBase}</BaseURL>`);
          } catch {}
        }
        return new Response(xml, {
          status: 200,
          headers: {
            'Content-Type': 'application/dash+xml; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        });
      }

      const respHeaders = new Headers();
      respHeaders.set('Content-Type', upstream.headers.get('content-type') || 'video/mp2t');
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Cache-Control', 'public, max-age=30');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) respHeaders.set('Content-Length', contentLength);

      return new Response(upstream.body, {
        status: upstream.status,
        headers: respHeaders,
      });
    } catch {
      return new Response('Proxy timeout', {
        status: 504,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Unsupported action' }), {
    status: 400,
    headers: JSON_HEADERS,
  });
}
