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

export async function getVideoDetails(videoId: string, noCache = false): Promise<StreamData> {
  // 1. Try Cloudflare Pages /api/video
  try {
    const apiUrl = `/api/video?id=${encodeURIComponent(videoId)}${noCache ? '&nocache=1' : ''}`;
    const res = await fetch(apiUrl, {
      cache: noCache ? 'no-store' : 'default',
    });

    const data = await res.json().catch(() => null);

    if (data) {
      if (data.playbackType === 'unplayable' || (!res.ok && res.status === 422)) {
        return {
          id: videoId,
          title: data.title || '',
          uploader: data.uploader || '',
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          playbackType: 'unplayable',
          source: 'edge-api',
          error: data.error || 'Video không tồn tại hoặc không thể phát.',
          videoStreams: [],
          audioStreams: [],
          sponsorSegments: [],
        };
      }

      const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
      const audioStreams = Array.isArray(data.audioStreams) ? data.audioStreams : [];
      const hlsUrl = data.hlsUrl || null;
      const embedUrl = data.embedUrl || null;

      // Strictly verify usable streams before accepting playbackType
      let validatedType: PlaybackType = 'unplayable';
      if (data.playbackType === 'direct' && (videoStreams.length > 0 || audioStreams.length > 0)) {
        validatedType = 'direct';
      } else if (data.playbackType === 'hls' && hlsUrl) {
        validatedType = 'hls';
      } else if (videoStreams.length > 0 || audioStreams.length > 0) {
        validatedType = 'direct';
      } else if (hlsUrl) {
        validatedType = 'hls';
      } else if (data.playbackType === 'embed' && embedUrl) {
        validatedType = 'embed';
      }

      if (data.success && validatedType !== 'unplayable') {
        return {
          id: videoId,
          title: data.title || '',
          uploader: data.uploader || '',
          uploaderAvatar: data.uploaderAvatar || null,
          thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: data.duration || 0,
          views: data.views || 0,
          playbackType: validatedType,
          source: data.source || 'edge-api',
          hlsUrl,
          embedUrl,
          videoStreams,
          audioStreams,
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
        // Only keep muxed videoStreams (videoOnly !== true) so video has sound!
        const videoStreams = (data.videoStreams || [])
          .filter(
            (v: any) =>
              v.url &&
              v.videoOnly !== true &&
              (v.format === 'MPEG_4' ||
                v.format === 'MP4' ||
                v.format === 'mp4' ||
                v.mimeType?.includes('video/mp4'))
          )
          .map((v: any) => ({
            url: v.url,
            quality: v.quality || '360p',
            resolution: v.resolution || '640x360',
            mimeType: v.mimeType || 'video/mp4',
            fps: v.fps || 30,
          }));

        const audioStreams = (data.audioStreams || [])
          .filter((a: any) => a.url)
          .sort((a: any, b: any) => {
            const aMp4 = (a.mimeType || '').includes('mp4') ? 0 : 1;
            const bMp4 = (b.mimeType || '').includes('mp4') ? 0 : 1;
            return aMp4 - bMp4;
          })
          .map((a: any) => ({
            url: a.url,
            quality: a.quality || '128kbps',
            mimeType: a.mimeType || 'audio/mp4',
            bitrate: a.bitrate || 128000,
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
            title: data.title || '',
            uploader: data.uploader || '',
            uploaderAvatar: data.uploaderAvatar,
            thumbnailUrl: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            duration: data.duration || 0,
            views: data.views || 0,
            playbackType,
            source: 'piped-client-fallback',
            hlsUrl,
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
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

  // 3. If all extractors failed, return unplayable so UI displays clear error & options
  return {
    id: videoId,
    title: '',
    uploader: '',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: 0,
    playbackType: 'unplayable',
    source: 'none',
    error: 'Không thể lấy luồng phát cho video này (có thể bị giới hạn vùng hoặc bản quyền).',
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
