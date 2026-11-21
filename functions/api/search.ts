// Cloudflare Pages Function: /api/search
import { searchViaYouTubeInnerTube, formatDuration } from '../_lib/youtubeSearch';
import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const CORS_HEADERS = buildTrustedJsonHeaders(request);
  if (!isTrustedAppRequest(request)) {
    return new Response(
      JSON.stringify({ success: false, items: [], nextContinuation: null, error: 'Forbidden origin' }),
      { status: 403, headers: CORS_HEADERS }
    );
  }
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || 'nhạc trẻ remix lái xe').trim().slice(0, 120);
  const continuation = (url.searchParams.get('continuation') || '').slice(0, 512) || null;

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `https://carhub-yt-search.internal/v3?q=${encodeURIComponent(query)}&c=${encodeURIComponent(
      continuation || ''
    )}`
  );

  if (cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
        });
      }
    } catch {}
  }

  // 1. Direct Cloudflare Edge to YouTube InnerTube
  try {
    const ytResult = await searchViaYouTubeInnerTube(query, continuation, true);
    if (ytResult && ytResult.items.length > 0) {
      const serialized = JSON.stringify({
        success: true,
        source: 'edge-innertube',
        items: ytResult.items,
        nextContinuation: ytResult.nextContinuation,
      });
      if (cache) {
        context.waitUntil(
          cache.put(
            cacheKey,
            new Response(serialized, {
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
            })
          )
        );
      }
      return new Response(serialized, {
        headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
      });
    }
  } catch (err) {
    console.warn('InnerTube search failed, switching to Piped fallback:', err);
  }

  // 2. Fallback via Piped Instances (fast 2.5s timeout each)
  const pipedInstances = [
    'https://api.piped.private.coffee',
    'https://pipedapi.ducks.party',
  ];

  for (const instance of pipedInstances) {
    try {
      let pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      if (continuation) {
        pipedUrl = `${instance}/nextpage/search?nextpage=${encodeURIComponent(
          continuation
        )}&q=${encodeURIComponent(query)}&filter=videos`;
      }

      const res = await fetch(pipedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
        signal: AbortSignal.timeout(2500),
      });

      if (res.ok) {
        const data: any = await res.json();
        const seen = new Set<string>();
        const items = (data.items || [])
          .filter((item: any) => item.type === 'stream' || !item.type)
          .map((item: any) => {
            const id = (item.url || '').replace('/watch?v=', '') || item.id || '';
            return {
              id,
              title: item.title || '',
              uploaderName: item.uploaderName || item.channel || '',
              uploaderAvatar: item.uploaderAvatar || null,
              duration: item.duration || 0,
              durationText: item.duration > 0 ? formatDuration(item.duration) : '',
              uploadedDate: item.uploadedDate || '',
              viewsText: item.views ? `${item.views.toLocaleString('vi-VN')} lượt xem` : '',
              thumbnail:
                item.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
            };
          })
          .filter((item: any) => {
            if (!item.id || !/^[a-zA-Z0-9_-]{11}$/.test(item.id) || seen.has(item.id)) {
              return false;
            }
            seen.add(item.id);
            return true;
          });

        if (items.length > 0) {
          const serialized = JSON.stringify({
            success: true,
            source: 'piped-api',
            items,
            nextContinuation: data.nextpage || null,
          });
          if (cache) {
            context.waitUntil(
              cache.put(
                cacheKey,
                new Response(serialized, {
                  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
                })
              )
            );
          }
          return new Response(serialized, {
            headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300' },
          });
        }
      }
    } catch {
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      success: false,
      items: [],
      nextContinuation: null,
      error: 'Could not fetch search results',
    }),
    {
      status: 502,
      headers: CORS_HEADERS,
    }
  );
}
