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

function cleanYouTubeTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\[.*?\]|\(.*?\)|【.*?】/g, ' ')
    .replace(/\b(official|music video|mv|lyrics|lyric|audio|remix|nonstop|vinahouse|bass|full hd|4k|hd|live|cover|karaoke)\b/gi, ' ')
    .replace(/[|•·\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseLrc(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;

  for (const rawLine of lrcText.split('\n')) {
    const match = rawLine.match(regex);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const msStr = (match[3] || '0').padEnd(3, '0').slice(0, 3);
    const ms = parseInt(msStr, 10);
    const time = min * 60 + sec + ms / 1000;
    const text = match[4].trim();
    if (text) {
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
  if (lyricsCache.has(videoId)) {
    return lyricsCache.get(videoId) || null;
  }

  const cleanedTitle = cleanYouTubeTitle(title);
  const queries = [
    `${cleanedTitle} ${artist}`.trim(),
    cleanedTitle,
  ].filter((q) => q.length >= 2);

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      const syncedMatch = items.find((it: any) => typeof it.syncedLyrics === 'string' && it.syncedLyrics.trim().length > 0);
      if (syncedMatch) {
        const parsed = parseLrc(syncedMatch.syncedLyrics);
        if (parsed.length > 0) {
          const result: LyricsResult = {
            lines: parsed,
            isSynced: true,
            source: 'LRCLIB Synced',
          };
          lyricsCache.set(videoId, result);
          return result;
        }
      }

      const plainMatch = items.find((it: any) => typeof it.plainLyrics === 'string' && it.plainLyrics.trim().length > 0);
      if (plainMatch) {
        const plainLines = plainMatch.plainLyrics
          .split('\n')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .map((text: string) => ({ time: -1, text }));
        if (plainLines.length > 0) {
          const result: LyricsResult = {
            lines: plainLines,
            isSynced: false,
            source: 'LRCLIB Plain',
          };
          lyricsCache.set(videoId, result);
          return result;
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  lyricsCache.set(videoId, null);
  return null;
}
