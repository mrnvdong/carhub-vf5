// Shared YouTube InnerTube search helper used by /api/search and /api/mix
// Avoids internal HTTP self-fetches inside Cloudflare Pages Functions.

export const INNERTUBE_WEB_CLIENT = {
  clientName: 'WEB',
  clientVersion: '2.20250312.04.00',
  hl: 'vi',
  gl: 'VN',
};

export const INNERTUBE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function parseDuration(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some((n) => isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function formatDuration(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function extractVideoRenderer(vr: any) {
  if (!vr || !vr.videoId || vr.upcomingEventData) return null;

  const title =
    vr.title?.runs?.map((r: any) => r.text).join('') || vr.title?.simpleText || '';
  if (!title) return null;

  const uploaderName =
    vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || '';
  const lengthText = vr.lengthText?.simpleText || '';
  const isLive =
    !lengthText &&
    Array.isArray(vr.badges) &&
    vr.badges.some((b: any) =>
      String(b?.metadataBadgeRenderer?.style || '').includes('LIVE')
    );

  const viewCountText =
    vr.viewCountText?.simpleText ||
    vr.viewCountText?.runs?.map((r: any) => r.text).join('') ||
    '';
  const publishedTime = vr.publishedTimeText?.simpleText || '';
  const thumbnails = vr.thumbnail?.thumbnails || [];
  const thumbnail =
    thumbnails.length > 0
      ? thumbnails[thumbnails.length - 1].url
      : `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`;

  return {
    id: vr.videoId,
    title,
    uploaderName,
    duration: parseDuration(lengthText),
    durationText: lengthText || (isLive ? 'LIVE' : ''),
    viewsText: viewCountText,
    uploadedDate: publishedTime,
    thumbnail,
  };
}

export async function searchViaYouTubeInnerTube(
  query: string,
  continuationToken: string | null = null,
  prefetchSecondPage = true
) {
  const payload = continuationToken
    ? { context: { client: INNERTUBE_WEB_CLIENT }, continuation: continuationToken }
    : { context: { client: INNERTUBE_WEB_CLIENT }, query };

  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_UA,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) return null;
  const data: any = await res.json();

  const contents: any[] = [];
  let nextContinuation: string | null = null;

  if (continuationToken) {
    const actions = data.onResponseReceivedCommands || [];
    const continuationItems = actions[0]?.appendContinuationItemsAction?.continuationItems || [];
    for (const cItem of continuationItems) {
      if (cItem.itemSectionRenderer?.contents) {
        contents.push(...cItem.itemSectionRenderer.contents);
      } else if (cItem.videoRenderer) {
        contents.push(cItem);
      } else if (cItem.continuationItemRenderer) {
        nextContinuation =
          cItem.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
      }
    }
  } else {
    const sectionList =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    for (const section of sectionList) {
      if (section.itemSectionRenderer?.contents) {
        contents.push(...section.itemSectionRenderer.contents);
      } else if (section.continuationItemRenderer) {
        nextContinuation =
          section.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
      }
    }
  }

  const seenIds = new Set<string>();
  const results: any[] = [];

  for (const c of contents) {
    const parsed = extractVideoRenderer(c.videoRenderer);
    if (parsed && !seenIds.has(parsed.id)) {
      seenIds.add(parsed.id);
      results.push(parsed);
    }
  }

  if (prefetchSecondPage && !continuationToken && nextContinuation && results.length < 30) {
    try {
      const res2 = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': INNERTUBE_UA,
        },
        body: JSON.stringify({
          context: { client: INNERTUBE_WEB_CLIENT },
          continuation: nextContinuation,
        }),
        signal: AbortSignal.timeout(4000),
      });

      if (res2.ok) {
        const data2: any = await res2.json();
        const actions2 = data2.onResponseReceivedCommands || [];
        const continuationItems2 =
          actions2[0]?.appendContinuationItemsAction?.continuationItems || [];

        nextContinuation = null;
        for (const cItem of continuationItems2) {
          if (cItem.itemSectionRenderer?.contents) {
            for (const c of cItem.itemSectionRenderer.contents) {
              const parsed = extractVideoRenderer(c.videoRenderer);
              if (parsed && !seenIds.has(parsed.id)) {
                seenIds.add(parsed.id);
                results.push(parsed);
              }
            }
          } else if (cItem.continuationItemRenderer) {
            nextContinuation =
              cItem.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token ||
              null;
          }
        }
      }
    } catch {
      // Keep page 1 results if page 2 times out
    }
  }

  return {
    items: results,
    nextContinuation,
  };
}
