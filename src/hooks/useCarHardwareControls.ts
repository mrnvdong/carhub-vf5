import { useEffect, useRef } from 'react';
import { StreamData } from '../types';

interface CarHardwareControlsOptions {
  streamData: StreamData | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekRelative: (seconds: number) => void;
  onSeekTo?: (time: number) => void;
  onHardwareAction?: (actionLabel: string) => void;
}

/**
 * Hook điều khiển phím cứng vô lăng chuyên biệt cho VinFast VF5:
 * 1. Tương thích Apple CarPlay (APTV) & Bluetooth AVRCP qua HTML5 MediaSession API
 *    (Chú ý: Tắt seekbackward/seekforward trên MediaSession để iOS CarPlay kích hoạt đúng
 *    nút Next Track / Previous Track trên vô lăng VF5 thay vì nút tua 10s của Podcast).
 * 2. Tương thích Android Box / Màn hình Android / CAN-bus KeyCode qua KeyboardEvent toàn cục.
 */
export function useCarHardwareControls({
  streamData,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onTogglePlay,
  onNext,
  onPrev,
  onSeekRelative,
  onSeekTo,
  onHardwareAction,
}: CarHardwareControlsOptions) {
  const callbacksRef = useRef({
    onPlay,
    onPause,
    onTogglePlay,
    onNext,
    onPrev,
    onSeekRelative,
    onSeekTo,
    onHardwareAction,
  });

  useEffect(() => {
    callbacksRef.current = {
      onPlay,
      onPause,
      onTogglePlay,
      onNext,
      onPrev,
      onSeekRelative,
      onSeekTo,
      onHardwareAction,
    };
  });

  // 1. GLOBAL KEYBOARD / HARDWARE MEDIA KEYS LISTENER (VF5 CAN-bus / Android Box / Bluetooth Remote)
  useEffect(() => {
    let lastKeyTime = 0;

    const handleKeyEvent = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      const key = e.key || '';
      const code = e.code || '';
      const keyCode = e.keyCode || e.which || 0;

      const notify = (label: string) => {
        callbacksRef.current.onHardwareAction?.(label);
      };

      // NEXT TRACK: MediaTrackNext (176), Android KEYCODE_MEDIA_NEXT (87)
      if (
        key === 'MediaTrackNext' ||
        code === 'MediaTrackNext' ||
        key === 'TrackNext' ||
        code === 'TrackNext' ||
        keyCode === 176 ||
        keyCode === 87
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (now - lastKeyTime > 250) {
          lastKeyTime = now;
          notify('⏭️ Vô lăng: Bài tiếp theo');
          callbacksRef.current.onNext();
        }
        return;
      }

      // PREVIOUS TRACK: MediaTrackPrevious (177), Android KEYCODE_MEDIA_PREVIOUS (88)
      if (
        key === 'MediaTrackPrevious' ||
        code === 'MediaTrackPrevious' ||
        key === 'TrackPrevious' ||
        code === 'TrackPrevious' ||
        keyCode === 177 ||
        keyCode === 88
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (now - lastKeyTime > 250) {
          lastKeyTime = now;
          notify('⏮️ Vô lăng: Bài trước đó');
          callbacksRef.current.onPrev();
        }
        return;
      }

      // PLAY / PAUSE TOGGLE: MediaPlayPause (179), Android KEYCODE_MEDIA_PLAY_PAUSE (85)
      if (
        key === 'MediaPlayPause' ||
        code === 'MediaPlayPause' ||
        keyCode === 179 ||
        keyCode === 85
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (now - lastKeyTime > 250) {
          lastKeyTime = now;
          notify('⏯️ Vô lăng: Phát / Tạm dừng');
          callbacksRef.current.onTogglePlay();
        }
        return;
      }

      // PLAY: MediaPlay (126)
      if (key === 'MediaPlay' || code === 'MediaPlay' || keyCode === 126) {
        e.preventDefault();
        e.stopPropagation();
        notify('▶️ Vô lăng: Phát nhạc');
        callbacksRef.current.onPlay();
        return;
      }

      // PAUSE / STOP: MediaPause (127), MediaStop (178)
      if (
        key === 'MediaPause' ||
        code === 'MediaPause' ||
        key === 'MediaStop' ||
        code === 'MediaStop' ||
        keyCode === 127 ||
        keyCode === 178
      ) {
        e.preventDefault();
        e.stopPropagation();
        notify('⏸️ Vô lăng: Tạm dừng');
        callbacksRef.current.onPause();
        return;
      }

      // Phím PageDown / PageUp / N / P / [ / ] thường được box vô lăng map sang chuyển bài
      if (code === 'KeyN' || key === 'PageDown' || key === ']') {
        e.preventDefault();
        notify('⏭️ Bài tiếp theo');
        callbacksRef.current.onNext();
        return;
      }
      if (code === 'KeyP' || key === 'PageUp' || key === '[') {
        e.preventDefault();
        notify('⏮️ Bài trước đó');
        callbacksRef.current.onPrev();
        return;
      }

      // Space: Play / Pause
      if (key === ' ' || code === 'Space') {
        e.preventDefault();
        notify('⏯️ Phát / Tạm dừng');
        callbacksRef.current.onTogglePlay();
        return;
      }

      // ArrowRight / ArrowLeft
      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          notify('⏭️ Bài tiếp theo');
          callbacksRef.current.onNext();
        } else {
          notify('⏩ Tua +10s');
          callbacksRef.current.onSeekRelative(10);
        }
        return;
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          notify('⏮️ Bài trước đó');
          callbacksRef.current.onPrev();
        } else {
          notify('⏪ Tua -10s');
          callbacksRef.current.onSeekRelative(-10);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyEvent, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyEvent, { capture: true });
    };
  }, []);

  // 2. HTML5 MEDIASESSION API (Apple CarPlay APTV & Bluetooth AVRCP trên VinFast VF5)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    if (streamData && streamData.title) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: streamData.title,
          artist: streamData.uploader || 'CarHub YouTube Music',
          album: 'VinFast VF5 Audio',
          artwork: streamData.thumbnailUrl
            ? [
                { src: streamData.thumbnailUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: streamData.thumbnailUrl, sizes: '128x128', type: 'image/jpeg' },
                { src: streamData.thumbnailUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: streamData.thumbnailUrl, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [],
        });
      } catch (e) {
        console.warn('MediaMetadata error:', e);
      }
    }

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported actions
      }
    };

    safeSetHandler('play', () => {
      callbacksRef.current.onHardwareAction?.('▶️ Vô lăng: Tiếp tục phát');
      callbacksRef.current.onPlay();
    });

    safeSetHandler('pause', () => {
      callbacksRef.current.onHardwareAction?.('⏸️ Vô lăng: Tạm dừng');
      callbacksRef.current.onPause();
    });

    safeSetHandler('stop', () => {
      callbacksRef.current.onPause();
    });

    safeSetHandler('nexttrack', () => {
      callbacksRef.current.onHardwareAction?.('⏭️ Vô lăng: Bài tiếp theo');
      callbacksRef.current.onNext();
    });

    safeSetHandler('previoustrack', () => {
      callbacksRef.current.onHardwareAction?.('⏮️ Vô lăng: Bài trước đó');
      callbacksRef.current.onPrev();
    });

    // QUAN TRỌNG CHO IOS CARPLAY & VF5:
    // Phải đặt seekbackward & seekforward = null để iOS MPRemoteCommandCenter
    // hiển thị và nhận lệnh Next Track / Previous Track từ phím cứng vô lăng VF5!
    safeSetHandler('seekbackward', null);
    safeSetHandler('seekforward', null);

    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number' && callbacksRef.current.onSeekTo) {
        callbacksRef.current.onSeekTo(details.seekTime);
      }
    });
  }, [streamData?.id, streamData?.title, streamData?.uploader, streamData?.thumbnailUrl, isPlaying]);

  // 3. Cập nhật vị trí thời gian thực cho màn hình xe / CarPlay
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession.setPositionState
    ) {
      return;
    }

    if (duration > 0 && isFinite(duration) && isFinite(currentTime)) {
      try {
        const validPos = Math.max(0, Math.min(currentTime, duration));
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, Math.round(duration)),
          playbackRate: isPlaying ? 1 : 0,
          position: Math.round(validPos),
        });
      } catch {}
    }
  }, [Math.floor(currentTime), Math.floor(duration), isPlaying]);
}
