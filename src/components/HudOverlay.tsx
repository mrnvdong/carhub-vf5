import React, { useState } from 'react';
import { FlipHorizontal2, X, BatteryCharging, Navigation, AlertTriangle } from 'lucide-react';
import { ActiveNavSummary } from '../types';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { ParkingSignSvg } from './TrafficSignBadge';

interface HudOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: CockpitTelemetry;
  activeNavSummary: ActiveNavSummary | null;
  batterySoc: number;
  rangeKm: number;
  clockTime: string;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  isOpen,
  onClose,
  telemetry,
  activeNavSummary,
  batterySoc,
  rangeKm,
  clockTime,
}) => {
  const [mirrored, setMirrored] = useState<boolean>(true);

  if (!isOpen) return null;

  const speed = telemetry.speedKmh ?? 0;
  const limit = telemetry.roadInfo?.speedLimit ?? null;
  const isOver = limit !== null && speed >= limit + 4;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black text-emerald-400 flex flex-col justify-between p-5 sm:p-8 select-none overflow-hidden"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onClose();
      }}
    >
      {/* Thanh điều khiển góc trên (không bị lật để dễ bấm tay) */}
      <div className="flex items-center justify-between gap-2 z-20">
        <button
          type="button"
          onClick={() => setMirrored((m) => !m)}
          className="min-h-[2.75rem] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-extrabold flex items-center gap-2 active:scale-95 transition"
        >
          <FlipHorizontal2 className="w-4 h-4 text-emerald-400" />
          <span>{mirrored ? 'Đang lật gương kính lái' : 'Chế độ xem trực tiếp'}</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[2.75rem] px-4 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition"
        >
          <X className="w-4 h-4" />
          <span>Thoát HUD</span>
        </button>
      </div>

      {/* Khu vực chiếu lên kính lái (lật gương trục dọc/ngang chuẩn HUD đặt taplo!) */}
      <div
        className="flex-1 flex flex-col items-center justify-center gap-6 transition-transform duration-300"
        style={{ transform: mirrored ? 'scaleY(-1)' : 'none' }}
      >
        {/* Dẫn đường sắp tới nếu đang có lộ trình */}
        {activeNavSummary && (
          <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border-2 border-cyan-400/70 bg-cyan-950/30 text-cyan-300 max-w-2xl">
            <Navigation className="w-8 h-8 shrink-0 text-cyan-300" />
            <div className="min-w-0">
              <p className="text-lg sm:text-2xl font-black truncate">
                {activeNavSummary.nextInstruction || activeNavSummary.destinationName}
              </p>
              <p className="text-sm sm:text-base font-bold text-cyan-200/80">
                Còn {activeNavSummary.remainingKm.toFixed(1)} km •{' '}
                {Math.max(1, Math.round(activeNavSummary.remainingMin))} phút
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo Camera cá nhân gần đó */}
        {telemetry.nearbyCustomHazard && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-amber-400 text-amber-300 text-base sm:text-lg font-black animate-pulse">
            <AlertTriangle className="w-5 h-5" />
            <span>
              {telemetry.nearbyCustomHazard.pin.label} • {telemetry.nearbyCustomHazard.distanceM}m
            </span>
          </div>
        )}

        {/* Khối tốc độ khổng lồ + Biển báo P.127 */}
        <div className="flex items-center justify-center gap-8 sm:gap-14">
          <div className="text-center">
            <div
              className={`text-[6.5rem] sm:text-[9.5rem] leading-none font-black tabular-nums tracking-tighter ${
                isOver ? 'text-rose-500 animate-pulse' : 'text-emerald-400'
              }`}
            >
              {speed}
            </div>
            <div className="text-lg sm:text-2xl font-black tracking-widest uppercase text-emerald-300/80 mt-1">
              KM/H
            </div>
          </div>

          {limit !== null && (
            <div
              className={`w-28 h-28 sm:w-36 sm:h-36 rounded-full border-[10px] flex flex-col items-center justify-center bg-black ${
                isOver ? 'border-rose-500 text-rose-400 animate-pulse' : 'border-red-600 text-white'
              }`}
            >
              <span className="text-4xl sm:text-5xl font-black tabular-nums leading-none">
                {limit}
              </span>
              <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-white/70 mt-0.5">
                TỐI ĐA
              </span>
            </div>
          )}

          {telemetry.roadInfo?.parkingRestriction && (
            <div className="flex flex-col items-center gap-1">
              <ParkingSignSvg
                type={telemetry.roadInfo.parkingRestriction.type}
                className="w-24 h-24 sm:w-32 sm:h-32"
              />
              <span className="text-xs sm:text-sm font-black text-rose-400 uppercase tracking-wider">
                {telemetry.roadInfo.parkingRestriction.signCode}
              </span>
            </div>
          )}
        </div>

        {/* Thanh thông tin Pin VF5 + Tên đường + Giờ */}
        <div className="flex flex-wrap items-center justify-center gap-5 text-base sm:text-xl font-black">
          <span className="flex items-center gap-1.5 text-emerald-300">
            <BatteryCharging className="w-5 h-5" />
            <span>
              {batterySoc}% (~{rangeKm} km)
            </span>
          </span>
          {telemetry.roadInfo?.roadName && (
            <span className="text-sky-300 truncate max-w-md">
              {telemetry.roadInfo.roadName}
            </span>
          )}
          <span className="text-white/80 tabular-nums">{clockTime}</span>
        </div>
      </div>

      <p className="text-center text-[11px] font-semibold text-white/35">
        Đặt màn hình lên mặt taplo sát kính lái ban đêm • Chạm bất kỳ đâu để thoát HUD
      </p>
    </div>
  );
};
