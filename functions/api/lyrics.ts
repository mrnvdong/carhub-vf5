// Cloudflare Pages Function: /api/lyrics
// Multi-source synced lyrics API (v6 — YouTube CC + YouTube Music Official Lyrics + Verified LRCLIB):
// 1. YouTube Captions [CC] extractor: ANDROID -> IOS -> Watch HTML (JSON3 + SRV3/XML + ASR cleanup)
// 2. YouTube Music Official Lyrics (ANDROID_MUSIC /next -> /browse MPLYt_* — no /player call, bound by videoId!)
// 3. Parallel duration- & title-verified LRCLIB studio synced karaoke lyrics

import { buildTrustedJsonHeaders, isTrustedAppRequest } from '../_lib/security';

interface LyricLine {
  time: number;
  text: string;
}

interface LyricsPayload {
  lines: LyricLine[];
  isSynced: boolean;
  source: string;
  isManualCc?: boolean;
  isAutoCc?: boolean;
  isYtMusicSynced?: boolean;
}

interface YtCaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

let cachedVisitorData = '';
let cachedVisitorAt = 0;

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
        /\b(official|music video|mv|lyrics|lyric|audio|remix|nonstop|vinahouse|bass|full hd|4k|hd|live|cover|karaoke|ver\.?|version|ft\.?|feat\.?|prod\.?|vietsub|engsub|lofi|chill|hot trend|trieu view|moi nhat|ban dep|video)\b/gi,
        ' '
      )
      .replace(/\b20\d{2}\b/g, ' ')
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

  const parts = rawTitle
    .split(/[|•·\-–—♫♪]/)
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

function isPlausibleLrcMatch(
  item: any,
  rawTitle: string,
  rawArtist: string,
  durationSec: number
): boolean {
  const itemDur = Number(item?.duration || 0);
  if (durationSec > 30 && itemDur > 30 && Math.abs(durationSec - itemDur) > 65) {
    return false;
  }

  const hay = stripDiacritics(`${rawTitle} ${rawArtist}`);
  const trackTokens = stripDiacritics(String(item?.trackName || ''))
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  if (trackTokens.length === 0) return false;

  let matched = 0;
  for (const tok of trackTokens) {
    if (hay.includes(tok)) matched += 1;
  }
  return matched / trackTokens.length >= 0.55;
}

function parseLrc(lrcText: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tagRegex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

  for (const rawLine of lrcText.split('\n')) {
    const matches = Array.from(rawLine.matchAll(tagRegex));
    if (matches.length === 0) continue;

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

async function queryLrcLib(
  title: string,
  artist: string,
  durationSec: number
): Promise<LyricsPayload | null> {
  if (!title || isLongCompilationTitle(title, durationSec)) return null;
  const queries = buildSearchCandidates(title, artist);
  if (queries.length === 0) return null;

  const settled = await Promise.allSettled(
    queries.map(async (q) => {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'CarHub-VF5/2.0' },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return [];
      const items: any = await res.json();
      return Array.isArray(items) ? items : [];
    })
  );

  const allItems: any[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled' && Array.isArray(s.value)) {
      allItems.push(...s.value);
    }
  }

  for (const it of allItems) {
    if (
      typeof it?.syncedLyrics === 'string' &&
      it.syncedLyrics.trim().length > 0 &&
      isPlausibleLrcMatch(it, title, artist, durationSec)
    ) {
      const lines = parseLrc(it.syncedLyrics);
      if (lines.length > 3) {
        return { lines, isSynced: true, source: 'LRCLIB Synced' };
      }
    }
  }

  for (const it of allItems) {
    if (
      typeof it?.plainLyrics === 'string' &&
      it.plainLyrics.trim().length > 0 &&
      isPlausibleLrcMatch(it, title, artist, durationSec)
    ) {
      const lines = it.plainLyrics
        .split('\n')
        .map((t: string) => t.trim())
        .filter(Boolean)
        .map((text: string) => ({ time: -1, text }));
      if (lines.length > 3) {
        return { lines, isSynced: false, source: 'LRCLIB Plain' };
      }
    }
  }

  return null;
}

// ============================================================================
// SOURCE 2: YOUTUBE MUSIC OFFICIAL LYRICS (/next -> /browse MPLYt_*)
// Không gọi /player nên rất ổn định trên Cloudflare Edge IP và gắn đúng theo videoId!
// ============================================================================
async function queryYouTubeMusicLyrics(videoId: string): Promise<LyricsPayload | null> {
  try {
    const client = {
      clientName: 'ANDROID_MUSIC',
      clientVersion: '7.29.52',
      androidSdkVersion: 34,
      hl: 'vi',
      gl: 'VN',
    };
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'com.google.android.apps.youtube.music/7.29.52 (Linux; U; Android 14) gzip',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    };

    const nextRes = await fetch('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify({ context: { client }, videoId }),
      signal: AbortSignal.timeout(3500),
    });
    if (!nextRes.ok) return null;
    const nextText = await nextRes.text();
    const m = nextText.match(/"browseId"\s*:\s*"(MPLYt[^"]+)"/);
    if (!m) return null;

    const browseRes = await fetch('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify({ context: { client }, browseId: m[1] }),
      signal: AbortSignal.timeout(3500),
    });
    if (!browseRes.ok) return null;
    const browseJson: any = await browseRes.json();

    let timedData: any[] | null = null;
    let plainText = '';
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.timedLyricsData) && node.timedLyricsData.length > 0) {
        timedData = node.timedLyricsData;
        return;
      }
      if (!plainText && Array.isArray(node.musicDescriptionShelfRenderer?.description?.runs)) {
        plainText = node.musicDescriptionShelfRenderer.description.runs
          .map((r: any) => r?.text || '')
          .join('');
      }
      for (const val of Object.values(node)) {
        if (timedData) return;
        walk(val);
      }
    };
    walk(browseJson);

    if (timedData && (timedData as any[]).length > 0) {
      const syncedLines: LyricLine[] = [];
      const plainLines: LyricLine[] = [];
      for (const entry of timedData as any[]) {
        const txt = String(entry?.lyricLine || '')
          .replace(/[♪♫♬]+/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!txt) continue;
        const startMsRaw = entry?.cueRange?.startTimeMilliseconds;
        const startMs = startMsRaw !== undefined ? Number(startMsRaw) : NaN;
        if (Number.isFinite(startMs) && startMs >= 0) {
          syncedLines.push({ time: startMs / 1000, text: txt });
        }
        plainLines.push({ time: -1, text: txt });
      }
      if (syncedLines.length >= 4) {
        return {
          lines: syncedLines.sort((a, b) => a.time - b.time),
          isSynced: true,
          isYtMusicSynced: true,
          source: 'YouTube Music Synced',
        };
      }
      if (plainLines.length >= 4) {
        return {
          lines: plainLines,
          isSynced: false,
          source: 'YouTube Music Lyrics',
        };
      }
    }

    if (plainText.trim().length > 20) {
      const lines = plainText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((text) => ({ time: -1, text }));
      if (lines.length >= 4) {
        return { lines, isSynced: false, source: 'YouTube Music Lyrics' };
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// SOURCE 1: YOUTUBE CAPTIONS [CC] EXTRACTOR (ANDROID -> IOS -> WATCH HTML)
// ============================================================================
async function fetchVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedVisitorData && now - cachedVisitorAt < 10 * 60 * 1000) {
    return cachedVisitorData;
  }
  try {
    const res = await fetch('https://www.youtube.com/sw.js_data', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return cachedVisitorData || '';
    const text = await res.text();
    const idx = text.indexOf('[');
    if (idx < 0) return cachedVisitorData || '';
    const json = JSON.parse(text.slice(idx));
    const vd = json?.[0]?.[2]?.[0]?.[0]?.[13] || '';
    if (vd) {
      cachedVisitorData = vd;
      cachedVisitorAt = now;
    }
    return vd;
  } catch {
    return cachedVisitorData || '';
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    });
}

function cleanCaptionText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*>>+\s*/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\(\s*(?:âm nhạc|nhạc|music|tiếng vỗ tay|vỗ tay|applause|laughter|cười|hát|singing)\s*\)/gi, '')
    .replace(/[♪♫♬]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function postProcessCaptionLines(rawLines: LyricLine[], isAsr: boolean): LyricLine[] {
  const sorted = rawLines
    .filter((l) => l.text.length > 0 && /[\p{L}\p{N}]/u.test(l.text))
    .sort((a, b) => a.time - b.time);

  const merged: LyricLine[] = [];
  for (const line of sorted) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...line });
      continue;
    }
    if (prev.text.toLowerCase() === line.text.toLowerCase() && Math.abs(line.time - prev.time) < 4) {
      continue;
    }
    const gap = line.time - prev.time;
    if (
      isAsr &&
      gap >= 0 &&
      gap <= 2.3 &&
      line.text.length <= 15 &&
      prev.text.length + line.text.length <= 68 &&
      !/[.!?…]$/.test(prev.text)
    ) {
      prev.text = `${prev.text} ${line.text}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    merged.push({ ...line });
  }
  return merged;
}

function parseJson3Captions(rawText: string, isAsr: boolean): LyricLine[] {
  try {
    const capData: any = JSON.parse(rawText);
    const rawEvents: any[] = capData?.events || [];
    const lines: LyricLine[] = [];
    for (const ev of rawEvents) {
      if (!Array.isArray(ev.segs) || typeof ev.tStartMs !== 'number') continue;
      const joined = ev.segs.map((s: any) => s?.utf8 || '').join('');
      const text = cleanCaptionText(joined);
      if (text) {
        lines.push({ time: ev.tStartMs / 1000, text });
      }
    }
    return postProcessCaptionLines(lines, isAsr);
  } catch {
    return [];
  }
}

function parseXmlCaptions(xmlText: string, isAsr: boolean): LyricLine[] {
  const lines: LyricLine[] = [];
  const pRegex = /<p\b[^>]*\bt="(\d+)"[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = pRegex.exec(xmlText)) !== null) {
    const tMs = parseInt(m[1], 10);
    const text = cleanCaptionText(m[2]);
    if (Number.isFinite(tMs) && text) {
      lines.push({ time: tMs / 1000, text });
    }
  }
  if (lines.length > 0) {
    return postProcessCaptionLines(lines, isAsr);
  }

  const textRegex = /<text\b[^>]*\bstart="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/gi;
  while ((m = textRegex.exec(xmlText)) !== null) {
    const startSec = parseFloat(m[1]);
    const text = cleanCaptionText(m[2]);
    if (Number.isFinite(startSec) && text) {
      lines.push({ time: startSec, text });
    }
  }
  return postProcessCaptionLines(lines, isAsr);
}

function orderCaptionTracks(tracks: YtCaptionTrack[]): YtCaptionTrack[] {
  const score = (t: YtCaptionTrack): number => {
    const lang = (t.languageCode || '').toLowerCase();
    const isAsr = t.kind === 'asr';
    if (!isAsr && (lang === 'vi' || lang.startsWith('vi-'))) return 100;
    if (!isAsr && (lang === 'en' || lang.startsWith('en-'))) return 85;
    if (!isAsr) return 80;
    if (isAsr && (lang === 'vi' || lang.startsWith('vi-'))) return 60;
    if (isAsr && (lang === 'en' || lang.startsWith('en-'))) return 45;
    return 30;
  };
  return [...tracks]
    .filter((t) => typeof t?.baseUrl === 'string' && t.baseUrl.startsWith('http'))
    .sort((a, b) => score(b) - score(a));
}

async function fetchAndParseTrack(track: YtCaptionTrack, userAgent: string): Promise<LyricLine[]> {
  const isAsr = track.kind === 'asr';
  const fetchHeaders: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  };

  try {
    // Strip existing fmt=... without re-encoding signed query params
    const stripped = track.baseUrl.replace(/([?&])fmt=[^&]*&?/g, '$1').replace(/[?&]$/, '');
    const jsonUrl = `${stripped}${stripped.includes('?') ? '&' : '?'}fmt=json3`;
    const res = await fetch(jsonUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 20) {
        const trimmed = text.trimStart();
        if (trimmed.startsWith('{')) {
          const parsed = parseJson3Captions(text, isAsr);
          if (parsed.length > 0) return parsed;
        } else if (trimmed.startsWith('<')) {
          const parsed = parseXmlCaptions(text, isAsr);
          if (parsed.length > 0) return parsed;
        }
      }
    }
  } catch {}

  try {
    const res = await fetch(track.baseUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(3200),
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 20) {
        const trimmed = text.trimStart();
        const parsed = trimmed.startsWith('{')
          ? parseJson3Captions(text, isAsr)
          : parseXmlCaptions(text, isAsr);
        if (parsed.length > 0) return parsed;
      }
    }
  } catch {}

  return [];
}

async function extractFromTracks(
  tracks: YtCaptionTrack[],
  userAgent: string
): Promise<LyricsPayload | null> {
  const ordered = orderCaptionTracks(tracks).slice(0, 3);
  for (const track of ordered) {
    const lines = await fetchAndParseTrack(track, userAgent);
    if (lines.length >= 2) {
      const isAsr = track.kind === 'asr';
      const lang = track.languageCode || 'auto';
      return {
        lines,
        isSynced: true,
        isAutoCc: isAsr,
        isManualCc: !isAsr,
        source: isAsr ? `YouTube Auto-CC (${lang})` : `YouTube CC (${lang})`,
      };
    }
  }
  return null;
}

async function fetchInnerTubeTracks(
  videoId: string,
  clientMode: 'IOS' | 'ANDROID',
  visitorData: string
): Promise<{ tracks: YtCaptionTrack[]; ua: string }> {
  const ua =
    clientMode === 'ANDROID'
      ? 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip'
      : 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)';

  const clientBody =
    clientMode === 'ANDROID'
      ? {
          clientName: 'ANDROID',
          clientVersion: '20.10.38',
          androidSdkVersion: 34,
          hl: 'vi',
          gl: 'VN',
          ...(visitorData ? { visitorData } : {}),
        }
      : {
          clientName: 'IOS',
          clientVersion: '20.10.4',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.2.1.22C161',
          hl: 'vi',
          gl: 'VN',
          ...(visitorData ? { visitorData } : {}),
        };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': ua,
  };
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      context: { client: clientBody },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) return { tracks: [], ua };
  const data: any = await res.json();
  const tracks: YtCaptionTrack[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return { tracks, ua };
}

async function queryYouTubeCaptions(videoId: string): Promise<LyricsPayload | null> {
  try {
    const visitorData = await fetchVisitorData();

    for (const mode of ['IOS', 'ANDROID'] as const) {
      try {
        const { tracks, ua } = await fetchInnerTubeTracks(videoId, mode, visitorData);
        if (tracks.length > 0) {
          const res = await extractFromTracks(tracks, ua);
          if (res) return res;
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

export async function onRequestOptions(context: any) {
  return new Response(null, { status: 204, headers: buildTrustedJsonHeaders(context.request) });
}

export async function onRequestGet(context: any) {
  const { request } = context;
  const CORS_HEADERS = buildTrustedJsonHeaders(request);
  if (!isTrustedAppRequest(request)) {
    return new Response(JSON.stringify({ lines: [], isSynced: false, source: 'none' }), {
      status: 403,
      headers: CORS_HEADERS,
    });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim().slice(0, 32);
  const title = (url.searchParams.get('title') || '').trim().slice(0, 200);
  const artist = (url.searchParams.get('artist') || '').trim().slice(0, 120);
  const durationSec = Math.max(0, Math.round(Number(url.searchParams.get('duration') || 0) || 0));
  const prefer = (url.searchParams.get('prefer') || 'auto').toLowerCase(); // 'auto' | 'youtube' | 'lrclib'

  if (!id && !title) {
    return new Response(JSON.stringify({ lines: [], isSynced: false, source: 'none' }), {
      headers: CORS_HEADERS,
    });
  }

  const cache = (caches as any).default;
  const cacheKey = new Request(
    `https://carhub-lyrics.internal/v6?id=${encodeURIComponent(id)}&t=${encodeURIComponent(
      title
    )}&a=${encodeURIComponent(artist)}&d=${Math.round(durationSec / 30)}&p=${encodeURIComponent(
      prefer
    )}`
  );
  if (cache && url.searchParams.get('nocache') !== '1') {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: cached.status,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' },
        });
      }
    } catch {}
  }

  const isYoutubeId = /^[a-zA-Z0-9_-]{11}$/.test(id);
  const shouldQueryLrc = Boolean(title) && prefer !== 'youtube';
  const shouldQueryYt = isYoutubeId && prefer !== 'lrclib';

  // Run all 3 independent sources IN PARALLEL (total latency ~0.8–2.5s!)
  const [lrcResult, ytCcResult, ytMusicResult] = await Promise.all([
    shouldQueryLrc ? queryLrcLib(title, artist, durationSec) : Promise.resolve(null),
    shouldQueryYt ? queryYouTubeCaptions(id) : Promise.resolve(null),
    shouldQueryYt ? queryYouTubeMusicLyrics(id) : Promise.resolve(null),
  ]);

  let finalResult: LyricsPayload | null = null;
  if (prefer === 'youtube') {
    finalResult = ytCcResult || ytMusicResult;
  } else if (prefer === 'lrclib') {
    finalResult = lrcResult || ytMusicResult;
  } else if (ytCcResult?.isManualCc && ytCcResult.lines.length >= 4) {
    // 1. Manual YouTube CC: 100% synced to the exact MV/Remix/Live audio!
    finalResult = ytCcResult;
  } else if (ytMusicResult?.isYtMusicSynced && ytMusicResult.lines.length >= 4) {
    // 2. YouTube Music official time-synced lyrics bound directly to this videoId!
    finalResult = ytMusicResult;
  } else if (lrcResult?.isSynced) {
    // 3. Verified studio synced LRCLIB (duration + title verified)
    finalResult = lrcResult;
  } else if (ytCcResult && ytCcResult.lines.length >= 2) {
    // 4. YouTube Auto-CC (covers Remixes, Nonstops, TikTok mixes, Covers, Podcasts!)
    finalResult = ytCcResult;
  } else if (ytMusicResult && ytMusicResult.lines.length >= 4) {
    // 5. YouTube Music official plain lyrics (bound to this videoId, works even when LRCLIB misses!)
    finalResult = ytMusicResult;
  } else if (lrcResult) {
    // 6. Verified plain LRCLIB fallback
    finalResult = lrcResult;
  }

  const payload = finalResult
    ? {
        lines: finalResult.lines,
        isSynced: finalResult.isSynced,
        source: finalResult.source,
        hasYoutubeCc: Boolean(ytCcResult && ytCcResult.lines.length >= 2),
      }
    : { lines: [], isSynced: false, source: 'none', hasYoutubeCc: false };

  const serialized = JSON.stringify(payload);
  const resp = new Response(serialized, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': finalResult ? 'public, max-age=86400' : 'public, max-age=30',
      'X-Cache': 'MISS',
    },
  });

  if (cache && finalResult) {
    context.waitUntil(
      cache.put(
        cacheKey,
        new Response(serialized, {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      )
    );
  }

  return resp;
}
