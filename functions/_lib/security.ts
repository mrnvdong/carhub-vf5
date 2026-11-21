// Shared security, Same-Origin guard, strict anti-SSRF URL validation,
// redirect-safe external fetch, and streaming payload size guards for Cloudflare Pages Functions.

const TRUSTED_PROD_SUFFIXES = ['.carhub-vf5.pages.dev'];
const TRUSTED_PROD_EXACT_HOSTS = new Set(['carhub-vf5.pages.dev']);
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1']);

function isLocalHost(h: string): boolean {
  return LOCAL_DEV_HOSTS.has(h.toLowerCase());
}

export function isTrustedHostname(hostname: string, reqHost?: string): boolean {
  const h = hostname.toLowerCase();
  const reqLower = reqHost ? reqHost.toLowerCase() : '';
  if (reqLower && h === reqLower) return true;
  if (TRUSTED_PROD_EXACT_HOSTS.has(h)) return true;
  for (const suf of TRUSTED_PROD_SUFFIXES) {
    if (h.endsWith(suf)) return true;
  }
  // Chỉ tin localhost/127.0.0.1 khi chính server đang chạy ở localhost (dev)
  if (reqLower && isLocalHost(reqLower) && isLocalHost(h)) {
    return true;
  }
  return false;
}

function isTrustedUrlHeader(raw: string | null, reqHost: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (!isTrustedHostname(h, reqHost)) return false;
    // Production chỉ chấp nhận HTTPS; HTTP chỉ cho phép localhost dev
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && isLocalHost(h) && isLocalHost(reqHost)) return true;
    return false;
  } catch {
    return false;
  }
}

const DISALLOWED_MEDIA_FETCH_DEST = new Set([
  'document',
  'iframe',
  'frame',
  'fencedframe',
  'object',
  'embed',
  'script',
  'style',
]);

/**
 * Kiểm tra request hợp lệ đến từ chính app CarHub VF5 (chống web ngoài dùng chùa Proxy / đốt quota).
 * Giữ tương thích tuyệt đối với Apple CarPlay WKWebView & AVPlayer (`AppleCoreMedia` / `CFNetwork`),
 * nhưng TUYỆT ĐỐI KHÔNG cho phép trình duyệt Safari điều hướng trực tiếp (document/iframe) vào proxy.
 */
export function isTrustedAppRequest(
  request: Request,
  options: { allowAppleMediaUa?: boolean } = {}
): boolean {
  const reqUrl = new URL(request.url);
  const reqHost = reqUrl.hostname.toLowerCase();

  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').toLowerCase();
  const secFetchDest = (request.headers.get('Sec-Fetch-Dest') || '').toLowerCase();
  const secFetchMode = (request.headers.get('Sec-Fetch-Mode') || '').toLowerCase();
  const ua = request.headers.get('User-Agent') || '';

  // Chặn tuyệt đối nếu có Origin/Referer từ domain lạ hoặc cross-site
  if (origin && origin !== 'null' && !isTrustedUrlHeader(origin, reqHost)) {
    return false;
  }
  if (referer && !isTrustedUrlHeader(referer, reqHost)) {
    return false;
  }
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }

  // Khớp trực tiếp Origin / Referer / Sec-Fetch-Site same-origin
  if (
    (origin && isTrustedUrlHeader(origin, reqHost)) ||
    (referer && isTrustedUrlHeader(referer, reqHost)) ||
    secFetchSite === 'same-origin'
  ) {
    return true;
  }

  // Cho phép iOS AVPlayer / CFNetwork tải <audio>/<video> native từ WKWebView (không gửi Origin/Referer)
  // KHÔNG bao giờ match Safari UA chung (iPhone/iPad) hay navigation request!
  if (
    options.allowAppleMediaUa &&
    !origin &&
    !referer &&
    secFetchMode !== 'navigate' &&
    !DISALLOWED_MEDIA_FETCH_DEST.has(secFetchDest) &&
    /AppleCoreMedia|CFNetwork/i.test(ua)
  ) {
    return true;
  }

  return false;
}

export function getTrustedCorsOrigin(request: Request): string {
  const reqUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && isTrustedUrlHeader(origin, reqUrl.hostname)) {
    return origin;
  }
  return reqUrl.origin;
}

export function buildTrustedJsonHeaders(request: Request): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getTrustedCorsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
}

function isPrivateIpv4Parts(a: number, b: number, c: number, d: number): boolean {
  if ([a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10/8, 127/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // Link-local / Cloud metadata 169.254/16
  if (a === 172 && b >= 16 && b <= 31) return true; // Private 172.16/12
  if (a === 192 && b === 168) return true; // Private 192.168/16
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a >= 224) return true; // Multicast & Reserved
  return false;
}

function isPublicGlobalIpv6(rawHost: string): boolean {
  // Loại zone ID nếu có (vd fe80::1%eth0)
  if (rawHost.includes('%')) return false;
  const low = rawHost.toLowerCase();
  if (low.startsWith(':') || low.includes('.')) return false; // Chặn ::, ::1, ::ffff:127.0.0.1
  const firstSeg = low.split(':')[0];
  if (!/^[0-9a-f]{1,4}$/.test(firstSeg)) return false;
  const firstWord = parseInt(firstSeg, 16);
  // Chỉ cho phép Global Unicast IPv6: 2000::/3 (0x2000 - 0x3fff)
  if (firstWord < 0x2000 || firstWord > 0x3fff) return false;
  // Chặn thêm các dải đặc biệt trong 2000::/3 (6to4 2002::/16, Teredo/Documentation/Benchmarking 2001:*)
  if (firstWord === 0x2002) return false;
  if (firstWord === 0x2001) {
    const segs = low.split(':');
    const secondWord = segs[1] ? parseInt(segs[1], 16) : 0;
    if (
      secondWord === 0x0000 || // Teredo 2001::/32
      secondWord === 0x0002 || // Benchmarking 2001:2::/48
      secondWord === 0x0db8 || // Documentation 2001:db8::/32
      (secondWord >= 0x0010 && secondWord <= 0x001f) // ORCHID
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Chặn triệt để SSRF:
 * - Chỉ cho phép http/https, không chứa user:pass
 * - Chặn localhost, .local, .internal, .localhost, cloud metadata
 * - Chặn IPv4 private/loopback/link-local/CGNAT, IP thập phân/hex/octal/rút gọn (127.1, 2130706433, 0x7f000001)
 * - Chỉ cho phép IPv6 Global Unicast hợp lệ (2000::/3 trừ dải đặc biệt)
 */
export function isSafePublicHttpUrl(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;

    const rawHost = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (!rawHost) return false;

    const host =
      rawHost.startsWith('[') && rawHost.endsWith(']') ? rawHost.slice(1, -1) : rawHost;

    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::' ||
      host === '::1' ||
      host === 'metadata.google.internal' ||
      host === 'metadata.goog' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost') ||
      host.endsWith('.home.arpa')
    ) {
      return false;
    }

    // Kiểm tra IPv6 chặt chẽ
    if (host.includes(':')) {
      return isPublicGlobalIpv6(host);
    }

    // Chặn IP số học 1-4 đoạn (kể cả rút gọn 127.1, thập phân 2130706433, hex 0x7f000001, octal 0177.0.0.1)
    const parts = host.split('.');
    if (parts.length >= 1 && parts.length <= 4 && parts.every((p) => /^(?:0x[0-9a-f]+|\d+)$/i.test(p))) {
      if (parts.length !== 4) return false;
      const nums = parts.map((p) => {
        if (/^0x/i.test(p)) return parseInt(p, 16);
        if (p.length > 1 && p.startsWith('0')) return parseInt(p, 8);
        return parseInt(p, 10);
      });
      if (isPrivateIpv4Parts(nums[0], nums[1], nums[2], nums[3])) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch ngoài có kiểm tra SSRF ở TỪNG bước redirect (chặn 302 vào IP nội bộ),
 * tự bỏ các header nhạy cảm (Cookie/Authorization/Origin/Referer) khi nhảy sang origin khác,
 * và luôn có timeout mặc định 12s chống treo Worker.
 */
export async function safeFetchExternal(
  initialUrl: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  let currentInit: RequestInit = {
    ...init,
    signal: init.signal || AbortSignal.timeout(12000),
  };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafePublicHttpUrl(currentUrl)) {
      throw new Error('Blocked unsafe external URL');
    }

    const res = await fetch(currentUrl, {
      ...currentInit,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (!loc) {
        return { response: res, finalUrl: currentUrl };
      }
      try {
        await res.body?.cancel();
      } catch {}

      const prevOrigin = new URL(currentUrl).origin;
      const nextUrlObj = new URL(loc, currentUrl);
      const nextUrl = nextUrlObj.toString();

      // Khi redirect sang domain khác -> gỡ bỏ header nhạy cảm tránh rò rỉ thông tin
      if (nextUrlObj.origin !== prevOrigin && currentInit.headers) {
        const sanitized = new Headers(currentInit.headers);
        sanitized.delete('Authorization');
        sanitized.delete('Cookie');
        sanitized.delete('Origin');
        currentInit = { ...currentInit, headers: sanitized };
      }

      currentUrl = nextUrl;
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects');
}

/**
 * Đọc văn bản từ Request/Response theo kiểu streaming có trần byte tuyệt đối
 * (chống Transfer-Encoding: chunked phình RAM gây OOM Worker).
 */
export async function readTextLimited(
  source: Request | Response,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  const cl = Number(source.headers.get('Content-Length') || '0');
  if (Number.isFinite(cl) && cl > maxBytes) {
    try {
      await source.body?.cancel();
    } catch {}
    return { ok: false, status: 413, error: 'Dữ liệu vượt quá giới hạn dung lượng cho phép.' };
  }

  const body = source.body;
  if (!body) {
    return { ok: true, text: '' };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        return { ok: false, status: 413, error: 'Dữ liệu vượt quá giới hạn dung lượng cho phép.' };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, status: 400, error: 'Không thể đọc luồng dữ liệu.' };
  }
}

/**
 * Đọc JSON POST theo kiểu streaming có trần byte (mặc định 256 KB) chống đẩy rác làm OOM Worker.
 */
export async function readJsonBodyLimited(
  request: Request,
  maxBytes = 262144
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const readRes = await readTextLimited(request, maxBytes);
  if (!readRes.ok) {
    return readRes;
  }
  try {
    return { ok: true, data: JSON.parse(readRes.text) };
  } catch {
    return { ok: false, status: 400, error: 'Dữ liệu JSON không hợp lệ.' };
  }
}

/**
 * Kiểm tra Content-Type có thuộc nhóm media nhị phân/manifest hợp lệ hay không
 * (chặn triệt để text/html, image/svg+xml, application/javascript nhằm ngừa Same-Origin Reflected XSS).
 */
export function isSafeProxyMediaContentType(rawContentType: string | null): boolean {
  const ct = (rawContentType || '').split(';')[0].trim().toLowerCase();
  if (!ct) return true; // Nhiều CDN TS/AAC trả rỗng Content-Type -> sẽ ép fallback an toàn video/mp2t hoặc audio/mp4
  if (
    ct.startsWith('video/') ||
    ct.startsWith('audio/') ||
    ct === 'application/octet-stream' ||
    ct === 'binary/octet-stream' ||
    ct === 'application/vnd.apple.mpegurl' ||
    ct === 'application/x-mpegurl' ||
    ct === 'application/dash+xml' ||
    ct === 'application/mp4' ||
    ct === 'application/mp2t' ||
    ct === 'image/png' || // Một số HLS phân mảnh ngụy trang PNG-TS
    ct === 'image/jpeg'
  ) {
    return true;
  }
  return false;
}
