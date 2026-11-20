import React, { useState } from 'react';
import {
  X,
  BatteryCharging,
  Sliders,
  MapPin,
  Shield,
  Gauge,
  RotateCcw,
  Zap,
  Trash2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  ActiveNavSummary,
  CustomHazardKind,
  CustomHazardPin,
  EqPresetId,
  EqSettings,
} from '../types';
import { CockpitTelemetry } from '../hooks/useCockpitTelemetry';
import { getCarTheme } from '../utils/theme';
import {
  estimateArrivalSoc,
  getHazardKindMeta,
} from '../services/vf5Tools';
import { EQ_BAND_LABELS, EQ_PRESETS } from '../services/audioEq';

type ToolsTab = 'ev' | 'eq' | 'hazards' | 'safety';

interface HealthReport {
  status: string;
  kvBound: boolean;
  ttsProvider: string;
  upstreams: Array<{ name: string; ok: boolean; status: number; latencyMs: number }>;
}

interface Vf5ToolsModalProps {
  isOpen: boolean;
  initialTab?: ToolsTab;
  onClose: () => void;
  isLightTheme: boolean;
  telemetry: CockpitTelemetry;
  activeNavSummary: ActiveNavSummary | null;
  batterySoc: number;
  kmPerPct: number;
  onChangeBatterySoc: (soc: number) => void;
  onChangeKmPerPct: (eff: number) => void;
  onFindEvChargers: () => void;
  onOpenHud: () => void;
  eqSettings: EqSettings;
  onChangeEqSettings: (next: EqSettings) => void;
  customHazards: CustomHazardPin[];
  onAddCustomHazard: (kind: CustomHazardKind, label?: string) => void;
  onRemoveCustomHazard: (id: string) => void;
  drivingVideoLock: boolean;
  onToggleDrivingVideoLock: () => void;
  moviePreferDub: boolean;
  onToggleMoviePreferDub: () => void;
}

function formatDurationHm(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}g ${m}p`;
  return `${m} phút`;
}

export const Vf5ToolsModal: React.FC<Vf5ToolsModalProps> = ({
  isOpen,
  initialTab = 'ev',
  onClose,
  isLightTheme,
  telemetry,
  activeNavSummary,
  batterySoc,
  kmPerPct,
  onChangeBatterySoc,
  onChangeKmPerPct,
  onFindEvChargers,
  onOpenHud,
  eqSettings,
  onChangeEqSettings,
  customHazards,
  onAddCustomHazard,
  onRemoveCustomHazard,
  drivingVideoLock,
  onToggleDrivingVideoLock,
  moviePreferDub,
  onToggleMoviePreferDub,
}) => {
  const theme = getCarTheme(isLightTheme);
  const [tab, setTab] = useState<ToolsTab>(initialTab);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<boolean>(false);

  if (!isOpen) return null;

  const est = estimateArrivalSoc(
    batterySoc,
    activeNavSummary?.remainingKm || 0,
    kmPerPct
  );

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  };

  const applyPreset = (presetId: Exclude<EqPresetId, 'custom'>) => {
    onChangeEqSettings({
      ...eqSettings,
      preset: presetId,
      gains: [...EQ_PRESETS[presetId].gains] as [number, number, number, number, number],
    });
  };

  const handleBandChange = (idx: number, val: number) => {
    const nextGains = [...eqSettings.gains] as [number, number, number, number, number];
    nextGains[idx] = val;
    onChangeEqSettings({
      ...eqSettings,
      preset: 'custom',
      gains: nextGains,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[105] bg-black/70 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 animate-ios-sheet-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full max-w-2xl max-h-[90dvh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${theme.cardElevated}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-current/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className={`text-sm sm:text-base font-black truncate ${theme.text}`}>
                Tiện Ích Khoang Lái VinFast VF5
              </h2>
              <p className={`text-[11px] font-semibold truncate ${theme.textSub}`}>
                Dự báo Pin EV • DSP Loa VF5 • Camera cá nhân • HUD &amp; An toàn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng tiện ích VF5"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 active:scale-95 transition ${theme.iconBtn}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Tabs */}
        <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {(
            [
              { id: 'ev', icon: BatteryCharging, label: 'Pin & Hành trình' },
              { id: 'eq', icon: Sliders, label: 'DSP Loa VF5' },
              { id: 'hazards', icon: MapPin, label: `Camera (${customHazards.length})` },
              { id: 'safety', icon: Shield, label: 'An toàn & Hệ thống' },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[2.45rem] px-3 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 transition ${
                  active
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                    : theme.chipIdle
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* TAB 1: PIN VF5 & TRIP COMPUTER & HUD */}
          {tab === 'ev' && (
            <>
              <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.card}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="w-5 h-5 text-emerald-400" />
                    <span className={`text-sm font-black ${theme.text}`}>
                      Dự báo Pin VinFast VF5 Plus
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-black tabular-nums ${
                      batterySoc <= 20
                        ? 'bg-rose-600 text-white'
                        : batterySoc <= 40
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-emerald-500 text-slate-950'
                    }`}
                  >
                    {batterySoc}% • ~{est.rangeKm} km
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-bold mb-1">
                    <span className={theme.textSub}>Kéo mức % Pin hiện tại trên xe</span>
                    <span className={theme.text}>{batterySoc}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    value={batterySoc}
                    onChange={(e) => onChangeBatterySoc(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-2.5 cursor-pointer"
                  />
                </div>

                {/* Chọn mức tiêu thụ thực tế */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[11px] font-bold mr-1 ${theme.textSub}`}>
                    Chế độ chạy:
                  </span>
                  {[
                    { label: 'Cao tốc (2.45 km/%)', val: 2.45 },
                    { label: 'Hỗn hợp (2.85 km/%)', val: 2.85 },
                    { label: 'Đô thị Eco (3.15 km/%)', val: 3.15 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => onChangeKmPerPct(opt.val)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition active:scale-95 ${
                        Math.abs(kmPerPct - opt.val) < 0.05
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : theme.chipIdle
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Ước tính Pin khi tới đích (nếu đang dẫn đường) */}
                {activeNavSummary ? (
                  <div
                    className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${
                      est.needsCharge
                        ? 'bg-rose-500/15 border-rose-400/50 text-rose-200'
                        : 'bg-emerald-500/10 border-emerald-400/35'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-xs font-black truncate ${theme.text}`}>
                        Đích: {activeNavSummary.destinationName} (
                        {activeNavSummary.remainingKm.toFixed(1)} km)
                      </p>
                      <p className={`text-xs font-bold mt-0.5 ${theme.textSub}`}>
                        Pin dự kiến khi tới nơi:{' '}
                        <strong
                          className={
                            est.needsCharge ? 'text-rose-400' : 'text-emerald-400'
                          }
                        >
                          {est.arrivalSoc}%
                        </strong>{' '}
                        {est.needsCharge
                          ? '— ⚠️ Khuyến nghị ghé trạm sạc V-Green dọc đường!'
                          : '— Đủ pin an toàn'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onFindEvChargers();
                      }}
                      className="min-h-[2.4rem] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 active:scale-95"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Tìm trạm sạc V-Green</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onFindEvChargers();
                    }}
                    className="w-full min-h-[2.6rem] rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Tìm trạm sạc VinFast / V-Green gần nhất</span>
                  </button>
                )}
              </div>

              {/* Đồng Hồ Hành Trình (Trip Computer) & HUD Kính Lái */}
              <div className={`rounded-2xl border p-3.5 space-y-3 ${theme.card}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-sky-400" />
                    <span className={`text-sm font-black ${theme.text}`}>
                      Đồng hồ hành trình (Trip Computer)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={telemetry.resetTrip}
                    className={`min-h-[2rem] px-2.5 rounded-lg border text-[11px] font-extrabold flex items-center gap-1 active:scale-95 ${theme.iconBtn}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Đặt lại</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Quãng đường', val: `${telemetry.tripStats.distanceKm.toFixed(1)} km` },
                    { label: 'Thời gian', val: formatDurationHm(telemetry.tripStats.elapsedSec) },
                    { label: 'Tốc độ TB', val: `${telemetry.tripStats.avgSpeedKmh} km/h` },
                    { label: 'Tốc độ Max', val: `${telemetry.tripStats.maxSpeedKmh} km/h` },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className={`rounded-xl border p-2.5 text-center ${theme.cardElevated}`}
                    >
                      <div className={`text-[10px] font-bold ${theme.textSub}`}>{box.label}</div>
                      <div className={`text-sm sm:text-base font-black tabular-nums mt-0.5 ${theme.text}`}>
                        {box.val}
                      </div>
                    </div>
                  ))}
                </div>

                {telemetry.fatigueWarning && (
                  <div className="rounded-xl bg-amber-500/20 border border-amber-400/50 px-3 py-2 text-xs font-extrabold text-amber-300">
                    ☕ Bạn đã lái liên tục hơn 2 tiếng — hãy dừng nghỉ vài phút để đảm bảo tỉnh táo!
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHud();
                  }}
                  className="w-full min-h-[2.8rem] rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition shadow-lg"
                >
                  <span>🪞</span>
                  <span>Mở chế độ HUD Chiếu Kính Lái Ban Đêm</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 2: DSP / EQUALIZER 5 BĂNG TẦN */}
          {tab === 'eq' && (
            <div className={`rounded-2xl border p-3.5 space-y-3.5 ${theme.card}`}>
              <div className="space-y-1">
                <h3 className={`text-sm font-black flex items-center gap-2 ${theme.text}`}>
                  <Volume2 className="w-4 h-4 text-sky-400" />
                  <span>Bộ chỉnh âm thanh DSP 5 băng tần (Loa VF5)</span>
                </h3>
                <p className={`text-xs font-semibold ${theme.textSub}`}>
                  Áp dụng trực tiếp cho SoundCloud, Báo Audio &amp; Phim HLS (YouTube iframe dùng bộ giải mã riêng của Google).
                </p>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>).map((key) => {
                  const p = EQ_PRESETS[key];
                  const active = eqSettings.preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`p-2.5 rounded-xl border text-left active:scale-95 transition ${
                        active
                          ? 'bg-sky-600 border-sky-400 text-white shadow'
                          : theme.chipIdle
                      }`}
                    >
                      <div className="text-xs font-black flex items-center gap-1.5">
                        <span>{p.icon}</span>
                        <span>{p.label}</span>
                      </div>
                      <p
                        className={`text-[10px] mt-0.5 leading-snug ${
                          active ? 'text-sky-100' : theme.textSub
                        }`}
                      >
                        {p.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* 5 thanh trượt tần số */}
              <div className="space-y-2.5 pt-1">
                {EQ_BAND_LABELS.map((label, idx) => {
                  const val = eqSettings.gains[idx] ?? 0;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className={`w-12 text-xs font-black tabular-nums ${theme.textSub}`}>
                        {label}
                      </span>
                      <input
                        type="range"
                        min={-10}
                        max={10}
                        step={1}
                        value={val}
                        onChange={(e) => handleBandChange(idx, Number(e.target.value))}
                        className="flex-1 accent-sky-500 h-2 cursor-pointer"
                      />
                      <span
                        className={`w-11 text-right text-xs font-black tabular-nums ${
                          val > 0
                            ? 'text-emerald-400'
                            : val < 0
                            ? 'text-amber-400'
                            : theme.textSub
                        }`}
                      >
                        {val > 0 ? `+${val}` : val} dB
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Speed-Sensitive Volume */}
              <div
                className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${theme.cardElevated}`}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-black ${theme.text}`}>
                    🔊 Tự bù âm lượng theo tốc độ xe (40 → 100 km/h)
                  </p>
                  <p className={`text-[11px] font-semibold ${theme.textSub}`}>
                    Tự tăng tối đa +18% khi chạy cao tốc để lấn tiếng ồn lốp VF5.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChangeEqSettings({
                      ...eqSettings,
                      speedVolumeEnabled: !eqSettings.speedVolumeEnabled,
                    })
                  }
                  className={`min-h-[2.4rem] px-3.5 rounded-xl text-xs font-black shrink-0 active:scale-95 transition ${
                    eqSettings.speedVolumeEnabled
                      ? 'bg-emerald-500 text-slate-950'
                      : theme.iconBtn
                  }`}
                >
                  {eqSettings.speedVolumeEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: GHIM CAMERA PHẠT NGUỘI & ĐIỂM ĐEN CÁ NHÂN */}
          {tab === 'hazards' && (
            <div className="space-y-3">
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.card}`}>
                <h3 className={`text-sm font-black ${theme.text}`}>
                  📍 Ghim nhanh tại vị trí GPS hiện tại
                </h3>
                <p className={`text-xs font-semibold ${theme.textSub}`}>
                  Vị trí: {telemetry.position.lat.toFixed(5)}, {telemetry.position.lon.toFixed(5)} • Lần sau xe đi tới cách 350m sẽ tự động đọc cảnh báo bằng giọng nói!
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { kind: 'camera', icon: '📷', label: 'Camera phạt nguội' },
                      { kind: 'no_stopping', icon: '🚫', label: 'Cấm dừng & đỗ (P.130)' },
                      { kind: 'no_parking', icon: '⛔', label: 'Cấm đỗ xe (P.131a)' },
                      { kind: 'police', icon: '🚨', label: 'Chốt kiểm tra' },
                      { kind: 'pothole', icon: '🕳️', label: 'Đường xấu / Ổ gà' },
                      { kind: 'speedbump', icon: '⚠️', label: 'Gờ giảm tốc lớn' },
                    ] as Array<{ kind: CustomHazardKind; icon: string; label: string }>
                  ).map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => onAddCustomHazard(item.kind, item.label)}
                      className={`min-h-[2.8rem] px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition ${theme.iconBtn}`}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-3.5 space-y-2 ${theme.card}`}>
                <h4 className={`text-xs font-black uppercase tracking-wider ${theme.textSub}`}>
                  Danh sách điểm đã ghim ({customHazards.length}/50 — tự đồng bộ Mã Xe)
                </h4>
                {customHazards.length === 0 ? (
                  <p className={`text-xs font-semibold py-4 text-center ${theme.textMuted}`}>
                    Chưa có điểm cảnh báo cá nhân nào. Bấm 1 nút bên trên khi đi qua camera mới!
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {customHazards.map((pin) => {
                      const meta = getHazardKindMeta(pin.kind);
                      return (
                        <div
                          key={pin.id}
                          className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${theme.cardElevated}`}
                        >
                          <div className="min-w-0">
                            <p className={`text-xs font-black truncate ${theme.text}`}>
                              {meta.icon} {pin.label}
                            </p>
                            <p className={`text-[10px] font-semibold ${theme.textSub}`}>
                              {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveCustomHazard(pin.id)}
                            aria-label="Xóa điểm ghim"
                            className="w-9 h-9 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 flex items-center justify-center shrink-0 active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: AN TOÀN LÁI XE & KIỂM TRA SỨC KHỎE HỆ THỐNG */}
          {tab === 'safety' && (
            <div className="space-y-3">
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.card}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs sm:text-sm font-black ${theme.text}`}>
                      🛡️ Khóa hình Phim khi xe đang chạy (&gt; 15 km/h)
                    </p>
                    <p className={`text-[11px] font-semibold ${theme.textSub}`}>
                      Tự che hình bằng màn tối an toàn &amp; giữ nguyên tiếng (hành khách chạm 1 lần để mở khóa).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleDrivingVideoLock}
                    className={`min-h-[2.4rem] px-3.5 rounded-xl text-xs font-black shrink-0 active:scale-95 transition ${
                      drivingVideoLock
                        ? 'bg-emerald-500 text-slate-950'
                        : theme.iconBtn
                    }`}
                  >
                    {drivingVideoLock ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                  </button>
                </div>

                <div className="border-t border-current/10 pt-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs sm:text-sm font-black ${theme.text}`}>
                      🎙️ Luôn ưu tiên Server Phim Thuyết Minh / Lồng Tiếng
                    </p>
                    <p className={`text-[11px] font-semibold ${theme.textSub}`}>
                      Mở phim sẽ tự chọn bản Thuyết minh trước để nghe trên xe không cần nhìn phụ đề.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleMoviePreferDub}
                    className={`min-h-[2.4rem] px-3.5 rounded-xl text-xs font-black shrink-0 active:scale-95 transition ${
                      moviePreferDub
                        ? 'bg-violet-600 text-white'
                        : theme.iconBtn
                    }`}
                  >
                    {moviePreferDub ? 'ƯU TIÊN' : 'MẶC ĐỊNH'}
                  </button>
                </div>
              </div>

              {/* System Health Monitor */}
              <div className={`rounded-2xl border p-3.5 space-y-2.5 ${theme.card}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-xs sm:text-sm font-black flex items-center gap-1.5 ${theme.text}`}>
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Trạng thái máy chủ &amp; nguồn dữ liệu</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleCheckHealth}
                    disabled={checkingHealth}
                    className="min-h-[2.2rem] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center gap-1.5 active:scale-95 disabled:opacity-60"
                  >
                    {checkingHealth ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                    <span>Kiểm tra ngay</span>
                  </button>
                </div>

                {health && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-1.5 text-[11px] font-extrabold">
                      <span
                        className={`px-2 py-1 rounded-lg ${
                          health.kvBound
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        Cloudflare KV: {health.kvBound ? 'Online' : 'Local/Edge'}
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300">
                        TTS: {health.ttsProvider}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {health.upstreams.map((u) => (
                        <div
                          key={u.name}
                          className={`rounded-xl border px-2.5 py-2 flex items-center justify-between text-xs font-bold ${theme.cardElevated}`}
                        >
                          <span className="uppercase">{u.name}</span>
                          <span
                            className={`flex items-center gap-1 tabular-nums ${
                              u.ok ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {u.ok ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            {u.latencyMs}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
