// Cloudflare Pages Function: /api/news
// Engine Đọc Báo & Báo Audio từ BaoMoi.com (giả lập thiết bị di động iPhone Safari để lấy full file .m4a 4 giọng đọc AI!):
// - GET action=feed        : Lấy danh sách bài báo theo chuyên mục (hot, audio, tin-moi, xa-hoi, kinh-te, xe-co, ...) hoặc tìm kiếm (?q=...)
// - GET action=article     : Lấy chi tiết bài báo + mảng voices (.m4a Nam/Nữ Bắc/Nam) + nội dung sạch không quảng cáo
// - GET action=audio-proxy : Proxy dự phòng hỗ trợ HTTP Range cho file .m4a trên bmcdn.me nếu trình duyệt/WebView bị chặn redirect

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CATEGORY_PATH_MAP: Record<string, { path: string; paginated: boolean }> = {
  hot: { path: '/', paginated: true },
  audio: { path: '/audio.epi', paginated: false },
  'tin-moi': { path: '/tin-moi.epi', paginated: true },
  'xa-hoi': { path: '/xa-hoi.epi', paginated: true },
  'kinh-te': { path: '/kinh-te.epi', paginated: true },
  'xe-co': { path: '/xe-co.epi', paginated: true },
  'the-gioi': { path: '/the-gioi.epi', paginated: true },
  'cong-nghe': { path: '/khoa-hoc-cong-nghe.epi', paginated: true },
  'the-thao': { path: '/the-thao.epi', paginated: true },
  'phap-luat': { path: '/phap-luat.epi', paginated: true },
  'giai-tri': { path: '/giai-tri.epi', paginated: true },
  'doi-song': { path: '/doi-song.epi', paginated: true },
};

interface NormalizedFeedItem {
  id: string;
  title: string;
  description: string;
  url: string;
  thumb: string;
  date: number;
  publisherName: string;
  publisherIcon: string;
  isAudioPost: boolean;
  durationText?: string;
  sectionTitle?: string;
}

interface NormalizedVoice {
  id: number;
  name: string;
  streamingUrl: string;
}

interface NormalizedBodyBlock {
  type: 'text' | 'image';
  text?: string;
  url?: string;
  isCaption?: boolean;
  isAuthor?: boolean;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&hellip;/gi, '...')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = parseInt(num, 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
}

function stripHtml(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return decodeHtmlEntities(
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeThumb(raw: unknown, rawLarge?: unknown): string {
  const candidate =
    (typeof rawLarge === 'string' && rawLarge.trim()) ||
    (typeof raw === 'string' && raw.trim()) ||
    '';
  if (!candidate) return '';
  // Upgrade small w250 thumbnails to sharper w400 when hosted on bmcdn
  return candidate.replace('/w250_', '/w400_');
}

function extractNextData(html: string): any | null {
  const match = html.match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function fetchBaoMoiPage(path: string, timeoutMs = 10000): Promise<any> {
  const targetUrl = `https://baomoi.com${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.6',
        Referer: 'https://baomoi.com/',
      },
    });
    if (!res.ok) {
      throw new Error(`BaoMoi HTTP ${res.status}`);
    }
    const html = await res.text();
    const nextData = extractNextData(html);
    if (!nextData) {
      throw new Error('Không phân tích được dữ liệu __NEXT_DATA__ từ Báo Mới');
    }
    return nextData;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFeedItem(raw: any, sectionTitle?: string): NormalizedFeedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  const rawTitle = stripHtml(raw.title);
  if (!rawUrl || !rawTitle) return null;

  // Chỉ nhận bài báo (-c<id>.epi) hoặc bản tin Audio (-a<id>.epi)
  const isAudioPost = /-a\d+\.epi$/i.test(rawUrl);
  const isArticlePost = /-c\d+\.epi$/i.test(rawUrl);
  if (!isAudioPost && !isArticlePost) return null;

  const id = String(raw.id || raw.contentId || rawUrl);
  const pub = raw.publisher && typeof raw.publisher === 'object' ? raw.publisher : {};
  const publisherName =
    stripHtml(pub.shortName || pub.name) || 'Báo Mới';
  const publisherIcon =
    (typeof pub.icon === 'string' && pub.icon) ||
    (typeof pub.logo === 'string' && pub.logo) ||
    '';

  return {
    id,
    title: rawTitle,
    description: stripHtml(raw.description),
    url: rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`,
    thumb: normalizeThumb(raw.thumb, raw.thumbL),
    date: typeof raw.date === 'number' ? raw.date : Math.floor(Date.now() / 1000),
    publisherName,
    publisherIcon,
    isAudioPost,
    durationText: typeof raw.duration === 'string' ? raw.duration : undefined,
    sectionTitle: sectionTitle || undefined,
  };
}

function isSafeBaoMoiArticlePath(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  if (!raw.startsWith('/') || raw.startsWith('//')) return false;
  if (raw.includes('..') || raw.includes('\\') || raw.includes('?') || raw.includes('#')) {
    return false;
  }
  return /^\/[a-zA-Z0-9_%-]+\.epi$/i.test(raw);
}

function isAllowedAudioHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h.endsWith('.bmcdn.me') || h.endsWith('.baomoi.com') || h === 'baomoi.com';
  } catch {
    return false;
  }
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }

  const reqUrl = new URL(request.url);
  const action = (reqUrl.searchParams.get('action') || 'feed').toLowerCase();

  // =========================================================================
  // 1. ACTION = FEED (Danh sách tin tức theo chuyên mục hoặc Tìm kiếm)
  // =========================================================================
  if (action === 'feed') {
    const cat = (reqUrl.searchParams.get('cat') || 'hot').toLowerCase();
    const query = (reqUrl.searchParams.get('q') || '').trim();
    const pageRaw = parseInt(reqUrl.searchParams.get('page') || '1', 10);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 && pageRaw <= 8 ? pageRaw : 1;

    let targetPath = '/';
    let supportsPagination = true;

    if (query) {
      targetPath = `/tim-kiem/${encodeURIComponent(query)}.epi`;
      supportsPagination = false;
    } else {
      const cfg = CATEGORY_PATH_MAP[cat] || CATEGORY_PATH_MAP.hot;
      supportsPagination = cfg.paginated;
      if (page > 1 && cfg.paginated) {
        if (cfg.path === '/') {
          targetPath = `/trang${page}.epi`;
        } else {
          const base = cfg.path.replace(/\.epi$/i, '');
          targetPath = `${base}/trang${page}.epi`;
        }
      } else {
        targetPath = cfg.path;
      }
    }

    try {
      const nextData = await fetchBaoMoiPage(targetPath);
      const data = nextData?.props?.pageProps?.resp?.data;
      const content = data?.content || {};

      const seen = new Set<string>();
      const items: NormalizedFeedItem[] = [];

      const pushRaw = (raw: any, secTitle?: string) => {
        const normalized = normalizeFeedItem(raw, secTitle);
        if (!normalized || seen.has(normalized.id)) return;
        seen.add(normalized.id);
        items.push(normalized);
      };

      if (Array.isArray(content.sections)) {
        for (const sec of content.sections) {
          if (!sec || typeof sec !== 'object') continue;
          if (sec.type === 'adBanner' || sec.type === 'adNative') continue;
          const secTitle = typeof sec.title === 'string' ? sec.title.trim() : '';
          if (Array.isArray(sec.items)) {
            for (const it of sec.items) {
              pushRaw(it, secTitle);
            }
          }
        }
      }

      if (Array.isArray(content.items)) {
        for (const it of content.items) {
          pushRaw(it);
        }
      }

      const payload = {
        cat: query ? 'search' : cat,
        query: query || undefined,
        page,
        hasMore: supportsPagination && items.length >= 15 && page < 5,
        total: items.length,
        items,
      };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          'Cache-Control': 'public, max-age=120, s-maxage=120',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: err?.message || 'Không thể tải danh sách tin từ Báo Mới',
          items: [],
          hasMore: false,
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 2. ACTION = ARTICLE (Chi tiết bài báo + danh sách file Audio .m4a 4 giọng đọc)
  // =========================================================================
  if (action === 'article') {
    const rawPath = (reqUrl.searchParams.get('url') || '').trim();
    if (!isSafeBaoMoiArticlePath(rawPath)) {
      return new Response(
        JSON.stringify({ error: 'Đường dẫn bài báo không hợp lệ' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    try {
      const nextData = await fetchBaoMoiPage(rawPath);
      const data = nextData?.props?.pageProps?.resp?.data;
      const content = data?.content;

      if (!content || typeof content !== 'object') {
        throw new Error('Bài báo không có dữ liệu nội dung');
      }

      // 1) Thu thập toàn bộ luồng Audio .m4a (Bài thường: content.speechs | Bản tin Audio: content.streamingUrl)
      const voices: NormalizedVoice[] = [];
      const seenVoiceUrl = new Set<string>();

      if (Array.isArray(content.speechs)) {
        for (const sp of content.speechs) {
          const url = typeof sp?.streamingUrl === 'string' ? sp.streamingUrl.trim() : '';
          if (!url || seenVoiceUrl.has(url)) continue;
          seenVoiceUrl.add(url);
          voices.push({
            id: typeof sp.id === 'number' ? sp.id : voices.length + 1,
            name: stripHtml(sp.name) || `Giọng đọc ${voices.length + 1}`,
            streamingUrl: url,
          });
        }
      }

      if (
        voices.length === 0 &&
        typeof content.streamingUrl === 'string' &&
        content.streamingUrl.trim()
      ) {
        voices.push({
          id: 0,
          name: 'Bản tin Audio',
          streamingUrl: content.streamingUrl.trim(),
        });
      }

      // 2) Lọc & chuẩn hóa nội dung đọc báo sạch (loại bỏ quảng cáo adBanner)
      const blocks: NormalizedBodyBlock[] = [];
      const speechParagraphs: string[] = [];

      const title = stripHtml(content.title);
      const description = stripHtml(content.description);
      if (title) speechParagraphs.push(title);
      if (description) speechParagraphs.push(description);

      if (Array.isArray(content.bodys)) {
        for (const b of content.bodys) {
          if (!b || typeof b !== 'object') continue;
          if (b.type === 'text') {
            const text = stripHtml(b.content);
            if (!text) continue;
            const isCaption = b.subType === 'media-caption';
            const isAuthor = b.subType === 'body-author';
            blocks.push({ type: 'text', text, isCaption, isAuthor });
            if (!isCaption && !isAuthor) {
              speechParagraphs.push(text);
            }
          } else if (b.type === 'image') {
            const imgUrl =
              (typeof b.contentOrigin === 'string' && b.contentOrigin.trim()) ||
              (typeof b.content === 'string' && b.content.trim()) ||
              '';
            if (imgUrl) {
              blocks.push({ type: 'image', url: imgUrl });
            }
          }
        }
      }

      const pub = content.publisher && typeof content.publisher === 'object' ? content.publisher : {};
      const catObj = content.category && typeof content.category === 'object' ? content.category : {};

      const articlePayload = {
        id: String(content.id || content.contentId || rawPath),
        title,
        description,
        url: rawPath,
        originalUrl: typeof content.originalUrl === 'string' ? content.originalUrl : undefined,
        thumb: normalizeThumb(content.thumb, content.thumbL),
        date:
          typeof content.date === 'number'
            ? content.date
            : typeof content.publishedDate === 'number'
            ? content.publishedDate
            : Math.floor(Date.now() / 1000),
        categoryName: stripHtml(catObj.name) || undefined,
        publisherName: stripHtml(pub.shortName || pub.name) || 'Báo Mới',
        publisherIcon:
          (typeof pub.icon === 'string' && pub.icon) ||
          (typeof pub.logo === 'string' && pub.logo) ||
          '',
        durationText: typeof content.duration === 'string' ? content.duration : undefined,
        voices,
        blocks,
        plainText: speechParagraphs.join('. '),
      };

      return new Response(JSON.stringify(articlePayload), {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          // Token authen trên bmcdn.me sống ~48h -> cache 10 phút hoàn toàn an toàn & cực nhanh!
          'Cache-Control': 'public, max-age=600, s-maxage=600',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: err?.message || 'Không thể tải chi tiết bài báo từ Báo Mới',
        }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  // =========================================================================
  // 3. ACTION = AUDIO-PROXY (Dự phòng streaming HTTP Range cho file .m4a từ bmcdn.me)
  // =========================================================================
  if (action === 'audio-proxy') {
    const target = (reqUrl.searchParams.get('url') || '').trim();
    if (!isAllowedAudioHost(target)) {
      return new Response(
        JSON.stringify({ error: 'Nguồn audio không nằm trong danh sách cho phép' }),
        { status: 403, headers: JSON_HEADERS }
      );
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        'User-Agent': MOBILE_UA,
        Referer: 'https://baomoi.com/',
      };
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        upstreamHeaders.Range = rangeHeader;
      }

      const upstream = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        headers: upstreamHeaders,
      });

      const outHeaders = new Headers();
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Accept-Ranges', 'bytes');
      outHeaders.set(
        'Content-Type',
        upstream.headers.get('Content-Type') || 'audio/mp4'
      );
      const cl = upstream.headers.get('Content-Length');
      if (cl) outHeaders.set('Content-Length', cl);
      const cr = upstream.headers.get('Content-Range');
      if (cr) outHeaders.set('Content-Range', cr);
      outHeaders.set('Cache-Control', 'public, max-age=3600');

      return new Response(upstream.body, {
        status: upstream.status,
        headers: outHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Không thể proxy luồng audio' }),
        { status: 502, headers: JSON_HEADERS }
      );
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: JSON_HEADERS,
  });
};
