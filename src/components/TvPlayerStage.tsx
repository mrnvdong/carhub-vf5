import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, Loader2, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { TvChannel, TvResolvedStream } from '../types';
import {
  buildTvProxyUrl,
  probeChannelDirectInBrowser,
  resolveTvStream,
  resolveTvStreamViaServer,
} from '../services/tv';
import { TvPlayerStatus } from '../hooks/useTvLive';
import { getCarTheme } from '../utils/theme';

export type { TvPlayerStatus };

interface TvPlayerStageProps {
  channel: TvChannel | null;
  isLightTheme: boolean;
  compact?: boolean;
  isMuted: boolean;
  forceProxy: boolean;
  reloadNonce: number;
  videoRef: React.RefObject<HTMLVideoElement>;
  onPauseMusic: () => void;
  onZapNext: () => void;
  onForceProxyRetry: () => void;
  onStatusChange?: (status: TvPlayerStatus) => void;
  onPingUpdate?: (channelId: string, status: 'live' | 'dead', reason?: string) => void;
}

function parseClearKeyMap(rawKey?: string): Record<string, string> | null {
  if (!rawKey) return null;
  const trimmed = rawKey.trim();
  const colonMatch = trimmed.match(/^([0-9a-fA-F]{16,64}):([0-9a-fA-F]{16,64})$/);
  if (colonMatch) {
    return { [colonMatch[1].toLowerCase()]: colonMatch[2].toLowerCase() };
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed?.keys)) {
        const out: Record<string, string> = {};
        const b64ToHex = (b64: string) => {
          const std = b64.replace(/-/g, '+').replace(/_/g, '/');
          const bin = atob(std);
          return Array.from(bin)
            .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('');
        };
        for (const k of parsed.keys) {
          if (k?.kid && k?.k) {
            out[b64ToHex(k.kid)] = b64ToHex(k.k);
          }
        }
        return Object.keys(out).length > 0 ? out : null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function supportsNativeHls(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  return Boolean(
    video.canPlayType('application/vnd.apple.mpegurl') ||
      video.canPlayType('application/x-mpegurl')
  );
}

export const TvPlayerStage: React.FC<TvPlayerStageProps> = ({
  channel,
  isLightTheme,
  compact = false,
  isMuted,
  forceProxy,
  reloadNonce,
  videoRef,
  onPauseMusic,
  onZapNext,
  onForceProxyRetry,
  onStatusChange,
  onPingUpdate,
}) => {
  const theme = getCarTheme(isLightTheme);
  const [resolvedStream, setResolvedStream] = useState<TvResolvedStream | null>(null);
  const [streamMode, setStreamMode] = useState<'direct' | 'proxy'>('direct');
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState<boolean>(false);

  const hlsRef = useRef<any>(null);
  const shakaRef = useRef<any>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);

  // Theo dõi số lần tự phục hồi chuẩn VLC cho từng phiên phát kênh
  const netRetryCountRef = useRef<number>(0);
  const mediaRetryCountRef = useRef<number>(0);
  const didTokenRefreshRef = useRef<boolean>(false);
  const didProxyFallbackRef = useRef<boolean>(false);
  const didProxyReconnectRef = useRef<boolean>(false);
  const activeStreamInfoRef = useRef<TvResolvedStream | null>(null);

  const onPauseMusicRef = useRef(onPauseMusic);
  onPauseMusicRef.current = onPauseMusic;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onPingUpdateRef = useRef(onPingUpdate);
  onPingUpdateRef.current = onPingUpdate;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  useEffect(() => {
    setLogoFailed(false);
  }, [channel?.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted, videoRef]);

  useEffect(() => {
    onStatusChangeRef.current?.({
      isPlaying,
      isBuffering,
      isResolving,
      streamMode,
      canSwitchDirect: Boolean(resolvedStream?.directUrl || channel?.url.startsWith('https://')),
      error: playError,
    });
  }, [isPlaying, isBuffering, isResolving, streamMode, resolvedStream, channel?.url, playError]);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const cleanupEngines = useCallback(async () => {
    clearTimers();
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    if (shakaRef.current) {
      try {
        await shakaRef.current.destroy();
      } catch {}
      shakaRef.current = null;
    }
  }, [clearTimers]);

  const attachStreamRef = useRef<
    (ch: TvChannel, streamInfo: TvResolvedStream) => Promise<void>
  >(async () => {});

  // Tự phục hồi luồng sống (Giống VLC --http-reconnect): làm mới token trực tiếp -> chuyển Proxy tự động!
  const recoverChannelPlayback = useCallback(
    async (ch: TvChannel, currentInfo: TvResolvedStream): Promise<boolean> => {
      if (activeChannelIdRef.current !== ch.id) return false;
      const signal = resolveAbortRef.current?.signal;

      // Bước 1: Nếu đang chạy Trực tiếp và chưa thử làm mới token -> xin lại token mới ngay từ IP Việt Nam!
      if (currentInfo.mode === 'direct' && !didTokenRefreshRef.current) {
        didTokenRefreshRef.current = true;
        const fresh = await probeChannelDirectInBrowser(ch, signal, 4500);
        if (signal?.aborted || activeChannelIdRef.current !== ch.id) return true;
        if (fresh.ok && fresh.finalUrl && fresh.streamType && fresh.finalUrl !== currentInfo.playUrl) {
          const nextInfo: TvResolvedStream = {
            mode: 'direct',
            streamType: fresh.streamType,
            playUrl: fresh.finalUrl,
            directUrl: fresh.finalUrl,
            proxyUrl: buildTvProxyUrl(ch, fresh.finalUrl),
          };
          setResolvedStream(nextInfo);
          setStreamMode('direct');
          await attachStreamRef.current(ch, nextInfo);
          return true;
        }
      }

      // Bước 2: Chuyển tự động sang Proxy (nhờ Cloudflare phân giải sạch URL + UA/Referer)
      if (!didProxyFallbackRef.current) {
        didProxyFallbackRef.current = true;
        setStreamMode('proxy');
        setIsBuffering(true);
        const viaServer = await resolveTvStreamViaServer(ch, signal, true);
        if (signal?.aborted || activeChannelIdRef.current !== ch.id) return true;

        const proxyInfo: TvResolvedStream = viaServer.stream || {
          ...currentInfo,
          mode: 'proxy',
          playUrl: currentInfo.proxyUrl || buildTvProxyUrl(ch),
          proxyUrl: currentInfo.proxyUrl || buildTvProxyUrl(ch),
        };
        setResolvedStream(proxyInfo);
        setStreamMode('proxy');
        await attachStreamRef.current(ch, proxyInfo);
        return true;
      }

      // Bước 3: Nếu đang chạy chế độ Proxy mà rớt sóng giữa chừng -> làm mới luồng Proxy 1 lần (chống đứng hình 4G!)
      if (currentInfo.mode === 'proxy' && !didProxyReconnectRef.current) {
        didProxyReconnectRef.current = true;
        setIsBuffering(true);
        const refreshed = await resolveTvStreamViaServer(ch, signal, true);
        if (signal?.aborted || activeChannelIdRef.current !== ch.id) return true;
        if (refreshed.stream) {
          setResolvedStream(refreshed.stream);
          setStreamMode('proxy');
          await attachStreamRef.current(ch, refreshed.stream);
          return true;
        }
      }

      return false;
    },
    []
  );

  const attachStream = useCallback(
    async (ch: TvChannel, streamInfo: TvResolvedStream) => {
      const video = videoRef.current;
      if (!video) return;

      await cleanupEngines();
      activeStreamInfoRef.current = streamInfo;
      netRetryCountRef.current = 0;
      mediaRetryCountRef.current = 0;

      setIsBuffering(true);
      setPlayError(null);
      video.muted = isMutedRef.current;

      const playUrl = streamInfo.playUrl;

      // 1. Luồng DASH (.mpd) + ClearKey DRM -> Shaka Player
      if (streamInfo.streamType === 'mpd' || ch.manifestType === 'mpd') {
        try {
          const shakaMod: any = await import('shaka-player');
          const shaka = shakaMod.default || shakaMod;
          if (shaka?.polyfill?.installAll) shaka.polyfill.installAll();

          if (!shaka?.Player?.isBrowserSupported?.()) {
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError(
              'Kênh này dùng định dạng DASH ClearKey (.mpd) — iOS Safari chưa hỗ trợ giải mã ClearKey (chạy tốt trên Chrome/Edge/Android).'
            );
            return;
          }

          const player = new shaka.Player();
          await player.attach(video);
          shakaRef.current = player;

          const clearKeys = parseClearKeyMap(ch.clearKey);
          player.configure({
            streaming: {
              retryParameters: {
                maxAttempts: 4,
                baseDelay: 800,
                backoffFactor: 1.8,
                timeout: 15000,
              },
              bufferingGoal: 20,
              rebufferingGoal: 2,
            },
            ...(clearKeys ? { drm: { clearKeys } } : {}),
          });

          if (streamInfo.mode === 'proxy') {
            const netEngine = player.getNetworkingEngine?.();
            netEngine?.registerRequestFilter?.((_type: any, request: any) => {
              if (!Array.isArray(request?.uris)) return;
              request.uris = request.uris.map((u: string) => {
                if (u.startsWith('http://') || u.startsWith('https://')) {
                  if (u.includes('/api/tv?')) return u;
                  return buildTvProxyUrl(ch, u);
                }
                return u;
              });
            });
          }

          player.addEventListener('error', async () => {
            if (await recoverChannelPlayback(ch, streamInfo)) return;
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError(
              'Không giải mã được luồng DASH/ClearKey của kênh này (trình duyệt hoặc CDN chặn).'
            );
            onPingUpdateRef.current?.(ch.id, 'dead', 'Lỗi DASH');
          });

          await player.load(playUrl);
          setIsBuffering(false);
          video.play().catch(() => {});
          return;
        } catch (err: any) {
          if (await recoverChannelPlayback(ch, streamInfo)) return;
          setIsBuffering(false);
          setIsPlaying(false);
          const msg = String(err?.message || '');
          setPlayError(
            msg.includes('6001') || msg.includes('6006') || msg.includes('DRM')
              ? 'Trình duyệt hiện tại (iOS Safari/CarPlay) chưa hỗ trợ giải mã ClearKey DRM cho kênh .mpd này.'
              : 'Không tải được luồng DASH (.mpd) của kênh này.'
          );
          return;
        }
      }

      // 2. Luồng Audio trực tiếp (Zeno.fm / Icecast)
      if (streamInfo.streamType === 'audio') {
        video.src = playUrl;
        video.load();
        video.play().catch(() => {});
        return;
      }

      // 3. Luồng HLS (.m3u8) -> Ưu tiên Apple Native HLS trên iOS/CarPlay, còn lại dùng hls.js cấu hình siêu bền 4G!
      if (supportsNativeHls(video)) {
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
          backBufferLength: 20,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferHole: 0.8,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          manifestLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 800,
          levelLoadingTimeOut: 12000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 800,
          fragLoadingTimeOut: 15000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 800,
        });
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsBuffering(false);
          video.play().catch(() => {});
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          netRetryCountRef.current = 0;
        });

        hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
          if (!data?.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Thử tự kết nối lại 2 lần trước (giống VLC khi rớt sóng 4G qua hầm/cầu!)
            if (netRetryCountRef.current < 2) {
              netRetryCountRef.current += 1;
              setIsBuffering(true);
              retryTimerRef.current = window.setTimeout(() => {
                if (hlsRef.current === hls) {
                  try {
                    hls.startLoad();
                  } catch {}
                }
              }, 1100);
              return;
            }

            recoverChannelPlayback(ch, streamInfo).then((recovered) => {
              if (recovered) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setPlayError('Tín hiệu kênh đang gián đoạn — chạm Tải lại hoặc chuyển kênh kế.');
              onPingUpdateRef.current?.(ch.id, 'dead', 'Lỗi mạng');
              cleanupEngines();
            });
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaRetryCountRef.current += 1;
            if (mediaRetryCountRef.current <= 3) {
              try {
                if (mediaRetryCountRef.current === 2) {
                  hls.swapAudioCodec();
                }
                hls.recoverMediaError();
                return;
              } catch {}
            }
            recoverChannelPlayback(ch, streamInfo).then((recovered) => {
              if (recovered) return;
              setIsBuffering(false);
              setPlayError('Lỗi giải mã tín hiệu kênh.');
              cleanupEngines();
            });
          } else {
            recoverChannelPlayback(ch, streamInfo).then((recovered) => {
              if (recovered) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setPlayError('Không phát được tín hiệu kênh này.');
              onPingUpdateRef.current?.(ch.id, 'dead', 'Lỗi phát');
              cleanupEngines();
            });
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
    [cleanupEngines, recoverChannelPlayback, videoRef]
  );

  attachStreamRef.current = attachStream;

  // Tự động bắt sóng TRỰC TIẾP (giống VLC) -> Tự chuyển Proxy khi cần
  useEffect(() => {
    if (!channel) return;

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    activeChannelIdRef.current = channel.id;
    didTokenRefreshRef.current = false;
    didProxyFallbackRef.current = forceProxy;
    didProxyReconnectRef.current = false;
    activeStreamInfoRef.current = null;

    onPauseMusicRef.current();
    cleanupEngines();
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

    const canNative = supportsNativeHls(videoRef.current);

    (async () => {
      const { stream, error } = await resolveTvStream(channel, controller.signal, {
        forceProxy,
        allowNativeNoCors: canNative,
      });
      if (controller.signal.aborted || activeChannelIdRef.current !== channel.id) return;

      setIsResolving(false);
      if (!stream) {
        setIsBuffering(false);
        setPlayError(error || 'Kênh hiện không phát sóng hoặc đang gián đoạn.');
        onPingUpdateRef.current?.(channel.id, 'dead', error || 'Offline');
        return;
      }

      setResolvedStream(stream);
      setStreamMode(stream.mode);
      if (stream.mode === 'proxy') {
        didProxyFallbackRef.current = true;
      }
      await attachStream(channel, stream);
    })();

    return () => {
      controller.abort();
      clearTimers();
    };
  }, [channel, forceProxy, reloadNonce, cleanupEngines, clearTimers, attachStream, videoRef]);

  // Dọn dẹp triệt để khi unmount (không ngốn 4G ngầm!)
  useEffect(() => {
    return () => {
      activeChannelIdRef.current = null;
      resolveAbortRef.current?.abort();
      cleanupEngines();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {}
      }
    };
  }, [cleanupEngines, videoRef]);

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

  // Watchdog chống treo buffering trên Apple Native HLS (Safari / CarPlay)
  const armNativeStallWatchdog = () => {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (!channel || !activeStreamInfoRef.current) return;
    if (hlsRef.current || shakaRef.current) return; // hls.js / Shaka tự có retry riêng

    const snapTime = videoRef.current?.currentTime || 0;
    const snapChannel = channel;
    const snapInfo = activeStreamInfoRef.current;

    stallTimerRef.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (!v || v.paused || activeChannelIdRef.current !== snapChannel.id) return;
      if (Math.abs((v.currentTime || 0) - snapTime) < 0.2) {
        recoverChannelPlayback(snapChannel, snapInfo).catch(() => {});
      }
    }, 12000);
  };

  return (
    <div
      className={`media-stage relative w-full h-full flex items-center justify-center rounded-2xl overflow-hidden bg-black border shadow-inner ${
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
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          setIsPlaying(true);
          setIsBuffering(false);
          setPlayError(null);
          if (channel) onPingUpdateRef.current?.(channel.id, 'live');
        }}
        onPause={() => {
          if (stallTimerRef.current !== null) {
            window.clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          setIsPlaying(false);
        }}
        onWaiting={() => {
          setIsBuffering(true);
          armNativeStallWatchdog();
        }}
        onStalled={() => {
          setIsBuffering(true);
          armNativeStallWatchdog();
        }}
        onError={() => {
          // Nếu hls.js hoặc Shaka đang quản lý luồng thì để engine tự xử lý recovery
          if (hlsRef.current || shakaRef.current) return;
          if (channel && activeStreamInfoRef.current) {
            recoverChannelPlayback(channel, activeStreamInfoRef.current).then((recovered) => {
              if (recovered) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setPlayError('Tín hiệu kênh bị gián đoạn — Thử Proxy hoặc đổi kênh khác.');
              onPingUpdateRef.current?.(channel.id, 'dead', 'Lỗi phát');
            });
            return;
          }
          setIsBuffering(false);
          setIsPlaying(false);
          setPlayError('Tín hiệu kênh bị gián đoạn — Thử Proxy hoặc đổi kênh khác.');
          if (channel) onPingUpdateRef.current?.(channel.id, 'dead', 'Lỗi phát');
        }}
        className={`w-full h-full object-contain cursor-pointer ${
          channel?.isRadio ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* Giao diện Radio Studio (VOV Giao thông / VOV1 / VOH FM) */}
      {channel?.isRadio && !playError && (
        <div
          onClick={handleTogglePlay}
          className={`absolute inset-0 flex flex-col items-center justify-center ${
            compact ? 'gap-1.5 p-2.5' : 'gap-3 p-4'
          } text-center cursor-pointer ${
            isLightTheme
              ? 'bg-gradient-to-br from-emerald-50 via-sky-50 to-slate-100'
              : 'bg-gradient-to-br from-slate-900 via-[#0a1628] to-emerald-950/60'
          }`}
        >
          <div className="relative">
            {isPlaying && (
              <div className="absolute -inset-2.5 rounded-full bg-emerald-500/25 animate-ping" />
            )}
            <div
              className={`relative ${
                compact ? 'w-12 h-12 rounded-xl p-1.5' : 'w-20 h-20 short:w-16 short:h-16 rounded-2xl p-2'
              } border flex items-center justify-center overflow-hidden shadow-xl ${
                isLightTheme
                  ? 'bg-slate-900 border-emerald-500/60'
                  : 'bg-black/60 border-emerald-400/50'
              }`}
            >
              {channel.logo && !logoFailed ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  onError={() => setLogoFailed(true)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Radio className={compact ? 'w-6 h-6 text-emerald-400' : 'w-9 h-9 text-emerald-400'} />
              )}
            </div>
          </div>
          <div className="min-w-0 max-w-full">
            <p className={`${compact ? 'text-xs' : 'text-sm sm:text-base'} font-black truncate ${theme.text}`}>
              {channel.name}
            </p>
            <p
              className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold mt-0.5 ${
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
          <div className={`flex items-end gap-1 ${compact ? 'h-3.5' : 'h-5'}`}>
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

      {/* Đang tải luồng */}
      {(isResolving || isBuffering) && !playError && !channel?.isRadio && (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 pointer-events-none">
          <Loader2 className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} text-sky-400 animate-spin`} />
          <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-extrabold text-white/90`}>
            {isResolving ? 'Đang bắt sóng trực tiếp...' : 'Đang nạp tín hiệu...'}
          </span>
        </div>
      )}

      {/* Lỗi phát kèm nút thử Proxy / Chuyển kênh */}
      {playError && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-2 p-3 text-center">
          <AlertCircle className={`${compact ? 'w-6 h-6' : 'w-9 h-9'} text-rose-400 shrink-0`} />
          <p
            className={`${
              compact ? 'text-[11px] line-clamp-3' : 'text-xs sm:text-sm'
            } font-bold text-white max-w-sm leading-snug`}
          >
            {playError}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {channel && (
              <button
                type="button"
                onClick={onForceProxyRetry}
                className="min-h-[32px] px-3 rounded-full bg-sky-400 text-slate-950 font-black text-[11px] flex items-center gap-1 active:scale-95 transition"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Thử Proxy</span>
              </button>
            )}
            <button
              type="button"
              onClick={onZapNext}
              className="min-h-[32px] px-3 rounded-full bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] flex items-center gap-1 active:scale-95 transition"
            >
              <span>Kênh kế</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
