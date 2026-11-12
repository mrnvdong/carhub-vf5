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
} from 'lucide-react';
import { StreamData, PlayerMode } from '../types';
import { formatSeconds } from '../services/api';

interface VideoPlayerProps {
  streamData: StreamData;
  isLoading: boolean;
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

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>('video');
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const hasAudioStream = (streamData.audioStreams?.length ?? 0) > 0;
  const isEmbed = streamData.playbackType === 'embed';
  const isHls = streamData.playbackType === 'hls' || (selectedQuality === 'hls' && !!streamData.hlsUrl);

  // If in audio mode but current video doesn't have an audio stream, force switch to video mode
  useEffect(() => {
    if (playerMode === 'audio' && !hasAudioStream) {
      setPlayerMode('video');
    }
    setPlaybackError(null);
  }, [streamData.id, hasAudioStream, playerMode]);

  // Determine current active direct stream URL
  const getActiveStreamUrl = () => {
    if (isEmbed) return '';

    if (playerMode === 'audio') {
      return hasAudioStream ? streamData.audioStreams[0].url : '';
    }

    if (selectedQuality === 'hls' && streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    if (streamData.videoStreams?.length > 0) {
      if (selectedQuality === '720p') {
        const q720 = streamData.videoStreams.find((s) => s.quality.includes('720'));
        if (q720) return q720.url;
      } else if (selectedQuality === '480p') {
        const q480 = streamData.videoStreams.find((s) => s.quality.includes('480'));
        if (q480) return q480.url;
      } else if (selectedQuality === '360p') {
        const q360 = streamData.videoStreams.find((s) => s.quality.includes('360'));
        if (q360) return q360.url;
      }
      return streamData.videoStreams[0].url;
    }

    if (streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    return '';
  };

  const streamUrl = getActiveStreamUrl();

  // Setup HLS when streamUrl is an m3u8 playlist
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isEmbed || playerMode === 'audio') return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isM3U8 = streamUrl && (streamUrl.includes('.m3u8') || isHls);

    if (isM3U8 && streamUrl) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS for Safari on Apple CarPlay / APTV WebKit
        video.src = streamUrl;
      } else if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setPlaybackError('Lỗi tải luồng HLS');
          }
        });
      }
    } else if (video && streamUrl) {
      video.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, isEmbed, playerMode, isHls]);

  // MediaSession API - Only active for direct/HLS streams (Cannot track sandboxed YouTube Embed iframe)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (isEmbed) {
      // Clear actions for embed
      navigator.mediaSession.metadata = new MediaMetadata({
        title: streamData.title,
        artist: 'YouTube Embed (Dự phòng)',
        album: 'CarHub VinFast VF5',
      });
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
      if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
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
    if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
    if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
  }, [streamData, onNext, onPrev, isEmbed, playerMode]);

  const getActiveMediaElement = () => {
    return playerMode === 'audio' ? audioRef.current : videoRef.current;
  };

  const togglePlay = () => {
    const el = getActiveMediaElement();
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play().catch((err) => {
        console.warn('Play interrupted:', err);
      });
    }
  };

  const handleSeekRelative = (seconds: number) => {
    const el = getActiveMediaElement();
    if (!el) return;
    const newTime = Math.max(0, Math.min(el.currentTime + seconds, duration));
    el.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    const el = getActiveMediaElement();
    if (!el) return;
    const curr = el.currentTime;
    setCurrentTime(curr);

    // SponsorBlock: Only available on direct streams
    if (!isEmbed && streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end) {
          el.currentTime = segment.end;
          setSponsorSkippedNotice('Đã bỏ qua đoạn tài trợ');
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
        {playbackError && (
          <div className="absolute inset-0 z-20 bg-black/95 flex flex-col items-center justify-center p-6 text-center gap-3">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <h4 className="text-base font-bold text-white">Không thể phát luồng này</h4>
            <p className="text-xs text-car-textMuted max-w-md">
              {playbackError}. Luồng có thể đã hết hạn hoặc bị hạn chế bản quyền.
            </p>
            <div className="flex items-center gap-3 mt-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-4 py-2 bg-car-card hover:bg-slate-800 border border-car-border text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Thử lại</span>
                </button>
              )}
              {hasNext && onNext && (
                <button
                  onClick={onNext}
                  className="px-4 py-2 bg-car-accent hover:bg-car-accentHover text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Chuyển bài kế tiếp</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* SponsorBlock Toast Notice */}
        {sponsorSkippedNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/90 text-white px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>{sponsorSkippedNotice}</span>
          </div>
        )}

        {/* Mode 1: Video with Direct / HLS Stream */}
        {!isEmbed && playerMode === 'video' && streamUrl && (
          <video
            ref={videoRef}
            className="w-full h-full object-contain cursor-pointer"
            autoPlay
            playsInline
            controls={false}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onError={() => setPlaybackError('Link stream trực tiếp không phản hồi')}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration || streamData.duration || 0);
              }
            }}
            onEnded={() => {
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
            <div className="absolute top-2 left-2 z-10 bg-amber-500/90 text-black px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow">
              <ExternalLink className="w-3 h-3" />
              <span>Nguồn YouTube Embed (Dự phòng)</span>
            </div>
          </div>
        )}

        {/* Mode 3: Audio Only (VF5 Eyes-Free Driving) */}
        {!isEmbed && playerMode === 'audio' && hasAudioStream && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-car-card via-slate-900 to-black relative">
            <audio
              ref={audioRef}
              src={streamUrl}
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onError={() => setPlaybackError('Link audio không phản hồi')}
              onLoadedMetadata={() => {
                if (audioRef.current) {
                  setDuration(audioRef.current.duration || streamData.duration || 0);
                }
              }}
              onEnded={() => {
                if (onNext) onNext();
              }}
            />

            {/* Rotating Album Art Vinyl Disc */}
            <div className="relative mb-4 group">
              <div
                className={`w-32 h-32 sm:w-44 sm:h-44 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl relative ${
                  isPlaying ? 'animate-spin' : ''
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
              <div className="absolute -bottom-2 -right-2 bg-emerald-500 p-2 rounded-full text-white shadow-lg">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
            </div>

            <div className="text-center max-w-lg px-4">
              <h2 className="text-base sm:text-xl font-bold line-clamp-1 text-white">
                {streamData.title}
              </h2>
              <p className="text-xs sm:text-sm text-car-textMuted font-medium mt-1">
                {streamData.uploader} • Chế độ chỉ nghe nhạc trên ô tô
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Car Player Controls Bar */}
      <div className="bg-car-card px-4 py-3 border-t border-car-border">
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
              onChange={handleSeekChange}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-car-accent focus:outline-none"
            />
            <span className="text-xs font-mono text-car-textMuted shrink-0">
              {formatSeconds(duration)}
            </span>
          </div>
        )}

        {isEmbed && (
          <div className="text-[11px] text-amber-300/90 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 mb-2">
            ⚠️ Đang phát qua YouTube Embed dự phòng: Vui lòng chạm trực tiếp trên video để Play/Pause và tua. Các nút chuyển bài bên dưới vẫn hoạt động.
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Left: Mode Switcher & Quality */}
          <div className="flex items-center gap-2">
            {/* Audio Mode Toggle: Only active if audio stream is available and not in embed */}
            {!isEmbed && (
              <button
                onClick={() => {
                  if (hasAudioStream) {
                    setPlayerMode(playerMode === 'video' ? 'audio' : 'video');
                  }
                }}
                disabled={!hasAudioStream}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  playerMode === 'audio'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
                title={
                  hasAudioStream
                    ? 'Chuyển chế độ chỉ nghe nhạc (tiết kiệm 4G)'
                    : 'Video này không có luồng âm thanh riêng biệt'
                }
              >
                {playerMode === 'audio' ? (
                  <>
                    <Headphones className="w-4 h-4 text-emerald-200" />
                    <span className="hidden sm:inline">Chỉ nghe nhạc</span>
                  </>
                ) : (
                  <>
                    <Tv className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {hasAudioStream ? 'Xem video' : 'Không có audio riêng'}
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Quality Picker: Only for direct streams */}
            {!isEmbed && playerMode === 'video' && streamData.videoStreams?.length > 1 && (
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs px-2.5 py-2 rounded-xl border border-car-border font-medium focus:outline-none"
              >
                <option value="auto">Tự động</option>
                {streamData.hlsUrl && <option value="hls">HLS (Mượt)</option>}
                <option value="720p">720p HD</option>
                <option value="480p">480p</option>
                <option value="360p">360p</option>
              </select>
            )}

            {/* Source Status Pill */}
            <span className="hidden md:inline-flex items-center text-[10px] font-mono px-2 py-1 rounded bg-slate-800 text-car-textMuted border border-slate-700">
              {streamData.playbackType === 'direct'
                ? 'Direct Stream'
                : streamData.playbackType === 'hls'
                ? 'HLS Stream'
                : 'Embed'}
            </span>
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
                className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition flex items-center justify-center relative"
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
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-car-accent hover:bg-car-accentHover text-white flex items-center justify-center shadow-lg shadow-car-accent/40 active:scale-90 transition mx-1"
                title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
              </button>
            ) : (
              <div className="text-xs text-car-textMuted px-2 font-medium">
                (Chạm trên video)
              </div>
            )}

            {/* Forward 10s - Only for direct/HLS */}
            {!isEmbed && (
              <button
                onClick={() => handleSeekRelative(10)}
                className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition flex items-center justify-center relative"
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
