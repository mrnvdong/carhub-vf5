import { TvChannel, TvPingResult, TvPlaylistData, TvResolvedStream } from '../types';

export const DEFAULT_TV_PLAYLIST_URL = 'https://tinyurl.com/vmt47';

export function buildTvProxyUrl(channel: TvChannel, targetUrl?: string): string {
  const params = new URLSearchParams();
  params.set('action', 'proxy');
  params.set('url', targetUrl || channel.url);
  if (channel.ua) params.set('ua', channel.ua);
  if (channel.referer) params.set('ref', channel.referer);
  return `/api/tv?${params.toString()}`;
}

export async function fetchTvPlaylist(
  playlistUrl: string = DEFAULT_TV_PLAYLIST_URL,
  signal?: AbortSignal
): Promise<{ data: TvPlaylistData | null; error?: string }> {
  try {
    const res = await fetch(
      `/api/tv?action=playlist&url=${encodeURIComponent(playlistUrl.trim() || DEFAULT_TV_PLAYLIST_URL)}`,
      { signal }
    );
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { data: null, error: 'Máy chủ không trả về dữ liệu kênh TV hợp lệ.' };
    }
    const json = await res.json();
    if (!res.ok || !json?.success || !Array.isArray(json.channels)) {
      return {
        data: null,
        error: json?.error || 'Không tải được danh sách kênh TV.',
      };
    }
    return {
      data: {
        sourceUrl: json.sourceUrl || playlistUrl,
        resolvedSourceUrl: json.resolvedSourceUrl,
        epgUrl: json.epgUrl || null,
        totalRaw: Number(json.totalRaw || json.channels.length),
        totalPlayable: Number(json.totalPlayable || json.channels.length),
        totalDrmCount: Number(json.totalDrmCount || 0),
        groups: Array.isArray(json.groups) ? json.groups : [],
        channels: json.channels as TvChannel[],
      },
    };
  } catch (err: any) {
    if (signal?.aborted) return { data: null };
    return {
      data: null,
      error: err?.message || 'Lỗi kết nối khi tải danh sách kênh TV.',
    };
  }
}

interface DirectProbeResult {
  ok: boolean;
  streamType?: 'hls' | 'mpd' | 'audio';
  finalUrl?: string;
  latencyMs: number;
  corsOrMixedError?: boolean;
  httpStatus?: number;
  reason?: string;
}

/**
 * Thử bắt sóng trực tiếp từ chính IP mạng Việt Nam của thiết bị (giống hệt App VLC!).
 * Tránh hoàn toàn tình trạng IP máy chủ nước ngoài/Cloudflare bị nhà đài VN (TV360, VTVGo, SCTV...)
 * chặn geo-block 403/404 hoặc cấp token khóa sai IP!
 */
export async function probeChannelDirectInBrowser(
  channel: TvChannel,
  outerSignal?: AbortSignal,
  timeoutMs = 4500
): Promise<DirectProbeResult> {
  const t0 = Date.now();
  if (!channel.url.startsWith('https://') || channel.referer) {
    return { ok: false, latencyMs: 0, corsOrMixedError: true, reason: 'Cần Proxy HTTP/Referer' };
  }

  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) {
      return { ok: false, latencyMs: 0, reason: 'Đã hủy' };
    }
    outerSignal.addEventListener('abort', onOuterAbort, { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(channel.url, {
      mode: 'cors',
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    const finalUrl = res.url || channel.url;

    if (!finalUrl.startsWith('https://')) {
      try {
        await res.body?.cancel();
      } catch {}
      return { ok: false, latencyMs, corsOrMixedError: true, reason: 'Chuyển hướng HTTP' };
    }

    if (/\/error\.mp4(\?|$)/i.test(finalUrl)) {
      try {
        await res.body?.cancel();
      } catch {}
      return { ok: false, latencyMs, httpStatus: 404, reason: 'Nguồn báo lỗi tạm thời' };
    }

    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {}
      return { ok: false, latencyMs, httpStatus: res.status, reason: `HTTP ${res.status}` };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isHlsCt = ct.includes('mpegurl');
    const isMpdCt = ct.includes('dash+xml');
    const isDirectAudio = !isHlsCt && (ct.includes('audio/') || ct.includes('aacp'));

    if (isDirectAudio) {
      try {
        await res.body?.cancel();
      } catch {}
      return { ok: true, streamType: 'audio', finalUrl, latencyMs };
    }

    let headText = '';
    try {
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let bytesRead = 0;
        while (bytesRead < 2048) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          headText += decoder.decode(value, { stream: true });
          bytesRead += value.byteLength;
        }
        try {
          await reader.cancel();
        } catch {}
      } else {
        headText = (await res.text()).slice(0, 2048);
      }
    } catch {}

    const trimmed = headText.trimStart();
    const isMpd = trimmed.includes('<MPD') || isMpdCt || /\.mpd(\?|$)/i.test(finalUrl);
    const isHls = trimmed.startsWith('#EXTM3U') || isHlsCt || /\.m3u8(\?|$)/i.test(finalUrl);

    if (!isHls && !isMpd) {
      return { ok: false, latencyMs, reason: 'Không phải luồng HLS/DASH' };
    }

    // Kiểm tra nhanh xem bên trong file M3U8 có chứa link con http:// (Mixed Content) không
    if (isHls && /\n\s*http:\/\//i.test(headText)) {
      return { ok: false, latencyMs, corsOrMixedError: true, reason: 'Luồng con dùng HTTP' };
    }

    return {
      ok: true,
      streamType: isMpd ? 'mpd' : 'hls',
      finalUrl,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    if (outerSignal?.aborted) {
      return { ok: false, latencyMs, reason: 'Đã hủy' };
    }
    const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError';
    return {
      ok: false,
      latencyMs,
      corsOrMixedError: !isTimeout,
      reason: isTimeout ? 'Quá thời gian phản hồi' : 'CORS / Mixed Content',
    };
  } finally {
    window.clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onOuterAbort);
  }
}

export async function resolveTvStreamViaServer(
  channel: TvChannel,
  signal?: AbortSignal,
  forceProxy = false
): Promise<{ stream: TvResolvedStream | null; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.set('action', 'resolve');
    params.set('url', channel.url);
    if (channel.ua) params.set('ua', channel.ua);
    if (channel.referer) params.set('ref', channel.referer);

    const res = await fetch(`/api/tv?${params.toString()}`, {
      signal,
      cache: 'no-store',
    });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return { stream: null, error: 'Không phân giải được luồng phát kênh này.' };
    }
    const json = await res.json();
    if (!res.ok || !json?.success || !json.playUrl) {
      return {
        stream: null,
        error: json?.error || 'Kênh hiện không phát sóng hoặc đang gián đoạn.',
      };
    }
    const mode: 'direct' | 'proxy' = forceProxy ? 'proxy' : json.mode === 'proxy' ? 'proxy' : 'direct';
    const proxyUrl = json.proxyUrl || buildTvProxyUrl(channel, json.directUrl || channel.url);
    return {
      stream: {
        mode,
        streamType:
          json.streamType === 'audio' ? 'audio' : json.streamType === 'mpd' ? 'mpd' : 'hls',
        playUrl: mode === 'proxy' ? proxyUrl : json.playUrl,
        directUrl: json.directUrl || null,
        proxyUrl,
      },
    };
  } catch (err: any) {
    if (signal?.aborted) return { stream: null };
    return {
      stream: null,
      error: err?.message || 'Mất kết nối tới nguồn phát kênh.',
    };
  }
}

export async function resolveTvStream(
  channel: TvChannel,
  signal?: AbortSignal,
  options: { forceProxy?: boolean; allowNativeNoCors?: boolean } = {}
): Promise<{ stream: TvResolvedStream | null; error?: string }> {
  const { forceProxy = false, allowNativeNoCors = false } = options;

  // 1. Ưu tiên bắt sóng TRỰC TIẾP từ IP mạng Việt Nam của người dùng (giống VLC -> không bị geo-block/sai IP token!)
  if (!forceProxy && channel.url.startsWith('https://') && !channel.referer) {
    let direct = await probeChannelDirectInBrowser(channel, signal, 4500);
    if (signal?.aborted) return { stream: null };

    // Một số nguồn load-balance (như vmttv.dpdns.org) lúc trỏ node HTTP lúc trỏ node HTTPS -> thử thêm 1 nhịp trực tiếp cực nhanh!
    if (
      !direct.ok &&
      (direct.reason === 'Chuyển hướng HTTP' ||
        direct.reason === 'Nguồn báo lỗi tạm thời' ||
        direct.httpStatus === 404 ||
        direct.httpStatus === 502 ||
        direct.httpStatus === 503)
    ) {
      direct = await probeChannelDirectInBrowser(channel, signal, 4000);
      if (signal?.aborted) return { stream: null };
    }

    if (direct.ok && direct.finalUrl && direct.streamType) {
      return {
        stream: {
          mode: 'direct',
          streamType: direct.streamType,
          playUrl: direct.finalUrl,
          directUrl: direct.finalUrl,
          proxyUrl: buildTvProxyUrl(channel, direct.finalUrl),
        },
      };
    }

    // Trên Apple Safari / CarPlay: AVPlayer phát Native HLS KHÔNG cần CORS -> cho phát thẳng trực tiếp từ IP người dùng!
    if (
      allowNativeNoCors &&
      direct.corsOrMixedError &&
      channel.manifestType !== 'mpd' &&
      !channel.isDrm
    ) {
      return {
        stream: {
          mode: 'direct',
          streamType: channel.isRadio && !/\.m3u8(\?|$)/i.test(channel.url) ? 'audio' : 'hls',
          playUrl: channel.url,
          directUrl: channel.url,
          proxyUrl: buildTvProxyUrl(channel, channel.url),
        },
      };
    }
  }

  // 2. Chỉ dùng Cloudflare Worker khi kênh dùng HTTP thường, cần Referer/UA riêng, hoặc bị CORS trên Chrome/Desktop
  return resolveTvStreamViaServer(channel, signal, forceProxy);
}

/**
 * Ping kiểm tra trạng thái Live/Off thông minh:
 * - Kênh HTTPS không cần Referer -> Ping TRỰC TIẾP từ mạng Việt Nam của thiết bị (đo đúng độ trễ thực, không bị báo ảo Off!).
 * - Chỉ các kênh HTTP / CORS chặn / cần Referer mới nhờ Cloudflare Worker ping hộ.
 */
export async function pingTvChannelsBatch(
  channels: TvChannel[],
  signal?: AbortSignal
): Promise<Record<string, TvPingResult>> {
  if (channels.length === 0) return {};

  const checkedAt = Date.now();
  const merged: Record<string, TvPingResult> = {};
  const needServerPing: TvChannel[] = [];

  const batch = channels.slice(0, 14);
  const directCandidates: TvChannel[] = [];

  for (const ch of batch) {
    if (ch.url.startsWith('https://') && !ch.referer) {
      directCandidates.push(ch);
    } else {
      needServerPing.push(ch);
    }
  }

  if (directCandidates.length > 0) {
    const settled = await Promise.all(
      directCandidates.map(async (ch) => {
        const res = await probeChannelDirectInBrowser(ch, signal, 3800);
        return { ch, res };
      })
    );
    if (signal?.aborted) return {};

    for (const { ch, res } of settled) {
      if (res.ok) {
        merged[ch.id] = {
          status: 'live',
          latencyMs: res.latencyMs,
          checkedAt,
        };
      } else if (res.corsOrMixedError || (res.httpStatus === 403 && Boolean(ch.ua))) {
        // Có thể chạy được qua Proxy (HTTP redirect / CORS / UA riêng) -> kiểm chứng bằng server
        needServerPing.push(ch);
      } else {
        merged[ch.id] = {
          status: 'dead',
          latencyMs: res.latencyMs,
          checkedAt,
          reason: res.reason || 'Không có tín hiệu',
        };
      }
    }
  }

  if (needServerPing.length > 0 && !signal?.aborted) {
    try {
      const res = await fetch('/api/tv?action=ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: needServerPing.slice(0, 14).map((c) => ({
            id: c.id,
            url: c.url,
            ua: c.ua,
            referer: c.referer,
          })),
        }),
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.results && typeof json.results === 'object') {
          Object.assign(merged, json.results as Record<string, TvPingResult>);
        }
      }
    } catch {
      // Aborted or offline
    }
  }

  return merged;
}
