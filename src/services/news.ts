import {
  NewsArticleDetail,
  NewsCategory,
  NewsCategoryId,
  NewsFeedResponse,
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

export async function fetchNewsFeed(
  cat: NewsCategoryId,
  page = 1,
  query = ''
): Promise<NewsFeedResponse> {
  const params = new URLSearchParams();
  params.set('action', 'feed');
  if (query.trim()) {
    params.set('q', query.trim());
  } else {
    params.set('cat', cat);
    if (page > 1) params.set('page', String(page));
  }

  const res = await fetch(`/api/news?${params.toString()}`);
  const data = (await res.json()) as NewsFeedResponse;
  if (!res.ok) {
    throw new Error(data.error || `Không tải được tin tức (HTTP ${res.status})`);
  }
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
