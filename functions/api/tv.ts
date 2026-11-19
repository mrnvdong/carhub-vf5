// Cloudflare Pages Function: /api/tv
// Live TV & Radio M3U8 engine for VinFast VF5 CarPlay:
// - action=playlist: Fetches & parses M3U/M3U8 (default https://tinyurl.com/vmt47 -> raw GitHub vmttv), 5m Edge Cache
// - action=resolve: Follows 302/307 redirects with channel User-Agent/Referer, returns direct CORS CDN URL or proxy URL
// - action=proxy: SSRF-safe CORS proxy for non-CORS / HTTP / custom-header HLS manifests & segments

const DEFAULT_PLAYLIST_URL = 'https://tinyurl.com/vmt47';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
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
    // Block private IPv4 ranges (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x)
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
      if (/license_type|clearkey|widevine|manifest_type=mpd/i.test(line)) {
        current.isDrm = true;
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    if (current) {
      const streamUrl = line.split('|')[0].trim();
      const urlIsMpd = /\.mpd(\?|$)/i.test(streamUrl) || /\/mpd\.php/i.test(streamUrl);
      const isDrm = current.isDrm || urlIsMpd;

      if (isDrm) {
        drmCount++;
      } else if (isSafeExternalUrl(streamUrl)) {
        idx++;
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
          isDrm: false,
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

      // Rewrite URI="..." inside #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-I-FRAME-STREAM-INF
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

export async function onRequestGet(context: any) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'playlist').trim();

  // =========================================================================
  // 1. PLAYLIST: Tải & phân tích danh sách kênh M3U/M3U8 (mặc định tinyurl.com/vmt47)
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
      `https://carhub-tv-playlist.internal/v1?u=${encodeURIComponent(sourceParam)}`
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

      // Nhóm kênh & sắp xếp theo thứ tự ưu tiên trên ô tô Việt Nam
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
        totalRaw: channels.length + drmCount,
        totalPlayable: channels.length,
        totalDrmFiltered: drmCount,
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
  // 2. RESOLVE: Theo dõi 302/307 bằng đúng User-Agent/Referer của kênh
  //    -> Trả thẳng link CDN nếu HTTPS + CORS:*, hoặc trả link proxy nếu thiếu CORS / HTTP
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
        signal: AbortSignal.timeout(7500),
      });

      const finalUrl = upstream.url || targetUrl;
      if (/\/error\.mp4(\?|$)/i.test(finalUrl)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Kênh này đang tạm gián đoạn từ máy chủ phát sóng, vui lòng thử kênh khác.',
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      if (!upstream.ok) {
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

      // Nếu là audio trực tiếp (zeno.fm / icecast...) không cần đọc toàn bộ stream!
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

      const sampleText = await upstream.text();
      const isHls =
        sampleText.trimStart().startsWith('#EXTM3U') ||
        contentType.includes('mpegurl') ||
        /\.m3u8(\?|$)/i.test(finalUrl);

      if (!isHls) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Nguồn kênh không trả về luồng phát HLS hợp lệ (có thể đang ngoại tuyến).',
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      // Ưu tiên phát thẳng từ CDN gốc nếu HTTPS + CORS:* + không bắt buộc Referer
      const canPlayDirect = isHttps && hasOpenCors && !referer;
      const proxyUrl = buildProxyUrl(finalUrl, ua, referer);

      return new Response(
        JSON.stringify({
          success: true,
          mode: canPlayDirect ? 'direct' : 'proxy',
          streamType: 'hls',
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
  // 3. PROXY: Chuyển tiếp HLS manifest (tự viết lại URI con) & segment với CORS:*
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
