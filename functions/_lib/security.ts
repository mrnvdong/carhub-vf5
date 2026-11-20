// Shared security, Same-Origin guard, strict anti-SSRF URL validation,
// redirect-safe external fetch, and payload size guard for Cloudflare Pages Functions.

const TRUSTED_HOST_SUFFIXES = ['.carhub-vf5.pages.dev'];
const TRUSTED_EXACT_HOSTS = new Set([
  'carhub-vf5.pages.dev',
  'localhost',
  '127.0.0.1',
]);

export function isTrustedHostname(hostname: string, reqHost?: string): boolean {
  const h = hostname.toLowerCase();
  if (reqHost && h === reqHost.toLowerCase()) return true;
  if (TRUSTED_EXACT_HOSTS.has(h)) return true;
  for (const suf of TRUSTED_HOST_SUFFIXES) {
    if (h.endsWith(suf)) return true;
  }
  return false;
}

function isTrustedUrlHeader(raw: string | null, reqHost: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return isTrustedHostname(u.hostname, reqHost);
  } catch {
    return false;
  }
}

/**
 * Kiểm tra request hợp lệ đến từ chính app CarHub VF5 (chống web ngoài dùng chùa Proxy / đốt quota TTS).
 * Giữ tương thích tuyệt đối với Apple CarPlay WKWebView & AVPlayer (`AppleCoreMedia`).
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
  if (
    options.allowAppleMediaUa &&
    (/AppleCoreMedia|CFNetwork|iPhone|iPad/i.test(ua) && !origin && !referer)
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

/**
 * Chặn triệt để SSRF:
 * - Chỉ cho phép http/https
 * - Chặn localhost, .local, .internal, .localhost, cloud metadata
 * - Chặn IPv4 private/loopback/link-local/CGNAT, IP thập phân/hex/octal (vd 2130706433, 0x7f000001)
 * - Chặn IPv6 loopback (::1), ULA (fc00::/7), link-local (fe80::/10), IPv4-mapped (::ffff:...)
 */
export function isSafePublicHttpUrl(raw: string): boolean {
  if (!raw || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;

    const rawHost = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (!rawHost) return false;

    const host = rawHost.startsWith('[') && rawHost.endsWith(']')
      ? rawHost.slice(1, -1)
      : rawHost;

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

    // Chặn IPv6 private / link-local / mapped IPv4
    if (host.includes(':')) {
      const low = host.toLowerCase();
      if (
        low === '::' ||
        low === '::1' ||
        low.startsWith('fe8') ||
        low.startsWith('fe9') ||
        low.startsWith('fea') ||
        low.startsWith('feb') ||
        low.startsWith('fc') ||
        low.startsWith('fd') ||
        low.startsWith('ff') ||
        low.startsWith('::ffff:') ||
        low.startsWith('0:0:0:0:0:ffff:')
      ) {
        return false;
      }
      return true;
    }

    // Chặn IP thập phân đơn (vd http://2130706433) hoặc hex đơn (0x7f000001)
    if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
      return false;
    }

    // Chặn IPv4 dạng chấm (bao gồm dạng octal 0177.0.0.1 hoặc hex 0x7f.0.0.1)
    const parts = host.split('.');
    if (parts.length === 4 && parts.every((p) => /^(?:0x[0-9a-f]+|\d+)$/i.test(p))) {
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
 * Fetch ngoài có kiểm tra SSRF ở TỪNG bước redirect (chặn lỗ hổng 302 redirect vào IP nội bộ).
 */
export async function safeFetchExternal(
  initialUrl: string,
  init: RequestInit = {},
  maxRedirects = 4
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafePublicHttpUrl(currentUrl)) {
      throw new Error('Blocked unsafe external URL');
    }

    const res = await fetch(currentUrl, {
      ...init,
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
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    return { response: res, finalUrl: currentUrl };
  }

  throw new Error('Too many redirects');
}

/**
 * Đọc JSON POST có giới hạn dung lượng (mặc định 256 KB) chống đẩy rác làm OOM Worker.
 */
export async function readJsonBodyLimited(
  request: Request,
  maxBytes = 262144
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const cl = Number(request.headers.get('Content-Length') || '0');
  if (Number.isFinite(cl) && cl > maxBytes) {
    return { ok: false, status: 413, error: 'Dữ liệu gửi lên vượt quá giới hạn cho phép.' };
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maxBytes) {
      return { ok: false, status: 413, error: 'Dữ liệu gửi lên vượt quá giới hạn 256 KB.' };
    }
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: 'Dữ liệu JSON không hợp lệ.' };
  }
}
