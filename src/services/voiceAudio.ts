// Unified iOS WKWebView-safe Audio & Vietnamese Voice Engine for VinFast VF5
// - Unlocks a single shared AudioContext on first touch/click so speed & turn chimes NEVER get muted by iOS CarPlay
// - Speaks Vietnamese turn-by-turn navigation & camera/speed alerts via Web SpeechSynthesis (vi-VN)
// - Automatically snapshots & resumes interrupted media (YouTube, SoundCloud, TV, News, Movies) on iOS/CarPlay after speech ends!

let sharedAudioCtx: AudioContext | null = null;
let unlockBound = false;
let cachedViVoice: SpeechSynthesisVoice | null = null;
let lastSpokenKey = '';
let lastSpokenAt = 0;

// Hook khôi phục nhạc/video/TV/báo tự động sau khi giọng nói cảnh báo/chỉ đường đọc xong trên iOS CarPlay
type MediaResumeProvider = () => (() => void) | null;
let mediaResumeProvider: MediaResumeProvider | null = null;
let pendingResumeFn: (() => void) | null = null;
let resumeTimerPrimary: number | null = null;
let resumeTimerRetry: number | null = null;
let speechWatchdogTimer: number | null = null;
let activeSpeechSeq = 0;

export function registerMediaResumeHandler(provider: MediaResumeProvider): () => void {
  mediaResumeProvider = provider;
  return () => {
    if (mediaResumeProvider === provider) {
      mediaResumeProvider = null;
    }
  };
}

function clearResumeTimers(): void {
  if (resumeTimerPrimary !== null) {
    window.clearTimeout(resumeTimerPrimary);
    resumeTimerPrimary = null;
  }
  if (resumeTimerRetry !== null) {
    window.clearTimeout(resumeTimerRetry);
    resumeTimerRetry = null;
  }
  if (speechWatchdogTimer !== null) {
    window.clearTimeout(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
}

function flushPendingMediaResume(expectedSeq?: number): void {
  if (expectedSeq !== undefined && expectedSeq !== activeSpeechSeq) return;
  if (speechWatchdogTimer !== null) {
    window.clearTimeout(speechWatchdogTimer);
    speechWatchdogTimer = null;
  }
  const resume = pendingResumeFn;
  if (!resume) return;
  pendingResumeFn = null;

  // Chờ 220ms để iOS AVAudioSession nhả quyền âm thanh từ SpeechSynthesis rồi phát tiếp nhạc mượt mà
  resumeTimerPrimary = window.setTimeout(() => {
    resumeTimerPrimary = null;
    try {
      resume();
    } catch {}
    // Nhịp dự phòng +650ms riêng cho YouTube iframe trên iOS Safari nếu bị khựng ở nhịp đầu
    resumeTimerRetry = window.setTimeout(() => {
      resumeTimerRetry = null;
      try {
        resume();
      } catch {}
    }, 650);
  }, 220);
}

export function cancelVietnameseSpeech(): void {
  if (typeof window === 'undefined') return;
  activeSpeechSeq += 1;
  clearResumeTimers();
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {}
  flushPendingMediaResume();
}

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
    // Chụp lại luồng media đang chạy (Nhạc / Video / TV / Báo / Phim) TRƯỚC khi SpeechSynthesis chiếm kênh âm thanh iOS
    if (!pendingResumeFn && mediaResumeProvider) {
      try {
        pendingResumeFn = mediaResumeProvider();
      } catch {
        pendingResumeFn = null;
      }
    }

    clearResumeTimers();
    const seq = ++activeSpeechSeq;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'vi-VN';
    utter.rate = 1.04;
    utter.pitch = 1.0;
    utter.volume = 0.95;
    const voice = pickVietnameseVoice();
    if (voice) utter.voice = voice;

    utter.onend = () => flushPendingMediaResume(seq);
    utter.onerror = () => flushPendingMediaResume(seq);

    // Watchdog an toàn phòng iOS WebKit thỉnh thoảng bỏ quên sự kiện onend -> vẫn chắc chắn phát lại nhạc!
    const maxEstimateMs = Math.min(12000, Math.max(2800, clean.length * 105 + 1000));
    speechWatchdogTimer = window.setTimeout(() => {
      if (seq !== activeSpeechSeq) return;
      try {
        if (window.speechSynthesis.speaking) {
          // Chờ thêm 1.5s nếu câu dài vẫn đang đọc dở
          speechWatchdogTimer = window.setTimeout(() => flushPendingMediaResume(seq), 1500);
          return;
        }
      } catch {}
      flushPendingMediaResume(seq);
    }, maxEstimateMs);

    window.speechSynthesis.speak(utter);
  } catch {
    flushPendingMediaResume();
  }
}
