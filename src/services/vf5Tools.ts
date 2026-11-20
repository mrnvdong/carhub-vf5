// Các tiện ích chuyên biệt cho VinFast VF5:
// - Ước tính tầm chạy & % Pin khi tới đích (VF5 Plus 37.23 kWh ~ 285 km thực tế ≈ 2.85 km/%)
// - Ghim Camera phạt nguội / Điểm đen cá nhân (lưu localStorage + đồng bộ CARHUB_KV)
// - Khóa hình video an toàn khi xe chạy > 15 km/h & Ưu tiên Phim Thuyết Minh

import { CustomHazardKind, CustomHazardPin } from '../types';

const BATTERY_SOC_KEY = 'carhub_vf5_battery_soc';
const BATTERY_EFF_KEY = 'carhub_vf5_km_per_pct';
const CUSTOM_HAZARDS_KEY = 'carhub_custom_hazards_v1';
const DRIVING_LOCK_KEY = 'carhub_driving_video_lock';
const MOVIE_PREFER_DUB_KEY = 'carhub_movie_prefer_dub';

export function loadVf5BatterySoc(): number {
  try {
    const v = Number(localStorage.getItem(BATTERY_SOC_KEY));
    if (Number.isFinite(v) && v >= 5 && v <= 100) return Math.round(v);
  } catch {}
  return 78;
}

export function saveVf5BatterySoc(soc: number): number {
  const clamped = Math.max(5, Math.min(100, Math.round(soc)));
  try {
    localStorage.setItem(BATTERY_SOC_KEY, String(clamped));
  } catch {}
  return clamped;
}

export function loadVf5KmPerPct(): number {
  try {
    const v = Number(localStorage.getItem(BATTERY_EFF_KEY));
    if (Number.isFinite(v) && v >= 2.0 && v <= 3.6) return Math.round(v * 100) / 100;
  } catch {}
  return 2.85; // VF5 Plus thực tế hỗn hợp ~285 km / 100%
}

export function saveVf5KmPerPct(kmPerPct: number): number {
  const clamped = Math.max(2.0, Math.min(3.6, Math.round(kmPerPct * 100) / 100));
  try {
    localStorage.setItem(BATTERY_EFF_KEY, String(clamped));
  } catch {}
  return clamped;
}

export function estimateArrivalSoc(
  currentSoc: number,
  tripDistanceKm: number,
  kmPerPct: number
): { arrivalSoc: number; rangeKm: number; needsCharge: boolean } {
  const rangeKm = Math.round(currentSoc * kmPerPct);
  const usedPct = tripDistanceKm / Math.max(1.5, kmPerPct);
  const arrivalSoc = Math.round(currentSoc - usedPct);
  return {
    arrivalSoc,
    rangeKm,
    needsCharge: arrivalSoc < 18,
  };
}

export function loadCustomHazards(): CustomHazardPin[] {
  try {
    const raw = localStorage.getItem(CUSTOM_HAZARDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x.lat === 'number' && typeof x.lon === 'number').slice(0, 50);
  } catch {
    return [];
  }
}

export function saveCustomHazards(pins: CustomHazardPin[]): void {
  try {
    localStorage.setItem(CUSTOM_HAZARDS_KEY, JSON.stringify(pins.slice(0, 50)));
  } catch {}
}

export function getHazardKindMeta(kind: CustomHazardKind): { icon: string; defaultLabel: string } {
  switch (kind) {
    case 'camera':
      return { icon: '📷', defaultLabel: 'Camera phạt nguội' };
    case 'no_stopping':
      return { icon: '🚫', defaultLabel: 'Cấm dừng & đỗ (P.130)' };
    case 'no_parking':
      return { icon: '⛔', defaultLabel: 'Cấm đỗ xe (P.131a)' };
    case 'police':
      return { icon: '🚨', defaultLabel: 'Điểm chốt kiểm tra' };
    case 'pothole':
      return { icon: '🕳️', defaultLabel: 'Đường xấu / Ổ gà' };
    case 'speedbump':
      return { icon: '⚠️', defaultLabel: 'Gờ giảm tốc lớn' };
    default:
      return { icon: '📍', defaultLabel: 'Điểm chú ý cá nhân' };
  }
}

export function loadDrivingVideoLock(): boolean {
  try {
    return localStorage.getItem(DRIVING_LOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDrivingVideoLock(enabled: boolean): void {
  try {
    localStorage.setItem(DRIVING_LOCK_KEY, enabled ? '1' : '0');
  } catch {}
}

export function loadMoviePreferDub(): boolean {
  try {
    const v = localStorage.getItem(MOVIE_PREFER_DUB_KEY);
    return v === null ? true : v === '1'; // Mặc định ưu tiên Thuyết minh trên xe VF5!
  } catch {
    return true;
  }
}

export function saveMoviePreferDub(enabled: boolean): void {
  try {
    localStorage.setItem(MOVIE_PREFER_DUB_KEY, enabled ? '1' : '0');
  } catch {}
}
