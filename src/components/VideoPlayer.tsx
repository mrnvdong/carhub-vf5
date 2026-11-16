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
  Disc,
  ListMusic,
  Compass,
  History,
  Bookmark,
  ChevronDown,
} from 'lucide-react';
import {
  StreamData,
  PlayerMode,
  ActiveSource,
  ViewMode,
  RepeatMode,
  VideoItem,
} from '../types';
import { formatSeconds } from '../services/api';
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
  // Props phục vụ giao diện YouTube Music (Danh sách bài hát & Tab bên phải)
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const syncAudioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(streamData.duration || 0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [sponsorSkippedNotice, setSponsorSkippedNotice] = useState<string | null>(null);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [hardwareNotice, setHardwareNotice] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Tab riêng bên phải của giao diện YouTube Music: 'queue' | 'moods' | 'favorites' | 'history'
  const [ytTab, setYtTab] = useState<'queue' | 'moods' | 'favorites' | 'history'>('queue');
  // Kiểu hiển thị bìa đĩa bên trái của YouTube Music: 'cover' (Ảnh vuông) | 'vinyl' (Đĩa than xoay)
  const [artStyle, setArtStyle] = useState<'cover' | 'vinyl'>('cover');

  const isStub = streamData.source === 'init';
  const hasAudioStream = (streamData.audioStreams?.length ?? 0) > 0;
  const hasDirectVideo = (streamData.videoStreams?.length ?? 0) > 0;
  const hasHls = Boolean(streamData.hlsUrl);

  // Ở chế độ YouTube Music: BẮT BUỘC 100% CHỈ CHẠY ÂM THANH (KHÔNG BAO GIỜ HIỂN THỊ VIDEO)
  const isAudioOnlyMode = viewMode === 'ytmusic' || playerMode === 'audio';

  const initialQuality = (streamData.videoStreams || [])[0]?.quality || '1080p';
  const [selectedQuality, setSelectedQuality] = useState<string>(initialQuality);

  // Chọn nguồn phát tối ưu:
  // Lưu ý: Link googlevideo.com lấy từ Cloudflare Edge (edge-innertube-*) bị khóa theo IP của Cloudflare.
  // Khi xe VF5 dùng 4G Vinaphone/Viettel, dùng 'proxy' (/api/proxy) sẽ đi qua đúng IP Cloudflare nên phát ăn ngay 100% không bị lỗi 403!
  const determineBestSource = (): ActiveSource => {
    if (isStub) return 'proxy';

    if (hasAudioStream || hasDirectVideo) {
      if (streamData.source?.startsWith('edge-innertube')) {
        return 'proxy';
      }
      return 'direct';
    }
    if (hasHls) {
      return 'hls';
    }
    return 'embed';
  };

  const [activeSource, setActiveSource] = useState<ActiveSource>(determineBestSource);

  const isEmbed = activeSource === 'embed';
  const useProxy = activeSource === 'proxy';
  const isHlsActive = activeSource === 'hls';

  // Khi ở chế độ chỉ nghe nhạc (YouTube Music hoặc Audio Mode):
  // Nếu có audioStreams và nguồn là direct/proxy -> Phát bằng thẻ <audio> thuần túy (0% video data!)
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

  // Cập nhật nguồn phát khi dữ liệu thực của bài hát tải xong (bỏ qua stub 'init')
  useEffect(() => {
    if (isStub) return;
    setPlaybackError(null);
    setDuration(streamData.duration || 0);
    setActiveSource(determineBestSource());
    setSelectedQuality((streamData.videoStreams || [])[0]?.quality || '1080p');
  }, [streamData.id, streamData.source]);

  // Reset thời gian khi đổi sang ID bài hát mới
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

  // Đổi nguồn phát thủ công
  const handleSelectSource = (src: ActiveSource) => {
    setPlaybackError(null);
    if (currentTime > 1) {
      prevTimeRef.current = currentTime;
    }
    setActiveSource(src);

    if (src === 'proxy') {
      setModeNotice('Đã chuyển sang Edge Proxy (Tối ưu cho mạng 4G VF5)');
    } else if (src === 'direct') {
      setModeNotice('Đã chuyển sang Direct Stream trực tiếp');
    } else if (src === 'hls') {
      setModeNotice('Đã chuyển sang HLS Stream');
    } else if (src === 'embed') {
      setModeNotice('Đã chuyển sang luồng dự phòng Embed');
    }
    setTimeout(() => setModeNotice(null), 3000);
  };

  // Tính toán URL luồng phát hiện tại
  const getStreamUrl = (): string => {
    if (isStub || isEmbed) return '';

    // 1. Chế độ chỉ nghe nhạc (YouTube Music / Audio-Only): Chỉ lấy luồng âm thanh nhẹ nhất!
    if (usePureAudioElement) {
      const bestAudio = streamData.audioStreams[0];
      if (!bestAudio) return '';
      if (useProxy && bestAudio.url.includes('googlevideo.com')) {
        return `/api/proxy?url=${encodeURIComponent(bestAudio.url)}`;
      }
      return bestAudio.url;
    }

    // 2. Luồng HLS
    if (isHlsActive && streamData.hlsUrl) {
      return streamData.hlsUrl;
    }

    // 3. Luồng Video (hoặc fallback nếu bài hát không có audioStreams riêng)
    const fallbackStream = activeVideoStream || streamData.audioStreams?.[0];
    if (!fallbackStream) return '';

    if (useProxy && fallbackStream.url.includes('googlevideo.com')) {
      return `/api/proxy?url=${encodeURIComponent(fallbackStream.url)}`;
    }
    return fallbackStream.url;
  };

  const finalStreamUrl = getStreamUrl();

  // QUẢN LÝ THẺ <audio> THUẦN TÚY (Dùng cho chế độ YouTube Music & Chỉ nghe nhạc)
  // QUAN TRỌNG: Không bao giờ gọi removeAttribute('src') khi chuyển bài để giữ kết nối phím vô lăng CarPlay!
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!usePureAudioElement || isEmbed) {
      audio.pause();
      return;
    }

    if (isStub || !finalStreamUrl) return;

    // Tạm dừng thẻ video nếu đang chạy
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

  // QUẢN LÝ THẺ <video> (Dùng khi ở chế độ Xem Video hoặc phát HLS)
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

    // Tạm dừng thẻ audio thuần nếu đang chuyển từ YT Music sang Xem Video
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
          if (data.fatal) {
            handleMediaError('hls-fatal');
          }
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

  // Đồng bộ tiếng cho video 1080p/720p ở chế độ Xem Video
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

  // Tự động chuyển đổi nguồn phát khi gặp lỗi mạng (Proxy <-> Direct -> HLS -> Embed)
  const handleMediaError = (reasonOrEvent?: string | React.SyntheticEvent) => {
    if (isStub || isLoading) return;
    const reason = typeof reasonOrEvent === 'string' ? reasonOrEvent : 'media-event-error';
    console.warn(`[Auto-Heal] Stream error (${reason}) on source=${activeSource}. Switching...`);

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
    setPlaybackError('Không thể phát bài hát này. Vui lòng bấm chuyển bài tiếp theo.');
  };

  // Watchdog tự động đổi nguồn nếu kẹt nạp quá 5 giây
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

  // Điều khiển Iframe dự phòng (khi rơi vào nguồn Embed)
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
    if (el.paused) {
      handlePlayExplicit();
    } else {
      handlePauseExplicit();
    }
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
    if (el) {
      el.currentTime = val;
    }
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

    // Đồng bộ tiếng nếu đang phát video 1080p tách luồng
    if (isAudioSyncNeeded && syncAudioRef.current && !el.paused) {
      const drift = Math.abs(syncAudioRef.current.currentTime - curr);
      if (drift > 0.25) {
        syncAudioRef.current.currentTime = curr;
      }
      if (syncAudioRef.current.paused) {
        syncAudioRef.current.play().catch(console.warn);
      }
    }

    // Tự động bỏ qua đoạn quảng cáo SponsorBlock
    if (!isEmbed && streamData.sponsorSegments && streamData.sponsorSegments.length > 0) {
      for (const segment of streamData.sponsorSegments) {
        if (curr >= segment.start && curr < segment.end - 0.5) {
          el.currentTime = segment.end;
          if (isAudioSyncNeeded && syncAudioRef.current) {
            syncAudioRef.current.currentTime = segment.end;
          }
          setSponsorSkippedNotice(`Đã tự động tua qua đoạn giới thiệu (${segment.category})`);
          setTimeout(() => setSponsorSkippedNotice(null), 3000);
          break;
        }
      }
    }
  };

  // KẾT NỐI PHÍM CỨNG VÔ LĂNG VINFAST VF5 & MEDIASESSION CARPLAY
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

  const uniqueQualities = Array.from(
    new Set((streamData.videoStreams || []).map((v) => v.quality))
  );

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedIframeUrl = `https://www.youtube-nocookie.com/embed/${streamData.id}?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&origin=${encodeURIComponent(embedOrigin)}`;

  // ---------------------------------------------------------------------------
  // CÁC PHẦN TỬ MEDIA CỐ ĐỊNH (PERSISTENT DOM ELEMENTS):
  // Luôn tồn tại trong DOM để không bao giờ làm rớt kết nối MediaSession trên VF5!
  // Ở chế độ YouTube Music (viewMode === 'ytmusic'), mọi khung hình video đều bị ẩn 100%,
  // chỉ phát âm thanh qua thẻ <audio>!
  // ---------------------------------------------------------------------------
  const isVideoVisible = viewMode === 'classic' && playerMode === 'video';

  const persistentMediaNode = (
    <div
      className={
        isVideoVisible
          ? 'w-full h-full flex items-center justify-center'
          : 'w-0 h-0 opacity-0 pointer-events-none fixed -left-[9999px] -top-[9999px] overflow-hidden'
      }
    >
      {/* 1. Thẻ <audio> chính chuyên phát nhạc cho YouTube Music & Audio-Only */}
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

      {/* 2. Thẻ <video> dùng khi người dùng chuyển sang chế độ Xem Video */}
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
            if (isAudioSyncNeeded && syncAudioRef.current) {
              syncAudioRef.current.pause();
            }
          }
        }}
        onPause={() => {
          if (!usePureAudioElement && !isEmbed) {
            setIsPlaying(false);
            if (isAudioSyncNeeded && syncAudioRef.current) {
              syncAudioRef.current.pause();
            }
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
          if (isAudioSyncNeeded && syncAudioRef.current) {
            syncAudioRef.current.pause();
          }
          if (repeatMode === 'one' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(console.warn);
          } else if (onNext) {
            onNext();
          }
        }}
        onClick={togglePlay}
      />

      {/* 3. Thẻ <audio> phụ đồng bộ tiếng cho video 1080p */}
      <audio
        ref={syncAudioRef}
        preload="auto"
        playsInline
        className="hidden"
        onError={(e) => console.warn('Sync audio error:', e)}
      />

      {/* 4. Iframe dự phòng (Ẩn hoàn toàn khi ở chế độ YouTube Music để chỉ phát tiếng) */}
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
  // GIAO DIỆN 1: PHIÊN BẢN YOUTUBE MUSIC (CHỈ CHẠY ÂM THANH - KHÔNG XEM VIDEO)
  // Thiết kế chuẩn ứng dụng YouTube Music:
  // - Bên trái: Sân khấu Bìa Đĩa Nhạc (Square Cover / Đĩa Than Vinyl)
  // - Bên phải: Hệ thống Tab (TIẾP THEO | CHỦ ĐỀ NHẠC | YÊU THÍCH | LỊCH SỬ) + Danh sách phẳng
  // - Cạnh đáy: Thanh Bottom Player Bar cố định có thanh kéo thời gian màu đỏ chạy ngang
  // ===========================================================================
  if (viewMode === 'ytmusic') {
    const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

    return (
      <div className="relative w-full pb-2 select-none">
        {/* Giữ phần tử âm thanh luôn hoạt động ngầm, ẩn hoàn toàn khung video */}
        {persistentMediaNode}

        {/* Toast thông báo khi bấm phím cứng vô lăng VF5 hoặc SponsorBlock */}
        {(hardwareNotice || sponsorSkippedNotice || modeNotice) && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-5 py-2.5 rounded-full text-sm sm:text-base font-extrabold flex items-center gap-2 shadow-2xl border border-rose-400 animate-bounce">
            <ShieldCheck className="w-5 h-5 text-white shrink-0" />
            <span>{hardwareNotice || sponsorSkippedNotice || modeNotice}</span>
          </div>
        )}

        {/* BỐ CỤC 2 CỘT ĐẶC TRƯNG CỦA YOUTUBE MUSIC */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* CỘT TRÁI (5/12): SÂN KHẤU ĐĨA NHẠC (ALBUM ART / VINYL STAGE) */}
          <div className="lg:col-span-5 relative bg-[#09090b] rounded-3xl border border-zinc-800/80 p-5 sm:p-7 flex flex-col items-center justify-between overflow-hidden shadow-2xl min-h-[420px]">
            {/* Hiệu ứng ánh sáng mờ Dynamic Ambient Glow từ bìa đĩa nhạc */}
            <div
              className="absolute -inset-12 opacity-30 pointer-events-none blur-3xl transition-all duration-1000 scale-125"
              style={{
                backgroundImage: `url(${streamData.thumbnailUrl})`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
              }}
            />

            {/* Thanh trên của Sân khấu Đĩa nhạc: Nhãn Audio-Only & Chuyển kiểu Bìa Đĩa / Đĩa Than */}
            <div className="relative z-10 w-full flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-1.5 rounded-full text-xs font-extrabold">
                <Headphones className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>CHỈ PHÁT ÂM THANH</span>
              </div>

              {/* Nút đổi kiểu hiển thị: Bìa vuông vs Đĩa than xoay */}
              <div className="flex items-center bg-zinc-900/90 p-1 rounded-full border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setArtStyle('cover')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                    artStyle === 'cover'
                      ? 'bg-white text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Bìa Album
                </button>
                <button
                  type="button"
                  onClick={() => setArtStyle('vinyl')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1 ${
                    artStyle === 'vinyl'
                      ? 'bg-white text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Disc className="w-3 h-3" />
                  <span>Đĩa than</span>
                </button>
              </div>
            </div>

            {/* Giữa sân khấu: Bìa Album vuông lớn hoặc Đĩa than xoay */}
            <div
              onClick={togglePlay}
              className="relative z-10 my-auto py-2 flex items-center justify-center cursor-pointer group"
              title={isPlaying ? 'Chạm để tạm dừng' : 'Chạm để phát nhạc'}
            >
              {artStyle === 'vinyl' ? (
                /* Đĩa than Vinyl xoay mượt */
                <div className="relative flex items-center justify-center">
                  <div
                    className={`w-56 h-56 sm:w-68 sm:h-68 rounded-full overflow-hidden border-8 border-zinc-900 shadow-[0_0_50px_rgba(0,0,0,0.9)] relative ${
                      isPlaying && !isBuffering ? 'animate-spin' : ''
                    }`}
                    style={{ animationDuration: '12s' }}
                  >
                    <img
                      src={streamData.thumbnailUrl}
                      alt={streamData.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-radial from-transparent via-black/15 to-black/60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-zinc-950 border-4 border-zinc-700 flex items-center justify-center shadow-inner">
                        <div className="w-4 h-4 rounded-full bg-rose-500" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Bìa Album vuông chuẩn YouTube Music */
                <div className="relative w-56 h-56 sm:w-68 sm:h-68 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/10">
                  <img
                    src={streamData.thumbnailUrl}
                    alt={streamData.title}
                    className={`w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying && !isBuffering ? 'scale-105' : 'scale-100'
                    }`}
                  />
                  {/* Sóng nhạc Equalizer góc dưới bìa đĩa */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-4">
                    {isPlaying && !isBuffering ? (
                      <div className="flex items-end gap-1 h-6 bg-black/60 px-2.5 py-1 rounded-lg backdrop-blur-xs">
                        <span
                          className="w-1 bg-rose-500 rounded-full animate-bounce"
                          style={{ height: '100%', animationDelay: '0ms' }}
                        />
                        <span
                          className="w-1 bg-rose-500 rounded-full animate-bounce"
                          style={{ height: '55%', animationDelay: '150ms' }}
                        />
                        <span
                          className="w-1 bg-rose-500 rounded-full animate-bounce"
                          style={{ height: '85%', animationDelay: '300ms' }}
                        />
                        <span
                          className="w-1 bg-rose-500 rounded-full animate-bounce"
                          style={{ height: '40%', animationDelay: '450ms' }}
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-zinc-300 bg-black/70 px-2.5 py-1 rounded-lg">
                        Đã tạm dừng
                      </span>
                    )}
                    <span className="text-[11px] font-mono font-bold text-emerald-300 bg-black/70 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                      128kbps AAC
                    </span>
                  </div>
                </div>
              )}

              {/* Loading / Buffering spinner trên bìa đĩa */}
              {(isLoading || isBuffering) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 rounded-2xl backdrop-blur-[2px]">
                  <div className="bg-black/80 p-4 rounded-full shadow-2xl border border-white/10">
                    <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            {/* Thông tin bài hát & Cụm nút chọn nguồn âm thanh dưới đáy sân khấu */}
            <div className="relative z-10 w-full text-center mt-4 space-y-3">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-white line-clamp-2 leading-snug">
                  {streamData.title}
                </h2>
                <p className="text-sm text-zinc-400 font-semibold truncate mt-1">
                  {streamData.uploader}
                </p>
              </div>

              {/* Cụm chuyển nguồn âm thanh nhanh nếu mạng 4G chập chờn */}
              <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2 border-t border-white/10">
                <span className="text-[11px] font-bold text-zinc-400 mr-1">Luồng nhạc:</span>
                <button
                  type="button"
                  onClick={() => handleSelectSource('proxy')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    activeSource === 'proxy'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  4G Proxy (Khuyên dùng)
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSource('direct')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    activeSource === 'direct'
                      ? 'bg-rose-600 text-white shadow'
                      : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                  }`}
                >
                  Direct Audio
                </button>
                {hasHls && (
                  <button
                    type="button"
                    onClick={() => handleSelectSource('hls')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      activeSource === 'hls'
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    HLS
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (7/12): BẢNG TAB DANH SÁCH PHÁT CHUẨN YOUTUBE MUSIC */}
          <div className="lg:col-span-7 bg-[#09090b] rounded-3xl border border-zinc-800/80 flex flex-col overflow-hidden shadow-2xl">
            {/* Thanh Tab Header chuẩn YouTube Music: TIẾP THEO | CHỦ ĐỀ NHẠC | YÊU THÍCH | LỊCH SỬ */}
            <div className="flex items-center border-b border-zinc-800 px-3 sm:px-5 pt-3 gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setYtTab('queue');
                  if (activeTab !== 'explore' && onChangeTab) onChangeTab('explore');
                }}
                className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs sm:text-sm font-black uppercase tracking-wider whitespace-nowrap transition ${
                  ytTab === 'queue'
                    ? 'border-rose-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ListMusic className="w-4 h-4 text-rose-500" />
                <span>Tiếp theo ({queueVideos.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setYtTab('moods');
                  if (activeTab !== 'explore' && onChangeTab) onChangeTab('explore');
                }}
                className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs sm:text-sm font-black uppercase tracking-wider whitespace-nowrap transition ${
                  ytTab === 'moods'
                    ? 'border-rose-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Compass className="w-4 h-4 text-rose-500" />
                <span>Chủ đề nhạc</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setYtTab('favorites');
                  if (onChangeTab) onChangeTab('favorites');
                }}
                className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs sm:text-sm font-black uppercase tracking-wider whitespace-nowrap transition ${
                  ytTab === 'favorites'
                    ? 'border-rose-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Bookmark className="w-4 h-4 text-rose-500" />
                <span>Yêu thích ({favoritesCount})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setYtTab('history');
                  if (onChangeTab) onChangeTab('history');
                }}
                className={`flex items-center gap-2 px-3.5 py-3 border-b-2 text-xs sm:text-sm font-black uppercase tracking-wider whitespace-nowrap transition ${
                  ytTab === 'history'
                    ? 'border-rose-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <History className="w-4 h-4 text-rose-500" />
                <span>Lịch sử ({historyCount})</span>
              </button>
            </div>

            {/* Nếu đang ở Tab "Chủ đề nhạc" -> Hiển thị các Chip chọn nhanh thể loại nhạc */}
            {ytTab === 'moods' && onSelectCategory && (
              <div className="p-3 sm:px-5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {YTMUSIC_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onSelectCategory(cat.id, cat.query);
                      }}
                      className={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition active:scale-95 border ${
                        isSelected
                          ? 'bg-white text-black border-white shadow'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* DANH SÁCH BÀI HÁT DẠNG PHẲNG CHUẨN YOUTUBE MUSIC (FLAT TRACK LIST) */}
            <div className="flex-1 overflow-y-auto max-h-[380px] sm:max-h-[430px] divide-y divide-zinc-900/80 px-2 sm:px-3 py-1 no-scrollbar">
              {isLoadingQueue && queueVideos.length === 0 ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 text-rose-500 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-zinc-400 font-bold">Đang tải danh sách nhạc...</p>
                </div>
              ) : queueVideos.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <Music className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-bold text-zinc-300">Chưa có bài hát nào trong mục này</p>
                </div>
              ) : (
                queueVideos.map((item, idx) => {
                  const isCurrent = (currentVideoId || streamData.id) === item.id;
                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      onClick={() => onSelectVideo && onSelectVideo(item)}
                      className={`group flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition cursor-pointer active:scale-99 ${
                        isCurrent
                          ? 'bg-rose-500/15 text-white'
                          : 'hover:bg-white/5 text-zinc-200'
                      }`}
                    >
                      {/* Số thứ tự hoặc Sóng nhạc đang phát */}
                      <div className="w-6 text-center shrink-0 flex items-center justify-center">
                        {isCurrent ? (
                          <div className="flex items-end gap-0.5 h-4">
                            <span
                              className="w-1 bg-rose-500 rounded-full animate-bounce"
                              style={{ height: '100%', animationDelay: '0ms' }}
                            />
                            <span
                              className="w-1 bg-rose-500 rounded-full animate-bounce"
                              style={{ height: '55%', animationDelay: '150ms' }}
                            />
                            <span
                              className="w-1 bg-rose-500 rounded-full animate-bounce"
                              style={{ height: '85%', animationDelay: '300ms' }}
                            />
                          </div>
                        ) : (
                          <span className="text-xs font-mono font-bold text-zinc-500 group-hover:text-zinc-300">
                            {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                          </span>
                        )}
                      </div>

                      {/* Ảnh bìa vuông nhỏ chuẩn YouTube Music */}
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Tên bài hát & Nghệ sĩ */}
                      <div className="flex-1 min-w-0">
                        <h4
                          className={`text-sm sm:text-base font-bold truncate ${
                            isCurrent ? 'text-rose-400 font-extrabold' : 'text-zinc-100'
                          }`}
                        >
                          {item.title}
                        </h4>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {item.uploaderName}
                        </p>
                      </div>

                      {/* Thời lượng bài hát */}
                      {item.durationText && (
                        <span className="text-xs font-mono font-bold text-zinc-400 shrink-0 pl-2">
                          {item.durationText}
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {/* Nút tải thêm bài hát */}
              {hasMoreQueue && onLoadMoreQueue && (
                <div className="py-3 px-2 text-center">
                  <button
                    type="button"
                    onClick={onLoadMoreQueue}
                    disabled={isLoadingMoreQueue}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs sm:text-sm font-bold border border-zinc-800 flex items-center justify-center gap-2 transition active:scale-98"
                  >
                    {isLoadingMoreQueue ? (
                      <>
                        <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                        <span>Đang tải thêm bài hát...</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 text-rose-500" />
                        <span>Tải thêm bài hát tiếp theo</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =====================================================================
            THANH ĐIỀU KHIỂN NHẠC CỐ ĐỊNH Ở ĐÁY MÀN HÌNH (YOUTUBE MUSIC BOTTOM BAR)
            Đặc trưng chuẩn của YouTube Music:
            - Thanh kéo tua nhạc (Progress Scrubber) màu đỏ chạy dọc toàn bộ mép trên
            - Bên trái: Prev, -10s, Play/Pause Tròn Trắng Lớn, +10s, Next, Thời gian
            - Ở giữa: Ảnh bìa vuông nhỏ + Tên bài hát + Ca sĩ + Nút Thả tim
            - Bên phải: Shuffle, Repeat, Chuyển sang Xem Video nếu muốn
           ===================================================================== */}
        <div className="sticky bottom-2 z-40 w-full mt-4 rounded-3xl overflow-hidden bg-[#121212]/98 backdrop-blur-xl border border-zinc-700/80 shadow-[0_-10px_30px_rgba(0,0,0,0.85)]">
          {/* Thanh kéo thời gian (Timeline Scrubber) chạy ngang mép trên */}
          <div className="relative w-full h-3.5 flex items-center group cursor-pointer">
            <div
              className="absolute left-0 top-0 bottom-0 bg-rose-600 pointer-events-none transition-all duration-150"
              style={{ width: `${progressPercent}%`, height: '5px' }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              disabled={Boolean(playbackError)}
              onChange={handleSeekChange}
              className="w-full h-3.5 cursor-pointer accent-rose-600 bg-zinc-800/80 m-0"
            />
          </div>

          <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
            {/* CỤM TRÁI: Các nút điều khiển cỡ lớn cho người lái xe VF5 */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 transition active:scale-90"
                title="Bài trước (Phím vô lăng Prev)"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                type="button"
                onClick={() => handleSeekRelative(-10)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center transition active:scale-90"
                title="Tua lùi 10 giây"
              >
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span className="text-[9px] font-extrabold">-10s</span>
              </button>

              {/* Nút Play / Pause Tròn Trắng Biểu Tượng Của YouTube Music */}
              <button
                type="button"
                onClick={togglePlay}
                disabled={Boolean(playbackError)}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shadow-xl shadow-white/20 transition active:scale-90 mx-0.5 shrink-0"
                title={isPlaying ? 'Tạm dừng' : 'Phát nhạc'}
              >
                {isBuffering || isLoading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-black" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7 fill-black text-black" />
                ) : (
                  <Play className="w-7 h-7 fill-black text-black ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSeekRelative(10)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 flex flex-col items-center justify-center transition active:scale-90"
                title="Tua tới 10 giây"
              >
                <RotateCw className="w-4 h-4 text-rose-400" />
                <span className="text-[9px] font-extrabold">+10s</span>
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 flex items-center justify-center disabled:opacity-30 transition active:scale-90"
                title="Bài tiếp theo (Phím vô lăng Next)"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>

              <span className="hidden md:inline-block text-xs font-mono font-bold text-zinc-400 pl-2 whitespace-nowrap">
                {formatSeconds(currentTime)} / {formatSeconds(duration)}
              </span>
            </div>

            {/* CỤM GIỮA: Thông tin bài hát đang phát & Nút Thả Tim */}
            <div className="flex items-center gap-3 min-w-0 flex-1 max-w-md justify-center">
              <img
                src={streamData.thumbnailUrl}
                alt={streamData.title}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover shrink-0 border border-white/10 hidden sm:block"
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {streamData.title}
                </h4>
                <p className="text-[11px] sm:text-xs text-zinc-400 truncate">
                  {streamData.uploader}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleFavorite}
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-90 ${
                  isFavorite
                    ? 'text-rose-500 bg-rose-500/15'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Lưu vào Yêu thích"
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-500' : ''}`} />
              </button>
            </div>

            {/* CỤM PHẢI: Shuffle, Repeat & Chuyển sang Xem MV */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={onToggleShuffle}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition active:scale-90 ${
                  isShuffle
                    ? 'text-rose-500 bg-rose-500/15'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Phát ngẫu nhiên (Shuffle)"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={onToggleRepeat}
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition active:scale-90 ${
                  repeatMode !== 'off'
                    ? 'text-rose-500 bg-rose-500/15'
                    : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title={
                  repeatMode === 'one'
                    ? 'Lặp 1 bài'
                    : repeatMode === 'all'
                    ? 'Lặp danh sách'
                    : 'Không lặp'
                }
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-5 h-5 text-rose-500" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
              </button>

              {onViewModeChange && (
                <button
                  type="button"
                  onClick={() => onViewModeChange('classic')}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 transition active:scale-95"
                  title="Mở giao diện Xem Video"
                >
                  <Tv className="w-4 h-4 text-sky-400" />
                  <span>Xem MV</span>
                </button>
              )}
            </div>
          </div>
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
      {/* Video Viewport / Audio Visualizer Area */}
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

        {/* Phần tử Media cố định */}
        {persistentMediaNode}

        {/* Nếu bật Chỉ nghe nhạc trong giao diện Video Classic */}
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

      {/* Car Player Controls Bar */}
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

      {/* In-Car Source Selection Bar */}
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
