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
  ShieldCheck,
  Loader2,
  Heart,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
  ListMusic,
  Compass,
  History,
  Bookmark,
  ChevronDown,
  Search,
  Mic,
  Clock,
  Quote,
  Sparkles,
} from 'lucide-react';
import {
  StreamData,
  PlayerMode,
  ViewMode,
  RepeatMode,
  VideoItem,
  UiScale,
} from '../types';
import { formatSeconds } from '../services/api';
import { fetchSyncedLyrics, LyricsResult } from '../services/lyrics';
import { useCarHardwareControls } from '../hooks/useCarHardwareControls';

const MEDIA_CATEGORIES = [
  { id: 'remix', label: '🔥 Remix Lái Xe', query: 'nhạc trẻ remix bass cực căng lái xe' },
  { id: 'vinahouse', label: '⚡ Vinahouse', query: 'vinahouse nonstop căng đét' },
  { id: 'driving', label: '🚗 Đường Dài', query: 'nhạc lái xe đường dài hay nhất' },
  { id: 'chill', label: '☕ Lofi Chill', query: 'nhạc lofi chill tiếng mưa lái xe' },
  { id: 'bolero', label: '📻 Bolero', query: 'bolero trữ tình hay nhất trên ô tô' },
  { id: 'podcast', label: '🎙️ Podcast', query: 'hieu tv podcast hay nhất' },
  { id: 'kids', label: '👶 Thiếu Nhi', query: 'ca nhạc thiếu nhi vui nhộn cho bé' },
];

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
  queueVideos?: VideoItem[];
  currentVideoId?: string;
  onSelectVideo?: (video: VideoItem) => void;
  isLoadingQueue?: boolean;
  hasMoreQueue?: boolean;
  isLoadingMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  selectedCategory?: string;
  onSelectCategory?: (catId: string, query: string) => void;
  activeTab?: 'explore' | 'history' | 'favorites';
  onChangeTab?: (tab: 'explore' | 'history' | 'favorites') => void;
  favoritesCount?: number;
  historyCount?: number;
  onOpenSearchModal?: (startVoice?: boolean) => void;
  uiScale?: UiScale;
  onChangeUiScale?: (scale: UiScale) => void;
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
  viewMode = 'ytmusic',
  onViewModeChange,
  isShuffle = false,
  onToggleShuffle,
  repeatMode = 'all',
  onToggleRepeat,
  queueVideos = [],
  currentVideoId,
  onSelectVideo,
  isLoadingQueue = false,
  hasMoreQueue = false,
  isLoadingMoreQueue = false,
  onLoadMoreQueue,
  selectedCategory = 'remix',
  onSelectCategory,
  onChangeTab,
  favoritesCount = 0,
  onOpenSearchModal,
  uiScale = 'large',
  onChangeUiScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hardwareNotice, setHardwareNotice] = useState<string | null>(null);

  const [railSection, setRailSection] = useState<'nowPlaying' | 'browse' | 'favorites' | 'history'>('nowPlaying');
  const [musicRightTab, setMusicRightTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [videoRightTab, setVideoRightTab] = useState<'queue' | 'categories'>('queue');
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [clockTime, setClockTime] = useState<string>('');

  const isVideoMode = viewMode === 'classic';

  // Clock update
  useEffect(() => {
    const update = () => {
      setClockTime(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, []);

  // Fetch synced lyrics whenever song changes
  useEffect(() => {
    if (!streamData.id) return;
    let cancelled = false;
    setIsLoadingLyrics(true);
    setLyricsData(null);

    fetchSyncedLyrics(streamData.id, streamData.title, streamData.uploader)
      .then((res) => {
        if (!cancelled) {
          setLyricsData(res);
          setIsLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingLyrics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [streamData.id, streamData.title, streamData.uploader]);

  // Compute active lyric line index
  const activeLyricIndex = React.useMemo(() => {
    if (!lyricsData || !lyricsData.isSynced || lyricsData.lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lyricsData.lines.length; i++) {
      if (currentTime >= lyricsData.lines[i].time - 0.2) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData, currentTime]);

  // Auto-scroll active lyric line strictly inside lyricsContainerRef
  useEffect(() => {
    if (isVideoMode || musicRightTab !== 'lyrics' || railSection !== 'nowPlaying') return;
    const container = lyricsContainerRef.current;
    const el = activeLyricRef.current;
    if (!container || !el) return;

    const targetTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeLyricIndex, musicRightTab, railSection, isVideoMode]);

  // Reset playback counters on track change
  useEffect(() => {
    setCurrentTime(0);
    setDuration(streamData.duration || 0);
    setIsBuffering(true);
    setIsPlaying(true);

    const sendListening = () => {
      const iframe = iframeRef.current;
      if (iframe && iframe.contentWindow) {
        try {
          iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
        } catch {}
      }
    };
    const t1 = setTimeout(sendListening, 500);
    const t2 = setTimeout(sendListening, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [streamData.id, streamData.duration]);

  const showHardwareToast = (label: string) => {
    setHardwareNotice(label);
    setTimeout(() => {
      setHardwareNotice((prev) => (prev === label ? null : prev));
    }, 2200);
  };

  const postEmbedCommand = (command: string, args: any[] = []) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args,
        }),
        '*'
      );
    } catch {}
  };

  // Listen to YouTube Iframe API state & currentTime updates
  useEffect(() => {
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
  }, [onNext, repeatMode]);

  const handleIframeLoad = () => {
    setIsBuffering(false);
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch {}
    }
  };

  const handlePlayExplicit = () => {
    postEmbedCommand('playVideo');
    setIsPlaying(true);
  };

  const handlePauseExplicit = () => {
    postEmbedCommand('pauseVideo');
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) handlePauseExplicit();
    else handlePlayExplicit();
  };

  const handleSeekRelative = (seconds: number) => {
    const maxDur = duration || 100;
    const newTime = Math.max(0, Math.min(currentTime + seconds, maxDur));
    setCurrentTime(newTime);
    postEmbedCommand('seekTo', [newTime, true]);
  };

  const handleSeekTo = (val: number) => {
    setCurrentTime(val);
    postEmbedCommand('seekTo', [val, true]);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSeekTo(parseFloat(e.target.value));
  };

  useCarHardwareControls({
    streamData,
    isPlaying,
    currentTime,
    duration,
    onPlay: handlePlayExplicit,
    onPause: handlePauseExplicit,
    onTogglePlay: togglePlay,
    onNext: () => {
      if (onNext) onNext();
    },
    onPrev: () => {
      if (onPrev) onPrev();
    },
    onSeekRelative: handleSeekRelative,
    onSeekTo: handleSeekTo,
    onHardwareAction: showHardwareToast,
  });

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

  const cycleScale = () => {
    if (!onChangeUiScale) return;
    if (uiScale === 'normal') onChangeUiScale('large');
    else if (uiScale === 'large') onChangeUiScale('xlarge');
    else onChangeUiScale('normal');
  };

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedIframeUrl = `https://www.youtube-nocookie.com/embed/${streamData.id}?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(embedOrigin)}`;
  const remainingTime = Math.max(0, (duration || 0) - currentTime);

  // ===========================================================================
  // UNIFIED APPLE iPHONE DUO LIQUID GLASS SHELL (Dùng chung cho cả Music & Video)
  // - Chuyển đổi tức thì giữa Music <-> Video không ngắt nhạc, không đổi bố cục đột ngột
  // - Iframe giữ nguyên vị trí DOM trong Left Pane (ẩn 2px khi ở Music hoặc Browse)
  // ===========================================================================
  const showVideoInViewport = isVideoMode && railSection === 'nowPlaying';

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden bg-[#07070a] text-white select-none flex flex-col md:flex-row shadow-2xl border border-white/10 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none border-none h-screen'
          : 'min-h-[calc((100dvh-16px)/var(--ui-zoom,1))] md:h-[calc((100dvh-16px)/var(--ui-zoom,1))] rounded-3xl'
      }`}
    >
      {/* FULL-BLEED LIVING COLOR FIELD BACKDROP */}
      <div
        key={`bg-${streamData.id}`}
        className="absolute inset-0 pointer-events-none opacity-65 blur-[95px] animate-ambient-drift transition-opacity duration-1000"
        style={{
          backgroundImage: `url(${streamData.thumbnailUrl})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-black/50 via-black/40 to-black/80" />

      {/* Toast thông báo phím cứng vô lăng VF5 */}
      {hardwareNotice && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-white/15 backdrop-blur-2xl text-white px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-2xl border border-white/25">
          <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{hardwareNotice}</span>
        </div>
      )}

      {/* 1. UNIFIED VERTICAL LIQUID GLASS TAB RAIL */}
      {!isFullscreen && (
        <aside className="relative z-20 flex md:flex-col items-center justify-between gap-2 p-2.5 md:py-4 md:px-2.5 bg-white/[0.06] backdrop-blur-2xl border-b md:border-b-0 md:border-r border-white/15 shrink-0">
          {/* Dynamic Mode Badge */}
          <div className="hidden md:flex flex-col items-center gap-1 mb-1">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg border border-white/20 ios-spring-fast ${
                isVideoMode
                  ? 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-blue-500/30'
                  : 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/30'
              }`}
            >
              {isVideoMode ? (
                <Tv className="w-5 h-5 text-white" />
              ) : (
                <Music className="w-5 h-5 text-white" />
              )}
            </div>
            <span className="text-[10px] font-bold tracking-wider text-white/60 uppercase">
              {isVideoMode ? 'Video' : 'Music'}
            </span>
          </div>

          {/* Rail Navigation */}
          <nav className="flex md:flex-col items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setRailSection('nowPlaying')}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl ios-spring-fast active:scale-95 ${
                railSection === 'nowPlaying'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {isVideoMode ? <Tv className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
              <span className="text-[10px] font-bold">Đang phát</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRailSection('browse');
                if (onChangeTab) onChangeTab('explore');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl ios-spring-fast active:scale-95 ${
                railSection === 'browse'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span className="text-[10px] font-bold">Khám phá</span>
            </button>

            {onOpenSearchModal && (
              <button
                type="button"
                onClick={() => onOpenSearchModal(false)}
                className="flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl text-white/60 hover:text-white hover:bg-white/10 ios-spring-fast active:scale-95"
              >
                <Search className="w-5 h-5" />
                <span className="text-[10px] font-bold">Tìm kiếm</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRailSection('favorites');
                if (onChangeTab) onChangeTab('favorites');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl ios-spring-fast active:scale-95 ${
                railSection === 'favorites'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bookmark className="w-5 h-5" />
              <span className="text-[10px] font-bold">Đã lưu ({favoritesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRailSection('history');
                if (onChangeTab) onChangeTab('history');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl ios-spring-fast active:scale-95 ${
                railSection === 'history'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-5 h-5" />
              <span className="text-[10px] font-bold">Lịch sử</span>
            </button>
          </nav>

          {/* Bottom Tools: Voice Mic, Zoom, Switch Music/Video, Clock */}
          <div className="flex md:flex-col items-center gap-1.5 shrink-0">
            {onOpenSearchModal && (
              <button
                type="button"
                onClick={() => onOpenSearchModal(true)}
                className="w-11 h-11 rounded-2xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 text-rose-200 flex items-center justify-center ios-spring-fast active:scale-95"
                title="Tìm kiếm giọng nói"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}

            {onChangeUiScale && (
              <button
                type="button"
                onClick={cycleScale}
                className="hidden sm:flex flex-col items-center justify-center w-14 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white/80 border border-white/10 ios-spring-fast active:scale-95"
                title="Đổi cỡ giao diện"
              >
                {uiScale === 'normal' ? '100%' : uiScale === 'large' ? '120%' : '132%'}
              </button>
            )}

            {onViewModeChange && (
              <button
                type="button"
                onClick={() => onViewModeChange(isVideoMode ? 'ytmusic' : 'classic')}
                className={`flex flex-col items-center justify-center gap-0.5 w-14 md:w-16 py-2 rounded-2xl border ios-spring-fast active:scale-95 ${
                  isVideoMode
                    ? 'bg-rose-500/25 hover:bg-rose-500/35 text-rose-200 border-rose-400/40'
                    : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border-sky-400/35'
                }`}
                title={isVideoMode ? 'Chuyển sang chế độ Nghe Nhạc' : 'Chuyển sang chế độ Xem Video'}
              >
                {isVideoMode ? (
                  <>
                    <Music className="w-4 h-4 text-rose-300" />
                    <span className="text-[10px] font-bold">Music</span>
                  </>
                ) : (
                  <>
                    <Tv className="w-4 h-4 text-sky-300" />
                    <span className="text-[10px] font-bold">Video</span>
                  </>
                )}
              </button>
            )}

            <div className="hidden md:flex items-center gap-1 text-[11px] font-mono font-bold text-white/50 pt-1">
              <Clock className="w-3 h-3" />
              <span>{clockTime}</span>
            </div>
          </div>
        </aside>
      )}

      {/* 2. MAIN CONTENT CANVAS */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0 p-3 sm:p-5 md:p-6 overflow-hidden">
        {/* NOW PLAYING TWO-PANE LANDSCAPE WORKSPACE */}
        <div
          className={
            railSection === 'nowPlaying'
              ? `flex-1 min-h-0 grid grid-cols-1 ${
                  isFullscreen ? '' : 'md:grid-cols-12'
                } gap-4 lg:gap-7 items-center max-w-[1440px] mx-auto w-full animate-ios-sheet-in`
              : 'hidden'
          }
        >
          {/* LEFT PANE: Artwork (Music) OR 16:9 Video Viewport (Video) + Scrubber + Transport */}
          <div
            className={`flex flex-col items-center justify-center w-full mx-auto ${
              isFullscreen
                ? 'h-full max-w-none'
                : isVideoMode
                ? 'md:col-span-7 lg:col-span-8 max-w-3xl'
                : 'md:col-span-5 max-w-sm'
            }`}
          >
            {/* A. SQUARE ALBUM ARTWORK (Hiển thị khi ở chế độ Music) */}
            {!isVideoMode && (
              <div
                onClick={togglePlay}
                className={`relative w-44 h-44 sm:w-52 sm:h-52 lg:w-64 lg:h-64 xl:w-72 xl:h-72 rounded-3xl overflow-hidden shadow-[0_24px_65px_rgba(0,0,0,0.75)] border border-white/15 cursor-pointer ios-spring ${
                  isPlaying && !isBuffering ? 'scale-100' : 'scale-[0.91]'
                }`}
              >
                <img
                  key={`art-${streamData.id}`}
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className="w-full h-full object-cover animate-artwork-enter"
                />

                {(isLoading || isBuffering) && (
                  <div className="absolute inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                  </div>
                )}

                <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white/85">
                  YouTube Audio
                </div>
              </div>
            )}

            {/* B. PERSISTENT YOUTUBE EMBED IFRAME (Giữ cố định 1 chỗ DOM để chuyển Music <-> Video không bao giờ load lại bài!) */}
            <div
              className={
                showVideoInViewport
                  ? `relative w-full overflow-hidden bg-black/85 border border-white/15 shadow-[0_24px_65px_rgba(0,0,0,0.75)] animate-artwork-enter ${
                      isFullscreen ? 'flex-1 rounded-2xl' : 'aspect-video rounded-3xl'
                    }`
                  : 'w-[2px] h-[2px] opacity-[0.01] pointer-events-none fixed bottom-0 right-0 overflow-hidden'
              }
            >
              <iframe
                ref={iframeRef}
                src={embedIframeUrl}
                title={streamData.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onLoad={handleIframeLoad}
              />
              {showVideoInViewport && (isLoading || isBuffering) && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                  <Loader2 className="w-12 h-12 text-white animate-spin" />
                </div>
              )}
            </div>

            {/* SONG / VIDEO TITLE, ARTIST & ACTION PILLS */}
            <div className="w-full flex items-center justify-between gap-3 mt-4 sm:mt-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-extrabold text-white truncate tracking-tight">
                  {streamData.title}
                </h2>
                <p className="text-xs sm:text-sm lg:text-base text-white/65 font-semibold truncate mt-0.5">
                  {streamData.uploader}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onToggleFavorite}
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border ios-spring-fast active:scale-90 ${
                    isFavorite
                      ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                      : 'bg-white/10 border-white/15 text-white/70 hover:text-white'
                  }`}
                  title="Yêu thích"
                >
                  <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-400' : ''}`} />
                </button>

                {isVideoMode && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 hover:text-white ios-spring-fast active:scale-90"
                    title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-5 h-5" />
                    ) : (
                      <Maximize2 className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* APPLE SCRUBBER BAR */}
            <div className="w-full mt-3.5 sm:mt-4 space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeekChange}
                className="w-full rounded-full cursor-pointer apple-scrubber"
              />
              <div className="flex justify-between text-xs font-mono font-bold text-white/55">
                <span>{formatSeconds(currentTime)}</span>
                <span>-{formatSeconds(remainingTime)}</span>
              </div>
            </div>

            {/* UNIFIED LIQUID GLASS TRANSPORT CONTROLS */}
            <div
              className={`w-full flex items-center justify-between mt-3 px-1 ${
                isVideoMode ? 'max-w-lg' : ''
              }`}
            >
              <button
                type="button"
                onClick={onToggleShuffle}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${
                  isShuffle
                    ? 'bg-white/20 text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
                title="Phát ngẫu nhiên"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90"
                title="Bài trước"
              >
                <SkipBack className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
              </button>

              {isVideoMode && (
                <button
                  type="button"
                  onClick={() => handleSeekRelative(-10)}
                  className="w-11 h-11 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center ios-spring-fast active:scale-90"
                  title="Tua lùi 10s"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="text-[9px] font-extrabold">-10s</span>
                </button>
              )}

              <button
                type="button"
                onClick={togglePlay}
                className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-[0_8px_30px_rgba(255,255,255,0.25)] ios-spring-fast active:scale-90"
                title={isPlaying ? 'Tạm dừng' : 'Phát'}
              >
                {isBuffering || isLoading ? (
                  <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin text-black" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-black text-black" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-black text-black ml-1" />
                )}
              </button>

              {isVideoMode && (
                <button
                  type="button"
                  onClick={() => handleSeekRelative(10)}
                  className="w-11 h-11 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center ios-spring-fast active:scale-90"
                  title="Tua tới 10s"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="text-[9px] font-extrabold">+10s</span>
                </button>
              )}

              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90"
                title="Bài tiếp theo"
              >
                <SkipForward className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
              </button>

              <button
                type="button"
                onClick={onToggleRepeat}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${
                  repeatMode !== 'off'
                    ? 'bg-white/20 text-white'
                    : 'text-white/55 hover:text-white hover:bg-white/10'
                }`}
                title="Lặp lại"
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-5 h-5" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* RIGHT PANE: Sliding Pill Liquid Glass Panel */}
          {!isFullscreen && (
            <div
              className={`flex flex-col h-[380px] md:h-full min-h-0 max-h-full bg-white/[0.04] backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-xl ${
                isVideoMode ? 'md:col-span-5 lg:col-span-4' : 'md:col-span-7'
              }`}
            >
              {/* Sliding Pill Header */}
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-white/10 shrink-0">
                {!isVideoMode ? (
                  /* Music Mode Tabs: Lời bài hát | Tiếp theo */
                  <>
                    <div className="relative grid grid-cols-2 bg-black/35 p-1 rounded-full border border-white/10 min-w-[240px] sm:min-w-[270px]">
                      <div
                        className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-md ios-spring-fast ${
                          musicRightTab === 'queue' ? 'translate-x-full' : 'translate-x-0'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setMusicRightTab('lyrics')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold ios-spring-fast ${
                          musicRightTab === 'lyrics' ? 'text-black' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        <Quote className="w-3.5 h-3.5" />
                        <span>Lời bài hát</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMusicRightTab('queue')}
                        className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold ios-spring-fast ${
                          musicRightTab === 'queue' ? 'text-black' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        <ListMusic className="w-3.5 h-3.5" />
                        <span>Tiếp theo ({queueVideos.length})</span>
                      </button>
                    </div>
                    {lyricsData && musicRightTab === 'lyrics' && (
                      <span className="text-[11px] font-bold text-white/55 hidden sm:inline">
                        {lyricsData.source}
                      </span>
                    )}
                  </>
                ) : (
                  /* Video Mode Tabs: Tiếp theo | Chủ đề */
                  <div className="relative grid grid-cols-2 bg-black/35 p-1 rounded-full border border-white/10 w-full">
                    <div
                      className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-md ios-spring-fast ${
                        videoRightTab === 'categories' ? 'translate-x-full' : 'translate-x-0'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('queue')}
                      className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold ios-spring-fast ${
                        videoRightTab === 'queue' ? 'text-black' : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5" />
                      <span>Tiếp theo ({queueVideos.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('categories')}
                      className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold ios-spring-fast ${
                        videoRightTab === 'categories' ? 'text-black' : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Chủ đề video</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Pane Body */}
              {!isVideoMode && musicRightTab === 'lyrics' ? (
                <div
                  ref={lyricsContainerRef}
                  key={`lyrics-${streamData.id}`}
                  className="relative flex-1 overflow-y-auto px-6 sm:px-8 py-8 no-scrollbar space-y-5 animate-ios-browse-in"
                >
                  {isLoadingLyrics ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-white/60">
                      <Loader2 className="w-8 h-8 animate-spin text-white/80" />
                      <p className="text-sm font-semibold">Đang tìm lời bài hát...</p>
                    </div>
                  ) : lyricsData && lyricsData.lines.length > 0 ? (
                    lyricsData.lines.map((line, i) => {
                      const isActive = lyricsData.isSynced && i === activeLyricIndex;
                      const isPast = lyricsData.isSynced && activeLyricIndex > i;
                      return (
                        <button
                          key={i}
                          ref={isActive ? activeLyricRef : null}
                          type="button"
                          onClick={() => {
                            if (line.time >= 0) handleSeekTo(line.time);
                          }}
                          className={`block w-full text-left font-extrabold tracking-tight ios-lyric-ease origin-left ${
                            isActive
                              ? 'text-2xl sm:text-3xl text-white scale-[1.03] blur-0 drop-shadow-[0_2px_16px_rgba(255,255,255,0.45)]'
                              : isPast
                              ? 'text-lg sm:text-xl text-white/25 scale-100 blur-[0.8px] hover:blur-0 hover:text-white/75'
                              : 'text-lg sm:text-xl text-white/45 scale-100 blur-[0.45px] hover:blur-0 hover:text-white/85'
                          }`}
                        >
                          {line.text}
                        </button>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
                      <Quote className="w-12 h-12 text-white/25" />
                      <div>
                        <p className="text-lg font-bold text-white/85">
                          Chưa có lời đồng bộ cho bản phối này
                        </p>
                        <p className="text-sm text-white/50 mt-1">
                          Các bản Remix / Nonstop thường không có lời LRC.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMusicRightTab('queue')}
                        className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-sm font-bold text-white transition active:scale-95"
                      >
                        Xem danh sách phát tiếp theo
                      </button>
                    </div>
                  )}
                </div>
              ) : isVideoMode && videoRightTab === 'categories' && onSelectCategory ? (
                /* Video Mode Categories Grid */
                <div
                  key="video-categories-pane"
                  className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar animate-ios-browse-in"
                >
                  {MEDIA_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(cat.id, cat.query);
                          setVideoRightTab('queue');
                        }}
                        className={`w-full px-4 py-3.5 rounded-2xl text-left text-sm sm:text-base font-bold flex items-center justify-between ios-spring-fast active:scale-98 border ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-lg'
                            : 'bg-white/[0.06] text-white/85 border-white/10 hover:bg-white/[0.14]'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {isSelected && <span className="text-xs font-extrabold">Đang chọn</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Shared Queue List (16:9 Thumbnails for Video Mode, 1:1 Square for Music Mode) */
                <div
                  key={`queue-pane-${viewMode}`}
                  className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1.5 no-scrollbar animate-ios-browse-in"
                >
                  {queueVideos.map((item, idx) => {
                    const isCurrent = (currentVideoId || streamData.id) === item.id;
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        onClick={() => onSelectVideo && onSelectVideo(item)}
                        className={`flex items-center gap-3 p-2.5 rounded-2xl ios-spring-fast cursor-pointer active:scale-99 ${
                          isCurrent
                            ? 'bg-white/20 border border-white/25'
                            : 'hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <div className="w-5 text-center shrink-0">
                          {isCurrent ? (
                            <div className="flex items-end justify-center gap-0.5 h-4">
                              <span
                                className={`w-1 rounded-full animate-bounce h-full ${
                                  isVideoMode ? 'bg-sky-400' : 'bg-rose-400'
                                }`}
                                style={{ animationDelay: '0ms' }}
                              />
                              <span
                                className={`w-1 rounded-full animate-bounce h-3/5 ${
                                  isVideoMode ? 'bg-sky-400' : 'bg-rose-400'
                                }`}
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className={`w-1 rounded-full animate-bounce h-4/5 ${
                                  isVideoMode ? 'bg-sky-400' : 'bg-rose-400'
                                }`}
                                style={{ animationDelay: '300ms' }}
                              />
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-bold text-white/45">
                              {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                            </span>
                          )}
                        </div>
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className={`${
                            isVideoMode ? 'w-20 aspect-video' : 'w-12 h-12'
                          } rounded-xl object-cover shrink-0 border border-white/10`}
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-white line-clamp-1">
                            {item.title}
                          </h4>
                          <p className="text-xs text-white/60 truncate mt-0.5">
                            {item.uploaderName}
                          </p>
                        </div>
                        {item.durationText && (
                          <span className="text-xs font-mono font-bold text-white/50 shrink-0 pr-1">
                            {item.durationText}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {hasMoreQueue && onLoadMoreQueue && (
                    <button
                      type="button"
                      onClick={onLoadMoreQueue}
                      disabled={isLoadingMoreQueue}
                      className="w-full py-3 mt-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 flex items-center justify-center gap-2 transition"
                    >
                      {isLoadingMoreQueue ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      <span>Tải thêm {isVideoMode ? 'video' : 'bài hát'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* BROWSE / FAVORITES / HISTORY + FLOATING LIQUID GLASS MINI PLAYER (Shared for Music & Video!) */}
        {railSection !== 'nowPlaying' && (
          <div
            key={`browse-${railSection}-${viewMode}`}
            className="flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full pb-20 animate-ios-browse-in"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {railSection === 'favorites'
                  ? isVideoMode
                    ? 'Video đã lưu'
                    : 'Bài hát đã lưu'
                  : railSection === 'history'
                  ? 'Lịch sử vừa xem / nghe'
                  : isVideoMode
                  ? 'Khám phá Video'
                  : 'Khám phá âm nhạc'}
              </h2>
            </div>

            {railSection === 'browse' && onSelectCategory && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 shrink-0">
                {MEDIA_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectCategory(cat.id, cat.query)}
                      className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap ios-spring-fast active:scale-95 border ${
                        isSelected
                          ? 'bg-white text-black border-white shadow'
                          : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
              {isLoadingQueue && queueVideos.length === 0 ? (
                <div className="col-span-full py-16 text-center">
                  <Loader2 className="w-10 h-10 text-white animate-spin mx-auto" />
                </div>
              ) : (
                queueVideos.map((item, idx) => {
                  const isCurrent = (currentVideoId || streamData.id) === item.id;
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => {
                        if (onSelectVideo) onSelectVideo(item);
                        setRailSection('nowPlaying');
                      }}
                      className={`flex items-center gap-3.5 p-3 rounded-2xl border backdrop-blur-xl ios-spring-fast cursor-pointer active:scale-98 ${
                        isCurrent
                          ? 'bg-white/20 border-white/30'
                          : 'bg-white/[0.06] border-white/10 hover:bg-white/15'
                      }`}
                    >
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        loading="lazy"
                        className={`${
                          isVideoMode ? 'w-28 aspect-video' : 'w-16 h-16'
                        } rounded-xl object-cover shrink-0 shadow`}
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm sm:text-base font-bold text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-xs text-white/60 truncate mt-1">
                          {item.uploaderName}
                        </p>
                      </div>
                      {item.durationText && (
                        <span className="text-xs font-mono font-bold text-white/50 shrink-0">
                          {item.durationText}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* FLOATING LIQUID GLASS MINI PLAYER */}
            <div
              onClick={() => setRailSection('nowPlaying')}
              className="fixed bottom-4 left-4 right-4 md:left-28 md:right-8 z-30 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xl cursor-pointer hover:bg-white/20 ios-spring-fast animate-ios-mini-up active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className={`${
                    isVideoMode ? 'w-16 aspect-video' : 'w-11 h-11'
                  } rounded-xl object-cover shrink-0 shadow`}
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-extrabold text-white truncate">
                    {streamData.title}
                  </h4>
                  <p className="text-xs text-white/65 truncate">{streamData.uploader}</p>
                </div>
              </div>

              <div
                className="flex items-center gap-2 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow active:scale-90 transition"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-black" />
                  ) : (
                    <Play className="w-5 h-5 fill-black ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-90 transition"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
