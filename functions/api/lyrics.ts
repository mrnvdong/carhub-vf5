// Cloudflare Pages Function: /api/lyrics
// Multi-source synced lyrics API:
// 1. LRCLIB (studio time-synced LRC lyrics with smart YouTube title splitting)
// 2. YouTube TimedText / Captions API (json3 time-synced lyrics/subtitles for Remixes, Nonstops, Live MVs)

interface LyricLine {
  time: number;
  text: string;
}

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

  if (fullClean && cleanArtist) {
    candidates.add(`${fullClean} ${cleanArtist}`);
  }
  if (fullClean) {
    candidates.add(fullClean);
  }

  // Split YouTube titles like "SƠN TÙNG M-TP | HÃY TRAO CHO ANH ft. Snoop Dogg | Official MV"
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

  return Array.from(candidates).slice(0, 5);
}

function parseLrc(lrcText: string): LyricLine[] {
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

async function queryLrcLib(title: string, artist: string) {
  const queries = buildSearchCandidates(title, artist);

  for (const q of queries) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'CarHub-VF5/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const items: any = await res.json();
      if (!Array.isArray(items) || items.length === 0) continue;

      const syncedMatch = items.find(
        (it: any) => typeof it.syncedLyrics === 'string' && it.syncedLyrics.trim().length > 0
      );
      if (syncedMatch) {
        const lines = parseLrc(syncedMatch.syncedLyrics);
        if (lines.length > 3) {
          return { lines, isSynced: true, source: 'LRCLIB Synced' };
        }
      }

      const plainMatch = items.find(
        (it: any) => typeof it.plainLyrics === 'string' && it.plainLyrics.trim().length > 0
      );
      if (plainMatch) {
        const lines = plainMatch.plainLyrics
          .split('\n')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .map((text: string) => ({ time: -1, text }));
        if (lines.length > 3) {
          return { lines, isSynced: false, source: 'LRCLIB Plain' };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchVisitorData(): Promise<string> {
  try {
    const res = await fetch('https://www.youtube.com/sw.js_data', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
      },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return '';
    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'\n?/, ''));
    return json?.[0]?.[2]?.[0]?.[0]?.[13] || '';
  } catch {
    return '';
  }
}

async function queryYouTubeCaptions(videoId: string) {
  try {
    const visitorData = await fetchVisitorData();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
    };
    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = visitorData;
    }

    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'IOS',
            clientVersion: '20.10.4',
            deviceMake: 'Apple',
            deviceModel: 'iPhone16,2',
            osName: 'iPhone',
            osVersion: '18.2.1.22C161',
            hl: 'vi',
            gl: 'VN',
            ...(visitorData ? { visitorData } : {}),
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data: any = await res.json();
    const tracks: any[] = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (tracks.length === 0) return null;

    // Priority: vi manual -> en manual -> vi asr -> any track
    const selectedTrack =
      tracks.find((t) => t.languageCode === 'vi' && t.kind !== 'asr') ||
      tracks.find((t) => t.languageCode?.startsWith('en') && t.kind !== 'asr') ||
      tracks.find((t) => t.languageCode === 'vi') ||
      tracks[0];

    if (!selectedTrack?.baseUrl) return null;

    const capRes = await fetch(`${selectedTrack.baseUrl}&fmt=json3`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!capRes.ok) return null;
    const capData: any = await capRes.json();

    const rawEvents: any[] = capData?.events || [];
    const lines: LyricLine[] = [];

    for (const ev of rawEvents) {
      if (!Array.isArray(ev.segs) || typeof ev.tStartMs !== 'number') continue;
      const text = ev.segs
        .map((s: any) => s.utf8 || '')
        .join('')
        .replace(/\[âm nhạc\]|\[music\]|♪/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > 0) {
        lines.push({
          time: ev.tStartMs / 1000,
          text,
        });
      }
    }

    if (lines.length === 0) return null;

    return {
      lines,
      isSynced: true,
      source:
        selectedTrack.kind === 'asr'
          ? `YouTube Auto-Lyrics (${selectedTrack.languageCode})`
          : `YouTube Lyrics (${selectedTrack.languageCode})`,
    };
  } catch {
    return null;
  }
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const title = url.searchParams.get('title') || '';
  const artist = url.searchParams.get('artist') || '';

  if (!id && !title) {
    return new Response(JSON.stringify({ lines: [], isSynced: false, source: 'none' }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Check Cloudflare Edge Cache
  const cache = (caches as any).default;
  const cacheKey = new Request(`${url.origin}/api/lyrics?id=${encodeURIComponent(id)}&v=1`, request);
  if (cache && id) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    } catch {}
  }

  // Run LRCLIB and YouTube Captions in parallel; prefer LRCLIB if it has synced lyrics,
  // otherwise use YouTube Captions (which covers Remixes, Nonstops, and Vietnamese MVs!)
  const [lrcResult, ytResult] = await Promise.all([
    title ? queryLrcLib(title, artist) : Promise.resolve(null),
    id ? queryYouTubeCaptions(id) : Promise.resolve(null),
  ]);

  let finalResult = null;
  if (lrcResult?.isSynced) {
    finalResult = lrcResult;
  } else if (ytResult && ytResult.lines.length > 0) {
    finalResult = ytResult;
  } else if (lrcResult) {
    finalResult = lrcResult;
  }

  const payload = finalResult || { lines: [], isSynced: false, source: 'none' };
  const resp = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': finalResult ? 'public, max-age=3600' : 'public, max-age=120',
      'Access-Control-Allow-Origin': '*',
    },
  });

  if (cache && id && finalResult) {
    context.waitUntil(cache.put(cacheKey, resp.clone()));
  }

  return resp;
}
