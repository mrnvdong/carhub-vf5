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
}

/**
 * Hook to handle:
 * 1. VinFast VF5 / Android Box / CarPlay steering wheel hardware buttons (MediaTrackNext, MediaTrackPrevious, Play/Pause)
 * 2. Standard keyboard shortcuts on car screens / bluetooth remotes
 * 3. HTML5 MediaSession API for Apple CarPlay (APTV) & Android Auto
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
}: CarHardwareControlsOptions) {
  // Use refs so event listeners always call the latest callbacks without re-attaching listeners
  const callbacksRef = useRef({
    onPlay,
    onPause,
    onTogglePlay,
    onNext,
    onPrev,
    onSeekRelative,
    onSeekTo,
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
    };
  });

  // 1. GLOBAL KEYBOARD / HARDWARE MEDIA KEYS LISTENER
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a text input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key;
      const code = e.code;
      const keyCode = e.keyCode;

      // VF5 Steering Wheel & Android Car Media Keys:
      // KEYCODE_MEDIA_NEXT = 87, MediaTrackNext = 176
      if (
        key === 'MediaTrackNext' ||
        code === 'MediaTrackNext' ||
        keyCode === 176 ||
        keyCode === 87 ||
        key === 'TrackNext' ||
        code === 'TrackNext'
      ) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onNext();
        return;
      }

      // KEYCODE_MEDIA_PREVIOUS = 88, MediaTrackPrevious = 177
      if (
        key === 'MediaTrackPrevious' ||
        code === 'MediaTrackPrevious' ||
        keyCode === 177 ||
        keyCode === 88 ||
        key === 'TrackPrevious' ||
        code === 'TrackPrevious'
      ) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onPrev();
        return;
      }

      // KEYCODE_MEDIA_PLAY_PAUSE = 85, MediaPlayPause = 179
      if (
        key === 'MediaPlayPause' ||
        code === 'MediaPlayPause' ||
        keyCode === 179 ||
        keyCode === 85
      ) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onTogglePlay();
        return;
      }

      // KEYCODE_MEDIA_PLAY = 126
      if (key === 'MediaPlay' || keyCode === 126) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onPlay();
        return;
      }

      // KEYCODE_MEDIA_PAUSE = 127, MediaStop = 178
      if (
        key === 'MediaPause' ||
        keyCode === 127 ||
        key === 'MediaStop' ||
        keyCode === 178
      ) {
        e.preventDefault();
        e.stopPropagation();
        callbacksRef.current.onPause();
        return;
      }

      // Generic Shortcuts for in-car keypads, remotes, or USB wheel controllers:
      // Space: Play/Pause
      if (key === ' ' || code === 'Space') {
        e.preventDefault();
        callbacksRef.current.onTogglePlay();
        return;
      }

      // ArrowRight: Tua tới 10s (hoặc Shift + ArrowRight: Next bài)
      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          callbacksRef.current.onNext();
        } else {
          callbacksRef.current.onSeekRelative(10);
        }
        return;
      }

      // ArrowLeft: Tua lùi 10s (hoặc Shift + ArrowLeft: Prev bài)
      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          callbacksRef.current.onPrev();
        } else {
          callbacksRef.current.onSeekRelative(-10);
        }
        return;
      }

      // Key N / Key P / PageDown / PageUp for steering wheel adapters
      if (code === 'KeyN' || key === 'PageDown' || key === ']') {
        e.preventDefault();
        callbacksRef.current.onNext();
        return;
      }
      if (code === 'KeyP' || key === 'PageUp' || key === '[') {
        e.preventDefault();
        callbacksRef.current.onPrev();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, []);

  // 2. HTML5 MEDIASESSION API (Apple CarPlay APTV / Android Auto)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (streamData) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: streamData.title || 'CarHub Video',
          artist: streamData.uploader || 'VinFast VF5',
          album: 'CarHub - VF5 YouTube Player',
          artwork: [
            {
              src: streamData.thumbnailUrl,
              sizes: '96x96',
              type: 'image/jpeg',
            },
            {
              src: streamData.thumbnailUrl,
              sizes: '128x128',
              type: 'image/jpeg',
            },
            {
              src: streamData.thumbnailUrl,
              sizes: '256x256',
              type: 'image/jpeg',
            },
            {
              src: streamData.thumbnailUrl,
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ],
        });
      } catch (e) {
        console.warn('Failed to set MediaMetadata:', e);
      }
    }

    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {}

    const registerHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported action in old webkit
      }
    };

    registerHandler('play', () => callbacksRef.current.onPlay());
    registerHandler('pause', () => callbacksRef.current.onPause());
    registerHandler('stop', () => callbacksRef.current.onPause());
    registerHandler('nexttrack', () => callbacksRef.current.onNext());
    registerHandler('previoustrack', () => callbacksRef.current.onPrev());
    registerHandler('seekbackward', (details) => {
      callbacksRef.current.onSeekRelative(-(details.seekOffset || 10));
    });
    registerHandler('seekforward', (details) => {
      callbacksRef.current.onSeekRelative(details.seekOffset || 10);
    });
    registerHandler('seekto', (details) => {
      if (
        typeof details.seekTime === 'number' &&
        callbacksRef.current.onSeekTo
      ) {
        callbacksRef.current.onSeekTo(details.seekTime);
      }
    });
  }, [streamData, isPlaying]);

  // 3. Update MediaSession Position State safely
  useEffect(() => {
    if (
      !('mediaSession' in navigator) ||
      !navigator.mediaSession.setPositionState
    ) {
      return;
    }

    if (duration > 0 && isFinite(duration) && isFinite(currentTime)) {
      try {
        const validPos = Math.max(0, Math.min(currentTime, duration));
        navigator.mediaSession.setPositionState({
          duration: Math.round(duration),
          playbackRate: isPlaying ? 1 : 0,
          position: Math.round(validPos),
        });
      } catch (e) {
        // Ignore pos state error if media ended or state changing
      }
    }
  }, [currentTime, duration, isPlaying]);
}
