// Cloudflare Pages Function: /api/search
import { searchViaYouTubeInnerTube, formatDuration } from '../_lib/youtubeSearch';

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'nhạc trẻ remix lái xe';
  const continuation = url.searchParams.get('continuation') || null;

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `${url.origin}/api/search?q=${encodeURIComponent(query)}&continuation=${encodeURIComponent(
      continuation || ''
    )}&v=2`
  );

  if (cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    } catch {}
  }

  // 1. Direct Cloudflare Edge to YouTube InnerTube
  try {
    const ytResult = await searchViaYouTubeInnerTube(query, continuation, true);
    if (ytResult && ytResult.items.length > 0) {
      const resp = new Response(
        JSON.stringify({
          success: true,
          source: 'edge-innertube',
          items: ytResult.items,
          nextContinuation: ytResult.nextContinuation,
        }),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
      if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
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
          const resp = new Response(
            JSON.stringify({
              success: true,
              source: 'piped-api',
              items,
              nextContinuation: data.nextpage || null,
            }),
            {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'public, max-age=300',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
          if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
          return resp;
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
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
