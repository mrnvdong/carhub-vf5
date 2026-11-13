import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  SkipBack,
  Maximize2,
  Minimize2,
  Headphones,
  Tv,
  Star,
  ShieldCheck,
  Loader2,
  Radio,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Lock,
  Zap,
  Wifi,
  Server,
  Layers,
} from 'lucide-react';
import { StreamData, PlayerMode } from '../types';
import { formatSeconds } from '../services/api';

interface VideoPlayerProps {
  streamData: StreamData;
  isLoading: boolean;
  playerMode: PlayerMode;
  onPlayerModeChange: (mode: PlayerMode) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onRetry?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamData,
  isLoading,
  playerMode,
  onPlayerModeChange,
  onNext,
  onPrev,
  onRetry,
  hasNext,
  hasPrev,
  isFavorite,
  onToggleFavorite,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncAudioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);

  const initialQuality = (streamData.videoStreams || [])[0]?.quality || '1080p';
  const [selectedQuality, setSelectedQuality] = useState<string>(initialQuality);
  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [forceEmbed, setForceEmbed] = useState<boolean>(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const hasAudioStream = (streamData.audioStreams?.length ?? 0) > 0;
  const hasDirectVideo = (streamData.videoStreams?.length ?? 0) > 0;
  const hasHls = Boolean(streamData.hlsUrl);
  const isEmbed = streamData.playbackType === 'embed' || forceEmbed;
  const isHlsActive =
    !isEmbed &&
    playerMode === 'video' &&
    (streamData.playbackType === 'hls' ||
      selectedQuality === 'hls' ||
      (!hasDirectVideo && hasHls));

  const activeVideoStream =
    hasDirectVideo && !isHlsActive && !isEmbed
      ? streamData.videoStreams.find((s) => s.quality === selectedQuality) ||
        streamData.videoStreams[0]
      : null;

  const isAudioSyncNeeded = Boolean(
    playerMode === 'video' &&
      !isEmbed &&
      !isHlsActive &&
      activeVideoStream?.needsAudioSync &&
      hasAudioStream
  );

  const rawAudioSyncUrl = isAudioSyncNeeded ? streamData.audioStreams[0]?.url : '';
  const finalAudioSyncUrl =
    useProxy && rawAudioSyncUrl && rawAudioSyncUrl.includes('googlevideo.com')
      ? `/api/proxy?url=${encodeURIComponent(rawAudioSyncUrl)}`
      : rawAudioSyncUrl;

  // Enforce: "Chỉ nghe nhạc" is only active when hasAudioStream is true and not in embed mode
  useEffect(() => {
    if (playerMode === 'audio' && (!hasAudioStream || isEmbed)) {
      onPlayerModeChange('video');
      setModeNotice('Video này không có luồng âm thanh riêng — Đã chuyển về chế độ Video');
      const timer = setTimeout(() => setModeNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [streamData.id, hasAudioStream, isEmbed, playerMode, onPlayerModeChange]);

  // Reset states when video ID changes
  useEffect(() => {
    setPlaybackError(null);
    setUseProxy(false);
    setForceEmbed(false);
    setCurrentTime(0);
    setDuration(streamData.duration || 0);
    setIsBuffering(!isEmbed);
    setIsPlaying(false);
    setSelectedQuality((streamData.videoStreams || [])[0]?.quality || '1080p');
  }, [streamData.id, streamData.duration, isEmbed]);

  // Synchronized Audio Attachment for dual-element 1080p/720p Direct Video
  useEffect(() => {
    const syncAudio = syncAudioRef.current;
    if (!syncAudio || !isAudioSyncNeeded || !finalAudioSyncUrl) {
      if (syncAudio) {
        syncAudio.pause();
        syncAudio.removeAttribute('src');
        syncAudio.load();
      }
      return;
    }

    syncAudio.src = finalAudioSyncUrl;
    syncAudio.load();
    if (videoRef.current && !videoRef.current.paused) {
      syncAudio.currentTime = videoRef.current.currentTime;
      syncAudio.play().catch(console.warn);
    }

    return () => {
      syncAudio.pause();
      syncAudio.removeAttribute('src');
      syncAudio.load();
    };
  }, [finalAudioSyncUrl, isAudioSyncNeeded]);

  // Determine raw stream URL for active mode
  const getRawStreamUrl = (): string => {
    if (isEmbed) return '';

    if (playerMode === 'audio') {
      return hasAudioStream ? streamData.audioStreams[0].url : '';
    }

    if (isHlsActive && streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    if (hasDirectVideo) {
      if (selectedQuality !== 'auto' && selectedQuality !== 'hls') {
        const matched = streamData.videoStreams.find((s) => s.quality === selectedQuality);
        if (matched) return matched.url;
      }
      return streamData.videoStreams[0].url;
    }

    if (streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    return '';
  };

  const rawStreamUrl = getRawStreamUrl();
  const finalStreamUrl =
    useProxy && rawStreamUrl && rawStreamUrl.includes('googlevideo.com')
      ? `/api/proxy?url=${encodeURIComponent(rawStreamUrl)}`
      : rawStreamUrl;

  // Manage HLS or Direct Video attachment
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isEmbed || playerMode === 'audio') {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!finalStreamUrl) {
      setPlaybackError('Không tìm thấy URL phát video hợp lệ');
      return;
    }

    const isM3U8 = isHlsActive || finalStreamUrl.includes('.m3u8');

    if (isM3U8) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalStreamUrl;
        video.load();
        video.play().catch(() => setIsPlaying(false));
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.loadSource(finalStreamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => setIsPlaying(false));
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              handleMediaError('hls');
            }
          }
        });
      } else {
        handleMediaError('hls-unsupported');
      }
    } else {
      video.src = finalStreamUrl;
      video.load();
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [finalStreamUrl, isEmbed, playerMode, isHlsActive]);

  // Manage Audio-Only element attachment
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isEmbed || playerMode !== 'audio') return;

    if (!finalStreamUrl) {
      setPlaybackError('Không có URL âm thanh hợp lệ');
      return;
    }

    audio.src = finalStreamUrl;
    audio.load();
    audio.play().catch(() => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [finalStreamUrl, isEmbed, playerMode]);

  // Self-Healing Stream Fallback Cascade: Direct MP4 -> Edge Proxy -> HLS -> YouTube Embed
  const handleMediaError = (reasonOrEvent?: string | React.SyntheticEvent) => {
    const reason = typeof reasonOrEvent === 'string' ? reasonOrEvent : 'media-event-error';
    console.warn(`[Auto-Heal] Stream failed (${reason}). Initiating fallback...`);

    // Level 1: If Direct MP4 failed, try Cloudflare Edge Proxy
    if (!useProxy && rawStreamUrl && rawStreamUrl.includes('googlevideo.com')) {
      setModeNotice('Direct MP4 bị hạn chế mạng — Đang tự động đổi sang Edge Proxy...');
      setTimeout(() => setModeNotice(null), 3000);
      setUseProxy(true);
      setPlaybackError(null);
      return;
    }

    // Level 2: If Edge Proxy failed and HLS is available, try HLS
    if (!isHlsActive && hasHls && streamData.hlsUrl) {
      setModeNotice('Edge Proxy lỗi — Đang tự động chuyển sang HLS Stream...');
      setTimeout(() => setModeNotice(null), 3000);
      setUseProxy(false);
      setSelectedQuality('hls');
      setPlaybackError(null);
      return;
    }

    // Level 3: Seamlessly fallback to YouTube Embed without stopping or showing error
    if (streamData.embedUrl && !forceEmbed) {
      setModeNotice('Tự động chuyển sang YouTube Embed để nhạc trên xe không bị ngắt');
      setTimeout(() => setModeNotice(null), 4000);
      setForceEmbed(true);
      setPlaybackError(null);
      return;
    }

    // Level 4: Final fallback only if everything is exhausted
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError('Không thể phát video này trên mọi nguồn.');
  };

  // Watchdog Timer: Auto-heal if video gets stuck buffering for > 4.5 seconds on direct stream
  useEffect(() => {
    if (!isBuffering || isEmbed || isPlaying || Boolean(playbackError) || !finalStreamUrl) return;

    const timer = setTimeout(() => {
      if (isBuffering && !isPlaying && !isEmbed) {
        console.warn('[Watchdog] Playback stalled in buffering for > 4.5s. Auto-healing to next source...');
        handleMediaError('stalled-buffering');
      }
    }, 4500);

    return () => clearTimeout(timer);
  }, [isBuffering, isPlaying, isEmbed, playbackError, finalStreamUrl]);

  // MediaSession API for CarPlay & VinFast VF5 Steering Wheel Controls
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (isEmbed) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('nexttrack', onNext || null);
      navigator.mediaSession.setActionHandler('previoustrack', onPrev || null);
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: streamData.title,
      artist: streamData.uploader,
      album: 'CarHub VinFast VF5',
      artwork: [
        { src: streamData.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
      ],
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    navigator.mediaSession.setActionHandler('play', () => {
      const el = playerMode === 'audio' ? audioRef.current : videoRef.current;
      el?.play().catch(console.error);
      if (isAudioSyncNeeded && syncAudioRef.current && videoRef.current) {
        syncAudioRef.current.currentTime = videoRef.current.currentTime;
        syncAudioRef.current.play().catch(console.warn);
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const el = playerMode === 'audio' ? audioRef.current : videoRef.current;
      el?.pause();
      if (isAudioSyncNeeded && syncAudioRef.current) {
        syncAudioRef.current.pause();
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      handleSeekRelative(-10);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      handleSeekRelative(10);
    });
    navigator.mediaSession.setActionHandler('nexttrack', onNext || null);
    navigator.mediaSession.setActionHandler('previoustrack', onPrev || null);
  }, [streamData, onNext, onPrev, isEmbed, playerMode, isPlaying, isAudioSyncNeeded]);

  const getActiveMediaElement = () => {
    if (isEmbed) return null;
    return playerMode === 'audio' ? audioRef.current : videoRef.current;
  };

  const togglePlay = () => {
    const el = getActiveMediaElement();
    if (!el || playbackError) return;
    if (el.paused) {
      el.play().catch((err) => console.warn('Play failed:', err));
      if (isAudioSyncNeeded && syncAudioRef.current) {
        syncAudioRef.current.currentTime = el.currentTime;
        syncAudioRef.current.play().catch(console.warn);
      }
    } else {
      el.pause();
      if (isAudioSyncNeeded && syncAudioRef.current) {
        syncAudioRef.current.pause();
      }
    }
  };

  const handleSeekRelative = (seconds: number) => {
    const el = getActiveMediaElement();
    if (!el || playbackError) return;
    const maxDur = el.duration || duration || 0;
    const newTime = Math.max(0, Math.min(el.currentTime + seconds, maxDur));
    el.currentTime = newTime;
    setCurrentTime(newTime);
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = newTime;
    }
  };

  const handleTimeUpdate = () => {
    const el = getActiveMediaElement();
    if (!el) return;
    const curr = el.currentTime;
    setCurrentTime(curr);

    // Sync audio drift check (keep sync within 250ms)
    if (isAudioSyncNeeded && syncAudioRef.current && !el.paused) {
      const drift = Math.abs(syncAudioRef.current.currentTime - curr);
      if (drift > 0.25) {
        syncAudioRef.current.currentTime = curr;
      }
      if (syncAudioRef.current.paused) {
        syncAudioRef.current.play().catch(console.warn);
      }
    }

    // SponsorBlock: Only active for direct/HLS streams
    if (!isEmbed && streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end - 0.5) {
          el.currentTime = segment.end;
          if (isAudioSyncNeeded && syncAudioRef.current) {
            syncAudioRef.current.currentTime = segment.end;
          }
          setSponsorSkippedNotice(`Đã tự động bỏ qua đoạn ${segment.category}`);
          setTimeout(() => setSponsorSkippedNotice(null), 3000);
          break;
        }
      }
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    const el = getActiveMediaElement();
    if (el) {
      el.currentTime = val;
    }
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = val;
    }
  };

  const handleQualityChange = (q: string) => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      prevTimeRef.current = videoRef.current.currentTime;
    }
    setSelectedQuality(q);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const uniqueQualities = Array.from(
    new Set((streamData.videoStreams || []).map((v) => v.quality))
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black rounded-3xl overflow-hidden border-2 border-car-border shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'mb-6'
      }`}
    >
      {/* Video Viewport / Audio Visualizer Area */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-14 h-14 text-car-accent animate-spin" />
            <p className="text-base sm:text-lg font-bold text-slate-200">Đang chuẩn bị luồng phát...</p>
          </div>
        )}

        {/* Playback Error Overlay */}
        {playbackError && !isEmbed && (
          <div className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-14 h-14 text-rose-500" />
            <h4 className="text-lg sm:text-xl font-bold text-white">Không thể phát luồng trực tiếp</h4>
            <p className="text-sm text-car-textMuted max-w-md">{playbackError}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
              {onRetry && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    onRetry();
                  }}
                  className="h-13 px-5 bg-car-card hover:bg-slate-800 border-2 border-car-border text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Tải lại luồng mới</span>
                </button>
              )}
              {streamData.embedUrl && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    setForceEmbed(true);
                  }}
                  className="h-13 px-5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span>Phát qua YouTube Embed</span>
                </button>
              )}
              {hasNext && onNext && (
                <button
                  onClick={onNext}
                  className="h-13 px-5 bg-car-accent hover:bg-car-accentHover text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <SkipForward className="w-5 h-5" />
                  <span>Bài tiếp theo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* SponsorBlock & Mode Toast Notices */}
        {(sponsorSkippedNotice || modeNotice) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/95 text-white px-5 py-2 rounded-full text-sm sm:text-base font-bold flex items-center gap-2 shadow-xl backdrop-blur">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>{sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {/* Mode 1: Video with Direct / HLS Stream */}
        {!isEmbed && playerMode === 'video' && (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain cursor-pointer"
              playsInline
              muted={isAudioSyncNeeded}
              controls={false}
              onPlay={() => {
                setIsPlaying(true);
                setIsBuffering(false);
                if (isAudioSyncNeeded && syncAudioRef.current) {
                  syncAudioRef.current.currentTime = videoRef.current?.currentTime || 0;
                  syncAudioRef.current.play().catch(console.warn);
                }
              }}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
                if (isAudioSyncNeeded && syncAudioRef.current) {
                  syncAudioRef.current.currentTime = videoRef.current?.currentTime || 0;
                  syncAudioRef.current.play().catch(console.warn);
                }
              }}
              onWaiting={() => {
                setIsBuffering(true);
                if (isAudioSyncNeeded && syncAudioRef.current) {
                  syncAudioRef.current.pause();
                }
              }}
              onPause={() => {
                setIsPlaying(false);
                if (isAudioSyncNeeded && syncAudioRef.current) {
                  syncAudioRef.current.pause();
                }
              }}
              onSeeking={() => {
                if (isAudioSyncNeeded && syncAudioRef.current && videoRef.current) {
                  syncAudioRef.current.currentTime = videoRef.current.currentTime;
                }
              }}
              onSeeked={() => {
                if (isAudioSyncNeeded && syncAudioRef.current && videoRef.current) {
                  syncAudioRef.current.currentTime = videoRef.current.currentTime;
                }
              }}
              onTimeUpdate={handleTimeUpdate}
              onError={handleMediaError}
              onLoadedMetadata={() => {
                setIsBuffering(false);
                if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
                  setDuration(videoRef.current.duration);
                }
                if (prevTimeRef.current > 0 && videoRef.current) {
                  videoRef.current.currentTime = prevTimeRef.current;
                  if (isAudioSyncNeeded && syncAudioRef.current) {
                    syncAudioRef.current.currentTime = prevTimeRef.current;
                  }
                  prevTimeRef.current = 0;
                }
              }}
              onEnded={() => {
                setIsPlaying(false);
                if (isAudioSyncNeeded && syncAudioRef.current) {
                  syncAudioRef.current.pause();
                }
                if (onNext) onNext();
              }}
              onClick={togglePlay}
            />

            {/* Hidden Synchronized Audio Element for 1080p/720p Video */}
            {isAudioSyncNeeded && (
              <audio
                ref={syncAudioRef}
                preload="auto"
                className="hidden"
                onError={(e) => console.warn('Sync audio error:', e)}
              />
            )}
          </>
        )}

        {/* Mode 2: YouTube Embed Fallback */}
        {isEmbed && streamData.embedUrl && (
          <div className="relative w-full h-full flex flex-col">
            <iframe
              src={streamData.embedUrl}
              title={streamData.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <div className="absolute top-3 left-3 z-10 bg-amber-500/95 text-black px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md">
              <ExternalLink className="w-4 h-4" />
              <span>Nguồn: YouTube Embed (Dự phòng)</span>
            </div>
          </div>
        )}

        {/* Mode 3: Audio Only ("Chỉ nghe nhạc") */}
        {!isEmbed && playerMode === 'audio' && hasAudioStream && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-car-card via-slate-900 to-black relative">
            <audio
              ref={audioRef}
              onPlay={() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }}
              onPlaying={() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }}
              onWaiting={() => setIsBuffering(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onError={handleMediaError}
              onLoadedMetadata={() => {
                setIsBuffering(false);
                if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
                  setDuration(audioRef.current.duration);
                }
              }}
              onEnded={() => {
                setIsPlaying(false);
                if (onNext) onNext();
              }}
            />

            {/* Rotating Album Art Vinyl Disc (Big touchable) */}
            <div className="relative mb-4 group cursor-pointer" onClick={togglePlay}>
              <div
                className={`w-40 h-40 sm:w-56 sm:h-56 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl relative ${
                  isPlaying && !isBuffering && !playbackError ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '10s' }}
              >
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-slate-900 border-2 border-slate-400"></div>
                </div>
              </div>
              <div
                className={`absolute -bottom-2 -right-2 p-3 rounded-full text-white shadow-xl ${
                  isPlaying && !isBuffering ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                {isBuffering ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Radio className={`w-6 h-6 ${isPlaying ? 'animate-pulse' : ''}`} />
                )}
              </div>
            </div>

            <div className="text-center max-w-xl px-4">
              <h2 className="text-lg sm:text-2xl font-extrabold line-clamp-1 text-white">
                {streamData.title}
              </h2>
              <p className="text-sm sm:text-base text-car-textMuted font-semibold mt-1">
                {streamData.uploader} •{' '}
                {isBuffering
                  ? 'Đang nạp luồng âm thanh...'
                  : isPlaying
                  ? 'Đang phát chế độ Chỉ nghe nhạc'
                  : 'Đang tạm dừng'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Car Player Controls Bar - OVERSIZED FOR AUTOMOTIVE TOUCHSCREEN */}
      <div className="bg-car-card px-4 py-4 sm:px-6 sm:py-5 border-t-2 border-car-border">
        {/* Title bar for current video */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-xl font-extrabold text-slate-100 truncate">
              {streamData.title}
            </h3>
            <p className="text-sm sm:text-base text-slate-300 font-semibold truncate mt-0.5">
              {streamData.uploader}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEmbed && playerMode === 'video' && (
              <span className="shrink-0 text-xs sm:text-sm font-extrabold px-3 py-1.5 rounded-xl border-2 bg-blue-500/20 text-blue-300 border-blue-500/50 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                {isHlsActive
                  ? '1080p HLS'
                  : activeVideoStream?.quality?.includes('1080')
                  ? '1080p Full HD'
                  : activeVideoStream?.quality?.includes('720')
                  ? '720p HD'
                  : `${activeVideoStream?.quality || '1080p'}`}
              </span>
            )}
            <span
              className={`shrink-0 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl border-2 ${
                isEmbed
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                  : isHlsActive
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/40'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {isEmbed
                ? 'YouTube Embed'
                : playerMode === 'audio'
                ? 'Chỉ nghe nhạc'
                : isHlsActive
                ? 'HLS Stream'
                : 'Direct MP4'}
            </span>
          </div>
        </div>

        {/* Thick Progress Scrub Bar with Large Touch Thumb */}
        {!isEmbed && (
          <div className="flex items-center gap-3 sm:gap-4 mb-3">
            <span className="text-sm sm:text-base font-mono font-bold text-slate-200 shrink-0 min-w-[50px]">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              disabled={Boolean(playbackError)}
              onChange={handleSeekChange}
              className="w-full cursor-pointer"
            />
            <span className="text-sm sm:text-base font-mono font-bold text-slate-200 shrink-0 min-w-[50px] text-right">
              {formatSeconds(duration)}
            </span>
          </div>
        )}

        {isEmbed && (
          <div className="text-xs sm:text-sm text-amber-300 bg-amber-500/15 px-4 py-2.5 rounded-xl border border-amber-500/30 mb-3 font-semibold">
            ⚠️ Nguồn dự phòng YouTube Embed: Chạm trực tiếp vào khung video ở trên để Play/Pause và tua.
          </div>
        )}

        {/* Giant In-Car Transport Controls */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Left: Mode Switcher & Quality */}
          <div className="flex items-center gap-2 sm:gap-3">
            {!isEmbed && (
              <button
                onClick={() => {
                  if (hasAudioStream) {
                    onPlayerModeChange(playerMode === 'video' ? 'audio' : 'video');
                  }
                }}
                disabled={!hasAudioStream}
                className={`h-13 sm:h-14 px-4 sm:px-5 rounded-2xl text-sm sm:text-base font-bold transition flex items-center gap-2 active:scale-95 shadow-sm ${
                  !hasAudioStream
                    ? 'bg-slate-900 text-slate-500 border-2 border-slate-800 cursor-not-allowed'
                    : playerMode === 'audio'
                    ? 'bg-emerald-600 text-white border-2 border-emerald-400 shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800 text-slate-100 hover:text-white border-2 border-slate-700'
                }`}
                title={
                  hasAudioStream
                    ? 'Bật/tắt chế độ Chỉ nghe nhạc'
                    : 'Video này không có luồng âm thanh riêng biệt'
                }
              >
                {!hasAudioStream ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline">Không có audio riêng</span>
                  </>
                ) : playerMode === 'audio' ? (
                  <>
                    <Tv className="w-5 h-5 text-emerald-100" />
                    <span>Xem video</span>
                  </>
                ) : (
                  <>
                    <Headphones className="w-5 h-5 text-emerald-400" />
                    <span>Chỉ nghe nhạc</span>
                  </>
                )}
              </button>
            )}

            {/* Automotive Quality Picker */}
            {!isEmbed && playerMode === 'video' && (uniqueQualities.length > 1 || (hasDirectVideo && hasHls)) && (
              <select
                value={selectedQuality}
                onChange={(e) => handleQualityChange(e.target.value)}
                className="h-13 sm:h-14 bg-slate-800 text-slate-100 text-sm sm:text-base px-3.5 rounded-2xl border-2 border-slate-700 font-bold focus:outline-none focus:border-car-accent shadow-sm"
              >
                {uniqueQualities.map((q) => {
                  let label = q;
                  if (q.includes('2160') || q.includes('4K')) label = '2160p 4K';
                  else if (q.includes('1440') || q.includes('2K')) label = '1440p 2K';
                  else if (q.includes('1080')) label = '1080p Full HD';
                  else if (q.includes('720')) label = '720p HD';
                  else if (q.includes('480')) label = '480p SD';
                  else if (q.includes('360')) label = '360p (Tiết kiệm)';
                  return (
                    <option key={q} value={q}>
                      {label}
                    </option>
                  );
                })}
                {hasHls && <option value="hls">HLS Tự động thích ứng</option>}
              </select>
            )}
          </div>

          {/* Center: MASSIVE Automotive Transport Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Prev Track (Big touch) */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center border-2 border-slate-700 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition shadow-sm"
              title="Bài trước"
            >
              <SkipBack className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>

            {/* Rewind 10s (Big touch with clear 10s text) */}
            {!isEmbed && (
              <button
                onClick={() => handleSeekRelative(-10)}
                disabled={Boolean(playbackError)}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex flex-col items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm relative"
                title="Tua lùi 10 giây"
              >
                <RotateCcw className="w-6 h-6 sm:w-7 sm:h-7 text-car-accent" />
                <span className="text-[10px] sm:text-xs font-extrabold text-slate-200 mt-0.5 leading-none">
                  -10s
                </span>
              </button>
            )}

            {/* Giant Central Play/Pause Button (80px - 88px) */}
            {!isEmbed ? (
              <button
                onClick={togglePlay}
                disabled={Boolean(playbackError)}
                className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-car-accent hover:bg-car-accentHover disabled:opacity-40 text-white flex items-center justify-center shadow-xl shadow-car-accent/50 active:scale-90 transition mx-1 border-4 border-blue-400"
                title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
              >
                {isBuffering ? (
                  <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white" />
                ) : (
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
                )}
              </button>
            ) : (
              <div className="text-sm text-slate-300 font-bold px-3">
                (Chạm video để Play)
              </div>
            )}

            {/* Forward 10s (Big touch with clear 10s text) */}
            {!isEmbed && (
              <button
                onClick={() => handleSeekRelative(10)}
                disabled={Boolean(playbackError)}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex flex-col items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm relative"
                title="Tua tới 10 giây"
              >
                <RotateCw className="w-6 h-6 sm:w-7 sm:h-7 text-car-accent" />
                <span className="text-[10px] sm:text-xs font-extrabold text-slate-200 mt-0.5 leading-none">
                  +10s
                </span>
              </button>
            )}

            {/* Next Track (Big touch) */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center border-2 border-slate-700 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition shadow-sm"
              title="Bài tiếp theo"
            >
              <SkipForward className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>

          {/* Right: Favorite & Fullscreen */}
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFavorite}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border-2 transition active:scale-95 ${
                isFavorite
                  ? 'text-amber-400 bg-amber-400/15 border-amber-400'
                  : 'text-slate-300 hover:text-white bg-slate-800 border-slate-700'
              }`}
              title="Thêm vào danh sách yêu thích"
            >
              <Star className={`w-6 h-6 sm:w-7 sm:h-7 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white bg-slate-800 border-2 border-slate-700 transition active:scale-95"
              title="Toàn màn hình"
            >
              {isFullscreen ? (
                <Minimize2 className="w-6 h-6 sm:w-7 sm:h-7" />
              ) : (
                <Maximize2 className="w-6 h-6 sm:w-7 sm:h-7" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dedicated In-Car Manual Source Selection Bar */}
      <div className="bg-slate-950/95 px-4 py-3 sm:px-6 sm:py-3.5 border-t-2 border-car-border/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: 4 Clear Playback Source Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-300 uppercase tracking-wider mr-1 shrink-0">
            <Layers className="w-4 h-4 text-car-accent" />
            <span>Nguồn phát:</span>
          </div>

          {/* Source 1: Direct MP4 (1080p Full HD) */}
          <button
            type="button"
            onClick={() => {
              setPlaybackError(null);
              setForceEmbed(false);
              setUseProxy(false);
              if (selectedQuality === 'hls') {
                setSelectedQuality((streamData.videoStreams || [])[0]?.quality || '1080p');
              }
            }}
            disabled={!hasDirectVideo}
            className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              !isEmbed && !useProxy && !isHlsActive
                ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 font-black'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            } disabled:opacity-30 disabled:pointer-events-none`}
            title="Phát trực tiếp MP4 Full HD không quảng cáo (Hỗ trợ SponsorBlock)"
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Direct MP4</span>
          </button>

          {/* Source 2: HLS Stream (Tự thích ứng) */}
          {hasHls && (
            <button
              type="button"
              onClick={() => {
                setPlaybackError(null);
                setForceEmbed(false);
                setUseProxy(false);
                setSelectedQuality('hls');
              }}
              className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                !isEmbed && !useProxy && isHlsActive
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30 font-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Luồng phát HLS thích ứng tự động theo sóng 4G/5G"
            >
              <Wifi className="w-4 h-4 text-purple-300" />
              <span>HLS Thích ứng</span>
            </button>
          )}

          {/* Source 3: Cloudflare Edge Proxy */}
          <button
            type="button"
            onClick={() => {
              setPlaybackError(null);
              setForceEmbed(false);
              setUseProxy(true);
            }}
            className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              !isEmbed && useProxy
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 font-black'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
            title="Định tuyến qua Cloudflare Edge Proxy chống chặn mạng di động"
          >
            <Server className="w-4 h-4 text-emerald-300" />
            <span>Edge Proxy</span>
          </button>

          {/* Source 4: YouTube Embed (Dự phòng) */}
          {streamData.embedUrl && (
            <button
              type="button"
              onClick={() => {
                setPlaybackError(null);
                setForceEmbed(true);
              }}
              className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                isEmbed
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30 font-black'
                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title="Trình phát YouTube Embed chính thức dự phòng"
            >
              <Tv className="w-4 h-4 text-amber-300" />
              <span>YouTube Embed</span>
            </button>
          )}
        </div>

        {/* Right: Quick 1-Touch Resolution Chips when in Direct / Proxy mode */}
        {!isEmbed && !isHlsActive && uniqueQualities.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 shrink-0">
            <span className="text-xs font-bold text-slate-400 uppercase mr-1">Độ nét:</span>
            {uniqueQualities.map((q) => {
              const isSelected = selectedQuality === q;
              const shortLabel = q.replace(/p\d+$/, 'p');
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQualityChange(q)}
                  className={`h-10 px-3 rounded-xl text-xs sm:text-sm font-black transition active:scale-95 border-2 ${
                    isSelected
                      ? 'bg-car-accent text-white border-blue-400 shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                  }`}
                >
                  {shortLabel}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
