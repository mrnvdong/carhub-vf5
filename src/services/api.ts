import { MusicSource, VideoItem } from '../types';
import { createTimedSignal, fetchWithTimeout } from '../utils/timedFetch';

const PIPED_FALLBACK_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
];

export interface SearchResult {
  items: VideoItem[];
  nextContinuation: string | null;
}

export interface SoundCloudStreamInfo {
  streamUrl: string;
  protocol: 'progressive' | 'hls';
  mimeType: string;
  duration: number;
}

function dedupeVideos(items: VideoItem[]): VideoItem[] {
  const seen = new Set<string>();
  const out: VideoItem[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// (createTimedSignal imported from ../utils/timedFetch)

export async function searchSoundCloud(
  query: string,
  continuation?: string | null,
  externalSignal?: AbortSignal
): Promise<SearchResult> {
  if (externalSignal?.aborted) {
    return { items: [], nextContinuation: null };
  }

  let offset = 0;
  if (continuation && continuation.startsWith('sc_offset:')) {
    offset = parseInt(continuation.replace('sc_offset:', ''), 10) || 0;
  }

  const { signal, cleanup } = createTimedSignal(7000, externalSignal);
  try {
    const url = `/api/soundcloud?action=search&q=${encodeURIComponent(query)}&offset=${offset}`;
    const res = await fetch(url, { signal });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.items) && (data.items.length > 0 || data.nextContinuation)) {
        return {
          items: dedupeVideos(data.items),
          nextContinuation: data.nextContinuation || null,
        };
      }
    }
  } catch (err) {
    if (!externalSignal?.aborted) {
      console.warn('SoundCloud search error:', err);
    }
  } finally {
    cleanup();
  }

  return { items: [], nextContinuation: null };
}

export async function resolveSoundCloudStream(
  trackId: string,
  externalSignal?: AbortSignal
): Promise<SoundCloudStreamInfo | null> {
  if (externalSignal?.aborted) return null;
  const { signal, cleanup } = createTimedSignal(7500, externalSignal);
  try {
    const res = await fetch(
      `/api/soundcloud?action=stream&id=${encodeURIComponent(trackId)}`,
      { signal, cache: 'no-store' }
    );
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data?.success && data?.streamUrl) {
        return {
          streamUrl: data.streamUrl,
          protocol: data.protocol === 'progressive' ? 'progressive' : 'hls',
          mimeType: data.mimeType || '',
          duration: Number(data.duration || 0),
        };
      }
    }
  } catch {
    // Handled by caller
  } finally {
    cleanup();
  }
  return null;
}

export async function searchVideos(
  query: string,
  continuation?: string | null,
  externalSignal?: AbortSignal,
  source: MusicSource = 'youtube'
): Promise<SearchResult> {
  if (source === 'soundcloud') {
    return searchSoundCloud(query, continuation, externalSignal);
  }

  if (externalSignal?.aborted) {
    return { items: [], nextContinuation: null };
  }

  // 1. Primary: Cloudflare Pages Edge API (/api/search -> YouTube InnerTube)
  {
    const { signal, cleanup } = createTimedSignal(6500, externalSignal);
    try {
      let url = `/api/search?q=${encodeURIComponent(query)}`;
      if (continuation) {
        url += `&continuation=${encodeURIComponent(continuation)}`;
      }

      const res = await fetch(url, { signal });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return {
            items: dedupeVideos(
              data.items.map((it: any) => ({ ...it, source: 'youtube' as const }))
            ),
            nextContinuation: data.nextContinuation || null,
          };
        }
      }
    } catch (err) {
      if (externalSignal?.aborted) {
        return { items: [], nextContinuation: null };
      }
      console.warn('Backend API search error, trying direct Piped fallback', err);
    } finally {
      cleanup();
    }
  }

  // 2. Client-side fallback to public Piped instances (also powers local `vite dev`)
  for (const instance of PIPED_FALLBACK_INSTANCES) {
    if (externalSignal?.aborted) break;
    const { signal, cleanup } = createTimedSignal(2600, externalSignal);
    try {
      let pipedUrl = `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`;
      if (continuation) {
        pipedUrl = `${instance}/nextpage/search?nextpage=${encodeURIComponent(
          continuation
        )}&q=${encodeURIComponent(query)}&filter=videos`;
      }

      const res = await fetch(pipedUrl, { signal });
      if (res.ok) {
        const data = await res.json();
        const items: VideoItem[] = (data.items || [])
          .filter((item: any) => item.type === 'stream' || !item.type)
          .map((item: any) => {
            const id = (item.url || '').replace('/watch?v=', '') || item.id || '';
            return {
              id,
              source: 'youtube' as const,
              title: item.title || '',
              uploaderName: item.uploaderName || '',
              thumbnail:
                item.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
              duration: item.duration,
              durationText:
                item.duration && item.duration > 0
                  ? formatSeconds(item.duration)
                  : item.isShort
                  ? 'Short'
                  : '',
              viewsText: item.views ? `${item.views.toLocaleString('vi-VN')} lượt xem` : '',
              uploadedDate: item.uploadedDate || '',
            };
          })
          .filter((v: VideoItem) => v.id && /^[a-zA-Z0-9_-]{11}$/.test(v.id));

        if (items.length > 0) {
          return {
            items: dedupeVideos(items),
            nextContinuation: data.nextpage || null,
          };
        }
      }
    } catch {
      continue;
    } finally {
      cleanup();
    }
  }

  return { items: [], nextContinuation: null };
}

/**
 * Lấy danh sách Đài phát thông minh (Auto-Mix / Radio) cho cả YouTube & SoundCloud
 */
export async function fetchRadioMix(
  videoId: string,
  title: string,
  artist: string,
  source?: MusicSource
): Promise<VideoItem[]> {
  const isSc = source === 'soundcloud' || videoId.startsWith('sc_');

  if (isSc) {
    try {
      const res = await fetchWithTimeout(
        `/api/soundcloud?action=related&id=${encodeURIComponent(videoId)}`,
        {},
        6500
      );
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return dedupeVideos(data.items);
        }
      }
    } catch {}

    const fallback = await searchSoundCloud(artist || title.slice(0, 35));
    return fallback.items.filter((v) => v.id !== videoId);
  }

  try {
    const res = await fetchWithTimeout(
      `/api/mix?id=${encodeURIComponent(videoId)}&title=${encodeURIComponent(
        title
      )}&artist=${encodeURIComponent(artist)}`,
      {},
      6500
    );
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        return dedupeVideos(
          data.items.map((it: any) => ({ ...it, source: 'youtube' as const }))
        );
      }
    }
  } catch {
    // Fallback below
  }

  // Fallback: Tìm các bài cùng ca sĩ / cùng phong cách
  const cleanArtist = artist.replace(/official|channel|music|vevo/gi, '').trim();
  const fallbackQuery = cleanArtist
    ? `nhạc ${cleanArtist} hay nhất tuyển chọn`
    : `${title.slice(0, 40)} mix`;
  const searchRes = await searchVideos(fallbackQuery, null, undefined, 'youtube');
  return searchRes.items.filter((v) => v.id !== videoId);
}

export function formatSeconds(secs?: number): string {
  if (secs === undefined || secs === null || isNaN(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
