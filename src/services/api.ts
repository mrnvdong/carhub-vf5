import { VideoItem } from '../types';

const PIPED_FALLBACK_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
];

export interface SearchResult {
  items: VideoItem[];
  nextContinuation: string | null;
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

// Kết hợp AbortSignal bên ngoài + timeout tương thích 100% iOS Safari 16/17 WKWebView
function createTimedSignal(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    },
  };
}

export async function searchVideos(
  query: string,
  continuation?: string | null,
  externalSignal?: AbortSignal
): Promise<SearchResult> {
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
            items: dedupeVideos(data.items),
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
 * Lấy danh sách Đài phát thông minh (Auto-Mix / Radio) tương tự bài đang nghe
 */
export async function fetchRadioMix(
  videoId: string,
  title: string,
  artist: string
): Promise<VideoItem[]> {
  try {
    const res = await fetch(
      `/api/mix?id=${encodeURIComponent(videoId)}&title=${encodeURIComponent(
        title
      )}&artist=${encodeURIComponent(artist)}`,
      { signal: AbortSignal.timeout(6500) }
    );
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        return dedupeVideos(data.items);
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
  const searchRes = await searchVideos(fallbackQuery);
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
