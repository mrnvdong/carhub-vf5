import { VideoItem, StreamData } from '../types';

const PIPED_FALLBACK_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://piped-api.lunar.icu',
  'https://pipedapi.leptons.xyz',
];

export async function searchVideos(query: string): Promise<VideoItem[]> {
  // 1. Try our Cloudflare Pages API endpoint first
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items;
      }
    }
  } catch (err) {
    console.warn('Backend API search error, trying direct Piped fallback', err);
  }

  // 2. Client-side fallback to public Piped instances directly
  for (const instance of PIPED_FALLBACK_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&filter=videos`, {
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

        if (items.length > 0) return items;
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function getVideoDetails(videoId: string): Promise<StreamData | null> {
  // 1. Try Cloudflare Pages /api/video
  try {
    const res = await fetch(`/api/video?id=${videoId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return data as StreamData;
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
        return {
          title: data.title,
          uploader: data.uploader,
          uploaderAvatar: data.uploaderAvatar,
          thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.duration,
          views: data.views,
          hlsUrl: data.hls,
          videoStreams: (data.videoStreams || [])
            .filter((v: any) => v.url && v.format === 'mp4')
            .map((v: any) => ({
              url: v.url,
              quality: v.quality,
              resolution: v.resolution,
              mimeType: v.mimeType,
              fps: v.fps,
            })),
          audioStreams: (data.audioStreams || [])
            .filter((a: any) => a.url)
            .map((a: any) => ({
              url: a.url,
              quality: a.quality,
              mimeType: a.mimeType,
              bitrate: a.bitrate,
            })),
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
    } catch {
      continue;
    }
  }

  return null;
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
