// Cloudflare Pages Function: /api/mix
// Generates an endless "Auto-Mix / Radio" playlist tailored to the currently playing song
// using YouTube InnerTube /next (RD{videoId} Radio Mix + Related Music)

const INNERTUBE_WEB_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20250312.04.00',
  hl: 'vi',
  gl: 'VN',
};

const INNERTUBE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const title = url.searchParams.get('title') || '';
  const artist = url.searchParams.get('artist') || '';

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return new Response(JSON.stringify({ success: false, items: [] }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(`${url.origin}/api/mix?id=${encodeURIComponent(id)}&v=1`);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {}
  }

  const seen = new Set<string>([id]);
  const items: any[] = [];

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': INNERTUBE_UA,
      },
      body: JSON.stringify({
        context: { client: INNERTUBE_WEB_CLIENT },
        videoId: id,
        playlistId: `RD${id}`,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data: any = await res.json();

      // 1. Extract from YouTube Radio Mix playlist (RD{id})
      const mixContents =
        data?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents || [];
      for (const entry of mixContents) {
        const r = entry?.playlistPanelVideoRenderer;
        if (!r?.videoId || seen.has(r.videoId)) continue;

        const itemTitle =
          r.title?.runs?.map((x: any) => x.text).join('') || r.title?.simpleText || '';
        if (!itemTitle) continue;

        const uploaderName =
          r.shortBylineText?.runs?.[0]?.text || r.longBylineText?.runs?.[0]?.text || '';
        const durationText = r.lengthText?.simpleText || '';
        const thumbs = r.thumbnail?.thumbnails || [];
        const thumbnail =
          thumbs.length > 0
            ? thumbs[thumbs.length - 1].url
            : `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`;

        seen.add(r.videoId);
        items.push({
          id: r.videoId,
          title: itemTitle,
          uploaderName,
          duration: parseDuration(durationText),
          durationText,
          thumbnail,
        });
      }

      // 2. Also extract from secondary watch-next related items
      const secondary =
        data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results ||
        [];
      for (const entry of secondary) {
        const cv = entry?.compactVideoRenderer;
        if (!cv?.videoId || seen.has(cv.videoId)) continue;

        const itemTitle =
          cv.title?.runs?.map((x: any) => x.text).join('') || cv.title?.simpleText || '';
        if (!itemTitle) continue;

        const uploaderName =
          cv.shortBylineText?.runs?.[0]?.text || cv.longBylineText?.runs?.[0]?.text || '';
        const durationText = cv.lengthText?.simpleText || '';
        const thumbs = cv.thumbnail?.thumbnails || [];
        const thumbnail =
          thumbs.length > 0
            ? thumbs[thumbs.length - 1].url
            : `https://i.ytimg.com/vi/${cv.videoId}/mqdefault.jpg`;

        seen.add(cv.videoId);
        items.push({
          id: cv.videoId,
          title: itemTitle,
          uploaderName,
          duration: parseDuration(durationText),
          durationText,
          thumbnail,
        });
      }
    }
  } catch (err) {
    console.warn('Mix /next fetch failed:', err);
  }

  // Fallback: if RD Mix returned few items (e.g., non-music upload), search similar tracks by artist/title
  if (items.length < 5 && (artist || title)) {
    try {
      const fallbackQuery = artist ? `nhạc ${artist} tuyển chọn hay nhất` : `${title} nhạc tương tự`;
      const searchUrl = new URL('/api/search', request.url);
      searchUrl.searchParams.set('q', fallbackQuery);
      const sRes = await fetch(searchUrl.toString());
      if (sRes.ok) {
        const sData: any = await sRes.json();
        for (const it of sData.items || []) {
          if (it?.id && !seen.has(it.id)) {
            seen.add(it.id);
            items.push(it);
          }
        }
      }
    } catch {}
  }

  const resp = new Response(
    JSON.stringify({
      success: items.length > 0,
      items: items.slice(0, 40),
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': items.length > 0 ? 'public, max-age=600' : 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );

  if (cache && items.length > 0) {
    context.waitUntil(cache.put(cacheKey, resp.clone()));
  }

  return resp;
}
