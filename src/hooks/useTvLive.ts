import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TvChannel, TvPingResult, TvPlaylistData } from '../types';
import { DEFAULT_TV_PLAYLIST_URL, fetchTvPlaylist, pingTvChannelsBatch } from '../services/tv';

const POPULAR_CHANNEL_PATTERNS: RegExp[] = [
  /^vtv\s*1\b/i,
  /^vtv\s*3\b/i,
  /^vtv\s*2\b/i,
  /vov\s*giao\s*thông\s*hà\s*nội/i,
  /vov\s*giao\s*thông\s*hồ\s*chí\s*minh/i,
  /^vov\s*1\b/i,
  /^vov\s*3\b/i,
  /^voh\s*fm\s*99\.9/i,
  /^htv\s*7\b/i,
  /^htv\s*9\b/i,
  /^vtv\s*5\b/i,
  /^vtv\s*7\b/i,
  /^vtv\s*8\b/i,
  /^vtv\s*9\b/i,
  /^360\s*c1/i,
  /^360\s*bundesliga/i,
  /^on\s*sports\b/i,
  /^sctv\s*1\b/i,
  /^htv\s*1\b/i,
  /^tvb\s*việt\s*nam/i,
];

const PING_TTL_MS = 5 * 60 * 1000; // Cache kết quả ping 5 phút

export function stripVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function getChannelFavKey(ch: TvChannel): string {
  return `${ch.group}::${ch.name}`.toLowerCase();
}

export interface TvLiveController {
  playlistUrl: string;
  setPlaylistUrl: (url: string) => void;
  playlist: TvPlaylistData | null;
  isLoadingPlaylist: boolean;
  playlistError: string | null;
  reloadPlaylist: () => void;
  activeChannel: TvChannel | null;
  setActiveChannel: (ch: TvChannel | null) => void;
  favoriteKeys: string[];
  favoriteSet: Set<string>;
  toggleFavoriteChannel: (ch: TvChannel) => void;
  popularChannels: TvChannel[];
  pingMap: Record<string, TvPingResult>;
  isPinging: boolean;
  pingChannels: (channels: TvChannel[], force?: boolean) => Promise<void>;
  cancelPing: () => void;
  markChannelLiveState: (channelId: string, status: 'live' | 'dead', reason?: string) => void;
}

export function useTvLive(
  shouldActivate: boolean,
  onNotifyToast?: (msg: string) => void
): TvLiveController {
  const [hasActivated, setHasActivated] = useState<boolean>(shouldActivate);
  useEffect(() => {
    if (shouldActivate && !hasActivated) {
      setHasActivated(true);
    }
  }, [shouldActivate, hasActivated]);

  const [playlistUrl, setPlaylistUrlState] = useState<string>(() => {
    try {
      return localStorage.getItem('carhub_tv_playlist_url') || DEFAULT_TV_PLAYLIST_URL;
    } catch {
      return DEFAULT_TV_PLAYLIST_URL;
    }
  });

  const [playlist, setPlaylist] = useState<TvPlaylistData | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<TvChannel | null>(null);

  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_tv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [pingMap, setPingMap] = useState<Record<string, TvPingResult>>({});
  const pingMapRef = useRef<Record<string, TvPingResult>>(pingMap);
  pingMapRef.current = pingMap;

  const [isPinging, setIsPinging] = useState<boolean>(false);
  const pingAbortRef = useRef<AbortController | null>(null);
  const onNotifyToastRef = useRef(onNotifyToast);
  onNotifyToastRef.current = onNotifyToast;

  useEffect(() => {
    try {
      localStorage.setItem('carhub_tv_favorites', JSON.stringify(favoriteKeys));
    } catch {}
  }, [favoriteKeys]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_tv_playlist_url', playlistUrl);
    } catch {}
  }, [playlistUrl]);

  useEffect(() => {
    if (!activeChannel) return;
    try {
      localStorage.setItem('carhub_tv_last_channel', activeChannel.name);
    } catch {}
  }, [activeChannel]);

  const loadPlaylist = useCallback(async (urlToLoad: string) => {
    setIsLoadingPlaylist(true);
    setPlaylistError(null);
    const controller = new AbortController();
    const { data, error } = await fetchTvPlaylist(urlToLoad, controller.signal);
    if (data) {
      setPlaylist(data);
      setPlaylistError(null);
      setPingMap({});
      setActiveChannel((prev) => {
        if (prev && data.channels.some((c) => c.url === prev.url)) return prev;
        try {
          const lastName = localStorage.getItem('carhub_tv_last_channel');
          if (lastName) {
            const matched = data.channels.find((c) => c.name === lastName);
            if (matched) return matched;
          }
        } catch {}
        return (
          data.channels.find((c) => /^vtv\s*1\b/i.test(c.name)) ||
          data.channels[0] ||
          null
        );
      });
    } else if (error) {
      setPlaylistError(error);
    }
    setIsLoadingPlaylist(false);
  }, []);

  useEffect(() => {
    if (!hasActivated) return;
    loadPlaylist(playlistUrl);
  }, [hasActivated, playlistUrl, loadPlaylist]);

  const setPlaylistUrl = useCallback((url: string) => {
    const cleaned = url.trim() || DEFAULT_TV_PLAYLIST_URL;
    setPlaylistUrlState(cleaned);
  }, []);

  const reloadPlaylist = useCallback(() => {
    loadPlaylist(playlistUrl);
  }, [loadPlaylist, playlistUrl]);

  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

  const toggleFavoriteChannel = useCallback((ch: TvChannel) => {
    const key = getChannelFavKey(ch);
    setFavoriteKeys((prev) => {
      const exists = prev.includes(key);
      onNotifyToastRef.current?.(
        exists ? `Đã bỏ yêu thích ${ch.name}` : `⭐ Đã lưu kênh ${ch.name}`
      );
      return exists ? prev.filter((k) => k !== key) : [key, ...prev];
    });
  }, []);

  const popularChannels = useMemo(() => {
    if (!playlist) return [];
    const picked: TvChannel[] = [];
    const used = new Set<string>();
    for (const pat of POPULAR_CHANNEL_PATTERNS) {
      const found = playlist.channels.find((c) => !used.has(c.id) && pat.test(c.name));
      if (found) {
        used.add(found.id);
        picked.push(found);
      }
    }
    if (picked.length < 20) {
      for (const ch of playlist.channels) {
        if (used.has(ch.id)) continue;
        if (ch.group === 'VTV' || ch.group === 'Radio' || ch.group === 'HTV') {
          used.add(ch.id);
          picked.push(ch);
          if (picked.length >= 26) break;
        }
      }
    }
    return picked;
  }, [playlist]);

  const cancelPing = useCallback(() => {
    pingAbortRef.current?.abort();
    pingAbortRef.current = null;
    setIsPinging(false);
  }, []);

  // Ping hàng loạt theo từng đợt 10 kênh song song (có cache 5 phút, không làm nghẽn mạng)
  const pingChannels = useCallback(async (channels: TvChannel[], force = false) => {
    const now = Date.now();
    const targets = channels.filter((ch) => {
      if (force) return true;
      const existing = pingMapRef.current[ch.id];
      if (!existing) return true;
      if (existing.status === 'checking') return false;
      if (existing.checkedAt && now - existing.checkedAt < PING_TTL_MS) return false;
      return true;
    });

    if (targets.length === 0) return;

    pingAbortRef.current?.abort();
    const controller = new AbortController();
    pingAbortRef.current = controller;
    setIsPinging(true);

    // Tối đa 60 kênh mỗi lượt tự động (nếu bấm thủ công có thể ping tới 120 kênh của nhóm)
    const queue = targets.slice(0, force ? 120 : 40);
    const BATCH_SIZE = 10;

    try {
      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = queue.slice(i, i + BATCH_SIZE);

        setPingMap((prev) => {
          const next = { ...prev };
          for (const c of batch) {
            next[c.id] = { ...(next[c.id] || {}), status: 'checking' };
          }
          return next;
        });

        const results = await pingTvChannelsBatch(batch, controller.signal);
        if (controller.signal.aborted) break;

        setPingMap((prev) => {
          const next = { ...prev };
          for (const c of batch) {
            if (results[c.id]) {
              next[c.id] = results[c.id];
            } else {
              next[c.id] = { status: 'dead', checkedAt: Date.now(), reason: 'Không phản hồi' };
            }
          }
          return next;
        });
      }
    } finally {
      if (pingAbortRef.current === controller) {
        pingAbortRef.current = null;
        setIsPinging(false);
      }
    }
  }, []);

  const markChannelLiveState = useCallback(
    (channelId: string, status: 'live' | 'dead', reason?: string) => {
      setPingMap((prev) => ({
        ...prev,
        [channelId]: {
          status,
          latencyMs: prev[channelId]?.latencyMs,
          checkedAt: Date.now(),
          reason,
        },
      }));
    },
    []
  );

  useEffect(() => {
    return () => {
      pingAbortRef.current?.abort();
    };
  }, []);

  return {
    playlistUrl,
    setPlaylistUrl,
    playlist,
    isLoadingPlaylist,
    playlistError,
    reloadPlaylist,
    activeChannel,
    setActiveChannel,
    favoriteKeys,
    favoriteSet,
    toggleFavoriteChannel,
    popularChannels,
    pingMap,
    isPinging,
    pingChannels,
    cancelPing,
    markChannelLiveState,
  };
}
