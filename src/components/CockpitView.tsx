import React from 'react';
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
  Navigation,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { StreamData, RepeatMode } from '../types';
import { formatSeconds } from '../services/api';
import { LyricsResult } from '../services/lyrics';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';

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
  const { speedKmh, gpsStatus, weather, requestGps } = telemetry;

  const dateStr = React.useMemo(() => {
    return new Date().toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  }, [clockTime]);

  const speedValue = speedKmh !== null ? speedKmh : 0;
  const speedAccent =
    speedKmh === null
      ? 'text-white/55'
      : speedValue >= 80
      ? 'text-rose-400 drop-shadow-[0_0_25px_rgba(251,113,133,0.4)]'
      : speedValue >= 60
      ? 'text-amber-300 drop-shadow-[0_0_25px_rgba(252,211,77,0.35)]'
      : 'text-emerald-300 drop-shadow-[0_0_25px_rgba(110,231,183,0.35)]';

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
    <div className="flex-1 min-h-0 w-full max-w-[1520px] mx-auto grid grid-cols-1 car:grid-cols-12 gap-2.5 sm:gap-3.5 items-stretch animate-ios-browse-in overflow-y-auto car:overflow-hidden no-scrollbar">
      {/* =====================================================================
          CỘT TRÁI (5 CỘT): ĐỒNG HỒ TỐC ĐỘ GPS KM/H + GIỜ + THỜI TIẾT NGOÀI TRỜI
         ===================================================================== */}
      <div className="car:col-span-5 flex flex-col justify-between gap-2.5 short:gap-2 min-h-0">
        {/* Ô Tốc độ số khổng lồ (Speedometer HUD) */}
        <div
          onClick={gpsStatus !== 'active' ? requestGps : undefined}
          className={`flex-1 min-h-[140px] car:min-h-0 bg-black/55 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/15 px-4 py-3 short:py-2 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl ${
            gpsStatus !== 'active' ? 'cursor-pointer hover:border-white/30' : ''
          }`}
        >
          <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-white/60">
              <Navigation
                className={`w-3.5 h-3.5 ${
                  gpsStatus === 'active' ? 'text-emerald-400' : 'text-white/40'
                }`}
              />
              <span>VF5 GPS HUD</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border ${
                gpsStatus === 'active'
                  ? speedValue >= 80
                    ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                    : speedValue >= 60
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                    : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                  : 'bg-white/10 border-white/15 text-white/60'
              }`}
            >
              {gpsStatus === 'active'
                ? speedValue === 0
                  ? 'Đang dừng'
                  : speedValue >= 80
                  ? 'Cao tốc'
                  : speedValue >= 60
                  ? 'Ngoài đô thị'
                  : 'Đô thị'
                : gpsStatus === 'denied'
                ? 'Chưa cấp GPS'
                : 'Đang dò GPS...'}
            </span>
          </div>

          <div className="flex items-baseline justify-center gap-2 mt-3 short:mt-2">
            <span
              className={`text-6xl sm:text-7xl lg:text-8xl short:text-5xl vshort:text-4xl font-black tracking-tighter tabular-nums leading-none transition-colors duration-300 ${speedAccent}`}
            >
              {speedKmh !== null ? speedKmh : '--'}
            </span>
            <span className="text-sm sm:text-base font-black text-white/55 tracking-widest">
              KM/H
            </span>
          </div>

          {gpsStatus !== 'active' && (
            <p className="text-[11px] font-bold text-white/50 mt-1 text-center">
              {gpsStatus === 'denied'
                ? 'Hãy cho phép Vị trí trên iPhone cho APTV / asCar'
                : 'Chạm để kích hoạt đo tốc độ GPS'}
            </p>
          )}
        </div>

        {/* Hàng dưới: Đồng hồ lớn + Thời tiết Open-Meteo */}
        <div className="grid grid-cols-2 gap-2.5 short:gap-2 shrink-0">
          <div className="bg-white/[0.06] backdrop-blur-xl rounded-2xl border border-white/12 px-3.5 py-2.5 short:py-2 flex flex-col justify-center">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/50">
              {dateStr}
            </span>
            <span className="text-2xl sm:text-3xl short:text-xl font-black font-mono text-white tracking-tight mt-0.5">
              {clockTime || '--:--'}
            </span>
          </div>

          <div
            className={`backdrop-blur-xl rounded-2xl border px-3.5 py-2.5 short:py-2 flex flex-col justify-center ${
              weather?.isRainy
                ? 'bg-sky-500/15 border-sky-400/35'
                : 'bg-white/[0.06] border-white/12'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-lg short:text-base leading-none">
                {weather?.icon || '🌤️'}
              </span>
              <span className="text-xl sm:text-2xl short:text-lg font-black text-white">
                {weather ? `${weather.temperature}°C` : '--°C'}
              </span>
            </div>
            <span
              className={`text-[11px] font-bold truncate mt-0.5 ${
                weather?.isRainy ? 'text-sky-200' : 'text-white/65'
              }`}
            >
              {weather?.label || 'Đang tải thời tiết...'}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          CỘT PHẢI (7 CỘT): TRÌNH PHÁT RẢNH TAY + KARAOKE 2 DÒNG + VUỐT MÙ
         ===================================================================== */}
      <div
        {...gestureHandlers}
        className="car:col-span-7 bg-white/[0.06] backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/15 p-3.5 sm:p-4 short:p-2.5 flex flex-col justify-between gap-2 short:gap-1.5 min-h-0 relative overflow-hidden shadow-2xl"
      >
        {heartBurst && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/20">
            <Heart className="w-20 h-20 text-rose-500 fill-rose-500 animate-ping" />
          </div>
        )}

        {/* Hàng 1: Ảnh bìa + Tên bài + Nút Auto-Mix & Yêu thích */}
        <div className="flex items-center gap-3 short:gap-2.5 shrink-0">
          <div
            onClick={onTogglePlay}
            className="relative w-16 h-16 sm:w-20 sm:h-20 short:w-14 short:h-14 vshort:w-11 vshort:h-11 rounded-2xl overflow-hidden shrink-0 border border-white/15 shadow-lg cursor-pointer bg-black"
          >
            <img
              src={streamData.thumbnailUrl}
              alt={streamData.title}
              className="w-full h-full object-cover"
            />
            {isBuffering && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                Vuốt ⇄ qua bài • Chạm đúp ❤️
              </span>
            </div>
            <h3 className="text-base sm:text-lg short:text-sm font-extrabold text-white truncate">
              {streamData.title}
            </h3>
            <p className="text-xs sm:text-sm short:text-[11px] text-white/65 font-semibold truncate">
              {streamData.uploader}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onStartAutoMix}
              disabled={isLoadingMix}
              aria-label="Phát đài nhạc tương tự bài này"
              title="Đài phát thông minh tương tự bài này"
              className={`min-h-[40px] short:min-h-[36px] px-2.5 rounded-full border text-xs font-extrabold flex items-center gap-1 active:scale-90 transition ${
                isMixActive
                  ? 'bg-amber-400 text-black border-amber-300 shadow-lg'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-amber-200'
              }`}
            >
              {isLoadingMix ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 fill-current" />
              )}
              <span className="hidden sm:inline">Mix</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddPlaylist}
              aria-label="Lưu vào Playlist"
              className="w-10 h-10 short:w-9 short:h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 flex items-center justify-center active:scale-90 transition"
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onToggleFavorite}
              aria-label={isFavorite ? 'Bỏ lưu yêu thích' : 'Lưu yêu thích'}
              className={`w-10 h-10 short:w-9 short:h-9 rounded-full border flex items-center justify-center active:scale-90 transition ${
                isFavorite
                  ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                  : 'bg-white/10 border-white/15 text-white/75'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-rose-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Hàng 2: Khung lời bài hát Karaoke 2 dòng liếc nhanh khi lái xe */}
        <div className="flex-1 min-h-[54px] bg-black/35 rounded-2xl border border-white/10 px-4 py-2 short:py-1.5 flex flex-col justify-center text-center">
          {currentLyricText ? (
            <>
              <p className="text-sm sm:text-lg short:text-xs font-extrabold text-white line-clamp-2 leading-snug">
                “{currentLyricText}”
              </p>
              {nextLyricText && (
                <p className="text-xs sm:text-sm text-white/45 font-semibold truncate mt-1 vshort:hidden">
                  {nextLyricText}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs sm:text-sm font-bold text-white/45">
              🎵 Chế độ Lái Xe Tập Trung — Vuốt ngang trên thẻ này để chuyển bài không cần nhìn
            </p>
          )}
        </div>

        {/* Hàng 3: Thanh tua + Cụm nút điều khiển lớn */}
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
            <div className="flex justify-between text-[11px] font-mono font-bold text-white/55 -mt-1.5 px-0.5">
              <span>{formatSeconds(displayedTime)}</span>
              <span>{safeDuration > 0 ? `-${formatSeconds(remainingTime)}` : 'AUTO'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <button
              type="button"
              onClick={onToggleShuffle}
              aria-label="Phát ngẫu nhiên"
              className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center active:scale-90 transition ${
                isShuffle ? 'bg-rose-500/30 border border-rose-400/50 text-rose-200' : 'text-white/55'
              }`}
            >
              <Shuffle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Bài trước"
              className="w-12 h-12 short:w-10 short:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
            >
              <SkipBack className="w-6 h-6 short:w-5 short:h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
              className="w-15 h-15 sm:w-16 sm:h-16 short:w-12 short:h-12 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-[0_6px_25px_rgba(255,255,255,0.3)] active:scale-90 transition"
            >
              {isBuffering ? (
                <Loader2 className="w-6 h-6 animate-spin text-black" />
              ) : isPlaying ? (
                <Pause className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 fill-black" />
              ) : (
                <Play className="w-6 h-6 sm:w-7 sm:h-7 short:w-5 short:h-5 fill-black ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Bài tiếp theo"
              className="w-12 h-12 short:w-10 short:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition"
            >
              <SkipForward className="w-6 h-6 short:w-5 short:h-5 fill-current" />
            </button>

            <button
              type="button"
              onClick={onToggleRepeat}
              aria-label="Chế độ lặp"
              className={`w-10 h-10 short:w-9 short:h-9 rounded-full flex items-center justify-center active:scale-90 transition ${
                repeatMode !== 'off' ? 'bg-white/20 border border-white/25 text-white' : 'text-white/55'
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
      </div>
    </div>
  );
};
