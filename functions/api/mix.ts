// Cloudflare Pages Function: /api/mix
// Generates an endless "Auto-Mix / Radio" playlist tailored to the currently playing song
// using YouTube InnerTube /next (RD{videoId} Radio Mix + Related Music)
import {
  INNERTUBE_WEB_CLIENT,
  INNERTUBE_UA,
  parseDuration,
  searchViaYouTubeInnerTube,
} from '../_lib/youtubeSearch';
import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const CORS_HEADERS = buildTrustedJsonHeaders(request);
  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ success: false, items: [] }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const title = (url.searchParams.get('title') || '').slice(0, 160);
  const artist = (url.searchParams.get('artist') || '').slice(0, 100);

  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return new Response(JSON.stringify({ success: false, items: [] }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(`https://carhub-mix.internal/v2?id=${encodeURIComponent(id)}`);
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: cached.status,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=600' },
        });
      }
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

  // Fallback: if RD Mix returned few items (e.g., non-music upload), call shared InnerTube search directly (no HTTP self-fetch)
  if (items.length < 5 && (artist || title)) {
    try {
      const fallbackQuery = artist ? `nhạc ${artist} tuyển chọn hay nhất` : `${title} nhạc tương tự`;
      const sData = await searchViaYouTubeInnerTube(fallbackQuery, null, false);
      for (const it of sData?.items || []) {
        if (it?.id && !seen.has(it.id)) {
          seen.add(it.id);
          items.push(it);
        }
      }
    } catch {}
  }

  const serialized = JSON.stringify({
    success: items.length > 0,
    items: items.slice(0, 40),
  });
  const resp = new Response(serialized, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': items.length > 0 ? 'public, max-age=600' : 'no-store',
    },
  });

  if (cache && items.length > 0) {
    context.waitUntil(
      cache.put(
        cacheKey,
        new Response(serialized, {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
        })
      )
    );
  }

  return resp;
}
