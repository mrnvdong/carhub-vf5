// Cloudflare Pages Function: /api/suggest
import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const CORS_HEADERS = buildTrustedJsonHeaders(request);
  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);

  if (!q) {
    return new Response(JSON.stringify({ suggestions: [] }), {
      headers: CORS_HEADERS,
    });
  }

  try {
    // client=firefox&ds=yt returns clean UTF-8 JSON array ["query", ["sug1", "sug2", ...]]
    const suggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=vi&gl=VN&q=${encodeURIComponent(
      q
    )}`;
    const res = await fetch(suggestUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const json: any = await res.json();
      const rawList = Array.isArray(json?.[1]) ? json[1] : [];
      const suggestions = rawList
        .map((item: any) => (typeof item === 'string' ? item : item?.[0]))
        .filter((s: any): s is string => typeof s === 'string' && s.trim().length > 0)
        .slice(0, 8);

      return new Response(JSON.stringify({ suggestions }), {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, max-age=600',
        },
      });
    }
  } catch (err) {
    console.warn('Suggest query failed:', err);
  }

  return new Response(JSON.stringify({ suggestions: [] }), {
    headers: CORS_HEADERS,
  });
}
