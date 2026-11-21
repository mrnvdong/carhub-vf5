import { fetchWithTimeout } from '../utils/timedFetch';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  lines: LyricLine[];
  isSynced: boolean;
  source: string;
  hasYoutubeCc?: boolean;
}

export type LyricsPreferMode = 'auto' | 'youtube' | 'lrclib';

// Positive cache kept for session; negative misses expire after 15s so transient hiccups self-heal!
const lyricsCache = new Map<string, { data: LyricsResult | null; ts: number }>();

function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function isLongCompilationTitle(rawTitle: string, durationSec: number): boolean {
  if (durationSec > 480) return true;
  const norm = stripDiacritics(rawTitle);
  return /\b(nonstop|lien khuc|tuyen tap|tuyen chon|bxh|top\s*\d+|mashup|megamix|nhac tre remix hay|nhac trend tiktok|1 gio|2 gio|1 hour|mixset|set nhac|full album)\b/i.test(
    norm
  );
}

function buildSearchCandidates(rawTitle: string, rawArtist: string): string[] {
  const candidates = new Set<string>();
  const stripTags = (s: string) =>
    s
      .replace(/\[.*?\]|\(.*?\)|【.*?】/g, ' ')
      .replace(
        /\b(official|music video|mv|lyrics|lyric|audio|remix|nonstop|vinahouse|bass|full hd|4k|hd|live|cover|karaoke|ver\.?|version|ft\.?|feat\.?|prod\.?|vietsub|engsub)\b/gi,
        ' '
      )
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const fullClean = stripTags(rawTitle);
  const cleanArtist = stripTags(rawArtist);

  if (fullClean && cleanArtist) candidates.add(`${fullClean} ${cleanArtist}`);
  if (fullClean) candidates.add(fullClean);

  const parts = rawTitle
    .split(/[|•·\-–—]/)
    .map((p) => stripTags(p))
    .filter((p) => p.length >= 3 && !/^\d{4}$/.test(p));

  for (const part of parts) {
    if (cleanArtist && !part.toLowerCase().includes(cleanArtist.toLowerCase())) {
      candidates.add(`${part} ${cleanArtist}`);
    }
    candidates.add(part);
  }

  return Array.from(candidates).slice(0, 3);
}

export function parseLrc(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const rawLine of lrcText.split('\n')) {
    const matches = Array.from(rawLine.matchAll(tagRegex));
    if (matches.length === 0) continue;

    // Strip all [mm:ss.xx] tags and enhanced LRC inline <mm:ss.xx> tags
    const text = rawLine
      .replace(tagRegex, '')
      .replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;

    for (const match of matches) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
      const ms = parseInt(msStr, 10);
      const time = min * 60 + sec + ms / 1000;
      lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchSyncedLyrics(
  videoId: string,
  title: string,
  artist: string,
  options?: {
    durationSec?: number;
    prefer?: LyricsPreferMode;
    forceRefresh?: boolean;
  }
): Promise<LyricsResult | null> {
  const durationSec = Math.max(0, Math.round(options?.durationSec || 0));
  const prefer: LyricsPreferMode = options?.prefer || 'auto';
  const forceRefresh = Boolean(options?.forceRefresh);
  const cacheKey = `${videoId}::${title}::${prefer}`;

  if (!forceRefresh) {
    const cached = lyricsCache.get(cacheKey);
    if (cached) {
      if (cached.data !== null) return cached.data;
      if (Date.now() - cached.ts < 15_000) return null;
    }
  }

  // 1. Primary: Cloudflare Edge /api/lyrics (Multi-client YouTube CC ANDROID/IOS/Watch + Verified LRCLIB)
  try {
    const params = new URLSearchParams({
      id: videoId,
      title,
      artist,
      prefer,
    });
    if (durationSec > 0) params.set('duration', String(durationSec));
    if (forceRefresh) params.set('nocache', '1');

    const apiRes = await fetchWithTimeout(`/api/lyrics?${params.toString()}`, {}, 9500);
    const contentType = apiRes.headers.get('content-type') || '';
    if (apiRes.ok && contentType.includes('application/json')) {
      const data = await apiRes.json();
      if (Array.isArray(data?.lines) && data.lines.length > 0) {
        const result: LyricsResult = {
          lines: data.lines,
          isSynced: Boolean(data.isSynced),
          source: data.source || 'API',
          hasYoutubeCc: Boolean(data.hasYoutubeCc),
        };
        lyricsCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      }
      // Backend replied cleanly with 0 lines -> if user explicitly requested youtube-only, don't fall back to LRCLIB
      if (prefer === 'youtube') {
        lyricsCache.set(cacheKey, { data: null, ts: Date.now() });
        return null;
      }
    }
  } catch {
    // Fallback to client-side LRCLIB only if backend route is unavailable (e.g., local vite dev)
  }

  if (prefer === 'youtube' || isLongCompilationTitle(title, durationSec)) {
    lyricsCache.set(cacheKey, { data: null, ts: Date.now() });
    return null;
  }

  // 2. Client-side fallback: LRCLIB (local dev without Pages Functions)
  const queries = buildSearchCandidates(title, artist);
  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        {},
        3000
      );
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      const syncedMatch = items.find(
        (it: any) =>
          typeof it.syncedLyrics === 'string' &&
          it.syncedLyrics.trim().length > 0 &&
          (durationSec <= 30 ||
            !it.duration ||
            Math.abs(durationSec - Number(it.duration)) <= 55)
      );
      if (syncedMatch) {
        const parsed = parseLrc(syncedMatch.syncedLyrics);
        if (parsed.length > 3) {
          const result: LyricsResult = {
            lines: parsed,
            isSynced: true,
            source: 'LRCLIB Synced',
          };
          lyricsCache.set(cacheKey, { data: result, ts: Date.now() });
          return result;
        }
      }

      const plainMatch = items.find(
        (it: any) => typeof it.plainLyrics === 'string' && it.plainLyrics.trim().length > 0
      );
      if (plainMatch) {
        const plainLines = plainMatch.plainLyrics
          .split('\n')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .map((text: string) => ({ time: -1, text }));
        if (plainLines.length > 3) {
          const result: LyricsResult = {
            lines: plainLines,
            isSynced: false,
            source: 'LRCLIB Plain',
          };
          lyricsCache.set(cacheKey, { data: result, ts: Date.now() });
          return result;
        }
      }
    } catch {
      continue;
    }
  }

  lyricsCache.set(cacheKey, { data: null, ts: Date.now() });
  return null;
}
