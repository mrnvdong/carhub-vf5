import {
  NewsArticleDetail,
  NewsCategory,
  NewsCategoryId,
  NewsFeedResponse,
  NewsTtsProviderInfo,
} from '../types';

export const NEWS_CATEGORIES: NewsCategory[] = [
  { id: 'hot', label: 'Tin nóng', icon: '🔥' },
  { id: 'audio', label: 'Bản tin Audio', icon: '🎙️' },
  { id: 'tin-moi', label: 'Tin mới', icon: '⚡' },
  { id: 'xa-hoi', label: 'Xã hội', icon: '🏛️' },
  { id: 'kinh-te', label: 'Kinh tế', icon: '📈' },
  { id: 'xe-co', label: 'Xe cộ', icon: '🚗' },
  { id: 'the-gioi', label: 'Thế giới', icon: '🌍' },
  { id: 'cong-nghe', label: 'Công nghệ', icon: '💻' },
  { id: 'the-thao', label: 'Thể thao', icon: '⚽' },
  { id: 'phap-luat', label: 'Pháp luật', icon: '⚖️' },
  { id: 'giai-tri', label: 'Giải trí', icon: '🎬' },
  { id: 'doi-song', label: 'Đời sống', icon: '🌿' },
];

export const VOICE_SHORT_NAMES: Record<number, string> = {
  0: 'Bản tin',
  1: 'Nam Bắc',
  2: 'Nữ Bắc',
  6: 'Nữ Nam',
  7: 'Nam Nam',
};

export function getVoiceShortName(id: number, fallbackName?: string): string {
  if (VOICE_SHORT_NAMES[id]) return VOICE_SHORT_NAMES[id];
  if (!fallbackName) return 'Giọng đọc';
  return fallbackName.replace(/miền\s+/i, '').trim();
}

const articleCache = new Map<string, { data: NewsArticleDetail; ts: number }>();
const ARTICLE_CACHE_TTL_MS = 10 * 60 * 1000;
const feedCache = new Map<string, { data: NewsFeedResponse; ts: number }>();
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchNewsFeed(
  cat: NewsCategoryId,
  page = 1,
  query = '',
  forceRefresh = false
): Promise<NewsFeedResponse> {
  const params = new URLSearchParams();
  params.set('action', 'feed');
  if (query.trim()) {
    params.set('q', query.trim());
  } else {
    params.set('cat', cat);
    if (page > 1) params.set('page', String(page));
  }

  const qs = params.toString();
  const cached = feedCache.get(qs);
  if (!forceRefresh && cached && Date.now() - cached.ts < FEED_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(`/api/news?${qs}`);
  const data = (await res.json()) as NewsFeedResponse;
  if (!res.ok) {
    throw new Error(data.error || `Không tải được tin tức (HTTP ${res.status})`);
  }
  if (feedCache.size >= 24) {
    const oldest = feedCache.keys().next().value;
    if (oldest) feedCache.delete(oldest);
  }
  feedCache.set(qs, { data, ts: Date.now() });
  return data;
}

export async function fetchNewsArticle(
  url: string,
  forceRefresh = false
): Promise<NewsArticleDetail> {
  const cached = articleCache.get(url);
  if (!forceRefresh && cached && Date.now() - cached.ts < ARTICLE_CACHE_TTL_MS) {
    return cached.data;
  }

  const params = new URLSearchParams({
    action: 'article',
    url,
  });
  const res = await fetch(`/api/news?${params.toString()}`);
  const data = (await res.json()) as NewsArticleDetail & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Không tải được bài báo (HTTP ${res.status})`);
  }

  // Giới hạn cache 40 bài gần nhất trong RAM
  if (articleCache.size >= 40) {
    const firstKey = articleCache.keys().next().value;
    if (firstKey) articleCache.delete(firstKey);
  }
  articleCache.set(url, { data, ts: Date.now() });
  return data;
}

export function buildNewsAudioProxyUrl(streamingUrl: string): string {
  return `/api/news?action=audio-proxy&url=${encodeURIComponent(streamingUrl)}`;
}

let ttsInfoCache: NewsTtsProviderInfo | null = null;

export async function fetchNewsTtsInfo(): Promise<NewsTtsProviderInfo> {
  if (ttsInfoCache) return ttsInfoCache;
  try {
    const res = await fetch('/api/news?action=tts-info');
    if (res.ok) {
      const data = (await res.json()) as NewsTtsProviderInfo;
      if (data?.provider && Array.isArray(data.voices)) {
        ttsInfoCache = data;
        return data;
      }
    }
  } catch {
    // ignore
  }
  return {
    provider: 'google',
    providerLabel: 'Google TTS (Dự phòng)',
    isNeural: false,
    maxChunkLen: 175,
    defaultVoice: 'vi',
    voices: [{ id: 'vi', label: 'Giọng mặc định', provider: 'google' }],
  };
}

export function buildNewsTtsUrl(text: string, voiceId?: string): string {
  const params = new URLSearchParams();
  params.set('action', 'tts');
  params.set('q', text.trim().slice(0, 480));
  if (voiceId) params.set('voice', voiceId);
  return `/api/news?${params.toString()}`;
}

export function splitVietnameseTtsChunks(rawText: string, maxLen = 175): string[] {
  const cleaned = rawText
    .replace(/\s+/g, ' ')
    .replace(/[“”"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  // Tách theo ranh giới câu tự nhiên KHÔNG dùng RegExp lookbehind (tương thích 100% iOS Safari <= 16.3!)
  const rawSentences: string[] = [];
  for (const line of cleaned.split(/\n+/)) {
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      cur += ch;
      if (
        (ch === '.' || ch === '!' || ch === '?' || ch === '…' || ch === ';') &&
        i + 1 < line.length &&
        /\s/.test(line[i + 1])
      ) {
        let j = i + 1;
        while (j < line.length && /\s/.test(line[j])) j++;
        if (j < line.length && !/\d/.test(line[j])) {
          const trimmed = cur.trim();
          if (trimmed) rawSentences.push(trimmed);
          cur = '';
          i = j - 1;
        }
      }
    }
    const tail = cur.trim();
    if (tail) rawSentences.push(tail);
  }

  const chunks: string[] = [];

  const pushWrapped = (segment: string) => {
    let rest = segment.trim();
    while (rest.length > maxLen) {
      let cut = -1;
      const slice = rest.slice(0, maxLen);
      // Ưu tiên cắt tại dấu phẩy / hai chấm / gạch ngang gần cuối
      for (const sep of [', ', ': ', ' - ', ' – ']) {
        const idx = slice.lastIndexOf(sep);
        if (idx >= Math.floor(maxLen * 0.4)) {
          cut = idx + sep.length;
          break;
        }
      }
      if (cut < 0) {
        const sp = slice.lastIndexOf(' ');
        cut = sp >= Math.floor(maxLen * 0.4) ? sp : maxLen;
      }
      const part = rest.slice(0, cut).trim();
      if (part) chunks.push(part);
      rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
  };

  let buffer = '';
  for (const s of rawSentences) {
    if (s.length > maxLen) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      pushWrapped(s);
    } else if (!buffer) {
      buffer = s;
    } else if (buffer.length + 1 + s.length <= maxLen) {
      buffer = `${buffer} ${s}`;
    } else {
      chunks.push(buffer);
      buffer = s;
    }
  }
  if (buffer) chunks.push(buffer);

  // Giới hạn tối đa 60 đoạn (~10.000 ký tự, đủ đọc trọn vẹn cả bài báo dài)
  return chunks.slice(0, 60);
}

export function formatNewsRelativeTime(unixSeconds?: number): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSec < 60) return 'Vừa xong';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} ngày trước`;
  const d = new Date(unixSeconds * 1000);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
