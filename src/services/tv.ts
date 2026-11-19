import { TvChannel, TvPlaylistData, TvResolvedStream } from '../types';

export const DEFAULT_TV_PLAYLIST_URL = 'https://tinyurl.com/vmt47';

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
        totalDrmFiltered: Number(json.totalDrmFiltered || 0),
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

export async function resolveTvStream(
  channel: TvChannel,
  signal?: AbortSignal
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
    return {
      stream: {
        mode: json.mode === 'proxy' ? 'proxy' : 'direct',
        streamType: json.streamType === 'audio' ? 'audio' : 'hls',
        playUrl: json.playUrl,
        directUrl: json.directUrl || null,
        proxyUrl: json.proxyUrl || json.playUrl,
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
