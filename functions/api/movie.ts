// Cloudflare Pages Function: /api/movie
// Engine Phim Rạp ĐA NGUỒN:
// 1) KKPhim (https://phimapi.com — tài liệu https://kkphim.com/api-document) — 30.600+ phim, 1080p HLS
// 2) VSMov  (https://vsmov.com/api — tài liệu https://vsmov.com/api-document) — 38.500+ phim, Chiếu rạp & Subteam
// 3) VidSrc (https://vidsrc.mov/embed — danh mục IMDb/Cinemeta quốc tế) — Phim lẻ & Series TV 1080p đa phụ đề
// - GET action=meta&source=kkphim|vsmov|vidsrc : Thể loại + Quốc gia, cache 24h
// - GET action=list&source=...                 : Danh sách & bộ lọc Thể loại / Quốc gia / Năm / Âm thanh
// - GET action=search&source=...               : Tìm kiếm phim (VidSrc hỗ trợ cả tìm tên & IMDb/TMDB ID trực tiếp!)
// - GET action=detail&source=...&slug=...      : Chi tiết phim + Server/Mùa + Tập phim + link_m3u8 & link_embed
// - GET action=clean-m3u8                      : Lọc quảng cáo chèn trong HLS manifest

type MovieSource = 'kkphim' | 'vsmov' | 'vidsrc';

const PHIMAPI_BASE = 'https://phimapi.com';
const CDN_IMAGE_BASE = 'https://phimimg.com';

const VSMOV_API_BASE = 'https://vsmov.com/api';
const VSMOV_IMAGE_BASE = 'https://vsmov.com/storage/images';

const VIDSRC_EMBED_BASE = 'https://vidsrc.mov/embed';
const VIDSRC_DIRECT_BASE = 'https://vidsrc.sh/embed';
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

const VIDSRC_GENRES: Array<{ name: string; slug: string; canonical: string }> = [
  { name: 'Hành động (Action)', slug: 'action', canonical: 'Action' },
  { name: 'Phiêu lưu (Adventure)', slug: 'adventure', canonical: 'Adventure' },
  { name: 'Hoạt hình (Animation)', slug: 'animation', canonical: 'Animation' },
  { name: 'Viễn tưởng (Sci-Fi)', slug: 'sci-fi', canonical: 'Sci-Fi' },
  { name: 'Giật gân (Thriller)', slug: 'thriller', canonical: 'Thriller' },
  { name: 'Kinh dị (Horror)', slug: 'horror', canonical: 'Horror' },
  { name: 'Hài hước (Comedy)', slug: 'comedy', canonical: 'Comedy' },
  { name: 'Tâm lý (Drama)', slug: 'drama', canonical: 'Drama' },
  { name: 'Tình cảm (Romance)', slug: 'romance', canonical: 'Romance' },
  { name: 'Tội phạm (Crime)', slug: 'crime', canonical: 'Crime' },
  { name: 'Bí ẩn (Mystery)', slug: 'mystery', canonical: 'Mystery' },
  { name: 'Thần thoại (Fantasy)', slug: 'fantasy', canonical: 'Fantasy' },
  { name: 'Gia đình (Family)', slug: 'family', canonical: 'Family' },
  { name: 'Chiến tranh (War)', slug: 'war', canonical: 'War' },
  { name: 'Lịch sử (History)', slug: 'history', canonical: 'History' },
  { name: 'Tài liệu (Documentary)', slug: 'documentary', canonical: 'Documentary' },
  { name: 'Tiểu sử (Biography)', slug: 'biography', canonical: 'Biography' },
  { name: 'Thể thao (Sport)', slug: 'sport', canonical: 'Sport' },
  { name: 'Miền Tây (Western)', slug: 'western', canonical: 'Western' },
];

const VIDSRC_GENRE_CANONICAL = new Map<string, string>(
  VIDSRC_GENRES.map((g) => [g.slug, g.canonical])
);
const VIDSRC_GENRE_LABEL = new Map<string, string>(
  VIDSRC_GENRES.map((g) => [g.slug, g.name])
);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_KKPHIM_LIST_SLUGS = new Set([
  'phim-le',
  'phim-bo',
  'hoat-hinh',
  'tv-shows',
  'phim-vietsub',
  'phim-thuyet-minh',
  'phim-long-tieng',
]);

const VALID_VSMOV_LIST_SLUGS = new Set([
  'phim-moi-cap-nhat',
  'phim-le',
  'phim-bo',
  'phim-chieu-rap',
  'subteam',
]);

function normalizeEpisodeLabel(rawName: unknown): string {
  const cleaned = decodeEntities(rawName);
  if (!cleaned) return 'Full';
  if (/^\d+[a-z]?$/i.test(cleaned)) {
    return `Tập ${cleaned}`;
  }
  return cleaned;
}

function decodeEntities(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&hellip;/gi, '...')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeImageUrl(raw: unknown, domain = CDN_IMAGE_BASE): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const cleanDomain = (domain || CDN_IMAGE_BASE).replace(/\/+$/, '');
  const cleanPath = trimmed.replace(/^\/+/, '');
  return `${cleanDomain}/${cleanPath}`;
}

function normalizeMovieItem(
  raw: any,
  imgDomain = CDN_IMAGE_BASE,
  source: MovieSource = 'kkphim'
) {
  const tmdbScore = Number(raw?.tmdb?.vote_average) || 0;
  const imdbScore = Number(raw?.imdb?.vote_average) || 0;

  // VSMov dùng quy ước ngược ảnh so với KKPhim:
  // - VSMov thumb_url là ảnh đứng 2:3 (poster), poster_url là ảnh ngang 16:9 (backdrop)!
  // - KKPhim poster_url là ảnh đứng 2:3, thumb_url là ảnh ngang 16:9!
  const posterUrl =
    source === 'vsmov'
      ? normalizeImageUrl(raw?.thumb_url || raw?.poster_url, imgDomain)
      : normalizeImageUrl(raw?.poster_url || raw?.thumb_url, imgDomain);
  const thumbUrl =
    source === 'vsmov'
      ? normalizeImageUrl(raw?.poster_url || raw?.thumb_url, imgDomain)
      : normalizeImageUrl(raw?.thumb_url || raw?.poster_url, imgDomain);

  return {
    id: String(raw?._id || raw?.slug || ''),
    source,
    name: decodeEntities(raw?.name),
    originName: decodeEntities(raw?.origin_name),
    slug: String(raw?.slug || '').trim(),
    type: String(raw?.type || raw?.tmdb?.type || ''),
    posterUrl,
    thumbUrl,
    year: Number(raw?.year) || 0,
    quality: decodeEntities(raw?.quality) || 'HD',
    lang: decodeEntities(raw?.lang) || 'Vietsub',
    time: decodeEntities(raw?.time),
    episodeCurrent: decodeEntities(raw?.episode_current),
    episodeTotal: raw?.episode_total ? String(raw.episode_total) : '',
    chieurap: Boolean(raw?.chieurap),
    subDocQuyen: Boolean(raw?.sub_docquyen),
    rating:
      tmdbScore > 0
        ? Math.round(tmdbScore * 10) / 10
        : imdbScore > 0
        ? Math.round(imdbScore * 10) / 10
        : 0,
    categories: Array.isArray(raw?.category)
      ? raw.category
          .map((c: any) => ({ name: decodeEntities(c?.name), slug: String(c?.slug || '') }))
          .filter((c: any) => c.name && c.slug)
      : [],
    countries: Array.isArray(raw?.country)
      ? raw.country
          .map((c: any) => ({ name: decodeEntities(c?.name), slug: String(c?.slug || '') }))
          .filter((c: any) => c.name && c.slug)
      : [],
  };
}

function normalizeCinemetaItem(meta: any, fallbackKind: 'movie' | 'series' = 'movie') {
  const imdbId = String(meta?.imdb_id || meta?.id || '').trim();
  const kind: 'movie' | 'series' =
    meta?.type === 'series' || fallbackKind === 'series' ? 'series' : 'movie';
  const yearMatch = String(meta?.releaseInfo || meta?.year || '').match(/\d{4}/);
  const year = yearMatch ? Number(yearMatch[0]) : 0;
  const ratingRaw = parseFloat(String(meta?.imdbRating || '0'));
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? Math.round(ratingRaw * 10) / 10 : 0;

  const rawPoster = typeof meta?.poster === 'string' ? meta.poster.trim() : '';
  const posterUrl = rawPoster
    ? rawPoster.replace('/poster/small/', '/poster/medium/')
    : imdbId.startsWith('tt')
    ? `https://images.metahub.space/poster/medium/${imdbId}/img`
    : '';
  const rawBg = typeof meta?.background === 'string' ? meta.background.trim() : '';
  const thumbUrl =
    rawBg ||
    (imdbId.startsWith('tt')
      ? `https://images.metahub.space/background/medium/${imdbId}/img`
      : posterUrl);

  const rawGenres: string[] = Array.isArray(meta?.genres)
    ? meta.genres
    : Array.isArray(meta?.genre)
    ? meta.genre
    : [];
  const categories = rawGenres
    .map((g) => {
      const clean = decodeEntities(g);
      const slug = clean.toLowerCase().replace(/\s+/g, '-');
      return { name: VIDSRC_GENRE_LABEL.get(slug) || clean, slug };
    })
    .filter((c) => c.name && c.slug);

  const countryStr = typeof meta?.country === 'string' ? meta.country : '';
  const countries = countryStr
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => ({ name: c, slug: c.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));

  return {
    id: imdbId,
    source: 'vidsrc' as MovieSource,
    name: decodeEntities(meta?.name) || imdbId,
    originName: imdbId ? `${imdbId.toUpperCase()} • ${kind === 'series' ? 'TV Series' : 'Movie'}` : '',
    slug: `${kind}--${imdbId.toLowerCase()}`,
    type: kind,
    posterUrl,
    thumbUrl,
    year,
    quality: '1080p',
    lang: 'Multi-Sub',
    time: decodeEntities(meta?.runtime),
    episodeCurrent: kind === 'series' ? 'Series TV' : 'Full HD',
    episodeTotal: '',
    chieurap: false,
    subDocQuyen: false,
    rating,
    categories,
    countries,
  };
}

function parseVidsrcSlug(rawSlug: string): {
  kind: 'movie' | 'series';
  id: string;
  isTmdb: boolean;
} | null {
  const s = rawSlug.trim().toLowerCase();
  const prefixed = s.match(/^(movie|series)--(tmdb-)?(tt\d{5,12}|\d{2,10})$/i);
  if (prefixed) {
    const kind = prefixed[1] === 'series' ? 'series' : 'movie';
    const isTmdb = Boolean(prefixed[2]) || !prefixed[3].startsWith('tt');
    return { kind, id: prefixed[3], isTmdb };
  }
  if (/^tt\d{5,12}$/i.test(s)) {
    return { kind: 'movie', id: s, isTmdb: false };
  }
  if (/^\d{2,10}$/.test(s)) {
    return { kind: 'movie', id: s, isTmdb: true };
  }
  return null;
}

function buildVidsrcServers(
  kind: 'movie' | 'series',
  mediaId: string,
  title: string,
  videos: any[]
) {
  if (kind === 'movie') {
    return [
      {
        serverName: 'VidSrc.mov (Chính • 1080p)',
        episodes: [
          {
            name: 'Full 1080p',
            slug: 'full',
            filename: `${title} • VidSrc.mov`,
            linkEmbed: `${VIDSRC_EMBED_BASE}/movie/${mediaId}`,
            linkM3u8: '',
          },
        ],
      },
      {
        serverName: 'VidSrc Direct (Ít Popup)',
        episodes: [
          {
            name: 'Full 1080p',
            slug: 'full-direct',
            filename: `${title} • VidSrc Direct`,
            linkEmbed: `${VIDSRC_DIRECT_BASE}/movie/${mediaId}/`,
            linkM3u8: '',
          },
        ],
      },
    ];
  }

  // TV Series: gom theo từng Mùa (Season 1, Mùa 2...) chuẩn link https://vidsrc.mov/embed/tv/{id}/{s}/{e}
  const nowMs = Date.now() + 24 * 60 * 60 * 1000;
  const seasonMap = new Map<number, any[]>();
  const allVideos = Array.isArray(videos) ? videos : [];
  const hasPositiveSeason = allVideos.some((v) => Number(v?.season) >= 1);

  for (const v of allVideos) {
    const season = Number(v?.season);
    const epNum = Number(v?.episode ?? v?.number);
    if (!Number.isFinite(season) || !Number.isFinite(epNum) || epNum < 1) continue;
    if (hasPositiveSeason && season < 1) continue;
    // Bỏ qua các tập tương lai chưa công chiếu (nếu có ngày phát sóng rõ ràng)
    if (v?.released) {
      const relMs = Date.parse(String(v.released));
      if (Number.isFinite(relMs) && relMs > nowMs) continue;
    }
    const list = seasonMap.get(season) || [];
    list.push({ ...v, _epNum: epNum });
    seasonMap.set(season, list);
  }

  const sortedSeasons = Array.from(seasonMap.keys()).sort((a, b) => a - b);
  const servers = sortedSeasons.map((seasonNum) => {
    const eps = (seasonMap.get(seasonNum) || [])
      .sort((a, b) => a._epNum - b._epNum)
      .filter((v, idx, arr) => idx === 0 || v._epNum !== arr[idx - 1]._epNum);

    return {
      serverName: seasonNum === 0 ? 'Đặc biệt (VidSrc.mov)' : `Mùa ${seasonNum} (VidSrc.mov)`,
      episodes: eps.map((v) => {
        const epTitle = decodeEntities(v?.name || v?.title);
        const sPad = String(seasonNum).padStart(2, '0');
        const ePad = String(v._epNum).padStart(2, '0');
        return {
          name: `Tập ${v._epNum}`,
          slug: `s${seasonNum}e${v._epNum}`,
          filename: epTitle ? `S${sPad}E${ePad} • ${epTitle}` : `S${sPad}E${ePad}`,
          linkEmbed: `${VIDSRC_EMBED_BASE}/tv/${mediaId}/${seasonNum}/${v._epNum}`,
          linkM3u8: '',
        };
      }),
    };
  });

  if (servers.length > 0) {
    return servers;
  }

  // Fallback nếu phim bộ mới chưa có danh sách tập trên Cinemeta (hoặc nhập trực tiếp TMDB ID)
  return [
    {
      serverName: 'Mùa 1 (VidSrc.mov)',
      episodes: Array.from({ length: 12 }, (_, idx) => {
        const n = idx + 1;
        return {
          name: `Tập ${n}`,
          slug: `s1e${n}`,
          filename: `S01E${String(n).padStart(2, '0')}`,
          linkEmbed: `${VIDSRC_EMBED_BASE}/tv/${mediaId}/1/${n}`,
          linkM3u8: '',
        };
      }),
    },
  ];
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Movie API HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isSafeSlug(s: string): boolean {
  return /^[a-z0-9-]+$/i.test(s) && s.length <= 160;
}

function isSafeExternalHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h.endsWith('.local') ||
      h.endsWith('.internal')
    ) {
      return false;
    }
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const a = Number(ipv4[1]);
      const b = Number(ipv4[2]);
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function resolveAbsoluteUrl(baseUrl: string, line: string): string {
  try {
    return new URL(line, baseUrl).toString();
  } catch {
    return line;
  }
}

// Lọc sạch các đoạn quảng cáo chèn giữa phim (#EXT-X-DISCONTINUITY + convertv*/) nhưng giữ toàn bộ link .ts trực tiếp từ CDN gốc!
function cleanVariantPlaylist(rawM3u8: string, variantUrl: string): { text: string; strippedCount: number } {
  const lines = rawM3u8.split(/\r?\n/);

  // Đếm tổng số segment & số segment nghi vấn quảng cáo chèn (convertv7/8/9/...)
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

  // Chỉ lọc khi số segment nghi vấn là phần thiểu số (< 18% tổng số segment) -> an toàn tuyệt đối 100%, không bao giờ cắt nhầm phim thật!
  const shouldStripAds =
    segmentUrls.length >= 15 &&
    adCandidateCount > 0 &&
    adCandidateCount / segmentUrls.length < 0.18;

  const out: string[] = [];
  let pendingMeta: string[] = [];
  let strippedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-KEY:')) {
        // Phân giải URI khóa mã hóa (nếu có) thành URL tuyệt đối
        const rewritten = line.replace(/URI="([^"]+)"/i, (_, u) => {
          return `URI="${resolveAbsoluteUrl(variantUrl, u)}"`;
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
        // Header playlist (#EXTM3U, #EXT-X-VERSION, #EXT-X-TARGETDURATION, #EXT-X-ENDLIST...)
        if (pendingMeta.length > 0 && line === '#EXT-X-ENDLIST') {
          pendingMeta = [];
        }
        out.push(line);
      }
      continue;
    }

    // Dòng URI của segment (.ts / .m4s / .jpeg)
    const isAdSeg =
      shouldStripAds && (/(?:^|\/)convertv\d+\//i.test(line) || /\/ads?\//i.test(line));

    if (isAdSeg) {
      strippedCount += 1;
      pendingMeta = [];
      continue;
    }

    // Giữ lại segment thật: loại bỏ #EXT-X-DISCONTINUITY dư thừa dính sát ngay sau quảng cáo vừa cắt
    for (const meta of pendingMeta) {
      if (shouldStripAds && meta === '#EXT-X-DISCONTINUITY') continue;
      out.push(meta);
    }
    pendingMeta = [];
    out.push(resolveAbsoluteUrl(variantUrl, line));
  }

  return { text: out.join('\n') + '\n', strippedCount };
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'list').toLowerCase();
  const rawSource = (reqUrl.searchParams.get('source') || 'kkphim').toLowerCase();
  const source: MovieSource =
    rawSource === 'vsmov' ? 'vsmov' : rawSource === 'vidsrc' ? 'vidsrc' : 'kkphim';

  // =========================================================================
  // 1. ACTION = META (Danh sách Thể loại & Quốc gia theo nguồn KKPhim / VSMov / VidSrc)
  // =========================================================================
  if (action === 'meta') {
    if (source === 'vidsrc') {
      return new Response(
        JSON.stringify({
          source: 'vidsrc',
          genres: VIDSRC_GENRES.map((g) => ({ name: g.name, slug: g.slug })),
          countries: [],
        }),
        {
          status: 200,
          headers: {
            ...JSON_HEADERS,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        }
      );
    }

    const base = source === 'vsmov' ? VSMOV_API_BASE : PHIMAPI_BASE;
    try {
      const [tlRes, qgRes] = await Promise.all([
        fetchJson(`${base}/the-loai`),
        fetchJson(`${base}/quoc-gia`),
      ]);
      const rawGenres = Array.isArray(tlRes) ? tlRes : tlRes?.data?.items || [];
      const rawCountries = Array.isArray(qgRes) ? qgRes : qgRes?.data?.items || [];

      const genres = rawGenres
        .map((g: any) => ({ name: decodeEntities(g?.name), slug: String(g?.slug || '') }))
        .filter((g: any) => g.name && g.slug);
      const countries = rawCountries
        .map((c: any) => ({ name: decodeEntities(c?.name), slug: String(c?.slug || '') }))
        .filter((c: any) => c.name && c.slug);

      return new Response(JSON.stringify({ source, genres, countries }), {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          source,
          error: err?.message || 'Không tải được danh mục phim',
          genres: [],
          countries: [],
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 2. ACTION = LIST (Hỗ trợ cả KKPhim và VSMov: Mới cập nhật, Chiếu rạp, Subteam, Phim lẻ, Phim bộ, Bộ lọc...)
  // =========================================================================
  if (action === 'list') {
    const type = (reqUrl.searchParams.get('type') || 'moi-cap-nhat').toLowerCase();
    const category = (reqUrl.searchParams.get('category') || '').trim().toLowerCase();
    const country = (reqUrl.searchParams.get('country') || '').trim().toLowerCase();
    const year = (reqUrl.searchParams.get('year') || '').trim();
    const sortLang = (reqUrl.searchParams.get('sort_lang') || '').trim().toLowerCase();
    const sortField = (reqUrl.searchParams.get('sort_field') || 'modified.time').trim();
    const sortType =
      (reqUrl.searchParams.get('sort_type') || 'desc').trim().toLowerCase() === 'asc'
        ? 'asc'
        : 'desc';
    const pageRaw = parseInt(reqUrl.searchParams.get('page') || '1', 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 && pageRaw <= 500 ? pageRaw : 1;
    const limitRaw = parseInt(reqUrl.searchParams.get('limit') || '24', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 6 && limitRaw <= 48 ? limitRaw : 24;

    // --- NHÁNH VIDSRC (https://vidsrc.mov/embed + Danh mục quốc tế IMDb/Cinemeta) ---
    if (source === 'vidsrc') {
      try {
        const mediaType: 'movie' | 'series' =
          type === 'phim-bo' || type === 'series-imdb' ? 'series' : 'movie';
        const skip = (page - 1) * limit;
        const extraParts: string[] = [];

        let catalogId = type === 'top-imdb' || type === 'series-imdb' ? 'imdbRating' : 'top';
        if (year && /^\d{4}$/.test(year)) {
          catalogId = 'year';
          extraParts.push(`genre=${year}`);
        } else {
          const canonicalGenre = category
            ? VIDSRC_GENRE_CANONICAL.get(category)
            : type === 'hoat-hinh'
            ? 'Animation'
            : undefined;
          if (canonicalGenre) {
            extraParts.push(`genre=${encodeURIComponent(canonicalGenre)}`);
          }
        }
        if (skip > 0) {
          extraParts.push(`skip=${skip}`);
        }

        const extraSeg = extraParts.length > 0 ? `/${extraParts.join('&')}` : '';
        const endpoint = `${CINEMETA_BASE}/catalog/${mediaType}/${catalogId}${extraSeg}.json`;
        const res = await fetchJson(endpoint);
        const rawMetas = Array.isArray(res?.metas) ? res.metas : [];

        // Cinemeta trả tối đa ~50 item mỗi batch -> cắt đúng `limit` để chuyển trang mượt, không trùng
        const items = rawMetas
          .slice(0, limit)
          .map((m: any) => normalizeCinemetaItem(m, mediaType))
          .filter((x: any) => x.id);
        const hasMore = rawMetas.length >= limit;
        const totalPages = hasMore ? Math.max(page + 1, 20) : page;

        return new Response(
          JSON.stringify({
            source: 'vidsrc',
            title: 'Kho Phim Quốc Tế VidSrc.mov',
            page,
            totalPages,
            totalItems: hasMore ? totalPages * limit : skip + items.length,
            items,
          }),
          {
            status: 200,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=300, s-maxage=300',
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            source: 'vidsrc',
            error: err?.message || 'Không tải được danh sách phim từ VidSrc',
            items: [],
            page: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }
    }

    // --- NHÁNH VSMOV (https://vsmov.com/api) ---
    if (source === 'vsmov') {
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', String(limit));

        let endpoint = '';
        if (category && isSafeSlug(category)) {
          endpoint = `${VSMOV_API_BASE}/the-loai/${category}`;
          if (country && isSafeSlug(country)) params.set('country', country);
          if (year && /^\d{4}$/.test(year)) params.set('year', year);
        } else if (country && isSafeSlug(country)) {
          endpoint = `${VSMOV_API_BASE}/quoc-gia/${country}`;
          if (year && /^\d{4}$/.test(year)) params.set('year', year);
        } else if (year && /^\d{4}$/.test(year)) {
          endpoint = `${VSMOV_API_BASE}/nam/${year}`;
        } else if (type === 'hoat-hinh') {
          endpoint = `${VSMOV_API_BASE}/the-loai/hoat-hinh`;
        } else {
          const vsSlug =
            type === 'moi-cap-nhat'
              ? 'phim-moi-cap-nhat'
              : VALID_VSMOV_LIST_SLUGS.has(type)
              ? type
              : 'phim-moi-cap-nhat';
          endpoint = `${VSMOV_API_BASE}/danh-sach/${vsSlug}`;
        }

        const res = await fetchJson(`${endpoint}?${params.toString()}`);
        const imgDomain = res?.pathImage || VSMOV_IMAGE_BASE;
        const rawItems = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.data?.items)
          ? res.data.items
          : [];
        const items = rawItems
          .map((it: any) => normalizeMovieItem(it, imgDomain, 'vsmov'))
          .filter((x: any) => x.slug);
        const pag = res?.pagination || res?.data?.params?.pagination || {};

        return new Response(
          JSON.stringify({
            source: 'vsmov',
            title: 'Kho Phim VSMov',
            page: Number(pag.currentPage) || page,
            totalPages: Number(pag.totalPages) || 1,
            totalItems: Number(pag.totalItems) || items.length,
            items,
          }),
          {
            status: 200,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=180, s-maxage=180',
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            source: 'vsmov',
            error: err?.message || 'Không tải được danh sách phim từ VSMov',
            items: [],
            page: 1,
            totalPages: 1,
            totalItems: 0,
          }),
          { status: 502, headers: JSON_HEADERS }
        );
      }
    }

    // --- NHÁNH KKPHIM (https://phimapi.com) ---
    const hasFilters = Boolean(category || country || year || sortLang);

    try {
      if (type === 'moi-cap-nhat' && !hasFilters) {
        const res = await fetchJson(`${PHIMAPI_BASE}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`);
        const items = Array.isArray(res?.items)
          ? res.items
              .map((it: any) => normalizeMovieItem(it, CDN_IMAGE_BASE, 'kkphim'))
              .filter((x: any) => x.slug)
          : [];
        const pag = res?.pagination || {};
        return new Response(
          JSON.stringify({
            source: 'kkphim',
            title: 'Phim Mới Cập Nhật',
            page: Number(pag.currentPage) || page,
            totalPages: Number(pag.totalPages) || 1,
            totalItems: Number(pag.totalItems) || items.length,
            updateToday: Number(pag.updateToday) || 0,
            items,
          }),
          {
            status: 200,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=180, s-maxage=180',
            },
          }
        );
      }

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('sort_field', sortField);
      params.set('sort_type', sortType);
      if (sortLang) params.set('sort_lang', sortLang);

      let endpoint = '';
      if (type === 'moi-cap-nhat' && category && isSafeSlug(category)) {
        endpoint = `${PHIMAPI_BASE}/v1/api/the-loai/${category}`;
        if (country && isSafeSlug(country)) params.set('country', country);
        if (year && /^\d{4}$/.test(year)) params.set('year', year);
      } else if (type === 'moi-cap-nhat' && country && isSafeSlug(country)) {
        endpoint = `${PHIMAPI_BASE}/v1/api/quoc-gia/${country}`;
        if (year && /^\d{4}$/.test(year)) params.set('year', year);
      } else if (type === 'moi-cap-nhat' && year && /^\d{4}$/.test(year)) {
        endpoint = `${PHIMAPI_BASE}/v1/api/nam/${year}`;
      } else {
        const listSlug = VALID_KKPHIM_LIST_SLUGS.has(type) ? type : 'phim-le';
        endpoint = `${PHIMAPI_BASE}/v1/api/danh-sach/${listSlug}`;
        if (category && isSafeSlug(category)) params.set('category', category);
        if (country && isSafeSlug(country)) params.set('country', country);
        if (year && /^\d{4}$/.test(year)) params.set('year', year);
      }

      const res = await fetchJson(`${endpoint}?${params.toString()}`);
      const data = res?.data || {};
      const imgDomain = data.APP_DOMAIN_CDN_IMAGE || CDN_IMAGE_BASE;
      const items = Array.isArray(data.items)
        ? data.items
            .map((it: any) => normalizeMovieItem(it, imgDomain, 'kkphim'))
            .filter((x: any) => x.slug)
        : [];
      const pag = data?.params?.pagination || {};

      return new Response(
        JSON.stringify({
          source: 'kkphim',
          title: decodeEntities(data.titlePage) || 'Kho Phim KKPhim',
          page: Number(pag.currentPage) || page,
          totalPages: Number(pag.totalPages) || 1,
          totalItems: Number(pag.totalItems) || items.length,
          items,
        }),
        {
          status: 200,
          headers: {
            ...JSON_HEADERS,
            'Cache-Control': 'public, max-age=180, s-maxage=180',
          },
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          source: 'kkphim',
          error: err?.message || 'Không tải được danh sách phim từ KKPhim',
          items: [],
          page: 1,
          totalPages: 1,
          totalItems: 0,
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 3. ACTION = SEARCH (Tìm kiếm phim theo từ khóa trên KKPhim hoặc VSMov)
  // =========================================================================
  if (action === 'search') {
    const keyword = (reqUrl.searchParams.get('keyword') || reqUrl.searchParams.get('q') || '').trim();
    if (!keyword) {
      return new Response(
        JSON.stringify({ source, items: [], page: 1, totalPages: 1, totalItems: 0 }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    const pageRaw = parseInt(reqUrl.searchParams.get('page') || '1', 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
    const limitRaw = parseInt(reqUrl.searchParams.get('limit') || '24', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw >= 6 && limitRaw <= 48 ? limitRaw : 24;
    const category = (reqUrl.searchParams.get('category') || '').trim().toLowerCase();
    const country = (reqUrl.searchParams.get('country') || '').trim().toLowerCase();
    const year = (reqUrl.searchParams.get('year') || '').trim();
    const sortLang = (reqUrl.searchParams.get('sort_lang') || '').trim().toLowerCase();

    const params = new URLSearchParams({
      keyword,
      page: String(page),
      limit: String(limit),
    });
    if (category && isSafeSlug(category)) params.set('category', category);
    if (country && isSafeSlug(country)) params.set('country', country);
    if (year && /^\d{4}$/.test(year)) params.set('year', year);
    if (sortLang) params.set('sort_lang', sortLang);

    try {
      if (source === 'vidsrc') {
        const kwLower = keyword.toLowerCase();

        // 1) Hỗ trợ dán trực tiếp IMDb ID (vd: tt17048514) hoặc TMDB ID số (vd: 927085) chuẩn tài liệu vidsrc.mov!
        if (/^tt\d{5,12}$/i.test(kwLower)) {
          const [mRes, sRes] = await Promise.allSettled([
            fetchJson(`${CINEMETA_BASE}/meta/movie/${kwLower}.json`),
            fetchJson(`${CINEMETA_BASE}/meta/series/${kwLower}.json`),
          ]);
          const found: any[] = [];
          if (mRes.status === 'fulfilled' && mRes.value?.meta?.id) {
            found.push(normalizeCinemetaItem(mRes.value.meta, 'movie'));
          }
          if (sRes.status === 'fulfilled' && sRes.value?.meta?.id) {
            found.push(normalizeCinemetaItem(sRes.value.meta, 'series'));
          }
          if (found.length === 0) {
            found.push({
              id: kwLower,
              source: 'vidsrc',
              name: `Phim IMDb ${kwLower.toUpperCase()}`,
              originName: 'Phát trực tiếp qua VidSrc.mov',
              slug: `movie--${kwLower}`,
              type: 'movie',
              posterUrl: `https://images.metahub.space/poster/medium/${kwLower}/img`,
              thumbUrl: `https://images.metahub.space/background/medium/${kwLower}/img`,
              year: 0,
              quality: '1080p',
              lang: 'Multi-Sub',
              time: '',
              episodeCurrent: 'Full HD',
              episodeTotal: '',
              chieurap: false,
              subDocQuyen: false,
              rating: 0,
              categories: [],
              countries: [],
            });
          }
          return new Response(
            JSON.stringify({
              source: 'vidsrc',
              title: `VidSrc IMDb: ${kwLower.toUpperCase()}`,
              keyword,
              page: 1,
              totalPages: 1,
              totalItems: found.length,
              items: found,
            }),
            { status: 200, headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=300, s-maxage=300' } }
          );
        }

        if (/^\d{2,10}$/.test(kwLower)) {
          const tmdbItems = [
            {
              id: kwLower,
              source: 'vidsrc',
              name: `Movie TMDB #${kwLower}`,
              originName: 'VidSrc.mov • Phát trực tiếp bằng TMDB ID',
              slug: `movie--tmdb-${kwLower}`,
              type: 'movie',
              posterUrl: '',
              thumbUrl: '',
              year: 0,
              quality: '1080p',
              lang: 'Multi-Sub',
              time: '',
              episodeCurrent: 'Full HD',
              episodeTotal: '',
              chieurap: false,
              subDocQuyen: false,
              rating: 0,
              categories: [],
              countries: [],
            },
            {
              id: kwLower,
              source: 'vidsrc',
              name: `TV Series TMDB #${kwLower}`,
              originName: 'VidSrc.mov • Phát trực tiếp Series bằng TMDB ID',
              slug: `series--tmdb-${kwLower}`,
              type: 'series',
              posterUrl: '',
              thumbUrl: '',
              year: 0,
              quality: '1080p',
              lang: 'Multi-Sub',
              time: '',
              episodeCurrent: 'Series TV',
              episodeTotal: '',
              chieurap: false,
              subDocQuyen: false,
              rating: 0,
              categories: [],
              countries: [],
            },
          ];
          return new Response(
            JSON.stringify({
              source: 'vidsrc',
              title: `VidSrc TMDB #${kwLower}`,
              keyword,
              page: 1,
              totalPages: 1,
              totalItems: tmdbItems.length,
              items: tmdbItems,
            }),
            { status: 200, headers: JSON_HEADERS }
          );
        }

        // 2) Tìm kiếm song song cả Phim lẻ (movie) và Series TV (series) trên kho IMDb quốc tế
        const qEnc = encodeURIComponent(keyword);
        const [movieRes, seriesRes] = await Promise.allSettled([
          fetchJson(`${CINEMETA_BASE}/catalog/movie/top/search=${qEnc}.json`),
          fetchJson(`${CINEMETA_BASE}/catalog/series/top/search=${qEnc}.json`),
        ]);

        const movieList =
          movieRes.status === 'fulfilled' && Array.isArray(movieRes.value?.metas)
            ? movieRes.value.metas.map((m: any) => normalizeCinemetaItem(m, 'movie'))
            : [];
        const seriesList =
          seriesRes.status === 'fulfilled' && Array.isArray(seriesRes.value?.metas)
            ? seriesRes.value.metas.map((m: any) => normalizeCinemetaItem(m, 'series'))
            : [];

        // Xen kẽ phim lẻ & series để người dùng thấy cả hai ngay đầu kết quả
        const merged: any[] = [];
        const seen = new Set<string>();
        const maxLen = Math.max(movieList.length, seriesList.length);
        for (let i = 0; i < maxLen; i++) {
          for (const candidate of [movieList[i], seriesList[i]]) {
            if (!candidate || !candidate.slug || seen.has(candidate.slug)) continue;
            seen.add(candidate.slug);
            merged.push(candidate);
          }
        }

        return new Response(
          JSON.stringify({
            source: 'vidsrc',
            title: `Tìm kiếm VidSrc: "${keyword}"`,
            keyword,
            page: 1,
            totalPages: 1,
            totalItems: merged.length,
            items: merged.slice(0, Math.max(limit, 36)),
          }),
          {
            status: 200,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=180, s-maxage=180',
            },
          }
        );
      }

      if (source === 'vsmov') {
        const res = await fetchJson(`${VSMOV_API_BASE}/tim-kiem?${params.toString()}`);
        const imgDomain = res?.pathImage || VSMOV_IMAGE_BASE;
        const rawItems = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.data?.items)
          ? res.data.items
          : [];
        const items = rawItems
          .map((it: any) => normalizeMovieItem(it, imgDomain, 'vsmov'))
          .filter((x: any) => x.slug);
        const pag = res?.pagination || res?.data?.params?.pagination || {};

        return new Response(
          JSON.stringify({
            source: 'vsmov',
            title: `Tìm kiếm VSMov: "${keyword}"`,
            keyword,
            page: Number(pag.currentPage) || page,
            totalPages: Number(pag.totalPages) || 1,
            totalItems: Number(pag.totalItems) || items.length,
            items,
          }),
          {
            status: 200,
            headers: {
              ...JSON_HEADERS,
              'Cache-Control': 'public, max-age=180, s-maxage=180',
            },
          }
        );
      }

      const res = await fetchJson(`${PHIMAPI_BASE}/v1/api/tim-kiem?${params.toString()}`);
      const data = res?.data || {};
      const imgDomain = data.APP_DOMAIN_CDN_IMAGE || CDN_IMAGE_BASE;
      const items = Array.isArray(data.items)
        ? data.items
            .map((it: any) => normalizeMovieItem(it, imgDomain, 'kkphim'))
            .filter((x: any) => x.slug)
        : [];
      const pag = data?.params?.pagination || {};

      return new Response(
        JSON.stringify({
          source: 'kkphim',
          title: `Tìm kiếm: "${keyword}"`,
          keyword,
          page: Number(pag.currentPage) || page,
          totalPages: Number(pag.totalPages) || 1,
          totalItems: Number(pag.totalItems) || items.length,
          items,
        }),
        {
          status: 200,
          headers: {
            ...JSON_HEADERS,
            'Cache-Control': 'public, max-age=180, s-maxage=180',
          },
        }
      );
    } catch (err: any) {
      const srcLabel = source === 'vsmov' ? 'VSMov' : source === 'vidsrc' ? 'VidSrc' : 'KKPhim';
      return new Response(
        JSON.stringify({
          source,
          error: err?.message || `Lỗi tìm kiếm phim trên ${srcLabel}`,
          items: [],
          page: 1,
          totalPages: 1,
          totalItems: 0,
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 4. ACTION = DETAIL (Chi tiết phim + Server & Tập phim từ KKPhim hoặc VSMov)
  // =========================================================================
  if (action === 'detail') {
    const slug = (reqUrl.searchParams.get('slug') || '').trim().toLowerCase();
    if (!slug || !isSafeSlug(slug)) {
      return new Response(JSON.stringify({ error: 'Slug phim không hợp lệ' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    if (source === 'vidsrc') {
      const parsed = parseVidsrcSlug(slug);
      if (!parsed) {
        return new Response(JSON.stringify({ error: 'ID phim VidSrc không hợp lệ' }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      try {
        let kind: 'movie' | 'series' = parsed.kind;
        let meta: any = null;

        if (!parsed.isTmdb) {
          try {
            const r1 = await fetchJson(`${CINEMETA_BASE}/meta/${kind}/${parsed.id}.json`);
            if (r1?.meta?.id) meta = r1.meta;
          } catch {}
          if (!meta) {
            const altKind: 'movie' | 'series' = kind === 'movie' ? 'series' : 'movie';
            try {
              const r2 = await fetchJson(`${CINEMETA_BASE}/meta/${altKind}/${parsed.id}.json`);
              if (r2?.meta?.id) {
                meta = r2.meta;
                kind = altKind;
              }
            } catch {}
          }
        }

        const baseItem = meta
          ? normalizeCinemetaItem(meta, kind)
          : {
              id: parsed.id,
              source: 'vidsrc' as MovieSource,
              name: parsed.isTmdb
                ? `${kind === 'series' ? 'TV Series' : 'Movie'} TMDB #${parsed.id}`
                : `IMDb ${parsed.id.toUpperCase()}`,
              originName: 'VidSrc.mov • 1080p Multi-Sub',
              slug,
              type: kind,
              posterUrl: !parsed.isTmdb
                ? `https://images.metahub.space/poster/medium/${parsed.id}/img`
                : '',
              thumbUrl: !parsed.isTmdb
                ? `https://images.metahub.space/background/medium/${parsed.id}/img`
                : '',
              year: 0,
              quality: '1080p',
              lang: 'Multi-Sub',
              time: '',
              episodeCurrent: kind === 'series' ? 'Series TV' : 'Full HD',
              episodeTotal: '',
              chieurap: false,
              subDocQuyen: false,
              rating: 0,
              categories: [],
              countries: [],
            };

        const servers = buildVidsrcServers(kind, parsed.id, baseItem.name, meta?.videos || []);
        const totalEps = servers.reduce((acc, s) => acc + s.episodes.length, 0);

        const detail = {
          ...baseItem,
          episodeCurrent:
            kind === 'series'
              ? `${servers.length} mùa • ${totalEps} tập`
              : 'Full 1080p',
          episodeTotal: kind === 'series' ? `${totalEps} tập` : '1080p',
          content:
            decodeEntities(meta?.description) ||
            'Phát trực tiếp chuẩn 1080p từ VidSrc.mov, hỗ trợ đa ngôn ngữ phụ đề (chọn biểu tượng CC trong trình phát).',
          status: kind === 'series' ? 'TV Series' : 'Released',
          trailerUrl: '',
          notify: '',
          showtimes: '',
          view: 0,
          actors: Array.isArray(meta?.cast)
            ? meta.cast.map((a: any) => decodeEntities(a)).filter(Boolean)
            : [],
          directors: Array.isArray(meta?.director)
            ? meta.director.map((d: any) => decodeEntities(d)).filter(Boolean)
            : typeof meta?.director === 'string' && meta.director
            ? [decodeEntities(meta.director)]
            : [],
          servers,
        };

        return new Response(JSON.stringify(detail), {
          status: 200,
          headers: {
            ...JSON_HEADERS,
            'Cache-Control': 'public, max-age=600, s-maxage=600',
          },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Không tải được chi tiết phim từ VidSrc' }),
          { status: 502, headers: JSON_HEADERS }
        );
      }
    }

    const detailUrl =
      source === 'vsmov' ? `${VSMOV_API_BASE}/phim/${slug}` : `${PHIMAPI_BASE}/phim/${slug}`;

    try {
      const res = await fetchJson(detailUrl);
      const m = res?.movie;
      if (!m || typeof m !== 'object') {
        throw new Error('Không tìm thấy thông tin phim');
      }

      const imgDomain = source === 'vsmov' ? VSMOV_IMAGE_BASE : CDN_IMAGE_BASE;
      const baseItem = normalizeMovieItem(m, imgDomain, source);
      const servers = Array.isArray(res?.episodes)
        ? res.episodes
            .map((srv: any) => ({
              serverName: decodeEntities(srv?.server_name) || 'Server 1',
              episodes: Array.isArray(srv?.server_data)
                ? srv.server_data
                    .map((ep: any) => ({
                      name: normalizeEpisodeLabel(ep?.name),
                      slug: String(ep?.slug || '').trim(),
                      filename: decodeEntities(ep?.filename),
                      linkEmbed: typeof ep?.link_embed === 'string' ? ep.link_embed.trim() : '',
                      linkM3u8: typeof ep?.link_m3u8 === 'string' ? ep.link_m3u8.trim() : '',
                    }))
                    .filter((ep: any) => ep.linkM3u8 || ep.linkEmbed)
                : [],
            }))
            .filter((srv: any) => srv.episodes.length > 0)
        : [];

      const detail = {
        ...baseItem,
        content: decodeEntities(m.content),
        status: decodeEntities(m.status),
        trailerUrl: typeof m.trailer_url === 'string' ? m.trailer_url.trim() : '',
        notify: decodeEntities(m.notify),
        showtimes: decodeEntities(m.showtimes),
        view: Number(m.view) || 0,
        actors: Array.isArray(m.actor)
          ? m.actor.map((a: any) => decodeEntities(a)).filter((a: string) => a && a !== 'Đang cập nhật')
          : [],
        directors: Array.isArray(m.director)
          ? m.director.map((d: any) => decodeEntities(d)).filter((d: string) => d && d !== 'Đang cập nhật')
          : [],
        servers,
      };

      return new Response(JSON.stringify(detail), {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Không tải được chi tiết phim' }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 5. ACTION = CLEAN-M3U8 (Tự lọc quảng cáo chèn convertv*/ giữa phim — .ts vẫn chạy thẳng từ CDN gốc!)
  // =========================================================================
  if (action === 'clean-m3u8') {
    const targetUrl = (reqUrl.searchParams.get('url') || '').trim();
    if (!isSafeExternalHttpUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: 'URL m3u8 không hợp lệ' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    try {
      const fetchM3u8 = async (u: string): Promise<{ text: string; finalUrl: string }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const r = await fetch(u, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': UA },
          });
          if (!r.ok) throw new Error(`M3U8 HTTP ${r.status}`);
          return { text: await r.text(), finalUrl: r.url || u };
        } finally {
          clearTimeout(timer);
        }
      };

      const first = await fetchM3u8(targetUrl);

      // Nếu là Master Playlist (#EXT-X-STREAM-INF) -> chọn variant chất lượng cao nhất để trả luôn Media Playlist đã lọc QC!
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
            const abs = resolveAbsoluteUrl(first.finalUrl, l);
            if (!bestUrl || pendingBw >= bestBw) {
              bestBw = pendingBw;
              bestUrl = abs;
            }
            pendingBw = 0;
          }
        }

        if (bestUrl) {
          const variant = await fetchM3u8(bestUrl);
          const cleaned = cleanVariantPlaylist(variant.text, variant.finalUrl);
          return new Response(cleaned.text, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'X-Ad-Segments-Stripped': String(cleaned.strippedCount),
              'Cache-Control': 'public, max-age=600, s-maxage=600',
            },
          });
        }
      }

      const cleaned = cleanVariantPlaylist(first.text, first.finalUrl);
      return new Response(cleaned.text, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'X-Ad-Segments-Stripped': String(cleaned.strippedCount),
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Không lọc được luồng m3u8' }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: JSON_HEADERS,
  });
};
