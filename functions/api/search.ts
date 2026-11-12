// Cloudflare Pages Function: /api/search
export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'nhạc trẻ remix lái xe';

  const cache = (caches as any).default;
  const cacheKey = new Request(url.toString(), request);
  if (cache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Phương án B: Direct Cloudflare Edge to YouTube InnerTube (Fastest & No 3rd party dependency)
  try {
    const ytResult = await searchViaYouTubeInnerTube(query);
    if (ytResult && ytResult.length > 0) {
      const resp = new Response(JSON.stringify({ success: true, source: 'edge-innertube', items: ytResult }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
      if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }
  } catch (err) {
    console.warn('InnerTube search failed, switching to Piped fallback:', err);
  }

  // Phương án A: Fallback qua Piped Instances
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://piped-api.lunar.icu',
    'https://pipedapi.leptons.xyz',
  ];

  for (const instance of pipedInstances) {
    try {
      const pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const res = await fetch(pipedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data: any = await res.json();
        const items = (data.items || [])
          .filter((item: any) => item.type === 'stream' || !item.type)
          .map((item: any) => ({
            id: (item.url || '').replace('/watch?v=', '') || item.id,
            title: item.title,
            uploaderName: item.uploaderName || item.channel || '',
            uploaderAvatar: item.uploaderAvatar || null,
            duration: item.duration || 0,
            uploadedDate: item.uploadedDate || '',
            views: item.views || 0,
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${(item.url || '').replace('/watch?v=', '')}/mqdefault.jpg`,
          }))
          .filter((item: any) => item.id && item.id.length === 11);

        if (items.length > 0) {
          const resp = new Response(JSON.stringify({ success: true, source: 'piped-api', items }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
              'Access-Control-Allow-Origin': '*',
            },
          });
          if (cache) context.waitUntil(cache.put(cacheKey, resp.clone()));
          return resp;
        }
      }
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ success: false, items: [], error: 'Could not fetch search results' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// InnerTube search implementation
async function searchViaYouTubeInnerTube(query: string) {
  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20231201.00.00',
        hl: 'vi',
        gl: 'VN',
      },
    },
    query,
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const data: any = await res.json();
  const contents =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

  const results: any[] = [];
  for (const c of contents) {
    const vr = c.videoRenderer;
    if (!vr || !vr.videoId) continue;

    const title = vr.title?.runs?.[0]?.text || '';
    const uploaderName = vr.ownerText?.runs?.[0]?.text || '';
    const lengthText = vr.lengthText?.simpleText || '';
    const viewCountText = vr.viewCountText?.simpleText || '';
    const publishedTime = vr.publishedTimeText?.simpleText || '';
    const thumbnails = vr.thumbnail?.thumbnails || [];
    const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`;

    results.push({
      id: vr.videoId,
      title,
      uploaderName,
      duration: parseDuration(lengthText),
      durationText: lengthText,
      viewsText: viewCountText,
      uploadedDate: publishedTime,
      thumbnail,
    });
  }

  return results;
}

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
