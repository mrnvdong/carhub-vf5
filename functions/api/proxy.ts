// Cloudflare Pages Function: /api/proxy
// Proxies googlevideo.com media streams with Range support if client IP is rejected by direct CDN
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get('url');

  if (!target) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    return new Response('Invalid target URL', { status: 400 });
  }

  // Security check: Only allow googlevideo.com and youtube.com subdomains
  const host = parsedTarget.hostname.toLowerCase();
  if (
    !host.endsWith('.googlevideo.com') &&
    !host.endsWith('.youtube.com') &&
    !host.endsWith('.ytimg.com')
  ) {
    return new Response('Forbidden domain', { status: 403 });
  }

  const headers = new Headers();
  const range = request.headers.get('Range');
  if (range) {
    headers.set('Range', range);
  }
  headers.set(
    'User-Agent',
    'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
  );

  try {
    const upstream = await fetch(parsedTarget.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
    });

    const respHeaders = new Headers();
    const copyHeaders = [
      'Content-Type',
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
      'Cache-Control',
    ];
    for (const h of copyHeaders) {
      const val = upstream.headers.get(h);
      if (val) respHeaders.set(h, val);
    }
    respHeaders.set('Access-Control-Allow-Origin', '*');
    respHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response('Upstream proxy error', { status: 502 });
  }
}
