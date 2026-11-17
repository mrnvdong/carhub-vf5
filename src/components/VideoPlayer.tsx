import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  SkipBack,
  Maximize2,
  Minimize2,
  Headphones,
  Tv,
  Star,
  ShieldCheck,
  Loader2,
  Radio,
  AlertCircle,
  RefreshCw,
  Lock,
  Layers,
  Heart,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
  ListMusic,
  Compass,
  History,
  Bookmark,
  ChevronDown,
  Search,
  Mic,
  Clock,
  ZoomIn,
  ZoomOut,
  Quote,
} from 'lucide-react';
import {
  StreamData,
  PlayerMode,
  ActiveSource,
  ViewMode,
  RepeatMode,
  VideoItem,
  UiScale,
} from '../types';
import { formatSeconds } from '../services/api';
import { fetchSyncedLyrics, LyricsResult } from '../services/lyrics';
import { useCarHardwareControls } from '../hooks/useCarHardwareControls';

const YTMUSIC_CATEGORIES = [
  { id: 'remix', label: '🔥 Remix Lái Xe', query: 'nhạc trẻ remix bass cực căng lái xe' },
  { id: 'vinahouse', label: '⚡ Vinahouse', query: 'vinahouse nonstop căng đét' },
  { id: 'driving', label: '🚗 Đường Dài', query: 'nhạc lái xe đường dài hay nhất' },
  { id: 'chill', label: '☕ Lofi Chill', query: 'nhạc lofi chill tiếng mưa lái xe' },
  { id: 'bolero', label: '📻 Bolero', query: 'bolero trữ tình hay nhất trên ô tô' },
  { id: 'podcast', label: '🎙️ Podcast', query: 'hieu tv podcast hay nhất' },
  { id: 'kids', label: '👶 Thiếu Nhi', query: 'ca nhạc thiếu nhi vui nhộn cho bé' },
];

interface VideoPlayerProps {
  streamData: StreamData;
  isLoading: boolean;
  playerMode: PlayerMode;
  onPlayerModeChange: (mode: PlayerMode) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onRetry?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (view: ViewMode) => void;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  repeatMode?: RepeatMode;
  onToggleRepeat?: () => void;
  queueVideos?: VideoItem[];
  currentVideoId?: string;
  onSelectVideo?: (video: VideoItem) => void;
  isLoadingQueue?: boolean;
  hasMoreQueue?: boolean;
  isLoadingMoreQueue?: boolean;
  onLoadMoreQueue?: () => void;
  selectedCategory?: string;
  onSelectCategory?: (catId: string, query: string) => void;
  activeTab?: 'explore' | 'history' | 'favorites';
  onChangeTab?: (tab: 'explore' | 'history' | 'favorites') => void;
  favoritesCount?: number;
  historyCount?: number;
  onOpenSearchModal?: (startVoice?: boolean) => void;
  uiScale?: UiScale;
  onChangeUiScale?: (scale: UiScale) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamData,
  isLoading,
  playerMode,
  onPlayerModeChange,
  onNext,
  onPrev,
  onRetry,
  hasNext,
  hasPrev,
  isFavorite,
  onToggleFavorite,
  viewMode = 'ytmusic',
  onViewModeChange,
  isShuffle = false,
  onToggleShuffle,
  repeatMode = 'all',
  onToggleRepeat,
  queueVideos = [],
  currentVideoId,
  onSelectVideo,
  isLoadingQueue = false,
  hasMoreQueue = false,
  isLoadingMoreQueue = false,
  onLoadMoreQueue,
  selectedCategory = 'remix',
  onSelectCategory,
  activeTab = 'explore',
  onChangeTab,
  favoritesCount = 0,
  historyCount = 0,
  onOpenSearchModal,
  uiScale = 'large',
  onChangeUiScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncAudioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevTimeRef = useRef<number>(0);
  const activeLyricRef = useRef<HTMLButtonElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [hardwareNotice, setHardwareNotice] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Apple Music UI state:
  // railSection: 'nowPlaying' (Two-pane Now Playing + Lyrics) | 'browse' (Playlists/Categories) | 'favorites' | 'history'
  const [railSection, setRailSection] = useState<'nowPlaying' | 'browse' | 'favorites' | 'history'>('nowPlaying');
  const [rightPaneTab, setRightPaneTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [lyricsData, setLyricsData] = useState<LyricsResult | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [clockTime, setClockTime] = useState<string>('');

  const isStub = streamData.source === 'init';
  const hasAudioStream = (streamData.audioStreams?.length ?? 0) > 0;
  const hasDirectVideo = (streamData.videoStreams?.length ?? 0) > 0;
  const hasHls = Boolean(streamData.hlsUrl);

  const isAudioOnlyMode = viewMode === 'ytmusic' || playerMode === 'audio';

  const initialQuality = (streamData.videoStreams || [])[0]?.quality || '1080p';
  const [selectedQuality, setSelectedQuality] = useState<string>(initialQuality);

  const determineBestSource = (): ActiveSource => {
    if (isStub) return 'proxy';
    if (hasAudioStream || hasDirectVideo) {
      if (streamData.source?.startsWith('edge-innertube')) {
        return 'proxy';
      }
      return 'direct';
    }
    if (hasHls) return 'hls';
    return 'embed';
  };

  const [activeSource, setActiveSource] = useState<ActiveSource>(determineBestSource);

  const isEmbed = activeSource === 'embed';
  const useProxy = activeSource === 'proxy';
  const isHlsActive = activeSource === 'hls';

  const usePureAudioElement = Boolean(
    isAudioOnlyMode && hasAudioStream && !isEmbed && !isHlsActive
  );

  const activeVideoStream =
    hasDirectVideo && !isHlsActive && !isEmbed
      ? streamData.videoStreams.find((s) => s.quality === selectedQuality) ||
        streamData.videoStreams[0]
      : null;

  const isAudioSyncNeeded = Boolean(
    !isAudioOnlyMode &&
      !isEmbed &&
      !isHlsActive &&
      activeVideoStream?.needsAudioSync &&
      hasAudioStream
  );

  const rawAudioSyncUrl = isAudioSyncNeeded ? streamData.audioStreams[0]?.url : '';
  const finalAudioSyncUrl =
    useProxy && rawAudioSyncUrl && rawAudioSyncUrl.includes('googlevideo.com')
      ? `/api/proxy?url=${encodeURIComponent(rawAudioSyncUrl)}`
      : rawAudioSyncUrl;

  // Clock update for vertical rail
  useEffect(() => {
    const update = () => {
      setClockTime(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    update();
    const id = setInterval(update, 15000);
    return () => clearInterval(id);
  }, []);

  // Fetch synced lyrics whenever song changes
  useEffect(() => {
    if (!streamData.id || isStub) return;
    let cancelled = false;
    setIsLoadingLyrics(true);
    setLyricsData(null);

    fetchSyncedLyrics(streamData.id, streamData.title, streamData.uploader)
      .then((res) => {
        if (!cancelled) {
          setLyricsData(res);
          setIsLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingLyrics(false);
      });

    return () => {
      cancelled = true;
    };
  }, [streamData.id, streamData.title, streamData.uploader, isStub]);

  // Compute active lyric line index
  const activeLyricIndex = React.useMemo(() => {
    if (!lyricsData || !lyricsData.isSynced || lyricsData.lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lyricsData.lines.length; i++) {
      if (currentTime >= lyricsData.lines[i].time - 0.2) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyricsData, currentTime]);

  // Auto-scroll active lyric line into center
  useEffect(() => {
    if (rightPaneTab === 'lyrics' && railSection === 'nowPlaying' && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIndex, rightPaneTab, railSection]);

  // Sync source when actual streamData resolves
  useEffect(() => {
    if (isStub) return;
    setPlaybackError(null);
    setDuration(streamData.duration || 0);
    setActiveSource(determineBestSource());
    setSelectedQuality((streamData.videoStreams || [])[0]?.quality || '1080p');
  }, [streamData.id, streamData.source]);

  useEffect(() => {
    setCurrentTime(0);
    setIsBuffering(true);
    prevTimeRef.current = 0;
  }, [streamData.id]);

  const showHardwareToast = (label: string) => {
    setHardwareNotice(label);
    setTimeout(() => {
      setHardwareNotice((prev) => (prev === label ? null : prev));
    }, 2200);
  };

  const handleSelectSource = (src: ActiveSource) => {
    setPlaybackError(null);
    if (currentTime > 1) {
      prevTimeRef.current = currentTime;
    }
    setActiveSource(src);

    if (src === 'proxy') setModeNotice('Đã chuyển sang 4G Edge Proxy');
    else if (src === 'direct') setModeNotice('Đã chuyển sang Direct Stream');
    else if (src === 'hls') setModeNotice('Đã chuyển sang HLS Stream');
    else if (src === 'embed') setModeNotice('Đã chuyển sang YouTube Embed');
    setTimeout(() => setModeNotice(null), 3000);
  };

  const getStreamUrl = (): string => {
    if (isStub || isEmbed) return '';

    if (usePureAudioElement) {
      const bestAudio = streamData.audioStreams[0];
      if (!bestAudio) return '';
      if (useProxy && bestAudio.url.includes('googlevideo.com')) {
        return `/api/proxy?url=${encodeURIComponent(bestAudio.url)}`;
      }
      return bestAudio.url;
    }

    if (isHlsActive && streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    const fallbackStream = activeVideoStream || streamData.audioStreams?.[0];
    if (!fallbackStream) return '';

    if (useProxy && fallbackStream.url.includes('googlevideo.com')) {
      return `/api/proxy?url=${encodeURIComponent(fallbackStream.url)}`;
    }
    return fallbackStream.url;
  };

  const finalStreamUrl = getStreamUrl();

  // Manage pure <audio> element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!usePureAudioElement || isEmbed) {
      audio.pause();
      return;
    }

    if (isStub || !finalStreamUrl) return;

    if (videoRef.current && !videoRef.current.paused) {
      if (videoRef.current.currentTime > 1 && prevTimeRef.current === 0) {
        prevTimeRef.current = videoRef.current.currentTime;
      }
      videoRef.current.pause();
    }

    if (audio.src !== finalStreamUrl && !audio.src.endsWith(finalStreamUrl)) {
      audio.src = finalStreamUrl;
      audio.load();
    }

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch((err) => {
          console.warn('[Audio] Autoplay or stream error:', err);
        });
    }
  }, [finalStreamUrl, usePureAudioElement, isEmbed, isStub]);

  // Manage <video> element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (usePureAudioElement || isEmbed) {
      video.pause();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    if (isStub || !finalStreamUrl) return;

    if (audioRef.current && !audioRef.current.paused) {
      if (audioRef.current.currentTime > 1 && prevTimeRef.current === 0) {
        prevTimeRef.current = audioRef.current.currentTime;
      }
      audioRef.current.pause();
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHlsActive) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(finalStreamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsBuffering(false);
          video.play().catch(() => setIsPlaying(false));
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) handleMediaError('hls-fatal');
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalStreamUrl;
        video.load();
        video.play().catch(() => setIsPlaying(false));
      }
    } else {
      video.src = finalStreamUrl;
      video.load();
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [finalStreamUrl, usePureAudioElement, isEmbed, isHlsActive, isStub]);

  // Sync audio for 1080p video
  useEffect(() => {
    const syncAudio = syncAudioRef.current;
    if (!syncAudio) return;

    if (!isAudioSyncNeeded || !finalAudioSyncUrl || isStub) {
      syncAudio.pause();
      return;
    }

    syncAudio.src = finalAudioSyncUrl;
    syncAudio.load();

    if (videoRef.current && !videoRef.current.paused) {
      syncAudio.currentTime = videoRef.current.currentTime;
      syncAudio.play().catch(console.warn);
    }
  }, [finalAudioSyncUrl, isAudioSyncNeeded, isStub]);

  const handleMediaError = (reasonOrEvent?: string | React.SyntheticEvent) => {
    if (isStub || isLoading) return;
    const reason = typeof reasonOrEvent === 'string' ? reasonOrEvent : 'media-event-error';
    console.warn(`[Auto-Heal] Stream error (${reason}) on source=${activeSource}`);

    if (activeSource === 'direct' && (hasAudioStream || hasDirectVideo)) {
      setActiveSource('proxy');
      setPlaybackError(null);
      return;
    }

    if (activeSource === 'proxy' && (hasAudioStream || hasDirectVideo)) {
      if (hasHls) {
        setActiveSource('hls');
        setPlaybackError(null);
        return;
      }
      setActiveSource('direct');
      setPlaybackError(null);
      return;
    }

    if (activeSource !== 'hls' && hasHls) {
      setActiveSource('hls');
      setPlaybackError(null);
      return;
    }

    if (streamData.embedUrl && activeSource !== 'embed') {
      setActiveSource('embed');
      setPlaybackError(null);
      return;
    }

    setIsPlaying(false);
    setIsBuffering(false);
    setPlaybackError('Không thể phát bài hát này. Vui lòng chuyển bài tiếp theo.');
  };

  useEffect(() => {
    if (isStub || isLoading || !isBuffering || isEmbed || isPlaying || Boolean(playbackError) || !finalStreamUrl) {
      return;
    }

    const timer = setTimeout(() => {
      if (isBuffering && !isPlaying && !isEmbed) {
        handleMediaError('stalled-buffering');
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isBuffering, isPlaying, isEmbed, playbackError, finalStreamUrl, isStub, isLoading]);

  const postEmbedCommand = (command: string, args: any[] = []) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: command,
          args,
        }),
        '*'
      );
    } catch {}
  };

  useEffect(() => {
    if (!isEmbed) return;

    const handleWindowMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data?.event === 'infoDelivery' && data?.info) {
          if (typeof data.info.currentTime === 'number') {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === 'number') {
            const state = data.info.playerState;
            if (state === 1) {
              setIsPlaying(true);
              setIsBuffering(false);
            } else if (state === 2) {
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (state === 3) {
              setIsBuffering(true);
            } else if (state === 0) {
              setIsPlaying(false);
              if (repeatMode === 'one') {
                postEmbedCommand('seekTo', [0, true]);
                postEmbedCommand('playVideo');
              } else if (onNext) {
                onNext();
              }
            }
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [isEmbed, onNext, repeatMode]);

  const handleIframeLoad = () => {
    setIsBuffering(false);
    setIsPlaying(true);
    const iframe = iframeRef.current;
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch {}
    }
  };

  const getActiveMediaElement = (): HTMLMediaElement | null => {
    if (isEmbed) return null;
    return usePureAudioElement ? audioRef.current : videoRef.current;
  };

  const handlePlayExplicit = () => {
    if (playbackError) return;
    if (isEmbed) {
      postEmbedCommand('playVideo');
      setIsPlaying(true);
      return;
    }
    const el = getActiveMediaElement();
    if (!el) return;
    el.play().catch(console.warn);
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = el.currentTime;
      syncAudioRef.current.play().catch(console.warn);
    }
  };

  const handlePauseExplicit = () => {
    if (isEmbed) {
      postEmbedCommand('pauseVideo');
      setIsPlaying(false);
      return;
    }
    const el = getActiveMediaElement();
    if (!el) return;
    el.pause();
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.pause();
    }
  };

  const togglePlay = () => {
    if (playbackError) return;
    if (isEmbed) {
      if (isPlaying) handlePauseExplicit();
      else handlePlayExplicit();
      return;
    }
    const el = getActiveMediaElement();
    if (!el) return;
    if (el.paused) handlePlayExplicit();
    else handlePauseExplicit();
  };

  const handleSeekRelative = (seconds: number) => {
    if (playbackError) return;
    if (isEmbed) {
      const maxDur = duration || 100;
      const newTime = Math.max(0, Math.min(currentTime + seconds, maxDur));
      setCurrentTime(newTime);
      postEmbedCommand('seekTo', [newTime, true]);
      return;
    }
    const el = getActiveMediaElement();
    if (!el) return;
    const maxDur = el.duration || duration || 0;
    const newTime = Math.max(0, Math.min(el.currentTime + seconds, maxDur));
    el.currentTime = newTime;
    setCurrentTime(newTime);
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = newTime;
    }
  };

  const handleSeekTo = (val: number) => {
    setCurrentTime(val);
    if (isEmbed) {
      postEmbedCommand('seekTo', [val, true]);
      return;
    }
    const el = getActiveMediaElement();
    if (el) el.currentTime = val;
    if (isAudioSyncNeeded && syncAudioRef.current) {
      syncAudioRef.current.currentTime = val;
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSeekTo(parseFloat(e.target.value));
  };

  const handleTimeUpdate = () => {
    const el = getActiveMediaElement();
    if (!el) return;
    const curr = el.currentTime;
    setCurrentTime(curr);

    if (isAudioSyncNeeded && syncAudioRef.current && !el.paused) {
      const drift = Math.abs(syncAudioRef.current.currentTime - curr);
      if (drift > 0.25) syncAudioRef.current.currentTime = curr;
      if (syncAudioRef.current.paused) syncAudioRef.current.play().catch(console.warn);
    }

    if (!isEmbed && streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end - 0.5) {
          el.currentTime = segment.end;
          if (isAudioSyncNeeded && syncAudioRef.current) {
            syncAudioRef.current.currentTime = segment.end;
          }
          setSponsorSkippedNotice(`Đã tự động tua qua đoạn ${segment.category}`);
          setTimeout(() => setSponsorSkippedNotice(null), 3000);
          break;
        }
      }
    }
  };

  useCarHardwareControls({
    streamData,
    isPlaying,
    currentTime,
    duration,
    onPlay: handlePlayExplicit,
    onPause: handlePauseExplicit,
    onTogglePlay: togglePlay,
    onNext: () => {
      if (onNext) onNext();
    },
    onPrev: () => {
      if (onPrev) onPrev();
    },
    onSeekRelative: handleSeekRelative,
    onSeekTo: handleSeekTo,
    onHardwareAction: showHardwareToast,
  });

  const handleQualityChange = (q: string) => {
    if (videoRef.current && videoRef.current.currentTime > 0) {
      prevTimeRef.current = videoRef.current.currentTime;
    }
    setSelectedQuality(q);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const cycleScale = () => {
    if (!onChangeUiScale) return;
    if (uiScale === 'normal') onChangeUiScale('large');
    else if (uiScale === 'large') onChangeUiScale('xlarge');
    else onChangeUiScale('normal');
  };

  const uniqueQualities = Array.from(
    new Set((streamData.videoStreams || []).map((v) => v.quality))
  );

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedIframeUrl = `https://www.youtube-nocookie.com/embed/${streamData.id}?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(embedOrigin)}`;

  // Giữ các phần tử media cố định trong DOM.
  // Nếu rơi vào Embed khi đang ở chế độ Audio (Apple Music), đặt kích thước tối thiểu 1px thay vì 0x0 để iOS Safari không chặn phát!
  const isVideoVisible = viewMode === 'classic' && playerMode === 'video';

  const persistentMediaNode = (
    <div
      className={
        isVideoVisible
          ? 'w-full h-full flex items-center justify-center'
          : 'w-[2px] h-[2px] opacity-[0.01] pointer-events-none fixed bottom-0 right-0 overflow-hidden'
      }
    >
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onPlay={() => {
          if (usePureAudioElement) {
            setIsPlaying(true);
            setIsBuffering(false);
          }
        }}
        onPlaying={() => {
          if (usePureAudioElement) {
            setIsPlaying(true);
            setIsBuffering(false);
          }
        }}
        onWaiting={() => {
          if (usePureAudioElement) setIsBuffering(true);
        }}
        onPause={() => {
          if (usePureAudioElement) setIsPlaying(false);
        }}
        onTimeUpdate={() => {
          if (usePureAudioElement) handleTimeUpdate();
        }}
        onError={() => {
          if (usePureAudioElement) handleMediaError('audio-element-error');
        }}
        onLoadedMetadata={() => {
          if (!usePureAudioElement) return;
          setIsBuffering(false);
          if (audioRef.current && audioRef.current.duration && isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
          if (prevTimeRef.current > 0 && audioRef.current) {
            audioRef.current.currentTime = prevTimeRef.current;
            prevTimeRef.current = 0;
          }
        }}
        onEnded={() => {
          if (!usePureAudioElement) return;
          setIsPlaying(false);
          if (repeatMode === 'one' && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(console.warn);
          } else if (onNext) {
            onNext();
          }
        }}
      />

      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
        muted={isAudioSyncNeeded}
        controls={false}
        onPlay={() => {
          if (!usePureAudioElement && !isEmbed) {
            setIsPlaying(true);
            setIsBuffering(false);
            if (isAudioSyncNeeded && syncAudioRef.current) {
              syncAudioRef.current.currentTime = videoRef.current?.currentTime || 0;
              syncAudioRef.current.play().catch(console.warn);
            }
          }
        }}
        onPlaying={() => {
          if (!usePureAudioElement && !isEmbed) {
            setIsPlaying(true);
            setIsBuffering(false);
            if (isAudioSyncNeeded && syncAudioRef.current) {
              syncAudioRef.current.currentTime = videoRef.current?.currentTime || 0;
              syncAudioRef.current.play().catch(console.warn);
            }
          }
        }}
        onWaiting={() => {
          if (!usePureAudioElement && !isEmbed) {
            setIsBuffering(true);
            if (isAudioSyncNeeded && syncAudioRef.current) syncAudioRef.current.pause();
          }
        }}
        onPause={() => {
          if (!usePureAudioElement && !isEmbed) {
            setIsPlaying(false);
            if (isAudioSyncNeeded && syncAudioRef.current) syncAudioRef.current.pause();
          }
        }}
        onSeeking={() => {
          if (isAudioSyncNeeded && syncAudioRef.current && videoRef.current) {
            syncAudioRef.current.currentTime = videoRef.current.currentTime;
          }
        }}
        onSeeked={() => {
          if (isAudioSyncNeeded && syncAudioRef.current && videoRef.current) {
            syncAudioRef.current.currentTime = videoRef.current.currentTime;
          }
        }}
        onTimeUpdate={() => {
          if (!usePureAudioElement && !isEmbed) handleTimeUpdate();
        }}
        onError={() => {
          if (!usePureAudioElement && !isEmbed) handleMediaError('video-element-error');
        }}
        onLoadedMetadata={() => {
          if (usePureAudioElement || isEmbed) return;
          setIsBuffering(false);
          if (videoRef.current && videoRef.current.duration && isFinite(videoRef.current.duration)) {
            setDuration(videoRef.current.duration);
          }
          if (prevTimeRef.current > 0 && videoRef.current) {
            videoRef.current.currentTime = prevTimeRef.current;
            if (isAudioSyncNeeded && syncAudioRef.current) {
              syncAudioRef.current.currentTime = prevTimeRef.current;
            }
            prevTimeRef.current = 0;
          }
        }}
        onEnded={() => {
          if (usePureAudioElement || isEmbed) return;
          setIsPlaying(false);
          if (isAudioSyncNeeded && syncAudioRef.current) syncAudioRef.current.pause();
          if (repeatMode === 'one' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(console.warn);
          } else if (onNext) {
            onNext();
          }
        }}
        onClick={togglePlay}
      />

      <audio
        ref={syncAudioRef}
        preload="auto"
        playsInline
        className="hidden"
        onError={(e) => console.warn('Sync audio error:', e)}
      />

      {isEmbed && streamData.embedUrl && (
        <div className="relative w-full h-full flex flex-col">
          <iframe
            ref={iframeRef}
            src={embedIframeUrl}
            title={streamData.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onLoad={handleIframeLoad}
          />
        </div>
      )}
    </div>
  );

  // ===========================================================================
  // GIAO DIỆN CHÍNH: APPLE MUSIC LYRICS TEMPLATE (TWO-PANE LANDSCAPE CANVAS)
  // - Nền Full-bleed Ambient Gradient lấy màu từ ảnh bìa album
  // - Thanh Rail dọc Liquid Glass bên trái (Đang phát | Khám phá | Tìm kiếm | Thư viện | Video)
  // - Màn hình 2 cột: Trái là Artwork + Scrubber + Transport; Phải là Lyrics đồng bộ thời gian thực / Up Next
  // - Khi duyệt danh sách: Hiện Floating Liquid Glass Mini Player ở đáy màn hình
  // ===========================================================================
  if (viewMode === 'ytmusic') {
    const remainingTime = Math.max(0, (duration || 0) - currentTime);

    return (
      <div className="relative w-full min-h-[calc(100vh-16px)] rounded-3xl overflow-hidden bg-[#07070a] text-white select-none flex flex-col md:flex-row shadow-2xl border border-white/10">
        {persistentMediaNode}

        {/* FULL-BLEED DYNAMIC COLOR FIELD BACKDROP (Lấy màu từ ảnh bìa bài hát) */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-1000 scale-125 opacity-60 blur-[95px]"
          style={{
            backgroundImage: `url(${streamData.thumbnailUrl})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-black/55 via-black/45 to-black/80" />

        {/* Toast thông báo phím cứng vô lăng VF5 / SponsorBlock */}
        {(hardwareNotice || sponsorSkippedNotice || modeNotice) && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-white/15 backdrop-blur-2xl text-white px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-2xl border border-white/25">
            <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{hardwareNotice || sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {/* 1. VERTICAL LIQUID GLASS TAB RAIL (Bên trái trên màn hình ngang VF5) */}
        <aside className="relative z-20 flex md:flex-col items-center justify-between gap-2 p-2.5 md:py-5 md:px-2.5 bg-white/[0.06] backdrop-blur-2xl border-b md:border-b-0 md:border-r border-white/15 shrink-0">
          {/* Logo Apple/Music Glass */}
          <div className="hidden md:flex flex-col items-center gap-1 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30 border border-white/20">
              <Music className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-white/60 uppercase">
              Music
            </span>
          </div>

          {/* Rail Navigation Buttons */}
          <nav className="flex md:flex-col items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setRailSection('nowPlaying')}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl transition active:scale-95 ${
                railSection === 'nowPlaying'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Headphones className="w-5 h-5" />
              <span className="text-[10px] font-bold">Đang phát</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRailSection('browse');
                if (onChangeTab) onChangeTab('explore');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl transition active:scale-95 ${
                railSection === 'browse'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span className="text-[10px] font-bold">Khám phá</span>
            </button>

            {onOpenSearchModal && (
              <button
                type="button"
                onClick={() => onOpenSearchModal(false)}
                className="flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl text-white/60 hover:text-white hover:bg-white/10 transition active:scale-95"
              >
                <Search className="w-5 h-5" />
                <span className="text-[10px] font-bold">Tìm kiếm</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRailSection('favorites');
                if (onChangeTab) onChangeTab('favorites');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl transition active:scale-95 ${
                railSection === 'favorites'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bookmark className="w-5 h-5" />
              <span className="text-[10px] font-bold">Đã lưu ({favoritesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRailSection('history');
                if (onChangeTab) onChangeTab('history');
              }}
              className={`flex flex-col items-center justify-center gap-1 w-16 md:w-18 py-2 rounded-2xl transition active:scale-95 ${
                railSection === 'history'
                  ? 'bg-white/20 text-white shadow-inner border border-white/25'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-5 h-5" />
              <span className="text-[10px] font-bold">Lịch sử</span>
            </button>
          </nav>

          {/* Bottom Tools on Rail: Voice, Scale, Switch to Video, Clock */}
          <div className="flex md:flex-col items-center gap-1.5 shrink-0">
            {onOpenSearchModal && (
              <button
                type="button"
                onClick={() => onOpenSearchModal(true)}
                className="w-11 h-11 rounded-2xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 text-rose-200 flex items-center justify-center transition active:scale-95"
                title="Tìm kiếm giọng nói"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}

            {onChangeUiScale && (
              <button
                type="button"
                onClick={cycleScale}
                className="hidden sm:flex flex-col items-center justify-center w-14 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white/80 border border-white/10 transition active:scale-95"
                title="Đổi cỡ giao diện"
              >
                {uiScale === 'normal' ? '100%' : uiScale === 'large' ? '120%' : '132%'}
              </button>
            )}

            {onViewModeChange && (
              <button
                type="button"
                onClick={() => onViewModeChange('classic')}
                className="flex flex-col items-center justify-center gap-0.5 w-14 md:w-16 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white/85 border border-white/15 transition active:scale-95"
                title="Chuyển sang giao diện Xem Video"
              >
                <Tv className="w-4 h-4 text-sky-300" />
                <span className="text-[10px] font-bold">Video</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-1 text-[11px] font-mono font-bold text-white/50 pt-1">
              <Clock className="w-3 h-3" />
              <span>{clockTime}</span>
            </div>
          </div>
        </aside>

        {/* 2. MAIN CONTENT CANVAS */}
        <div className="relative z-10 flex-1 flex flex-col min-w-0 p-4 sm:p-6 md:p-8 overflow-hidden">
          {railSection === 'nowPlaying' ? (
            /* ===============================================================
               TWO-PANE LANDSCAPE NOW PLAYING + TIME-SYNCED LYRICS
               =============================================================== */
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center max-w-6xl mx-auto w-full">
              {/* LEFT PANE (5/12): Full-Bleed Square Artwork + Title + Scrubber + Transport */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center w-full max-w-md mx-auto">
                {/* Artwork with Apple Music scale-on-play physics */}
                <div
                  onClick={togglePlay}
                  className={`relative w-56 h-56 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-3xl overflow-hidden shadow-[0_24px_65px_rgba(0,0,0,0.75)] border border-white/15 cursor-pointer transition-transform duration-500 ease-out ${
                    isPlaying && !isBuffering ? 'scale-100' : 'scale-[0.93]'
                  }`}
                >
                  <img
                    src={streamData.thumbnailUrl}
                    alt={streamData.title}
                    className="w-full h-full object-cover"
                  />

                  {(isLoading || isBuffering) && (
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="w-12 h-12 text-white animate-spin" />
                    </div>
                  )}

                  {/* Source badge in corner */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white/85">
                    {activeSource === 'proxy'
                      ? '4G Proxy AAC'
                      : activeSource === 'direct'
                      ? 'Direct Audio'
                      : activeSource === 'hls'
                      ? 'HLS Audio'
                      : 'YouTube Embed'}
                  </div>
                </div>

                {/* Song Title, Artist & Favorite Heart */}
                <div className="w-full flex items-center justify-between gap-3 mt-6">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate tracking-tight">
                      {streamData.title}
                    </h2>
                    <p className="text-sm sm:text-base text-white/65 font-semibold truncate mt-0.5">
                      {streamData.uploader}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onToggleFavorite}
                    className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border transition active:scale-90 shrink-0 ${
                      isFavorite
                        ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                        : 'bg-white/10 border-white/15 text-white/70 hover:text-white'
                    }`}
                    title="Yêu thích"
                  >
                    <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-400' : ''}`} />
                  </button>
                </div>

                {/* Apple Music Scrubber Bar */}
                <div className="w-full mt-5 space-y-1.5">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    disabled={Boolean(playbackError)}
                    onChange={handleSeekChange}
                    className="w-full h-2 rounded-full cursor-pointer accent-white bg-white/20"
                  />
                  <div className="flex justify-between text-xs font-mono font-bold text-white/55">
                    <span>{formatSeconds(currentTime)}</span>
                    <span>-{formatSeconds(remainingTime)}</span>
                  </div>
                </div>

                {/* Apple Music Transport Controls */}
                <div className="w-full flex items-center justify-between mt-4 px-1">
                  <button
                    type="button"
                    onClick={onToggleShuffle}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 ${
                      isShuffle
                        ? 'bg-white/20 text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                    title="Phát ngẫu nhiên"
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    className="w-13 h-13 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 transition active:scale-90"
                    title="Bài trước"
                  >
                    <SkipBack className="w-7 h-7 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={togglePlay}
                    disabled={Boolean(playbackError)}
                    className="w-18 h-18 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-[0_8px_30px_rgba(255,255,255,0.25)] transition active:scale-90"
                    title={isPlaying ? 'Tạm dừng' : 'Phát'}
                  >
                    {isBuffering || isLoading ? (
                      <Loader2 className="w-8 h-8 animate-spin text-black" />
                    ) : isPlaying ? (
                      <Pause className="w-8 h-8 fill-black text-black" />
                    ) : (
                      <Play className="w-8 h-8 fill-black text-black ml-1" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    className="w-13 h-13 rounded-full text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 transition active:scale-90"
                    title="Bài tiếp theo"
                  >
                    <SkipForward className="w-7 h-7 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={onToggleRepeat}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition active:scale-90 ${
                      repeatMode !== 'off'
                        ? 'bg-white/20 text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/10'
                    }`}
                    title="Lặp lại"
                  >
                    {repeatMode === 'one' ? (
                      <Repeat1 className="w-5 h-5" />
                    ) : (
                      <Repeat className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Quick Source Switcher Pills */}
                <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSelectSource('proxy')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                      activeSource === 'proxy'
                        ? 'bg-white/20 border-white/40 text-white'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                    }`}
                  >
                    4G Proxy
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectSource('direct')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                      activeSource === 'direct'
                        ? 'bg-white/20 border-white/40 text-white'
                        : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                    }`}
                  >
                    Direct
                  </button>
                  {streamData.embedUrl && (
                    <button
                      type="button"
                      onClick={() => handleSelectSource('embed')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                        activeSource === 'embed'
                          ? 'bg-amber-500/30 border-amber-400/50 text-amber-200'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                      }`}
                    >
                      Embed
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT PANE (7/12): Segmented Pill [Lời bài hát | Tiếp theo] + Time-Synced Lyrics */}
              <div className="lg:col-span-7 flex flex-col h-[420px] sm:h-[480px] lg:h-[540px] bg-white/[0.04] backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-xl">
                {/* Segmented Pill Switcher */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-white/10">
                  <div className="flex items-center bg-black/30 p-1 rounded-full border border-white/10">
                    <button
                      type="button"
                      onClick={() => setRightPaneTab('lyrics')}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition ${
                        rightPaneTab === 'lyrics'
                          ? 'bg-white text-black shadow'
                          : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <Quote className="w-3.5 h-3.5" />
                      <span>Lời bài hát</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRightPaneTab('queue')}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition ${
                        rightPaneTab === 'queue'
                          ? 'bg-white text-black shadow'
                          : 'text-white/65 hover:text-white'
                      }`}
                    >
                      <ListMusic className="w-3.5 h-3.5" />
                      <span>Tiếp theo ({queueVideos.length})</span>
                    </button>
                  </div>

                  {lyricsData && rightPaneTab === 'lyrics' && (
                    <span className="text-[11px] font-bold text-white/55">
                      {lyricsData.source}
                    </span>
                  )}
                </div>

                {/* RIGHT PANE BODY */}
                {rightPaneTab === 'lyrics' ? (
                  <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 no-scrollbar space-y-5">
                    {isLoadingLyrics ? (
                      <div className="h-full flex flex-col items-center justify-center gap-3 text-white/60">
                        <Loader2 className="w-8 h-8 animate-spin text-white/80" />
                        <p className="text-sm font-semibold">Đang tìm lời bài hát...</p>
                      </div>
                    ) : lyricsData && lyricsData.lines.length > 0 ? (
                      lyricsData.lines.map((line, i) => {
                        const isActive = lyricsData.isSynced && i === activeLyricIndex;
                        const isPast = lyricsData.isSynced && activeLyricIndex > i;
                        return (
                          <button
                            key={i}
                            ref={isActive ? activeLyricRef : null}
                            type="button"
                            onClick={() => {
                              if (line.time >= 0) handleSeekTo(line.time);
                            }}
                            className={`block w-full text-left font-extrabold tracking-tight transition-all duration-500 ease-out origin-left ${
                              isActive
                                ? 'text-2xl sm:text-3xl text-white scale-100 blur-0 drop-shadow-[0_2px_12px_rgba(255,255,255,0.35)]'
                                : isPast
                                ? 'text-lg sm:text-xl text-white/25 blur-[0.7px] hover:blur-0 hover:text-white/70'
                                : 'text-lg sm:text-xl text-white/45 blur-[0.4px] hover:blur-0 hover:text-white/85'
                            }`}
                          >
                            {line.text}
                          </button>
                        );
                      })
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-4">
                        <Quote className="w-12 h-12 text-white/25" />
                        <div>
                          <p className="text-lg font-bold text-white/85">
                            Chưa có lời đồng bộ cho bản phối này
                          </p>
                          <p className="text-sm text-white/50 mt-1">
                            Các bản Remix / Nonstop thường không có lời LRC.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRightPaneTab('queue')}
                          className="px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-sm font-bold text-white transition active:scale-95"
                        >
                          Xem danh sách phát tiếp theo
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-1.5 no-scrollbar">
                    {queueVideos.map((item, idx) => {
                      const isCurrent = (currentVideoId || streamData.id) === item.id;
                      return (
                        <div
                          key={`${item.id}-${idx}`}
                          onClick={() => onSelectVideo && onSelectVideo(item)}
                          className={`flex items-center gap-3 p-2.5 rounded-2xl transition cursor-pointer active:scale-99 ${
                            isCurrent
                              ? 'bg-white/20 border border-white/25'
                              : 'hover:bg-white/10 border border-transparent'
                          }`}
                        >
                          <div className="w-6 text-center shrink-0">
                            {isCurrent ? (
                              <div className="flex items-end justify-center gap-0.5 h-4">
                                <span className="w-1 bg-rose-400 rounded-full animate-bounce h-full" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 bg-rose-400 rounded-full animate-bounce h-3/5" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 bg-rose-400 rounded-full animate-bounce h-4/5" style={{ animationDelay: '300ms' }} />
                              </div>
                            ) : (
                              <span className="text-xs font-mono font-bold text-white/45">
                                {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                              </span>
                            )}
                          </div>
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            loading="lazy"
                            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">
                              {item.title}
                            </h4>
                            <p className="text-xs text-white/60 truncate mt-0.5">
                              {item.uploaderName}
                            </p>
                          </div>
                          {item.durationText && (
                            <span className="text-xs font-mono font-bold text-white/50 shrink-0 pr-1">
                              {item.durationText}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {hasMoreQueue && onLoadMoreQueue && (
                      <button
                        type="button"
                        onClick={onLoadMoreQueue}
                        disabled={isLoadingMoreQueue}
                        className="w-full py-3 mt-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/15 flex items-center justify-center gap-2 transition"
                      >
                        {isLoadingMoreQueue ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        <span>Tải thêm bài hát</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ===============================================================
               BROWSE / FAVORITES / HISTORY VIEW + FLOATING LIQUID GLASS MINI PLAYER
               =============================================================== */
            <div className="flex-1 flex flex-col min-h-0 max-w-6xl mx-auto w-full pb-20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {railSection === 'favorites'
                    ? 'Bài hát đã lưu'
                    : railSection === 'history'
                    ? 'Lịch sử vừa nghe'
                    : 'Khám phá âm nhạc'}
                </h2>
              </div>

              {railSection === 'browse' && onSelectCategory && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 shrink-0">
                  {YTMUSIC_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => onSelectCategory(cat.id, cat.query)}
                        className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition active:scale-95 border ${
                          isSelected
                            ? 'bg-white text-black border-white shadow'
                            : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
                {isLoadingQueue && queueVideos.length === 0 ? (
                  <div className="col-span-full py-16 text-center">
                    <Loader2 className="w-10 h-10 text-white animate-spin mx-auto" />
                  </div>
                ) : (
                  queueVideos.map((item, idx) => {
                    const isCurrent = (currentVideoId || streamData.id) === item.id;
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        onClick={() => {
                          if (onSelectVideo) onSelectVideo(item);
                          setRailSection('nowPlaying');
                        }}
                        className={`flex items-center gap-3.5 p-3 rounded-2xl border backdrop-blur-xl transition cursor-pointer active:scale-98 ${
                          isCurrent
                            ? 'bg-white/20 border-white/30'
                            : 'bg-white/[0.06] border-white/10 hover:bg-white/15'
                        }`}
                      >
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className="w-16 h-16 rounded-xl object-cover shrink-0 shadow"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm sm:text-base font-bold text-white line-clamp-1">
                            {item.title}
                          </h4>
                          <p className="text-xs text-white/60 truncate mt-1">
                            {item.uploaderName}
                          </p>
                        </div>
                        {item.durationText && (
                          <span className="text-xs font-mono font-bold text-white/50 shrink-0">
                            {item.durationText}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* FLOATING LIQUID GLASS MINI PLAYER */}
              <div
                onClick={() => setRailSection('nowPlaying')}
                className="fixed bottom-4 left-4 right-4 md:left-28 md:right-8 z-30 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-2xl cursor-pointer hover:bg-white/20 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <img
                    src={streamData.thumbnailUrl}
                    alt={streamData.title}
                    className="w-11 h-11 rounded-xl object-cover shrink-0 shadow"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-white truncate">
                      {streamData.title}
                    </h4>
                    <p className="text-xs text-white/65 truncate">{streamData.uploader}</p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow active:scale-90 transition"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-black" />
                    ) : (
                      <Play className="w-5 h-5 fill-black ml-0.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-90 transition"
                  >
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // GIAO DIỆN 2: CARHUB VIDEO (CHẾ ĐỘ XEM VIDEO TRUYỀN THỐNG)
  // ===========================================================================
  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black rounded-3xl overflow-hidden border-2 border-car-border shadow-2xl transition-all ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'mb-6'
      }`}
    >
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-14 h-14 text-car-accent animate-spin" />
            <p className="text-base sm:text-lg font-bold text-slate-200">
              Đang chuẩn bị luồng phát...
            </p>
          </div>
        )}

        {playbackError && (
          <div className="absolute inset-0 z-30 bg-black/95 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertCircle className="w-14 h-14 text-rose-500" />
            <h4 className="text-lg sm:text-xl font-bold text-white">
              Không thể phát luồng này
            </h4>
            <p className="text-sm text-car-textMuted max-w-md">{playbackError}</p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
              {streamData.embedUrl && (
                <button
                  onClick={() => handleSelectSource('embed')}
                  className="h-13 px-5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <Tv className="w-5 h-5" />
                  <span>Phát qua YouTube Embed</span>
                </button>
              )}
              {onRetry && (
                <button
                  onClick={() => {
                    setPlaybackError(null);
                    onRetry();
                  }}
                  className="h-13 px-5 bg-car-card hover:bg-slate-800 border-2 border-car-border text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <RefreshCw className="w-5 h-5" />
                  <span>Tải lại</span>
                </button>
              )}
              {hasNext && onNext && (
                <button
                  onClick={onNext}
                  className="h-13 px-5 bg-car-accent hover:bg-car-accentHover text-white rounded-2xl text-sm sm:text-base font-bold flex items-center gap-2 active:scale-95"
                >
                  <SkipForward className="w-5 h-5" />
                  <span>Bài tiếp theo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {(hardwareNotice || sponsorSkippedNotice || modeNotice) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-car-accent/95 text-white px-5 py-2.5 rounded-full text-sm sm:text-base font-bold flex items-center gap-2 shadow-xl backdrop-blur">
            <ShieldCheck className="w-5 h-5 text-emerald-300 shrink-0" />
            <span>{hardwareNotice || sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {persistentMediaNode}

        {playerMode === 'audio' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-car-card via-slate-900 to-black relative">
            <div className="relative mb-4 group cursor-pointer" onClick={togglePlay}>
              <div
                className={`w-40 h-40 sm:w-56 sm:h-56 rounded-full overflow-hidden border-4 border-slate-700 shadow-2xl relative ${
                  isPlaying && !isBuffering && !playbackError ? 'animate-spin' : ''
                }`}
                style={{ animationDuration: '10s' }}
              >
                <img
                  src={streamData.thumbnailUrl}
                  alt={streamData.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-slate-900 border-2 border-slate-400"></div>
                </div>
              </div>
              <div
                className={`absolute -bottom-2 -right-2 p-3 rounded-full text-white shadow-xl ${
                  isPlaying && !isBuffering ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                {isBuffering ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Radio className={`w-6 h-6 ${isPlaying ? 'animate-pulse' : ''}`} />
                )}
              </div>
            </div>

            <div className="text-center max-w-xl px-4">
              <h2 className="text-lg sm:text-2xl font-extrabold line-clamp-1 text-white">
                {streamData.title}
              </h2>
              <p className="text-sm sm:text-base text-car-textMuted font-semibold mt-1">
                {streamData.uploader} •{' '}
                {isBuffering
                  ? 'Đang nạp luồng âm thanh...'
                  : isPlaying
                  ? 'Đang phát chế độ Chỉ nghe nhạc'
                  : 'Đang tạm dừng'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-car-card px-4 py-4 sm:px-6 sm:py-5 border-t-2 border-car-border">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-xl font-extrabold text-slate-100 truncate">
              {streamData.title}
            </h3>
            <p className="text-sm sm:text-base text-slate-300 font-semibold truncate mt-0.5">
              {streamData.uploader}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="shrink-0 text-xs sm:text-sm font-bold px-3 py-1.5 rounded-xl border-2 bg-blue-500/10 text-blue-300 border-blue-500/40">
              {activeSource === 'embed'
                ? 'YouTube Embed'
                : activeSource === 'hls'
                ? 'HLS Stream'
                : activeSource === 'proxy'
                ? '4G Edge Proxy'
                : 'Direct MP4'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 mb-3">
          <span className="text-sm sm:text-base font-mono font-bold text-slate-200 shrink-0 min-w-[50px]">
            {formatSeconds(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            disabled={Boolean(playbackError)}
            onChange={handleSeekChange}
            className="w-full cursor-pointer"
          />
          <span className="text-sm sm:text-base font-mono font-bold text-slate-200 shrink-0 min-w-[50px] text-right">
            {formatSeconds(duration)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 sm:gap-3">
            {!isEmbed && (
              <button
                onClick={() => {
                  if (hasAudioStream) {
                    onPlayerModeChange(playerMode === 'video' ? 'audio' : 'video');
                  }
                }}
                disabled={!hasAudioStream}
                className={`h-13 sm:h-14 px-4 sm:px-5 rounded-2xl text-sm sm:text-base font-bold transition flex items-center gap-2 active:scale-95 shadow-sm ${
                  !hasAudioStream
                    ? 'bg-slate-900 text-slate-500 border-2 border-slate-800 cursor-not-allowed'
                    : playerMode === 'audio'
                    ? 'bg-emerald-600 text-white border-2 border-emerald-400 shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800 text-slate-100 hover:text-white border-2 border-slate-700'
                }`}
              >
                {!hasAudioStream ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline">Không có audio riêng</span>
                  </>
                ) : playerMode === 'audio' ? (
                  <>
                    <Tv className="w-5 h-5 text-emerald-100" />
                    <span>Xem video</span>
                  </>
                ) : (
                  <>
                    <Headphones className="w-5 h-5 text-emerald-400" />
                    <span>Chỉ nghe nhạc</span>
                  </>
                )}
              </button>
            )}

            {!isEmbed &&
              playerMode === 'video' &&
              (uniqueQualities.length > 1 || (hasDirectVideo && hasHls)) && (
                <select
                  value={selectedQuality}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  className="h-13 sm:h-14 bg-slate-800 text-slate-100 text-sm sm:text-base px-3.5 rounded-2xl border-2 border-slate-700 font-bold focus:outline-none focus:border-car-accent shadow-sm"
                >
                  {uniqueQualities.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                  {hasHls && <option value="hls">HLS Tự động</option>}
                </select>
              )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm"
              title="Bài trước"
            >
              <SkipBack className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>

            <button
              onClick={() => handleSeekRelative(-10)}
              disabled={Boolean(playbackError)}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex flex-col items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm"
              title="Tua lùi 10 giây"
            >
              <RotateCcw className="w-6 h-6 text-car-accent" />
              <span className="text-[10px] sm:text-xs font-extrabold text-slate-200 mt-0.5 leading-none">
                -10s
              </span>
            </button>

            <button
              onClick={togglePlay}
              disabled={Boolean(playbackError)}
              className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-car-accent hover:bg-car-accentHover disabled:opacity-40 text-white flex items-center justify-center shadow-xl shadow-car-accent/50 active:scale-90 transition mx-1 border-4 border-blue-400"
              title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {isBuffering ? (
                <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white" />
              ) : (
                <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
              )}
            </button>

            <button
              onClick={() => handleSeekRelative(10)}
              disabled={Boolean(playbackError)}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex flex-col items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm"
              title="Tua tới 10 giây"
            >
              <RotateCw className="w-6 h-6 text-car-accent" />
              <span className="text-[10px] sm:text-xs font-extrabold text-slate-200 mt-0.5 leading-none">
                +10s
              </span>
            </button>

            <button
              onClick={onNext}
              disabled={!hasNext}
              className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-100 flex items-center justify-center border-2 border-slate-700 disabled:opacity-30 active:scale-95 transition shadow-sm"
              title="Bài tiếp theo"
            >
              <SkipForward className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleFavorite}
              className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border-2 transition active:scale-95 ${
                isFavorite
                  ? 'text-amber-400 bg-amber-400/15 border-amber-400'
                  : 'text-slate-300 hover:text-white bg-slate-800 border-slate-700'
              }`}
              title="Yêu thích"
            >
              <Star className={`w-6 h-6 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>

            <button
              onClick={toggleFullscreen}
              className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white bg-slate-800 border-2 border-slate-700 transition active:scale-95"
              title="Toàn màn hình"
            >
              {isFullscreen ? (
                <Minimize2 className="w-6 h-6" />
              ) : (
                <Maximize2 className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-950/95 px-4 py-3 sm:px-6 sm:py-3.5 border-t-2 border-car-border/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-300 uppercase tracking-wider mr-1 shrink-0">
            <Layers className="w-4 h-4 text-car-accent" />
            <span>Nguồn phát:</span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectSource('proxy')}
            disabled={!hasDirectVideo}
            className={`h-11 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              activeSource === 'proxy'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span>4G Edge Proxy</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectSource('direct')}
            disabled={!hasDirectVideo}
            className={`h-11 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
              activeSource === 'direct'
                ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span>Direct MP4</span>
          </button>

          {hasHls && (
            <button
              type="button"
              onClick={() => handleSelectSource('hls')}
              className={`h-11 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                activeSource === 'hls'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>HLS Stream</span>
            </button>
          )}

          {streamData.embedUrl && (
            <button
              type="button"
              onClick={() => handleSelectSource('embed')}
              className={`h-11 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition active:scale-95 border-2 ${
                activeSource === 'embed'
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span>YouTube Embed</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
