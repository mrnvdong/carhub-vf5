import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
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
  Navigation,
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
  MapTheme,
  SavedPlace,
  PendingNavTarget,
  ActiveNavSummary,
  MusicSource,
} from '../types';
import { MEDIA_CATEGORIES } from '../constants/categories';
import { formatSeconds, resolveSoundCloudStream } from '../services/api';
import { fetchSyncedLyrics, LyricsResult } from '../services/lyrics';
import { fetchSponsorSegments, getSponsorCategoryLabel } from '../services/sponsorblock';
import { useCarHardwareControls } from '../hooks/useCarHardwareControls';
import { useCockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { useTvLive } from '../hooks/useTvLive';
import { CockpitView, VideoSlotRect } from './CockpitView';
import { TvLiveView } from './TvLiveView';
import { TvPlayerStage } from './TvPlayerStage';
import { getCarTheme } from '../utils/theme';

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
  favoritesOnlyCount: number;
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
  // Upgrade #4: Unified Day/Night Theme synced with Map Theme
  nightMode: NightMode;
  isNightDimmed: boolean;
  onCycleNightMode: () => void;
  mapTheme: MapTheme;
  onChangeMapTheme: (theme: MapTheme) => void;
  isLightTheme: boolean;
  // Upgrade #5: Auto-Mix Radio
  isMixActive: boolean;
  isLoadingMix: boolean;
  onStartAutoMix: () => void;
  // Upgrade #6: Saved Map Places & Send-to-Car Navigation
  savedPlaces: SavedPlace[];
  onSavePlace: (place: SavedPlace) => void;
  onRemoveSavedPlace: (id: string) => void;
  incomingNavTarget: PendingNavTarget | null;
  onConsumeIncomingNav: () => void;
  // Upgrade #7: Multi-Source (YouTube + SoundCloud)
  musicSource: MusicSource;
  onChangeMusicSource: (source: MusicSource) => void;
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
  favoritesOnlyCount,
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
  nightMode: _nightMode,
  isNightDimmed: _isNightDimmed,
  onCycleNightMode,
  mapTheme,
  onChangeMapTheme,
  isLightTheme,
  isMixActive,
  isLoadingMix,
  onStartAutoMix,
  savedPlaces,
  onSavePlace,
  onRemoveSavedPlace,
  incomingNavTarget,
  onConsumeIncomingNav,
  musicSource,
  onChangeMusicSource,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeWrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<any>(null);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const cockpitVideoRectRef = useRef<VideoSlotRect | null>(null);
  const tvStageWrapperRef = useRef<HTMLDivElement>(null);
  const tvPageRectRef = useRef<VideoSlotRect | null>(null);
  const cockpitTvRectRef = useRef<VideoSlotRect | null>(null);

  const isSoundCloudTrack =
    streamData.source === 'soundcloud' || streamData.id.startsWith('sc_');
  const isSoundCloudTrackRef = useRef<boolean>(isSoundCloudTrack);
  isSoundCloudTrackRef.current = isSoundCloudTrack;

  const [ytBootVideoId, setYtBootVideoId] = useState<string | null>(() =>
    isSoundCloudTrack ? null : streamData.id
  );
  const loadedVideoIdRef = useRef<string>(isSoundCloudTrack ? '' : streamData.id);
  const latestVideoIdRef = useRef<string>(isSoundCloudTrack ? '' : streamData.id);
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
  const hasUnlockedAudioRef = useRef<boolean>(false);
  hasUnlockedAudioRef.current = hasUnlockedAudio;
  const isMainScrubbingRef = useRef<boolean>(false);
  const lastTouchEndAtRef = useRef<number>(0);

  const [needsIframeTapHint, setNeedsIframeTapHint] = useState<boolean>(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [hasMountedCockpit, setHasMountedCockpit] = useState<boolean>(
    () => railSection === 'cockpit'
  );
  const [activeNavSummary, setActiveNavSummary] = useState<ActiveNavSummary | null>(null);
  const [hasCockpitVideoSlot, setHasCockpitVideoSlot] = useState<boolean>(false);
  const [isDraggingCockpitSplit, setIsDraggingCockpitSplit] = useState<boolean>(false);
  const [isTvSessionActive, setIsTvSessionActive] = useState<boolean>(() => railSection === 'tv');
  const [cockpitTvMode, setCockpitTvMode] = useState<boolean>(() => railSection === 'tv');
  const [hasTvPageSlot, setHasTvPageSlot] = useState<boolean>(false);
  const [hasCockpitTvSlot, setHasCockpitTvSlot] = useState<boolean>(false);

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
  const effectiveVideoMode = isVideoMode && !isSoundCloudTrack;
  const isNowPlayingView = railSection === 'nowPlaying';
  const isCockpitView = railSection === 'cockpit';
  const isTvView = railSection === 'tv';

  const isTvViewRef = useRef<boolean>(isTvView);
  isTvViewRef.current = isTvView;
  const isCockpitViewRef = useRef<boolean>(isCockpitView);
  isCockpitViewRef.current = isCockpitView;
  const cockpitTvModeRef = useRef<boolean>(cockpitTvMode);
  cockpitTvModeRef.current = cockpitTvMode;

  const showVideoInViewport = effectiveVideoMode && isNowPlayingView;
  const showVideoInCockpit =
    effectiveVideoMode && isCockpitView && !cockpitTvMode && !isFullscreen && hasCockpitVideoSlot;

  const showTvInPage = isTvSessionActive && isTvView && !isFullscreen && hasTvPageSlot;
  const showTvInCockpit =
    isTvSessionActive && isCockpitView && cockpitTvMode && !isFullscreen && hasCockpitTvSlot;
  const showTvVisible = showTvInPage || showTvInCockpit;

  // Chuyển tab TV Live <-> Cockpit: tự kích hoạt session & tự bật chế độ TV trong Cockpit để giữ nguyên 1 bộ phát (0ms reload!)
  useEffect(() => {
    if (isTvView) {
      setIsTvSessionActive(true);
      setCockpitTvMode(true);
    } else if (isNowPlayingView) {
      setIsTvSessionActive(false);
      setCockpitTvMode(false);
    }
  }, [isTvView, isNowPlayingView]);

  // Nếu người dùng chọn bài nhạc mới từ Tìm kiếm / Khám phá / Playlist -> tắt TV để không chồng tiếng & không tốn 4G
  const prevStreamIdForTvRef = useRef<string>(streamData.id);
  useEffect(() => {
    if (prevStreamIdForTvRef.current !== streamData.id) {
      prevStreamIdForTvRef.current = streamData.id;
      setIsTvSessionActive(false);
      setCockpitTvMode(false);
    }
  }, [streamData.id]);

  const handleToggleCockpitViewMode = useCallback(() => {
    onViewModeChange(isVideoMode ? 'ytmusic' : 'classic');
  }, [isVideoMode, onViewModeChange]);

  const handleOpenFullTv = useCallback(() => {
    setIsTvSessionActive(true);
    setCockpitTvMode(true);
    onChangeRailSection('tv');
  }, [onChangeRailSection]);

  const handleChangeCockpitTvMode = useCallback((active: boolean) => {
    setCockpitTvMode(active);
    setIsTvSessionActive(active);
  }, []);

  const applyTvStageWrapperPosition = useCallback((rect: VideoSlotRect | null) => {
    const wrapper = tvStageWrapperRef.current;
    if (!wrapper) return;
    if (rect && rect.width > 40 && rect.height > 40) {
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.bottom = 'auto';
      wrapper.style.right = 'auto';
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
    } else {
      wrapper.style.top = '';
      wrapper.style.left = '';
      wrapper.style.bottom = '';
      wrapper.style.right = '';
      wrapper.style.width = '';
      wrapper.style.height = '';
    }
  }, []);

  // Đồng bộ tọa độ bộ phát TV duy nhất vào khung trang TV Live (0 re-render khi resize!)
  const handleTvPageSlotRectChange = useCallback(
    (rect: VideoSlotRect | null) => {
      tvPageRectRef.current = rect;
      const valid = Boolean(rect && rect.width > 40 && rect.height > 40);
      if (isTvViewRef.current) {
        applyTvStageWrapperPosition(valid ? rect : null);
      }
      setHasTvPageSlot((prev) => (prev === valid ? prev : valid));
    },
    [applyTvStageWrapperPosition]
  );

  // Đồng bộ tọa độ bộ phát TV duy nhất vào khung Cockpit TV (60fps khi kéo chia tỉ lệ, 0ms reload!)
  const handleCockpitTvSlotRectChange = useCallback(
    (rect: VideoSlotRect | null) => {
      cockpitTvRectRef.current = rect;
      const valid = Boolean(rect && rect.width > 40 && rect.height > 40);
      if (isCockpitViewRef.current && cockpitTvModeRef.current) {
        applyTvStageWrapperPosition(valid ? rect : null);
      }
      setHasCockpitTvSlot((prev) => (prev === valid ? prev : valid));
    },
    [applyTvStageWrapperPosition]
  );

  useLayoutEffect(() => {
    const activeRect = showTvInPage
      ? tvPageRectRef.current
      : showTvInCockpit
      ? cockpitTvRectRef.current
      : null;
    applyTvStageWrapperPosition(activeRect);
  }, [showTvInPage, showTvInCockpit, isFullscreen, isTvSessionActive, applyTvStageWrapperPosition]);

  // Đồng bộ trực tiếp tọa độ <iframe> duy nhất vào khung Video 16:9 trong Cockpit (0 re-render khi kéo chia tỉ lệ!)
  const handleCockpitVideoSlotRectChange = useCallback((rect: VideoSlotRect | null) => {
    cockpitVideoRectRef.current = rect;
    const wrapper = iframeWrapperRef.current;

    if (rect && rect.width > 40 && rect.height > 40) {
      if (wrapper) {
        wrapper.style.top = `${rect.top}px`;
        wrapper.style.left = `${rect.left}px`;
        wrapper.style.bottom = 'auto';
        wrapper.style.right = 'auto';
        wrapper.style.width = `${rect.width}px`;
        wrapper.style.height = `${rect.height}px`;
      }
      setHasCockpitVideoSlot((prev) => (prev ? prev : true));
    } else {
      if (wrapper) {
        wrapper.style.top = '';
        wrapper.style.left = '';
        wrapper.style.bottom = '';
        wrapper.style.right = '';
        wrapper.style.width = '';
        wrapper.style.height = '';
      }
      setHasCockpitVideoSlot((prev) => (prev ? false : prev));
    }
  }, []);

  useLayoutEffect(() => {
    const wrapper = iframeWrapperRef.current;
    if (!wrapper) return;

    if (showVideoInCockpit && cockpitVideoRectRef.current) {
      const r = cockpitVideoRectRef.current;
      wrapper.style.top = `${r.top}px`;
      wrapper.style.left = `${r.left}px`;
      wrapper.style.bottom = 'auto';
      wrapper.style.right = 'auto';
      wrapper.style.width = `${r.width}px`;
      wrapper.style.height = `${r.height}px`;
    } else {
      wrapper.style.top = '';
      wrapper.style.left = '';
      wrapper.style.bottom = '';
      wrapper.style.right = '';
      wrapper.style.width = '';
      wrapper.style.height = '';
    }
  }, [showVideoInCockpit, showVideoInViewport, isFullscreen]);

  // Giữ sống CockpitView ngay sau lần mở đầu tiên (hoặc khi nhận điểm đến từ điện thoại Send-to-Car!)
  useEffect(() => {
    if (isCockpitView && !hasMountedCockpit) {
      setHasMountedCockpit(true);
    }
  }, [isCockpitView, hasMountedCockpit]);

  useEffect(() => {
    if (incomingNavTarget) {
      setHasMountedCockpit(true);
      if (!isCockpitView) {
        onChangeRailSection('cockpit');
      }
    }
  }, [incomingNavTarget, isCockpitView, onChangeRailSection]);

  // Giữ GPS & cảnh báo tốc độ / giọng nói chỉ đường chạy nền khi đang mở Cockpit HOẶC đang có lộ trình dẫn đường!
  const telemetry = useCockpitTelemetry(isCockpitView || Boolean(activeNavSummary));

  const showToast = useCallback((label: string) => {
    setHardwareNotice(label);
    window.setTimeout(() => {
      setHardwareNotice((prev) => (prev === label ? null : prev));
    }, 2200);
  }, []);

  // Kho TV Live & Ping dùng chung cho cả Cockpit TV lẫn trang TV Live đầy đủ (chỉ nạp khi bật TV!)
  const tvController = useTvLive(isTvSessionActive || isTvView, showToast);
  const handleTvZapNext = useCallback(() => {
    tvController.zapChannel(1);
  }, [tvController]);

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

  // Tải lời bài hát đồng bộ (hỗ trợ cả YouTube lẫn SoundCloud qua LRCLIB)
  useEffect(() => {
    if (!streamData.id) return;
    let cancelled = false;
    setIsLoadingLyrics(true);
    setLyricsData(null);

    const lyricsLookupId = isSoundCloudTrack ? '' : streamData.id;
    fetchSyncedLyrics(lyricsLookupId, streamData.title, streamData.uploader)
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
  }, [streamData.id, streamData.title, streamData.uploader, isSoundCloudTrack]);

  // Upgrade #1: Tải phân đoạn SponsorBlock & Non-Music Intro/Outro (chỉ cho YouTube)
  useEffect(() => {
    if (!streamData.id || isSoundCloudTrack) {
      setSponsorSegments([]);
      return;
    }
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
  }, [streamData.id, isSoundCloudTrack]);

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
    if (!ytBootVideoId) return '';
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
    return `https://www.youtube.com/embed/${ytBootVideoId}?${params.toString()}`;
  }, [ytBootVideoId]);

  // Helper dừng sạch SoundCloud <audio> + Hls.js khi chuyển sang YouTube hoặc đổi bài
  const teardownSoundCloudAudio = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    }
  }, []);

  // Dual-Engine Playback Switch: SoundCloud Native <audio>/HLS <-> YouTube <iframe> 0ms loadVideoById
  useEffect(() => {
    setCurrentTime(0);
    setDragTime(null);
    setDuration(streamData.duration || 0);
    setEmbedError(null);
    setIsBuffering(true);

    if (errorSkipTimerRef.current) {
      window.clearTimeout(errorSkipTimerRef.current);
      errorSkipTimerRef.current = null;
    }

    // 1. NGUỒN SOUNDCLOUD (Native <audio> MP3 / iOS Native HLS / Lazy hls.js trên Chrome)
    if (isSoundCloudTrack) {
      postEmbedCommand('pauseVideo');
      teardownSoundCloudAudio();
      const controller = new AbortController();

      const failSoundCloud = (msg: string) => {
        if (controller.signal.aborted) return;
        consecutiveErrorsRef.current += 1;
        setIsPlaying(false);
        setIsBuffering(false);
        if (consecutiveErrorsRef.current <= 4 && hasNext) {
          setEmbedError(`${msg} — Tự chuyển bài tiếp theo...`);
          errorSkipTimerRef.current = window.setTimeout(() => {
            onNextRef.current();
          }, 1500);
        } else {
          setEmbedError(`${msg}. Hãy chọn bài khác.`);
        }
      };

      (async () => {
        const info = await resolveSoundCloudStream(streamData.id, controller.signal);
        if (controller.signal.aborted) return;
        if (!info?.streamUrl) {
          failSoundCloud('Không tải được luồng nhạc SoundCloud');
          return;
        }
        if (info.duration > 0) setDuration(info.duration);

        const audio = audioRef.current;
        if (!audio) return;

        const canPlayNativeHls =
          audio.canPlayType('application/vnd.apple.mpegurl') !== '' ||
          audio.canPlayType('application/x-mpegURL') !== '';

        if (info.protocol === 'progressive' || canPlayNativeHls) {
          audio.src = info.streamUrl;
          audio.load();
          audio
            .play()
            .then(() => {
              if (!controller.signal.aborted) {
                consecutiveErrorsRef.current = 0;
                setHasUnlockedAudio(true);
                setNeedsIframeTapHint(false);
                setIsPlaying(true);
                setIsBuffering(false);
              }
            })
            .catch(() => {
              if (!controller.signal.aborted) {
                setIsPlaying(false);
                setIsBuffering(false);
              }
            });
        } else {
          try {
            const { default: Hls } = await import('hls.js');
            if (controller.signal.aborted) return;
            if (Hls.isSupported()) {
              const hls = new Hls({ maxBufferLength: 20, maxMaxBufferLength: 40 });
              hlsRef.current = hls;
              hls.loadSource(info.streamUrl);
              hls.attachMedia(audio);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (controller.signal.aborted) return;
                audio
                  .play()
                  .then(() => {
                    consecutiveErrorsRef.current = 0;
                    setHasUnlockedAudio(true);
                    setIsPlaying(true);
                    setIsBuffering(false);
                  })
                  .catch(() => {
                    setIsPlaying(false);
                    setIsBuffering(false);
                  });
              });
              hls.on(Hls.Events.ERROR, (_ev: any, data: any) => {
                if (data?.fatal) {
                  failSoundCloud('Luồng SoundCloud HLS gián đoạn');
                }
              });
            } else {
              failSoundCloud('Trình duyệt không hỗ trợ luồng HLS SoundCloud');
            }
          } catch {
            failSoundCloud('Không khởi tạo được bộ phát SoundCloud');
          }
        }
      })();

      return () => {
        controller.abort();
      };
    }

    // 2. NGUỒN YOUTUBE (0ms qua loadVideoById)
    teardownSoundCloudAudio();
    latestVideoIdRef.current = streamData.id;

    if (!ytBootVideoId) {
      loadedVideoIdRef.current = streamData.id;
      setYtBootVideoId(streamData.id);
    } else if (iframeReadyRef.current && loadedVideoIdRef.current !== streamData.id) {
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
  }, [
    streamData.id,
    streamData.duration,
    isSoundCloudTrack,
    ytBootVideoId,
    hasNext,
    postEmbedCommand,
    sendWidgetHandshake,
    teardownSoundCloudAudio,
  ]);

  useEffect(() => {
    return () => {
      teardownSoundCloudAudio();
    };
  }, [teardownSoundCloudAudio]);

  const handleSeekTo = useCallback(
    (val: number) => {
      const maxDur = duration > 0 ? duration : 100;
      const clamped = Math.max(0, Math.min(val, maxDur));
      lastManualSeekAtRef.current = Date.now();
      setCurrentTime(clamped);
      if (isSoundCloudTrackRef.current) {
        const audio = audioRef.current;
        if (audio && isFinite(clamped)) {
          try {
            audio.currentTime = clamped;
          } catch {}
        }
      } else {
        postEmbedCommand('seekTo', [clamped, true]);
      }
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
      if (isSoundCloudTrackRef.current) return;
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

    if (
      !isSoundCloudTrackRef.current &&
      latestVideoIdRef.current &&
      latestVideoIdRef.current !== loadedVideoIdRef.current
    ) {
      loadedVideoIdRef.current = latestVideoIdRef.current;
      postEmbedCommand('loadVideoById', [latestVideoIdRef.current]);
    }
  };

  const handlePlayExplicit = useCallback(() => {
    setIsTvSessionActive(false);
    setCockpitTvMode(false);
    if (isSoundCloudTrackRef.current) {
      const audio = audioRef.current;
      if (audio) {
        audio
          .play()
          .then(() => {
            setHasUnlockedAudio(true);
            setIsPlaying(true);
            setIsBuffering(false);
          })
          .catch(() => {});
      }
      return;
    }

    postEmbedCommand('playVideo');
    if (!hasUnlockedAudioRef.current && !isVideoMode) {
      window.setTimeout(() => {
        if (!hasUnlockedAudioRef.current) {
          setNeedsIframeTapHint(true);
        }
      }, 850);
    }
  }, [isVideoMode, postEmbedCommand]);

  const handlePauseExplicit = useCallback(() => {
    if (isSoundCloudTrackRef.current) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    postEmbedCommand('pauseVideo');
    setIsPlaying(false);
  }, [postEmbedCommand]);

  const pauseAllMusicForTv = useCallback(() => {
    try {
      audioRef.current?.pause();
    } catch {}
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
      lastTouchEndAtRef.current = Date.now();
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

  const handleOpenAddPlaylistModal = useCallback(() => {
    onOpenSyncModal('addTrack');
  }, [onOpenSyncModal]);

  const handleCockpitScrubStart = useCallback(() => {
    setDragTime(currentTime);
  }, [currentTime]);

  const handleCockpitScrubMove = useCallback((val: number) => {
    setDragTime(val);
  }, []);

  const handleCockpitScrubCommit = useCallback(
    (val: number) => {
      setDragTime(null);
      handleSeekTo(val);
    },
    [handleSeekTo]
  );

  const cockpitGestureHandlers = useMemo(
    () => ({
      onTouchStart: handleArtOrCardTouchStart,
      onTouchEnd: (e: React.TouchEvent) => handleArtTouchEnd(e, false),
    }),
    [handleArtOrCardTouchStart, handleArtTouchEnd]
  );

  const overlayIframeOnArtForFirstUnlock =
    !isSoundCloudTrack && !isVideoMode && isNowPlayingView && !hasUnlockedAudio && !isPlaying;

  const theme = getCarTheme(isLightTheme);
  // Khi phóng to toàn màn hình Video -> luôn giữ thanh điều khiển nền tối chuẩn điện ảnh
  const npLight = isLightTheme && !isFullscreen;
  const npTheme = getCarTheme(npLight);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none flex flex-col car:flex-row transition-colors duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 bg-black text-white' : theme.shell
      }`}
    >
      {/* AUDIO NATIVE DUY NHẤT CHO SOUNDCLOUD (MP3 Progressive + iOS Native HLS + Lazy hls.js) */}
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        className="hidden"
        onPlaying={() => {
          if (!isSoundCloudTrackRef.current) return;
          consecutiveErrorsRef.current = 0;
          setHasUnlockedAudio(true);
          setNeedsIframeTapHint(false);
          setEmbedError(null);
          setIsPlaying(true);
          setIsBuffering(false);
        }}
        onPause={() => {
          if (!isSoundCloudTrackRef.current) return;
          setIsPlaying(false);
        }}
        onWaiting={() => {
          if (!isSoundCloudTrackRef.current) return;
          setIsBuffering(true);
        }}
        onTimeUpdate={() => {
          if (!isSoundCloudTrackRef.current) return;
          const a = audioRef.current;
          if (a && Date.now() - lastManualSeekAtRef.current > 650) {
            setCurrentTime(a.currentTime || 0);
          }
        }}
        onLoadedMetadata={() => {
          if (!isSoundCloudTrackRef.current) return;
          const a = audioRef.current;
          if (a && isFinite(a.duration) && a.duration > 0) {
            setDuration(a.duration);
          }
        }}
        onEnded={() => {
          if (!isSoundCloudTrackRef.current) return;
          setIsPlaying(false);
          setIsBuffering(false);
          if (repeatModeRef.current === 'one' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          } else {
            onNextRef.current();
          }
        }}
      />

      {/* BỘ PHÁT TV LIVE & RADIO DUY NHẤT (Dùng chung cho cả trang TV Live lẫn Cockpit -> chuyển qua lại 0ms reload!) */}
      {isTvSessionActive && (
        <div
          ref={tvStageWrapperRef}
          className={
            showTvVisible
              ? `fixed z-20 overflow-hidden rounded-2xl shadow-xl ${
                  isDraggingCockpitSplit ? 'pointer-events-none' : 'pointer-events-auto'
                }`
              : 'fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden'
          }
        >
          <TvPlayerStage
            channel={tvController.activeChannel}
            isLightTheme={isLightTheme}
            compact={showTvInCockpit}
            isMuted={tvController.isMuted}
            forceProxy={tvController.forceProxy}
            reloadNonce={tvController.reloadNonce}
            videoRef={tvController.videoRef}
            onPauseMusic={pauseAllMusicForTv}
            onZapNext={handleTvZapNext}
            onForceProxyRetry={tvController.forceProxyRetry}
            onStatusChange={tvController.setPlayerStatus}
            onPingUpdate={tvController.markChannelLiveState}
          />
        </div>
      )}

      {/* NỀN ÁNH SÁNG ĐỘNG (Tự đồng bộ Sáng / Tối theo lớp bản đồ & chế độ Ngày/Đêm!) */}
      {!isFullscreen && (
        <>
          <div
            key={`bg-${streamData.id}`}
            className={`absolute inset-0 pointer-events-none blur-3xl animate-ambient-drift transition-opacity duration-500 ${
              isLightTheme ? 'opacity-18' : 'opacity-35'
            }`}
            style={{
              backgroundImage: `url(${streamData.thumbnailUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }}
          />
          <div
            className={`absolute inset-0 pointer-events-none transition-colors duration-500 ${
              isLightTheme
                ? 'bg-gradient-to-br from-[#eef2f7]/88 via-[#e8edf5]/90 to-[#dde5f0]/94'
                : 'bg-gradient-to-br from-[#070a12]/80 via-[#070a12]/82 to-[#05070e]/94'
            }`}
          />
        </>
      )}

      {/* Toast thông báo thông minh (Vô lăng, Vuốt mù, SponsorBlock, Auto-Mix, Send-to-Car) */}
      {hardwareNotice && (
        <div
          className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 backdrop-blur-xl px-4 py-2 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 shadow-2xl border pointer-events-none max-w-[90vw] ${theme.toast}`}
        >
          <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="truncate">{hardwareNotice}</span>
        </div>
      )}

      {/* MINI SPEED & TURN PILL: Khi đang mở tab Nhạc/Khám phá/TV mà vẫn đang dẫn đường -> 1 chạm quay về Cockpit! */}
      {!isCockpitView && !isFullscreen && activeNavSummary && (
        <button
          type="button"
          onClick={() => onChangeRailSection('cockpit')}
          className={`fixed top-2 right-2.5 z-40 max-w-[min(360px,calc(100vw-6rem))] px-3 py-1.5 rounded-full border backdrop-blur-2xl shadow-2xl flex items-center gap-2 active:scale-95 transition ${
            telemetry.roadInfo?.speedLimit &&
            telemetry.speedKmh !== null &&
            telemetry.speedKmh >= telemetry.roadInfo.speedLimit + 5
              ? 'bg-rose-600/95 border-rose-300 text-white animate-pulse'
              : isLightTheme
              ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
              : 'bg-sky-950/94 border-sky-400/60 text-white hover:bg-sky-900'
          }`}
        >
          <span className="px-1.5 py-0.5 rounded-md bg-black/35 font-mono text-xs font-black text-emerald-300 shrink-0">
            {telemetry.speedKmh ?? 0} km/h
          </span>
          <Navigation className="w-3.5 h-3.5 text-sky-200 shrink-0" />
          <span className="text-xs font-extrabold truncate">
            {activeNavSummary.nextArrow} {activeNavSummary.nextInstruction}
            {activeNavSummary.nextDistM > 0 ? ` (${activeNavSummary.nextDistM}m)` : ''} •{' '}
            {activeNavSummary.remainingKm}km
          </span>
        </button>
      )}

      {/* =====================================================================
          1. THANH ĐIỀU HƯỚNG BÊN TRÁI (Gần tay phải người lái VF5 nhất)
         ===================================================================== */}
      {!isFullscreen && (
        <aside
          className={`relative z-20 flex car:flex-col items-center justify-between gap-1 px-2 py-1.5 car:py-1.5 short:py-1 car:px-1.5 car:w-[4.65rem] lg:w-[5rem] border-b car:border-b-0 car:border-r shrink-0 overflow-x-auto car:overflow-x-hidden car:overflow-y-auto no-scrollbar transition-colors ${theme.rail}`}
        >
          {/* Nút 1-chạm chuyển đổi Music <-> Video */}
          <button
            type="button"
            onClick={() => {
              if (isCockpitView && cockpitTvMode) {
                setCockpitTvMode(false);
                setIsTvSessionActive(false);
              }
              onViewModeChange(isVideoMode ? 'ytmusic' : 'classic');
            }}
            aria-label={isVideoMode ? 'Chuyển sang chế độ Nghe Nhạc' : 'Chuyển sang chế độ Xem Video'}
            className={`flex car:flex-col items-center justify-center gap-0.5 min-h-[38px] short:min-h-[34px] px-2.5 car:px-1 car:w-full py-1 rounded-xl border shadow-sm ios-spring-fast active:scale-95 shrink-0 ${
              isVideoMode
                ? isLightTheme
                  ? 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100'
                  : 'bg-gradient-to-br from-sky-500/30 to-blue-600/30 border-sky-400/50 text-sky-100'
                : isLightTheme
                ? 'bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100'
                : 'bg-gradient-to-br from-rose-500/30 to-pink-600/30 border-rose-400/50 text-rose-100'
            }`}
          >
            {isVideoMode ? (
              <>
                <Tv
                  className={`w-4 h-4 shrink-0 ${
                    isLightTheme ? 'text-blue-600' : 'text-sky-300'
                  }`}
                />
                <span className="text-[10px] vshort:text-[9px] font-extrabold leading-none">
                  Video
                </span>
              </>
            ) : (
              <>
                <Music
                  className={`w-4 h-4 shrink-0 ${
                    isLightTheme ? 'text-rose-600' : 'text-rose-300'
                  }`}
                />
                <span className="text-[10px] vshort:text-[9px] font-extrabold leading-none">
                  Music
                </span>
              </>
            )}
          </button>

          {/* Cụm điều hướng chính (Cockpit nằm vị trí #1 mặc định khi mở xe!) */}
          <nav
            aria-label="Điều hướng chính"
            className="flex car:flex-col items-center gap-1 car:gap-0.5 car:w-full shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeRailSection('cockpit')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'cockpit' ? theme.railCockpitActive : theme.railNavIdle
              }`}
            >
              <Gauge className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Cockpit
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('tv')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'tv' ? theme.railTvActive : theme.railNavIdle
              }`}
            >
              <Tv className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                TV Live
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('nowPlaying')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'nowPlaying' ? theme.railNavActive : theme.railNavIdle
              }`}
            >
              {effectiveVideoMode ? (
                <Tv className="w-4 h-4 short:w-3.5 short:h-3.5" />
              ) : (
                <Headphones className="w-4 h-4 short:w-3.5 short:h-3.5" />
              )}
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Đang phát
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('browse')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'browse' ? theme.railNavActive : theme.railNavIdle
              }`}
            >
              <Compass className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Khám phá
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSearchModal(false)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${theme.railNavIdle}`}
            >
              <Search className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Tìm kiếm
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('favorites')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'favorites' ? theme.railNavActive : theme.railNavIdle
              }`}
            >
              <Bookmark className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Playlist{favoritesCount > 0 ? ` (${favoritesCount})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeRailSection('history')}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[34px] short:min-h-[30px] vshort:min-h-[26px] w-14 car:w-full py-1 rounded-xl ios-spring-fast active:scale-95 ${
                railSection === 'history' ? theme.railNavActive : theme.railNavIdle
              }`}
            >
              <History className="w-4 h-4 short:w-3.5 short:h-3.5" />
              <span className="text-[10px] vshort:text-[9px] font-bold leading-none">
                Lịch sử
              </span>
            </button>
          </nav>

          {/* Cụm công cụ nhanh phía dưới: [Micro + Sáng/Tối đồng bộ Map] + Tỉ lệ chữ */}
          <div className="flex car:flex-col items-center gap-1 car:w-full shrink-0">
            <div className="flex car:grid car:grid-cols-2 gap-1 car:w-full">
              <button
                type="button"
                onClick={() => onOpenSearchModal(true)}
                aria-label="Tìm kiếm bằng giọng nói"
                title="Tìm giọng nói tiếng Việt"
                className={`min-h-[34px] w-9 car:w-full rounded-lg border flex items-center justify-center active:scale-95 transition ${
                  isLightTheme
                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-600'
                    : 'bg-rose-500/25 hover:bg-rose-500/40 border-rose-400/45 text-rose-200'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const willBeDark = isLightTheme;
                  onCycleNightMode();
                  showToast(
                    willBeDark
                      ? '🌙 Giao diện & Bản đồ 3D: Chế độ Tối'
                      : '☀️ Giao diện & Bản đồ 3D: Chế độ Sáng'
                  );
                }}
                aria-label={
                  isLightTheme
                    ? 'Chuyển sang giao diện & bản đồ Tối'
                    : 'Chuyển sang giao diện & bản đồ Sáng'
                }
                title={
                  isLightTheme
                    ? 'Đang ở chế độ Sáng • Bấm để chuyển sang Tối'
                    : 'Đang ở chế độ Tối • Bấm để chuyển sang Sáng'
                }
                className={`min-h-[34px] w-9 car:w-full rounded-lg border flex items-center justify-center active:scale-95 transition ${
                  isLightTheme
                    ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-700'
                    : 'bg-indigo-500/25 hover:bg-indigo-500/40 border-indigo-400/50 text-amber-200'
                }`}
              >
                {isLightTheme ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={cycleScale}
              aria-label={`Đổi cỡ giao diện, hiện tại ${scaleLabel}`}
              className={`min-h-[28px] px-2 car:px-0 car:w-full rounded-lg text-[10px] font-extrabold border flex items-center justify-center active:scale-95 transition ${theme.railToolBtn}`}
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
                      effectiveVideoMode
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
              {/* 1. ẢNH BÌA ALBUM VUÔNG + CỬ CHỈ VUỐT MÙ & CHẠM ĐÚP ❤️ (hiện cho Music & mọi bài SoundCloud) */}
              {isNowPlayingView && !effectiveVideoMode && (
                <div
                  onTouchStart={handleArtOrCardTouchStart}
                  onTouchEnd={(e) => handleArtTouchEnd(e, true)}
                  onClick={(e) => {
                    // Tránh bắn đúp nếu sự kiện vừa được xử lý qua TouchEvent (< 450ms)
                    if (Date.now() - lastTouchEndAtRef.current < 450) return;
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
                    {isSoundCloudTrack ? (
                      <span className="px-2 py-0.5 rounded-full bg-[#ff5500] text-white text-[9px] font-black shrink-0 shadow">
                        ☁️ SoundCloud
                      </span>
                    ) : (
                      sponsorSegments.length > 0 &&
                      autoSkipEnabled && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/80 text-black text-[9px] font-extrabold shrink-0">
                          Skip Intro ({sponsorSegments.length})
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* 2. IFRAME YOUTUBE DUY NHẤT (Dùng chung cho cả Đang phát Video lẫn ô Video trong Cockpit — 0ms ngắt tiếng!) */}
              <div
                ref={iframeWrapperRef}
                className={
                  showVideoInViewport
                    ? isFullscreen
                      ? 'relative w-full h-full bg-black overflow-hidden'
                      : 'car-video-fit relative overflow-hidden rounded-2xl sm:rounded-3xl bg-black border border-white/15 shadow-[0_18px_50px_rgba(0,0,0,0.75)] animate-artwork-enter'
                    : showVideoInCockpit
                    ? `fixed z-20 overflow-hidden rounded-2xl bg-black border border-white/15 shadow-xl ${
                        isDraggingCockpitSplit ? 'pointer-events-none' : 'pointer-events-auto'
                      }`
                    : overlayIframeOnArtForFirstUnlock
                    ? 'car-art-fit absolute z-20 opacity-[0.01] overflow-hidden cursor-pointer pointer-events-auto'
                    : 'fixed bottom-0 right-0 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden'
                }
              >
                {initialEmbedUrl && (
                  <iframe
                    ref={iframeRef}
                    src={initialEmbedUrl}
                    title={streamData.title || 'CarHub Player'}
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    onLoad={handleIframeLoad}
                  />
                )}
                {(showVideoInViewport || showVideoInCockpit) && (isLoading || isBuffering) && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center pointer-events-none">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                )}
                {showVideoInCockpit && embedError && (
                  <div className="absolute inset-x-2 bottom-2 z-30 bg-amber-950/95 border border-amber-400/50 text-amber-100 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-between gap-2 shadow-xl">
                    <span className="truncate">{embedError}</span>
                    {hasNext && (
                      <button
                        type="button"
                        onClick={onNext}
                        className="px-2 py-1 rounded-lg bg-amber-400 text-black font-extrabold shrink-0 active:scale-95"
                      >
                        Bài kế
                      </button>
                    )}
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
                    <h2
                      className={`text-base sm:text-lg lg:text-xl short:text-sm vshort:text-xs font-extrabold truncate tracking-tight ${npTheme.text}`}
                    >
                      {streamData.title}
                    </h2>
                    <p
                      className={`text-xs sm:text-sm short:text-[11px] font-semibold truncate ${npTheme.textSub}`}
                    >
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
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow'
                          : npLight
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
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
                          ? npLight
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                          : npTheme.iconBtn
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
                      className={`w-9 h-9 short:w-8 short:h-8 rounded-full border flex items-center justify-center ios-spring-fast active:scale-90 ${npTheme.iconBtn}`}
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
                          ? npLight
                            ? 'bg-rose-50 border-rose-300 text-rose-600'
                            : 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                          : npTheme.iconBtn
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFavorite ? (npLight ? 'fill-rose-600' : 'fill-rose-400') : ''
                        }`}
                      />
                    </button>

                    {isVideoMode && (
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? 'Thu nhỏ khung hình' : 'Xem toàn màn hình xe'}
                        className={`w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center border ios-spring-fast active:scale-90 ${npTheme.iconBtn}`}
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
                    onPointerDown={() => {
                      isMainScrubbingRef.current = true;
                      setDragTime(currentTime);
                    }}
                    onChange={(e) => setDragTime(parseFloat(e.target.value))}
                    onPointerUp={(e) => {
                      if (!isMainScrubbingRef.current) return;
                      isMainScrubbingRef.current = false;
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setDragTime(null);
                      handleSeekTo(val);
                    }}
                    onPointerCancel={(e) => {
                      if (!isMainScrubbingRef.current) return;
                      isMainScrubbingRef.current = false;
                      const val = parseFloat((e.target as HTMLInputElement).value);
                      setDragTime(null);
                      handleSeekTo(val);
                    }}
                    onKeyUp={() => {
                      if (dragTime !== null) {
                        isMainScrubbingRef.current = false;
                        const finalVal = dragTime;
                        setDragTime(null);
                        handleSeekTo(finalVal);
                      }
                    }}
                    className={npTheme.scrubber}
                  />
                  <div
                    className={`flex justify-between text-[11px] font-mono font-bold -mt-1.5 px-0.5 ${npTheme.textMuted}`}
                  >
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
                        ? npLight
                          ? 'bg-rose-100 border border-rose-300 text-rose-700'
                          : 'bg-rose-500/30 border border-rose-400/50 text-rose-200'
                        : npLight
                        ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200/70'
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
                    className={`w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90 ${
                      npLight
                        ? 'text-slate-900 hover:bg-slate-200/80'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <SkipBack className="w-6 h-6 short:w-5 short:h-5 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekRelative(-10)}
                    aria-label="Tua lùi 10 giây"
                    className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex flex-col items-center justify-center ios-spring-fast active:scale-90 ${
                      npLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-extrabold leading-none mt-0.5">-10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                    className={`w-14 h-14 sm:w-16 sm:h-16 short:w-12 short:h-12 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${npTheme.primaryCta}`}
                  >
                    {isBuffering || isLoading ? (
                      <Loader2 className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 animate-spin" />
                    ) : isPlaying ? (
                      <Pause
                        className={`w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 ${npTheme.primaryCtaIcon}`}
                      />
                    ) : (
                      <Play
                        className={`w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 ml-0.5 ${npTheme.primaryCtaIcon}`}
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSeekRelative(10)}
                    aria-label="Tua tới 10 giây"
                    className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex flex-col items-center justify-center ios-spring-fast active:scale-90 ${
                      npLight
                        ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200/80'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-extrabold leading-none mt-0.5">+10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    aria-label="Bài tiếp theo"
                    className={`w-11 h-11 sm:w-12 sm:h-12 short:w-10 short:h-10 rounded-full flex items-center justify-center disabled:opacity-30 ios-spring-fast active:scale-90 ${
                      npLight
                        ? 'text-slate-900 hover:bg-slate-200/80'
                        : 'text-white hover:bg-white/10'
                    }`}
                  >
                    <SkipForward className="w-6 h-6 short:w-5 short:h-5 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleRepeat}
                    aria-label={`Chế độ lặp: ${repeatMode}`}
                    className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center ios-spring-fast active:scale-90 ${
                      repeatMode !== 'off'
                        ? npLight
                          ? 'bg-slate-200 border border-slate-300 text-slate-950'
                          : 'bg-white/20 border border-white/25 text-white'
                        : npLight
                        ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200/70'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {repeatMode === 'one' ? (
                      <Repeat1
                        className={`w-4 h-4 sm:w-5 sm:h-5 ${
                          npLight ? 'text-rose-600' : 'text-rose-300'
                        }`}
                      />
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
              className={`flex flex-col min-h-[260px] car:min-h-0 car:h-full max-h-full rounded-2xl sm:rounded-3xl border overflow-hidden ${theme.card} ${
                effectiveVideoMode ? 'car:col-span-5 lg:col-span-4' : 'car:col-span-7 md:col-span-7'
              }`}
            >
              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 short:py-1.5 border-b shrink-0 ${theme.divider}`}
              >
                {!effectiveVideoMode ? (
                  <div className={`grid grid-cols-3 p-1 rounded-full border w-full ${theme.segTrack}`}>
                    <button
                      type="button"
                      onClick={() => setMusicRightTab('lyrics')}
                      className={`flex items-center justify-center gap-1 min-h-[36px] short:min-h-[32px] px-2 rounded-full text-xs font-extrabold ios-spring-fast ${
                        musicRightTab === 'lyrics' ? theme.segActive : theme.segIdle
                      }`}
                    >
                      <Quote className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Lời nhạc</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicRightTab('queue')}
                      className={`flex items-center justify-center gap-1 min-h-[36px] short:min-h-[32px] px-2 rounded-full text-xs font-extrabold ios-spring-fast ${
                        musicRightTab === 'queue' ? theme.segActive : theme.segIdle
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
                        musicRightTab === 'categories' ? theme.segActive : theme.segIdle
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Chủ đề</span>
                    </button>
                  </div>
                ) : (
                  <div className={`grid grid-cols-2 p-1 rounded-full border w-full ${theme.segTrack}`}>
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('queue')}
                      className={`flex items-center justify-center gap-1.5 min-h-[36px] short:min-h-[32px] px-3 rounded-full text-xs font-extrabold ios-spring-fast ${
                        videoRightTab === 'queue' ? theme.segActive : theme.segIdle
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Tiếp theo ({playbackQueue.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVideoRightTab('categories')}
                      className={`flex items-center justify-center gap-1.5 min-h-[36px] short:min-h-[32px] px-3 rounded-full text-xs font-extrabold ios-spring-fast ${
                        videoRightTab === 'categories' ? theme.segActive : theme.segIdle
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Chủ đề</span>
                    </button>
                  </div>
                )}
              </div>

              {!effectiveVideoMode && musicRightTab === 'lyrics' ? (
                <div
                  ref={lyricsContainerRef}
                  key={`lyrics-${streamData.id}`}
                  className="relative flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 short:py-3.5 no-scrollbar space-y-4 short:space-y-3 animate-ios-browse-in"
                >
                  {isLoadingLyrics ? (
                    <div className={`h-full flex flex-col items-center justify-center gap-2.5 ${theme.textSub}`}>
                      <Loader2 className="w-7 h-7 animate-spin" />
                      <p className="text-xs sm:text-sm font-semibold">Đang tải lời bài hát...</p>
                    </div>
                  ) : lyricsData && lyricsData.lines.length > 0 ? (
                    <>
                      <div className={`flex items-center justify-between text-[11px] font-bold pb-1 ${theme.textMuted}`}>
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
                              className={`text-base sm:text-lg short:text-sm font-bold leading-relaxed ${theme.text}`}
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
                                ? `text-xl sm:text-2xl short:text-lg scale-[1.02] ${
                                    isLightTheme ? 'text-blue-700' : 'text-white'
                                  }`
                                : isPast
                                ? `text-base sm:text-lg short:text-sm ${
                                    isLightTheme
                                      ? 'text-slate-400 hover:text-slate-700'
                                      : 'text-white/30 hover:text-white/75'
                                  }`
                                : `text-base sm:text-lg short:text-sm ${
                                    isLightTheme
                                      ? 'text-slate-600 hover:text-slate-950'
                                      : 'text-white/55 hover:text-white/90'
                                  }`
                            }`}
                          >
                            {line.text}
                          </button>
                        );
                      })}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-3">
                      <Quote className={`w-10 h-10 ${theme.textDim}`} />
                      <div>
                        <p className={`text-sm sm:text-base font-bold ${theme.text}`}>
                          Chưa có lời cho bản thu này
                        </p>
                        <p className={`text-xs mt-1 ${theme.textMuted}`}>
                          Các bản Nonstop / Remix dài thường không kèm lời LRC.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMusicRightTab('queue')}
                        className={`min-h-[40px] px-4 rounded-full border text-xs sm:text-sm font-bold transition active:scale-95 ${theme.iconBtn}`}
                      >
                        Mở danh sách phát tiếp theo ({playbackQueue.length})
                      </button>
                    </div>
                  )}
                </div>
              ) : (!effectiveVideoMode && musicRightTab === 'categories') ||
                (effectiveVideoMode && videoRightTab === 'categories') ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 no-scrollbar animate-ios-browse-in">
                  {/* Bộ chọn nguồn nhạc YouTube <-> SoundCloud ngay đầu tab Chủ đề */}
                  <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${theme.segTrack}`}>
                    <button
                      type="button"
                      onClick={() => onChangeMusicSource('youtube')}
                      className={`min-h-[36px] rounded-xl text-xs font-extrabold transition ${
                        musicSource === 'youtube' ? 'bg-rose-600 text-white shadow' : theme.segIdle
                      }`}
                    >
                      ▶ YouTube
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeMusicSource('soundcloud')}
                      className={`min-h-[36px] rounded-xl text-xs font-extrabold transition ${
                        musicSource === 'soundcloud'
                          ? 'bg-[#ff5500] text-white shadow'
                          : theme.segIdle
                      }`}
                    >
                      ☁️ SoundCloud
                    </button>
                  </div>
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
                          isSelected ? theme.chipActive : `${theme.itemIdle} ${theme.text}`
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
                        className={`w-full text-left flex items-center gap-2.5 p-2 rounded-xl border ios-spring-fast active:scale-99 ${
                          isCurrent
                            ? theme.itemActive
                            : isLightTheme
                            ? 'hover:bg-slate-100 border-transparent'
                            : 'hover:bg-white/10 border-transparent'
                        }`}
                      >
                        <div className="w-5 text-center shrink-0">
                          {isCurrent ? (
                            <div className="flex items-end justify-center gap-0.5 h-3.5">
                              <span
                                className={`w-1 rounded-full h-full ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${
                                  isVideoMode
                                    ? isLightTheme
                                      ? 'bg-blue-600'
                                      : 'bg-sky-400'
                                    : isLightTheme
                                    ? 'bg-rose-600'
                                    : 'bg-rose-400'
                                }`}
                              />
                              <span
                                className={`w-1 rounded-full h-3/5 ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${
                                  isVideoMode
                                    ? isLightTheme
                                      ? 'bg-blue-600'
                                      : 'bg-sky-400'
                                    : isLightTheme
                                    ? 'bg-rose-600'
                                    : 'bg-rose-400'
                                }`}
                                style={{ animationDelay: '150ms' }}
                              />
                              <span
                                className={`w-1 rounded-full h-4/5 ${
                                  isPlaying ? 'animate-bounce' : ''
                                } ${
                                  isVideoMode
                                    ? isLightTheme
                                      ? 'bg-blue-600'
                                      : 'bg-sky-400'
                                    : isLightTheme
                                    ? 'bg-rose-600'
                                    : 'bg-rose-400'
                                }`}
                                style={{ animationDelay: '300ms' }}
                              />
                            </div>
                          ) : (
                            <span className={`text-xs font-mono font-bold ${theme.textMuted}`}>
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
                          } rounded-lg object-cover shrink-0 border ${
                            isLightTheme ? 'border-slate-300' : 'border-white/10'
                          } bg-black`}
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className={`text-xs sm:text-sm font-bold line-clamp-1 ${theme.text}`}>
                            {item.title}
                          </h4>
                          <p className={`text-[11px] truncate mt-0.5 ${theme.textSub}`}>
                            {item.uploaderName}
                          </p>
                        </div>
                        {item.durationText && (
                          <span className={`text-[11px] font-mono font-bold shrink-0 pr-0.5 ${theme.textMuted}`}>
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
                      className={`w-full min-h-[44px] py-2.5 mt-1 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition disabled:opacity-50 ${theme.iconBtn}`}
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
            B. MÀN HÌNH COCKPIT HUD LÁI XE VF5 (Giữ sống sau lần mở đầu để không mất lộ trình dẫn đường khi đổi tab!)
           ------------------------------------------------------------------- */}
        {hasMountedCockpit && (
          <CockpitView
            isVisible={isCockpitView}
            isVideoMode={isVideoMode}
            isSoundCloudTrack={isSoundCloudTrack}
            musicSource={musicSource}
            onChangeMusicSource={onChangeMusicSource}
            onToggleViewMode={handleToggleCockpitViewMode}
            onVideoSlotRectChange={handleCockpitVideoSlotRectChange}
            onDraggingSplitChange={setIsDraggingCockpitSplit}
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
            onOpenAddPlaylist={handleOpenAddPlaylistModal}
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
            onScrubStart={handleCockpitScrubStart}
            onScrubMove={handleCockpitScrubMove}
            onScrubCommit={handleCockpitScrubCommit}
            gestureHandlers={cockpitGestureHandlers}
            heartBurst={heartBurst}
            savedPlaces={savedPlaces}
            onSavePlace={onSavePlace}
            onRemoveSavedPlace={onRemoveSavedPlace}
            syncCode={syncCode}
            incomingNavTarget={incomingNavTarget}
            onConsumeIncomingNav={onConsumeIncomingNav}
            onActiveNavChange={setActiveNavSummary}
            onNotifyToast={showToast}
            mapTheme={mapTheme}
            onChangeMapTheme={onChangeMapTheme}
            isLightTheme={isLightTheme}
            tv={tvController}
            cockpitTvMode={cockpitTvMode}
            onChangeCockpitTvMode={handleChangeCockpitTvMode}
            onTvSlotRectChange={handleCockpitTvSlotRectChange}
            onPauseMusic={pauseAllMusicForTv}
            onOpenFullTv={handleOpenFullTv}
          />
        )}

        {/* -------------------------------------------------------------------
            B2. MÀN HÌNH TRUYỀN HÌNH & RADIO TRỰC TIẾP M3U8 (VTV, VOV Giao thông, HTV, Thể thao...)
           ------------------------------------------------------------------- */}
        {isTvView && (
          <TvLiveView
            tv={tvController}
            onPauseMusic={pauseAllMusicForTv}
            onNotifyToast={showToast}
            onTvSlotRectChange={handleTvPageSlotRectChange}
            isLightTheme={isLightTheme}
          />
        )}

        {/* -------------------------------------------------------------------
            C. MÀN HÌNH KHÁM PHÁ / PLAYLIST ĐỒNG BỘ / LỊCH SỬ + MINI PLAYER
           ------------------------------------------------------------------- */}
        {!isNowPlayingView && !isCockpitView && !isTvView && (
          <div
            key={`browse-${railSection}-${viewMode}-${selectedPlaylistId}`}
            className="flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full animate-ios-browse-in"
          >
            {/* Header trang */}
            <div className="flex items-center justify-between gap-2 mb-2 short:mb-1.5 shrink-0">
              <div className="min-w-0">
                <h2
                  className={`text-lg sm:text-xl short:text-base font-black tracking-tight truncate ${theme.text}`}
                >
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
                {railSection === 'browse' && (
                  <div className={`inline-flex items-center p-0.5 rounded-full border ${theme.segTrack}`}>
                    <button
                      type="button"
                      onClick={() => onChangeMusicSource('youtube')}
                      className={`min-h-[32px] px-3 rounded-full text-xs font-extrabold transition ${
                        musicSource === 'youtube' ? 'bg-rose-600 text-white shadow' : theme.segIdle
                      }`}
                    >
                      ▶ YouTube
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeMusicSource('soundcloud')}
                      className={`min-h-[32px] px-3 rounded-full text-xs font-extrabold transition ${
                        musicSource === 'soundcloud'
                          ? 'bg-[#ff5500] text-white shadow'
                          : theme.segIdle
                      }`}
                    >
                      ☁️ SoundCloud
                    </button>
                  </div>
                )}

                {railSection === 'favorites' && (
                  <button
                    type="button"
                    onClick={() => onOpenSyncModal('sync')}
                    className="min-h-[36px] px-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition"
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
                      confirmClearHistory ? 'bg-rose-600 text-white border-rose-500' : theme.iconBtn
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{confirmClearHistory ? 'Bấm lần nữa để xóa' : 'Xóa lịch sử'}</span>
                  </button>
                )}

                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                    isLightTheme
                      ? 'bg-white/90 text-slate-700 border-slate-300'
                      : 'bg-white/10 text-white/60 border-white/10'
                  }`}
                >
                  {browseVideos.length} bài
                </span>

                {railSection === 'browse' && hasMoreExplore && (
                  <button
                    type="button"
                    onClick={onLoadMoreExplore}
                    disabled={isLoadingMoreExplore}
                    className={`min-h-[32px] px-2.5 rounded-full text-xs font-extrabold border flex items-center gap-1 active:scale-95 transition disabled:opacity-50 ${
                      musicSource === 'soundcloud'
                        ? isLightTheme
                          ? 'bg-[#ff5500] border-orange-500 text-white shadow-sm'
                          : 'bg-[#ff5500]/25 hover:bg-[#ff5500]/40 border-orange-400/50 text-orange-200'
                        : theme.iconBtn
                    }`}
                  >
                    {isLoadingMoreExplore ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden xs:inline">Xem thêm</span>
                  </button>
                )}
              </div>
            </div>

            {/* Thanh chọn các Playlist riêng (hiển thị trong mục Playlist) */}
            {railSection === 'favorites' && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2.5 short:pb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectPlaylistId('favorites')}
                  className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition ${
                    selectedPlaylistId === 'favorites' ? theme.chipActive : theme.chipIdle
                  }`}
                >
                  <span>❤️ Yêu thích ({favoritesOnlyCount})</span>
                </button>

                {playlists.map((pl) => {
                  const active = selectedPlaylistId === pl.id;
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => onSelectPlaylistId(pl.id)}
                      className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition ${
                        active ? theme.chipActive : theme.chipIdle
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
                  className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap border border-dashed flex items-center gap-1 active:scale-95 transition ${theme.chipIdle}`}
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
                        isSelected ? theme.chipActive : theme.chipIdle
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
                  <Loader2 className={`w-9 h-9 animate-spin ${theme.text}`} />
                  <p className={`text-sm font-bold ${theme.textSub}`}>Đang tải danh sách...</p>
                </div>
              ) : browseVideos.length === 0 ? (
                <div
                  className={`col-span-full py-8 px-4 rounded-2xl border text-center flex flex-col items-center gap-3 ${theme.card}`}
                >
                  {railSection === 'favorites' ? (
                    <>
                      <Heart className="w-10 h-10 text-rose-500/70" />
                      <p className={`text-base font-extrabold ${theme.text}`}>
                        Playlist này chưa có bài hát nào
                      </p>
                      <p className={`text-xs sm:text-sm max-w-md ${theme.textSub}`}>
                        Bấm nút ➕ hoặc ❤️ khi đang nghe để lưu bài, hoặc dùng Đồng bộ Mã Xe để tải
                        danh sách nhạc đã soạn từ điện thoại ở nhà lên xe VF5.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenSyncModal('sync')}
                          className="min-h-[42px] px-4 rounded-full bg-emerald-500 text-slate-950 font-extrabold text-xs sm:text-sm active:scale-95 transition"
                        >
                          Nhập Mã Xe tải về
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeRailSection('browse')}
                          className={`min-h-[42px] px-4 rounded-full font-extrabold text-xs sm:text-sm active:scale-95 transition ${theme.primaryCta}`}
                        >
                          Khám phá nhạc
                        </button>
                      </div>
                    </>
                  ) : railSection === 'history' ? (
                    <>
                      <History className={`w-10 h-10 ${theme.textDim}`} />
                      <p className={`text-base font-extrabold ${theme.text}`}>
                        Lịch sử phát đang trống
                      </p>
                    </>
                  ) : (
                    <>
                      <Search className={`w-10 h-10 ${theme.textDim}`} />
                      <p className={`text-base font-extrabold ${theme.text}`}>
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
                        isCurrent ? theme.itemActive : theme.itemIdle
                      }`}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className={`${
                            isVideoMode && !item.id.startsWith('sc_')
                              ? 'w-28 short:w-24 aspect-video'
                              : 'w-14 h-14 short:w-12 short:h-12'
                          } rounded-xl object-cover shadow bg-black`}
                        />
                        {(item.source === 'soundcloud' || item.id.startsWith('sc_')) && (
                          <span className="absolute top-1 left-1 bg-[#ff5500] text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                            ☁️ SC
                          </span>
                        )}
                        {item.durationText && (
                          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-white/10">
                            {item.durationText}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <h4 className={`text-xs sm:text-sm font-bold line-clamp-2 leading-snug ${theme.text}`}>
                          {item.title}
                        </h4>
                        <p className={`text-[11px] truncate mt-1 ${theme.textSub}`}>
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
                    className={`w-full sm:max-w-md min-h-[46px] rounded-2xl border font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg ios-spring-fast active:scale-95 disabled:opacity-50 ${
                      musicSource === 'soundcloud'
                        ? isLightTheme
                          ? 'bg-[#ff5500] hover:bg-[#e64d00] border-orange-500 text-white'
                          : 'bg-[#ff5500]/25 hover:bg-[#ff5500]/40 border-orange-400/55 text-white'
                        : theme.iconBtn
                    }`}
                  >
                    {isLoadingMoreExplore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Đang tải thêm...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>
                          {musicSource === 'soundcloud'
                            ? '☁️ Xem thêm bài hát SoundCloud'
                            : `Xem thêm ${isVideoMode ? 'video' : 'bài hát'}`}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* MINI PLAYER NỔI PHÍA DƯỚI */}
            <div
              onClick={() => onChangeRailSection('nowPlaying')}
              className={`shrink-0 mt-2 short:mt-1.5 border rounded-2xl px-3 py-2 short:py-1.5 flex items-center justify-between gap-2.5 cursor-pointer ios-spring-fast animate-ios-mini-up active:scale-[0.99] ${theme.miniPlayer}`}
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
                  <h4 className={`text-xs sm:text-sm font-extrabold truncate ${theme.text}`}>
                    {streamData.title}
                  </h4>
                  <p className={`text-[11px] truncate ${theme.textSub}`}>{streamData.uploader}</p>
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
                  className={`w-10 h-10 short:w-9 short:h-9 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                  className={`w-11 h-11 short:w-10 short:h-10 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
                >
                  {isPlaying ? (
                    <Pause className={`w-4 h-4 ${theme.primaryCtaIcon}`} />
                  ) : (
                    <Play className={`w-4 h-4 ml-0.5 ${theme.primaryCtaIcon}`} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext}
                  aria-label="Bài tiếp theo"
                  className={`w-10 h-10 short:w-9 short:h-9 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
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
