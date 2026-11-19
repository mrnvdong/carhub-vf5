import {
  MovieDetail,
  MovieItem,
  MovieListResponse,
  MovieListType,
  MovieMetaResponse,
  MovieWatchHistoryItem,
} from '../types';

export interface MovieTabOption {
  id: MovieListType;
  label: string;
  icon: string;
}

export const MOVIE_TABS: MovieTabOption[] = [
  { id: 'moi-cap-nhat', label: 'Mới cập nhật', icon: '🔥' },
  { id: 'phim-thuyet-minh', label: 'Thuyết minh', icon: '🎙️' },
  { id: 'phim-long-tieng', label: 'Lồng tiếng', icon: '🗣️' },
  { id: 'phim-le', label: 'Phim lẻ', icon: '🎬' },
  { id: 'phim-bo', label: 'Phim bộ', icon: '📺' },
  { id: 'hoat-hinh', label: 'Hoạt hình', icon: '🎨' },
  { id: 'tv-shows', label: 'TV Shows', icon: '🌟' },
  { id: 'phim-vietsub', label: 'Vietsub', icon: '📝' },
];

export const MOVIE_YEARS: number[] = Array.from({ length: 18 }, (_, i) => 2026 - i);

const detailCache = new Map<string, { data: MovieDetail; ts: number }>();
const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;
let metaCache: MovieMetaResponse | null = null;

export async function fetchMovieMeta(): Promise<MovieMetaResponse> {
  if (metaCache) return metaCache;
  const res = await fetch('/api/movie?action=meta');
  const data = (await res.json()) as MovieMetaResponse;
  if (!res.ok) {
    throw new Error('Không tải được danh mục thể loại & quốc gia');
  }
  metaCache = data;
  return data;
}

export interface MovieListQuery {
  type: MovieListType;
  page?: number;
  limit?: number;
  category?: string;
  country?: string;
  year?: string;
  sortLang?: string;
  sortField?: string;
  keyword?: string;
}

export async function fetchMovieList(q: MovieListQuery): Promise<MovieListResponse> {
  const params = new URLSearchParams();
  if (q.keyword && q.keyword.trim()) {
    params.set('action', 'search');
    params.set('keyword', q.keyword.trim());
  } else {
    params.set('action', 'list');
    params.set('type', q.type || 'moi-cap-nhat');
  }

  if (q.page && q.page > 1) params.set('page', String(q.page));
  if (q.limit) params.set('limit', String(q.limit));
  if (q.category) params.set('category', q.category);
  if (q.country) params.set('country', q.country);
  if (q.year) params.set('year', q.year);
  if (q.sortLang) params.set('sort_lang', q.sortLang);
  if (q.sortField) params.set('sort_field', q.sortField);

  const res = await fetch(`/api/movie?${params.toString()}`);
  const data = (await res.json()) as MovieListResponse;
  if (!res.ok) {
    throw new Error(data.error || `Không tải được phim (HTTP ${res.status})`);
  }
  return data;
}

export async function fetchMovieDetail(slug: string, forceRefresh = false): Promise<MovieDetail> {
  const cached = detailCache.get(slug);
  if (!forceRefresh && cached && Date.now() - cached.ts < DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }

  const params = new URLSearchParams({
    action: 'detail',
    slug,
  });
  const res = await fetch(`/api/movie?${params.toString()}`);
  const data = (await res.json()) as MovieDetail & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Không tải được chi tiết phim (HTTP ${res.status})`);
  }

  if (detailCache.size >= 30) {
    const firstKey = detailCache.keys().next().value;
    if (firstKey) detailCache.delete(firstKey);
  }
  detailCache.set(slug, { data, ts: Date.now() });
  return data;
}

export function buildCleanM3u8Url(rawM3u8: string): string {
  return `/api/movie?action=clean-m3u8&url=${encodeURIComponent(rawM3u8)}`;
}

function resolveUrlSafe(baseUrl: string, rel: string): string {
  try {
    return new URL(rel, baseUrl).toString();
  } catch {
    return rel;
  }
}

function cleanVariantPlaylistClient(
  rawM3u8: string,
  variantUrl: string
): { text: string; strippedCount: number } {
  const lines = rawM3u8.split(/\r?\n/);

  const segmentUrls: string[] = [];
  let adCandidateCount = 0;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    segmentUrls.push(l);
    if (/(?:^|\/)convertv\d+\//i.test(l) || /\/ads?\//i.test(l)) {
      adCandidateCount += 1;
    }
  }

  // Chỉ cắt khi đoạn quảng cáo chiếm < 18% tổng số phân đoạn (đảm bảo tuyệt đối không cắt nhầm phim)
  const shouldStripAds =
    segmentUrls.length >= 15 &&
    adCandidateCount > 0 &&
    adCandidateCount / segmentUrls.length < 0.18;

  const out: string[] = [];
  let pendingMeta: string[] = [];
  let strippedCount = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-KEY:')) {
        const rewritten = line.replace(/URI="([^"]+)"/i, (_, u) => {
          return `URI="${resolveUrlSafe(variantUrl, u)}"`;
        });
        pendingMeta.push(rewritten);
      } else if (
        line.startsWith('#EXTINF:') ||
        line.startsWith('#EXT-X-DISCONTINUITY') ||
        line.startsWith('#EXT-X-BYTERANGE:') ||
        line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')
      ) {
        pendingMeta.push(line);
      } else {
        if (pendingMeta.length > 0 && line === '#EXT-X-ENDLIST') {
          pendingMeta = [];
        }
        out.push(line);
      }
      continue;
    }

    const isAdSeg =
      shouldStripAds && (/(?:^|\/)convertv\d+\//i.test(line) || /\/ads?\//i.test(line));
    if (isAdSeg) {
      strippedCount += 1;
      pendingMeta = [];
      continue;
    }

    for (const meta of pendingMeta) {
      if (shouldStripAds && meta === '#EXT-X-DISCONTINUITY') continue;
      out.push(meta);
    }
    pendingMeta = [];
    out.push(resolveUrlSafe(variantUrl, line));
  }

  return { text: out.join('\n') + '\n', strippedCount };
}

// Lọc quảng cáo M3U8 trực tiếp từ trình duyệt người dùng (không đi qua IP datacenter nên không bao giờ bị CDN chặn 404!)
export async function fetchAndCleanMovieM3u8(
  rawM3u8Url: string
): Promise<{ blobUrl: string; strippedCount: number }> {
  const fetchText = async (u: string) => {
    const res = await fetch(u, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { text: await res.text(), finalUrl: res.url || u };
  };

  const first = await fetchText(rawM3u8Url);
  let targetText = first.text;
  let targetUrl = first.finalUrl;

  if (first.text.includes('#EXT-X-STREAM-INF')) {
    const lines = first.text.split(/\r?\n/);
    let bestUrl = '';
    let bestBw = -1;
    let pendingBw = 0;

    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('#EXT-X-STREAM-INF')) {
        const m = l.match(/BANDWIDTH=(\d+)/i);
        pendingBw = m ? parseInt(m[1], 10) : 0;
      } else if (!l.startsWith('#')) {
        const abs = resolveUrlSafe(first.finalUrl, l);
        if (!bestUrl || pendingBw >= bestBw) {
          bestBw = pendingBw;
          bestUrl = abs;
        }
        pendingBw = 0;
      }
    }

    if (bestUrl) {
      const variant = await fetchText(bestUrl);
      targetText = variant.text;
      targetUrl = variant.finalUrl;
    }
  }

  const cleaned = cleanVariantPlaylistClient(targetText, targetUrl);
  const blob = new Blob([cleaned.text], { type: 'application/vnd.apple.mpegurl' });
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, strippedCount: cleaned.strippedCount };
}

const HISTORY_KEY = 'carhub_movie_history_v1';
const FAVORITES_KEY = 'carhub_movie_favorites_v1';

export function loadMovieHistory(): MovieWatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
  } catch {
    return [];
  }
}

export function saveMovieHistoryItem(entry: MovieWatchHistoryItem): MovieWatchHistoryItem[] {
  const prev = loadMovieHistory().filter((x) => x.slug !== entry.slug);
  const next = [entry, ...prev].slice(0, 40);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function removeMovieHistoryItem(slug: string): MovieWatchHistoryItem[] {
  const next = loadMovieHistory().filter((x) => x.slug !== slug);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadMovieFavorites(): MovieItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 80) : [];
  } catch {
    return [];
  }
}

export function toggleMovieFavoriteStorage(movie: MovieItem): {
  list: MovieItem[];
  isFav: boolean;
} {
  const prev = loadMovieFavorites();
  const exists = prev.some((x) => x.slug === movie.slug);
  const list = exists
    ? prev.filter((x) => x.slug !== movie.slug)
    : [movie, ...prev].slice(0, 80);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return { list, isFav: !exists };
}
