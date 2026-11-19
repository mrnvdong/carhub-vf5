import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Tv,
  Radio,
  Film,
  Search,
  X,
  Star,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  ShieldAlert,
  Wifi,
  AlertCircle,
} from 'lucide-react';
import { TvChannel, TvPlaylistData, TvResolvedStream } from '../types';
import { DEFAULT_TV_PLAYLIST_URL, fetchTvPlaylist, resolveTvStream } from '../services/tv';
import { getCarTheme } from '../utils/theme';

interface TvLiveViewProps {
  onPauseMusic: () => void;
  onNotifyToast: (msg: string) => void;
  isLightTheme: boolean;
}

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
  /^sctv\s*1\b/i,
  /^htv\s*1\b/i,
  /^tvb\s*việt\s*nam/i,
];

function stripVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function getChannelFavKey(ch: TvChannel): string {
  return `${ch.group}::${ch.name}`.toLowerCase();
}

export const TvLiveView: React.FC<TvLiveViewProps> = ({
  onPauseMusic,
  onNotifyToast,
  isLightTheme,
}) => {
  const theme = getCarTheme(isLightTheme);
  const [playlistUrl, setPlaylistUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('carhub_tv_playlist_url') || DEFAULT_TV_PLAYLIST_URL;
    } catch {
      return DEFAULT_TV_PLAYLIST_URL;
    }
  });
  const [customUrlInput, setCustomUrlInput] = useState<string>(playlistUrl);
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);

  const [playlist, setPlaylist] = useState<TvPlaylistData | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState<boolean>(true);
  const [playlistError, setPlaylistError] = useState<string | null>(null);

  const [selectedGroup, setSelectedGroup] = useState<string>('__popular__');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_tv_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeChannel, setActiveChannel] = useState<TvChannel | null>(null);
  const [resolvedStream, setResolvedStream] = useState<TvResolvedStream | null>(null);
  const [streamMode, setStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [isTvFullscreen, setIsTvFullscreen] = useState<boolean>(false);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const didAutoFallbackRef = useRef<boolean>(false);
  const onPauseMusicRef = useRef(onPauseMusic);
  onPauseMusicRef.current = onPauseMusic;

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

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
  }, []);

  // Tải danh sách kênh từ /api/tv?action=playlist
  const loadPlaylist = useCallback(async (urlToLoad: string) => {
    setIsLoadingPlaylist(true);
    setPlaylistError(null);
    const controller = new AbortController();
    const { data, error } = await fetchTvPlaylist(urlToLoad, controller.signal);
    if (data) {
      setPlaylist(data);
      setPlaylistError(null);
      // Tự chọn kênh đầu tiên dễ xem (VTV1 hoặc kênh đầu tiên) nếu chưa chọn kênh nào
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
    loadPlaylist(playlistUrl);
  }, [playlistUrl, loadPlaylist]);

  // Lưu kênh xem gần nhất
  useEffect(() => {
    if (!activeChannel) return;
    try {
      localStorage.setItem('carhub_tv_last_channel', activeChannel.name);
    } catch {}
  }, [activeChannel]);

  // Gắn luồng HLS/Audio vào thẻ <video> (Native Apple HLS trên iOS CarPlay + hls.js trên Desktop Chrome/Firefox)
  const attachMediaUrl = useCallback(
    async (playUrl: string, streamInfo: TvResolvedStream, isFallbackAttempt: boolean) => {
      const video = videoRef.current;
      if (!video) return;

      destroyHls();
      setIsBuffering(true);
      setPlayError(null);
      video.muted = isMuted;

      const tryProxyFallback = () => {
        if (
          !isFallbackAttempt &&
          !didAutoFallbackRef.current &&
          streamInfo.mode === 'direct' &&
          streamInfo.proxyUrl &&
          streamInfo.proxyUrl !== playUrl
        ) {
          didAutoFallbackRef.current = true;
          setStreamMode('proxy');
          attachMediaUrl(streamInfo.proxyUrl, { ...streamInfo, mode: 'proxy' }, true);
          return true;
        }
        return false;
      };

      // Audio stream trực tiếp (Zeno.fm / Icecast)
      if (streamInfo.streamType === 'audio') {
        video.src = playUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

      const canNativeHls = Boolean(
        video.canPlayType('application/vnd.apple.mpegurl') ||
          video.canPlayType('application/x-mpegurl')
      );

      if (canNativeHls) {
        video.src = playUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

      try {
        const HlsModule = await import('hls.js');
        const Hls = HlsModule.default;
        if (!Hls || !Hls.isSupported()) {
          video.src = playUrl;
          video.load();
          video.play().catch(() => {});
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
          maxBufferLength: 24,
          manifestLoadingTimeOut: 10000,
          levelLoadingTimeOut: 10000,
          fragLoadingTimeOut: 12000,
        });
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsBuffering(false);
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (tryProxyFallback()) return;
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError(
              'Kênh này hiện không phát được qua trình duyệt (CDN chặn hoặc đang ngoại tuyến). Thử nút Proxy hoặc đổi kênh khác.'
            );
            destroyHls();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setIsBuffering(false);
              setPlayError('Lỗi giải mã tín hiệu kênh này.');
              destroyHls();
            }
          } else {
            if (tryProxyFallback()) return;
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError('Không phát được tín hiệu kênh này.');
            destroyHls();
          }
        });

        hls.loadSource(playUrl);
        hls.attachMedia(video);
      } catch {
        video.src = playUrl;
        video.load();
        video.play().catch(() => {});
      }
    },
    [destroyHls, isMuted]
  );

  // Phân giải và phát kênh đang chọn
  const startChannel = useCallback(
    async (channel: TvChannel, forceProxy = false) => {
      resolveAbortRef.current?.abort();
      const controller = new AbortController();
      resolveAbortRef.current = controller;
      didAutoFallbackRef.current = forceProxy;

      onPauseMusicRef.current();
      destroyHls();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {}
      }

      setIsResolving(true);
      setIsBuffering(true);
      setIsPlaying(false);
      setPlayError(null);
      setResolvedStream(null);

      const { stream, error } = await resolveTvStream(channel, controller.signal);
      if (controller.signal.aborted) return;

      setIsResolving(false);
      if (!stream) {
        setIsBuffering(false);
        setPlayError(error || 'Không kết nối được tới nguồn kênh này.');
        return;
      }

      setResolvedStream(stream);
      const chosenMode: 'direct' | 'proxy' = forceProxy ? 'proxy' : stream.mode;
      const chosenUrl = forceProxy ? stream.proxyUrl : stream.playUrl;
      setStreamMode(chosenMode);
      attachMediaUrl(chosenUrl, { ...stream, mode: chosenMode }, forceProxy);
    },
    [destroyHls, attachMediaUrl]
  );

  useEffect(() => {
    if (!activeChannel) return;
    startChannel(activeChannel, false);
    return () => {
      resolveAbortRef.current?.abort();
    };
  }, [activeChannel, startChannel]);

  // Dọn dẹp luồng HLS khi rời khỏi màn hình TV (không tốn 4G ngầm!)
  useEffect(() => {
    return () => {
      resolveAbortRef.current?.abort();
      destroyHls();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {}
      }
    };
  }, [destroyHls]);

  // Hỗ trợ phím Escape thoát toàn màn hình TV
  useEffect(() => {
    if (!isTvFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTvFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTvFullscreen]);

  // Đồng bộ danh sách kênh phổ biến & danh sách lọc theo nhóm/từ khóa
  const favoriteSet = useMemo(() => new Set(favoriteKeys), [favoriteKeys]);

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
    if (picked.length < 18) {
      for (const ch of playlist.channels) {
        if (used.has(ch.id)) continue;
        if (ch.group === 'VTV' || ch.group === 'Radio' || ch.group === 'HTV') {
          used.add(ch.id);
          picked.push(ch);
          if (picked.length >= 24) break;
        }
      }
    }
    return picked;
  }, [playlist]);

  const filteredChannels = useMemo(() => {
    if (!playlist) return [];
    const q = stripVietnameseTones(searchQuery.trim());
    if (q) {
      return playlist.channels.filter(
        (c) =>
          stripVietnameseTones(c.name).includes(q) ||
          stripVietnameseTones(c.group).includes(q)
      );
    }
    if (selectedGroup === '__favorites__') {
      return playlist.channels.filter((c) => favoriteSet.has(getChannelFavKey(c)));
    }
    if (selectedGroup === '__popular__') {
      return popularChannels;
    }
    if (selectedGroup === '__all__') {
      return playlist.channels;
    }
    return playlist.channels.filter((c) => c.group === selectedGroup);
  }, [playlist, searchQuery, selectedGroup, favoriteSet, popularChannels]);

  const activeChannelIndex = useMemo(() => {
    if (!activeChannel) return -1;
    return filteredChannels.findIndex((c) => c.id === activeChannel.id);
  }, [filteredChannels, activeChannel]);

  const handleZapChannel = useCallback(
    (delta: number) => {
      const list = filteredChannels.length > 0 ? filteredChannels : playlist?.channels || [];
      if (list.length === 0) return;
      const curIdx = activeChannel ? list.findIndex((c) => c.id === activeChannel.id) : -1;
      const nextIdx =
        curIdx < 0 ? 0 : (curIdx + delta + list.length) % list.length;
      setActiveChannel(list[nextIdx]);
    },
    [filteredChannels, playlist, activeChannel]
  );

  const toggleFavoriteChannel = useCallback(
    (ch: TvChannel) => {
      const key = getChannelFavKey(ch);
      setFavoriteKeys((prev) => {
        const exists = prev.includes(key);
        onNotifyToast(exists ? `Đã bỏ yêu thích ${ch.name}` : `⭐ Đã lưu kênh ${ch.name}`);
        return exists ? prev.filter((k) => k !== key) : [key, ...prev];
      });
    },
    [onNotifyToast]
  );

  const handleTogglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      onPauseMusicRef.current();
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const handleToggleMute = () => {
    const v = videoRef.current;
    const next = !isMuted;
    setIsMuted(next);
    if (v) v.muted = next;
  };

  const handleSwitchStreamMode = () => {
    if (!activeChannel || !resolvedStream) return;
    const nextProxy = streamMode === 'direct';
    if (!nextProxy && !resolvedStream.directUrl) {
      onNotifyToast('Kênh này bắt buộc chạy qua Proxy do nguồn không hỗ trợ HTTPS/CORS.');
      return;
    }
    onNotifyToast(
      nextProxy ? '🔁 Đang chuyển sang chế độ Proxy ổn định...' : '⚡ Đang phát trực tiếp từ CDN...'
    );
    startChannel(activeChannel, nextProxy);
  };

  const isCurrentFav = activeChannel ? favoriteSet.has(getChannelFavKey(activeChannel)) : false;

  return (
    <div className="flex-1 min-h-0 h-full w-full max-w-[1560px] mx-auto flex flex-col car:flex-row gap-2.5 short:gap-2 overflow-y-auto car:overflow-hidden no-scrollbar animate-ios-browse-in">
      {/* =====================================================================
          1. KHUNG PHÁT TV / RADIO TRỰC TIẾP (60% chiều ngang hoặc 100% Toàn màn hình)
         ===================================================================== */}
      <div
        className={`flex flex-col min-h-0 rounded-2xl sm:rounded-3xl border p-2.5 sm:p-3 short:p-2 gap-2 short:gap-1.5 ${theme.card} ${
          isTvFullscreen
            ? 'flex-1 w-full h-full'
            : 'w-full car:w-[58%] lg:w-[61%] shrink-0 car:h-full'
        }`}
      >
        {/* Thanh tiêu đề kênh đang xem */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {activeChannel?.logo && !failedLogos[activeChannel.id] ? (
              <img
                src={activeChannel.logo}
                alt=""
                onError={() =>
                  setFailedLogos((prev) => ({ ...prev, [activeChannel.id]: true }))
                }
                className={`w-9 h-9 short:w-8 short:h-8 rounded-xl object-contain p-1 shrink-0 border ${
                  isLightTheme ? 'bg-slate-900 border-slate-300' : 'bg-black/60 border-white/15'
                }`}
              />
            ) : (
              <div
                className={`w-9 h-9 short:w-8 short:h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                  isLightTheme
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-sky-500/20 border-sky-400/40 text-sky-300'
                }`}
              >
                {activeChannel?.isRadio ? (
                  <Radio className="w-4 h-4" />
                ) : activeChannel?.isVod ? (
                  <Film className="w-4 h-4" />
                ) : (
                  <Tv className="w-4 h-4" />
                )}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {activeChannel?.isVod ? 'PHIM' : activeChannel?.isRadio ? 'RADIO' : 'LIVE'}
                </span>
                <h3 className={`text-xs sm:text-sm font-black truncate ${theme.text}`}>
                  {activeChannel ? activeChannel.name : 'Truyền hình & Radio VF5'}
                </h3>
              </div>
              <p className={`text-[10.5px] font-semibold truncate mt-0.5 ${theme.textSub}`}>
                {activeChannel
                  ? `${activeChannel.group} • ${
                      streamMode === 'proxy' ? 'Proxy chống chặn CORS' : 'CDN trực tiếp'
                    }`
                  : 'Chọn kênh bên phải để phát ngay'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activeChannel && (
              <button
                type="button"
                onClick={() => toggleFavoriteChannel(activeChannel)}
                aria-label={isCurrentFav ? 'Bỏ yêu thích kênh' : 'Lưu kênh yêu thích'}
                title={isCurrentFav ? 'Bỏ khỏi Yêu thích' : 'Lưu kênh Yêu thích'}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                  isCurrentFav
                    ? 'bg-amber-400 border-amber-400 text-slate-950'
                    : theme.iconBtn
                }`}
              >
                <Star className={`w-4 h-4 ${isCurrentFav ? 'fill-slate-950' : ''}`} />
              </button>
            )}

            {activeChannel && (
              <button
                type="button"
                onClick={handleSwitchStreamMode}
                title="Đổi giữa phát CDN trực tiếp và Proxy chống chặn"
                className={`h-8 px-2 rounded-xl border text-[10px] font-extrabold flex items-center gap-1 active:scale-95 transition ${
                  streamMode === 'proxy'
                    ? isLightTheme
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                    : theme.iconBtn
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden xs:inline">
                  {streamMode === 'proxy' ? 'Proxy' : 'Trực tiếp'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsTvFullscreen((v) => !v)}
              aria-label={isTvFullscreen ? 'Thu gọn danh sách kênh' : 'Xem TV toàn màn hình'}
              title={isTvFullscreen ? 'Hiện danh sách kênh' : 'Xem toàn màn hình'}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                isLightTheme
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-sky-300'
              }`}
            >
              {isTvFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Sân khấu phát Video 16:9 / Radio Studio */}
        <div
          className={`media-stage relative flex-1 min-h-[190px] car:min-h-0 w-full flex items-center justify-center rounded-2xl overflow-hidden bg-black border shadow-inner ${
            isLightTheme ? 'border-slate-300' : 'border-white/12'
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            autoPlay
            controls={false}
            onClick={handleTogglePlay}
            onPlaying={() => {
              setIsPlaying(true);
              setIsBuffering(false);
              setPlayError(null);
            }}
            onPause={() => setIsPlaying(false)}
            onWaiting={() => setIsBuffering(true)}
            onError={() => {
              // Trên iOS Safari native HLS, nếu phát trực tiếp lỗi -> tự chuyển sang Proxy 1 lần
              if (
                resolvedStream &&
                streamMode === 'direct' &&
                !didAutoFallbackRef.current &&
                resolvedStream.proxyUrl
              ) {
                didAutoFallbackRef.current = true;
                setStreamMode('proxy');
                attachMediaUrl(resolvedStream.proxyUrl, { ...resolvedStream, mode: 'proxy' }, true);
                return;
              }
              setIsBuffering(false);
              setIsPlaying(false);
              setPlayError('Tín hiệu kênh bị gián đoạn — Bấm Tải lại hoặc thử Proxy.');
            }}
            className={`w-full h-full object-contain cursor-pointer ${
              activeChannel?.isRadio ? 'opacity-0' : 'opacity-100'
            }`}
          />

          {/* Giao diện Studio khi nghe Radio (VOV Giao thông / VOV1 / VOH FM) */}
          {activeChannel?.isRadio && !playError && (
            <div
              onClick={handleTogglePlay}
              className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center cursor-pointer ${
                isLightTheme
                  ? 'bg-gradient-to-br from-emerald-50 via-sky-50 to-slate-100'
                  : 'bg-gradient-to-br from-slate-900 via-[#0a1628] to-emerald-950/60'
              }`}
            >
              <div className="relative">
                {isPlaying && (
                  <div className="absolute -inset-3 rounded-full bg-emerald-500/25 animate-ping" />
                )}
                <div
                  className={`relative w-20 h-20 short:w-16 short:h-16 rounded-2xl border flex items-center justify-center overflow-hidden shadow-xl p-2 ${
                    isLightTheme
                      ? 'bg-slate-900 border-emerald-500/60'
                      : 'bg-black/60 border-emerald-400/50'
                  }`}
                >
                  {activeChannel.logo && !failedLogos[activeChannel.id] ? (
                    <img
                      src={activeChannel.logo}
                      alt={activeChannel.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Radio className="w-9 h-9 text-emerald-400" />
                  )}
                </div>
              </div>
              <div>
                <p className={`text-sm sm:text-base font-black ${theme.text}`}>
                  {activeChannel.name}
                </p>
                <p
                  className={`text-xs font-bold mt-0.5 ${
                    isLightTheme ? 'text-emerald-700' : 'text-emerald-300'
                  }`}
                >
                  {isPlaying
                    ? '📻 Đang phát thanh trực tiếp...'
                    : isBuffering || isResolving
                    ? 'Đang bắt sóng Radio...'
                    : 'Chạm để tiếp tục phát'}
                </p>
              </div>
              <div className="flex items-end gap-1 h-5">
                {[45, 85, 60, 100, 50, 75, 40].map((h, i) => (
                  <span
                    key={i}
                    style={{
                      height: isPlaying ? `${h}%` : '22%',
                      animationDelay: `${i * 110}ms`,
                    }}
                    className={`w-1.5 rounded-full transition-all ${
                      isLightTheme ? 'bg-emerald-600' : 'bg-emerald-400'
                    } ${isPlaying ? 'animate-pulse' : 'opacity-40'}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Trạng thái đang kết nối / đệm luồng */}
          {(isResolving || isBuffering) && !playError && !activeChannel?.isRadio && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-xs flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <span className="text-xs font-extrabold text-white/85">
                {isResolving ? 'Đang bắt sóng kênh...' : 'Đang tải luồng HD...'}
              </span>
            </div>
          )}

          {/* Thông báo lỗi kèm nút thử Proxy / chuyển kênh */}
          {playError && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-4 text-center">
              <AlertCircle className="w-9 h-9 text-rose-400" />
              <p className="text-xs sm:text-sm font-bold text-white max-w-sm leading-snug">
                {playError}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {activeChannel && (
                  <button
                    type="button"
                    onClick={() => startChannel(activeChannel, true)}
                    className="min-h-[36px] px-3.5 rounded-full bg-sky-400 text-slate-950 font-black text-xs flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử lại qua Proxy</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleZapChannel(1)}
                  className="min-h-[36px] px-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition"
                >
                  <span>Kênh tiếp theo</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Thanh điều khiển TV chuẩn cảm ứng ô tô */}
        <div className="flex items-center justify-between gap-2 shrink-0 pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleZapChannel(-1)}
              className={`min-h-[38px] short:min-h-[34px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${theme.iconBtn}`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Kênh trước</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
              className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
            >
              {isPlaying ? (
                <Pause className={`w-4 h-4 ${theme.primaryCtaIcon}`} />
              ) : (
                <Play className={`w-4 h-4 ml-0.5 ${theme.primaryCtaIcon}`} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleZapChannel(1)}
              className={`min-h-[38px] short:min-h-[34px] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${theme.iconBtn}`}
            >
              <span className="hidden xs:inline">Kênh sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
              className={`w-9 h-9 short:w-8 short:h-8 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                isMuted
                  ? isLightTheme
                    ? 'bg-rose-50 border-rose-300 text-rose-600'
                    : 'bg-rose-500/25 border-rose-400/50 text-rose-300'
                  : theme.iconBtn
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {activeChannel && (
              <button
                type="button"
                onClick={() => startChannel(activeChannel, streamMode === 'proxy')}
                aria-label="Tải lại luồng kênh"
                title="Tải lại kênh hiện tại"
                className={`w-9 h-9 short:w-8 short:h-8 rounded-xl border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
              >
                <RefreshCw className={`w-4 h-4 ${isResolving ? 'animate-spin' : ''}`} />
              </button>
            )}

            {activeChannelIndex >= 0 && (
              <span className={`hidden sm:inline text-[11px] font-mono font-bold px-2 ${theme.textMuted}`}>
                {activeChannelIndex + 1}/{filteredChannels.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. DANH SÁCH KÊNH TV / RADIO / PHIM & TÌM KIẾM NHANH (Ẩn khi Fullscreen)
         ===================================================================== */}
      {!isTvFullscreen && (
        <div
          className={`flex-1 min-w-0 min-h-[280px] car:min-h-0 car:h-full rounded-2xl sm:rounded-3xl border p-2.5 sm:p-3 short:p-2 flex flex-col gap-2 short:gap-1.5 overflow-hidden ${theme.card}`}
        >
          {/* Ô tìm kiếm kênh + Nút đổi nguồn M3U8 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative flex-1 min-w-0">
              <Search
                className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textMuted}`}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kênh (vtv3, vov giao thong, htv7...)"
                className={`w-full h-9 short:h-8 pl-8 pr-7 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa tìm kiếm kênh"
                  className={`w-6 h-6 rounded-full absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${theme.textMuted}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCustomUrlInput(playlistUrl);
                setShowSourceModal((v) => !v);
              }}
              title="Cấu hình link danh sách M3U8"
              className={`h-9 short:h-8 px-2.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 shrink-0 active:scale-95 transition ${
                showSourceModal
                  ? isLightTheme
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-sky-400 text-slate-950 border-sky-300'
                  : theme.iconBtn
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">M3U</span>
            </button>
          </div>

          {/* Hộp đổi link M3U8 tùy chỉnh */}
          {showSourceModal && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleaned = customUrlInput.trim() || DEFAULT_TV_PLAYLIST_URL;
                setPlaylistUrl(cleaned);
                setShowSourceModal(false);
                onNotifyToast('📺 Đang nạp danh sách kênh M3U mới...');
              }}
              className={`p-2.5 rounded-xl border space-y-2 shrink-0 ${
                isLightTheme
                  ? 'bg-blue-50/90 border-blue-300'
                  : 'bg-black/60 border-sky-400/40'
              }`}
            >
              <div
                className={`flex items-center justify-between text-[11px] font-extrabold ${
                  isLightTheme ? 'text-blue-800' : 'text-sky-300'
                }`}
              >
                <span>Nguồn danh sách M3U / M3U8</span>
                {playlist && (
                  <span className={`font-mono text-[10px] ${theme.textMuted}`}>
                    {playlist.totalPlayable} kênh HLS
                    {playlist.totalDrmFiltered > 0 ? ` • ẩn ${playlist.totalDrmFiltered} DRM` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://tinyurl.com/vmt47"
                  className={`flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-[11px] font-mono focus:outline-none ${theme.input}`}
                />
                <button
                  type="submit"
                  className={`h-8 px-3 rounded-lg text-[11px] font-black shrink-0 active:scale-95 ${
                    isLightTheme ? 'bg-blue-600 text-white' : 'bg-sky-400 text-slate-950'
                  }`}
                >
                  Nạp
                </button>
              </div>
              {playlistUrl !== DEFAULT_TV_PLAYLIST_URL && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomUrlInput(DEFAULT_TV_PLAYLIST_URL);
                    setPlaylistUrl(DEFAULT_TV_PLAYLIST_URL);
                    setShowSourceModal(false);
                  }}
                  className={`text-[10.5px] font-bold hover:underline ${
                    isLightTheme ? 'text-amber-700' : 'text-amber-300'
                  }`}
                >
                  ↩ Khôi phục nguồn mặc định (tinyurl.com/vmt47)
                </button>
              )}
            </form>
          )}

          {/* Thanh nhóm kênh ngang */}
          {!searchQuery.trim() && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
              {[
                { id: '__popular__', label: '🔥 Phổ biến' },
                { id: '__favorites__', label: `⭐ Yêu thích (${favoriteKeys.length})` },
                ...(playlist?.groups.map((g) => ({
                  id: g.name,
                  label: `${g.name} (${g.count})`,
                })) || []),
                ...(playlist ? [{ id: '__all__', label: `Tất cả (${playlist.totalPlayable})` }] : []),
              ].map((tab) => {
                const active = selectedGroup === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedGroup(tab.id)}
                    className={`min-h-[32px] short:min-h-[28px] px-2.5 rounded-full text-[11px] font-extrabold whitespace-nowrap border active:scale-95 transition ${
                      active
                        ? isLightTheme
                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                          : 'bg-sky-400 text-slate-950 border-sky-300 shadow'
                        : theme.chipIdle
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Danh sách kênh cuộn mượt */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5 pr-0.5">
            {isLoadingPlaylist ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                <p className={`text-xs font-bold ${theme.textSub}`}>
                  Đang tải danh sách kênh TV & Radio...
                </p>
              </div>
            ) : playlistError ? (
              <div
                className={`p-4 rounded-2xl border text-center space-y-2 ${
                  isLightTheme
                    ? 'bg-rose-50 border-rose-300'
                    : 'bg-rose-500/15 border-rose-400/35'
                }`}
              >
                <ShieldAlert className="w-7 h-7 text-rose-500 mx-auto" />
                <p className={`text-xs font-bold ${theme.text}`}>{playlistError}</p>
                <button
                  type="button"
                  onClick={() => loadPlaylist(playlistUrl)}
                  className={`min-h-[34px] px-4 rounded-full text-xs font-extrabold active:scale-95 ${theme.primaryCta}`}
                >
                  Thử tải lại
                </button>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className={`py-10 text-center text-xs font-bold ${theme.textMuted}`}>
                {selectedGroup === '__favorites__'
                  ? 'Chưa có kênh yêu thích — bấm biểu tượng ⭐ cạnh tên kênh để lưu nhanh.'
                  : 'Không tìm thấy kênh phù hợp.'}
              </div>
            ) : (
              filteredChannels.map((ch) => {
                const isSelected = activeChannel?.id === ch.id;
                const isFav = favoriteSet.has(getChannelFavKey(ch));
                return (
                  <div
                    key={ch.id}
                    className={`w-full rounded-xl border flex items-center gap-2 p-1.5 short:p-1 transition ${
                      isSelected
                        ? isLightTheme
                          ? 'bg-blue-50 border-blue-500 shadow-sm'
                          : 'bg-sky-500/25 border-sky-400/70 shadow-md'
                        : theme.itemIdle
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveChannel(ch)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:scale-[0.99]"
                    >
                      <div
                        className={`w-11 h-8 short:w-10 short:h-7 rounded-lg border flex items-center justify-center overflow-hidden p-1 shrink-0 ${
                          isLightTheme
                            ? 'bg-slate-900 border-slate-300'
                            : 'bg-black/55 border-white/10'
                        }`}
                      >
                        {ch.logo && !failedLogos[ch.id] ? (
                          <img
                            src={ch.logo}
                            alt=""
                            loading="lazy"
                            onError={() =>
                              setFailedLogos((prev) => ({ ...prev, [ch.id]: true }))
                            }
                            className="w-full h-full object-contain"
                          />
                        ) : ch.isRadio ? (
                          <Radio className="w-4 h-4 text-emerald-400" />
                        ) : ch.isVod ? (
                          <Film className="w-4 h-4 text-amber-300" />
                        ) : (
                          <Tv className="w-4 h-4 text-sky-300" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs font-extrabold truncate leading-snug ${theme.text}`}>
                          {ch.name}
                        </h4>
                        <div
                          className={`flex items-center gap-1.5 text-[10px] font-semibold mt-0.5 ${theme.textMuted}`}
                        >
                          <span className="truncate">{ch.group}</span>
                          {ch.isRadio && (
                            <span
                              className={`px-1 rounded font-bold shrink-0 ${
                                isLightTheme
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              FM
                            </span>
                          )}
                          {ch.isVod && (
                            <span
                              className={`px-1 rounded font-bold shrink-0 ${
                                isLightTheme
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              VOD
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFavoriteChannel(ch)}
                      aria-label={isFav ? `Bỏ yêu thích ${ch.name}` : `Lưu ${ch.name}`}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition ${
                        isFav
                          ? 'text-amber-500'
                          : isLightTheme
                          ? 'text-slate-400 hover:text-slate-700'
                          : 'text-white/35 hover:text-white/75'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-500' : ''}`} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TvLiveView;
