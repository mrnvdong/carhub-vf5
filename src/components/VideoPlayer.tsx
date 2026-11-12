import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { StreamData, PlayerMode } from '../types';
import { formatSeconds } from '../services/api';

interface VideoPlayerProps {
  streamData: StreamData;
  isLoading: boolean;
  onNext?: () => void;
  onPrev?: () => void;
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
  hasNext,
  hasPrev,
  isFavorite,
  onToggleFavorite,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>('video');
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');

  // Determine current active media source
  const getActiveStreamUrl = () => {
    if (playerMode === 'audio' && streamData.audioStreams?.length > 0) {
      return streamData.audioStreams[0].url;
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

    if (streamData.audioStreams?.length > 0) {
      return streamData.audioStreams[0].url;
    }

    return '';
  };

  const streamUrl = getActiveStreamUrl();

  // MediaSession API for CarPlay & VinFast Steering Wheel Controls
  useEffect(() => {
    if ('mediaSession' in navigator && streamData) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: streamData.title,
        artist: streamData.uploader,
        album: 'CarHub VinFast VF5',
        artwork: [
          { src: streamData.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => {
        mediaRef.current?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        mediaRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        handleSeekRelative(-10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        handleSeekRelative(10);
      });
      if (onNext) {
        navigator.mediaSession.setActionHandler('nexttrack', onNext);
      }
      if (onPrev) {
        navigator.mediaSession.setActionHandler('previoustrack', onPrev);
      }
    }
  }, [streamData, onNext, onPrev]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play().catch(console.error);
    }
  };

  const handleSeekRelative = (seconds: number) => {
    if (!mediaRef.current) return;
    const newTime = Math.max(0, Math.min(mediaRef.current.currentTime + seconds, duration));
    mediaRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const curr = mediaRef.current.currentTime;
    setCurrentTime(curr);

    // SponsorBlock: Check if current time falls in a sponsor segment
    if (streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end) {
          mediaRef.current.currentTime = segment.end;
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
    if (mediaRef.current) {
      mediaRef.current.currentTime = val;
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
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-car-accent animate-spin" />
            <p className="text-sm font-medium text-slate-300">Đang tải luồng không quảng cáo...</p>
          </div>
        )}

        {/* SponsorBlock Toast Notice */}
        {sponsorSkippedNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/90 text-white px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>{sponsorSkippedNotice}</span>
          </div>
        )}

        {/* Mode: Video with Direct Stream */}
        {playerMode === 'video' && streamUrl && (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={streamUrl}
            className="w-full h-full object-contain cursor-pointer"
            autoPlay
            playsInline
            controls={false}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (mediaRef.current) {
                setDuration(mediaRef.current.duration || streamData.duration || 0);
              }
            }}
            onEnded={() => {
              if (onNext) onNext();
            }}
            onClick={togglePlay}
          />
        )}

        {/* Fallback to Embed if no direct stream */}
        {playerMode === 'video' && !streamUrl && streamData.embedUrl && (
          <iframe
            src={streamData.embedUrl}
            title={streamData.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}

        {/* Mode: Audio Only (VF5 Eyes-Free Driving) */}
        {playerMode === 'audio' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-car-card via-slate-900 to-black relative">
            {streamUrl && (
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                src={streamUrl}
                autoPlay
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (mediaRef.current) {
                    setDuration(mediaRef.current.duration || streamData.duration || 0);
                  }
                }}
                onEnded={() => {
                  if (onNext) onNext();
                }}
              />
            )}

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
              <div className="absolute -bottom-2 -right-2 bg-car-accent p-2 rounded-full text-white shadow-lg">
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
        {/* Progress scrub bar */}
        {streamUrl && (
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

        <div className="flex items-center justify-between gap-2">
          {/* Left: Mode Switcher & Quality */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlayerMode(playerMode === 'video' ? 'audio' : 'video')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                playerMode === 'audio'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Chuyển chế độ chỉ nghe nhạc để tiết kiệm 4G và tập trung lái xe"
            >
              {playerMode === 'audio' ? (
                <>
                  <Headphones className="w-4 h-4 text-emerald-200" />
                  <span className="hidden sm:inline">Chỉ nghe nhạc</span>
                </>
              ) : (
                <>
                  <Tv className="w-4 h-4" />
                  <span className="hidden sm:inline">Xem video</span>
                </>
              )}
            </button>

            {playerMode === 'video' && streamData.videoStreams?.length > 1 && (
              <select
                value={selectedQuality}
                onChange={(e) => setSelectedQuality(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs px-2.5 py-2 rounded-xl border border-car-border font-medium focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="720p">720p HD</option>
                <option value="480p">480p</option>
                <option value="360p">360p (Mượt)</option>
              </select>
            )}
          </div>

          {/* Center: BIG Touch Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
              title="Bài trước"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleSeekRelative(-10)}
              className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition flex items-center justify-center relative"
              title="Tua lùi 10 giây"
            >
              <RotateCcw className="w-5 h-5" />
              <span className="absolute text-[8px] font-bold bottom-0.5">10</span>
            </button>

            <button
              onClick={togglePlay}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-car-accent hover:bg-car-accentHover text-white flex items-center justify-center shadow-lg shadow-car-accent/40 active:scale-90 transition mx-1"
              title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
            </button>

            <button
              onClick={() => handleSeekRelative(10)}
              className="p-2 sm:p-2.5 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 active:scale-95 transition flex items-center justify-center relative"
              title="Tua tới 10 giây"
            >
              <RotateCw className="w-5 h-5" />
              <span className="absolute text-[8px] font-bold bottom-0.5">10</span>
            </button>

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
