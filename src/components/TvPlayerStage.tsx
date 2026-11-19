import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Radio, Loader2, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { TvChannel, TvResolvedStream } from '../types';
import { resolveTvStream } from '../services/tv';
import { getCarTheme } from '../utils/theme';

export interface TvPlayerStatus {
  isPlaying: boolean;
  isBuffering: boolean;
  isResolving: boolean;
  streamMode: 'direct' | 'proxy';
  canSwitchDirect: boolean;
  error: string | null;
}

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
  // Dạng chuẩn hex kid:key (phổ biến nhất trong M3U Kodi/VLC)
  const colonMatch = trimmed.match(/^([0-9a-fA-F]{16,64}):([0-9a-fA-F]{16,64})$/);
  if (colonMatch) {
    return { [colonMatch[1].toLowerCase()]: colonMatch[2].toLowerCase() };
  }
  // Dạng JSON {"kid":"key"} hoặc JWK keys array
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
  const didAutoFallbackRef = useRef<boolean>(false);

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
      canSwitchDirect: Boolean(resolvedStream?.directUrl),
      error: playError,
    });
  }, [isPlaying, isBuffering, isResolving, streamMode, resolvedStream, playError]);

  const cleanupEngines = useCallback(async () => {
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
  }, []);

  const attachStream = useCallback(
    async (
      ch: TvChannel,
      playUrl: string,
      streamInfo: TvResolvedStream,
      isFallbackAttempt: boolean
    ) => {
      const video = videoRef.current;
      if (!video) return;

      await cleanupEngines();
      setIsBuffering(true);
      setPlayError(null);
      video.muted = isMutedRef.current;

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
          attachStream(ch, streamInfo.proxyUrl, { ...streamInfo, mode: 'proxy' }, true);
          return true;
        }
        return false;
      };

      // 1. Luồng DASH (.mpd) + ClearKey DRM -> dùng Shaka Player (tự nạp động khi mở kênh MPD!)
      if (streamInfo.streamType === 'mpd' || ch.manifestType === 'mpd') {
        try {
          const shakaMod: any = await import('shaka-player');
          const shaka = shakaMod.default || shakaMod;
          if (shaka?.polyfill?.installAll) shaka.polyfill.installAll();

          if (!shaka?.Player?.isBrowserSupported?.()) {
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError(
              'Kênh này dùng định dạng DASH ClearKey (.mpd) — trình duyệt iOS Safari chưa hỗ trợ giải mã ClearKey (chạy tốt trên Chrome/Edge/Android).'
            );
            return;
          }

          const player = new shaka.Player();
          await player.attach(video);
          shakaRef.current = player;

          const clearKeys = parseClearKeyMap(ch.clearKey);
          if (clearKeys) {
            player.configure({
              drm: {
                clearKeys,
              },
            });
          }

          if (streamInfo.mode === 'proxy') {
            const netEngine = player.getNetworkingEngine?.();
            netEngine?.registerRequestFilter?.((_type: any, request: any) => {
              if (!Array.isArray(request?.uris)) return;
              request.uris = request.uris.map((u: string) => {
                if (u.startsWith('http://') || u.startsWith('https://')) {
                  if (u.includes('/api/tv?')) return u;
                  const params = new URLSearchParams();
                  params.set('action', 'proxy');
                  params.set('url', u);
                  if (ch.ua) params.set('ua', ch.ua);
                  if (ch.referer) params.set('ref', ch.referer);
                  return `/api/tv?${params.toString()}`;
                }
                return u;
              });
            });
          }

          player.addEventListener('error', () => {
            if (tryProxyFallback()) return;
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
          if (tryProxyFallback()) return;
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

      // 3. Luồng HLS (.m3u8) -> ưu tiên Native Apple HLS trên iOS/CarPlay, còn lại dùng hls.js
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
            setPlayError('Kênh hiện không phát được (CDN chặn hoặc đang offline).');
            onPingUpdateRef.current?.(ch.id, 'dead', 'Lỗi mạng');
            cleanupEngines();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setIsBuffering(false);
              setPlayError('Lỗi giải mã tín hiệu kênh.');
              cleanupEngines();
            }
          } else {
            if (tryProxyFallback()) return;
            setIsBuffering(false);
            setIsPlaying(false);
            setPlayError('Không phát được tín hiệu kênh này.');
            onPingUpdateRef.current?.(ch.id, 'dead', 'Lỗi phát');
            cleanupEngines();
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
    [cleanupEngines, videoRef]
  );

  // Tự động phân giải & phát khi đổi kênh / đổi chế độ Proxy / bấm Tải lại
  useEffect(() => {
    if (!channel) return;

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    didAutoFallbackRef.current = forceProxy;

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

    (async () => {
      const { stream, error } = await resolveTvStream(channel, controller.signal);
      if (controller.signal.aborted) return;

      setIsResolving(false);
      if (!stream) {
        setIsBuffering(false);
        setPlayError(error || 'Kênh hiện không phát sóng hoặc đang gián đoạn.');
        onPingUpdateRef.current?.(channel.id, 'dead', error || 'Offline');
        return;
      }

      setResolvedStream(stream);
      const chosenMode: 'direct' | 'proxy' = forceProxy ? 'proxy' : stream.mode;
      const chosenUrl = forceProxy ? stream.proxyUrl : stream.playUrl;
      setStreamMode(chosenMode);
      attachStream(channel, chosenUrl, { ...stream, mode: chosenMode }, forceProxy);
    })();

    return () => {
      controller.abort();
    };
  }, [channel, forceProxy, reloadNonce, cleanupEngines, attachStream, videoRef]);

  // Dọn dẹp triệt để khi unmount (không ngốn 4G ngầm!)
  useEffect(() => {
    return () => {
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
          setIsPlaying(true);
          setIsBuffering(false);
          setPlayError(null);
          if (channel) onPingUpdateRef.current?.(channel.id, 'live');
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onError={() => {
          if (
            channel &&
            resolvedStream &&
            streamMode === 'direct' &&
            !didAutoFallbackRef.current &&
            resolvedStream.proxyUrl
          ) {
            didAutoFallbackRef.current = true;
            setStreamMode('proxy');
            attachStream(channel, resolvedStream.proxyUrl, { ...resolvedStream, mode: 'proxy' }, true);
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
            {isResolving ? 'Đang bắt sóng kênh...' : 'Đang tải luồng...'}
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
