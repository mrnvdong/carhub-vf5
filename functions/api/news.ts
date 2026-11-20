// Cloudflare Pages Function: /api/news
// Engine Đọc Báo & Báo Audio từ BaoMoi.com (giả lập thiết bị di động iPhone Safari để lấy full file .m4a 4 giọng đọc AI!):
// - GET action=feed        : Lấy danh sách bài báo theo chuyên mục (hot, audio, tin-moi, xa-hoi, kinh-te, xe-co, ...) hoặc tìm kiếm (?q=...)
// - GET action=article     : Lấy chi tiết bài báo + mảng voices (.m4a Nam/Nữ Bắc/Nam) + nội dung sạch không quảng cáo
// - GET action=audio-proxy : Proxy dự phòng hỗ trợ HTTP Range cho file .m4a trên bmcdn.me nếu trình duyệt/WebView bị chặn redirect

import { getTrustedCorsOrigin, isTrustedAppRequest } from '../_lib/security';

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

interface NewsEnv {
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  FPT_TTS_API_KEY?: string;
  VIENEU_API_URL?: string;
  VIENEU_API_KEY?: string;
}

interface TtsVoiceOption {
  id: string;
  label: string;
  provider: 'azure' | 'fpt' | 'vieneu' | 'google';
}

const AZURE_VOICES: TtsVoiceOption[] = [
  { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (Nữ)', provider: 'azure' },
  { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (Nam)', provider: 'azure' },
];

const FPT_VOICES: TtsVoiceOption[] = [
  { id: 'banmai', label: 'Ban Mai (Nữ Bắc)', provider: 'fpt' },
  { id: 'leminh', label: 'Lê Minh (Nam Bắc)', provider: 'fpt' },
  { id: 'lannhi', label: 'Lan Nhi (Nữ Nam)', provider: 'fpt' },
  { id: 'minhquang', label: 'Minh Quang (Nam Nam)', provider: 'fpt' },
];

const VIENEU_VOICES: TtsVoiceOption[] = [
  { id: 'Hải Đăng', label: 'Hải Đăng (Nam Bắc)', provider: 'vieneu' },
  { id: 'Mai Anh', label: 'Mai Anh (Nữ Bắc)', provider: 'vieneu' },
  { id: 'Thùy Dung', label: 'Thùy Dung (Nữ Nam)', provider: 'vieneu' },
  { id: 'Quang Sơn', label: 'Quang Sơn (Nam Trung)', provider: 'vieneu' },
];

function buildTtsProviderInfo(env: NewsEnv) {
  const hasAzure = Boolean(env?.AZURE_SPEECH_KEY?.trim());
  const hasFpt = Boolean(env?.FPT_TTS_API_KEY?.trim());
  const hasVieNeu = Boolean(env?.VIENEU_API_URL?.trim());

  const voices: TtsVoiceOption[] = [];
  if (hasAzure) voices.push(...AZURE_VOICES);
  if (hasFpt) voices.push(...FPT_VOICES);
  if (hasVieNeu) voices.push(...VIENEU_VOICES);

  if (voices.length > 0) {
    const primary = hasAzure ? 'azure' : hasFpt ? 'fpt' : 'vieneu';
    const providerLabel =
      hasAzure && hasFpt
        ? 'Azure Neural + FPT.AI'
        : hasAzure
        ? 'Azure Neural AI'
        : hasFpt
        ? 'FPT.AI Neural'
        : 'VieNeu-TTS 48kHz';

    return {
      provider: primary,
      providerLabel,
      isNeural: true,
      maxChunkLen: 420,
      defaultVoice: voices[0].id,
      voices,
    };
  }

  return {
    provider: 'google' as const,
    providerLabel: 'Google TTS (Dự phòng)',
    isNeural: false,
    maxChunkLen: 175,
    defaultVoice: 'vi',
    voices: [{ id: 'vi', label: 'Giọng mặc định', provider: 'google' as const }],
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function synthesizeAzureNeural(
  text: string,
  voiceName: string,
  apiKey: string,
  region: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const safeRegion = (region || 'southeastasia').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'southeastasia';
  const safeVoice = AZURE_VOICES.some((v) => v.id === voiceName) ? voiceName : 'vi-VN-HoaiMyNeural';
  const ssml = `<speak version="1.0" xml:lang="vi-VN"><voice xml:lang="vi-VN" name="${safeVoice}">${escapeXml(text)}</voice></speak>`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`https://${safeRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey.trim(),
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        'User-Agent': 'CarHubVF5',
      },
      body: ssml,
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.byteLength > 256 ? { bytes, contentType: 'audio/mpeg' } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeFptAi(
  text: string,
  voiceName: string,
  apiKey: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const safeVoice = FPT_VOICES.some((v) => v.id === voiceName) ? voiceName : 'banmai';
  const bodyText = text.length < 4 ? `${text}.` : text;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11000);
  try {
    const res = await fetch('https://api.fpt.ai/hmi/tts/v5', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'api-key': apiKey.trim(),
        voice: safeVoice,
        speed: '',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: bodyText,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { async?: string; error?: number };
    const asyncUrl = typeof data?.async === 'string' ? data.async.trim() : '';
    if (!asyncUrl || !asyncUrl.startsWith('https://')) return null;

    // FPT.AI sinh file bất đồng bộ sau ~300–900ms -> dò tối đa 12 lần (mỗi lần 350ms)
    for (let attempt = 0; attempt < 12; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
      const mp3Res = await fetch(asyncUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
      if (mp3Res.ok) {
        const bytes = new Uint8Array(await mp3Res.arrayBuffer());
        if (bytes.byteLength > 256) {
          return { bytes, contentType: 'audio/mpeg' };
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeVieNeu(
  text: string,
  voiceName: string,
  baseUrl: string,
  apiKey?: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const endpoint = `${baseUrl.trim().replace(/\/+$/, '')}/v1/audio/speech`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: 'vieneu-v3-turbo',
        voice: voiceName || 'Hải Đăng',
        input: text,
        response_format: 'wav',
      }),
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct = res.headers.get('Content-Type') || 'audio/wav';
    return bytes.byteLength > 256 ? { bytes, contentType: ct } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesizeGoogleChunk(chunk: string): Promise<Uint8Array | null> {
  const encoded = encodeURIComponent(chunk.slice(0, 195));
  const candidates = [
    `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=vi&q=${encoded}`,
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=vi&q=${encoded}`,
  ];
  for (const u of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      try {
        const upstream = await fetch(u, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': MOBILE_UA,
            Referer: 'https://translate.google.com/',
          },
        });
        if (upstream.ok) {
          const buf = new Uint8Array(await upstream.arrayBuffer());
          if (buf.byteLength > 256) return buf;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Thử nguồn kế tiếp
    }
  }
  return null;
}

async function synthesizeGoogleFallback(text: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  // Nếu đoạn dài > 190 ký tự (do client gửi chunk 420 ký tự cho Neural nhưng fallback về Google) -> tự cắt nhỏ & ghép khung MP3!
  const subChunks: string[] = [];
  let rest = text.trim();
  while (rest.length > 185) {
    const slice = rest.slice(0, 185);
    let cut = slice.lastIndexOf('. ');
    if (cut < 60) cut = slice.lastIndexOf(', ');
    if (cut < 60) cut = slice.lastIndexOf(' ');
    if (cut < 60) cut = 185;
    subChunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) subChunks.push(rest);

  const parts: Uint8Array[] = [];
  let totalLen = 0;
  for (const part of subChunks.slice(0, 4)) {
    const b = await synthesizeGoogleChunk(part);
    if (b) {
      parts.push(b);
      totalLen += b.byteLength;
    }
  }
  if (totalLen === 0) return null;
  if (parts.length === 1) return { bytes: parts[0], contentType: 'audio/mpeg' };

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.byteLength;
  }
  return { bytes: merged, contentType: 'audio/mpeg' };
}

export const onRequest: PagesFunction<NewsEnv> = async (context) => {
  const { request, env } = context;

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

  // =========================================================================
  // 4. ACTION = TTS-INFO (Cho Frontend biết engine Neural nào đang kích hoạt: Azure / FPT.AI / VieNeu / Dự phòng)
  // =========================================================================
  if (action === 'tts-info') {
    return new Response(JSON.stringify(buildTtsProviderInfo(env || {})), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': 'public, max-age=60',
      },
    });
  }

  // =========================================================================
  // 5. ACTION = TTS (Azure Neural 96kbps / FPT.AI Neural / VieNeu-TTS / Google Dự phòng
  //    + Cloudflare Edge Cache 24h TRƯỚC khi cắt HTTP 206 Range để iOS không bị trừ 2 lần ký tự!)
  // =========================================================================
  if (action === 'tts') {
    const corsOrigin = getTrustedCorsOrigin(request);
    if (!isTrustedAppRequest(request, { allowAppleMediaUa: true })) {
      return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
        status: 403,
        headers: { ...JSON_HEADERS, 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' },
      });
    }
    const rawText = (reqUrl.searchParams.get('q') || '').trim().replace(/\s+/g, ' ');
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'Thiếu văn bản cần đọc' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
    const text = rawText.slice(0, 500);
    const requestedVoice = (reqUrl.searchParams.get('voice') || '').trim();
    const info = buildTtsProviderInfo(env || {});
    const chosenVoiceObj =
      info.voices.find((v) => v.id === requestedVoice) || info.voices[0];
    const effectiveVoiceId = chosenVoiceObj?.id || info.defaultVoice;
    const effectiveProvider = chosenVoiceObj?.provider || info.provider;

    // Khóa cache chuẩn hóa (không chứa Range) -> iOS gửi bytes=0-1 rồi bytes=0-full chỉ gọi Azure/FPT đúng 1 LẦN duy nhất!
    const cacheKeyUrl = `https://tts-cache.carhub.internal/v3?p=${encodeURIComponent(
      effectiveProvider
    )}&v=${encodeURIComponent(effectiveVoiceId)}&q=${encodeURIComponent(text)}`;
    const cacheKey = new Request(cacheKeyUrl, { method: 'GET' });
    const edgeCache = (caches as unknown as { default?: Cache })?.default;

    let audioBytes: Uint8Array | null = null;
    let contentType = 'audio/mpeg';
    let actualProvider: string = effectiveProvider;
    let cacheStatus = 'MISS';

    if (edgeCache) {
      try {
        const cached = await edgeCache.match(cacheKey);
        if (cached && cached.ok) {
          audioBytes = new Uint8Array(await cached.arrayBuffer());
          contentType = cached.headers.get('Content-Type') || 'audio/mpeg';
          actualProvider = cached.headers.get('X-TTS-Provider') || effectiveProvider;
          cacheStatus = 'HIT';
        }
      } catch {
        // Bỏ qua lỗi cache cục bộ
      }
    }

    if (!audioBytes) {
      let synth: { bytes: Uint8Array; contentType: string } | null = null;

      if (effectiveProvider === 'azure' && env?.AZURE_SPEECH_KEY) {
        synth = await synthesizeAzureNeural(
          text,
          effectiveVoiceId,
          env.AZURE_SPEECH_KEY,
          env.AZURE_SPEECH_REGION || 'southeastasia'
        );
        if (synth) actualProvider = 'azure';
      } else if (effectiveProvider === 'fpt' && env?.FPT_TTS_API_KEY) {
        synth = await synthesizeFptAi(text, effectiveVoiceId, env.FPT_TTS_API_KEY);
        if (synth) actualProvider = 'fpt';
      } else if (effectiveProvider === 'vieneu' && env?.VIENEU_API_URL) {
        synth = await synthesizeVieNeu(
          text,
          effectiveVoiceId,
          env.VIENEU_API_URL,
          env.VIENEU_API_KEY
        );
        if (synth) actualProvider = 'vieneu';
      }

      // Nếu nhà cung cấp chính lỗi/hết quota mà có nhà cung cấp Neural thứ 2 -> tự động dự phòng chéo!
      if (!synth && effectiveProvider !== 'azure' && env?.AZURE_SPEECH_KEY) {
        synth = await synthesizeAzureNeural(
          text,
          'vi-VN-HoaiMyNeural',
          env.AZURE_SPEECH_KEY,
          env.AZURE_SPEECH_REGION || 'southeastasia'
        );
        if (synth) actualProvider = 'azure';
      }
      if (!synth && effectiveProvider !== 'fpt' && env?.FPT_TTS_API_KEY) {
        synth = await synthesizeFptAi(text, 'banmai', env.FPT_TTS_API_KEY);
        if (synth) actualProvider = 'fpt';
      }

      // Dự phòng cuối cùng: Google TTS MP3 miễn phí (không bao giờ tịt tiếng!)
      if (!synth) {
        synth = await synthesizeGoogleFallback(text);
        actualProvider = 'google';
      }

      if (!synth) {
        return new Response(
          JSON.stringify({ error: 'Không tạo được âm thanh giọng đọc tiếng Việt' }),
          { status: 502, headers: JSON_HEADERS }
        );
      }

      audioBytes = synth.bytes;
      contentType = synth.contentType;

      if (edgeCache) {
        const respToCache = new Response(audioBytes, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(audioBytes.byteLength),
            'X-TTS-Provider': actualProvider,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        });
        context.waitUntil(edgeCache.put(cacheKey, respToCache).catch(() => {}));
      }
    }

    const total = audioBytes.byteLength;
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/i);
      if (m) {
        const start = Math.min(parseInt(m[1], 10), Math.max(0, total - 1));
        const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        const slice = audioBytes.subarray(start, end + 1);
        return new Response(slice, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(slice.byteLength),
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': corsOrigin,
            Vary: 'Origin',
            'X-TTS-Provider': actualProvider,
            'X-TTS-Cache': cacheStatus,
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        });
      }
    }

    return new Response(audioBytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': corsOrigin,
        Vary: 'Origin',
        'X-TTS-Provider': actualProvider,
        'X-TTS-Cache': cacheStatus,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: JSON_HEADERS,
  });
};
