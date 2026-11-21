import { fetchWithTimeout } from '../utils/timedFetch';

export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsResult {
  lines: LyricLine[];
  isSynced: boolean;
  source: string;
}

const lyricsCache = new Map<string, LyricsResult | null>();

function buildSearchCandidates(rawTitle: string, rawArtist: string): string[] {
  const candidates = new Set<string>();
  const stripTags = (s: string) =>
    s
      .replace(/\[.*?\]|\(.*?\)|【.*?】/g, ' ')
      .replace(
        /\b(official|music video|mv|lyrics|lyric|audio|remix|nonstop|vinahouse|bass|full hd|4k|hd|live|cover|karaoke|ver\.?|version|ft\.?|feat\.?|prod\.?)\b/gi,
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

  return Array.from(candidates).slice(0, 4);
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
  artist: string
): Promise<LyricsResult | null> {
  const cacheKey = `${videoId}::${title}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) || null;
  }

  // 1. Primary: Cloudflare Edge /api/lyrics (combines LRCLIB + YouTube TimedText Captions)
  try {
    const apiRes = await fetchWithTimeout(
      `/api/lyrics?id=${encodeURIComponent(videoId)}&title=${encodeURIComponent(
        title
      )}&artist=${encodeURIComponent(artist)}`,
      {},
      6000
    );
    const contentType = apiRes.headers.get('content-type') || '';
    if (apiRes.ok && contentType.includes('application/json')) {
      const data = await apiRes.json();
      if (Array.isArray(data?.lines) && data.lines.length > 0) {
        const result: LyricsResult = {
          lines: data.lines,
          isSynced: Boolean(data.isSynced),
          source: data.source || 'API',
        };
        lyricsCache.set(cacheKey, result);
        return result;
      }
    }
  } catch {
    // Fallback to client-side LRCLIB if backend route is unavailable
  }

  // 2. Client-side fallback: LRCLIB
  const queries = buildSearchCandidates(title, artist);
  for (const q of queries) {
    try {
      const res = await fetchWithTimeout(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        {},
        3500
      );
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      const syncedMatch = items.find(
        (it: any) => typeof it.syncedLyrics === 'string' && it.syncedLyrics.trim().length > 0
      );
      if (syncedMatch) {
        const parsed = parseLrc(syncedMatch.syncedLyrics);
        if (parsed.length > 3) {
          const result: LyricsResult = {
            lines: parsed,
            isSynced: true,
            source: 'LRCLIB Synced',
          };
          lyricsCache.set(cacheKey, result);
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
          lyricsCache.set(cacheKey, result);
          return result;
        }
      }
    } catch {
      continue;
    }
  }

  lyricsCache.set(cacheKey, null);
  return null;
}
