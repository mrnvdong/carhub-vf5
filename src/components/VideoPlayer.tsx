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
  Layers,
  Heart,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
} from 'lucide-react';
import { StreamData, PlayerMode, ActiveSource, ViewMode, RepeatMode } from '../types';
import { formatSeconds } from '../services/api';
import { useCarHardwareControls } from '../hooks/useCarHardwareControls';

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
  viewMode?: ViewMode;
  onViewModeChange?: (view: ViewMode) => void;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  repeatMode?: RepeatMode;
  onToggleRepeat?: () => void;
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
  viewMode = 'classic',
  onViewModeChange,
  isShuffle = false,
  onToggleShuffle,
  repeatMode = 'all',
  onToggleRepeat,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncAudioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const hasAudioStream = (streamData.audioStreams?.length ?? 0) > 0;
  const hasDirectVideo = (streamData.videoStreams?.length ?? 0) > 0;
  const hasHls = Boolean(streamData.hlsUrl);

  const initialQuality = (streamData.videoStreams || [])[0]?.quality || '1080p';
  const [selectedQuality, setSelectedQuality] = useState<string>(initialQuality);

  // Determine starting source
  const determineInitialSource = (): ActiveSource => {
    try {
      const pref = localStorage.getItem('carhub_source_pref') as ActiveSource | null;
      if (pref === 'embed') return 'embed';
      if (pref === 'direct' && hasDirectVideo) return 'direct';
      if (pref === 'proxy' && hasDirectVideo) return 'proxy';
      if (pref === 'hls' && hasHls) return 'hls';
    } catch {}

    if (streamData.playbackType === 'direct' && hasDirectVideo) {
      return 'direct';
    }
    if (hasHls) {
      return 'hls';
    }
    return 'embed';
  };

  const [activeSource, setActiveSource] = useState<ActiveSource>(determineInitialSource);

  const isEmbed = activeSource === 'embed';
  const useProxy = activeSource === 'proxy';
  const isHlsActive = activeSource === 'hls';

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
    setCurrentTime(0);
    setDuration(streamData.duration || 0);
    setIsBuffering(true);
    setIsPlaying(false);
    setActiveSource(determineInitialSource());
    setSelectedQuality((streamData.videoStreams || [])[0]?.quality || '1080p');
  }, [streamData.id, streamData.duration]);

  // Handle explicit manual source switching from in-car UI
  const handleSelectSource = (src: ActiveSource) => {
    setPlaybackError(null);
    setActiveSource(src);
    try {
      localStorage.setItem('carhub_source_pref', src);
    } catch {}

    if (src === 'embed') {
      setModeNotice('Đã chuyển sang YouTube Embed (100% Ổn định)');
    } else if (src === 'direct') {
      setModeNotice('Đã chuyển sang Direct MP4 (Full HD & Chặn quảng cáo)');
    } else if (src === 'proxy') {
      setModeNotice('Đã chuyển sang Cloudflare Edge Proxy (Chống chặn 4G)');
    } else if (src === 'hls') {
      setModeNotice('Đã chuyển sang HLS Stream (Tự thích ứng)');
    }
    setTimeout(() => setModeNotice(null), 3500);
  };

  // Synchronized Audio Attachment for dual-element 1080p/720p Direct Video
  useEffect(() => {
    const syncAudio = syncAudioRef.current;
    if (!syncAudio || !isAudioSyncNeeded || !finalAudioSyncUrl) {
      if (syncAudio) {
        syncAudio.pause();
        syncAudio.removeAttribute('src');
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

  // Determine actual stream URL (Direct, Proxy, or HLS)
  const getStreamUrl = (): string => {
    if (isEmbed) return '';

    if (playerMode === 'audio') {
      const bestAudio = streamData.audioStreams[0];
      if (!bestAudio) return '';
      if (useProxy && bestAudio.url.includes('googlevideo.com')) {
        return `/api/proxy?url=${encodeURIComponent(bestAudio.url)}`;
      }
      return bestAudio.url;
    }

    if (isHlsActive && streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    if (!activeVideoStream) return '';

    if (useProxy && activeVideoStream.url.includes('googlevideo.com')) {
      return `/api/proxy?url=${encodeURIComponent(activeVideoStream.url)}`;
    }
    return activeVideoStream.url;
  };

  const finalStreamUrl = getStreamUrl();

  // Manage Video element attachment & HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isEmbed || playerMode === 'audio') return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!finalStreamUrl) {
      if (!isLoading) {
        setPlaybackError('Không tìm thấy luồng video trực tiếp');
      }
      return;
    }

    if (isHlsActive) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(finalStreamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsBuffering(false);
          video.play().catch(() => setIsPlaying(false));
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn('[HLS] Fatal error encountered:', data.type);
            handleMediaError('hls-fatal');
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS for Safari/iOS
        video.src = finalStreamUrl;
        video.load();
        video.play().catch(() => setIsPlaying(false));
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
  }, [finalStreamUrl, isEmbed, playerMode, isHlsActive, isLoading]);

  // Manage Audio-Only element attachment
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || isEmbed || playerMode !== 'audio') return;

    if (!finalStreamUrl) {
      if (!isLoading) {
        setPlaybackError('Không có URL âm thanh hợp lệ');
      }
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
  }, [finalStreamUrl, isEmbed, playerMode, isLoading]);

  // Self-Healing Stream Fallback Cascade
  const handleMediaError = (reasonOrEvent?: string | React.SyntheticEvent) => {
    const reason = typeof reasonOrEvent === 'string' ? reasonOrEvent : 'media-event-error';
    console.warn(`[Auto-Heal] Stream failed (${reason}). Initiating fallback...`);

    if (activeSource === 'direct' && hasDirectVideo) {
      setModeNotice('Direct MP4 bị hạn chế mạng — Đang tự động đổi sang Edge Proxy...');
      setTimeout(() => setModeNotice(null), 3000);
      setActiveSource('proxy');
      setPlaybackError(null);
      return;
    }

    if ((activeSource === 'proxy' || activeSource === 'direct') && hasHls) {
      setModeNotice('Đang tự động chuyển sang HLS Stream...');
      setTimeout(() => setModeNotice(null), 3000);
      setActiveSource('hls');
      setPlaybackError(null);
      return;
    }

    if (streamData.embedUrl && activeSource !== 'embed') {
      setModeNotice('Luồng MP4 bị YouTube chặn IP (403) — Tự động chuyển YouTube Embed');
      setTimeout(() => setModeNotice(null), 4000);
      setActiveSource('embed');
      setPlaybackError(null);
      return;
    }

    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError('Không thể phát video này trên mọi nguồn.');
  };

  // Watchdog Timer for buffering stalls
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

  // PostMessage helper to control YouTube Iframe API
  const postEmbedCommand = (command: string, args: any[] = []) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args: args,
        }),
        '*'
      );
    } catch (e) {
      console.warn('postEmbedCommand error:', e);
    }
  };

  // Listen to YouTube Iframe API state & time updates
  useEffect(() => {
    if (!isEmbed) return;

    const handleWindowMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event === 'infoDelivery' && data?.info) {
          if (typeof data.info.currentTime === 'number') {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === 'number') {
            const state = data.info.playerState;
            if (state === 1) {
              setIsPlaying(true);
              setIsBuffering(false);
            } else if (state === 2) {
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (state === 3) {
              setIsBuffering(true);
            } else if (state === 0) {
              setIsPlaying(false);
              if (repeatMode === 'one') {
                postEmbedCommand('seekTo', [0, true]);
                postEmbedCommand('playVideo');
              } else if (onNext) {
                onNext();
              }
            }
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [isEmbed, onNext, repeatMode]);

  const handleIframeLoad = () => {
    setIsBuffering(false);
    setIsPlaying(true);
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch {}
    }
  };

  const getActiveMediaElement = () => {
    if (isEmbed) return null;
    return playerMode === 'audio' ? audioRef.current : videoRef.current;
  };

  const togglePlay = () => {
    if (playbackError) return;

    if (isEmbed) {
      if (isPlaying) {
        postEmbedCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        postEmbedCommand('playVideo');
        setIsPlaying(true);
      }
      return;
    }

    const el = getActiveMediaElement();
    if (!el) return;

    if (el.paused) {
      el.play().catch(console.warn);
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
    if (playbackError) return;

    if (isEmbed) {
      const maxDur = duration || 100;
      const newTime = Math.max(0, Math.min(currentTime + seconds, maxDur));
      setCurrentTime(newTime);
      postEmbedCommand('seekTo', [newTime, true]);
      return;
    }

    const el = getActiveMediaElement();
    if (!el) return;
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

    // Sync audio drift check
    if (isAudioSyncNeeded && syncAudioRef.current && !el.paused) {
      const drift = Math.abs(syncAudioRef.current.currentTime - curr);
      if (drift > 0.25) {
        syncAudioRef.current.currentTime = curr;
      }
      if (syncAudioRef.current.paused) {
        syncAudioRef.current.play().catch(console.warn);
      }
    }

    // SponsorBlock
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

    if (isEmbed) {
      postEmbedCommand('seekTo', [val, true]);
      return;
    }

    const el = getActiveMediaElement();
    if (el) {
      el.currentTime = val;
    }
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = val;
    }
  };

  // HARDWARE STEERING WHEEL & MEDIASESSION CONTROLLER FOR VINFAST VF5
  useCarHardwareControls({
    streamData,
    isPlaying,
    currentTime,
    duration,
    onPlay: () => {
      if (isEmbed) {
        postEmbedCommand('playVideo');
        setIsPlaying(true);
      } else {
        const el = getActiveMediaElement();
        el?.play().catch(console.warn);
      }
    },
    onPause: () => {
      if (isEmbed) {
        postEmbedCommand('pauseVideo');
        setIsPlaying(false);
      } else {
        const el = getActiveMediaElement();
        el?.pause();
      }
    },
    onTogglePlay: togglePlay,
    onNext: () => {
      if (onNext) onNext();
    },
    onPrev: () => {
      if (onPrev) onPrev();
    },
    onSeekRelative: handleSeekRelative,
    onSeekTo: (time) => {
      setCurrentTime(time);
      if (isEmbed) {
        postEmbedCommand('seekTo', [time, true]);
      } else {
        const el = getActiveMediaElement();
        if (el) el.currentTime = time;
        if (isAudioSyncNeeded && syncAudioRef.current) {
          syncAudioRef.current.currentTime = time;
        }
      }
    },
  });

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

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedIframeUrl = `https://www.youtube-nocookie.com/embed/${streamData.id}?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(embedOrigin)}`;

  // SHARED MEDIA ELEMENTS: Keeps <video>, <audio>, and <iframe> in the DOM across view modes
  const renderSharedMediaElements = () => (
    <>
      {/* Mode 1: Video with Direct / HLS / Proxy Stream */}
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
              if (repeatMode === 'one') {
                const el = videoRef.current;
                if (el) {
                  el.currentTime = 0;
                  el.play().catch(console.warn);
                }
              } else if (onNext) {
                onNext();
              }
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

      {/* Mode 2: YouTube Embed */}
      {isEmbed && streamData.embedUrl && (
        <div className="relative w-full h-full flex flex-col">
          <iframe
            ref={iframeRef}
            src={embedIframeUrl}
            title={streamData.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={handleIframeLoad}
          />
          <div className="absolute top-3 left-3 z-10 bg-amber-500/95 text-black px-3 py-1 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-md">
            <ExternalLink className="w-4 h-4" />
            <span>Nguồn: YouTube Embed (100% Ổn định)</span>
          </div>
        </div>
      )}

      {/* Mode 3: Audio Only ("Chỉ nghe nhạc") */}
      {!isEmbed && playerMode === 'audio' && hasAudioStream && (
        <audio
          ref={audioRef}
          className="hidden"
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
            if (repeatMode === 'one') {
              const el = audioRef.current;
              if (el) {
                el.currentTime = 0;
                el.play().catch(console.warn);
              }
            } else if (onNext) {
              onNext();
            }
          }}
        />
      )}
    </>
  );

  // -------------------------------------------------------------
  // YOUTUBE MUSIC VIEW LAYOUT
  // -------------------------------------------------------------
  if (viewMode === 'ytmusic') {
    return (
      <div
        ref={containerRef}
        className={`relative w-full bg-[#030303] text-white rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl transition-all ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none p-6' : 'p-4 sm:p-6 mb-6'
        }`}
      >
        {/* Dynamic Ambient Background Glow from Album Art */}
        <div
          className="absolute -inset-10 opacity-25 pointer-events-none blur-3xl transition-all duration-1000 scale-125"
          style={{
            backgroundImage: `url(${streamData.thumbnailUrl})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />

        {/* SponsorBlock & Mode Toast Notices */}
        {(sponsorSkippedNotice || modeNotice) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-rose-600/95 text-white px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-2xl backdrop-blur">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>{sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        <div className="relative z-10 flex flex-col items-center">
          {/* Top Bar: YT Music Branding, Pill Switcher [Bài hát 🎵] / [Video 🎬], Fullscreen */}
          <div className="flex items-center justify-between w-full mb-4 sm:mb-6">
            {/* YouTube Music Automotive Brand */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-600/40">
                <Play className="w-4 h-4 fill-white ml-0.5" />
              </div>
              <span className="font-black text-base sm:text-lg tracking-wider text-white uppercase">
                YouTube <span className="text-rose-500 font-extrabold">Music</span>
              </span>
            </div>

            {/* Pill Switcher: Song vs Video Mode */}
            {!isEmbed && hasAudioStream ? (
              <div className="flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => onPlayerModeChange('audio')}
                  className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition active:scale-95 ${
                    playerMode === 'audio'
                      ? 'bg-white text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Bài hát</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlayerModeChange('video')}
                  className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition active:scale-95 ${
                    playerMode === 'video'
                      ? 'bg-white text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Video</span>
                </button>
              </div>
            ) : (
              <div className="text-xs font-bold text-zinc-400 bg-zinc-900 px-3.5 py-1.5 rounded-full border border-zinc-800">
                Chế độ Video
              </div>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="w-11 h-11 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-800 transition active:scale-95 shadow-sm"
              title="Toàn màn hình"
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Center Display: Square Album Artwork (Audio) OR Video Viewport */}
          <div className="w-full flex items-center justify-center mb-5 sm:mb-6">
            {playerMode === 'audio' && !isEmbed ? (
              /* YouTube Music Square Album Art Display with Vinyl Glow */
              <div
                onClick={togglePlay}
                className="relative w-56 h-56 sm:w-68 sm:h-68 md:w-80 md:h-80 rounded-3xl overflow-hidden shadow-2xl shadow-black/90 border-2 border-zinc-800/80 group cursor-pointer active:scale-98 transition duration-200"
              >
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className={`w-full h-full object-cover transition-transform duration-700 ${
                    isPlaying && !isBuffering ? 'scale-105' : 'scale-100'
                  }`}
                />

                {/* Loading / Buffering Overlay */}
                {(isLoading || isBuffering) && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-xs">
                    <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
                  </div>
                )}

                {/* Animated Equalizer Waveform Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-4">
                  {isPlaying && !isBuffering ? (
                    <div className="flex items-end gap-1.5 h-6">
                      <span
                        className="w-1.5 bg-rose-500 rounded-full animate-bounce"
                        style={{ height: '100%', animationDelay: '0ms' }}
                      />
                      <span
                        className="w-1.5 bg-rose-500 rounded-full animate-bounce"
                        style={{ height: '60%', animationDelay: '150ms' }}
                      />
                      <span
                        className="w-1.5 bg-rose-500 rounded-full animate-bounce"
                        style={{ height: '90%', animationDelay: '300ms' }}
                      />
                      <span
                        className="w-1.5 bg-rose-500 rounded-full animate-bounce"
                        style={{ height: '40%', animationDelay: '450ms' }}
                      />
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-zinc-400 bg-black/70 px-2.5 py-1 rounded-lg">
                      Đang tạm dừng
                    </span>
                  )}

                  <div className="p-2.5 rounded-full bg-rose-600/90 text-white shadow-lg">
                    <Music className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ) : (
              /* Video Viewport */
              <div className="relative aspect-video w-full max-w-2xl bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center">
                {isLoading && (
                  <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
                    <p className="text-sm font-bold text-zinc-300">Đang chuẩn bị luồng phát...</p>
                  </div>
                )}
                {renderSharedMediaElements()}
              </div>
            )}
          </div>

          {/* Hidden shared media elements when in audio mode */}
          {playerMode === 'audio' && !isEmbed && renderSharedMediaElements()}

          {/* Song Info & Heart Action */}
          <div className="w-full flex items-center justify-between gap-4 mb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-black text-white truncate leading-tight">
                {streamData.title}
              </h2>
              <p className="text-sm sm:text-base text-zinc-400 font-semibold truncate mt-1">
                {streamData.uploader}
              </p>
            </div>

            <button
              onClick={onToggleFavorite}
              className={`w-13 h-13 rounded-2xl flex items-center justify-center transition active:scale-95 shrink-0 border ${
                isFavorite
                  ? 'text-rose-500 bg-rose-500/15 border-rose-500/60'
                  : 'text-zinc-400 hover:text-white bg-zinc-900 border-zinc-800'
              }`}
              title="Yêu thích bài hát"
            >
              <Heart className={`w-6 h-6 ${isFavorite ? 'fill-rose-500' : ''}`} />
            </button>
          </div>

          {/* Scrubber Timeline */}
          <div className="w-full space-y-1.5 mb-4">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              disabled={Boolean(playbackError)}
              onChange={handleSeekChange}
              className="w-full cursor-pointer accent-rose-500"
            />
            <div className="flex justify-between text-xs font-mono font-bold text-zinc-400 px-0.5">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* YouTube Music Iconic In-Car Transport Controls */}
          <div className="w-full flex items-center justify-between max-w-lg pt-1">
            {/* Shuffle */}
            <button
              onClick={onToggleShuffle}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition active:scale-95 ${
                isShuffle ? 'text-rose-500 bg-rose-500/20' : 'text-zinc-400 hover:text-white'
              }`}
              title="Phát ngẫu nhiên"
            >
              <Shuffle className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Prev Track */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl text-zinc-200 hover:text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
              title="Bài trước"
            >
              <SkipBack className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
            </button>

            {/* Rewind 10s */}
            <button
              onClick={() => handleSeekRelative(-10)}
              className="w-12 h-12 rounded-2xl text-zinc-300 hover:text-white flex flex-col items-center justify-center active:scale-95"
              title="Tua lùi 10 giây"
            >
              <RotateCcw className="w-5 h-5 text-rose-500" />
              <span className="text-[10px] font-extrabold mt-0.5">-10s</span>
            </button>

            {/* GIANT ICONIC WHITE PLAY/PAUSE CIRCLE (YouTube Music Standard: 80px) */}
            <button
              onClick={togglePlay}
              disabled={Boolean(playbackError)}
              className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-white hover:bg-zinc-200 active:scale-90 text-black flex items-center justify-center shadow-2xl shadow-white/30 transition mx-1 shrink-0"
              title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {isBuffering ? (
                <Loader2 className="w-8 h-8 sm:w-9 sm:h-9 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="w-8 h-8 sm:w-9 sm:h-9 fill-black text-black" />
              ) : (
                <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-black text-black ml-1" />
              )}
            </button>

            {/* Forward 10s */}
            <button
              onClick={() => handleSeekRelative(10)}
              className="w-12 h-12 rounded-2xl text-zinc-300 hover:text-white flex flex-col items-center justify-center active:scale-95"
              title="Tua tới 10 giây"
            >
              <RotateCw className="w-5 h-5 text-rose-500" />
              <span className="text-[10px] font-extrabold mt-0.5">+10s</span>
            </button>

            {/* Next Track */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl text-zinc-200 hover:text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
              title="Bài tiếp theo"
            >
              <SkipForward className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
            </button>

            {/* Repeat Mode */}
            <button
              onClick={onToggleRepeat}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition active:scale-95 relative ${
                repeatMode !== 'off'
                  ? 'text-rose-500 bg-rose-500/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title={
                repeatMode === 'one'
                  ? 'Đang lặp 1 bài'
                  : repeatMode === 'all'
                  ? 'Đang lặp danh sách'
                  : 'Không lặp lại'
              }
            >
              {repeatMode === 'one' ? (
                <Repeat1 className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />
              ) : (
                <Repeat className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </button>
          </div>

          {/* Bottom Audio Quality & Source Selector */}
          <div className="w-full flex items-center justify-between pt-4 mt-4 border-t border-zinc-900 text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-zinc-400 font-bold uppercase tracking-wider">
                {activeSource === 'direct'
                  ? 'Direct MP4 / Audio High-Bitrate'
                  : activeSource === 'hls'
                  ? 'HLS Stream Tự Động'
                  : activeSource === 'proxy'
                  ? 'Edge Proxy Ổn Định'
                  : 'YouTube Embed'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  handleSelectSource(activeSource === 'embed' ? 'direct' : 'embed')
                }
                className="text-zinc-400 hover:text-white font-bold underline transition"
              >
                {activeSource === 'embed'
                  ? 'Đổi sang luồng Direct MP4'
                  : 'Đổi sang luồng Embed (Dự phòng)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // CLASSIC CARHUB VIDEO VIEW LAYOUT (Original layout)
  // -------------------------------------------------------------
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
            <p className="text-base sm:text-lg font-bold text-slate-200">
              Đang chuẩn bị luồng phát...
            </p>
          </div>
        )}

        {/* Playback Error Overlay */}
        {playbackError && (
          <div className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-14 h-14 text-rose-500" />
            <h4 className="text-lg sm:text-xl font-bold text-white">
              Không thể phát luồng này
            </h4>
            <p className="text-sm text-car-textMuted max-w-md">{playbackError}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
              {streamData.embedUrl && (
                <button
                  onClick={() => handleSelectSource('embed')}
                  className="h-13 px-5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <Tv className="w-5 h-5" />
                  <span>Phát qua YouTube Embed (100% OK)</span>
                </button>
              )}
              {onRetry && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    onRetry();
                  }}
                  className="h-13 px-5 bg-car-card hover:bg-slate-800 border-2 border-car-border text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Tải lại</span>
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
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/95 text-white px-5 py-2.5 rounded-full text-sm sm:text-base font-bold flex items-center gap-2 shadow-xl backdrop-blur">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>{sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {/* Mode 1 & 2: Video or Embed */}
        {(!isEmbed && playerMode === 'video') || isEmbed ? (
          renderSharedMediaElements()
        ) : (
          /* Mode 3: Audio Only ("Chỉ nghe nhạc") in Classic view */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-car-card via-slate-900 to-black relative">
            {renderSharedMediaElements()}

            {/* Rotating Album Art Vinyl Disc */}
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

      {/* Car Player Controls Bar */}
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
            {playerMode === 'video' && (
              <span
                className={`shrink-0 text-xs sm:text-sm font-extrabold px-3 py-1.5 rounded-xl border-2 flex items-center gap-1.5 ${
                  activeSource === 'embed'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : activeSource === 'hls'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                {activeSource === 'embed'
                  ? 'YouTube Embed'
                  : activeSource === 'hls'
                  ? '1080p HLS'
                  : `${activeVideoStream?.quality || '1080p'} Full HD`}
              </span>
            )}
            <span
              className={`shrink-0 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl border-2 ${
                activeSource === 'embed'
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                  : playerMode === 'audio'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                  : activeSource === 'hls'
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/40'
                  : activeSource === 'proxy'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                  : 'bg-blue-500/10 text-blue-300 border-blue-500/40'
              }`}
            >
              {activeSource === 'embed'
                ? '100% Ổn định'
                : playerMode === 'audio'
                ? 'Chỉ nghe nhạc'
                : activeSource === 'hls'
                ? 'HLS Stream'
                : activeSource === 'proxy'
                ? 'Edge Proxy'
                : 'Direct MP4'}
            </span>
          </div>
        </div>

        {/* Thick Progress Scrub Bar */}
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
            {!isEmbed &&
              playerMode === 'video' &&
              (uniqueQualities.length > 1 || (hasDirectVideo && hasHls)) && (
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

          {/* Center: MASSIVE Transport Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Prev Track */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center border-2 border-slate-700 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition shadow-sm"
              title="Bài trước"
            >
              <SkipBack className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>

            {/* Rewind 10s */}
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

            {/* Giant Central Play/Pause Button (80px - 88px) */}
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

            {/* Forward 10s */}
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

            {/* Next Track */}
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

      {/* In-Car Source Selection Bar */}
      <div className="bg-slate-950/95 px-4 py-3 sm:px-6 sm:py-3.5 border-t-2 border-car-border/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-300 uppercase tracking-wider mr-1 shrink-0">
            <Layers className="w-4 h-4 text-car-accent" />
            <span>Nguồn phát:</span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectSource('direct')}
            disabled={!hasDirectVideo}
            className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              activeSource === 'direct'
                ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span>Direct MP4</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSource('proxy')}
            disabled={!hasDirectVideo}
            className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              activeSource === 'proxy'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span>Edge Proxy</span>
          </button>

          {hasHls && (
            <button
              type="button"
              onClick={() => handleSelectSource('hls')}
              className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                activeSource === 'hls'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>HLS Stream</span>
            </button>
          )}

          {streamData.embedUrl && (
            <button
              type="button"
              onClick={() => handleSelectSource('embed')}
              className={`h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                activeSource === 'embed'
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>YouTube Embed</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
