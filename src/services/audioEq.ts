// Bộ xử lý âm thanh DSP / Equalizer 5 băng tần cho loa zin VinFast VF5 (Web Audio API)
// Hỗ trợ:
// - 5 băng tần: 60Hz (Sub/Bass), 230Hz (Mid-Bass), 910Hz (Vocal), 3.6kHz (Presence), 14kHz (Treble)
// - Preset tinh chỉnh sẵn cho khoang cabin VF5
// - Speed-Sensitive Volume: tự động tăng nhẹ gain +0% -> +18% khi xe chạy 40 -> 100 km/h để lấn tiếng ồn lốp!
// - An toàn tuyệt đối trên iOS Safari / CarPlay WKWebView: CHỈ gắn createMediaElementSource khi
//   AudioContext đã 'running' (tuyệt đối KHÔNG bao giờ nhốt âm thanh vào AudioContext 'suspended' gây im tiếng!).

import { EqPresetId, EqSettings } from '../types';

const EQ_STORAGE_KEY = 'carhub_vf5_audio_eq_v1';

export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;
export const EQ_BAND_LABELS = ['60Hz', '230Hz', '910Hz', '3.6kHz', '14kHz'] as const;

export const EQ_PRESETS: Record<
  Exclude<EqPresetId, 'custom'>,
  { label: string; icon: string; desc: string; gains: [number, number, number, number, number] }
> = {
  flat: {
    label: 'Nguyên bản',
    icon: '➖',
    desc: 'Âm thanh gốc không can thiệp',
    gains: [0, 0, 0, 0, 0],
  },
  'vf5-bass': {
    label: 'VF5 Bass Boost',
    icon: '🔊',
    desc: 'Bù bass trầm & treble sáng cho loa zin VF5',
    gains: [5, 3, 0, 2, 3],
  },
  vocal: {
    label: 'Giọng nói / Báo',
    icon: '🎙️',
    desc: 'Rõ tiếng thuyết minh, podcast & Báo Audio',
    gains: [-2, 0, 4, 3, 1],
  },
  bolero: {
    label: 'Bolero Ấm',
    icon: '📻',
    desc: 'Âm trung dày ấm, dịu tai đường dài',
    gains: [3, 2, 1, -1, 1],
  },
  edm: {
    label: 'EDM / Vinahouse',
    icon: '⚡',
    desc: 'Bass đánh lực + treble sắc nét',
    gains: [6, 3, -1, 2, 5],
  },
};

export function loadEqSettings(): EqSettings {
  try {
    const raw = localStorage.getItem(EQ_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p?.gains) && p.gains.length === 5) {
        return {
          preset: (p.preset || 'flat') as EqPresetId,
          gains: p.gains.map((g: any) => Math.max(-10, Math.min(10, Number(g) || 0))) as [
            number,
            number,
            number,
            number,
            number
          ],
          speedVolumeEnabled: Boolean(p.speedVolumeEnabled),
        };
      }
    }
  } catch {}
  return {
    preset: 'flat',
    gains: [0, 0, 0, 0, 0],
    speedVolumeEnabled: false,
  };
}

export function saveEqSettings(settings: EqSettings): void {
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function isEqProcessingActive(settings: EqSettings = currentSettings): boolean {
  return settings.gains.some((g) => g !== 0) || Boolean(settings.speedVolumeEnabled);
}

interface AttachedGraph {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
  gainNode: GainNode;
}

const attachedNodes = new WeakMap<HTMLMediaElement, AttachedGraph>();
let currentSettings: EqSettings = loadEqSettings();
let currentSpeedKmh = 0;
let sharedEqCtx: AudioContext | null = null;

function getOrCreateSharedEqContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedEqCtx && sharedEqCtx.state !== 'closed') return sharedEqCtx;
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    sharedEqCtx = new AudioCtx();
    return sharedEqCtx;
  } catch {
    return null;
  }
}

export function unlockEqAudioContext(): void {
  if (!isEqProcessingActive(currentSettings)) return;
  const ctx = getOrCreateSharedEqContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function computeSpeedGain(speedKmh: number, enabled: boolean): number {
  if (!enabled || !Number.isFinite(speedKmh) || speedKmh < 40) return 1.0;
  const ratio = Math.min(1, Math.max(0, (speedKmh - 40) / 60));
  return 1.0 + ratio * 0.18; // Tối đa +18% gain ở 100 km/h
}

function applyToGraph(graph: AttachedGraph): void {
  try {
    const now = graph.ctx.currentTime;
    for (let i = 0; i < graph.filters.length; i++) {
      graph.filters[i].gain.setTargetAtTime(currentSettings.gains[i] || 0, now, 0.04);
    }
    const targetGain = computeSpeedGain(currentSpeedKmh, currentSettings.speedVolumeEnabled);
    graph.gainNode.gain.setTargetAtTime(targetGain, now, 0.25);
  } catch {}
}

/**
 * Gắn EQ vào thẻ <audio> hoặc <video> đã bật crossOrigin="anonymous".
 * An toàn tuyệt đối trên iOS Safari: CHỈ capture media khi AudioContext đã ở trạng thái 'running'
 * để không bao giờ gây im tiếng trên iPhone / CarPlay!
 */
export function attachAudioEq(el: HTMLMediaElement | null): void {
  if (!el || typeof window === 'undefined') return;
  const existing = attachedNodes.get(el);
  if (existing) {
    if (existing.ctx.state === 'suspended') {
      existing.ctx.resume().catch(() => {});
    }
    applyToGraph(existing);
    return;
  }

  // Chỉ khởi tạo Web Audio graph khi người dùng thực sự bật EQ hoặc Speed-Volume
  if (!isEqProcessingActive(currentSettings)) return;
  if (el.crossOrigin !== 'anonymous') return;

  const ctx = getOrCreateSharedEqContext();
  if (!ctx) return;

  const wireIfRunning = () => {
    if (attachedNodes.has(el) || ctx.state !== 'running') return;
    try {
      const source = ctx.createMediaElementSource(el);
      const filters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
        const f = ctx.createBiquadFilter();
        f.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = currentSettings.gains[idx] || 0;
        return f;
      });
      const gainNode = ctx.createGain();
      gainNode.gain.value = computeSpeedGain(currentSpeedKmh, currentSettings.speedVolumeEnabled);

      let chain: AudioNode = source;
      for (const f of filters) {
        chain.connect(f);
        chain = f;
      }
      chain.connect(gainNode);
      gainNode.connect(ctx.destination);

      attachedNodes.set(el, { ctx, filters, gainNode });
    } catch {
      // Bỏ qua lặng lẽ nếu trình duyệt/luồng không cho phép Web Audio capture
    }
  };

  if (ctx.state === 'running') {
    wireIfRunning();
  } else {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') wireIfRunning();
      })
      .catch(() => {
        // Không resume được (không có cử chỉ người dùng trên iOS) -> để <audio> phát tự nhiên không mất tiếng!
      });
  }
}

export function updateGlobalEqSettings(
  next: EqSettings,
  activeElements: Array<HTMLMediaElement | null> = []
): void {
  currentSettings = next;
  saveEqSettings(next);
  if (isEqProcessingActive(next)) {
    unlockEqAudioContext();
  }
  for (const el of activeElements) {
    if (!el) continue;
    const g = attachedNodes.get(el);
    if (g) {
      if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
      applyToGraph(g);
    } else if (el.crossOrigin === 'anonymous') {
      attachAudioEq(el);
    }
  }
}

export function updateGlobalEqSpeed(
  speedKmh: number | null,
  activeElements: Array<HTMLMediaElement | null> = []
): void {
  currentSpeedKmh = typeof speedKmh === 'number' && Number.isFinite(speedKmh) ? speedKmh : 0;
  for (const el of activeElements) {
    if (!el) continue;
    const g = attachedNodes.get(el);
    if (g) applyToGraph(g);
  }
}
