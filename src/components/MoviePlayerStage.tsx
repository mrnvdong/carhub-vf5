import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Loader2,
  ShieldCheck,
  Zap,
  MonitorPlay,
  AlertCircle,
  RefreshCw,
  Subtitles,
} from 'lucide-react';
import { MovieEpisode, MovieSubtitleTrack } from '../types';
import {
  K20ResolvedOption,
  fetchAndCleanMovieM3u8,
  isCobephimEpRef,
  isDirectMp4Url,
  isK20StreamRef,
  isVsmovEmbedUrl,
  resolveCobephimEpisode,
  resolveK20Stream,
  resolveVsmovStream,
} from '../services/movie';
import { formatSeconds } from '../services/api';

function extractSubsFromK20Url(streamUrl: string): MovieSubtitleTrack[] {
  try {
    const u = new URL(streamUrl);
    const raw = u.searchParams.get('subs');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: MovieSubtitleTrack[] = [];
    const seen = new Set<string>();
    for (const s of parsed) {
      const subUrl = typeof s?.url === 'string' ? s.url.trim() : '';
      if (!subUrl || seen.has(subUrl)) continue;
      seen.add(subUrl);
      const code = String(s?.lang || s?.code || '').toLowerCase();
      if (code.startsWith('vi')) out.push({ label: 'Tiếng Việt', lang: 'vi', url: subUrl });
      else if (code.startsWith('en')) out.push({ label: 'English', lang: 'en', url: subUrl });
      else out.push({ label: code.toUpperCase() || 'CC', lang: code || 'und', url: subUrl });
    }
    out.sort((a, b) => (a.lang === 'vi' && b.lang !== 'vi' ? -1 : b.lang === 'vi' && a.lang !== 'vi' ? 1 : 0));
    return out;
  } catch {
    return [];
  }
}

type PlayerMode = 'clean' | 'direct' | 'embed';
const SPEED_STEPS = [1, 1.25, 1.5, 2, 0.75];

interface LoadedSubtitleTrack {
  label: string;
  lang: string;
  blobUrl: string;
}

// Bóc lớp header ảnh PNG giả trang ở đầu phân đoạn MPEG-TS của VSMov (.png -> .ts) trong <0.02ms ngay trên trình duyệt
function stripPngPrefixToMpegTs(buf: ArrayBuffer): ArrayBuffer {
  const u8 = new Uint8Array(buf);
  if (u8.length > 376 && u8[0] === 0x47 && u8[188] === 0x47 && u8[376] === 0x47) {
    return buf;
  }
  const scanLimit = Math.min(u8.length - 377, 16384);
  for (let i = 1; i <= scanLimit; i++) {
    if (u8[i] === 0x47 && u8[i + 188] === 0x47 && u8[i + 376] === 0x47) {
      return buf.slice(i);
    }
  }
  return buf;
}

function createPngStripLoader(BaseLoader: any) {
  return class PngTsStripLoader extends BaseLoader {
    load(context: any, config: any, callbacks: any) {
      const patchedCtx = { ...context, progressData: false };
      const origOnSuccess = callbacks.onSuccess;
      const patchedCallbacks = {
        ...callbacks,
        onProgress: undefined,
        onSuccess: (response: any, stats: any, ctx: any, networkDetails: any) => {
          if (response?.data instanceof ArrayBuffer) {
            response.data = stripPngPrefixToMpegTs(response.data);
          }
          origOnSuccess(response, stats, ctx, networkDetails);
        },
      };
      super.load(patchedCtx, config, patchedCallbacks);
    }
  };
}

interface MoviePlayerStageProps {
  movieTitle: string;
  posterUrl: string;
  serverName: string;
  episode: MovieEpisode | null;
  resumeTimeSec?: number;
  hasPrevEpisode: boolean;
  hasNextEpisode: boolean;
  nextEpisodeName?: string;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onBeforePlay: () => void;
  onProgressSave: (currentTime: number, duration: number) => void;
  onNotifyToast?: (msg: string) => void;
}

export const MoviePlayerStage: React.FC<MoviePlayerStageProps> = ({
  movieTitle,
  posterUrl,
  serverName,
  episode,
  resumeTimeSec = 0,
  hasPrevEpisode,
  hasNextEpisode,
  nextEpisodeName,
  onPrevEpisode,
  onNextEpisode,
  onBeforePlay,
  onProgressSave,
  onNotifyToast,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  const canUseHls = Boolean(
    episode?.linkM3u8 ||
      isVsmovEmbedUrl(episode?.linkEmbed) ||
      isCobephimEpRef(episode?.linkEmbed) ||
      isK20StreamRef(episode?.linkM3u8)
  );
  const [playerMode, setPlayerMode] = useState<PlayerMode>(() =>
    episode?.linkM3u8 ||
    isVsmovEmbedUrl(episode?.linkEmbed) ||
    isCobephimEpRef(episode?.linkEmbed)
      ? 'clean'
      : 'embed'
  );
  const [reloadNonce, setReloadNonce] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showHud, setShowHud] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<LoadedSubtitleTrack[]>([]);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(-1);
  const [resolvedEmbedOverride, setResolvedEmbedOverride] = useState<string>('');
  const [k20Options, setK20Options] = useState<K20ResolvedOption[]>([]);
  const [k20OptionIdx, setK20OptionIdx] = useState<number>(0);

  const hudTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' | 'center' }>({
    time: 0,
    side: 'center',
  });
  const lastSavedAtRef = useRef<number>(0);
  const appliedResumeRef = useRef<boolean>(false);
  const resumeTimeRef = useRef<number>(resumeTimeSec);
  resumeTimeRef.current = resumeTimeSec;

  const onBeforePlayRef = useRef(onBeforePlay);
  onBeforePlayRef.current = onBeforePlay;
  const onProgressSaveRef = useRef(onProgressSave);
  onProgressSaveRef.current = onProgressSave;
  const onNextEpisodeRef = useRef(onNextEpisode);
  onNextEpisodeRef.current = onNextEpisode;
  const onNotifyToastRef = useRef(onNotifyToast);
  onNotifyToastRef.current = onNotifyToast;

  // Reset chế độ & trạng thái mỗi khi đổi tập hoặc đổi server
  useEffect(() => {
    appliedResumeRef.current = false;
    setNextCountdown(null);
    setErrorMsg(null);
    setCurrentTime(0);
    setDuration(0);
    setResolvedEmbedOverride('');
    setK20Options([]);
    setK20OptionIdx(0);
    if (
      episode?.linkM3u8 ||
      isVsmovEmbedUrl(episode?.linkEmbed) ||
      isCobephimEpRef(episode?.linkEmbed)
    ) {
      setPlayerMode((prev) => (prev === 'embed' ? 'clean' : prev));
    } else if (episode?.linkEmbed) {
      setPlayerMode('embed');
    }
  }, [episode?.linkM3u8, episode?.linkEmbed, episode?.slug]);

  const scheduleHideHud = useCallback(() => {
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    hudTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowHud(false);
      }
    }, 3800);
  }, []);

  const revealHud = useCallback(() => {
    setShowHud(true);
    scheduleHideHud();
  }, [scheduleHideHud]);

  // Nạp luồng HLS / MP4 cho tất cả 4 nguồn sạch QC: KKPhim, VSMov (PNG-TS + VTT), CoBePhim, K20 (4K/Phim Xưa MP4)
  useEffect(() => {
    const isInitialVsmov = Boolean(!episode?.linkM3u8 && isVsmovEmbedUrl(episode?.linkEmbed));
    const isInitialCobephim = Boolean(!episode?.linkM3u8 && isCobephimEpRef(episode?.linkEmbed));
    const isInitialK20 = Boolean(isK20StreamRef(episode?.linkM3u8));

    if (
      !episode ||
      playerMode === 'embed' ||
      (!episode.linkM3u8 && !isInitialVsmov && !isInitialCobephim)
    ) {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (episode && playerMode === 'embed' && (resolvedEmbedOverride || episode.linkEmbed)) {
        onBeforePlayRef.current?.();
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let activeBlobUrl: string | null = null;
    let createdSubBlobs: string[] = [];
    let needsPngStrip = isInitialVsmov;
    setErrorMsg(null);
    setIsBuffering(true);
    setSubtitleTracks([]);
    setActiveSubIdx(-1);

    const cleanupHls = () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (activeBlobUrl) {
        try {
          URL.revokeObjectURL(activeBlobUrl);
        } catch {}
        activeBlobUrl = null;
      }
      if (createdSubBlobs.length > 0) {
        for (const b of createdSubBlobs) {
          try {
            URL.revokeObjectURL(b);
          } catch {}
        }
        createdSubBlobs = [];
      }
    };

    const loadSubtitlesAsBlobs = (subs: MovieSubtitleTrack[]) => {
      if (!subs || subs.length === 0) return;
      Promise.allSettled(
        subs.slice(0, 5).map(async (sub) => {
          const r = await fetch(sub.url, { mode: 'cors' });
          if (!r.ok) throw new Error(`VTT HTTP ${r.status}`);
          const vttText = await r.text();
          const blobUrl = URL.createObjectURL(
            new Blob([vttText], { type: 'text/vtt;charset=utf-8' })
          );
          return { label: sub.label, lang: sub.lang, blobUrl } as LoadedSubtitleTrack;
        })
      ).then((results) => {
        const loaded = results
          .filter(
            (x): x is PromiseFulfilledResult<LoadedSubtitleTrack> => x.status === 'fulfilled'
          )
          .map((x) => x.value);
        if (cancelled) {
          loaded.forEach((x) => {
            try {
              URL.revokeObjectURL(x.blobUrl);
            } catch {}
          });
          return;
        }
        createdSubBlobs = loaded.map((x) => x.blobUrl);
        if (loaded.length > 0) {
          setSubtitleTracks(loaded);
          setActiveSubIdx(0);
        }
      });
    };

    const canFallbackToEmbed = () => {
      const emb = resolvedEmbedOverride || episode.linkEmbed;
      return Boolean(emb && !isCobephimEpRef(emb));
    };

    const handleFatalFallback = () => {
      if (cancelled) return;
      if (playerMode === 'clean' && !needsPngStrip && !isInitialK20) {
        onNotifyToastRef.current?.('⚡ Chuyển sang luồng HLS trực tiếp...');
        setPlayerMode('direct');
      } else if (canFallbackToEmbed()) {
        onNotifyToastRef.current?.('🖥️ Chuyển sang trình phát Embed dự phòng...');
        setPlayerMode('embed');
      } else {
        setIsBuffering(false);
        setErrorMsg('Không thể tải luồng video của tập này — thử đổi Server khác');
      }
    };

    const attach = async () => {
      cleanupHls();
      onBeforePlayRef.current?.();

      let resolvedMediaUrl = episode.linkM3u8 || '';
      let vsmovTargetEmbed = isInitialVsmov ? episode.linkEmbed : '';

      // A) Tách luồng tập CoBePhim (cobephim-ep://slug/epId)
      if (isInitialCobephim && episode.linkEmbed) {
        try {
          const cb = await resolveCobephimEpisode(episode.linkEmbed);
          if (cancelled) return;
          if (cb.isEncrypted4k) {
            setIsBuffering(false);
            setErrorMsg(
              'Server 4K này dùng khóa mã hóa riêng của CoBePhim — vui lòng chọn server Phụ đề (KK) / Song Ngữ (VS) ở ngay bên dưới!'
            );
            return;
          }
          if (cb.linkM3u8) {
            resolvedMediaUrl = cb.linkM3u8;
            if (cb.linkEmbed) setResolvedEmbedOverride(cb.linkEmbed);
          } else if (isVsmovEmbedUrl(cb.linkEmbed)) {
            vsmovTargetEmbed = cb.linkEmbed;
            needsPngStrip = true;
            setResolvedEmbedOverride(cb.linkEmbed);
          } else if (cb.linkEmbed) {
            setResolvedEmbedOverride(cb.linkEmbed);
            setPlayerMode('embed');
            return;
          } else {
            setIsBuffering(false);
            setErrorMsg('Tập phim này chưa có nguồn phát mở — hãy thử chọn Server khác');
            return;
          }
        } catch (err: any) {
          if (!cancelled) {
            setIsBuffering(false);
            setErrorMsg(err?.message || 'Không tải được tập phim CoBePhim');
          }
          return;
        }
      }

      // B) Tách luồng K20 (k20-ep://...) -> ưu tiên Direct HLS 4K / MP4 Phim Xưa
      if (isInitialK20 && resolvedMediaUrl) {
        try {
          const k20 = await resolveK20Stream(resolvedMediaUrl);
          if (cancelled) return;
          const opts = k20.streams || [];
          if (opts.length > 0) {
            setK20Options(opts);
            const safeIdx = Math.min(k20OptionIdx, opts.length - 1);
            const picked = opts[safeIdx];
            resolvedMediaUrl = picked.url;
            if (picked.subtitles && picked.subtitles.length > 0) {
              loadSubtitlesAsBlobs(picked.subtitles);
            }
          } else if (episode.linkEmbed) {
            setPlayerMode('embed');
            return;
          } else {
            setIsBuffering(false);
            setErrorMsg('Chưa tìm thấy luồng phát trực tiếp cho tập này');
            return;
          }
        } catch {
          if (!cancelled) {
            if (episode.linkEmbed) {
              setPlayerMode('embed');
            } else {
              setIsBuffering(false);
              setErrorMsg('Không kết nối được máy chủ K20 — bấm Thử lại');
            }
          }
          return;
        }
      }

      // C) Tách luồng VSMov (streamvsmov.com/video/...) -> master.m3u8 + phụ đề WebVTT (không logo, không QC!)
      if (vsmovTargetEmbed) {
        try {
          const resolved = await resolveVsmovStream(vsmovTargetEmbed);
          if (cancelled) return;
          resolvedMediaUrl = resolved.m3u8Url;
          needsPngStrip = true;
          loadSubtitlesAsBlobs(resolved.subtitles);
        } catch (err) {
          console.warn('[MoviePlayer] VSMov resolve fallback -> embed:', err);
          if (!cancelled) {
            setPlayerMode('embed');
          }
          return;
        }
      }

      if (!resolvedMediaUrl || cancelled) return;

      // D) Nếu luồng là MP4 trực tiếp (vd CLB Phim Xưa 720p MP4) -> phát native HTML5 <video> (Range 206 seek siêu mượt!)
      if (isDirectMp4Url(resolvedMediaUrl)) {
        video.src = resolvedMediaUrl;
        video.playbackRate = playbackRate;
        video.load();
        video.play().catch(() => {
          setIsBuffering(false);
          setIsPlaying(false);
        });
        return;
      }

      // Nếu là URL K20 proxy có đính kèm subs= -> nạp luôn phụ đề cho nút CC!
      const k20InlineSubs = extractSubsFromK20Url(resolvedMediaUrl);
      if (k20InlineSubs.length > 0) {
        loadSubtitlesAsBlobs(k20InlineSubs);
      }

      const isK20ManagedHls = /sc\.k-20\.xyz/i.test(resolvedMediaUrl);

      const ua = navigator.userAgent || '';
      const isIosDevice =
        /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
      const canNativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';

      // 1) Ưu tiên hls.js:
      //    - KKPhim: lọc QC M3U8 client-side 100%
      //    - VSMov: bóc header PNG -> MPEG-TS sạch logo & QC (cả trên iOS 17.1+ ManagedMediaSource!)
      //    - K20: nạp trực tiếp playlist 4K/HD đã sạch QC kèm phụ đề gốc!
      try {
        const mod = await import('hls.js');
        if (cancelled) return;
        const Hls = mod.default;
        if (Hls && Hls.isSupported() && (!isIosDevice || needsPngStrip)) {
          let sourceUrl = resolvedMediaUrl;
          if (playerMode === 'clean' && !isK20ManagedHls) {
            try {
              const cleaned = await fetchAndCleanMovieM3u8(resolvedMediaUrl);
              if (cancelled) {
                URL.revokeObjectURL(cleaned.blobUrl);
                return;
              }
              activeBlobUrl = cleaned.blobUrl;
              sourceUrl = cleaned.blobUrl;
              if (cleaned.strippedCount > 0) {
                onNotifyToastRef.current?.(
                  `🛡️ Đã lọc bỏ ${cleaned.strippedCount} đoạn quảng cáo giữa phim!`
                );
              }
            } catch {
              sourceUrl = resolvedMediaUrl;
            }
          }

          if (cancelled) return;
          const hlsConfig: any = {
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 60,
            maxBufferLength: 35,
            maxMaxBufferLength: 60,
            fragLoadingTimeOut: 20000,
            manifestLoadingTimeOut: 15000,
          };
          if (needsPngStrip && Hls.DefaultConfig?.loader) {
            hlsConfig.fLoader = createPngStripLoader(Hls.DefaultConfig.loader);
          }

          const hls = new Hls(hlsConfig);
          hlsRef.current = hls;
          hls.attachMedia(video);

          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (!cancelled) {
              hls.loadSource(sourceUrl);
            }
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            video.playbackRate = playbackRate;
            video.play().catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
            });
          });

          let networkRetries = 0;
          hls.on(Hls.Events.ERROR, (_evt: any, data: any) => {
            if (cancelled || !data?.fatal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
              networkRetries += 1;
              hls.startLoad();
              return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            cleanupHls();
            handleFatalFallback();
          });
          return;
        }
      } catch (err) {
        console.warn('[MoviePlayer] hls.js load error:', err);
      }

      // 2) Trên iPhone / CarPlay WKWebView: chạy Native Hardware HLS trực tiếp!
      if (canNativeHls && !needsPngStrip) {
        video.src = resolvedMediaUrl;
        video.playbackRate = playbackRate;
        video.load();
        video.play().catch(() => {
          setIsBuffering(false);
          setIsPlaying(false);
        });
        return;
      }

      handleFatalFallback();
    };

    attach();

    return () => {
      cancelled = true;
      cleanupHls();
      if (video) {
        if (video.currentTime > 5 && Number.isFinite(video.duration) && video.duration > 30) {
          onProgressSaveRef.current(video.currentTime, video.duration);
        }
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.linkM3u8, episode?.linkEmbed, episode?.slug, playerMode, reloadNonce, k20OptionIdx]);

  // Đồng bộ bật/tắt track phụ đề WebVTT trên <video>
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !v.textTracks) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = i === activeSubIdx ? 'showing' : 'hidden';
    }
  }, [subtitleTracks, activeSubIdx]);

  // Đếm ngược 8 giây tự sang tập kế tiếp
  useEffect(() => {
    if (nextCountdown === null) return;
    if (nextCountdown <= 0) {
      setNextCountdown(null);
      onNextEpisodeRef.current();
      return;
    }
    const id = window.setTimeout(() => {
      setNextCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [nextCountdown]);

  // Theo dõi trạng thái Fullscreen chuẩn
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    revealHud();
    if (v.paused) {
      onBeforePlayRef.current?.();
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [revealHud]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const maxD = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const next = Math.max(0, Math.min(maxD || v.currentTime + delta, v.currentTime + delta));
      v.currentTime = next;
      setCurrentTime(next);
      setSeekFlash(delta < 0 ? 'back' : 'forward');
      window.setTimeout(() => setSeekFlash(null), 500);
      revealHud();
    },
    [revealHud]
  );

  const seekTo = useCallback(
    (val: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(val)) return;
      v.currentTime = Math.max(0, val);
      setCurrentTime(val);
      revealHud();
    },
    [revealHud]
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    revealHud();
  }, [revealHud]);

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEED_STEPS.indexOf(prev);
      const next = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
      if (videoRef.current) {
        videoRef.current.playbackRate = next;
      }
      onNotifyToastRef.current?.(`⏩ Tốc độ xem phim: ${next}x`);
      return next;
    });
    revealHud();
  }, [revealHud]);

  const cycleSubtitle = useCallback(() => {
    if (subtitleTracks.length === 0) return;
    setActiveSubIdx((prev) => {
      const next = prev + 1 >= subtitleTracks.length ? -1 : prev + 1;
      onNotifyToastRef.current?.(
        next === -1 ? '💬 Đã tắt phụ đề' : `💬 Phụ đề: ${subtitleTracks[next].label}`
      );
      return next;
    });
    revealHud();
  }, [subtitleTracks, revealHud]);

  const toggleFullscreen = useCallback(() => {
    const container = stageRef.current;
    const video = videoRef.current as any;
    if (!document.fullscreenElement) {
      if (container && typeof container.requestFullscreen === 'function') {
        container.requestFullscreen().catch(() => {
          if (video && typeof video.webkitEnterFullscreen === 'function') {
            video.webkitEnterFullscreen();
          }
        });
      } else if (video && typeof video.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen();
      }
    } else {
      document.exitFullscreen().catch(() => {});
    }
    revealHud();
  }, [revealHud]);

  // Chạm đơn: bật/tắt thanh HUD; Chạm đúp trái/phải: tua -10s / +10s chuẩn YouTube/Netflix!
  const handleStageTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, a')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    const side: 'left' | 'right' | 'center' =
      relX < 0.3 ? 'left' : relX > 0.7 ? 'right' : 'center';
    const now = Date.now();

    if (now - lastTapRef.current.time < 280 && lastTapRef.current.side === side && side !== 'center') {
      lastTapRef.current = { time: 0, side: 'center' };
      seekBy(side === 'left' ? -10 : 10);
      return;
    }

    lastTapRef.current = { time: now, side };
    if (showHud && isPlaying) {
      setShowHud(false);
    } else {
      revealHud();
    }
  };

  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  if (!episode) {
    return (
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/15 flex flex-col items-center justify-center gap-2 text-white/75">
        <MonitorPlay className="w-10 h-10 text-violet-400" />
        <p className="text-sm font-bold">Chưa có nguồn phát cho bộ phim này</p>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      onClick={playerMode !== 'embed' ? handleStageTap : undefined}
      onMouseMove={playerMode !== 'embed' ? revealHud : undefined}
      className={`relative w-full bg-black overflow-hidden select-none border border-white/15 shadow-2xl ${
        isFullscreen ? 'h-screen rounded-none' : 'aspect-video rounded-2xl sm:rounded-3xl'
      }`}
    >
      {/* TRÌNH PHÁT EMBED */}
      {playerMode === 'embed' && (resolvedEmbedOverride || episode.linkEmbed) ? (
        <div className="absolute inset-0 w-full h-full">
          <iframe
            key={resolvedEmbedOverride || episode.linkEmbed}
            src={resolvedEmbedOverride || episode.linkEmbed}
            title={`${movieTitle} - ${episode.name}`}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="origin"
            className="w-full h-full border-0 bg-black"
          />
          {canUseHls && (
            <button
              type="button"
              onClick={() => setPlayerMode('clean')}
              className="absolute top-2.5 right-2.5 z-20 min-h-[2.1rem] px-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-300/60 text-xs font-extrabold flex items-center gap-1.5 backdrop-blur-md shadow-xl active:scale-95 transition"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Quay lại HLS Sạch QC</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* VIDEO ELEMENT HLS 1080P */}
          <video
            ref={videoRef}
            poster={posterUrl || undefined}
            playsInline
            muted={isMuted}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (!v) return;
              const d = Number.isFinite(v.duration) ? v.duration : 0;
              setDuration(d);
              v.playbackRate = playbackRate;
              // Tự tua đến vị trí xem dở nếu còn lại > 20s
              if (
                !appliedResumeRef.current &&
                resumeTimeRef.current > 10 &&
                d > 40 &&
                resumeTimeRef.current < d - 20
              ) {
                appliedResumeRef.current = true;
                v.currentTime = resumeTimeRef.current;
                setCurrentTime(resumeTimeRef.current);
                onNotifyToastRef.current?.(
                  `⏩ Tiếp tục xem từ ${formatSeconds(resumeTimeRef.current)}`
                );
              }
            }}
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (!v) return;
              setCurrentTime(v.currentTime || 0);
              if (Number.isFinite(v.duration) && v.duration > 0) {
                setDuration(v.duration);
                const now = Date.now();
                if (now - lastSavedAtRef.current >= 5000 && v.currentTime > 5) {
                  lastSavedAtRef.current = now;
                  onProgressSaveRef.current(v.currentTime, v.duration);
                }
              }
            }}
            onPlaying={() => {
              setIsPlaying(true);
              setIsBuffering(false);
              setErrorMsg(null);
              scheduleHideHud();
            }}
            onPause={() => {
              setIsPlaying(false);
              setShowHud(true);
              const v = videoRef.current;
              if (v && v.currentTime > 5 && Number.isFinite(v.duration) && v.duration > 30) {
                onProgressSaveRef.current(v.currentTime, v.duration);
              }
            }}
            onWaiting={() => setIsBuffering(true)}
            onEnded={() => {
              setIsPlaying(false);
              setShowHud(true);
              if (hasNextEpisode) {
                setNextCountdown(8);
              }
            }}
            onError={() => {
              if (playerMode === 'clean' && !isVsmovEmbedUrl(episode.linkEmbed)) {
                setPlayerMode('direct');
              } else if (episode.linkEmbed) {
                setPlayerMode('embed');
              } else {
                setIsBuffering(false);
                setErrorMsg('Luồng phát gặp sự cố — thử đổi sang Trực tiếp hoặc Embed');
              }
            }}
          >
            {subtitleTracks.map((tr, idx) => (
              <track
                key={tr.blobUrl}
                kind="subtitles"
                src={tr.blobUrl}
                srcLang={tr.lang}
                label={tr.label}
                default={idx === 0}
              />
            ))}
          </video>

          {/* Hiệu ứng chớp khi chạm đúp tua -10s / +10s */}
          {seekFlash && (
            <div
              className={`absolute inset-y-0 ${
                seekFlash === 'back' ? 'left-0 pl-8 justify-start' : 'right-0 pr-8 justify-end'
              } w-1/2 flex items-center pointer-events-none z-20`}
            >
              <div className="px-4 py-2.5 rounded-full bg-black/75 border border-white/25 text-white text-sm font-black flex items-center gap-1.5 backdrop-blur-md">
                {seekFlash === 'back' ? (
                  <>
                    <RotateCcw className="w-5 h-5" />
                    <span>-10 giây</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-5 h-5" />
                    <span>+10 giây</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Vòng xoay đang tải / lỗi */}
          {isBuffering && !errorMsg && (
            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center gap-2 bg-black/35">
              <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
              <span className="text-xs font-extrabold text-white/90 px-3 py-1 rounded-full bg-black/60">
                Đang nạp phim Full HD...
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-5 text-center">
              <AlertCircle className="w-10 h-10 text-rose-400" />
              <p className="text-sm font-bold text-white max-w-md">{errorMsg}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="min-h-[2.5rem] px-4 rounded-xl bg-violet-600 text-white text-xs font-black flex items-center gap-1.5 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Thử lại</span>
                </button>
                {episode.linkEmbed && (
                  <button
                    type="button"
                    onClick={() => setPlayerMode('embed')}
                    className="min-h-[2.5rem] px-4 rounded-xl bg-white/15 border border-white/25 text-white text-xs font-black active:scale-95"
                  >
                    Mở Embed dự phòng
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Bảng đếm ngược tự chuyển tập tiếp theo kiểu Netflix */}
          {nextCountdown !== null && hasNextEpisode && (
            <div className="absolute bottom-20 right-4 z-30 max-w-[18rem] rounded-2xl bg-slate-950/92 border border-violet-400/50 p-3.5 shadow-2xl backdrop-blur-xl space-y-2.5 text-white">
              <div className="text-xs font-extrabold text-violet-300">
                ⏭️ Tự chuyển tập sau {nextCountdown}s
              </div>
              <p className="text-xs font-bold text-white/90 truncate">
                Tiếp theo: {nextEpisodeName || 'Tập tiếp theo'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNextCountdown(null);
                    onNextEpisode();
                  }}
                  className="flex-1 min-h-[2.25rem] px-3 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-black active:scale-95"
                >
                  Phát ngay
                </button>
                <button
                  type="button"
                  onClick={() => setNextCountdown(null)}
                  className="min-h-[2.25rem] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold active:scale-95"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* LỚP ĐIỀU KHIỂN CINEMA HUD (Tự ẩn khi đang xem, chạm nhẹ để hiện) */}
          <div
            className={`absolute inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-4 bg-gradient-to-t from-black/90 via-black/25 to-black/75 transition-opacity duration-250 ${
              showHud || !isPlaying ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* DÒNG TRÊN: TÊN PHIM + TẬP + CÔNG TẮC SẠCH QC / TRỰC TIẾP / EMBED */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-violet-600 text-white text-[0.68rem] font-black shrink-0">
                    {episode.name}
                  </span>
                  <span className="text-xs font-bold text-white/75 truncate">{serverName}</span>
                </div>
                <h3 className="text-xs sm:text-sm font-black text-white truncate mt-0.5 drop-shadow">
                  {movieTitle}
                </h3>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* 3 chế độ phát linh hoạt: Sạch QC (Mặc định) / Trực tiếp / Embed */}
                <div className="inline-flex items-center p-0.5 rounded-full bg-black/65 border border-white/20 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setPlayerMode('clean')}
                    title="Tự lọc bỏ quảng cáo chèn giữa phim, video vẫn chạy trực tiếp từ CDN gốc"
                    className={`min-h-[1.95rem] px-2.5 rounded-full text-[0.7rem] font-extrabold flex items-center gap-1 transition ${
                      playerMode === 'clean'
                        ? 'bg-emerald-500 text-slate-950 shadow'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Sạch QC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerMode('direct')}
                    title="Phát trực tiếp link m3u8 gốc"
                    className={`min-h-[1.95rem] px-2.5 rounded-full text-[0.7rem] font-extrabold flex items-center gap-1 transition ${
                      playerMode === 'direct'
                        ? 'bg-sky-400 text-slate-950 shadow'
                        : 'text-white/75 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Gốc</span>
                  </button>
                  {episode.linkEmbed && !isCobephimEpRef(episode.linkEmbed) && (
                    <button
                      type="button"
                      onClick={() => setPlayerMode('embed')}
                      title="Trình phát Embed dự phòng"
                      className="min-h-[1.95rem] px-2.5 rounded-full text-[0.7rem] font-extrabold text-white/75 hover:text-white transition"
                    >
                      Embed
                    </button>
                  )}
                </div>

                {k20Options.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = (k20OptionIdx + 1) % k20Options.length;
                      setK20OptionIdx(nextIdx);
                      onNotifyToastRef.current?.(`🎬 Đã đổi luồng: ${k20Options[nextIdx]?.label}`);
                    }}
                    title="Chuyển nhanh giữa các bản 4K / Thuyết minh / Vietsub / 720p"
                    className="min-h-[2.1rem] max-w-[10rem] px-2.5 rounded-full bg-amber-400/95 text-slate-950 border border-amber-200 text-[0.7rem] font-black truncate active:scale-95 transition"
                  >
                    ⚡ {k20Options[k20OptionIdx]?.label || 'Đổi nguồn'}
                  </button>
                )}

                {subtitleTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={cycleSubtitle}
                    title={
                      activeSubIdx >= 0
                        ? `Phụ đề: ${subtitleTracks[activeSubIdx]?.label} (bấm để đổi hoặc tắt)`
                        : 'Bật phụ đề'
                    }
                    className={`min-h-[2.1rem] px-2.5 rounded-full border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${
                      activeSubIdx >= 0
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow'
                        : 'bg-black/65 border-white/20 text-white/75 hover:text-white'
                    }`}
                  >
                    <Subtitles className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">
                      {activeSubIdx >= 0 ? subtitleTracks[activeSubIdx]?.label : 'Tắt CC'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={cycleSpeed}
                  className="min-h-[2.1rem] px-2.5 rounded-full bg-black/65 border border-white/20 text-white text-xs font-mono font-black active:scale-95 transition"
                >
                  {playbackRate}x
                </button>
              </div>
            </div>

            {/* CỤM GIỮA: NÚT CẢM ỨNG TO CHUẨN Ô TÔ (-10s | PHÁT/DỪNG | +10s) */}
            <div className="flex items-center justify-center gap-5 sm:gap-8">
              <button
                type="button"
                onClick={() => seekBy(-10)}
                aria-label="Tua lùi 10 giây"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/25 text-white flex flex-col items-center justify-center backdrop-blur-md active:scale-90 transition"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="text-[0.6rem] font-black leading-none mt-0.5">-10s</span>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Tạm dừng phim' : 'Phát phim'}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white hover:bg-white/90 text-slate-950 flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.65)] active:scale-90 transition"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-slate-950" />
                ) : (
                  <Play className="w-8 h-8 ml-1 fill-slate-950" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekBy(10)}
                aria-label="Tua tới 10 giây"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/55 hover:bg-black/75 border border-white/25 text-white flex flex-col items-center justify-center backdrop-blur-md active:scale-90 transition"
              >
                <RotateCw className="w-5 h-5" />
                <span className="text-[0.6rem] font-black leading-none mt-0.5">+10s</span>
              </button>
            </div>

            {/* DÒNG ĐÁY: THANH TUA + THỜI GIAN + TẬP TRƯỚC/SAU + ÂM LƯỢNG + TOÀN MÀN HÌNH */}
            <div className="space-y-1">
              <input
                type="range"
                aria-label="Thanh tua phim"
                min={0}
                max={duration > 0 ? duration : 100}
                step={1}
                value={Math.min(currentTime, duration > 0 ? duration : 100)}
                style={{ '--progress': `${progressPct}%` } as React.CSSProperties}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                className="car-scrubber"
              />

              <div className="flex items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold tabular-nums">
                    {formatSeconds(currentTime)} / {duration > 0 ? formatSeconds(duration) : '--:--'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {hasPrevEpisode && (
                    <button
                      type="button"
                      onClick={onPrevEpisode}
                      className="min-h-[2.2rem] px-2.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-extrabold flex items-center gap-1 active:scale-95 transition"
                    >
                      <SkipBack className="w-3.5 h-3.5 fill-current" />
                      <span className="hidden sm:inline">Tập trước</span>
                    </button>
                  )}

                  {hasNextEpisode && (
                    <button
                      type="button"
                      onClick={onNextEpisode}
                      className="min-h-[2.2rem] px-2.5 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-black flex items-center gap-1 active:scale-95 transition"
                    >
                      <span className="hidden sm:inline">Tập tiếp</span>
                      <SkipForward className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? 'Bật tiếng phim' : 'Tắt tiếng phim'}
                    className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center active:scale-90 transition"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Thu nhỏ màn hình' : 'Xem toàn màn hình'}
                    className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center active:scale-90 transition"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
