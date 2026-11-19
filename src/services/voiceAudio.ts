// Unified iOS WKWebView-safe Audio & Vietnamese Voice Engine for VinFast VF5
// - Unlocks a single shared AudioContext on first touch/click so speed & turn chimes NEVER get muted by iOS CarPlay
// - Speaks Vietnamese turn-by-turn navigation & camera/speed alerts via Web SpeechSynthesis (vi-VN)

let sharedAudioCtx: AudioContext | null = null;
let unlockBound = false;
let cachedViVoice: SpeechSynthesisVoice | null = null;
let lastSpokenKey = '';
let lastSpokenAt = 0;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

export function unlockCarAudio(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    // Emit an inaudible 1-sample buffer to permanently unlock WebAudio on iOS WebKit
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {}
}

export function initCarAudioUnlockListener(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;

  const onFirstGesture = () => {
    unlockCarAudio();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('touchstart', onFirstGesture, true);
    window.removeEventListener('click', onFirstGesture, true);
  };

  window.addEventListener('pointerdown', onFirstGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', onFirstGesture, { capture: true, passive: true });
  window.addEventListener('click', onFirstGesture, { capture: true, passive: true });
}

// Automatically arm unlock listener as soon as module loads
initCarAudioUnlockListener();

// 2 tiếng bíp cao cảnh báo vượt tốc độ (độc lập với YouTube iframe)
export function playSpeedWarningBeep(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const tone = (offset: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    };

    tone(0, 880);
    tone(0.18, 1046.5);
  } catch {}
}

// Tiếng ding nhẹ nhàng báo sắp tới ngã rẽ / nhận điểm đến từ điện thoại
export function playTurnChime(): void {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const chime = (offset: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.02);
    };

    chime(0, 587.33, 0.12); // D5
    chime(0.11, 880, 0.18); // A5
  } catch {}
}

function pickVietnameseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (cachedViVoice) return cachedViVoice;

  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    const vi =
      voices.find((v) => v.lang.toLowerCase() === 'vi-vn' && /linh|an|minh/i.test(v.name)) ||
      voices.find((v) => v.lang.toLowerCase() === 'vi-vn') ||
      voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (vi) cachedViVoice = vi;
    return vi || null;
  } catch {
    return null;
  }
}

export function speakVietnamese(
  text: string,
  options?: { dedupeKey?: string; cooldownMs?: number; chime?: boolean }
): void {
  const clean = text.trim();
  if (!clean || typeof window === 'undefined') return;

  const dedupeKey = options?.dedupeKey || clean;
  const cooldownMs = options?.cooldownMs ?? 12000;
  const now = Date.now();
  if (dedupeKey === lastSpokenKey && now - lastSpokenAt < cooldownMs) {
    return;
  }
  lastSpokenKey = dedupeKey;
  lastSpokenAt = now;

  if (options?.chime) {
    playTurnChime();
  }

  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'vi-VN';
    utter.rate = 1.04;
    utter.pitch = 1.0;
    utter.volume = 0.95;
    const voice = pickVietnameseVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  } catch {}
}
