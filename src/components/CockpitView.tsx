import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  Suspense,
  useCallback,
} from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Zap,
  Loader2,
  FolderPlus,
  ArrowLeftRight,
  GripVertical,
  Tv,
  Film,
  Radio,
  Music,
  Bell,
  BellOff,
  MapPin,
  Video as CameraIcon,
  AlertTriangle,
  Flag,
  Volume2,
  VolumeX,
  X,
  Search,
  Star,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wifi,
  Maximize2,
  ListVideo,
  Activity,
  Square,
} from 'lucide-react';
import {
  ActiveNavSummary,
  CockpitNavControls,
  MapTheme,
  MusicSource,
  PendingNavTarget,
  RepeatMode,
  SavedPlace,
  StreamData,
  UiScale,
} from '../types';
import { formatSeconds } from '../services/api';
import { LyricsResult } from '../services/lyrics';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';
import {
  TvLiveController,
  getChannelFavKey,
  stripVietnameseTones,
} from '../hooks/useTvLive';
import { MapErrorBoundary } from './MapErrorBoundary';
import { getCarTheme } from '../utils/theme';

const LazyCarCockpitMap = React.lazy(() => import('./CarCockpitMap'));

export interface VideoSlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CockpitViewProps {
  isVisible: boolean;
  isVideoMode: boolean;
  isSoundCloudTrack: boolean;
  musicSource: MusicSource;
  onChangeMusicSource: (source: MusicSource) => void;
  onToggleViewMode: () => void;
  onVideoSlotRectChange: (rect: VideoSlotRect | null) => void;
  onDraggingSplitChange: (dragging: boolean) => void;
  streamData: StreamData;
  isPlaying: boolean;
  isBuffering: boolean;
  displayedTime: number;
  safeDuration: number;
  progressPercent: number;
  remainingTime: number;
  clockTime: string;
  telemetry: CockpitTelemetry;
  lyricsData: LyricsResult | null;
  activeLyricIndex: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpenAddPlaylist: () => void;
  isMixActive: boolean;
  isLoadingMix: boolean;
  onStartAutoMix: () => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: RepeatMode;
  onToggleRepeat: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  onTogglePlay: () => void;
  onScrubStart: () => void;
  onScrubMove: (val: number) => void;
  onScrubCommit: (val: number) => void;
  gestureHandlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
  heartBurst: boolean;
  savedPlaces: SavedPlace[];
  onSavePlace: (place: SavedPlace) => void;
  onRemoveSavedPlace: (id: string) => void;
  syncCode: string;
  incomingNavTarget: PendingNavTarget | null;
  onConsumeIncomingNav: () => void;
  onActiveNavChange: (summary: ActiveNavSummary | null) => void;
  onNotifyToast: (msg: string) => void;
  mapTheme: MapTheme;
  onChangeMapTheme: (theme: MapTheme) => void;
  isLightTheme: boolean;
  tv: TvLiveController;
  cockpitTvMode: boolean;
  onChangeCockpitTvMode: (active: boolean) => void;
  onTvSlotRectChange: (rect: VideoSlotRect | null) => void;
  onPauseMusic: () => void;
  onOpenFullTv: () => void;
  uiScale: UiScale;
  onChangeUiScale: (scale: UiScale) => void;
}

export const CockpitView: React.FC<CockpitViewProps> = React.memo(
  ({
    isVisible,
    isVideoMode,
    isSoundCloudTrack,
    musicSource,
    onChangeMusicSource,
    onToggleViewMode,
    onVideoSlotRectChange,
    onDraggingSplitChange,
    streamData,
    isPlaying,
    isBuffering,
    displayedTime,
    safeDuration,
    progressPercent,
    remainingTime,
    clockTime,
    telemetry,
    lyricsData,
    activeLyricIndex,
    isFavorite,
    onToggleFavorite,
    onOpenAddPlaylist,
    isMixActive,
    isLoadingMix,
    onStartAutoMix,
    isShuffle,
    onToggleShuffle,
    repeatMode,
    onToggleRepeat,
    hasNext,
    hasPrev,
    onNext,
    onPrev,
    onTogglePlay,
    onScrubStart,
    onScrubMove,
    onScrubCommit,
    gestureHandlers,
    heartBurst,
    savedPlaces,
    onSavePlace,
    onRemoveSavedPlace,
    syncCode,
    incomingNavTarget,
    onConsumeIncomingNav,
    onActiveNavChange,
    onNotifyToast,
    mapTheme,
    onChangeMapTheme,
    isLightTheme,
    tv,
    cockpitTvMode,
    onChangeCockpitTvMode,
    onTvSlotRectChange,
    onPauseMusic,
    onOpenFullTv,
    uiScale,
    onChangeUiScale,
  }) => {
    const theme = getCarTheme(isLightTheme);
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const telemetryCardRef = useRef<HTMLDivElement | null>(null);
    const navControlsRef = useRef<CockpitNavControls | null>(null);
    const videoSlotRef = useRef<HTMLDivElement | null>(null);
    const tvSlotRef = useRef<HTMLDivElement | null>(null);
    const badgeTextRef = useRef<HTMLSpanElement | null>(null);
    const rafDragRef = useRef<number | null>(null);
    const isScrubbingRef = useRef<boolean>(false);

    const [cockpitNavSummary, setCockpitNavSummary] = useState<ActiveNavSummary | null>(null);

    // Bảng chọn kênh nhanh ngay trong Cockpit (bộ phát TV dùng chung toàn app -> 0ms reload!)
    const [showTvPicker, setShowTvPicker] = useState<boolean>(false);
    const [tvGroup, setTvGroup] = useState<string>('__popular__');
    const [tvSearch, setTvSearch] = useState<string>('');
    const [tvOnlyLive, setTvOnlyLive] = useState<boolean>(false);
    const [tvFailedLogos, setTvFailedLogos] = useState<Record<string, boolean>>({});

    const handleActiveNavChange = useCallback(
      (summary: ActiveNavSummary | null) => {
        setCockpitNavSummary(summary);
        onActiveNavChange(summary);
      },
      [onActiveNavChange]
    );

    const {
      speedKmh,
      gpsStatus,
      weather,
      roadInfo,
      speedAlertSound,
      onToggleSpeedAlertSound,
      requestGps,
    } = telemetry;

    const speedValue = speedKmh !== null ? speedKmh : 0;
    const activeLimit = roadInfo?.speedLimit ?? null;
    const isOverLimit = activeLimit !== null && speedKmh !== null && speedValue > activeLimit;
    const isDangerOverLimit =
      activeLimit !== null && speedKmh !== null && speedValue >= activeLimit + 5;
    const primaryHazard = roadInfo?.hazards?.[0] ?? null;

    const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);

    const [mapSide, setMapSide] = useState<'left' | 'right'>(() => {
      try {
        const saved = localStorage.getItem('carhub_cockpit_map_side');
        return saved === 'right' ? 'right' : 'left';
      } catch {
        return 'left';
      }
    });

    const [mapWidthPct, setMapWidthPct] = useState<number>(() => {
      try {
        const saved = parseInt(localStorage.getItem('carhub_cockpit_map_pct') || '52', 10);
        if (!isNaN(saved) && saved >= 30 && saved <= 75) return saved;
        return 52;
      } catch {
        return 52;
      }
    });
    const livePctRef = useRef<number>(mapWidthPct);

    const [isMapExpanded, setIsMapExpanded] = useState<boolean>(() => {
      try {
        return localStorage.getItem('carhub_cockpit_map_expanded') === 'true';
      } catch {
        return false;
      }
    });

    // Đóng picker nếu thoát chế độ TV
    useEffect(() => {
      if (!cockpitTvMode) setShowTvPicker(false);
    }, [cockpitTvMode]);

    // Danh sách kênh trong Quick Picker của Cockpit (100% không ẩn kênh nào!)
    const tvBaseChannels = useMemo(() => {
      if (!tv.playlist) return [];
      const q = stripVietnameseTones(tvSearch.trim());
      if (q) {
        return tv.playlist.channels.filter(
          (c) =>
            stripVietnameseTones(c.name).includes(q) ||
            stripVietnameseTones(c.group).includes(q)
        );
      }
      if (tvGroup === '__favorites__') {
        return tv.playlist.channels.filter((c) => tv.favoriteSet.has(getChannelFavKey(c)));
      }
      if (tvGroup === '__popular__') {
        return tv.popularChannels;
      }
      if (tvGroup === '__all__') {
        return tv.playlist.channels;
      }
      return tv.playlist.channels.filter((c) => c.group === tvGroup);
    }, [tv.playlist, tvSearch, tvGroup, tv.favoriteSet, tv.popularChannels]);

    const tvDisplayedChannels = useMemo(() => {
      if (!tvOnlyLive) return tvBaseChannels;
      return tvBaseChannels.filter((c) => tv.pingMap[c.id]?.status === 'live');
    }, [tvBaseChannels, tvOnlyLive, tv.pingMap]);

    const tvPingSummary = useMemo(() => {
      let live = 0;
      let dead = 0;
      for (const c of tvBaseChannels) {
        const s = tv.pingMap[c.id]?.status;
        if (s === 'live') live++;
        else if (s === 'dead') dead++;
      }
      return { live, dead };
    }, [tvBaseChannels, tv.pingMap]);

    // Đồng bộ danh sách chuyển kênh khi đang ở chế độ TV trong Cockpit
    useEffect(() => {
      if (!isVisible || !cockpitTvMode) return;
      const list = tvDisplayedChannels.length > 0 ? tvDisplayedChannels : tvBaseChannels;
      if (list.length > 0) {
        tv.setZapContextList(list);
      }
    }, [isVisible, cockpitTvMode, tvDisplayedChannels, tvBaseChannels, tv]);

    // Tự động Ping nhẹ khi mở bảng chọn kênh TV trong Cockpit
    useEffect(() => {
      if (
        !isVisible ||
        !cockpitTvMode ||
        isMapExpanded ||
        !showTvPicker ||
        !tv.playlist ||
        tvBaseChannels.length === 0
      ) {
        return;
      }
      const isSearching = tvSearch.trim().length > 0;
      const timer = window.setTimeout(() => {
        const limit = tvGroup === '__all__' && !isSearching ? 30 : 40;
        tv.pingChannels(tvBaseChannels.slice(0, limit), false);
      }, isSearching ? 400 : 120);
      return () => window.clearTimeout(timer);
    }, [
      isVisible,
      cockpitTvMode,
      isMapExpanded,
      showTvPicker,
      tv.playlist,
      tvGroup,
      tvSearch,
      tvBaseChannels,
      tv.pingChannels,
    ]);

    const handleCockpitZapTv = useCallback(
      (delta: number) => {
        tv.zapChannel(delta, tvDisplayedChannels.length > 0 ? tvDisplayedChannels : tvBaseChannels);
      },
      [tv, tvDisplayedChannels, tvBaseChannels]
    );

    const effectiveVideoMode = isVideoMode && !isSoundCloudTrack;
    const showVideoSlot = isVisible && effectiveVideoMode && !cockpitTvMode && !isMapExpanded;
    const showTvSlot = isVisible && cockpitTvMode && !showTvPicker && !isMapExpanded;

    // Đo tọa độ chính xác của khung Video 16:9 YouTube và đồng bộ trước khi vẽ frame (0 giật!)
    const syncVideoSlotRect = useCallback(() => {
      if (!showVideoSlot || !videoSlotRef.current) {
        onVideoSlotRectChange(null);
        return;
      }
      const r = videoSlotRef.current.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        onVideoSlotRectChange({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      } else {
        onVideoSlotRectChange(null);
      }
    }, [showVideoSlot, onVideoSlotRectChange]);

    // Đo tọa độ chính xác của khung TV Live duy nhất trong Cockpit (0ms reload khi chuyển TV Live <-> Cockpit!)
    const syncTvSlotRect = useCallback(() => {
      if (!showTvSlot || !tvSlotRef.current) {
        onTvSlotRectChange(null);
        return;
      }
      const r = tvSlotRef.current.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        onTvSlotRectChange({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      } else {
        onTvSlotRectChange(null);
      }
    }, [showTvSlot, onTvSlotRectChange]);

    useLayoutEffect(() => {
      syncVideoSlotRect();
      if (!showVideoSlot) return;

      const rafId = window.requestAnimationFrame(syncVideoSlotRect);
      const t1 = window.setTimeout(syncVideoSlotRect, 120);

      const slotEl = videoSlotRef.current;
      const containerEl = splitContainerRef.current;
      const telemetryEl = telemetryCardRef.current;
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => syncVideoSlotRect());
        if (slotEl) ro.observe(slotEl);
        if (containerEl) ro.observe(containerEl);
        if (telemetryEl) ro.observe(telemetryEl);
      }

      window.addEventListener('resize', syncVideoSlotRect);
      window.visualViewport?.addEventListener('resize', syncVideoSlotRect);
      containerEl?.addEventListener('scroll', syncVideoSlotRect, { passive: true });

      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(t1);
        ro?.disconnect();
        window.removeEventListener('resize', syncVideoSlotRect);
        window.visualViewport?.removeEventListener('resize', syncVideoSlotRect);
        containerEl?.removeEventListener('scroll', syncVideoSlotRect);
      };
    }, [
      showVideoSlot,
      mapSide,
      mapWidthPct,
      activeLimit,
      primaryHazard?.label,
      Boolean(cockpitNavSummary),
      cockpitNavSummary?.isRouteOverview,
      syncVideoSlotRect,
    ]);

    useLayoutEffect(() => {
      syncTvSlotRect();
      if (!showTvSlot) return;

      const rafId = window.requestAnimationFrame(syncTvSlotRect);
      const t1 = window.setTimeout(syncTvSlotRect, 120);

      const slotEl = tvSlotRef.current;
      const containerEl = splitContainerRef.current;
      const telemetryEl = telemetryCardRef.current;
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => syncTvSlotRect());
        if (slotEl) ro.observe(slotEl);
        if (containerEl) ro.observe(containerEl);
        if (telemetryEl) ro.observe(telemetryEl);
      }

      window.addEventListener('resize', syncTvSlotRect);
      window.visualViewport?.addEventListener('resize', syncTvSlotRect);
      containerEl?.addEventListener('scroll', syncTvSlotRect, { passive: true });

      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(t1);
        ro?.disconnect();
        window.removeEventListener('resize', syncTvSlotRect);
        window.visualViewport?.removeEventListener('resize', syncTvSlotRect);
        containerEl?.removeEventListener('scroll', syncTvSlotRect);
      };
    }, [
      showTvSlot,
      mapSide,
      mapWidthPct,
      activeLimit,
      primaryHazard?.label,
      Boolean(cockpitNavSummary),
      cockpitNavSummary?.isRouteOverview,
      syncTvSlotRect,
    ]);

    useEffect(() => {
      return () => {
        onVideoSlotRectChange(null);
        onTvSlotRectChange(null);
      };
    }, [onVideoSlotRectChange, onTvSlotRectChange]);

    useEffect(() => {
      onDraggingSplitChange(isDraggingSplit);
    }, [isDraggingSplit, onDraggingSplitChange]);

    useEffect(() => {
      livePctRef.current = mapWidthPct;
      if (splitContainerRef.current) {
        splitContainerRef.current.style.setProperty('--map-pct', `${mapWidthPct}%`);
      }
      try {
        localStorage.setItem('carhub_cockpit_map_pct', String(mapWidthPct));
      } catch {}
    }, [mapWidthPct]);

    useEffect(() => {
      try {
        localStorage.setItem('carhub_cockpit_map_side', mapSide);
      } catch {}
    }, [mapSide]);

    useEffect(() => {
      try {
        localStorage.setItem('carhub_cockpit_map_expanded', String(isMapExpanded));
      } catch {}
    }, [isMapExpanded]);

    const toggleMapSide = useCallback(() => {
      setMapSide((prev) => (prev === 'left' ? 'right' : 'left'));
    }, []);

    const handleToggleExpandMap = useCallback(() => {
      setIsMapExpanded((v) => !v);
    }, []);

    // Kéo thả 60fps siêu mượt: Cập nhật biến CSS + tọa độ Video/TV 16:9 trực tiếp trên DOM (0 lần re-render React!)
    const updateSplitFromClientX = useCallback(
      (clientX: number) => {
        const container = splitContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) return;

        const rawPct =
          mapSide === 'left'
            ? ((clientX - rect.left) / rect.width) * 100
            : ((rect.right - clientX) / rect.width) * 100;

        const clamped = Math.round(Math.max(30, Math.min(75, rawPct)));
        livePctRef.current = clamped;

        if (rafDragRef.current !== null) return;
        rafDragRef.current = window.requestAnimationFrame(() => {
          rafDragRef.current = null;
          const pct = livePctRef.current;
          container.style.setProperty('--map-pct', `${pct}%`);
          if (badgeTextRef.current) {
            badgeTextRef.current.textContent = `Bản đồ ${pct}% • ${
              cockpitTvMode ? 'TV Live' : isVideoMode ? 'Video' : 'Nhạc'
            } ${100 - pct}%`;
          }
          syncVideoSlotRect();
          syncTvSlotRect();
        });
      },
      [mapSide, isVideoMode, cockpitTvMode, syncVideoSlotRect, syncTvSlotRect]
    );

    const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      setIsDraggingSplit(true);
    };

    const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingSplit) return;
      e.preventDefault();
      updateSplitFromClientX(e.clientX);
    };

    const finishDividerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingSplit) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      if (rafDragRef.current !== null) {
        window.cancelAnimationFrame(rafDragRef.current);
        rafDragRef.current = null;
      }
      setIsDraggingSplit(false);
      setMapWidthPct(livePctRef.current);
      window.requestAnimationFrame(() => {
        syncVideoSlotRect();
        syncTvSlotRect();
      });
    };

    const commitScrubOnce = (val: number) => {
      if (!isScrubbingRef.current) return;
      isScrubbingRef.current = false;
      onScrubCommit(val);
    };

    const currentLyricText =
      lyricsData?.isSynced && activeLyricIndex >= 0
        ? lyricsData.lines[activeLyricIndex]?.text
        : lyricsData && !lyricsData.isSynced && lyricsData.lines.length > 0
        ? lyricsData.lines[0]?.text
        : null;

    const nextLyricText =
      lyricsData?.isSynced && activeLyricIndex >= 0
        ? lyricsData.lines[activeLyricIndex + 1]?.text
        : null;

    const isCurrentTvFav = tv.activeChannel
      ? tv.favoriteSet.has(getChannelFavKey(tv.activeChannel))
      : false;
    const activeTvPing = tv.activeChannel ? tv.pingMap[tv.activeChannel.id] : undefined;

    return (
      <div
        ref={splitContainerRef}
        style={{ '--map-pct': `${mapWidthPct}%` } as React.CSSProperties}
        className={`${
          isVisible ? 'flex' : 'hidden'
        } relative flex-1 min-h-0 h-full w-full max-w-[1960px] mx-auto overflow-y-auto car:overflow-hidden no-scrollbar ${
          isMapExpanded
            ? 'flex-col gap-2'
            : `flex-col ${
                mapSide === 'right' ? 'car:flex-row-reverse' : 'car:flex-row'
              } gap-2.5 car:gap-0 items-stretch`
        }`}
      >
        {/* Nhãn % trực quan giữa màn hình khi đang kéo */}
        {isDraggingSplit && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-emerald-500 text-black text-xs font-black shadow-2xl pointer-events-none">
            <span ref={badgeTextRef}>
              Bản đồ {livePctRef.current}% •{' '}
              {cockpitTvMode ? 'TV Live' : isVideoMode ? 'Video' : 'Nhạc'}{' '}
              {100 - livePctRef.current}%
            </span>
          </div>
        )}

        {/* =====================================================================
            1. KHUNG BẢN ĐỒ 3D DẪN ĐƯỜNG & HUD TỐC ĐỘ
           ===================================================================== */}
        <div
          className={`relative ${isDraggingSplit ? 'pointer-events-none select-none' : ''} ${
            isMapExpanded
              ? 'flex-1 min-h-[300px] car:min-h-0 w-full h-full'
              : 'w-full car:w-[var(--map-pct)] shrink-0 min-h-[320px] car:min-h-0 h-full'
          }`}
        >
          <MapErrorBoundary isLightTheme={isLightTheme}>
            <Suspense
              fallback={
                <div
                  className={`w-full h-full min-h-[220px] rounded-3xl border flex flex-col items-center justify-center gap-2 ${theme.card}`}
                >
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  <span className={`text-xs font-bold ${theme.textSub}`}>
                    Đang khởi tạo Bản đồ 3D Cockpit VF5...
                  </span>
                </div>
              }
            >
              <LazyCarCockpitMap
                telemetry={telemetry}
                clockTime={clockTime}
                isVisible={isVisible}
                isMapExpanded={isMapExpanded}
                onToggleExpandMap={handleToggleExpandMap}
                mapSide={mapSide}
                onToggleMapSide={toggleMapSide}
                mapWidthPct={mapWidthPct}
                onChangeMapWidthPct={setMapWidthPct}
                mapTheme={mapTheme}
                onChangeMapTheme={onChangeMapTheme}
                suppressResizeObserver={isDraggingSplit}
                savedPlaces={savedPlaces}
                onSavePlace={onSavePlace}
                onRemoveSavedPlace={onRemoveSavedPlace}
                syncCode={syncCode}
                incomingNavTarget={incomingNavTarget}
                onConsumeIncomingNav={onConsumeIncomingNav}
                onActiveNavChange={handleActiveNavChange}
                navControlsRef={navControlsRef}
                onNotifyToast={onNotifyToast}
                uiScale={uiScale}
                onChangeUiScale={onChangeUiScale}
              />
            </Suspense>
          </MapErrorBoundary>
        </div>

        {/* =====================================================================
            2. TAY NẮM KÉO TỈ LỆ CẢM ỨNG RỘNG (44px hit-zone, 60fps không giật!)
           ===================================================================== */}
        {!isMapExpanded && (
          <div className="hidden car:flex relative z-30 items-center justify-center w-3 shrink-0 select-none">
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Kéo trái phải để chỉnh tỉ lệ Bản đồ và Nhạc, chạm đúp để đổi bên"
              title="Kéo trái/phải để chỉnh độ rộng • Chạm đúp để đổi bên"
              onPointerDown={handleDividerPointerDown}
              onPointerMove={handleDividerPointerMove}
              onPointerUp={finishDividerDrag}
              onPointerCancel={finishDividerDrag}
              onDoubleClick={toggleMapSide}
              className="absolute inset-y-10 -inset-x-4 flex items-center justify-center cursor-col-resize select-none touch-none group"
            >
              <div
                className={`w-5 h-14 shrink-0 rounded-full border flex items-center justify-center shadow-xl transition-transform ${
                  isDraggingSplit
                    ? 'bg-emerald-500 border-white text-white scale-110'
                    : isLightTheme
                    ? 'bg-white/95 group-hover:bg-slate-100 border-slate-300 text-slate-600'
                    : 'bg-black/85 group-hover:bg-white/20 border-white/30 text-white/80'
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            3. KHUNG GIẢI TRÍ COCKPIT (Cấu trúc 3 tầng cố định cân đối chuẩn CarPlay — đổi Nhạc ↔ Video ↔ TV 0 giật!)
           ===================================================================== */}
        {isMapExpanded ? (
          cockpitTvMode && tv.activeChannel ? (
            <div
              className={`shrink-0 rounded-2xl border px-3 py-2 flex items-center justify-between gap-2.5 ${theme.cardElevated}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 p-1 ${
                    isLightTheme ? 'bg-slate-900 border-slate-300' : 'bg-black/60 border-white/15'
                  }`}
                >
                  {tv.activeChannel.logo && !tvFailedLogos[tv.activeChannel.id] ? (
                    <img
                      src={tv.activeChannel.logo}
                      alt={tv.activeChannel.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-sky-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black shrink-0">
                      {tv.activeChannel.isRadio ? 'FM' : 'LIVE'}
                    </span>
                    <h4 className={`text-xs sm:text-sm font-extrabold truncate ${theme.text}`}>
                      {tv.activeChannel.name}
                    </h4>
                  </div>
                  <p className={`text-[11px] font-bold truncate ${theme.textSub}`}>
                    {tv.activeChannel.group} • {tv.playerStatus.isPlaying ? 'Đang phát nền' : 'Đã tạm dừng'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCockpitZapTv(-1)}
                  aria-label="Kênh trước"
                  className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 ${theme.iconBtn}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => tv.togglePlay(onPauseMusic)}
                  aria-label={tv.playerStatus.isPlaying ? 'Tạm dừng TV' : 'Phát TV'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 ${theme.primaryCta}`}
                >
                  {tv.playerStatus.isPlaying ? (
                    <Pause className={`w-4 h-4 ${theme.primaryCtaIcon}`} />
                  ) : (
                    <Play className={`w-4 h-4 ml-0.5 ${theme.primaryCtaIcon}`} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleCockpitZapTv(1)}
                  aria-label="Kênh sau"
                  className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 ${theme.iconBtn}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleExpandMap}
                  className="min-h-[36px] px-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold active:scale-95 transition"
                >
                  Mở hình TV
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCockpitTvMode(false)}
                  className={`hidden sm:inline-flex items-center min-h-[36px] px-3 rounded-full border text-xs font-bold active:scale-95 transition ${theme.iconBtn}`}
                >
                  Nhạc
                </button>
              </div>
            </div>
          ) : (
            <div
              {...gestureHandlers}
              className={`shrink-0 rounded-2xl border px-3 py-2 flex items-center justify-between gap-3 ${theme.cardElevated}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className="w-10 h-10 rounded-xl object-cover shrink-0 bg-black"
                />
                <div className="min-w-0">
                  <h4 className={`text-xs sm:text-sm font-extrabold truncate ${theme.text}`}>
                    {streamData.title}
                  </h4>
                  <p
                    className={`text-[11px] font-bold truncate ${
                      isLightTheme ? 'text-emerald-700' : 'text-emerald-300'
                    }`}
                  >
                    {currentLyricText ? `♪ ${currentLyricText}` : streamData.uploader}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  aria-label="Bài trước"
                  className={`w-9 h-9 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 ${theme.iconBtn}`}
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                  className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 ${theme.primaryCta}`}
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
                  className={`w-9 h-9 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 ${theme.iconBtn}`}
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          )
        ) : (
          <div
            className={`cockpit-pane-cq flex-1 min-w-0 car:min-h-0 car:h-full flex flex-col ultrawide:flex-row gap-2 short:gap-1.5 ${
              isDraggingSplit ? 'pointer-events-none select-none' : ''
            }`}
          >
            {/* =================================================================
                3A. THẺ THÔNG SỐ LÁI XE (TỐC ĐỘ • CẢNH BÁO P.127 • ĐỊA ĐIỂM • THỜI TIẾT • GIỜ • DẪN ĐƯỜNG)
                (Trên màn dài Ultrawide tự tách thành cột riêng thoáng rộng!)
               ================================================================= */}
            <div
              ref={telemetryCardRef}
              onClick={gpsStatus !== 'active' ? requestGps : undefined}
              className={`shrink-0 ultrawide:w-[19rem] ultrawide:h-full ultrawide:flex ultrawide:flex-col ultrawide:justify-between rounded-2xl sm:rounded-3xl border px-3 py-2 short:px-2.5 short:py-1.5 transition-colors ${
                isDangerOverLimit
                  ? 'bg-rose-600 border-rose-300 ring-2 ring-rose-400/70 shadow-2xl'
                  : theme.cardElevated
              } ${
                gpsStatus !== 'active'
                  ? isLightTheme
                    ? 'cursor-pointer hover:bg-white'
                    : 'cursor-pointer hover:bg-white/[0.11]'
                  : ''
              }`}
            >
              {/* Hàng 1: Tốc độ + Biển P.127 (trái)  <--->  Giờ + Thời tiết (phải) */}
              <div className="flex items-center justify-between gap-2 min-h-[2.75rem]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-3xl sm:text-4xl short:text-3xl font-black tabular-nums tracking-tighter leading-none ${
                          isDangerOverLimit
                            ? 'text-white'
                            : speedKmh === null
                            ? theme.text
                            : isOverLimit
                            ? isLightTheme
                              ? 'text-amber-600'
                              : 'text-amber-300'
                            : isLightTheme
                            ? 'text-emerald-700'
                            : 'text-emerald-300'
                        }`}
                      >
                        {speedKmh !== null ? speedKmh : '0'}
                      </span>
                      <span
                        className={`text-[0.65rem] font-black tracking-tight ${
                          isDangerOverLimit ? 'text-rose-100' : theme.textMuted
                        }`}
                      >
                        KM/H
                      </span>
                    </div>

                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          gpsStatus === 'active'
                            ? isDangerOverLimit
                              ? 'bg-white animate-ping'
                              : 'bg-emerald-500'
                            : 'bg-amber-500 animate-pulse'
                        }`}
                      />
                      <span
                        className={`text-[0.65rem] font-extrabold uppercase tracking-wider cq-hide-xs whitespace-nowrap ${
                          isDangerOverLimit ? 'text-white' : theme.textSub
                        }`}
                      >
                        {gpsStatus === 'active'
                          ? isDangerOverLimit
                            ? 'QUÁ TỐC!'
                            : 'GPS'
                          : 'Bật GPS'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSpeedAlertSound();
                        }}
                        aria-label="Bật hoặc tắt chuông cảnh báo quá tốc độ"
                        title={
                          speedAlertSound
                            ? 'Đang bật chuông cảnh báo tốc độ'
                            : 'Đang tắt chuông cảnh báo tốc độ'
                        }
                        className={`w-6 h-6 -my-1 rounded-full flex items-center justify-center active:scale-90 transition ${
                          isDangerOverLimit
                            ? 'text-white'
                            : speedAlertSound
                            ? isLightTheme
                              ? 'text-emerald-700 hover:text-emerald-800'
                              : 'text-emerald-300 hover:text-emerald-200'
                            : theme.textDim
                        }`}
                      >
                        {speedAlertSound ? (
                          <Bell className="w-3.5 h-3.5" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Biển báo giới hạn tốc độ P.127 */}
                  {activeLimit !== null && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className={`w-11 h-11 short:w-10 short:h-10 rounded-full bg-white text-slate-950 border-[3.5px] border-[#e11d48] flex items-center justify-center shadow-md ${
                          isDangerOverLimit ? 'scale-105 ring-2 ring-white animate-pulse' : ''
                        }`}
                      >
                        <span className="text-sm font-black tracking-tighter leading-none">
                          {activeLimit}
                        </span>
                      </div>
                      <span
                        className={`cq-hide-md text-[0.62rem] font-extrabold uppercase leading-tight ${
                          isDangerOverLimit
                            ? 'text-white'
                            : roadInfo?.isVerifiedLimit
                            ? isLightTheme
                              ? 'text-emerald-700'
                              : 'text-emerald-300'
                            : isLightTheme
                            ? 'text-amber-700'
                            : 'text-amber-300'
                        }`}
                      >
                        {roadInfo?.isVerifiedLimit ? 'OSM' : 'T.Khảo'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Cụm Đồng hồ + Thời tiết góc phải */}
                <div className="flex flex-col items-end justify-center shrink-0 text-right">
                  <span
                    className={`text-xl sm:text-2xl short:text-xl font-mono font-black tracking-tight leading-none tabular-nums ${
                      isDangerOverLimit ? 'text-white' : theme.text
                    }`}
                  >
                    {clockTime}
                  </span>
                  <div
                    className={`flex items-center gap-1 mt-1 text-xs font-extrabold leading-none ${
                      isDangerOverLimit
                        ? 'text-rose-100'
                        : weather?.isRainy
                        ? isLightTheme
                          ? 'text-blue-700'
                          : 'text-sky-300'
                        : theme.textSub
                    }`}
                  >
                    {weather ? (
                      <>
                        <span>{weather.icon}</span>
                        <span className="tabular-nums">{weather.temperature}°C</span>
                        <span
                          className={`cq-hide-md font-bold truncate max-w-[6.5rem] ${
                            isDangerOverLimit ? 'text-rose-100' : theme.textMuted
                          }`}
                        >
                          • {weather.label}
                        </span>
                      </>
                    ) : (
                      <span className={`font-bold ${isDangerOverLimit ? 'text-rose-100' : theme.textMuted}`}>
                        VF5 HUD
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Hàng 2: Vị trí hiện tại (tên đường, quốc lộ, số làn) + Cảnh báo Camera phạt nguội */}
              <div
                className={`mt-1.5 pt-1.5 border-t flex items-center justify-between gap-1.5 min-w-0 ${
                  isDangerOverLimit ? 'border-white/25' : theme.divider
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <MapPin
                    className={`w-4 h-4 shrink-0 ${
                      isDangerOverLimit
                        ? 'text-white'
                        : gpsStatus === 'active'
                        ? isLightTheme
                          ? 'text-emerald-600'
                          : 'text-emerald-400'
                        : 'text-amber-500'
                    }`}
                  />
                  {roadInfo?.roadRef && (
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[0.65rem] font-black shrink-0 leading-none ${
                        isDangerOverLimit
                          ? 'bg-white/20 border-white/40 text-white'
                          : isLightTheme
                          ? 'bg-blue-100 border-blue-300 text-blue-900'
                          : 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                      }`}
                    >
                      {roadInfo.roadRef}
                    </span>
                  )}
                  <span
                    className={`text-xs sm:text-sm font-extrabold truncate ${
                      isDangerOverLimit ? 'text-white' : theme.text
                    }`}
                  >
                    {roadInfo?.roadName ||
                      (gpsStatus === 'active'
                        ? 'Đang dò tên đường...'
                        : 'Chạm để bật GPS & cảnh báo tốc độ')}
                  </span>
                  {roadInfo?.lanes && (
                    <span
                      className={`cq-hide-sm text-[0.7rem] font-bold shrink-0 ${
                        isDangerOverLimit ? 'text-rose-100' : theme.textMuted
                      }`}
                    >
                      • {roadInfo.lanes} làn
                    </span>
                  )}
                </div>

                {primaryHazard && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[0.68rem] font-black flex items-center gap-1 shrink-0 border shadow ${
                      primaryHazard.type === 'camera'
                        ? 'bg-rose-600 border-rose-300 text-white animate-pulse'
                        : 'bg-amber-500 border-amber-200 text-slate-950'
                    }`}
                  >
                    {primaryHazard.type === 'camera' ? (
                      <CameraIcon className="w-3 h-3 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                    )}
                    <span className="truncate max-w-[8rem]">{primaryHazard.label}</span>
                  </span>
                )}
              </div>

              {/* Hàng 3 (Chỉ hiện khi đang Dẫn đường): Thẻ hướng dẫn rẽ, đích đến & nút điều khiển chỉ đường */}
              {cockpitNavSummary && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`mt-1.5 rounded-xl border px-2.5 py-2 flex flex-col gap-1.5 shadow-inner ${
                    isLightTheme
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-sky-600/35 border-sky-400/55 text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      {cockpitNavSummary.isRerouting ? (
                        <p className="text-xs sm:text-sm font-black text-amber-200 flex items-center gap-1.5">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          <span className="truncate">Đang tính lại đường đi mới...</span>
                        </p>
                      ) : (
                        <p className="text-xs sm:text-sm font-black text-white leading-snug line-clamp-1">
                          {cockpitNavSummary.nextArrow} {cockpitNavSummary.nextInstruction}
                          {cockpitNavSummary.nextDistM > 0
                            ? ` (${cockpitNavSummary.nextDistM}m)`
                            : ''}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-xs font-bold text-sky-100 truncate mt-0.5">
                        <Flag className="w-3.5 h-3.5 shrink-0 text-sky-200" />
                        <span className="truncate">
                          {cockpitNavSummary.destinationName} • {cockpitNavSummary.remainingKm} km (
                          {cockpitNavSummary.remainingMin}p)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {cockpitNavSummary.isRouteOverview && (
                        <button
                          type="button"
                          onClick={() => navControlsRef.current?.startGuidanceFollow()}
                          title="Bắt đầu dẫn đường (Bám mũi xe 3D)"
                          className="min-h-[2.25rem] px-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black flex items-center gap-1 shadow active:scale-95 transition"
                        >
                          <Play className="w-3.5 h-3.5 fill-slate-950 shrink-0" />
                          <span className="cq-hide-sm">Bắt đầu</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => navControlsRef.current?.toggleVoiceNav()}
                        aria-label="Bật hoặc tắt giọng nói chỉ đường"
                        title={
                          cockpitNavSummary.voiceNavEnabled
                            ? 'Đang bật giọng nói chỉ đường'
                            : 'Đang tắt giọng nói chỉ đường'
                        }
                        className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition ${
                          cockpitNavSummary.voiceNavEnabled
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-white/20 text-white/80 hover:bg-white/30'
                        }`}
                      >
                        {cockpitNavSummary.voiceNavEnabled ? (
                          <Volume2 className="w-4 h-4" />
                        ) : (
                          <VolumeX className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => navControlsRef.current?.cancelRoute()}
                        aria-label="Hủy lộ trình dẫn đường"
                        title="Hủy lộ trình"
                        className="w-9 h-9 rounded-full bg-white/20 hover:bg-rose-500 text-white flex items-center justify-center active:scale-90 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* =================================================================
                3B. KHUNG GIẢI TRÍ NHẠC / VIDEO / TV LIVE (Cấu trúc 3 tầng cố định cân đối chuẩn CarPlay)
               ================================================================= */}
            <div
              {...(cockpitTvMode ? {} : gestureHandlers)}
              className={`flex-1 min-w-0 min-h-[250px] car:min-h-0 rounded-2xl sm:rounded-3xl border p-3 sm:p-3.5 short:p-2 vshort:p-1.5 flex flex-col justify-between gap-2 short:gap-1.5 vshort:gap-1 relative overflow-hidden ${theme.card}`}
            >
              {heartBurst && !cockpitTvMode && (
                <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/15">
                  <Heart className="w-20 h-20 text-rose-500 fill-rose-500 animate-ping" />
                </div>
              )}

              {/* TẦNG 1 (CỐ ĐỊNH): THANH CHUYỂN NHẠC / VIDEO / TV + HÀNH ĐỘNG NHANH (Cỡ nút chuẩn ô tô >= 40px) */}
              <div className="flex items-center justify-between gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Segmented Switch iOS: Nhạc | Video | TV */}
                  <div
                    className={`inline-flex items-center p-0.5 rounded-full border shrink-0 ${theme.segTrack}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCockpitTvMode(false);
                        setShowTvPicker(false);
                        if (isVideoMode) onToggleViewMode();
                      }}
                      aria-label="Chế độ Nghe nhạc và Lời bài hát"
                      className={`min-h-[2.2rem] px-2.5 rounded-full text-xs font-extrabold flex items-center gap-1 transition-colors ${
                        !cockpitTvMode && !effectiveVideoMode ? theme.segActive : theme.segIdle
                      }`}
                    >
                      <Music className="w-3.5 h-3.5 shrink-0" />
                      <span>Nhạc</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCockpitTvMode(false);
                        setShowTvPicker(false);
                        if (isSoundCloudTrack) {
                          onChangeMusicSource('youtube');
                          if (!isVideoMode) onToggleViewMode();
                        } else if (!isVideoMode) {
                          onToggleViewMode();
                        }
                      }}
                      aria-label="Chế độ Phát Video YouTube"
                      className={`min-h-[2.2rem] px-2.5 rounded-full text-xs font-extrabold flex items-center gap-1 transition-colors ${
                        !cockpitTvMode && effectiveVideoMode
                          ? isLightTheme
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-sky-400 text-slate-950 shadow-sm'
                          : theme.segIdle
                      }`}
                    >
                      <Film className="w-3.5 h-3.5 shrink-0" />
                      <span>Video</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCockpitTvMode(true);
                        onPauseMusic();
                      }}
                      aria-label="Chế độ Xem TV & Radio trực tiếp ngay trong Cockpit"
                      className={`min-h-[2.2rem] px-2.5 rounded-full text-xs font-extrabold flex items-center gap-1 transition-colors ${
                        cockpitTvMode
                          ? 'bg-rose-600 text-white shadow-sm'
                          : theme.segIdle
                      }`}
                    >
                      <Tv className="w-3.5 h-3.5 shrink-0" />
                      <span>TV</span>
                    </button>
                  </div>

                  {/* Khi ở Nhạc/Video: Nút đổi nhanh nguồn YouTube <-> SoundCloud */}
                  {!cockpitTvMode && (
                    <button
                      type="button"
                      onClick={() =>
                        onChangeMusicSource(musicSource === 'soundcloud' ? 'youtube' : 'soundcloud')
                      }
                      title={
                        musicSource === 'soundcloud'
                          ? 'Đang dùng nguồn SoundCloud • Bấm để đổi sang YouTube'
                          : 'Đang dùng nguồn YouTube • Bấm để đổi sang SoundCloud'
                      }
                      className={`min-h-[2.2rem] px-2.5 rounded-full border text-xs font-black flex items-center gap-1 shrink-0 active:scale-95 transition ${
                        musicSource === 'soundcloud' || isSoundCloudTrack
                          ? 'bg-[#ff5500] border-orange-400 text-white shadow-sm'
                          : theme.iconBtn
                      }`}
                    >
                      <span>
                        {musicSource === 'soundcloud' || isSoundCloudTrack ? '☁️ SC' : '▶ YT'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Nhóm nút hành động bên phải */}
                {cockpitTvMode ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowTvPicker((v) => !v)}
                      aria-label="Mở danh sách chọn kênh TV nhanh"
                      title="Chọn kênh TV & xem Ping Live"
                      className={`min-h-[2.25rem] px-2.5 rounded-full border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${
                        showTvPicker
                          ? isLightTheme
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-sky-400 border-sky-300 text-slate-950 shadow-sm'
                          : theme.iconBtn
                      }`}
                    >
                      <ListVideo className="w-4 h-4 shrink-0" />
                      <span className="cq-hide-xs">Kênh</span>
                    </button>

                    {tv.activeChannel && (
                      <button
                        type="button"
                        onClick={() => tv.toggleFavoriteChannel(tv.activeChannel!)}
                        aria-label={isCurrentTvFav ? 'Bỏ yêu thích kênh' : 'Lưu kênh yêu thích'}
                        title={isCurrentTvFav ? 'Bỏ khỏi Yêu thích' : 'Lưu kênh Yêu thích'}
                        className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${
                          isCurrentTvFav
                            ? 'bg-amber-400 border-amber-400 text-slate-950'
                            : theme.iconBtn
                        }`}
                      >
                        <Star className={`w-4 h-4 ${isCurrentTvFav ? 'fill-slate-950' : ''}`} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onOpenFullTv}
                      aria-label="Mở màn hình TV Live đầy đủ"
                      title="Mở toàn bộ trang TV Live"
                      className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${
                        isLightTheme
                          ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-sky-300'
                      }`}
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={toggleMapSide}
                      aria-label="Đổi vị trí Trái Phải giữa TV và Bản đồ"
                      title="Đổi bên Trái / Phải với Bản đồ"
                      className={`hidden car:flex cq-hide-sm w-9 h-9 rounded-full border items-center justify-center active:scale-90 transition ${
                        isLightTheme
                          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-emerald-300'
                      }`}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={toggleMapSide}
                      aria-label="Đổi vị trí Trái Phải giữa Nhạc và Bản đồ"
                      title="Đổi bên Trái / Phải với Bản đồ"
                      className={`hidden car:flex cq-hide-sm w-9 h-9 rounded-full border items-center justify-center active:scale-90 transition ${
                        isLightTheme
                          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-700'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-emerald-300'
                      }`}
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={onStartAutoMix}
                      disabled={isLoadingMix}
                      aria-label="Phát đài nhạc tương tự bài này"
                      title="Phát liên hoàn bài tương tự (Auto-Mix)"
                      className={`cq-hide-xs w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${
                        isMixActive
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow'
                          : isLightTheme
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-amber-200'
                      }`}
                    >
                      {isLoadingMix ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4 fill-current" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={onOpenAddPlaylist}
                      aria-label="Lưu vào Playlist"
                      title="Lưu vào Playlist"
                      className={`cq-hide-sm w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={onToggleFavorite}
                      aria-label={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu yêu thích'}
                      title={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${
                        isFavorite
                          ? isLightTheme
                            ? 'bg-rose-50 border-rose-300 text-rose-600'
                            : 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                          : theme.iconBtn
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFavorite ? (isLightTheme ? 'fill-rose-600' : 'fill-rose-400') : ''
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* TẦNG 2 (TRUNG TÂM CÂN ĐỐI TỈ LỆ): TV LIVE (hoặc Bảng chọn kênh TV) / VIDEO 16:9 / ALBUM + KARAOKE */}
              {cockpitTvMode ? (
                <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                  {/* Khung neo sân khấu TV (Bộ phát TV duy nhất khớp 100% khung này — 0ms reload khi chuyển TV Live <-> Cockpit!) */}
                  {!showTvPicker && (
                    <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                      <div
                        ref={tvSlotRef}
                        aria-label="Khung phát Truyền hình & Radio trực tiếp trong Cockpit"
                        className={`relative h-[180px] xs:h-[205px] car:h-auto car:flex-1 car:min-h-0 w-full rounded-2xl overflow-hidden bg-black border ${
                          isLightTheme ? 'border-slate-300' : 'border-white/12'
                        }`}
                      >
                        {tv.isLoadingPlaylist && !tv.activeChannel && (
                          <div className="absolute inset-0 bg-black/75 rounded-2xl flex flex-col items-center justify-center gap-1.5">
                            <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                            <span className="text-xs font-bold text-white/90">
                              Đang nạp danh sách 524 kênh TV...
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tên kênh + trạng thái Ping Live (chạm vào để mở danh sách kênh nhanh!) */}
                      <button
                        type="button"
                        onClick={() => setShowTvPicker(true)}
                        className={`shrink-0 w-full min-h-[2.75rem] rounded-xl border px-3 py-1.5 flex items-center justify-between gap-2 text-left active:scale-[0.99] transition ${theme.well}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[0.65rem] font-black uppercase shrink-0">
                              {tv.activeChannel?.isVod
                                ? 'PHIM'
                                : tv.activeChannel?.isRadio
                                ? 'FM'
                                : 'LIVE'}
                            </span>
                            <span className={`text-sm font-extrabold truncate ${theme.text}`}>
                              {tv.activeChannel?.name || 'Chạm để chọn kênh TV'}
                            </span>
                          </div>
                          <p className={`text-xs font-semibold truncate mt-0.5 ${theme.textSub}`}>
                            {tv.activeChannel
                              ? `${tv.activeChannel.group}${
                                  tv.activeChannel.manifestType === 'mpd' ? ' • MPD' : ''
                                } • ${tv.playerStatus.streamMode === 'proxy' ? 'Proxy' : 'CDN'}`
                              : '524 kênh TV & Radio sẵn sàng'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {activeTvPing && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.68rem] font-mono font-extrabold ${
                                activeTvPing.status === 'live'
                                  ? isLightTheme
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
                                  : activeTvPing.status === 'dead'
                                  ? isLightTheme
                                    ? 'bg-rose-50 border-rose-300 text-rose-700'
                                    : 'bg-rose-500/20 border-rose-400/45 text-rose-300'
                                  : isLightTheme
                                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                                  : 'bg-sky-500/20 border-sky-400/45 text-sky-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  activeTvPing.status === 'live'
                                    ? 'bg-emerald-500'
                                    : activeTvPing.status === 'dead'
                                    ? 'bg-rose-500'
                                    : 'bg-sky-400 animate-ping'
                                }`}
                              />
                              <span>
                                {activeTvPing.status === 'live'
                                  ? activeTvPing.latencyMs
                                    ? `${activeTvPing.latencyMs}ms`
                                    : 'Live'
                                  : activeTvPing.status === 'dead'
                                  ? 'Off'
                                  : '...'}
                              </span>
                            </span>
                          )}
                          <span className={`text-xs font-extrabold ${theme.textMuted}`}>▾</span>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Bảng chọn kênh nhanh ngay trong Cockpit (đủ 100% kênh + đèn Ping Live/Off!) */}
                  {showTvPicker && (
                    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
                      {/* Tìm nhanh + Ping + Chỉ Live + Đóng */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="relative flex-1 min-w-0">
                          <Search
                            className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textMuted}`}
                          />
                          <input
                            type="search"
                            value={tvSearch}
                            onChange={(e) => setTvSearch(e.target.value)}
                            placeholder="Tìm VTV, VOV, TV360..."
                            className={`w-full h-10 pl-9 pr-8 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
                          />
                          {tvSearch && (
                            <button
                              type="button"
                              onClick={() => setTvSearch('')}
                              className={`w-7 h-7 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${theme.textMuted}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setTvOnlyLive((v) => !v)}
                          title="Chỉ lọc kênh đang Live (mặc định tắt để hiện 100% kênh)"
                          className={`min-h-[2.45rem] px-2.5 rounded-xl border text-xs font-extrabold shrink-0 active:scale-95 transition ${
                            tvOnlyLive
                              ? isLightTheme
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-emerald-500 border-emerald-400 text-slate-950'
                              : theme.chipIdle
                          }`}
                        >
                          Live ({tvPingSummary.live})
                        </button>

                        {tv.isPinging ? (
                          <button
                            type="button"
                            onClick={tv.cancelPing}
                            title="Dừng quét Ping"
                            className={`min-h-[2.45rem] px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 shrink-0 active:scale-95 ${
                              isLightTheme
                                ? 'bg-rose-100 border-rose-300 text-rose-700'
                                : 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                            }`}
                          >
                            <Square className="w-3 h-3 fill-current" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onNotifyToast(
                                `📡 Đang ping ${Math.min(tvBaseChannels.length, 120)} kênh...`
                              );
                              tv.pingChannels(tvBaseChannels, true);
                            }}
                            title="Ping kiểm tra Live / Off ngay"
                            className={`min-h-[2.45rem] px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 shrink-0 active:scale-95 ${
                              isLightTheme
                                ? 'bg-blue-50 border-blue-300 text-blue-700'
                                : 'bg-sky-500/20 border-sky-400/45 text-sky-200'
                            }`}
                          >
                            <Activity className="w-4 h-4" />
                            <span className="cq-hide-xs">Ping</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowTvPicker(false)}
                          aria-label="Quay lại khung phát TV"
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 active:scale-90 ${theme.iconBtn}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Thanh nhóm kênh */}
                      {!tvSearch.trim() && (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                          {[
                            { id: '__popular__', label: '🔥 Phổ biến' },
                            { id: '__favorites__', label: `⭐ (${tv.favoriteKeys.length})` },
                            ...(tv.playlist?.groups.map((g) => ({
                              id: g.name,
                              label: `${g.name} (${g.count})`,
                            })) || []),
                            ...(tv.playlist
                              ? [{ id: '__all__', label: `Tất cả (${tv.playlist.totalPlayable})` }]
                              : []),
                          ].map((tab) => {
                            const active = tvGroup === tab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTvGroup(tab.id)}
                                className={`min-h-[2.15rem] px-3 rounded-full text-xs font-extrabold whitespace-nowrap border active:scale-95 transition ${
                                  active
                                    ? isLightTheme
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-sky-400 text-slate-950 border-sky-300'
                                    : theme.chipIdle
                                }`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Danh sách kênh cuộn lớn dễ bấm trong Cockpit */}
                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-1.5 pr-0.5">
                        {tv.isLoadingPlaylist ? (
                          <div className="py-8 flex flex-col items-center gap-1.5 text-center">
                            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                            <span className={`text-xs font-bold ${theme.textSub}`}>
                              Đang tải danh sách kênh...
                            </span>
                          </div>
                        ) : tvDisplayedChannels.length === 0 ? (
                          <div className={`py-6 text-center text-xs font-bold ${theme.textMuted}`}>
                            {tvOnlyLive
                              ? 'Chưa có kênh Live — bấm Ping hoặc tắt lọc Chỉ Live.'
                              : 'Không tìm thấy kênh phù hợp.'}
                          </div>
                        ) : (
                          tvDisplayedChannels.map((ch) => {
                            const selected = tv.activeChannel?.id === ch.id;
                            const p = tv.pingMap[ch.id];
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                onClick={() => {
                                  tv.setActiveChannel(ch);
                                  setShowTvPicker(false);
                                }}
                                className={`w-full min-h-[3.1rem] rounded-xl border px-2.5 py-2 flex items-center gap-2.5 text-left active:scale-[0.99] transition ${
                                  selected
                                    ? isLightTheme
                                      ? 'bg-blue-50 border-blue-500 shadow-sm'
                                      : 'bg-sky-500/25 border-sky-400/70'
                                    : theme.itemIdle
                                }`}
                              >
                                <div
                                  className={`w-10 h-8 rounded-lg border flex items-center justify-center overflow-hidden p-1 shrink-0 ${
                                    isLightTheme
                                      ? 'bg-slate-900 border-slate-300'
                                      : 'bg-black/55 border-white/10'
                                  }`}
                                >
                                  {ch.logo && !tvFailedLogos[ch.id] ? (
                                    <img
                                      src={ch.logo}
                                      alt=""
                                      loading="lazy"
                                      onError={() =>
                                        setTvFailedLogos((prev) => ({ ...prev, [ch.id]: true }))
                                      }
                                      className="w-full h-full object-contain"
                                    />
                                  ) : ch.isRadio ? (
                                    <Radio className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <Tv className="w-4 h-4 text-sky-300" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className={`text-xs sm:text-sm font-extrabold truncate ${theme.text}`}>
                                    {ch.name}
                                  </p>
                                  <div className="flex items-center gap-1 text-[0.7rem] font-semibold">
                                    <span className={`truncate ${theme.textMuted}`}>{ch.group}</span>
                                    {ch.manifestType === 'mpd' && (
                                      <span
                                        className={`px-1 rounded font-bold shrink-0 ${
                                          isLightTheme
                                            ? 'bg-violet-100 text-violet-800'
                                            : 'bg-violet-500/25 text-violet-200'
                                        }`}
                                      >
                                        MPD
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Đèn Ping Live / Off ngay trên danh sách Cockpit */}
                                {p ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.68rem] font-mono font-extrabold shrink-0 ${
                                      p.status === 'live'
                                        ? isLightTheme
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                          : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
                                        : p.status === 'dead'
                                        ? isLightTheme
                                          ? 'bg-rose-50 border-rose-300 text-rose-700'
                                          : 'bg-rose-500/20 border-rose-400/45 text-rose-300'
                                        : isLightTheme
                                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                                        : 'bg-sky-500/20 border-sky-400/45 text-sky-300'
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        p.status === 'live'
                                          ? 'bg-emerald-500'
                                          : p.status === 'dead'
                                          ? 'bg-rose-500'
                                          : 'bg-sky-400 animate-ping'
                                      }`}
                                    />
                                    <span>
                                      {p.status === 'live'
                                        ? p.latencyMs
                                          ? `${p.latencyMs}ms`
                                          : 'Live'
                                        : p.status === 'dead'
                                        ? 'Off'
                                        : '...'}
                                    </span>
                                  </span>
                                ) : (
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isLightTheme ? 'bg-slate-300' : 'bg-white/20'
                                    }`}
                                  />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : effectiveVideoMode ? (
                <div className="flex-1 min-h-0 flex flex-col gap-2 short:gap-1.5">
                  {/* Sân khấu 16:9 chuẩn container-type: size -> Video luôn nền đen chuẩn điện ảnh */}
                  <div className="media-stage relative h-[185px] xs:h-[210px] car:h-auto car:flex-1 car:min-h-0 w-full flex items-center justify-center">
                    <div
                      ref={videoSlotRef}
                      aria-label="Khung phát Video YouTube trong Cockpit"
                      className={`car-video-fit relative rounded-2xl overflow-hidden bg-black border shadow-lg ${
                        isLightTheme ? 'border-slate-300' : 'border-white/15'
                      }`}
                    >
                      <img
                        src={streamData.thumbnailUrl}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full object-cover opacity-25 blur-sm scale-105 pointer-events-none"
                      />
                    </div>
                  </div>

                  {/* Thông tin Video căn giữa thoáng rộng 100% bề ngang */}
                  <div className="shrink-0 text-center px-1">
                    <h3
                      className={`text-xs sm:text-sm font-extrabold truncate leading-snug ${theme.text}`}
                    >
                      {streamData.title}
                    </h3>
                    <p className={`text-[11px] font-semibold truncate ${theme.textSub}`}>
                      {streamData.uploader}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col justify-center gap-2.5 short:gap-2">
                  {/* Thông tin Bài hát + Ảnh bìa rộng rãi 100% bề ngang */}
                  <div className="flex items-center gap-3 short:gap-2.5 shrink-0 px-0.5">
                    <div
                      onClick={onTogglePlay}
                      className={`relative w-14 h-14 sm:w-16 sm:h-16 short:w-12 short:h-12 rounded-2xl overflow-hidden shrink-0 border shadow-lg cursor-pointer bg-black transition-transform duration-300 ${
                        isLightTheme ? 'border-slate-300' : 'border-white/20'
                      } ${isPlaying && !isBuffering ? 'scale-100' : 'scale-95'}`}
                    >
                      <img
                        src={streamData.thumbnailUrl}
                        alt={streamData.title}
                        className="w-full h-full object-cover"
                      />
                      {isBuffering && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-sm sm:text-base short:text-xs font-extrabold line-clamp-2 leading-snug ${theme.text}`}
                      >
                        {streamData.title}
                      </h3>
                      <p
                        className={`text-[11px] sm:text-xs font-semibold truncate mt-0.5 ${theme.textSub}`}
                      >
                        {streamData.uploader}
                      </p>
                    </div>
                  </div>

                  {/* Khung lời bài hát Karaoke 2 dòng cân đối */}
                  <div
                    className={`flex-1 min-h-[52px] short:min-h-[44px] max-h-[156px] rounded-2xl border px-3 py-2 short:py-1.5 flex flex-col justify-center text-center shadow-inner ${theme.well}`}
                  >
                    {currentLyricText ? (
                      <>
                        <p
                          className={`text-sm sm:text-base font-extrabold line-clamp-2 leading-snug ${theme.text}`}
                        >
                          “{currentLyricText}”
                        </p>
                        {nextLyricText && (
                          <p
                            className={`text-xs font-semibold truncate mt-1 vshort:hidden ${theme.textMuted}`}
                          >
                            {nextLyricText}
                          </p>
                        )}
                      </>
                    ) : (
                      <p
                        className={`text-xs sm:text-sm font-bold line-clamp-2 ${theme.textMuted}`}
                      >
                        🎵 Vuốt ⇄ để qua bài • Chạm đúp thả tim ❤️
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* TẦNG 3 (CỐ ĐỊNH ĐÁY): ĐIỀU KHIỂN TV LIVE HOẶC THANH TUA & ĐIỀU KHIỂN NHẠC/VIDEO */}
              {cockpitTvMode ? (
                <div className="shrink-0 flex items-center justify-between gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={tv.switchStreamMode}
                    title="Đổi giữa phát CDN trực tiếp và Proxy chống chặn"
                    className={`min-h-[2.5rem] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition ${
                      tv.playerStatus.streamMode === 'proxy'
                        ? isLightTheme
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                        : theme.iconBtn
                    }`}
                  >
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span className="cq-hide-xs">
                      {tv.playerStatus.streamMode === 'proxy' ? 'Proxy' : 'CDN'}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCockpitZapTv(-1)}
                      aria-label="Kênh TV trước"
                      className={`w-11 h-11 short:w-10 short:h-10 rounded-full border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => tv.togglePlay(onPauseMusic)}
                      aria-label={tv.playerStatus.isPlaying ? 'Tạm dừng TV' : 'Phát TV'}
                      className={`w-12 h-12 short:w-11 short:h-11 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
                    >
                      {tv.playerStatus.isBuffering || tv.playerStatus.isResolving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : tv.playerStatus.isPlaying ? (
                        <Pause className={`w-5 h-5 ${theme.primaryCtaIcon}`} />
                      ) : (
                        <Play className={`w-5 h-5 ml-0.5 ${theme.primaryCtaIcon}`} />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCockpitZapTv(1)}
                      aria-label="Kênh TV tiếp theo"
                      className={`w-11 h-11 short:w-10 short:h-10 rounded-full border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={tv.toggleMute}
                      aria-label={tv.isMuted ? 'Bật tiếng TV' : 'Tắt tiếng TV'}
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                        tv.isMuted
                          ? isLightTheme
                            ? 'bg-rose-50 border-rose-300 text-rose-600'
                            : 'bg-rose-500/25 border-rose-400/50 text-rose-300'
                          : theme.iconBtn
                      }`}
                    >
                      {tv.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={tv.reloadStream}
                      aria-label="Tải lại luồng kênh TV"
                      title="Tải lại kênh"
                      className={`cq-hide-xs w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${tv.playerStatus.isResolving ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="shrink-0 space-y-1 short:space-y-0.5">
                  <div>
                    <input
                      type="range"
                      aria-label="Thanh tiến trình Cockpit"
                      min={0}
                      max={safeDuration || 100}
                      step={1}
                      value={Math.min(displayedTime, safeDuration || 100)}
                      style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}
                      onPointerDown={() => {
                        isScrubbingRef.current = true;
                        onScrubStart();
                      }}
                      onChange={(e) => onScrubMove(parseFloat(e.target.value))}
                      onPointerUp={(e) =>
                        commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))
                      }
                      onPointerCancel={(e) =>
                        commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))
                      }
                      onKeyUp={(e) =>
                        commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))
                      }
                      className={theme.scrubber}
                    />
                    <div
                      className={`flex justify-between text-[0.7rem] font-mono font-bold -mt-1.5 px-0.5 ${theme.textMuted}`}
                    >
                      <span>{formatSeconds(displayedTime)}</span>
                      <span>{safeDuration > 0 ? `-${formatSeconds(remainingTime)}` : 'AUTO'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-around px-1">
                    <button
                      type="button"
                      onClick={onToggleShuffle}
                      aria-label="Phát ngẫu nhiên"
                      className={`cq-hide-xs w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${
                        isShuffle
                          ? isLightTheme
                            ? 'bg-rose-100 border border-rose-300 text-rose-700'
                            : 'bg-rose-500/30 border border-rose-400/50 text-rose-200'
                          : isLightTheme
                          ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200/70'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={onPrev}
                      disabled={!hasPrev}
                      aria-label="Bài trước"
                      className={`w-11 h-11 short:w-10 short:h-10 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <SkipBack className="w-5 h-5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={onTogglePlay}
                      aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                      className={`w-13 h-13 sm:w-14 sm:h-14 short:w-12 short:h-12 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
                    >
                      {isBuffering ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : isPlaying ? (
                        <Pause
                          className={`w-6 h-6 ${theme.primaryCtaIcon}`}
                        />
                      ) : (
                        <Play
                          className={`w-6 h-6 ml-0.5 ${theme.primaryCtaIcon}`}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={onNext}
                      disabled={!hasNext}
                      aria-label="Bài tiếp theo"
                      className={`w-11 h-11 short:w-10 short:h-10 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
                    >
                      <SkipForward className="w-5 h-5 fill-current" />
                    </button>

                    <button
                      type="button"
                      onClick={onToggleRepeat}
                      aria-label="Chế độ lặp"
                      className={`cq-hide-xs w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${
                        repeatMode !== 'off'
                          ? isLightTheme
                            ? 'bg-slate-200 border border-slate-300 text-slate-950'
                            : 'bg-white/20 border border-white/25 text-white'
                          : isLightTheme
                          ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200/70'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {repeatMode === 'one' ? (
                        <Repeat1
                          className={`w-4 h-4 ${isLightTheme ? 'text-rose-600' : 'text-rose-300'}`}
                        />
                      ) : (
                        <Repeat className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
