// Shared multi-source movie engine helpers for /api/movie:
// - NguonC   (https://phim.nguonc.com/api — 33,700+ phim, Direct HLS sạch QC qua K20)
// - CoBePhim (https://cobephim.club + public /api/v1 — Song Ngữ, Đa Server KK/VS/NC)
// - K20      (https://sc.k-20.xyz — Kho Phim 4K, CLB Phim Xưa MP4, Thể Thao Live Xôi Lạc/Vebo/SoCoLive, & Direct HLS cho IMDb!)

export type ExtraMovieSource = 'nguonc' | 'cobephim' | 'k20';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const NGUONC_API_BASE = 'https://phim.nguonc.com/api';
export const COBEPHIM_SITE_BASE = 'https://cobephim.club';
export const COBEPHIM_API_BASE = 'https://egluy2hhb21vaw5ndw9pbmhl.darkbytes.xyz/api/v1';
export const K20_BASE = 'https://sc.k-20.xyz';

export const NGUONC_GENRES = [
  { name: 'Hành Động', slug: 'hanh-dong' },
  { name: 'Phiêu Lưu', slug: 'phieu-luu' },
  { name: 'Hoạt Hình', slug: 'hoat-hinh' },
  { name: 'Phim Hài', slug: 'phim-hai' },
  { name: 'Hình Sự', slug: 'hinh-su' },
  { name: 'Tài Liệu', slug: 'tai-lieu' },
  { name: 'Chính Kịch', slug: 'chinh-kich' },
  { name: 'Gia Đình', slug: 'gia-dinh' },
  { name: 'Giả Tưởng', slug: 'gia-tuong' },
  { name: 'Lịch Sử', slug: 'lich-su' },
  { name: 'Kinh Dị', slug: 'kinh-di' },
  { name: 'Phim Nhạc', slug: 'phim-nhac' },
  { name: 'Bí Ẩn', slug: 'bi-an' },
  { name: 'Lãng Mạn', slug: 'lang-man' },
  { name: 'Khoa Học Viễn Tưởng', slug: 'khoa-hoc-vien-tuong' },
  { name: 'Gây Cấn', slug: 'gay-can' },
  { name: 'Chiến Tranh', slug: 'chien-tranh' },
  { name: 'Tâm Lý', slug: 'tam-ly' },
  { name: 'Tình Cảm', slug: 'tinh-cam' },
  { name: 'Cổ Trang', slug: 'co-trang' },
  { name: 'Miền Tây', slug: 'mien-tay' },
];

export const NGUONC_COUNTRIES = [
  { name: 'Việt Nam', slug: 'viet-nam' },
  { name: 'Hàn Quốc', slug: 'han-quoc' },
  { name: 'Trung Quốc', slug: 'trung-quoc' },
  { name: 'Mỹ', slug: 'my' },
  { name: 'Nhật Bản', slug: 'nhat-ban' },
  { name: 'Thái Lan', slug: 'thai-lan' },
  { name: 'Hồng Kông', slug: 'hong-kong' },
  { name: 'Đài Loan', slug: 'dai-loan' },
  { name: 'Anh', slug: 'anh' },
  { name: 'Pháp', slug: 'phap' },
  { name: 'Đức', slug: 'duc' },
  { name: 'Ấn Độ', slug: 'an-do' },
  { name: 'Canada', slug: 'canada' },
  { name: 'Úc', slug: 'uc' },
  { name: 'Tây Ban Nha', slug: 'tay-ban-nha' },
  { name: 'Italy', slug: 'italy' },
  { name: 'Nga', slug: 'nga' },
  { name: 'Philippines', slug: 'philippines' },
  { name: 'Brazil', slug: 'brazil' },
  { name: 'Bỉ', slug: 'bi' },
];

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

function normalizeEpisodeLabel(rawName: unknown): string {
  const cleaned = decodeEntities(rawName);
  if (!cleaned) return 'Full';
  if (/^\d+[a-z]?$/i.test(cleaned)) {
    return `Tập ${cleaned}`;
  }
  return cleaned;
}

function isSafeSlug(s: string): boolean {
  return /^[a-z0-9-]+$/i.test(s) && s.length <= 160;
}

async function fetchJson(
  url: string,
  timeoutMs = 10000,
  extraHeaders?: Record<string, string>
): Promise<any> {
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
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(
  url: string,
  timeoutMs = 10000,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Chuyển embed*.streamc.xyz/embed.php?hash=... sang luồng HLS sạch trực tiếp qua K20 (KHÔNG logo, KHÔNG QC!)
export function streamcEmbedToHls(embedUrl: string): string {
  const m = embedUrl.match(/^https?:\/\/([a-z0-9-]+\.streamc\.xyz)\/embed\.php\?[^#]*hash=([a-f0-9]+)/i);
  if (!m) return '';
  return `${K20_BASE}/nguonc-hls.m3u8?hash=${encodeURIComponent(m[2])}&eh=${encodeURIComponent(m[1])}`;
}

export function extractK20SubtitlesFromUrl(streamUrl: string): Array<{ label: string; lang: string; url: string }> {
  try {
    const u = new URL(streamUrl);
    const subsParam = u.searchParams.get('subs');
    if (!subsParam) return [];
    const parsed = JSON.parse(subsParam);
    if (!Array.isArray(parsed)) return [];
    const out: Array<{ label: string; lang: string; url: string }> = [];
    const seen = new Set<string>();
    for (const s of parsed) {
      const subUrl = typeof s?.url === 'string' ? s.url.trim() : '';
      if (!subUrl || seen.has(subUrl)) continue;
      seen.add(subUrl);
      const rawLang = String(s?.lang || s?.code || '').toLowerCase();
      if (rawLang.startsWith('vi')) {
        out.push({ label: 'Tiếng Việt', lang: 'vi', url: subUrl });
      } else if (rawLang.startsWith('en')) {
        out.push({ label: 'English', lang: 'en', url: subUrl });
      } else {
        out.push({ label: rawLang.toUpperCase() || 'CC', lang: rawLang || 'und', url: subUrl });
      }
    }
    out.sort((a, b) => (a.lang === 'vi' && b.lang !== 'vi' ? -1 : b.lang === 'vi' && a.lang !== 'vi' ? 1 : 0));
    return out;
  } catch {
    return [];
  }
}

function naturalEpNumber(name: string): number {
  const m = name.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : Number.MAX_SAFE_INTEGER;
}

// =========================================================================
// 1. NGUONC (https://phim.nguonc.com/api — 33,700+ phim)
// =========================================================================
function normalizeNguoncItem(raw: any) {
  // NguonC: thumb_url = ảnh dọc 2:3 (580x820), poster_url = ảnh ngang 16:9 (1908x1080)
  const posterUrl = String(raw?.thumb_url || raw?.thumb_url_webp || raw?.poster_url || '').trim();
  const thumbUrl = String(raw?.poster_url || raw?.poster_url_webp || raw?.thumb_url || '').trim();
  const yearMatch = String(raw?.year || '').match(/\d{4}/);
  const tmdbScore = Number(raw?.tmdb?.vote_average) || 0;
  const imdbScore = Number(raw?.imdb?.vote_average) || 0;

  // NguonC category có thể là object nhóm {"1":{group,list}, "2":{group,list}}
  const categories: Array<{ name: string; slug: string }> = [];
  const countries: Array<{ name: string; slug: string }> = [];
  let year = yearMatch ? Number(yearMatch[0]) : 0;

  if (raw?.category && typeof raw.category === 'object' && !Array.isArray(raw.category)) {
    for (const grp of Object.values(raw.category) as any[]) {
      const gName = String(grp?.group?.name || '').toLowerCase();
      const list = Array.isArray(grp?.list) ? grp.list : [];
      if (gName.includes('thể loại')) {
        for (const item of list) {
          const n = decodeEntities(item?.name);
          const matched = NGUONC_GENRES.find((g) => g.name.toLowerCase() === n.toLowerCase());
          if (n) categories.push({ name: n, slug: matched?.slug || slugifyVn(n) });
        }
      } else if (gName.includes('quốc gia')) {
        for (const item of list) {
          const n = decodeEntities(item?.name);
          const matched = NGUONC_COUNTRIES.find((c) => c.name.toLowerCase() === n.toLowerCase());
          if (n) countries.push({ name: n, slug: matched?.slug || slugifyVn(n) });
        }
      } else if (gName.includes('năm') && !year && list[0]?.name) {
        const ym = String(list[0].name).match(/\d{4}/);
        if (ym) year = Number(ym[0]);
      }
    }
  }

  return {
    id: String(raw?.id || raw?.slug || ''),
    source: 'nguonc',
    name: decodeEntities(raw?.name),
    originName: decodeEntities(raw?.original_name || raw?.origin_name),
    slug: String(raw?.slug || '').trim(),
    type: String(raw?.tmdb?.type || ''),
    posterUrl,
    thumbUrl,
    year,
    quality: decodeEntities(raw?.quality) || 'HD',
    lang: decodeEntities(raw?.language) || 'Vietsub',
    time: decodeEntities(raw?.time),
    episodeCurrent: decodeEntities(raw?.current_episode),
    episodeTotal: raw?.total_episodes ? String(raw.total_episodes) : '',
    chieurap: false,
    subDocQuyen: false,
    rating:
      tmdbScore > 0
        ? Math.round(tmdbScore * 10) / 10
        : imdbScore > 0
        ? Math.round(imdbScore * 10) / 10
        : 0,
    categories,
    countries,
  };
}

function slugifyVn(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function handleNguoncList(opts: {
  type: string;
  category: string;
  country: string;
  year: string;
  sortLang: string;
  page: number;
}) {
  const { type, category, country, year, sortLang, page } = opts;
  let endpoint = `${NGUONC_API_BASE}/films/phim-moi-cap-nhat`;

  if (category && isSafeSlug(category)) {
    endpoint = `${NGUONC_API_BASE}/films/the-loai/${category}`;
  } else if (country && isSafeSlug(country)) {
    endpoint = `${NGUONC_API_BASE}/films/quoc-gia/${country}`;
  } else if (year && /^\d{4}$/.test(year)) {
    endpoint = `${NGUONC_API_BASE}/films/nam-phat-hanh/${year}`;
  } else if (sortLang && isSafeSlug(sortLang)) {
    endpoint = `${NGUONC_API_BASE}/films/ngon-ngu/${sortLang}`;
  } else if (type === 'phim-thuyet-minh') {
    endpoint = `${NGUONC_API_BASE}/films/ngon-ngu/thuyet-minh`;
  } else if (type === 'phim-long-tieng') {
    endpoint = `${NGUONC_API_BASE}/films/ngon-ngu/long-tieng`;
  } else if (type === 'phim-vietsub') {
    endpoint = `${NGUONC_API_BASE}/films/ngon-ngu/vietsub`;
  } else if (['phim-le', 'phim-bo', 'tv-shows', 'phim-dang-chieu'].includes(type)) {
    endpoint = `${NGUONC_API_BASE}/films/danh-sach/${type}`;
  }

  // NguonC trả 10 phim/trang -> ghép 2 trang liên tiếp (20 phim/lần) để lưới poster đầy đặn chuẩn 20-24 phim!
  const p1 = (page - 1) * 2 + 1;
  const p2 = p1 + 1;
  const [r1, r2] = await Promise.allSettled([
    fetchJson(`${endpoint}?page=${p1}`),
    fetchJson(`${endpoint}?page=${p2}`),
  ]);

  if (r1.status !== 'fulfilled') {
    throw new Error((r1 as PromiseRejectedResult).reason?.message || 'NguonC API lỗi');
  }

  const raw1 = Array.isArray(r1.value?.items) ? r1.value.items : [];
  const raw2 = r2.status === 'fulfilled' && Array.isArray(r2.value?.items) ? r2.value.items : [];
  const seen = new Set<string>();
  const items: any[] = [];
  for (const it of [...raw1, ...raw2]) {
    const norm = normalizeNguoncItem(it);
    if (norm.slug && !seen.has(norm.slug)) {
      seen.add(norm.slug);
      items.push(norm);
    }
  }

  const pag = r1.value?.paginate || {};
  const rawTotalPages = Number(pag.total_page) || 1;
  return {
    source: 'nguonc',
    title: 'Kho Phim NguonC',
    page,
    totalPages: Math.max(1, Math.ceil(rawTotalPages / 2)),
    totalItems: Number(pag.total_items) || items.length,
    items,
  };
}

export async function handleNguoncSearch(keyword: string, page: number) {
  const url = `${NGUONC_API_BASE}/films/search?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  let res: any;
  try {
    res = await fetchJson(url, 12000);
  } catch {
    res = await fetchJson(url, 12000);
  }
  const rawItems = Array.isArray(res?.items) ? res.items : [];
  const items = rawItems.map(normalizeNguoncItem).filter((x: any) => x.slug);
  const pag = res?.paginate || {};
  return {
    source: 'nguonc',
    title: `Tìm kiếm NguonC: "${keyword}"`,
    keyword,
    page: Number(pag.current_page) || page,
    totalPages: Number(pag.total_page) || 1,
    totalItems: Number(pag.total_items) || items.length,
    items,
  };
}

export async function handleNguoncDetail(slug: string) {
  const res = await fetchJson(`${NGUONC_API_BASE}/film/${slug}`);
  const m = res?.movie;
  if (!m || typeof m !== 'object') {
    throw new Error('Không tìm thấy thông tin phim trên NguonC');
  }
  const baseItem = normalizeNguoncItem(m);
  const rawServers = Array.isArray(m.episodes) ? m.episodes : [];
  const servers = rawServers
    .map((srv: any) => ({
      serverName: decodeEntities(srv?.server_name) || 'Server NguonC',
      episodes: Array.isArray(srv?.items)
        ? srv.items
            .map((ep: any) => {
              const embed = typeof ep?.embed === 'string' ? ep.embed.trim() : '';
              const directM3u8 =
                (typeof ep?.m3u8 === 'string' && ep.m3u8.trim()) ||
                (embed ? streamcEmbedToHls(embed) : '');
              return {
                name: normalizeEpisodeLabel(ep?.name),
                slug: String(ep?.slug || '').trim() || slugifyVn(String(ep?.name || 'full')),
                filename: `${baseItem.name} • ${normalizeEpisodeLabel(ep?.name)}`,
                linkEmbed: embed,
                linkM3u8: directM3u8,
              };
            })
            .filter((ep: any) => ep.linkM3u8 || ep.linkEmbed)
        : [],
    }))
    .filter((srv: any) => srv.episodes.length > 0);

  const castsStr = typeof m.casts === 'string' ? m.casts : '';
  const dirStr = typeof m.director === 'string' ? m.director : '';
  return {
    ...baseItem,
    content: decodeEntities(m.description),
    status: decodeEntities(m.current_episode),
    trailerUrl: '',
    notify: '',
    showtimes: '',
    view: 0,
    actors: castsStr
      .split(',')
      .map((s) => decodeEntities(s))
      .filter((s) => s && s !== 'Đang cập nhật'),
    directors: dirStr
      .split(',')
      .map((s) => decodeEntities(s))
      .filter((s) => s && s !== 'Đang cập nhật'),
    servers,
  };
}

// =========================================================================
// 2. COBEPHIM (https://cobephim.club + public /api/v1 — Song Ngữ & Đa Server)
// =========================================================================
const COBEPHIM_HEADERS = {
  Origin: COBEPHIM_SITE_BASE,
  Referer: `${COBEPHIM_SITE_BASE}/`,
};

function decodeNextRscPayload(html: string): string {
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      parts.push(JSON.parse(`"${m[1]}"`));
    } catch {
      parts.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    }
  }
  return parts.join('\n');
}

function extractBalancedJson(text: string, openBraceIdx: number): string | null {
  if (openBraceIdx < 0 || text[openBraceIdx] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openBraceIdx; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openBraceIdx, i + 1);
      }
    }
  }
  return null;
}

function normalizeCobephimItem(raw: any) {
  // CoBePhim: thumbnail = 500x750 dọc (2:3 poster), poster = 1908x1073 ngang (16:9 backdrop)
  const posterUrl = String(raw?.thumbnail || raw?.poster || '').trim();
  const thumbUrl = String(raw?.poster || raw?.thumbnail || '').trim();
  const imdbScore = parseFloat(String(raw?.imdb_rating || '0'));
  const starScore = parseFloat(String(raw?.rating_star || '0'));
  const rating =
    Number.isFinite(imdbScore) && imdbScore > 0
      ? Math.round(imdbScore * 10) / 10
      : Number.isFinite(starScore) && starScore > 0
      ? Math.round(starScore * 10) / 10
      : 0;

  return {
    id: String(raw?.id || raw?.slug || ''),
    source: 'cobephim',
    name: decodeEntities(raw?.name),
    originName: decodeEntities(raw?.origin_name),
    slug: String(raw?.slug || '').trim(),
    type: String(raw?.type || ''),
    posterUrl,
    thumbUrl,
    year: Number(raw?.publish_year || raw?.year) || 0,
    quality: decodeEntities(raw?.quality) || 'HD',
    lang: decodeEntities(raw?.language) || (raw?.is_bilingual ? 'Song Ngữ' : 'Vietsub'),
    time: decodeEntities(raw?.episode_time),
    episodeCurrent: decodeEntities(raw?.episode_current),
    episodeTotal: raw?.episode_total ? String(raw.episode_total) : '',
    chieurap: false,
    subDocQuyen: Boolean(raw?.is_bilingual),
    rating,
    categories: Array.isArray(raw?.categories)
      ? raw.categories
          .map((c: any) => ({ name: decodeEntities(c?.name), slug: String(c?.slug || '') }))
          .filter((c: any) => c.name && c.slug)
      : [],
    countries: Array.isArray(raw?.countries)
      ? raw.countries
          .map((c: any) => ({ name: decodeEntities(c?.name), slug: String(c?.slug || '') }))
          .filter((c: any) => c.name && c.slug)
      : [],
  };
}

export async function handleCobephimMeta() {
  const menus = await fetchJson(`${COBEPHIM_API_BASE}/menus`, 10000, COBEPHIM_HEADERS);
  const genres: Array<{ name: string; slug: string }> = [];
  const countries: Array<{ name: string; slug: string }> = [];

  if (Array.isArray(menus)) {
    for (const m of menus) {
      const lbl = String(m?.label || '').toLowerCase();
      const kids = Array.isArray(m?.children) ? m.children : [];
      if (lbl.includes('thể loại')) {
        for (const k of kids) {
          const slug = String(k?.data || '').replace(/^\/the-loai\//, '').trim();
          const name = decodeEntities(k?.label);
          if (name && slug) genres.push({ name, slug });
        }
      } else if (lbl.includes('quốc gia')) {
        for (const k of kids) {
          const slug = String(k?.data || '').replace(/^\/quoc-gia\//, '').trim();
          const name = decodeEntities(k?.label);
          if (name && slug) countries.push({ name, slug });
        }
      }
    }
  }
  return { source: 'cobephim', genres, countries };
}

async function fetchCobephimSsrGrid(pageUrl: string, page: number) {
  const html = await fetchText(pageUrl, 12000);
  const rsc = decodeNextRscPayload(html);
  const items: any[] = [];
  const seen = new Set<string>();

  const marker = '{"item":{"id":';
  let pos = 0;
  while (true) {
    const idx = rsc.indexOf(marker, pos);
    if (idx < 0) break;
    const objStart = idx + '{"item":'.length;
    const jsonStr = extractBalancedJson(rsc, objStart);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        const norm = normalizeCobephimItem(parsed);
        if (norm.slug && !seen.has(norm.slug)) {
          seen.add(norm.slug);
          items.push(norm);
        }
      } catch {}
      pos = objStart + jsonStr.length;
    } else {
      pos = idx + marker.length;
    }
  }

  const tpMatch = rsc.match(/"totalPages":(\d+)/);
  const totalPages = tpMatch ? Math.max(1, parseInt(tpMatch[1], 10)) : items.length >= 20 ? page + 1 : page;
  return {
    source: 'cobephim',
    title: 'Kho Phim CoBePhim',
    page,
    totalPages,
    totalItems: totalPages * Math.max(items.length, 24),
    items,
  };
}

export async function handleCobephimList(opts: {
  type: string;
  category: string;
  country: string;
  page: number;
}) {
  const { type, category, country, page } = opts;

  if (category && isSafeSlug(category)) {
    return await fetchCobephimSsrGrid(
      `${COBEPHIM_SITE_BASE}/the-loai/${category}?page=${page}`,
      page
    );
  }
  if (country && isSafeSlug(country)) {
    return await fetchCobephimSsrGrid(
      `${COBEPHIM_SITE_BASE}/quoc-gia/${country}?page=${page}`,
      page
    );
  }
  if (type === 'phim-le') {
    return await fetchCobephimSsrGrid(`${COBEPHIM_SITE_BASE}/phim-le?page=${page}`, page);
  }
  if (type === 'phim-bo') {
    return await fetchCobephimSsrGrid(`${COBEPHIM_SITE_BASE}/phim-bo?page=${page}`, page);
  }

  // Các tab tuyển chọn (Hot & Song Ngữ / Song Ngữ / Trung Quốc mới / Âu Mỹ mới / Điện ảnh mới) dùng public JSON API siêu nhanh!
  const [hotRes, listsRes] = await Promise.allSettled([
    page === 1
      ? fetchJson(`${COBEPHIM_API_BASE}/movies/hot`, 10000, COBEPHIM_HEADERS)
      : Promise.resolve({ result: [] }),
    fetchJson(`${COBEPHIM_API_BASE}/lists/homepageLists?page=1`, 10000, COBEPHIM_HEADERS),
  ]);

  const hotMovies =
    hotRes.status === 'fulfilled' && Array.isArray(hotRes.value?.result)
      ? hotRes.value.result
      : [];
  const collections =
    listsRes.status === 'fulfilled' && Array.isArray(listsRes.value?.result?.collections)
      ? listsRes.value.result.collections
      : [];

  const findCol = (slugPart: string) =>
    collections.find((c: any) => String(c?.slug || '').includes(slugPart))?.movies || [];

  let chosen: any[] = [];
  if (type === 'song-ngu') {
    chosen = findCol('song-ngu');
  } else if (type === 'trung-quoc') {
    chosen = findCol('trung-quoc');
  } else if (type === 'au-my') {
    chosen = findCol('us-uk');
  } else if (type === 'dien-anh') {
    chosen = findCol('dien-anh');
  } else {
    // moi-cap-nhat: gộp Hot + Điện ảnh mới + Song Ngữ + Trung Quốc + Âu Mỹ!
    chosen = [...hotMovies, ...collections.flatMap((c: any) => c?.movies || [])];
  }

  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const m of chosen) {
    const norm = normalizeCobephimItem(m);
    if (norm.slug && !seen.has(norm.slug)) {
      seen.add(norm.slug);
      deduped.push(norm);
    }
  }

  const perPage = 24;
  const totalPages = Math.max(1, Math.ceil(deduped.length / perPage));
  const start = (page - 1) * perPage;
  return {
    source: 'cobephim',
    title: 'Kho Phim CoBePhim',
    page,
    totalPages,
    totalItems: deduped.length,
    items: deduped.slice(start, start + perPage),
  };
}

export async function handleCobephimSearch(keyword: string) {
  const res = await fetchJson(
    `${COBEPHIM_API_BASE}/movies/search?keyword=${encodeURIComponent(keyword)}`,
    10000,
    COBEPHIM_HEADERS
  );
  const raw = Array.isArray(res?.result) ? res.result : [];
  const items = raw.map(normalizeCobephimItem).filter((x: any) => x.slug);
  return {
    source: 'cobephim',
    title: `Tìm kiếm CoBePhim: "${keyword}"`,
    keyword,
    page: 1,
    totalPages: 1,
    totalItems: items.length,
    items,
  };
}

function classifyCobephimLink(rawType: string, rawLink: string): {
  linkM3u8: string;
  linkEmbed: string;
  isEncrypted4k: boolean;
} {
  const link = (rawLink || '').trim();
  const type = (rawType || '').toLowerCase();
  if (!link) return { linkM3u8: '', linkEmbed: '', isEncrypted4k: false };

  // Các luồng /phim4k/.../aes-... trên CoBePhim dùng khóa mã hóa riêng %%CHOPHIM_KEY%%
  if (link.includes('/phim4k/') && link.includes('/aes-')) {
    return { linkM3u8: '', linkEmbed: '', isEncrypted4k: true };
  }
  if (type === 'm3u8' || /\.m3u8(\?|$)/i.test(link)) {
    return { linkM3u8: link, linkEmbed: '', isEncrypted4k: false };
  }
  const ncHls = streamcEmbedToHls(link);
  if (ncHls) {
    return { linkM3u8: ncHls, linkEmbed: link, isEncrypted4k: false };
  }
  return { linkM3u8: '', linkEmbed: link, isEncrypted4k: false };
}

function cobephimServerPriority(name: string): number {
  const low = name.toLowerCase();
  if (low.includes('4k')) return 50; // 4K thường dùng %%CHOPHIM_KEY%% nên xếp sau các server mở
  if (low.includes('(kk)')) return 1;
  if (low.includes('song ngữ')) return 2;
  if (low.includes('(vs)')) return 3;
  if (low.includes('(nc)')) return 4;
  if (low.includes('thuyết minh')) return 5;
  return 10;
}

export async function handleCobephimDetail(slug: string) {
  const html = await fetchText(`${COBEPHIM_SITE_BASE}/phim/${slug}/tap-latest`, 12000);
  const rsc = decodeNextRscPayload(html);

  // 1) Tách object "movie":{...} đầy đủ từ RSC
  const movieMarker = '{"movie":{"id":';
  const mIdx = rsc.indexOf(movieMarker);
  let movieObj: any = null;
  if (mIdx >= 0) {
    const jsonStr = extractBalancedJson(rsc, mIdx + '{"movie":'.length);
    if (jsonStr) {
      try {
        movieObj = JSON.parse(jsonStr);
      } catch {}
    }
  }
  if (!movieObj) {
    throw new Error('Không tìm thấy thông tin phim trên CoBePhim');
  }

  // 2) Tách tập đang phát sẵn trên trang (đỡ tốn thêm 1 request cho tập đầu!)
  let loadedEp: any = null;
  const epIdx = rsc.indexOf('{"episode":{"id":');
  if (epIdx >= 0) {
    const jsonStr = extractBalancedJson(rsc, epIdx + '{"episode":'.length);
    if (jsonStr) {
      try {
        loadedEp = JSON.parse(jsonStr);
      } catch {}
    }
  }

  // 3) Tải danh sách đầy đủ tất cả tập & server từ public /episodes/by-idMovie/{id}
  let allEps: any[] = [];
  if (movieObj.id) {
    try {
      const epsRes = await fetchJson(
        `${COBEPHIM_API_BASE}/episodes/by-idMovie/${movieObj.id}`,
        10000,
        COBEPHIM_HEADERS
      );
      if (Array.isArray(epsRes)) allEps = epsRes;
    } catch {}
  }

  const baseItem = normalizeCobephimItem(movieObj);
  const byServer = new Map<string, any[]>();
  for (const ep of allEps) {
    const srvName = decodeEntities(ep?.server) || 'Server 1';
    const list = byServer.get(srvName) || [];
    list.push(ep);
    byServer.set(srvName, list);
  }

  const sortedServerNames = Array.from(byServer.keys()).sort(
    (a, b) => cobephimServerPriority(a) - cobephimServerPriority(b)
  );

  const servers = sortedServerNames.map((srvName) => {
    const rawList = (byServer.get(srvName) || []).sort(
      (a, b) => naturalEpNumber(String(a?.name || '')) - naturalEpNumber(String(b?.name || ''))
    );
    return {
      serverName: srvName,
      episodes: rawList.map((ep: any) => {
        const epId = String(ep?.id || '');
        const label = normalizeEpisodeLabel(ep?.name);
        if (loadedEp && String(loadedEp.id) === epId && loadedEp.link) {
          const classified = classifyCobephimLink(loadedEp.type, loadedEp.link);
          if (classified.linkM3u8 || classified.linkEmbed) {
            return {
              name: label,
              slug: `${ep.slug || 'ep'}-${epId}`,
              filename: `${baseItem.name} • ${label} (${srvName})`,
              linkM3u8: classified.linkM3u8,
              linkEmbed: classified.linkEmbed,
            };
          }
        }
        return {
          name: label,
          slug: `${ep.slug || 'ep'}-${epId}`,
          filename: `${baseItem.name} • ${label} (${srvName})`,
          linkM3u8: '',
          linkEmbed: `cobephim-ep://${slug}/${epId}`,
        };
      }),
    };
  });

  // Nếu API episodes rỗng nhưng trang SSR vẫn có tập hiện tại -> tạo server trực tiếp
  if (servers.length === 0 && loadedEp?.link) {
    const classified = classifyCobephimLink(loadedEp.type, loadedEp.link);
    if (classified.linkM3u8 || classified.linkEmbed) {
      servers.push({
        serverName: decodeEntities(loadedEp.server) || 'CoBePhim',
        episodes: [
          {
            name: normalizeEpisodeLabel(loadedEp.name),
            slug: String(loadedEp.slug || 'full'),
            filename: `${baseItem.name} • ${normalizeEpisodeLabel(loadedEp.name)}`,
            linkM3u8: classified.linkM3u8,
            linkEmbed: classified.linkEmbed,
          },
        ],
      });
    }
  }

  return {
    ...baseItem,
    content: decodeEntities(movieObj.description),
    status: decodeEntities(movieObj.status),
    trailerUrl: typeof movieObj.trailer_url === 'string' ? movieObj.trailer_url.trim() : '',
    notify: decodeEntities(movieObj.notify),
    showtimes: decodeEntities(movieObj.showtime),
    view: Number(movieObj.view_total) || 0,
    actors: Array.isArray(movieObj.actors)
      ? movieObj.actors.map((a: any) => decodeEntities(a?.name)).filter(Boolean)
      : [],
    directors: Array.isArray(movieObj.directors)
      ? movieObj.directors
          .map((d: any) => decodeEntities(d?.name))
          .filter((d: string) => d && d !== 'Đang cập nhật')
      : [],
    servers,
  };
}

export async function handleResolveCobephim(slug: string, epId: string) {
  if (!isSafeSlug(slug) || !/^\d{1,12}$/.test(epId)) {
    throw new Error('Tham số tập phim CoBePhim không hợp lệ');
  }
  const html = await fetchText(`${COBEPHIM_SITE_BASE}/phim/${slug}/tap-${epId}`, 12000);
  const rsc = decodeNextRscPayload(html);
  const epIdx = rsc.indexOf('{"episode":{"id":');
  if (epIdx < 0) {
    throw new Error('Không tìm thấy luồng phát cho tập phim này');
  }
  const jsonStr = extractBalancedJson(rsc, epIdx + '{"episode":'.length);
  if (!jsonStr) {
    throw new Error('Không phân tích được dữ liệu tập phim');
  }
  const ep = JSON.parse(jsonStr);
  const classified = classifyCobephimLink(ep?.type, ep?.link);
  return {
    ...classified,
    server: decodeEntities(ep?.server),
  };
}

// =========================================================================
// 3. K20 (https://sc.k-20.xyz — Phim 4K, CLB Phim Xưa MP4, Thể Thao Live, Direct HLS cho IMDb!)
// =========================================================================
function encodeK20Slug(stremioType: string, stremioId: string): string {
  // Chuyển 'vsmov:tan-the-z' -> 'movie--vsmov--tan-the-z' (an toàn cho URL & isSafeSlug)
  const cleanType = ['movie', 'series', 'tv'].includes(stremioType) ? stremioType : 'movie';
  const encodedId = stremioId.replace(/:/g, '--');
  return `${cleanType}--${encodedId}`;
}

function decodeK20Slug(slug: string): { stremioType: 'movie' | 'series' | 'tv'; stremioId: string } | null {
  const m = slug.match(/^(movie|series|tv)--(.+)$/i);
  if (!m) return null;
  const stremioType = m[1].toLowerCase() as 'movie' | 'series' | 'tv';
  const stremioId = m[2].replace(/--/g, ':');
  if (!/^[a-z0-9:._-]+$/i.test(stremioId)) return null;
  return { stremioType, stremioId };
}

function normalizeK20MetaItem(m: any, fallbackType = 'movie', badgeQuality = 'HD') {
  const id = String(m?.id || '').trim();
  const type = String(m?.type || fallbackType);
  const yearMatch = String(m?.releaseInfo || '').match(/\d{4}/);
  const isSports = id.startsWith('sports:') || type === 'tv';
  const is4k = badgeQuality === '4K';
  const isClbpx = id.startsWith('clbpx:');

  return {
    id,
    source: 'k20',
    name: decodeEntities(m?.name),
    originName: decodeEntities(m?.description)?.slice(0, 90) || '',
    slug: encodeK20Slug(type, id),
    type,
    posterUrl: String(m?.poster || m?.background || '').trim(),
    thumbUrl: String(m?.background || m?.poster || '').trim(),
    year: yearMatch ? Number(yearMatch[0]) : 0,
    quality: isSports ? 'LIVE' : is4k ? '4K' : isClbpx ? '720p' : 'HD',
    lang: isSports ? 'Trực Tiếp' : isClbpx ? 'Lồng Tiếng' : 'Vietsub/TM',
    time: '',
    episodeCurrent: isSports ? '🔴 Đang phát' : is4k ? '4K UHD' : isClbpx ? 'Phim Xưa' : 'HD',
    episodeTotal: '',
    chieurap: is4k,
    subDocQuyen: false,
    rating: 0,
    categories: [],
    countries: [],
  };
}

export async function handleK20List(opts: { type: string; page: number; limit: number }) {
  const { type, page, limit } = opts;
  const skip = (page - 1) * limit;
  const skipSeg = skip > 0 ? `/skip=${skip}` : '';

  let url = `${K20_BASE}/catalog/movie/vsmov-4k${skipSeg}.json`;
  let fallbackType = 'movie';
  let badgeQuality = '4K';

  if (type === 'phim-xua') {
    url = `${K20_BASE}/catalog/movie/clbpx-movie${skipSeg}.json`;
    fallbackType = 'movie';
    badgeQuality = '720p';
  } else if (type === 'the-thao') {
    url = `${K20_BASE}/catalog/tv/sports-live/genre=${encodeURIComponent('Thể loại: Tất Cả Thể Thao')}.json`;
    fallbackType = 'tv';
    badgeQuality = 'LIVE';
  } else if (type === 'phim-le') {
    url = `${K20_BASE}/catalog/movie/nguonc-movie${skipSeg}.json`;
    fallbackType = 'movie';
    badgeQuality = 'HD';
  } else if (type === 'phim-bo') {
    url = `${K20_BASE}/catalog/series/nguonc-series${skipSeg}.json`;
    fallbackType = 'series';
    badgeQuality = 'HD';
  }

  const res = await fetchJson(url, 12000);
  const raw = Array.isArray(res?.metas) ? res.metas : [];
  const items = raw
    .slice(0, limit)
    .map((m: any) => normalizeK20MetaItem(m, fallbackType, badgeQuality))
    .filter((x: any) => x.id);

  const hasMore = type !== 'the-thao' && raw.length >= Math.min(limit, 18);
  return {
    source: 'k20',
    title: 'Kho K20 (4K • Phim Xưa • Thể Thao Live)',
    page,
    totalPages: hasMore ? Math.max(page + 1, 15) : page,
    totalItems: hasMore ? Math.max(page + 1, 15) * limit : skip + items.length,
    items,
  };
}

export async function handleK20Search(keyword: string) {
  const q = encodeURIComponent(keyword);
  const [r4k, rClb, rNcM, rNcS] = await Promise.allSettled([
    fetchJson(`${K20_BASE}/catalog/movie/vsmov-4k/search=${q}.json`, 10000),
    fetchJson(`${K20_BASE}/catalog/movie/clbpx-movie/search=${q}.json`, 10000),
    fetchJson(`${K20_BASE}/catalog/movie/nguonc-movie/search=${q}.json`, 10000),
    fetchJson(`${K20_BASE}/catalog/series/nguonc-series/search=${q}.json`, 10000),
  ]);

  const buckets = [
    { res: r4k, type: 'movie', q: '4K' },
    { res: rClb, type: 'movie', q: '720p' },
    { res: rNcM, type: 'movie', q: 'HD' },
    { res: rNcS, type: 'series', q: 'HD' },
  ];

  const seen = new Set<string>();
  const items: any[] = [];
  for (const b of buckets) {
    if (b.res.status !== 'fulfilled' || !Array.isArray(b.res.value?.metas)) continue;
    for (const m of b.res.value.metas) {
      const norm = normalizeK20MetaItem(m, b.type, b.q);
      if (norm.slug && !seen.has(norm.slug)) {
        seen.add(norm.slug);
        items.push(norm);
      }
    }
  }

  return {
    source: 'k20',
    title: `Tìm kiếm K20: "${keyword}"`,
    keyword,
    page: 1,
    totalPages: 1,
    totalItems: items.length,
    items: items.slice(0, 36),
  };
}

function normalizeK20StreamList(rawStreams: any[]) {
  const streams = (Array.isArray(rawStreams) ? rawStreams : [])
    .map((s: any) => {
      const url = typeof s?.url === 'string' ? s.url.trim() : '';
      if (!url || !/^https?:\/\//i.test(url)) return null;
      const firstLine = decodeEntities(String(s?.title || '').split('\n')[0]);
      const srcName = decodeEntities(s?.name || '');
      const label = firstLine || srcName || 'K20 Stream';
      const isMp4 = /\.(mp4|m4v|webm)(\?|$)/i.test(url) || /\/hx-mp4\b/i.test(url);
      const subtitles = extractK20SubtitlesFromUrl(url);
      return { label, url, isMp4, subtitles };
    })
    .filter(Boolean) as Array<{
    label: string;
    url: string;
    isMp4: boolean;
    subtitles: Array<{ label: string; lang: string; url: string }>;
  }>;

  // Ưu tiên 4K > Thuyết minh > Lồng tiếng > 720p > Vietsub > 360p
  const rank = (lbl: string): number => {
    const low = lbl.toLowerCase();
    if (low.includes('4k')) return 1;
    if (low.includes('thuyết minh') || low.includes('lồng tiếng')) return 2;
    if (low.includes('1080') || low.includes('720')) return 3;
    if (low.includes('vietsub')) return 4;
    if (low.includes('360')) return 9;
    return 5;
  };
  streams.sort((a, b) => rank(a.label) - rank(b.label));
  return streams;
}

export async function handleResolveK20(mediaType: string, rawId: string) {
  const cleanType = ['movie', 'series', 'tv'].includes(mediaType) ? mediaType : 'movie';
  if (!rawId || !/^[a-z0-9:._-]+$/i.test(rawId) || rawId.length > 200) {
    throw new Error('ID luồng K20 không hợp lệ');
  }
  const res = await fetchJson(
    `${K20_BASE}/stream/${cleanType}/${encodeURIComponent(rawId)}.json`,
    14000
  );
  const streams = normalizeK20StreamList(res?.streams || []);
  return { streams };
}

// Dùng cho nguồn VidSrc/Quốc tế: tự bóc luồng 4K / Thuyết minh / Vietsub Direct HLS từ K20 theo IMDb ID (0% popup!)
export async function fetchK20DirectStreamsForImdb(
  kind: 'movie' | 'series',
  imdbId: string
): Promise<Array<{ label: string; url: string; isMp4: boolean; subtitles: any[] }>> {
  try {
    const res = await fetchJson(
      `${K20_BASE}/stream/${kind}/${encodeURIComponent(imdbId)}.json`,
      3800
    );
    return normalizeK20StreamList(res?.streams || []);
  } catch {
    return [];
  }
}

export async function handleK20Detail(slug: string) {
  const parsed = decodeK20Slug(slug);
  if (!parsed) {
    throw new Error('Slug K20 không hợp lệ');
  }
  const { stremioType, stremioId } = parsed;
  const isSports = stremioId.startsWith('sports:') || stremioType === 'tv';

  // 1) Kênh Thể Thao Live (Xôi Lạc, Cà Khịa, SoCoLive, Vebo, 90 Phút...)
  if (isSports) {
    const [metaRes, streamRes] = await Promise.allSettled([
      fetchJson(`${K20_BASE}/meta/tv/${encodeURIComponent(stremioId)}.json`, 12000),
      fetchJson(`${K20_BASE}/stream/tv/${encodeURIComponent(stremioId)}.json`, 16000),
    ]);
    const meta = metaRes.status === 'fulfilled' ? metaRes.value?.meta || {} : {};
    const streams =
      streamRes.status === 'fulfilled'
        ? normalizeK20StreamList(streamRes.value?.streams || [])
        : [];
    const baseItem = normalizeK20MetaItem({ ...meta, id: stremioId, type: 'tv' }, 'tv', 'LIVE');
    const episodes = streams.map((st, idx) => ({
      name: st.label.length > 36 ? st.label.slice(0, 35) + '…' : st.label,
      slug: `live-${idx + 1}`,
      filename: st.label,
      linkM3u8: st.url,
      linkEmbed: '',
    }));

    return {
      ...baseItem,
      episodeCurrent: `${episodes.length} trận/kênh đang phát`,
      episodeTotal: `${episodes.length} luồng`,
      content:
        decodeEntities(meta?.description) ||
        'Trực tiếp bóng đá & thể thao HD từ cụm K20 Sports (phát thẳng HLS, không quảng cáo popup).',
      status: 'LIVE',
      trailerUrl: '',
      notify: '',
      showtimes: '',
      view: 0,
      actors: [],
      directors: [],
      servers:
        episodes.length > 0
          ? [{ serverName: '🔴 Trực Tiếp HD (K20 Sports)', episodes }]
          : [],
    };
  }

  // 2) Phim 4K / CLB Phim Xưa / Phim K20
  const metaRes = await fetchJson(
    `${K20_BASE}/meta/${stremioType}/${encodeURIComponent(stremioId)}.json`,
    10000
  );
  const meta = metaRes?.meta;
  if (!meta) {
    throw new Error('Không tìm thấy thông tin phim trên K20');
  }
  const is4kHint = stremioId.startsWith('vsmov:') ? '4K' : stremioId.startsWith('clbpx:') ? '720p' : 'HD';
  const baseItem = normalizeK20MetaItem(meta, stremioType, is4kHint);
  const videos = Array.isArray(meta.videos) ? meta.videos : [];

  const servers: Array<{ serverName: string; episodes: any[] }> = [];

  if (videos.length > 0) {
    // Phim nhiều tập (vd CLB Phim Xưa 35 tập, phim bộ NguonC/VSMov)
    const epType = meta.type === 'series' || stremioType === 'series' ? 'series' : 'movie';
    const sortedVids = [...videos].sort(
      (a, b) => (Number(a?.episode) || 0) - (Number(b?.episode) || 0)
    );
    servers.push({
      serverName: stremioId.startsWith('clbpx:')
        ? '📼 CLB Phim Xưa (720p MP4)'
        : '⚡ K20 Direct HLS',
      episodes: sortedVids.map((v: any, idx: number) => {
        const label = decodeEntities(v?.title || v?.name) || `Tập ${v?.episode || idx + 1}`;
        const vidId = String(v?.id || '');
        return {
          name: label,
          slug: `ep-${idx + 1}`,
          filename: `${baseItem.name} • ${label}`,
          linkM3u8: `k20-ep://${epType}/${vidId}`,
          linkEmbed: '',
        };
      }),
    });
  } else {
    // Phim lẻ (vd VSMov 4K): lấy luôn tất cả luồng trực tiếp ngay!
    const streamRes = await fetchJson(
      `${K20_BASE}/stream/${stremioType}/${encodeURIComponent(stremioId)}.json`,
      10000
    );
    const streams = normalizeK20StreamList(streamRes?.streams || []);
    for (const st of streams) {
      servers.push({
        serverName: st.label,
        episodes: [
          {
            name: st.label.includes('4K') ? 'Full 4K' : 'Full HD',
            slug: slugifyVn(st.label) || 'full',
            filename: `${baseItem.name} • ${st.label}`,
            linkM3u8: st.url,
            linkEmbed: '',
          },
        ],
      });
    }
  }

  return {
    ...baseItem,
    content: decodeEntities(meta.description) || 'Phát trực tiếp chuẩn HLS/MP4 từ cụm K20.',
    status: decodeEntities(meta.releaseInfo),
    trailerUrl: '',
    notify: '',
    showtimes: '',
    view: 0,
    actors: Array.isArray(meta.cast) ? meta.cast.map(decodeEntities).filter(Boolean) : [],
    directors: Array.isArray(meta.director) ? meta.director.map(decodeEntities).filter(Boolean) : [],
    servers,
  };
}
