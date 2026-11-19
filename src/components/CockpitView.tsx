import React, { useState, useEffect, useLayoutEffect, useRef, Suspense, useCallback } from 'react';
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
  Music,
} from 'lucide-react';
import {
  ActiveNavSummary,
  MusicSource,
  PendingNavTarget,
  RepeatMode,
  SavedPlace,
  StreamData,
} from '../types';
import { formatSeconds } from '../services/api';
import { LyricsResult } from '../services/lyrics';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { MapErrorBoundary } from './MapErrorBoundary';

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
  }) => {
    const splitContainerRef = useRef<HTMLDivElement | null>(null);
    const videoSlotRef = useRef<HTMLDivElement | null>(null);
    const badgeTextRef = useRef<HTMLSpanElement | null>(null);
    const rafDragRef = useRef<number | null>(null);
    const isScrubbingRef = useRef<boolean>(false);

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
        const saved = parseInt(localStorage.getItem('carhub_cockpit_map_pct') || '58', 10);
        if (!isNaN(saved) && saved >= 34 && saved <= 70) return saved;
        return 58;
      } catch {
        return 58;
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

    const effectiveVideoMode = isVideoMode && !isSoundCloudTrack;
    const showVideoSlot = isVisible && effectiveVideoMode && !isMapExpanded;

    // Đo tọa độ chính xác của khung Video 16:9 và đồng bộ trực tiếp trước khi trình duyệt vẽ frame (0 giật, 0 vỡ layout!)
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

    useLayoutEffect(() => {
      syncVideoSlotRect();
      if (!showVideoSlot) return;

      const rafId = window.requestAnimationFrame(syncVideoSlotRect);
      const t1 = window.setTimeout(syncVideoSlotRect, 120);

      const slotEl = videoSlotRef.current;
      const containerEl = splitContainerRef.current;
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => syncVideoSlotRect());
        if (slotEl) ro.observe(slotEl);
        if (containerEl) ro.observe(containerEl);
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
    }, [showVideoSlot, mapSide, mapWidthPct, syncVideoSlotRect]);

    useEffect(() => {
      return () => {
        onVideoSlotRectChange(null);
      };
    }, [onVideoSlotRectChange]);

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

    // Kéo thả 60fps siêu mượt: Cập nhật biến CSS + tọa độ Video 16:9 trực tiếp trên DOM (0 lần re-render React!)
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

        const clamped = Math.round(Math.max(34, Math.min(70, rawPct)));
        livePctRef.current = clamped;

        if (rafDragRef.current !== null) return;
        rafDragRef.current = window.requestAnimationFrame(() => {
          rafDragRef.current = null;
          const pct = livePctRef.current;
          container.style.setProperty('--map-pct', `${pct}%`);
          if (badgeTextRef.current) {
            badgeTextRef.current.textContent = `Bản đồ ${pct}% • ${
              isVideoMode ? 'Video' : 'Nhạc'
            } ${100 - pct}%`;
          }
          syncVideoSlotRect();
        });
      },
      [mapSide, isVideoMode, syncVideoSlotRect]
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
      window.requestAnimationFrame(syncVideoSlotRect);
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

    return (
      <div
        ref={splitContainerRef}
        style={{ '--map-pct': `${mapWidthPct}%` } as React.CSSProperties}
        className={`${
          isVisible ? 'flex' : 'hidden'
        } relative flex-1 min-h-0 h-full w-full max-w-[1560px] mx-auto overflow-y-auto car:overflow-hidden no-scrollbar ${
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
              Bản đồ {livePctRef.current}% • {isVideoMode ? 'Video' : 'Nhạc'}{' '}
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
          <MapErrorBoundary>
            <Suspense
              fallback={
                <div className="w-full h-full min-h-[220px] rounded-3xl bg-black/60 border border-white/15 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span className="text-xs font-bold text-white/70">
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
                suppressResizeObserver={isDraggingSplit}
                savedPlaces={savedPlaces}
                onSavePlace={onSavePlace}
                onRemoveSavedPlace={onRemoveSavedPlace}
                syncCode={syncCode}
                incomingNavTarget={incomingNavTarget}
                onConsumeIncomingNav={onConsumeIncomingNav}
                onActiveNavChange={onActiveNavChange}
                onNotifyToast={onNotifyToast}
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
                    ? 'bg-emerald-400 border-white text-black scale-110'
                    : 'bg-black/85 group-hover:bg-white/20 border-white/30 text-white/80'
                }`}
              >
                <GripVertical className="w-3.5 h-3.5 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            3. KHUNG GIẢI TRÍ COCKPIT (Cấu trúc 3 tầng cố định cân đối chuẩn CarPlay — đổi Nhạc ↔ Video 0 giật!)
           ===================================================================== */}
        {isMapExpanded ? (
          <div
            {...gestureHandlers}
            className="shrink-0 bg-white/[0.08] backdrop-blur-2xl rounded-2xl border border-white/15 px-3 py-2 flex items-center justify-between gap-3 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <img
                src={streamData.thumbnailUrl}
                alt={streamData.title}
                className="w-10 h-10 rounded-xl object-cover shrink-0 bg-black"
              />
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {streamData.title}
                </h4>
                <p className="text-[11px] text-emerald-300 font-bold truncate">
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
                className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30 active:scale-90"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow active:scale-90"
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
                className="w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30 active:scale-90"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            </div>
          </div>
        ) : (
          <div
            {...gestureHandlers}
            className={`cockpit-pane-cq flex-1 min-w-0 min-h-0 h-full bg-white/[0.06] backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/15 p-3 sm:p-3.5 short:p-2.5 flex flex-col justify-between gap-2.5 short:gap-2 relative overflow-hidden shadow-2xl ${
              isDraggingSplit ? 'pointer-events-none select-none' : ''
            }`}
          >
            {heartBurst && (
              <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/20">
                <Heart className="w-20 h-20 text-rose-500 fill-rose-500 animate-ping" />
              </div>
            )}

            {/* TẦNG 1 (CỐ ĐỊNH): THANH CHUYỂN NHẠC / VIDEO + NGUỒN SOUNDCLOUD/YOUTUBE GỌN SẠCH */}
            <div className="flex items-center justify-between gap-1.5 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Segmented Switch iOS: Nhạc (Lyrics) | Video */}
                <div className="inline-flex items-center p-0.5 rounded-full bg-black/45 border border-white/15 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (isVideoMode) onToggleViewMode();
                    }}
                    aria-label="Chế độ Nghe nhạc và Lời bài hát"
                    className={`h-7 px-2.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 transition-colors ${
                      !effectiveVideoMode
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <Music className="w-3 h-3 shrink-0" />
                    <span>Nhạc</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSoundCloudTrack) {
                        onChangeMusicSource('youtube');
                        if (!isVideoMode) onToggleViewMode();
                      } else if (!isVideoMode) {
                        onToggleViewMode();
                      }
                    }}
                    aria-label="Chế độ Phát Video YouTube"
                    className={`h-7 px-2.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 transition-colors ${
                      effectiveVideoMode
                        ? 'bg-sky-400 text-slate-950 shadow-sm'
                        : 'text-white/65 hover:text-white'
                    }`}
                  >
                    <Tv className="w-3 h-3 shrink-0" />
                    <span>Video</span>
                  </button>
                </div>

                {/* Nút 1 chạm đổi nhanh nguồn YouTube <-> SoundCloud ngay trong Cockpit */}
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
                  className={`h-7 px-2 rounded-full border text-[10px] font-black flex items-center gap-1 shrink-0 active:scale-95 transition ${
                    musicSource === 'soundcloud' || isSoundCloudTrack
                      ? 'bg-[#ff5500] border-orange-300/70 text-white shadow-sm'
                      : 'bg-white/10 hover:bg-white/20 border-white/15 text-white/80'
                  }`}
                >
                  <span>{musicSource === 'soundcloud' || isSoundCloudTrack ? '☁️ SC' : '▶ YT'}</span>
                </button>
              </div>

              {/* Nhóm icon hành động bên phải (thoáng, không bao giờ đè chữ!) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={toggleMapSide}
                  aria-label="Đổi vị trí Trái Phải giữa Nhạc và Bản đồ"
                  title="Đổi bên Trái / Phải với Bản đồ"
                  className="hidden car:flex w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-emerald-300 items-center justify-center active:scale-90 transition"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={onStartAutoMix}
                  disabled={isLoadingMix}
                  aria-label="Phát đài nhạc tương tự bài này"
                  title="Phát liên hoàn bài tương tự (Auto-Mix)"
                  className={`cq-hide-xs w-8 h-8 rounded-full border flex items-center justify-center active:scale-90 transition ${
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
                </button>

                <button
                  type="button"
                  onClick={onOpenAddPlaylist}
                  aria-label="Lưu vào Playlist"
                  title="Lưu vào Playlist"
                  className="cq-hide-sm w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 flex items-center justify-center active:scale-90 transition"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={onToggleFavorite}
                  aria-label={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu yêu thích'}
                  title={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center active:scale-90 transition ${
                    isFavorite
                      ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                      : 'bg-white/10 border-white/15 text-white/75'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* TẦNG 2 (TRUNG TÂM CÂN ĐỐI TỈ LỆ): VIDEO 16:9 CHUẨN HOẶC ALBUM + KARAOKE */}
            {effectiveVideoMode ? (
              <div className="flex-1 min-h-0 flex flex-col gap-2 short:gap-1.5">
                {/* Sân khấu 16:9 chuẩn container-type: size -> Video KHÔNG BAO GIỜ bị kéo dọc méo hay đẩy vỡ layout! */}
                <div className="media-stage relative h-[185px] xs:h-[210px] car:h-auto car:flex-1 car:min-h-0 w-full flex items-center justify-center">
                  <div
                    ref={videoSlotRef}
                    aria-label="Khung phát Video YouTube trong Cockpit"
                    className="car-video-fit relative rounded-2xl overflow-hidden bg-black border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
                  >
                    {/* Ảnh bìa tối nhẹ làm nền chờ mượt khi chuyển sang Video (không hiện text nhấp nháy!) */}
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
                  <h3 className="text-xs sm:text-sm font-extrabold text-white truncate leading-snug">
                    {streamData.title}
                  </h3>
                  <p className="text-[11px] text-white/60 font-semibold truncate">
                    {streamData.uploader}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-2.5 short:gap-2">
                {/* Thông tin Bài hát + Ảnh bìa rộng rãi 100% bề ngang (không bị nút nào đè ép!) */}
                <div className="flex items-center gap-3 short:gap-2.5 shrink-0 px-0.5">
                  <div
                    onClick={onTogglePlay}
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 short:w-12 short:h-12 rounded-2xl overflow-hidden shrink-0 border border-white/20 shadow-xl cursor-pointer bg-black transition-transform duration-300 ${
                      isPlaying && !isBuffering ? 'scale-100' : 'scale-95'
                    }`}
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
                    <h3 className="text-sm sm:text-base short:text-xs font-extrabold text-white line-clamp-2 leading-snug">
                      {streamData.title}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-white/65 font-semibold truncate mt-0.5">
                      {streamData.uploader}
                    </p>
                  </div>
                </div>

                {/* Khung lời bài hát Karaoke 2 dòng cân đối */}
                <div className="flex-1 min-h-[60px] max-h-[168px] bg-black/40 rounded-2xl border border-white/12 px-3.5 py-2.5 short:py-2 flex flex-col justify-center text-center shadow-inner">
                  {currentLyricText ? (
                    <>
                      <p className="text-sm sm:text-base short:text-xs font-extrabold text-white line-clamp-2 leading-snug">
                        “{currentLyricText}”
                      </p>
                      {nextLyricText && (
                        <p className="text-[11px] sm:text-xs text-white/45 font-semibold truncate mt-1.5 vshort:hidden">
                          {nextLyricText}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs font-bold text-white/45 line-clamp-2">
                      🎵 Vuốt ⇄ để qua bài • Chạm đúp thả tim ❤️
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TẦNG 3 (CỐ ĐỊNH ĐÁY): THANH TUA & CỤM NÚT ĐIỀU KHIỂN ĐỐI XỨNG */}
            <div className="shrink-0 space-y-1">
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
                  onPointerUp={(e) => commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))}
                  onPointerCancel={(e) =>
                    commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))
                  }
                  onKeyUp={(e) => commitScrubOnce(parseFloat((e.target as HTMLInputElement).value))}
                  className="car-scrubber"
                />
                <div className="flex justify-between text-[10px] font-mono font-bold text-white/55 -mt-1.5 px-0.5">
                  <span>{formatSeconds(displayedTime)}</span>
                  <span>{safeDuration > 0 ? `-${formatSeconds(remainingTime)}` : 'AUTO'}</span>
                </div>
              </div>

              <div className="flex items-center justify-around px-1">
                <button
                  type="button"
                  onClick={onToggleShuffle}
                  aria-label="Phát ngẫu nhiên"
                  className={`cq-hide-xs w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center active:scale-90 transition ${
                    isShuffle
                      ? 'bg-rose-500/30 border border-rose-400/50 text-rose-200'
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
                  className="w-11 h-11 short:w-9 short:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                  className="w-13 h-13 sm:w-14 sm:h-14 short:w-11 short:h-11 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-[0_6px_22px_rgba(255,255,255,0.3)] active:scale-90 transition"
                >
                  {isBuffering ? (
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-black" />
                  ) : (
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-black ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onNext}
                  disabled={!hasNext}
                  aria-label="Bài tiếp theo"
                  className="w-11 h-11 short:w-9 short:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={onToggleRepeat}
                  aria-label="Chế độ lặp"
                  className={`cq-hide-xs w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center active:scale-90 transition ${
                    repeatMode !== 'off'
                      ? 'bg-white/20 border border-white/25 text-white'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-4 h-4 text-rose-300" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);
