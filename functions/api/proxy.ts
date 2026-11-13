// Cloudflare Pages Function: /api/proxy
// High-performance proxy for googlevideo.com media streams with dynamic client UA matching, Range support, and CORS
export async function onRequestGet(context: any) {
  return handleProxyRequest(context);
}

export async function onRequestHead(context: any) {
  return handleProxyRequest(context);
}

async function handleProxyRequest(context: any) {
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

  const cParam = parsedTarget.searchParams.get('c') || '';

  const headers = new Headers();
  const range = request.headers.get('Range');
  if (range) {
    headers.set('Range', range);
  } else {
    // Default to initial byte range for smooth stream startup
    headers.set('Range', 'bytes=0-');
  }

  // Dynamic User-Agent matching: Must match the client token in the googlevideo URL
  if (cParam.includes('IOS')) {
    headers.set(
      'User-Agent',
      'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)'
    );
  } else if (cParam.includes('ANDROID')) {
    headers.set(
      'User-Agent',
      'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
    );
  } else {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    );
  }

  headers.set('Accept-Encoding', 'identity');
  headers.set('Origin', 'https://www.youtube.com');
  headers.set('Referer', 'https://www.youtube.com/');

  try {
    const upstream = await fetch(parsedTarget.toString(), {
      method: request.method,
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(7500),
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
    respHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
    respHeaders.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges'
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    return new Response(`Upstream proxy error: ${err.message}`, { status: 502 });
  }
}
