import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Quote,
  Sparkles,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  Gauge,
  Moon,
  Sun,
  Zap,
  FolderPlus,
  Cloud,
  Plus,
  FastForward,
} from 'lucide-react';
import {
  StreamData,
  ViewMode,
  RepeatMode,
  VideoItem,
  UiScale,
  RailSection,
  QueueSource,
  SponsorSegment,
  UserPlaylist,
  NightMode,
} from '../types';
import { MEDIA_CATEGORIES } from '../constants/categories';
import { formatSeconds } from '../services/api';
import { fetchSyncedLyrics, LyricsResult } from '../services/lyrics';
import { fetchSponsorSegments, getSponsorCategoryLabel } from '../services/sponsorblock';
import { useCarHardwareControls } from '../hooks/useCarHardwareControls';
import { useCockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { CockpitView } from './CockpitView';

interface VideoPlayerProps {
  streamData: StreamData;
  isLoading: boolean;
  railSection: RailSection;
  onChangeRailSection: (section: RailSection) => void;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  viewMode: ViewMode;
  onViewModeChange: (view: ViewMode) => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: RepeatMode;
  onToggleRepeat: () => void;
  playbackQueue: VideoItem[];
  browseVideos: VideoItem[];
  queueSource: QueueSource;
  currentVideoId: string;
  onSelectQueueVideo: (video: VideoItem) => void;
  onSelectBrowseVideo: (video: VideoItem, source: QueueSource, playlistId?: string) => void;
  isLoadingBrowse: boolean;
  hasMoreExplore: boolean;
  isLoadingMoreExplore: boolean;
  onLoadMoreExplore: () => void;
  selectedCategory: string;
  onSelectCategory: (catId: string, query: string) => void;
  searchQuery: string;
  favoritesCount: number;
  historyCount: number;
  onClearHistory: () => void;
  onOpenSearchModal: (startVoice?: boolean) => void;
  uiScale: UiScale;
  onChangeUiScale: (scale: UiScale) => void;
  // Upgrade #1: SponsorBlock Auto-Skip
  autoSkipEnabled: boolean;
  onToggleAutoSkip: () => void;
  // Upgrade #2: Multi-Playlists & Cloud Sync
  playlists: UserPlaylist[];
  selectedPlaylistId: string;
  onSelectPlaylistId: (id: string) => void;
  syncCode: string;
  onOpenSyncModal: (mode: 'sync' | 'addTrack') => void;
  // Upgrade #4: Night Dimmer
  nightMode: NightMode;
  isNightDimmed: boolean;
  onCycleNightMode: () => void;
  // Upgrade #5: Auto-Mix Radio
  isMixActive: boolean;
  isLoadingMix: boolean;
  onStartAutoMix: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamData,
  isLoading,
  railSection,
  onChangeRailSection,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  isFavorite,
  onToggleFavorite,
  viewMode,
  onViewModeChange,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onToggleRepeat,
  playbackQueue,
  browseVideos,
  queueSource,
  currentVideoId,
  onSelectQueueVideo,
  onSelectBrowseVideo,
  isLoadingBrowse,
  hasMoreExplore,
  isLoadingMoreExplore,
  onLoadMoreExplore,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  favoritesCount,
  historyCount,
  onClearHistory,
  onOpenSearchModal,
  uiScale,
  onChangeUiScale,
  autoSkipEnabled,
  onToggleAutoSkip,
  playlists,
  selectedPlaylistId,
  onSelectPlaylistId,
  syncCode,
  onOpenSyncModal,
  nightMode,
  isNightDimmed,
  onCycleNightMode,
  isMixActive,
  isLoadingMix,
  onStartAutoMix,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  const initialVideoIdRef = useRef<string>(streamData.id);
  const loadedVideoIdRef = useRef<string>(streamData.id);
  const latestVideoIdRef = useRef<string>(streamData.id);
  const iframeReadyRef = useRef<boolean>(false);
  const consecutiveErrorsRef = useRef<number>(0);
  const errorSkipTimerRef = useRef<number | null>(null);
  const lastManualSeekAtRef = useRef<number>(0);

  // SponsorBlock state & anti-loop tracking
  const [sponsorSegments, setSponsorSegments] = useState<SponsorSegment[]>([]);
  const skippedKeysRef = useRef<Set<string>>(new Set());

  // Blind Touch Gesture refs
  const touchStartRef = useRef<{ x: number; y: number; time: number; interactive: boolean } | null>(
    null
  );
  const singleTapTimerRef = useRef<number | null>(null);
  const lastArtTapTimeRef = useRef<number>(0);
  const [heartBurst, setHeartBurst] = useState<boolean>(false);

  const onNextRef = useRef(onNext);
  const repeatModeRef = useRef(repeatMode);
  useEffect(() => {
    onNextRef.current = onNext;
    repeatModeRef.current = repeatMode;
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [hasUnlockedAudio, setHasUnlockedAudio] = useState<boolean>(false);
  const [needsIframeTapHint, setNeedsIframeTapHint] = useState<boolean>(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showCinemaBar, setShowCinemaBar] = useState<boolean>(true);
  const [hardwareNotice, setHardwareNotice] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState<boolean>(false);

  const [musicRightTab, setMusicRightTab] = useState<'lyrics' | 'queue' | 'categories'>('lyrics');
  const [videoRightTab, setVideoRightTab] = useState<'queue' | 'categories'>('queue');
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [clockTime, setClockTime] = useState<string>('');

  const isVideoMode = viewMode === 'classic';
  const isNowPlayingView = railSection === 'nowPlaying';
  const isCockpitView = railSection === 'cockpit';
  const showVideoInViewport = isVideoMode && isNowPlayingView;

  // GPS Speedometer & Open-Meteo Weather (GPS chỉ bật khi đang mở tab Cockpit để tiết kiệm pin iPhone)
  const telemetry = useCockpitTelemetry(isCockpitView);

  const showToast = useCallback((label: string) => {
    setHardwareNotice(label);
    window.setTimeout(() => {
      setHardwareNotice((prev) => (prev === label ? null : prev));
    }, 2200);
  }, []);

  // Đồng hồ xe
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
    const id = window.setInterval(update, 15000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setConfirmClearHistory(false);
  }, [railSection]);

  // Tải lời bài hát đồng bộ
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

  // Upgrade #1: Tải phân đoạn SponsorBlock & Non-Music Intro/Outro cho mỗi bài
  useEffect(() => {
    if (!streamData.id) return;
    let cancelled = false;
    skippedKeysRef.current = new Set();
    setSponsorSegments([]);

    fetchSponsorSegments(streamData.id).then((segs) => {
      if (!cancelled) {
        setSponsorSegments(segs);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [streamData.id]);

  // Xác định câu hát đang phát
  const effectiveTime = dragTime !== null ? dragTime : currentTime;
  const activeLyricIndex = useMemo(() => {
    if (!lyricsData || !lyricsData.isSynced || lyricsData.lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lyricsData.lines.length; i++) {
      if (effectiveTime >= lyricsData.lines[i].time - 0.25) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData, effectiveTime]);

  // Tự cuộn lời bài hát bên trong khung riêng
  useEffect(() => {
    if (isVideoMode || musicRightTab !== 'lyrics' || !isNowPlayingView) return;
    const container = lyricsContainerRef.current;
    const el = activeLyricRef.current;
    if (!container || !el) return;

    const targetTop = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeLyricIndex, musicRightTab, isNowPlayingView, isVideoMode]);

  const postEmbedCommand = useCallback((command: string, args: any[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args,
          id: 1,
          channel: 'widget',
        }),
        '*'
      );
    } catch {}
  }, []);

  const sendWidgetHandshake = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      for (const evName of ['onReady', 'onStateChange', 'onError']) {
        win.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'addEventListener',
            args: [evName],
            id: 1,
            channel: 'widget',
          }),
          '*'
        );
      }
    } catch {}
  }, []);

  const initialEmbedUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams({
      enablejsapi: '1',
      widgetid: '1',
      autoplay: '1',
      playsinline: '1',
      modestbranding: '1',
      rel: '0',
      iv_load_policy: '3',
      fs: '0',
    });
    if (origin) {
      params.set('origin', origin);
      params.set('widget_referrer', origin);
    }
    return `https://www.youtube.com/embed/${initialVideoIdRef.current}?${params.toString()}`;
  }, []);

  // Đổi bài 0ms qua loadVideoById
  useEffect(() => {
    latestVideoIdRef.current = streamData.id;
    setCurrentTime(0);
    setDragTime(null);
    setDuration(streamData.duration || 0);
    setEmbedError(null);
    setIsBuffering(true);

    if (errorSkipTimerRef.current) {
      window.clearTimeout(errorSkipTimerRef.current);
      errorSkipTimerRef.current = null;
    }

    if (iframeReadyRef.current && loadedVideoIdRef.current !== streamData.id) {
      loadedVideoIdRef.current = streamData.id;
      postEmbedCommand('loadVideoById', [streamData.id]);
      window.setTimeout(sendWidgetHandshake, 350);
    }

    const autoplayGuard = window.setTimeout(() => {
      setIsBuffering(false);
    }, 2200);

    return () => {
      window.clearTimeout(autoplayGuard);
    };
  }, [streamData.id, streamData.duration, postEmbedCommand, sendWidgetHandshake]);

  const handleSeekTo = useCallback(
    (val: number) => {
      const maxDur = duration > 0 ? duration : 100;
      const clamped = Math.max(0, Math.min(val, maxDur));
      lastManualSeekAtRef.current = Date.now();
      setCurrentTime(clamped);
      postEmbedCommand('seekTo', [clamped, true]);
    },
    [duration, postEmbedCommand]
  );

  // Upgrade #1: Tự động nhảy qua đoạn dạo đầu kịch MV / quảng cáo SponsorBlock
  useEffect(() => {
    if (
      !autoSkipEnabled ||
      !isPlaying ||
      dragTime !== null ||
      sponsorSegments.length === 0 ||
      Date.now() - lastManualSeekAtRef.current < 1500
    ) {
      return;
    }

    for (const seg of sponsorSegments) {
      const segKey = `${seg.start.toFixed(1)}-${seg.end.toFixed(1)}`;
      if (skippedKeysRef.current.has(segKey)) continue;

      if (currentTime >= seg.start && currentTime < seg.end - 0.75) {
        skippedKeysRef.current.add(segKey);
        const skippedSecs = Math.max(1, Math.round(seg.end - currentTime));
        const label = getSponsorCategoryLabel(seg.category);

        if (duration > 20 && seg.end >= duration - 1.5) {
          showToast(`⏭️ Đã bỏ qua ${label} — Chuyển bài mới`);
          if (repeatMode === 'one') {
            handleSeekTo(0);
          } else {
            onNext();
          }
        } else {
          handleSeekTo(seg.end);
          showToast(`⏭️ Đã tự bỏ qua ${label} (+${skippedSecs}s)`);
        }
        break;
      }
    }
  }, [
    autoSkipEnabled,
    isPlaying,
    dragTime,
    currentTime,
    duration,
    sponsorSegments,
    repeatMode,
    handleSeekTo,
    onNext,
    showToast,
  ]);

  // Lắng nghe sự kiện YouTube IFrame API
  useEffect(() => {
    const handlePlayerState = (state: number) => {
      if (state === 1) {
        consecutiveErrorsRef.current = 0;
        setHasUnlockedAudio(true);
        setNeedsIframeTapHint(false);
        setEmbedError(null);
        setIsPlaying(true);
        setIsBuffering(false);
      } else if (state === 2) {
        setIsPlaying(false);
        setIsBuffering(false);
      } else if (state === 3) {
        setIsBuffering(true);
      } else if (state === 5 || state === -1) {
        setIsPlaying(false);
        setIsBuffering(false);
      } else if (state === 0) {
        setIsPlaying(false);
        setIsBuffering(false);
        if (repeatModeRef.current === 'one') {
          skippedKeysRef.current = new Set();
          postEmbedCommand('seekTo', [0, true]);
          postEmbedCommand('playVideo');
        } else {
          onNextRef.current();
        }
      }
    };

    const handlePlayerError = (code: number) => {
      consecutiveErrorsRef.current += 1;
      setIsPlaying(false);
      setIsBuffering(false);

      const reason =
        code === 101 || code === 150
          ? 'Bài này bị chủ kênh khóa nhúng ngoài YouTube'
          : code === 100
          ? 'Video không khả dụng hoặc riêng tư'
          : `Không phát được nguồn nhúng (Mã ${code})`;

      if (consecutiveErrorsRef.current <= 4 && hasNext) {
        setEmbedError(`${reason} — Tự chuyển bài tiếp theo...`);
        if (errorSkipTimerRef.current) window.clearTimeout(errorSkipTimerRef.current);
        errorSkipTimerRef.current = window.setTimeout(() => {
          onNextRef.current();
        }, 1600);
      } else {
        setEmbedError(`${reason}. Hãy chọn bài khác hoặc kiểm tra mạng 4G.`);
      }
    };

    const handleWindowMessage = (e: MessageEvent) => {
      if (
        typeof e.origin === 'string' &&
        e.origin &&
        !e.origin.includes('youtube.com') &&
        !e.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }

      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!data || typeof data !== 'object') return;

        if (data.event === 'onReady') {
          iframeReadyRef.current = true;
          if (latestVideoIdRef.current !== loadedVideoIdRef.current) {
            loadedVideoIdRef.current = latestVideoIdRef.current;
            postEmbedCommand('loadVideoById', [latestVideoIdRef.current]);
          }
        }

        if (data.event === 'onStateChange' && typeof data.info === 'number') {
          handlePlayerState(data.info);
        }

        if (data.event === 'onError' && typeof data.info === 'number') {
          handlePlayerError(data.info);
        }

        if (data.event === 'infoDelivery' && data.info) {
          if (
            typeof data.info.currentTime === 'number' &&
            Date.now() - lastManualSeekAtRef.current > 650
          ) {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === 'number') {
            handlePlayerState(data.info.playerState);
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
      if (errorSkipTimerRef.current) {
        window.clearTimeout(errorSkipTimerRef.current);
      }
    };
  }, [hasNext, postEmbedCommand]);

  const handleIframeLoad = () => {
    iframeReadyRef.current = true;
    sendWidgetHandshake();
    window.setTimeout(sendWidgetHandshake, 500);
    window.setTimeout(sendWidgetHandshake, 1400);

    if (latestVideoIdRef.current !== loadedVideoIdRef.current) {
      loadedVideoIdRef.current = latestVideoIdRef.current;
      postEmbedCommand('loadVideoById', [latestVideoIdRef.current]);
    }
  };

  const handlePlayExplicit = useCallback(() => {
    postEmbedCommand('playVideo');
    if (!hasUnlockedAudio && !isVideoMode) {
      window.setTimeout(() => {
        setNeedsIframeTapHint((prev) => (!hasUnlockedAudio ? true : prev));
      }, 850);
    }
  }, [hasUnlockedAudio, isVideoMode, postEmbedCommand]);

  const handlePauseExplicit = useCallback(() => {
    postEmbedCommand('pauseVideo');
    setIsPlaying(false);
  }, [postEmbedCommand]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      handlePauseExplicit();
    } else {
      handlePlayExplicit();
    }
  }, [isPlaying, handlePauseExplicit, handlePlayExplicit]);

  const handleSeekRelative = useCallback(
    (seconds: number) => {
      const base = dragTime !== null ? dragTime : currentTime;
      handleSeekTo(base + seconds);
    },
    [currentTime, dragTime, handleSeekTo]
  );

  // Upgrade #5: Cử chỉ Vuốt Mù (Vuốt Trái/Phải chuyển bài, Chạm đúp thả tim ❤️, Chạm đơn Play/Pause)
  const triggerDoubleTapHeart = useCallback(() => {
    onToggleFavorite();
    setHeartBurst(true);
    window.setTimeout(() => setHeartBurst(false), 650);
    showToast(isFavorite ? '💔 Đã bỏ lưu Yêu thích' : '❤️ Đã lưu vào Yêu thích');
  }, [isFavorite, onToggleFavorite, showToast]);

  const handleArtOrCardTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    const interactive = Boolean(target?.closest('button, input, a'));
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
      interactive,
    };
  }, []);

  const handleArtTouchEnd = useCallback(
    (e: React.TouchEvent, allowTapPlayToggle: boolean) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || start.interactive || e.changedTouches.length === 0) return;

      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      const dt = Date.now() - start.time;

      // Vuốt ngang nhanh không cần nhìn
      if (Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.35 && dt < 700) {
        if (singleTapTimerRef.current) {
          window.clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        if (dx < 0 && hasNext) {
          showToast('⏭️ Vuốt: Bài tiếp theo');
          onNext();
        } else if (dx > 0 && hasPrev) {
          showToast('⏮️ Vuốt: Bài trước đó');
          onPrev();
        }
        return;
      }

      // Chạm tại chỗ: Phân biệt Chạm đơn (Play/Pause) và Chạm đúp (Thả tim ❤️)
      if (Math.abs(dx) < 16 && Math.abs(dy) < 16 && dt < 350) {
        const now = Date.now();
        if (now - lastArtTapTimeRef.current < 260) {
          lastArtTapTimeRef.current = 0;
          if (singleTapTimerRef.current) {
            window.clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = null;
          }
          triggerDoubleTapHeart();
        } else {
          lastArtTapTimeRef.current = now;
          if (allowTapPlayToggle) {
            if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = window.setTimeout(() => {
              singleTapTimerRef.current = null;
              togglePlay();
            }, 240);
          }
        }
      }
    },
    [hasNext, hasPrev, onNext, onPrev, showToast, togglePlay, triggerDoubleTapHeart]
  );

  // Điều khiển phím cứng vô lăng VF5 & Apple CarPlay MediaSession
  useCarHardwareControls({
    enabled: true,
    streamData,
    isPlaying,
    currentTime,
    duration,
    onPlay: handlePlayExplicit,
    onPause: handlePauseExplicit,
    onTogglePlay: togglePlay,
    onNext,
    onPrev,
    onSeekRelative: handleSeekRelative,
    onSeekTo: handleSeekTo,
    onHardwareAction: showToast,
  });

  const toggleFullscreen = () => {
    const nextFs = !isFullscreen;
    setIsFullscreen(nextFs);
    setShowCinemaBar(true);

    try {
      if (
        nextFs &&
        containerRef.current &&
        typeof containerRef.current.requestFullscreen === 'function'
      ) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else if (
        !nextFs &&
        document.fullscreenElement &&
        typeof document.exitFullscreen === 'function'
      ) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  };

  const cycleScale = () => {
    if (uiScale === 'normal') onChangeUiScale('large');
    else if (uiScale === 'large') onChangeUiScale('xlarge');
    else onChangeUiScale('normal');
  };

  const scaleLabel = uiScale === 'normal' ? '100%' : uiScale === 'large' ? '112%' : '124%';
  const safeDuration = duration > 0 ? duration : 0;
  const displayedTime = dragTime !== null ? dragTime : currentTime;
  const progressPercent =
    safeDuration > 0 ? Math.min(100, Math.max(0, (displayedTime / safeDuration) * 100)) : 0;
  const remainingTime = Math.max(0, safeDuration - displayedTime);

  const overlayIframeOnArtForFirstUnlock =
    !isVideoMode && isNowPlayingView && !hasUnlockedAudio && !isPlaying;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-[#050507] text-white select-none flex flex-col car:flex-row ${
        isFullscreen ? 'fixed inset-0 z-50' : ''
      }`}
    >
      {/* NỀN ÁNH SÁNG ĐỘNG (Tự hạ độ chói khi bật Chế độ Ban Đêm trên VF5!) */}
      {!isFullscreen && (
        <>
          <div
            key={`bg-${streamData.id}`}
            className={`absolute inset-0 pointer-events-none blur-3xl animate-ambient-drift transition-opacity duration-500 ${
              isNightDimmed ? 'opacity-20' : 'opacity-45'
            }`}
            style={{
              backgroundImage: `url(${streamData.thumbnailUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
          <div
            className={`absolute inset-0 pointer-events-none transition-colors duration-500 ${
              isNightDimmed
                ? 'bg-gradient-to-br from-black/80 via-black/80 to-black/95'
                : 'bg-gradient-to-br from-black/60 via-black/55 to-black/85'
            }`}
          />
        </>
      )}

      {/* Màng lọc Dịu mắt Ban đêm chống chói trên cao tốc (không chặn cảm ứng) */}
      {isNightDimmed && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-amber-950/[0.12] mix-blend-multiply" />
      )}
      {isNightDimmed && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-black/25" />
      )}

      {/* Toast thông báo thông minh (Vô lăng, Vuốt mù, SponsorBlock, Auto-Mix) */}
      {hardwareNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-black/85 backdrop-blur-xl text-white px-4 py-2 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 shadow-2xl border border-white/25 pointer-events-none max-w-[90vw]">
          <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="truncate">{hardwareNotice}</span>
        </div>
      )}

      {/* =====================================================================
          1. THANH ĐIỀU HƯỚNG BÊN TRÁI (Gần tay phải người lái VF5 nhất)
         ===================================================================== */}
      {!isFullscreen && (
        <aside className="relative z-20 flex car:flex-col items-center justify-between gap-1 px-2 py-1.5 car:py-1.5 short:py-1 car:px-1.5 car:w-[4.65rem] lg:w-[5rem] bg-black/50 backdrop-blur-xl border-b car:border-b-0 car:border-r border-white/12 shrink-0 overflow-x-auto car:overflow-x-hidden car:overflow-y-auto no-scrollbar">
          {/* Nút 1-chạm chuyển đổi Music <-> Video */}
          <button
            type="button"
            onClick={() => onViewModeChange(isVideoMode ? 'ytmusic' : 'classic')}
            aria-label={isVideoMode ? 'Chuyển sang chế độ Nghe Nhạc' : 'Chuyển sang chế độ Xem Video'}
            className={`flex car:flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] px-2.5 car:px-1 car:w-full py-1 rounded-xl border shadow-md ios-spring-fast active:scale-95 shrink-0 ${
              isVideoMode
                ? 'bg-gradient-to-br from-sky-500/30 to-blue-600/30 border-sky-400/50 text-sky-100'
                : 'bg-gradient-to-br from-rose-500/30 to-pink-600/30 border-rose-400/50 text-rose-100'
            }`}
          >
            {isVideoMode ? (
              <>
                <Tv className="w-4 h-4 text-sky-300 shrink-0" />
                <span className="text-[10px] vshort:text-[9px] font-extrabold leading-none">
                  Video
                </span>
              </>
            ) : (
              <>
                <Music className="w-4 h-4 text-rose-300 shrink-0" />
                <span className="text-[10px] vshort:text-[9px] font-extrabold leading-none">
                  Music
                </span>
              </>
            )}
          </button>

          {/* Cụm điều hướng chính */}
          <nav
            aria-label="Điều hướng chính"
            className="flex car:flex-col items-center gap-1 car:gap-0.5 car:w-full shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeRailSection('nowPlaying')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'nowPlaying'
                  ? 'bg-white/20 text-white border border-white/25 shadow-inner'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              {isVideoMode ? <Tv className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Đang phát
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('cockpit')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'cockpit'
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 shadow-inner'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              <Gauge className="w-4 h-4" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Cockpit
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('browse')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'browse'
                  ? 'bg-white/20 text-white border border-white/25 shadow-inner'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Khám phá
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSearchModal(false)}
              className="flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl text-white/65 hover:text-white hover:bg-white/10 ios-spring-fast active:scale-95"
            >
              <Search className="w-4 h-4" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Tìm kiếm
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('favorites')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'favorites'
                  ? 'bg-white/20 text-white border border-white/25 shadow-inner'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Playlist{favoritesCount > 0 ? ` (${favoritesCount})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('history')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'history'
                  ? 'bg-white/20 text-white border border-white/25 shadow-inner'
                  : 'text-white/65 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Lịch sử
              </span>
            </button>
          </nav>

          {/* Cụm công cụ nhanh phía dưới: [Micro + Đêm] song song cực gọn + Tỉ lệ chữ */}
          <div className="flex car:flex-col items-center gap-1 car:w-full shrink-0">
            <div className="flex car:grid car:grid-cols-2 gap-1 car:w-full">
              <button
                type="button"
                onClick={() => onOpenSearchModal(true)}
                aria-label="Tìm kiếm bằng giọng nói"
                title="Tìm giọng nói tiếng Việt"
                className="min-h-[34px] w-9 car:w-full rounded-lg bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/45 text-rose-200 flex items-center justify-center active:scale-95 transition"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onCycleNightMode();
                  const nextLabel =
                    nightMode === 'auto'
                      ? '🌙 Đã bật Dịu mắt Ban đêm'
                      : nightMode === 'on'
                      ? '☀️ Đã tắt Dịu mắt (Sáng tối đa)'
                      : '🌗 Chế độ Đêm Tự động (sau 18h)';
                  showToast(nextLabel);
                }}
                aria-label="Chế độ dịu mắt ban đêm"
                title={
                  nightMode === 'auto'
                    ? 'Đang để Đêm Tự động (sau 18h)'
                    : nightMode === 'on'
                    ? 'Đang bật Dịu mắt Ban đêm'
                    : 'Đang tắt Dịu mắt'
                }
                className={`min-h-[34px] w-9 car:w-full rounded-lg border flex items-center justify-center active:scale-95 transition ${
                  isNightDimmed
                    ? 'bg-amber-500/25 border-amber-400/50 text-amber-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/15 text-white/75'
                }`}
              >
                {isNightDimmed ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={cycleScale}
              aria-label={`Đổi cỡ giao diện, hiện tại ${scaleLabel}`}
              className="min-h-[28px] px-2 car:px-0 car:w-full rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-extrabold text-white/80 border border-white/12 flex items-center justify-center active:scale-95 transition"
            >
              {scaleLabel}
            </button>
          </div>
        </aside>
      )}

      {/* =====================================================================
          2. KHÔNG GIAN HIỂN THỊ CHÍNH
         ===================================================================== */}
      <div
        className={`relative z-10 flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden ${
          isFullscreen ? 'p-0' : 'p-2.5 sm:p-3.5 md:p-4 short:p-2 vshort:p-1.5'
        }`}
      >
        {/* -------------------------------------------------------------------
            A. MÀN HÌNH ĐANG PHÁT (Giữ cố định cây DOM của <iframe> để nhạc không bao giờ ngắt!)
           ------------------------------------------------------------------- */}
        <div
          className={
            isNowPlayingView
              ? isFullscreen
                ? 'flex-1 min-h-0 flex flex-col w-full h-full'
                : 'flex-1 min-h-0 overflow-y-auto car:overflow-hidden grid grid-cols-1 car:grid-cols-12 gap-3 lg:gap-5 items-stretch max-w-[1520px] mx-auto w-full'
              : 'w-0 h-0 overflow-visible shrink-0 pointer-events-none'
          }
        >
          {/* CỘT TRÁI: Đĩa nhạc / Video + Thanh tua + Nút điều khiển */}
          <div
            className={
              isNowPlayingView
                ? isFullscreen
                  ? 'relative w-full h-full flex flex-col bg-black'
                  : `flex flex-col justify-between min-h-0 h-full w-full mx-auto gap-2 short:gap-1.5 vshort:gap-1 ${
                      isVideoMode
                        ? 'car:col-span-7 lg:col-span-8'
                        : 'car:col-span-5 md:col-span-5 max-w-md'
                    }`
                : 'w-0 h-0 overflow-visible'
            }
          >
            {/* SÂN KHẤU MEDIA (container-type: size) */}
            <div
              className={
                isNowPlayingView
                  ? isFullscreen
                    ? 'relative flex-1 min-h-0 w-full h-full flex items-center justify-center bg-black'
                    : 'media-stage relative h-48 xs:h-56 car:h-auto car:flex-1 car:min-h-0 w-full flex items-center justify-center'
                  : 'w-0 h-0 overflow-visible'
              }
            >
              {/* 1. ẢNH BÌA ALBUM VUÔNG + CỬ CHỈ VUỐT MÙ & CHẠM ĐÚP ❤️ */}
              {isNowPlayingView && !isVideoMode && (
                <div
                  onTouchStart={handleArtOrCardTouchStart}
                  onTouchEnd={(e) => handleArtTouchEnd(e, true)}
                  onClick={(e) => {
                    // Hỗ trợ click chuột trên máy tính / màn không gửi TouchEvent
                    if ('ontouchstart' in window) return;
                    if (e.detail === 2) {
                      if (singleTapTimerRef.current) {
                        window.clearTimeout(singleTapTimerRef.current);
                        singleTapTimerRef.current = null;
                      }
                      triggerDoubleTapHeart();
                    } else if (e.detail === 1) {
                      if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current);
                      singleTapTimerRef.current = window.setTimeout(() => {
                        singleTapTimerRef.current = null;
                        togglePlay();
                      }, 220);
                    }
                  }}
                  className={`car-art-fit relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.75)] border border-white/15 cursor-pointer ios-spring ${
                    isPlaying && !isBuffering ? 'scale-100' : 'scale-[0.94]'
                  }`}
                >
                  <img
                    key={`art-${streamData.id}`}
                    src={streamData.thumbnailUrl}
                    alt={streamData.title}
                    className="w-full h-full object-cover animate-artwork-enter"
                  />

                  {heartBurst && (
                    <div className="absolute inset-0 z-30 bg-black/25 flex items-center justify-center pointer-events-none">
                      <Heart className="w-16 h-16 text-rose-500 fill-rose-500 animate-ping" />
                    </div>
                  )}

                  {(isLoading || isBuffering) && (
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    </div>
                  )}

                  {!isPlaying && !isBuffering && !embedError && (
                    <div className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center gap-1.5 p-3 text-center pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-white/95 text-black flex items-center justify-center shadow-2xl">
                        <Play className="w-7 h-7 fill-black ml-1" />
                      </div>
                      {needsIframeTapHint && !hasUnlockedAudio && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-600/95 text-[11px] font-extrabold text-white shadow">
                          Chạm vào ảnh bìa 1 lần để bật tiếng CarPlay
                        </span>
                      )}
                    </div>
                  )}

                  <div className="absolute bottom-2 inset-x-2 flex items-center justify-between gap-1 pointer-events-none">
                    <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold text-white/75 truncate">
                      Vuốt ⇄ • Đúp ❤️
                    </span>
                    {sponsorSegments.length > 0 && autoSkipEnabled && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/80 text-black text-[9px] font-extrabold shrink-0">
                        Skip Intro ({sponsorSegments.length})
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 2. IFRAME YOUTUBE DUY NHẤT */}
              <div
                className={
                  showVideoInViewport
                    ? isFullscreen
                      ? 'relative w-full h-full bg-black overflow-hidden'
                      : 'car-video-fit relative overflow-hidden rounded-2xl sm:rounded-3xl bg-black border border-white/15 shadow-[0_18px_50px_rgba(0,0,0,0.75)] animate-artwork-enter'
                    : overlayIframeOnArtForFirstUnlock
                    ? 'car-art-fit absolute z-20 opacity-[0.01] overflow-hidden cursor-pointer pointer-events-auto'
                    : 'fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden'
                }
              >
                <iframe
                  ref={iframeRef}
                  src={initialEmbedUrl}
                  title={streamData.title || 'CarHub Player'}
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  onLoad={handleIframeLoad}
                />
                {showVideoInViewport && (isLoading || isBuffering) && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                )}
              </div>

              {isNowPlayingView && embedError && (
                <div className="absolute inset-x-2 bottom-2 z-30 bg-amber-950/95 border border-amber-400/50 text-amber-100 px-3 py-2 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shadow-2xl">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="truncate">{embedError}</span>
                  </div>
                  {hasNext && (
                    <button
                      type="button"
                      onClick={onNext}
                      className="px-3 py-1.5 rounded-xl bg-amber-400 text-black font-extrabold shrink-0 active:scale-95"
                    >
                      Bài kế
                    </button>
                  )}
                </div>
              )}

              {isNowPlayingView && isFullscreen && (
                <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCinemaBar((v) => !v)}
                    aria-label="Ẩn hoặc hiện thanh điều khiển"
                    className="min-h-[44px] px-3.5 rounded-full bg-black/70 hover:bg-black/85 backdrop-blur-xl border border-white/25 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xl active:scale-95"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>{showCinemaBar ? 'Ẩn thanh tua' : 'Điều khiển'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label="Thoát toàn màn hình"
                    className="min-h-[44px] px-4 rounded-full bg-rose-600/90 hover:bg-rose-500 backdrop-blur-xl border border-rose-300/40 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xl active:scale-95"
                  >
                    <Minimize2 className="w-4 h-4" />
                    <span>Thu nhỏ</span>
                  </button>
                </div>
              )}
            </div>

            {/* BẢNG ĐIỀU KHIỂN CỐ ĐỊNH PHÍA DƯỚI (shrink-0) */}
            {isNowPlayingView && (!isFullscreen || showCinemaBar) && (
              <div
                className={
                  isFullscreen
                    ? 'shrink-0 w-full bg-black/85 backdrop-blur-2xl border-t border-white/15 px-4 py-2.5 flex flex-col gap-1'
                    : 'shrink-0 w-full flex flex-col gap-1 short:gap-0.5'
                }
              >
                {/* Tiêu đề bài hát + Cụm nút thông minh (Auto-Mix ⚡, Auto-Skip ⏭️, Playlist ➕, Tim ❤️, Phóng to ⛶) */}
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base sm:text-lg lg:text-xl short:text-sm vshort:text-xs font-extrabold text-white truncate tracking-tight">
                      {streamData.title}
                    </h2>
                    <p className="text-xs sm:text-sm short:text-[11px] text-white/65 font-semibold truncate">
                      {streamData.uploader}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Upgrade #5: Đài phát Auto-Mix tương tự bài này */}
                    <button
                      type="button"
                      onClick={() => {
                        onStartAutoMix();
                        if (!isVideoMode) setMusicRightTab('queue');
                      }}
                      disabled={isLoadingMix}
                      aria-label="Phát đài nhạc tương tự bài này"
                      title="Phát liên hoàn các bài tương tự bài này (Auto-Mix)"
                      className={`h-9 short:h-8 px-2.5 rounded-full border text-[11px] font-extrabold flex items-center gap-1 ios-spring-fast active:scale-90 ${
                        isMixActive
                          ? 'bg-amber-400 text-black border-amber-300 shadow'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-amber-200'
                      }`}
                    >
                      {isLoadingMix ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span className="hidden xs:inline">Mix</span>
                    </button>

                    {/* Upgrade #1: Nút bật/tắt tự bỏ qua dạo đầu MV & SponsorBlock */}
                    <button
                      type="button"
                      onClick={() => {
                        onToggleAutoSkip();
                        showToast(
                          autoSkipEnabled
                            ? 'Đã tắt tự bỏ qua dạo đầu MV'
                            : '⏭️ Đã bật Tự bỏ qua dạo đầu MV & Quảng cáo'
                        );
                      }}
                      aria-label="Bật hoặc tắt tự bỏ qua đoạn dạo đầu MV"
                      title={
                        autoSkipEnabled
                          ? 'Đang bật Tự bỏ qua dạo đầu MV / Quảng cáo'
                          : 'Đang tắt Tự bỏ qua dạo đầu MV'
                      }
                      className={`w-9 h-9 short:w-8 short:h-8 rounded-full border flex items-center justify-center ios-spring-fast active:scale-90 ${
                        autoSkipEnabled
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                          : 'bg-white/10 border-white/15 text-white/45'
                      }`}
                    >
                      <FastForward className="w-4 h-4" />
                    </button>

                    {/* Upgrade #2: Lưu vào Playlist riêng */}
                    <button
                      type="button"
                      onClick={() => onOpenSyncModal('addTrack')}
                      aria-label="Lưu bài hát vào Playlist riêng"
                      title="Lưu vào Playlist"
                      className="w-9 h-9 short:w-8 short:h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 hover:text-white flex items-center justify-center ios-spring-fast active:scale-90"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={onToggleFavorite}
                      aria-label={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu vào yêu thích'}
                      title="Yêu thích"
                      className={`w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center border ios-spring-fast active:scale-90 ${
                        isFavorite
                          ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                          : 'bg-white/10 border-white/15 text-white/75 hover:text-white'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-400' : ''}`} />
                    </button>

                    {isVideoMode && (
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? 'Thu nhỏ khung hình' : 'Xem toàn màn hình xe'}
                        className="w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/15 text-white/85 hover:text-white ios-spring-fast active:scale-90"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="w-4 h-4" />
                        ) : (
                          <Maximize2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Thanh Tua Cảm Ứng Dày */}
                <div className="w-full">
                  <input
                    type="range"
                    aria-label="Thanh tiến trình bài hát"
                    min={0}
                    max={safeDuration || 100}
                    step={1}
                    value={Math.min(displayedTime, safeDuration || 100)}
                    style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
                    onPointerDown={() => setDragTime(currentTime)}
                    onChange={(e) => setDragTime(parseFloat(e.target.value))}
                    onPointerUp={(e) => {
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setDragTime(null);
                      handleSeekTo(val);
                    }}
                    onTouchEnd={() => {
                      if (dragTime !== null) {
                        const finalVal = dragTime;
                        setDragTime(null);
                        handleSeekTo(finalVal);
                      }
                    }}
                    onKeyUp={() => {
                      if (dragTime !== null) {
                        const finalVal = dragTime;
                        setDragTime(null);
                        handleSeekTo(finalVal);
                      }
                    }}
                    className="car-scrubber"
                  />
                  <div className="flex justify-between text-[11px] font-mono font-bold text-white/60 -mt-1.5 px-0.5">
                    <span>{formatSeconds(displayedTime)}</span>
                    <span>
                      {safeDuration > 0 ? `-${formatSeconds(remainingTime)}` : 'LIVE / AUTO'}
                    </span>
                  </div>
                </div>

                {/* Cụm Nút Điều Khiển Lớn Chuẩn Ô Tô */}
                <div
                  className={`w-full flex items-center justify-between px-1 mx-auto ${
                    isVideoMode ? 'max-w-lg' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={onToggleShuffle}
                    aria-label="Phát ngẫu nhiên"
                    className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${
                      isShuffle
                        ? 'bg-rose-500/30 border border-rose-400/50 text-rose-200'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Shuffle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    aria-label="Bài trước đó"
                    className="w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90"
                  >
                    <SkipBack className="w-6 h-6 short:w-5 short:h-5 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekRelative(-10)}
                    aria-label="Tua lùi 10 giây"
                    className="w-10 h-10 short:w-9 short:h-9 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center ios-spring-fast active:scale-90"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-extrabold leading-none mt-0.5">-10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                    className="w-14 h-14 sm:w-16 sm:h-16 short:w-12 short:h-12 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-[0_6px_24px_rgba(255,255,255,0.28)] ios-spring-fast active:scale-90"
                  >
                    {isBuffering || isLoading ? (
                      <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 animate-spin text-black" />
                    ) : isPlaying ? (
                      <Pause className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 fill-black text-black" />
                    ) : (
                      <Play className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 fill-black text-black ml-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekRelative(10)}
                    aria-label="Tua tới 10 giây"
                    className="w-10 h-10 short:w-9 short:h-9 rounded-full text-white/80 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center ios-spring-fast active:scale-90"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-extrabold leading-none mt-0.5">+10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    aria-label="Bài tiếp theo"
                    className="w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90"
                  >
                    <SkipForward className="w-6 h-6 short:w-5 short:h-5 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleRepeat}
                    aria-label={`Chế độ lặp: ${repeatMode}`}
                    className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${
                      repeatMode !== 'off'
                        ? 'bg-white/20 border border-white/25 text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {repeatMode === 'one' ? (
                      <Repeat1 className="w-4 h-4 sm:w-5 sm:h-5 text-rose-300" />
                    ) : (
                      <Repeat className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CỘT PHẢI: Lời bài hát / Danh sách phát tiếp theo / Chủ đề */}
          {isNowPlayingView && !isFullscreen && (
            <div
              className={`flex flex-col min-h-[260px] car:min-h-0 car:h-full max-h-full bg-white/[0.05] backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/12 overflow-hidden shadow-xl ${
                isVideoMode ? 'car:col-span-5 lg:col-span-4' : 'car:col-span-7 md:col-span-7'
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 short:py-1.5 border-b border-white/10 shrink-0">
                {!isVideoMode ? (
                  <div className="grid grid-cols-3 bg-black/40 p-1 rounded-full border border-white/10 w-full">
                    <button
                      type="button"
                      onClick={() => setMusicRightTab('lyrics')}
                      className={`flex items-center justify-center gap-1 min-h-[36px] short:min-h-[32px] px-2 rounded-full text-xs font-extrabold ios-spring-fast ${
                        musicRightTab === 'lyrics'
                          ? 'bg-white text-black shadow'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Quote className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Lời nhạc</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicRightTab('queue')}
                      className={`flex items-center justify-center gap-1 min-h-[36px] short:min-h-[32px] px-2 rounded-full text-xs font-extrabold ios-spring-fast ${
                        musicRightTab === 'queue'
                          ? 'bg-white text-black shadow'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      {isMixActive ? (
                        <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <ListMusic className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">
                        {isMixActive ? `Mix (${playbackQueue.length})` : `Tiếp (${playbackQueue.length})`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicRightTab('categories')}
                      className={`flex items-center justify-center gap-1 min-h-[36px] short:min-h-[32px] px-2 rounded-full text-xs font-extrabold ios-spring-fast ${
                        musicRightTab === 'categories'
                          ? 'bg-white text-black shadow'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Chủ đề</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 bg-black/40 p-1 rounded-full border border-white/10 w-full">
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('queue')}
                      className={`flex items-center justify-center gap-1.5 min-h-[36px] short:min-h-[32px] px-3 rounded-full text-xs font-extrabold ios-spring-fast ${
                        videoRightTab === 'queue'
                          ? 'bg-white text-black shadow'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Tiếp theo ({playbackQueue.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('categories')}
                      className={`flex items-center justify-center gap-1.5 min-h-[36px] short:min-h-[32px] px-3 rounded-full text-xs font-extrabold ios-spring-fast ${
                        videoRightTab === 'categories'
                          ? 'bg-white text-black shadow'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Chủ đề</span>
                    </button>
                  </div>
                )}
              </div>

              {!isVideoMode && musicRightTab === 'lyrics' ? (
                <div
                  ref={lyricsContainerRef}
                  key={`lyrics-${streamData.id}`}
                  className="relative flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 short:py-3.5 no-scrollbar space-y-4 short:space-y-3 animate-ios-browse-in"
                >
                  {isLoadingLyrics ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2.5 text-white/65">
                      <Loader2 className="w-7 h-7 animate-spin text-white/85" />
                      <p className="text-xs sm:text-sm font-semibold">Đang tải lời bài hát...</p>
                    </div>
                  ) : lyricsData && lyricsData.lines.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between text-[11px] font-bold text-white/45 pb-1">
                        <span>
                          {lyricsData.isSynced
                            ? 'Chạm vào câu hát bất kỳ để tua nhanh'
                            : 'Lời bài hát tiêu chuẩn'}
                        </span>
                        <span>{lyricsData.source}</span>
                      </div>
                      {lyricsData.lines.map((line, i) => {
                        if (!lyricsData.isSynced) {
                          return (
                            <p
                              key={i}
                              className="text-base sm:text-lg short:text-sm font-bold text-white/85 leading-relaxed"
                            >
                              {line.text}
                            </p>
                          );
                        }

                        const isActive = i === activeLyricIndex;
                        const isPast = activeLyricIndex > i;
                        return (
                          <button
                            key={i}
                            ref={isActive ? activeLyricRef : null}
                            type="button"
                            onClick={() => {
                              if (line.time >= 0) handleSeekTo(line.time);
                            }}
                            className={`block w-full text-left font-extrabold tracking-tight ios-lyric-ease origin-left py-0.5 ${
                              isActive
                                ? 'text-xl sm:text-2xl short:text-lg text-white scale-[1.02]'
                                : isPast
                                ? 'text-base sm:text-lg short:text-sm text-white/30 hover:text-white/75'
                                : 'text-base sm:text-lg short:text-sm text-white/55 hover:text-white/90'
                            }`}
                          >
                            {line.text}
                          </button>
                        );
                      })}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-3">
                      <Quote className="w-10 h-10 text-white/25" />
                      <div>
                        <p className="text-sm sm:text-base font-bold text-white/85">
                          Chưa có lời cho bản thu này
                        </p>
                        <p className="text-xs text-white/50 mt-1">
                          Các bản Nonstop / Remix dài thường không kèm lời LRC.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMusicRightTab('queue')}
                        className="min-h-[40px] px-4 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-xs sm:text-sm font-bold text-white transition active:scale-95"
                      >
                        Mở danh sách phát tiếp theo ({playbackQueue.length})
                      </button>
                    </div>
                  )}
                </div>
              ) : (!isVideoMode && musicRightTab === 'categories') ||
                (isVideoMode && videoRightTab === 'categories') ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 no-scrollbar animate-ios-browse-in">
                  {MEDIA_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id && queueSource === 'explore';
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          onSelectCategory(cat.id, cat.query);
                          if (isVideoMode) setVideoRightTab('queue');
                          else setMusicRightTab('queue');
                        }}
                        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-left text-sm font-bold flex items-center justify-between ios-spring-fast active:scale-98 border ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-lg'
                            : 'bg-white/[0.06] text-white/85 border-white/10 hover:bg-white/[0.14]'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {isSelected && <span className="text-xs font-extrabold">Đang nghe</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-3 py-2 space-y-1.5 no-scrollbar animate-ios-browse-in">
                  {playbackQueue.map((item, idx) => {
                    const isCurrent = (currentVideoId || streamData.id) === item.id;
                    return (
                      <button
                        key={`${item.id}-${idx}`}
                        type="button"
                        onClick={() => onSelectQueueVideo(item)}
                        className={`w-full text-left flex items-center gap-2.5 p-2 rounded-xl ios-spring-fast active:scale-99 ${
                          isCurrent
                            ? 'bg-white/20 border border-white/30'
                            : 'hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        <div className="w-5 text-center shrink-0">
                          {isCurrent ? (
                            <div className="flex items-end justify-center gap-0.5 h-3.5">
                              <span
                                className={`w-1 rounded-full h-full ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${isVideoMode ? 'bg-sky-400' : 'bg-rose-400'}`}
                              />
                              <span
                                className={`w-1 rounded-full h-3/5 ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${isVideoMode ? 'bg-sky-400' : 'bg-rose-400'}`}
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className={`w-1 rounded-full h-4/5 ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${isVideoMode ? 'bg-sky-400' : 'bg-rose-400'}`}
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
                            isVideoMode ? 'w-18 aspect-video' : 'w-11 h-11 short:w-10 short:h-10'
                          } rounded-lg object-cover shrink-0 border border-white/10 bg-black`}
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-white/60 truncate mt-0.5">
                            {item.uploaderName}
                          </p>
                        </div>
                        {item.durationText && (
                          <span className="text-[11px] font-mono font-bold text-white/50 shrink-0 pr-0.5">
                            {item.durationText}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {queueSource === 'explore' && hasMoreExplore && (
                    <button
                      type="button"
                      onClick={onLoadMoreExplore}
                      disabled={isLoadingMoreExplore}
                      className="w-full min-h-[44px] py-2.5 mt-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {isLoadingMoreExplore ? (
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

        {/* -------------------------------------------------------------------
            B. MÀN HÌNH COCKPIT HUD LÁI XE VF5 (Tốc độ GPS km/h + Thời tiết + Karaoke 2 dòng)
           ------------------------------------------------------------------- */}
        {isCockpitView && (
          <CockpitView
            streamData={streamData}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            displayedTime={displayedTime}
            safeDuration={safeDuration}
            progressPercent={progressPercent}
            remainingTime={remainingTime}
            clockTime={clockTime}
            telemetry={telemetry}
            lyricsData={lyricsData}
            activeLyricIndex={activeLyricIndex}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
            onOpenAddPlaylist={() => onOpenSyncModal('addTrack')}
            isMixActive={isMixActive}
            isLoadingMix={isLoadingMix}
            onStartAutoMix={onStartAutoMix}
            isShuffle={isShuffle}
            onToggleShuffle={onToggleShuffle}
            repeatMode={repeatMode}
            onToggleRepeat={onToggleRepeat}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={onNext}
            onPrev={onPrev}
            onTogglePlay={togglePlay}
            onScrubStart={() => setDragTime(currentTime)}
            onScrubMove={(val) => setDragTime(val)}
            onScrubCommit={(val) => {
              setDragTime(null);
              handleSeekTo(val);
            }}
            gestureHandlers={{
              onTouchStart: handleArtOrCardTouchStart,
              onTouchEnd: (e) => handleArtTouchEnd(e, false),
            }}
            heartBurst={heartBurst}
          />
        )}

        {/* -------------------------------------------------------------------
            C. MÀN HÌNH KHÁM PHÁ / PLAYLIST ĐỒNG BỘ / LỊCH SỬ + MINI PLAYER
           ------------------------------------------------------------------- */}
        {!isNowPlayingView && !isCockpitView && (
          <div
            key={`browse-${railSection}-${viewMode}-${selectedPlaylistId}`}
            className="flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full animate-ios-browse-in"
          >
            {/* Header trang */}
            <div className="flex items-center justify-between gap-2 mb-2 short:mb-1.5 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl short:text-base font-black text-white tracking-tight truncate">
                  {railSection === 'favorites'
                    ? 'Playlist & Đồng bộ VF5'
                    : railSection === 'history'
                    ? 'Lịch sử vừa phát'
                    : searchQuery && !selectedCategory
                    ? `Kết quả: "${searchQuery}"`
                    : isVideoMode
                    ? 'Khám phá Video'
                    : 'Khám phá Âm nhạc'}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {railSection === 'favorites' && (
                  <button
                    type="button"
                    onClick={() => onOpenSyncModal('sync')}
                    className="min-h-[36px] px-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>{syncCode ? `Mã VF5-${syncCode}` : 'Đồng bộ Mã Xe'}</span>
                  </button>
                )}

                {railSection === 'history' && historyCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmClearHistory) {
                        onClearHistory();
                        setConfirmClearHistory(false);
                      } else {
                        setConfirmClearHistory(true);
                      }
                    }}
                    className={`min-h-[36px] px-3 rounded-full text-xs font-bold flex items-center gap-1.5 border transition active:scale-95 ${
                      confirmClearHistory
                        ? 'bg-rose-600 text-white border-rose-400'
                        : 'bg-white/10 text-white/75 border-white/15 hover:bg-white/20'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{confirmClearHistory ? 'Bấm lần nữa để xóa' : 'Xóa lịch sử'}</span>
                  </button>
                )}

                <span className="text-xs font-mono font-bold text-white/60 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                  {browseVideos.length} bài
                </span>
              </div>
            </div>

            {/* Thanh chọn các Playlist riêng (hiển thị trong mục Playlist) */}
            {railSection === 'favorites' && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2.5 short:pb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectPlaylistId('favorites')}
                  className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition ${
                    selectedPlaylistId === 'favorites'
                      ? 'bg-white text-black border-white shadow'
                      : 'bg-white/10 text-white/85 border-white/15 hover:bg-white/20'
                  }`}
                >
                  <span>❤️ Yêu thích ({favoritesCount})</span>
                </button>

                {playlists.map((pl) => {
                  const active = selectedPlaylistId === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => onSelectPlaylistId(pl.id)}
                      className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition ${
                        active
                          ? 'bg-white text-black border-white shadow'
                          : 'bg-white/10 text-white/85 border-white/15 hover:bg-white/20'
                      }`}
                    >
                      <span>
                        {pl.icon} {pl.name} ({pl.items.length})
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => onOpenSyncModal('addTrack')}
                  className="min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap bg-white/10 hover:bg-white/20 border border-dashed border-white/30 text-white/85 flex items-center gap-1 active:scale-95 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Quản lý / Tạo mới</span>
                </button>
              </div>
            )}

            {/* Thanh Chủ đề ngang (chỉ hiện ở Khám phá) */}
            {railSection === 'browse' && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2.5 short:pb-2 shrink-0">
                {MEDIA_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSelectCategory(cat.id, cat.query)}
                      className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap ios-spring-fast active:scale-95 border ${
                        isSelected
                          ? 'bg-white text-black border-white shadow'
                          : 'bg-white/10 text-white/85 border-white/15 hover:bg-white/20'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Lưới bài hát */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar grid grid-cols-1 car:grid-cols-2 gap-2.5 sm:gap-3 content-start pb-2">
              {isLoadingBrowse && browseVideos.length === 0 ? (
                <div className="col-span-full py-12 text-center flex flex-col items-center gap-3">
                  <Loader2 className="w-9 h-9 text-white animate-spin" />
                  <p className="text-sm font-bold text-white/70">Đang tải danh sách...</p>
                </div>
              ) : browseVideos.length === 0 ? (
                <div className="col-span-full py-8 px-4 rounded-2xl bg-white/[0.05] border border-white/10 text-center flex flex-col items-center gap-3">
                  {railSection === 'favorites' ? (
                    <>
                      <Heart className="w-10 h-10 text-rose-400/60" />
                      <p className="text-base font-extrabold text-white">
                        Playlist này chưa có bài hát nào
                      </p>
                      <p className="text-xs sm:text-sm text-white/60 max-w-md">
                        Bấm nút ➕ hoặc ❤️ khi đang nghe để lưu bài, hoặc dùng Đồng bộ Mã Xe để tải
                        danh sách nhạc đã soạn từ điện thoại ở nhà lên xe VF5.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenSyncModal('sync')}
                          className="min-h-[42px] px-4 rounded-full bg-emerald-500 text-black font-extrabold text-xs sm:text-sm active:scale-95 transition"
                        >
                          Nhập Mã Xe tải về
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeRailSection('browse')}
                          className="min-h-[42px] px-4 rounded-full bg-white text-black font-extrabold text-xs sm:text-sm active:scale-95 transition"
                        >
                          Khám phá nhạc
                        </button>
                      </div>
                    </>
                  ) : railSection === 'history' ? (
                    <>
                      <History className="w-10 h-10 text-white/40" />
                      <p className="text-base font-extrabold text-white">Lịch sử phát đang trống</p>
                    </>
                  ) : (
                    <>
                      <Search className="w-10 h-10 text-white/40" />
                      <p className="text-base font-extrabold text-white">
                        Không tìm thấy bài hát phù hợp
                      </p>
                    </>
                  )}
                </div>
              ) : (
                browseVideos.map((item, idx) => {
                  const isCurrent = (currentVideoId || streamData.id) === item.id;
                  const targetSource: QueueSource =
                    railSection === 'favorites'
                      ? selectedPlaylistId === 'favorites'
                        ? 'favorites'
                        : 'playlist'
                      : railSection === 'history'
                      ? 'history'
                      : 'explore';

                  return (
                    <button
                      key={`${item.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        onSelectBrowseVideo(
                          item,
                          targetSource,
                          targetSource === 'playlist' ? selectedPlaylistId : undefined
                        )
                      }
                      className={`w-full text-left flex items-center gap-3 p-2.5 short:p-2 rounded-2xl border backdrop-blur-md ios-spring-fast active:scale-98 ${
                        isCurrent
                          ? 'bg-white/20 border-white/35 shadow-lg'
                          : 'bg-white/[0.06] border-white/10 hover:bg-white/14'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className={`${
                            isVideoMode
                              ? 'w-28 short:w-24 aspect-video'
                              : 'w-14 h-14 short:w-12 short:h-12'
                          } rounded-xl object-cover shadow bg-black`}
                        />
                        {item.durationText && (
                          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-white/10">
                            {item.durationText}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-white/60 truncate mt-1">
                          {item.uploaderName}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}

              {railSection === 'browse' && hasMoreExplore && (
                <div className="col-span-full pt-1 pb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={onLoadMoreExplore}
                    disabled={isLoadingMoreExplore}
                    className="w-full sm:max-w-md min-h-[46px] rounded-2xl bg-white/12 hover:bg-white/20 border border-white/20 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg ios-spring-fast active:scale-95 disabled:opacity-50"
                  >
                    {isLoadingMoreExplore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải thêm...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>Xem thêm {isVideoMode ? 'video' : 'bài hát'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* MINI PLAYER NỔI PHÍA DƯỚI */}
            <div
              onClick={() => onChangeRailSection('nowPlaying')}
              className="shrink-0 mt-2 short:mt-1.5 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl px-3 py-2 short:py-1.5 flex items-center justify-between gap-2.5 shadow-2xl cursor-pointer hover:bg-white/20 ios-spring-fast animate-ios-mini-up active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className={`${
                    isVideoMode ? 'w-14 aspect-video' : 'w-10 h-10 short:w-9 short:h-9'
                  } rounded-xl object-cover shrink-0 shadow bg-black`}
                />
                <div className="min-w-0">
                  <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                    {streamData.title}
                  </h4>
                  <p className="text-[11px] text-white/65 truncate">{streamData.uploader}</p>
                </div>
              </div>

              <div
                className="flex items-center gap-1.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  aria-label="Bài trước"
                  className="w-10 h-10 short:w-9 short:h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                  className="w-11 h-11 short:w-10 short:h-10 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow active:scale-90 transition"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext}
                  aria-label="Bài tiếp theo"
                  className="w-10 h-10 short:w-9 short:h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
