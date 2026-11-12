import { VideoItem, StreamData, PlaybackType } from '../types';

const PIPED_FALLBACK_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
];

export interface SearchResult {
  items: VideoItem[];
  nextContinuation: string | null;
}

export async function searchVideos(query: string, continuation?: string | null): Promise<SearchResult> {
  // 1. Try our Cloudflare Pages API endpoint first
  try {
    let url = `/api/search?q=${encodeURIComponent(query)}`;
    if (continuation) {
      url += `&continuation=${encodeURIComponent(continuation)}`;
    }

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return {
          items: data.items,
          nextContinuation: data.nextContinuation || null,
        };
      }
    }
  } catch (err) {
    console.warn('Backend API search error, trying direct Piped fallback', err);
  }

  // 2. Client-side fallback to public Piped instances directly
  for (const instance of PIPED_FALLBACK_INSTANCES) {
    try {
      let pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      if (continuation) {
        pipedUrl = `${instance}/nextpage/search?nextpage=${encodeURIComponent(continuation)}&q=${encodeURIComponent(query)}&filter=videos`;
      }

      const res = await fetch(pipedUrl, {
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        const items: VideoItem[] = (data.items || [])
          .filter((item: any) => item.type === 'stream' || !item.type)
          .map((item: any) => ({
            id: (item.url || '').replace('/watch?v=', '') || item.id,
            title: item.title,
            uploaderName: item.uploaderName || '',
            thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${(item.url || '').replace('/watch?v=', '')}/mqdefault.jpg`,
            duration: item.duration,
            durationText: formatSeconds(item.duration),
            viewsText: item.views ? `${item.views.toLocaleString()} lượt xem` : '',
            uploadedDate: item.uploadedDate || '',
          }))
          .filter((v: VideoItem) => v.id && v.id.length === 11);

        if (items.length > 0) {
          return {
            items,
            nextContinuation: data.nextpage || null,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return { items: [], nextContinuation: null };
}

export async function getVideoDetails(videoId: string): Promise<StreamData | null> {
  // 1. Try Cloudflare Pages /api/video
  try {
    const res = await fetch(`/api/video?id=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.playbackType && data.playbackType !== 'unplayable') {
        return {
          id: videoId,
          title: data.title || '',
          uploader: data.uploader || '',
          uploaderAvatar: data.uploaderAvatar || null,
          thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.duration || 0,
          views: data.views || 0,
          playbackType: data.playbackType as PlaybackType,
          source: data.source || 'unknown',
          hlsUrl: data.hlsUrl || null,
          embedUrl: data.embedUrl || null,
          videoStreams: data.videoStreams || [],
          audioStreams: data.audioStreams || [],
          relatedStreams: data.relatedStreams || [],
          sponsorSegments: data.sponsorSegments || [],
        };
      }
    }
  } catch (err) {
    console.warn('Backend API video error, trying direct Piped fallback', err);
  }

  // 2. Client-side fallback to public Piped instances directly
  for (const instance of PIPED_FALLBACK_INSTANCES) {
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, {
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const data = await res.json();
        const videoStreams = (data.videoStreams || [])
          .filter((v: any) => v.url && v.format === 'mp4')
          .map((v: any) => ({
            url: v.url,
            quality: v.quality,
            resolution: v.resolution,
            mimeType: v.mimeType,
            fps: v.fps,
          }));

        const audioStreams = (data.audioStreams || [])
          .filter((a: any) => a.url)
          .map((a: any) => ({
            url: a.url,
            quality: a.quality,
            mimeType: a.mimeType,
            bitrate: a.bitrate,
          }));

        const hlsUrl = data.hls || null;
        let playbackType: PlaybackType = 'unplayable';
        if (videoStreams.length > 0 || audioStreams.length > 0) {
          playbackType = 'direct';
        } else if (hlsUrl) {
          playbackType = 'hls';
        }

        if (playbackType !== 'unplayable') {
          return {
            id: videoId,
            title: data.title,
            uploader: data.uploader,
            uploaderAvatar: data.uploaderAvatar,
            thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: data.duration,
            views: data.views,
            playbackType,
            source: 'piped-client-fallback',
            hlsUrl,
            embedUrl: null,
            videoStreams,
            audioStreams,
            relatedStreams: (data.relatedStreams || []).slice(0, 15).map((r: any) => ({
              id: (r.url || '').replace('/watch?v=', '') || r.id,
              title: r.title,
              uploaderName: r.uploaderName,
              thumbnail: r.thumbnail,
              duration: r.duration,
            })),
            sponsorSegments: [],
          };
        }
      }
    } catch {
      continue;
    }
  }

  // 3. Last resort fallback to embed
  return {
    id: videoId,
    title: 'Phát qua YouTube Embed (Dự phòng)',
    uploader: 'YouTube',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: 0,
    playbackType: 'embed',
    source: 'embed-client-fallback',
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    videoStreams: [],
    audioStreams: [],
    sponsorSegments: [],
  };
}

export function formatSeconds(secs?: number): string {
  if (!secs || isNaN(secs)) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
