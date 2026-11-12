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
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
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
  }, [streamData.id, streamData.duration, isEmbed]);

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
        // Native HLS playback on iOS / Apple CarPlay WebKit (APTV)
        video.src = finalStreamUrl;
        video.load();
        video.play().catch(() => {
          setIsPlaying(false);
        });
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });
        hlsRef.current = hls;
        hls.loadSource(finalStreamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            setIsPlaying(false);
          });
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setPlaybackError('Lỗi mạng khi tải luồng HLS (m3u8)');
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              setPlaybackError('Không thể giải mã luồng HLS này');
            }
          }
        });
      } else {
        setPlaybackError('Trình duyệt không hỗ trợ định dạng HLS');
      }
    } else {
      video.src = finalStreamUrl;
      video.load();
      video.play().catch(() => {
        setIsPlaying(false);
      });
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
    audio.play().catch(() => {
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [finalStreamUrl, isEmbed, playerMode]);

  // Handle stream error with automatic proxy fallback before showing error screen
  const handleMediaError = () => {
    if (!useProxy && rawStreamUrl && rawStreamUrl.includes('googlevideo.com')) {
      console.warn('Direct googlevideo stream failed, retrying via Cloudflare Edge Proxy...');
      setUseProxy(true);
      setPlaybackError(null);
      return;
    }
    if (playerMode === 'video' && !isHlsActive && hasHls) {
      console.warn('Direct MP4 failed, switching to HLS stream...');
      setSelectedQuality('hls');
      setPlaybackError(null);
      return;
    }
    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError('Luồng phát bị gián đoạn hoặc URL đã hết hạn.');
  };

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
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const el = playerMode === 'audio' ? audioRef.current : videoRef.current;
      el?.pause();
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      handleSeekRelative(-10);
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      handleSeekRelative(10);
    });
    navigator.mediaSession.setActionHandler('nexttrack', onNext || null);
    navigator.mediaSession.setActionHandler('previoustrack', onPrev || null);
  }, [streamData, onNext, onPrev, isEmbed, playerMode, isPlaying]);

  const getActiveMediaElement = () => {
    if (isEmbed) return null;
    return playerMode === 'audio' ? audioRef.current : videoRef.current;
  };

  const togglePlay = () => {
    const el = getActiveMediaElement();
    if (!el || playbackError) return;
    if (el.paused) {
      el.play().catch((err) => {
        console.warn('Play failed:', err);
      });
    } else {
      el.pause();
    }
  };

  const handleSeekRelative = (seconds: number) => {
    const el = getActiveMediaElement();
    if (!el || playbackError) return;
    const maxDur = el.duration || duration || 0;
    const newTime = Math.max(0, Math.min(el.currentTime + seconds, maxDur));
    el.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    const el = getActiveMediaElement();
    if (!el) return;
    const curr = el.currentTime;
    setCurrentTime(curr);

    // SponsorBlock: Only active for direct/HLS streams (not embed)
    if (!isEmbed && streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end - 0.5) {
          el.currentTime = segment.end;
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

  // Unique available qualities from actual muxed videoStreams
  const uniqueQualities = Array.from(
    new Set((streamData.videoStreams || []).map((v) => v.quality))
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black rounded-2xl overflow-hidden border border-car-border shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'mb-6'
      }`}
    >
      {/* Video Viewport / Audio Visualizer Area */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-car-accent animate-spin" />
            <p className="text-sm font-medium text-slate-300">Đang chuẩn bị luồng phát...</p>
          </div>
        )}

        {/* Playback Error Overlay */}
        {playbackError && !isEmbed && (
          <div className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center p-6 text-center gap-3">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <h4 className="text-base font-bold text-white">Không thể phát luồng trực tiếp</h4>
            <p className="text-xs text-car-textMuted max-w-md">{playbackError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
              {onRetry && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    onRetry();
                  }}
                  className="px-4 py-2.5 bg-car-card hover:bg-slate-800 border border-car-border text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Tải lại luồng mới</span>
                </button>
              )}
              {streamData.embedUrl && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    setForceEmbed(true);
                  }}
                  className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Phát qua YouTube Embed</span>
                </button>
              )}
              {hasNext && onNext && (
                <button
                  onClick={onNext}
                  className="px-4 py-2.5 bg-car-accent hover:bg-car-accentHover text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Bài tiếp theo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* SponsorBlock & Mode Toast Notices */}
        {(sponsorSkippedNotice || modeNotice) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/95 text-white px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
            <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {/* Mode 1: Video with Direct / HLS Stream */}
        {!isEmbed && playerMode === 'video' && (
          <video
            ref={videoRef}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            controls={false}
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
              if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
                setDuration(videoRef.current.duration);
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (onNext) onNext();
            }}
            onClick={togglePlay}
          />
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
            <div className="absolute top-2 left-2 z-10 bg-amber-500/95 text-black px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow">
              <ExternalLink className="w-3 h-3" />
              <span>Nguồn: YouTube Embed (Dự phòng)</span>
            </div>
          </div>
        )}

        {/* Mode 3: Audio Only ("Chỉ nghe nhạc" - Only rendered when hasAudioStream is true) */}
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

            {/* Rotating Album Art Vinyl Disc - Only spins when actually playing audio */}
            <div className="relative mb-4 group" onClick={togglePlay}>
              <div
                className={`w-32 h-32 sm:w-44 sm:h-44 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl relative cursor-pointer ${
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
                  <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-400"></div>
                </div>
              </div>
              <div
                className={`absolute -bottom-2 -right-2 p-2 rounded-full text-white shadow-lg ${
                  isPlaying && !isBuffering ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                {isBuffering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Radio className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
                )}
              </div>
            </div>

            <div className="text-center max-w-lg px-4">
              <h2 className="text-base sm:text-xl font-bold line-clamp-1 text-white">
                {streamData.title}
              </h2>
              <p className="text-xs sm:text-sm text-car-textMuted font-medium mt-1">
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
      <div className="bg-car-card px-4 py-3 border-t border-car-border">
        {/* Title bar for current video */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
              {streamData.title}
            </h3>
            <p className="text-[11px] text-car-textMuted truncate">{streamData.uploader}</p>
          </div>
          <span
            className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border ${
              isEmbed
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : isHlsActive
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {isEmbed
              ? 'YouTube Embed (Dự phòng)'
              : playerMode === 'audio'
              ? `Audio Stream (${useProxy ? 'Proxy' : 'Direct'})`
              : isHlsActive
              ? 'HLS Stream (M3U8)'
              : `Direct MP4 (${useProxy ? 'Proxy' : 'CDN'})`}
          </span>
        </div>

        {/* Progress scrub bar - Only for direct/HLS streams */}
        {!isEmbed && (
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono text-car-textMuted shrink-0">
              {formatSeconds(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              disabled={Boolean(playbackError)}
              onChange={handleSeekChange}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-car-accent focus:outline-none disabled:opacity-40"
            />
            <span className="text-xs font-mono text-car-textMuted shrink-0">
              {formatSeconds(duration)}
            </span>
          </div>
        )}

        {isEmbed && (
          <div className="text-[11px] text-amber-300/90 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 mb-2">
            ⚠️ Nguồn dự phòng YouTube Embed: Không hỗ trợ chặn quảng cáo/SponsorBlock, không hỗ trợ chế độ Chỉ nghe nhạc và phím Play/Tua rời. Vui lòng chạm trực tiếp vào khung video để điều khiển.
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Left: Mode Switcher & Quality */}
          <div className="flex items-center gap-2">
            {!isEmbed && (
              <button
                onClick={() => {
                  if (hasAudioStream) {
                    onPlayerModeChange(playerMode === 'video' ? 'audio' : 'video');
                  }
                }}
                disabled={!hasAudioStream}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                  !hasAudioStream
                    ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                    : playerMode === 'audio'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-200 hover:text-white'
                }`}
                title={
                  hasAudioStream
                    ? 'Bật/tắt chế độ Chỉ nghe nhạc (tiết kiệm 4G)'
                    : 'Video này không có luồng âm thanh riêng biệt'
                }
              >
                {!hasAudioStream ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Không có audio riêng</span>
                  </>
                ) : playerMode === 'audio' ? (
                  <>
                    <Tv className="w-4 h-4 text-emerald-100" />
                    <span className="hidden sm:inline">Chuyển sang Video</span>
                  </>
                ) : (
                  <>
                    <Headphones className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">Chỉ nghe nhạc</span>
                  </>
                )}
              </button>
            )}

            {/* Quality Picker: Only show actual available qualities */}
            {!isEmbed && playerMode === 'video' && (uniqueQualities.length > 1 || (hasDirectVideo && hasHls)) && (
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs px-2.5 py-2 rounded-xl border border-car-border font-medium focus:outline-none"
              >
                <option value="auto">Tự động</option>
                {hasHls && <option value="hls">HLS (Adaptive)</option>}
                {uniqueQualities.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Center: Transport Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Prev Track */}
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
              title="Bài trước"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Rewind 10s - Only for direct/HLS */}
            {!isEmbed && (
              <button
                onClick={() => handleSeekRelative(-10)}
                disabled={Boolean(playbackError)}
                className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition flex items-center justify-center relative"
                title="Tua lùi 10 giây"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="absolute text-[8px] font-bold bottom-0.5">10</span>
              </button>
            )}

            {/* Play/Pause Button - Only active for direct/HLS */}
            {!isEmbed ? (
              <button
                onClick={togglePlay}
                disabled={Boolean(playbackError)}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-car-accent hover:bg-car-accentHover disabled:opacity-40 text-white flex items-center justify-center shadow-lg shadow-car-accent/40 active:scale-90 transition mx-1"
                title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
              >
                {isBuffering ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white ml-0.5" />
                )}
              </button>
            ) : (
              <div className="text-xs text-car-textMuted px-2 font-medium">
                Chạm trên video để phát
              </div>
            )}

            {/* Forward 10s - Only for direct/HLS */}
            {!isEmbed && (
              <button
                onClick={() => handleSeekRelative(10)}
                disabled={Boolean(playbackError)}
                className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition flex items-center justify-center relative"
                title="Tua tới 10 giây"
              >
                <RotateCw className="w-5 h-5" />
                <span className="absolute text-[8px] font-bold bottom-0.5">10</span>
              </button>
            )}

            {/* Next Track */}
            <button
              onClick={onNext}
              disabled={!hasNext}
              className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
              title="Bài tiếp theo"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Right: Favorite & Fullscreen */}
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleFavorite}
              className={`p-2 sm:p-2.5 rounded-xl transition ${
                isFavorite
                  ? 'text-amber-400 bg-amber-400/10'
                  : 'text-car-textMuted hover:text-white hover:bg-slate-800'
              }`}
              title="Thêm vào danh sách yêu thích"
            >
              <Star className={`w-5 h-5 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 sm:p-2.5 rounded-xl text-car-textMuted hover:text-white hover:bg-slate-800 transition"
              title="Toàn màn hình"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
