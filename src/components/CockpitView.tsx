import React, { useState, useEffect, useRef, Suspense } from 'react';
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
} from 'lucide-react';
import { StreamData, RepeatMode } from '../types';
import { formatSeconds } from '../services/api';
import { LyricsResult } from '../services/lyrics';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';

const LazyCarCockpitMap = React.lazy(() => import('./CarCockpitMap'));

interface CockpitViewProps {
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
}

export const CockpitView: React.FC<CockpitViewProps> = ({
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
}) => {
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);

  // Lưu tùy chọn vị trí Trái / Phải của Bản đồ & Nhạc
  const [mapSide, setMapSide] = useState<'left' | 'right'>(() => {
    try {
      const saved = localStorage.getItem('carhub_cockpit_map_side');
      return saved === 'right' ? 'right' : 'left';
    } catch {
      return 'left';
    }
  });

  // Lưu tùy chọn tỉ lệ bề ngang Bản đồ (34% -> 70%)
  const [mapWidthPct, setMapWidthPct] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem('carhub_cockpit_map_pct') || '58', 10);
      if (!isNaN(saved) && saved >= 34 && saved <= 70) return saved;
      return 58;
    } catch {
      return 58;
    }
  });

  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('carhub_cockpit_map_expanded') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_map_side', mapSide);
    } catch {}
  }, [mapSide]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_map_pct', String(mapWidthPct));
    } catch {}
  }, [mapWidthPct]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_map_expanded', String(isMapExpanded));
    } catch {}
  }, [isMapExpanded]);

  const toggleMapSide = () => {
    setMapSide((prev) => (prev === 'left' ? 'right' : 'left'));
  };

  // Kéo thanh ngăn trực tiếp bằng ngón tay trên màn hình cảm ứng VF5
  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingSplit(true);
  };

  const handleDividerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const rawPct =
      mapSide === 'left'
        ? ((e.clientX - rect.left) / rect.width) * 100
        : ((rect.right - e.clientX) / rect.width) * 100;

    const clamped = Math.round(Math.max(34, Math.min(70, rawPct)));
    setMapWidthPct(clamped);
  };

  const handleDividerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSplit) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDraggingSplit(false);
    }
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
      className={`flex-1 min-h-0 h-full w-full max-w-[1560px] mx-auto animate-ios-browse-in overflow-y-auto car:overflow-hidden no-scrollbar ${
        isMapExpanded
          ? 'flex flex-col gap-2'
          : `flex flex-col ${
              mapSide === 'right' ? 'car:flex-row-reverse' : 'car:flex-row'
            } gap-2.5 car:gap-0 items-stretch`
      }`}
    >
      {/* =====================================================================
          1. KHUNG BẢN ĐỒ 3D DẪN ĐƯỜNG & HUD TỐC ĐỘ (Tùy biến Trái/Phải & Độ rộng %)
         ===================================================================== */}
      <div
        className={
          isMapExpanded
            ? 'flex-1 min-h-[300px] car:min-h-0 w-full h-full'
            : 'w-full car:w-[var(--map-pct)] shrink-0 min-h-[320px] car:min-h-0 h-full'
        }
      >
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
            isMapExpanded={isMapExpanded}
            onToggleExpandMap={() => setIsMapExpanded((v) => !v)}
            mapSide={mapSide}
            onToggleMapSide={toggleMapSide}
            mapWidthPct={mapWidthPct}
            onChangeMapWidthPct={setMapWidthPct}
          />
        </Suspense>
      </div>

      {/* =====================================================================
          2. THANH KÉO TÙY CHỈNH BỀ NGANG TRỰC TIẾP GIỮA 2 KHUNG (Chỉ hiện trên màn ngang)
             - Kéo sang trái/phải để phóng to/thu nhỏ Bản đồ & Nhạc tức thì
             - Chạm đúp thanh ngăn để đảo nhanh vị trí Trái <-> Phải!
         ===================================================================== */}
      {!isMapExpanded && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để chỉnh kích thước bề ngang Bản đồ và Nhạc, chạm đúp để đổi bên"
          title="Kéo trái/phải để chỉnh kích thước • Chạm đúp để đổi bên Trái/Phải"
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
          onPointerCancel={handleDividerPointerUp}
          onDoubleClick={toggleMapSide}
          className="hidden car:flex flex-col items-center justify-center w-3.5 shrink-0 cursor-col-resize select-none touch-none group"
        >
          <div
            className={`w-1.5 rounded-full transition-all duration-150 ${
              isDraggingSplit
                ? 'h-24 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                : 'h-14 bg-white/20 group-hover:bg-white/50 group-hover:h-20'
            }`}
          />
        </div>
      )}

      {/* =====================================================================
          3. KHUNG NHẠC + KARAOKE (Tự co giãn thông minh theo @container ở mọi bề ngang!)
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
          className="cockpit-pane-cq flex-1 min-w-0 min-h-0 h-full bg-white/[0.06] backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/15 p-3 sm:p-3.5 short:p-2.5 flex flex-col justify-between gap-2 short:gap-1.5 relative overflow-hidden shadow-2xl"
        >
          {heartBurst && (
            <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/20">
              <Heart className="w-20 h-20 text-rose-500 fill-rose-500 animate-ping" />
            </div>
          )}

          {/* Hàng 1: Ảnh bìa + Tên bài + Nút Đổi bên nhanh (⇄) / Mix / Tim */}
          <div className="flex items-center gap-2.5 short:gap-2 shrink-0">
            <div
              onClick={onTogglePlay}
              className="relative w-13 h-13 sm:w-15 sm:h-15 short:w-11 short:h-11 rounded-2xl overflow-hidden shrink-0 border border-white/15 shadow-lg cursor-pointer bg-black"
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
              <span className="cq-hide-sm inline-block text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/65 mb-0.5">
                Vuốt ⇄ qua bài • Đúp ❤️
              </span>
              <h3 className="text-sm sm:text-base short:text-xs font-extrabold text-white line-clamp-1">
                {streamData.title}
              </h3>
              <p className="text-[11px] text-white/65 font-semibold truncate">
                {streamData.uploader}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Nút 1 chạm Đổi vị trí Nhạc <-> Bản đồ ngay trên thẻ Nhạc */}
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
                className={`cq-hide-sm h-8 px-2 rounded-full border text-[11px] font-extrabold flex items-center gap-1 active:scale-90 transition ${
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
                className="cq-hide-md w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 flex items-center justify-center active:scale-90 transition"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu yêu thích'}
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

          {/* Hàng 2: Khung lời bài hát Karaoke 2 dòng */}
          <div className="flex-1 min-h-[46px] bg-black/35 rounded-2xl border border-white/10 px-3 py-2 short:py-1.5 flex flex-col justify-center text-center">
            {currentLyricText ? (
              <>
                <p className="text-xs sm:text-base short:text-xs font-extrabold text-white line-clamp-2 leading-snug">
                  “{currentLyricText}”
                </p>
                {nextLyricText && (
                  <p className="text-[11px] sm:text-xs text-white/45 font-semibold truncate mt-1 vshort:hidden">
                    {nextLyricText}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs font-bold text-white/45 line-clamp-2">
                🎵 Kéo thanh ngăn giữa để chỉnh độ rộng • Bấm ⇄ để đổi bên
              </p>
            )}
          </div>

          {/* Hàng 3: Thanh tua + Nút điều khiển lớn (Tự gọn còn Prev/Play/Next khi thu hẹp cột Nhạc!) */}
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
                onPointerDown={onScrubStart}
                onChange={(e) => onScrubMove(parseFloat(e.target.value))}
                onPointerUp={(e) => onScrubCommit(parseFloat((e.target as HTMLInputElement).value))}
                onTouchEnd={() => onScrubCommit(displayedTime)}
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
                className={`cq-hide-sm w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center active:scale-90 transition ${
                  isShuffle
                    ? 'bg-rose-500/30 border border-rose-400/50 text-rose-200'
                    : 'text-white/55'
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
                className={`cq-hide-sm w-9 h-9 short:w-8 short:h-8 rounded-full flex items-center justify-center active:scale-90 transition ${
                  repeatMode !== 'off'
                    ? 'bg-white/20 border border-white/25 text-white'
                    : 'text-white/55'
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
};
