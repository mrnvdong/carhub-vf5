import {
  MovieDetail,
  MovieItem,
  MovieListResponse,
  MovieListType,
  MovieMetaResponse,
  MovieSource,
  MovieSubtitleTrack,
  MovieWatchHistoryItem,
} from '../types';

export interface MovieTabOption {
  id: MovieListType;
  label: string;
  icon: string;
}

export const KKPHIM_TABS: MovieTabOption[] = [
  { id: 'moi-cap-nhat', label: 'Mới cập nhật', icon: '🔥' },
  { id: 'phim-thuyet-minh', label: 'Thuyết minh', icon: '🎙️' },
  { id: 'phim-long-tieng', label: 'Lồng tiếng', icon: '🗣️' },
  { id: 'phim-le', label: 'Phim lẻ', icon: '🎬' },
  { id: 'phim-bo', label: 'Phim bộ', icon: '📺' },
  { id: 'hoat-hinh', label: 'Hoạt hình', icon: '🎨' },
  { id: 'tv-shows', label: 'TV Shows', icon: '🌟' },
  { id: 'phim-vietsub', label: 'Vietsub', icon: '📝' },
];

export const VSMOV_TABS: MovieTabOption[] = [
  { id: 'moi-cap-nhat', label: 'Mới cập nhật', icon: '🔥' },
  { id: 'phim-chieu-rap', label: 'Chiếu rạp', icon: '🎟️' },
  { id: 'subteam', label: 'Subteam', icon: '⭐' },
  { id: 'phim-le', label: 'Phim lẻ', icon: '🎬' },
  { id: 'phim-bo', label: 'Phim bộ', icon: '📺' },
  { id: 'hoat-hinh', label: 'Hoạt hình', icon: '🎨' },
];

export const COBEPHIM_TABS: MovieTabOption[] = [
  { id: 'moi-cap-nhat', label: 'Hot & Song Ngữ', icon: '🔥' },
  { id: 'phim-le', label: 'Phim lẻ', icon: '🎬' },
  { id: 'phim-bo', label: 'Phim bộ', icon: '📺' },
  { id: 'song-ngu', label: 'Song Ngữ', icon: '🎧' },
  { id: 'trung-quoc', label: 'Trung Quốc mới', icon: '🐉' },
  { id: 'au-my', label: 'Âu Mỹ mới', icon: '🗽' },
  { id: 'dien-anh', label: 'Điện ảnh mới', icon: '🎟️' },
];

export const K20_TABS: MovieTabOption[] = [
  { id: 'moi-cap-nhat', label: 'Phim 4K', icon: '💎' },
  { id: 'phim-xua', label: 'CLB Phim Xưa', icon: '📼' },
  { id: 'phim-le', label: 'Phim lẻ K20', icon: '🎬' },
  { id: 'phim-bo', label: 'Phim bộ K20', icon: '📺' },
];

export function getMovieTabsForSource(source: MovieSource): MovieTabOption[] {
  if (source === 'vsmov') return VSMOV_TABS;
  if (source === 'cobephim') return COBEPHIM_TABS;
  if (source === 'k20') return K20_TABS;
  return KKPHIM_TABS;
}

export function getMovieKey(source: MovieSource | undefined, slug: string): string {
  return `${source || 'kkphim'}:${slug}`;
}

export const MOVIE_YEARS: number[] = Array.from({ length: 18 }, (_, i) => 2026 - i);

const detailCache = new Map<string, { data: MovieDetail; ts: number }>();
const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;
const listCache = new Map<string, { data: MovieListResponse; ts: number }>();
const LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const metaCache = new Map<MovieSource, MovieMetaResponse>();
const META_LS_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchMovieMeta(source: MovieSource = 'kkphim'): Promise<MovieMetaResponse> {
  const hit = metaCache.get(source);
  if (hit) return hit;
  try {
    const raw = localStorage.getItem(`carhub_movie_meta_${source}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.data && Date.now() - Number(parsed.ts || 0) < META_LS_TTL_MS) {
        metaCache.set(source, parsed.data);
        return parsed.data as MovieMetaResponse;
      }
    }
  } catch {}
  const res = await fetch(`/api/movie?action=meta&source=${source}`);
  const data = (await res.json()) as MovieMetaResponse;
  if (!res.ok) {
    throw new Error('Không tải được danh mục thể loại & quốc gia');
  }
  metaCache.set(source, data);
  try {
    localStorage.setItem(`carhub_movie_meta_${source}`, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
  return data;
}

export interface MovieListQuery {
  source?: MovieSource;
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
  const src: MovieSource = q.source || 'kkphim';
  const params = new URLSearchParams();
  params.set('source', src);
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

  const qs = params.toString();
  const cached = listCache.get(qs);
  if (cached && Date.now() - cached.ts < LIST_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`/api/movie?${qs}`);
  const data = (await res.json()) as MovieListResponse;
  if (!res.ok) {
    throw new Error(data.error || `Không tải được phim (HTTP ${res.status})`);
  }
  if (listCache.size >= 40) {
    const oldest = listCache.keys().next().value;
    if (oldest) listCache.delete(oldest);
  }
  listCache.set(qs, { data, ts: Date.now() });
  return data;
}

export async function fetchMovieDetail(
  slug: string,
  source: MovieSource = 'kkphim',
  forceRefresh = false
): Promise<MovieDetail> {
  const cacheKey = getMovieKey(source, slug);
  const cached = detailCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < DETAIL_CACHE_TTL_MS) {
    return cached.data;
  }

  const params = new URLSearchParams({
    action: 'detail',
    source,
    slug,
  });
  const res = await fetch(`/api/movie?${params.toString()}`);
  const data = (await res.json()) as MovieDetail & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Không tải được chi tiết phim (HTTP ${res.status})`);
  }

  if (detailCache.size >= 36) {
    const firstKey = detailCache.keys().next().value;
    if (firstKey) detailCache.delete(firstKey);
  }
  detailCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export function buildCleanM3u8Url(rawM3u8: string): string {
  return `/api/movie?action=clean-m3u8&url=${encodeURIComponent(rawM3u8)}`;
}

export function isVsmovEmbedUrl(url?: string | null): boolean {
  if (!url) return false;
  return /^https:\/\/[a-z0-9-]+\.streamvsmov\.com\/video\/[a-z0-9-]+/i.test(url.trim());
}

export interface VsmovResolvedStream {
  m3u8Url: string;
  subtitles: MovieSubtitleTrack[];
  isSigned: boolean;
}

const vsmovResolveCache = new Map<string, { data: VsmovResolvedStream; ts: number }>();

export async function resolveVsmovStream(embedUrl: string): Promise<VsmovResolvedStream> {
  const cached = vsmovResolveCache.get(embedUrl);
  if (cached) {
    const ttl = cached.data.isSigned ? 50_000 : 4 * 60_000;
    if (Date.now() - cached.ts < ttl) {
      return cached.data;
    }
  }

  const res = await fetch(
    `/api/movie?action=resolve-vsmov&url=${encodeURIComponent(embedUrl)}`
  );
  const data = (await res.json()) as VsmovResolvedStream & { error?: string };
  if (!res.ok || !data.m3u8Url) {
    throw new Error(data.error || `Không tách được luồng phát VSMov (HTTP ${res.status})`);
  }

  if (vsmovResolveCache.size >= 40) {
    const firstKey = vsmovResolveCache.keys().next().value;
    if (firstKey) vsmovResolveCache.delete(firstKey);
  }
  vsmovResolveCache.set(embedUrl, { data, ts: Date.now() });
  return data;
}

export function isCobephimEpRef(url?: string | null): boolean {
  return Boolean(url && url.startsWith('cobephim-ep://'));
}

export function isK20StreamRef(url?: string | null): boolean {
  return Boolean(url && url.startsWith('k20-ep://'));
}

export function isDirectMp4Url(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|m4v|webm)(\?|$)/i.test(url) || /\/hx-mp4\b/i.test(url);
}

export interface CobephimResolvedEpisode {
  linkM3u8: string;
  linkEmbed: string;
  isEncrypted4k?: boolean;
  server?: string;
}

const cobephimEpCache = new Map<string, { data: CobephimResolvedEpisode; ts: number }>();

export async function resolveCobephimEpisode(refUrl: string): Promise<CobephimResolvedEpisode> {
  const cached = cobephimEpCache.get(refUrl);
  if (cached && Date.now() - cached.ts < 3 * 60_000) {
    return cached.data;
  }
  const clean = refUrl.replace(/^cobephim-ep:\/\//, '');
  const [slug, epId] = clean.split('/');
  const res = await fetch(
    `/api/movie?action=resolve-cobephim&slug=${encodeURIComponent(slug || '')}&epId=${encodeURIComponent(epId || '')}`
  );
  const data = (await res.json()) as CobephimResolvedEpisode & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Không tải được tập phim CoBePhim (HTTP ${res.status})`);
  }
  if (cobephimEpCache.size >= 40) {
    const firstKey = cobephimEpCache.keys().next().value;
    if (firstKey) cobephimEpCache.delete(firstKey);
  }
  cobephimEpCache.set(refUrl, { data, ts: Date.now() });
  return data;
}

export interface K20ResolvedOption {
  label: string;
  url: string;
  isMp4: boolean;
  subtitles: MovieSubtitleTrack[];
}

export interface K20ResolvedResponse {
  streams: K20ResolvedOption[];
}

const k20StreamCache = new Map<string, { data: K20ResolvedResponse; ts: number }>();

export async function resolveK20Stream(refUrl: string): Promise<K20ResolvedResponse> {
  const cached = k20StreamCache.get(refUrl);
  if (cached && Date.now() - cached.ts < 3 * 60_000) {
    return cached.data;
  }
  const clean = refUrl.replace(/^k20-ep:\/\//, '');
  const slashIdx = clean.indexOf('/');
  const mediaType = slashIdx > 0 ? clean.slice(0, slashIdx) : 'movie';
  const id = slashIdx > 0 ? clean.slice(slashIdx + 1) : clean;

  const res = await fetch(
    `/api/movie?action=resolve-k20&type=${encodeURIComponent(mediaType)}&id=${encodeURIComponent(id)}`
  );
  const data = (await res.json()) as K20ResolvedResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Không tải được luồng K20 (HTTP ${res.status})`);
  }
  if (k20StreamCache.size >= 40) {
    const firstKey = k20StreamCache.keys().next().value;
    if (firstKey) k20StreamCache.delete(firstKey);
  }
  k20StreamCache.set(refUrl, { data, ts: Date.now() });
  return data;
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
  const targetKey = getMovieKey(entry.source, entry.slug);
  const prev = loadMovieHistory().filter((x) => getMovieKey(x.source, x.slug) !== targetKey);
  const next = [{ ...entry, source: entry.source || 'kkphim' }, ...prev].slice(0, 40);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function removeMovieHistoryItem(
  slug: string,
  source: MovieSource = 'kkphim'
): MovieWatchHistoryItem[] {
  const targetKey = getMovieKey(source, slug);
  const next = loadMovieHistory().filter((x) => getMovieKey(x.source, x.slug) !== targetKey);
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
  const targetKey = getMovieKey(movie.source, movie.slug);
  const exists = prev.some((x) => getMovieKey(x.source, x.slug) === targetKey);
  const list = exists
    ? prev.filter((x) => getMovieKey(x.source, x.slug) !== targetKey)
    : [{ ...movie, source: movie.source || 'kkphim' }, ...prev].slice(0, 80);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  return { list, isFav: !exists };
}

export function replaceMovieHistoryStorage(list: MovieWatchHistoryItem[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {}
}

export function replaceMovieFavoritesStorage(list: MovieItem[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(list.slice(0, 80)));
  } catch {}
}
