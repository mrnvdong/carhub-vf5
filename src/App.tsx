import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Search, Mic, WifiOff } from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { CarSearchModal } from './components/CarSearchModal';
import { PlaylistSyncModal } from './components/PlaylistSyncModal';
import { CoPilotRemoteView } from './components/CoPilotRemoteView';
import type { MovieExternalCommand } from './components/MoviesView';
import {
  VideoItem,
  StreamData,
  UiScale,
  ViewMode,
  RepeatMode,
  RailSection,
  QueueSource,
  UserPlaylist,
  NightMode,
  MapTheme,
  SavedPlace,
  PendingNavTarget,
  MusicSource,
  MovieItem,
  MovieWatchHistoryItem,
  CustomHazardPin,
} from './types';
import { getCarTheme, isLightMapTheme } from './utils/theme';
import { getCategoryQuery } from './constants/categories';
import { searchVideos, fetchRadioMix } from './services/api';
import {
  pullSyncData,
  pushSyncData,
  normalizeSyncCode,
  pollCarRemoteState,
  clearPendingNav,
  clearRemoteCommand,
} from './services/sync';
import {
  loadMovieFavorites,
  loadMovieHistory,
  replaceMovieFavoritesStorage,
  replaceMovieHistoryStorage,
} from './services/movie';
import { loadCustomHazards, saveCustomHazards } from './services/vf5Tools';
import { VoiceCommandIntent } from './services/voiceCommands';
import { useCarHardwareControls } from './hooks/useCarHardwareControls';

const DEFAULT_PLAYLISTS: UserPlaylist[] = [
  { id: 'pl-highway', name: 'Đi Cao Tốc', icon: '🚗', items: [] },
  { id: 'pl-bolero', name: 'Bolero Chọn Lọc', icon: '📻', items: [] },
  { id: 'pl-kids', name: 'Nhạc Cho Bé', icon: '👶', items: [] },
];

function buildEmbedStreamData(video: VideoItem): StreamData {
  const isSc = video.source === 'soundcloud' || video.id.startsWith('sc_');
  return {
    id: video.id,
    title: video.title,
    uploader: video.uploaderName,
    thumbnailUrl:
      video.thumbnail ||
      (isSc
        ? 'https://a-v2.sndcdn.com/assets/images/sc-icons/ios-a62dfc8fe7.png'
        : `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`),
    duration: video.duration || 0,
    playbackType: isSc ? 'hls' : 'embed',
    source: isSc ? 'soundcloud' : 'youtube-embed',
  };
}

function mergeUniqueTracks(incoming: VideoItem[], existing: VideoItem[]): VideoItem[] {
  const seen = new Set<string>();
  const out: VideoItem[] = [];
  for (const v of [...incoming, ...existing]) {
    if (!v?.id || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

export const App: React.FC = () => {
  // Mặc định mở thẳng màn hình Cockpit 3D + Nhạc khi lên xe VF5!
  const [railSection, setRailSection] = useState<RailSection>('cockpit');
  const [queueSource, setQueueSource] = useState<QueueSource>('explore');

  // Nguồn phát nhạc: YouTube hoặc SoundCloud (lưu vào localStorage)
  const [musicSource, setMusicSource] = useState<MusicSource>(() => {
    try {
      const saved = localStorage.getItem('carhub_music_source');
      return saved === 'soundcloud' ? 'soundcloud' : 'youtube';
    } catch {
      return 'youtube';
    }
  });
  const musicSourceRef = useRef<MusicSource>(musicSource);
  musicSourceRef.current = musicSource;

  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    try {
      return localStorage.getItem('carhub_last_category') || 'remix';
    } catch {
      return 'remix';
    }
  });
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Co-Pilot Remote mode (?copilot=CODE cho hành khách ngồi ghế sau quét QR!)
  const [copilotCode, setCopilotCode] = useState<string>(() => {
    try {
      if (typeof window !== 'undefined') {
        const c = normalizeSyncCode(new URLSearchParams(window.location.search).get('copilot') || '');
        if (c.length >= 4) return c;
      }
    } catch {}
    return '';
  });

  // Lệnh điều phối toàn app từ Trợ lý giọng nói & Co-Pilot ghế sau
  const [syncPullNonce, setSyncPullNonce] = useState<number>(0);
  const [movieCommand, setMovieCommand] = useState<MovieExternalCommand | null>(null);
  const [tvChannelCommand, setTvChannelCommand] = useState<{ nonce: number; query: string } | null>(null);
  const [newsAutoPlayNonce, setNewsAutoPlayNonce] = useState<number>(0);
  const [hudOpenNonce, setHudOpenNonce] = useState<number>(0);
  const [remoteTogglePlayNonce, setRemoteTogglePlayNonce] = useState<number>(0);
  const lastSeenCmdIdRef = useRef<string>('');

  // Search Modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [startVoiceOnOpen, setStartVoiceOnOpen] = useState<boolean>(false);

  // Sync & Playlist Modal state (Upgrade #2)
  const [syncModalOpen, setSyncModalOpen] = useState<boolean>(false);
  const [syncModalMode, setSyncModalMode] = useState<'sync' | 'addTrack'>('sync');

  const handleOpenSearchModal = useCallback((startVoice = false) => {
    setStartVoiceOnOpen(startVoice);
    setIsSearchModalOpen(true);
  }, []);

  const handleOpenSyncModal = useCallback((mode: 'sync' | 'addTrack') => {
    setSyncModalMode(mode);
    setSyncModalOpen(true);
  }, []);

  // UI Scale (4 mức: compact 92% | normal 106% | large 122% VF5 | xlarge 138% Siêu to)
  const [uiScale, setUiScale] = useState<UiScale>(() => {
    try {
      const saved = localStorage.getItem('carhub_ui_scale');
      if (saved === 'compact' || saved === 'normal' || saved === 'large' || saved === 'xlarge') {
        return saved;
      }
      return 'large';
    } catch {
      return 'large';
    }
  });

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const modeParam = urlParams.get('mode');
        if (modeParam === 'ytmusic' || modeParam === 'music') return 'ytmusic';
        if (modeParam === 'classic' || modeParam === 'video') return 'classic';
      }
      const saved = localStorage.getItem('carhub_view_mode') as ViewMode | null;
      if (saved === 'classic' || saved === 'ytmusic') return saved;
      return 'ytmusic';
    } catch {
      return 'ytmusic';
    }
  });

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('carhub_view_mode', mode);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, []);

  // Upgrade #1: SponsorBlock Auto-Skip ON by default
  const [autoSkipEnabled, setAutoSkipEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('carhub_autoskip');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Đồng bộ chủ đề toàn hệ thống (Bản đồ 3D Sáng / OSM -> Toàn app Sáng; 3D Đêm / Vệ tinh -> Toàn app Tối)
  const [mapTheme, setMapTheme] = useState<MapTheme>(() => {
    try {
      const saved = localStorage.getItem('carhub_cockpit_map_theme') as MapTheme | null;
      if (saved === 'vector3d' || saved === 'dark3d' || saved === 'osm' || saved === 'satellite') {
        return saved;
      }
    } catch {}
    const hr = new Date().getHours();
    return hr >= 18 || hr < 6 ? 'dark3d' : 'vector3d';
  });

  const isLightTheme = isLightMapTheme(mapTheme);
  const nightMode: NightMode = isLightTheme ? 'off' : 'on';
  const isNightDimmed = !isLightTheme;

  const handleToggleDayNight = useCallback(() => {
    setMapTheme((prev) => (isLightMapTheme(prev) ? 'dark3d' : 'vector3d'));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_cockpit_map_theme', mapTheme);
    } catch {}
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = isLightTheme ? 'light' : 'dark';
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', isLightTheme ? '#e8edf5' : '#070a12');
      }
    }
  }, [mapTheme, isLightTheme]);

  // Playback modes: Shuffle & Repeat
  const [isShuffle, setIsShuffle] = useState<boolean>(() => {
    try {
      return localStorage.getItem('carhub_shuffle') === 'true';
    } catch {
      return false;
    }
  });

  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    try {
      const saved = localStorage.getItem('carhub_repeat') as RepeatMode | null;
      if (saved === 'off' || saved === 'all' || saved === 'one') return saved;
      return 'all';
    } catch {
      return 'all';
    }
  });

  // Local storage: history, favorites, custom playlists & sync code
  const [history, setHistory] = useState<VideoItem[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState<VideoItem[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_playlists');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_PLAYLISTS;
    } catch {
      return DEFAULT_PLAYLISTS;
    }
  });

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('favorites');
  const [activeQueuePlaylistId, setActiveQueuePlaylistId] = useState<string>('');

  const [syncCode, setSyncCode] = useState<string>(() => {
    try {
      return localStorage.getItem('carhub_sync_code') || '';
    } catch {
      return '';
    }
  });

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_saved_places');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [incomingNavTarget, setIncomingNavTarget] = useState<PendingNavTarget | null>(null);
  const lastSeenNavIdRef = useRef<string>('');
  const searchAbortRef = useRef<AbortController | null>(null);
  const suppressNextAutoPushRef = useRef<boolean>(false);

  const [videos, setVideos] = useState<VideoItem[]>(() => {
    try {
      const cached = localStorage.getItem('carhub_cached_videos');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const videosRef = useRef<VideoItem[]>(videos);
  videosRef.current = videos;

  // Upgrade #5: Auto-Mix Queue state
  const [mixVideos, setMixVideos] = useState<VideoItem[]>([]);
  const [isLoadingMix, setIsLoadingMix] = useState<boolean>(false);

  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(() => {
    try {
      const savedLast = localStorage.getItem('carhub_last_video');
      if (savedLast) {
        const parsed = JSON.parse(savedLast);
        if (parsed && parsed.id) return parsed;
      }
    } catch {}
    return null;
  });

  const [streamData, setStreamData] = useState<StreamData | null>(() =>
    currentVideo ? buildEmbedStreamData(currentVideo) : null
  );

  const [nextContinuation, setNextContinuation] = useState<string | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('carhub_recent_searches');
      return saved
        ? JSON.parse(saved)
        : ['Nhạc trẻ remix bass căng', 'Vinahouse nonstop', 'Bolero hải ngoại'];
    } catch {
      return ['Nhạc trẻ remix bass căng', 'Vinahouse nonstop', 'Bolero hải ngoại'];
    }
  });

  const currentVideoRef = useRef<VideoItem | null>(currentVideo);
  useEffect(() => {
    currentVideoRef.current = currentVideo;
  }, [currentVideo]);

  // Adaptive root font-size scaling cho MỌI màn hình: VF5 8" bé (640x360 / 800x480 / 1280x720), màn TO (10–15"), màn DÀI (Ultrawide 21:9) & điện thoại dọc!
  useEffect(() => {
    const applyResponsiveRootScale = () => {
      const h = window.innerHeight || 480;
      const w = window.innerWidth || 800;
      const aspect = w / Math.max(h, 1);

      // Phân loại hình dáng màn hình
      const screenClass =
        w < 560
          ? 'portrait'
          : w >= 980 && aspect >= 2.05
          ? 'ultrawide'
          : h <= 520
          ? 'compact-car'
          : 'standard';
      document.documentElement.dataset.screen = screenClass;

      // Nền root thích ứng theo chiều cao/rộng thực (KHÔNG bóp nhỏ dưới 14.5px trên VF5!)
      let basePx = 16.5;
      if (h <= 390) {
        // CarPlay @2x siêu thấp (VD: 640x360)
        basePx = 14.5;
      } else if (h <= 520) {
        // CarPlay 800x480 hoặc màn dài 1280x480
        basePx = 15.6;
      } else if (w >= 1180 && h >= 660) {
        // VF5 8" 1280x720 @1x, Android Box 1280x720/1920x720, Tablet/Desktop lớn
        basePx = 17.5;
      } else if (w < 560) {
        // Điện thoại cầm tay màn dọc
        basePx = 15.5;
      }

      const multiplier =
        uiScale === 'compact'
          ? 0.92
          : uiScale === 'normal'
          ? 1.06
          : uiScale === 'large'
          ? 1.22
          : 1.38;

      // Trần an toàn theo chiều cao thực tế để nút to rõ nhưng không tràn khung
      const maxSafe = h <= 390 ? 17.5 : h <= 500 ? 19.6 : h <= 640 ? 21.5 : 24.5;
      const finalPx = Math.min(maxSafe, Math.max(13.5, Math.round(basePx * multiplier * 10) / 10));
      document.documentElement.style.fontSize = `${finalPx}px`;
    };

    applyResponsiveRootScale();
    // Thông báo bản đồ 3D & khung Video/TV căn lại tọa độ tức thì sau khi đổi cỡ chữ
    const rafSync = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
    window.addEventListener('resize', applyResponsiveRootScale);
    window.visualViewport?.addEventListener('resize', applyResponsiveRootScale);
    return () => {
      window.cancelAnimationFrame(rafSync);
      window.removeEventListener('resize', applyResponsiveRootScale);
      window.visualViewport?.removeEventListener('resize', applyResponsiveRootScale);
    };
  }, [uiScale]);

  // Screen Wake Lock
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    };
    requestWakeLock();
    const onVis = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try {
        wakeLock?.release?.();
      } catch {}
    };
  }, []);

  // Persist user settings & playlists
  useEffect(() => {
    try {
      localStorage.setItem('carhub_ui_scale', uiScale);
    } catch {}
  }, [uiScale]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_autoskip', String(autoSkipEnabled));
    } catch {}
  }, [autoSkipEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_night_mode', nightMode);
    } catch {}
  }, [nightMode]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_shuffle', String(isShuffle));
    } catch {}
  }, [isShuffle]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_repeat', repeatMode);
    } catch {}
  }, [repeatMode]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_history', JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_playlists', JSON.stringify(playlists));
    } catch {}
  }, [playlists]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_sync_code', syncCode);
    } catch {}
  }, [syncCode]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_saved_places', JSON.stringify(savedPlaces));
    } catch {}
  }, [savedPlaces]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_music_source', musicSource);
    } catch {}
  }, [musicSource]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_recent_searches', JSON.stringify(recentSearches));
    } catch {}
  }, [recentSearches]);

  useEffect(() => {
    if (videos.length > 0) {
      try {
        localStorage.setItem('carhub_cached_videos', JSON.stringify(videos.slice(0, 40)));
      } catch {}
    }
  }, [videos]);

  // Upgrade #2 + #8: Đồng bộ chuẩn xác Nhạc + Điểm ghim + Phim xem dở + Camera cá nhân!
  const applyPulledSync = useCallback(
    (
      pulledFavs: VideoItem[],
      pulledPlaylists: UserPlaylist[],
      pulledPlaces: SavedPlace[],
      code: string,
      extras?: {
        movieFavorites?: MovieItem[];
        movieHistory?: MovieWatchHistoryItem[];
        customHazards?: CustomHazardPin[];
      }
    ) => {
      suppressNextAutoPushRef.current = true;
      setSyncCode(code);
      setFavorites(Array.isArray(pulledFavs) ? pulledFavs : []);
      if (Array.isArray(pulledPlaylists) && pulledPlaylists.length > 0) {
        setPlaylists(pulledPlaylists);
      }
      if (Array.isArray(pulledPlaces)) {
        setSavedPlaces(pulledPlaces);
      }
      if (extras) {
        if (Array.isArray(extras.movieFavorites) && extras.movieFavorites.length > 0) {
          replaceMovieFavoritesStorage(extras.movieFavorites);
        }
        if (Array.isArray(extras.movieHistory) && extras.movieHistory.length > 0) {
          replaceMovieHistoryStorage(extras.movieHistory);
        }
        if (Array.isArray(extras.customHazards) && extras.customHazards.length > 0) {
          saveCustomHazards(extras.customHazards);
        }
        setSyncPullNonce((n) => n + 1);
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined' || copilotCode) return;
    const params = new URLSearchParams(window.location.search);
    const urlSync = normalizeSyncCode(params.get('sync') || '');
    const targetCode = urlSync || syncCode;
    if (targetCode.length >= 4) {
      pullSyncData(targetCode)
        .then((res) => {
          if (res.success && res.data) {
            applyPulledSync(
              res.data.favorites || [],
              res.data.playlists || [],
              res.data.savedPlaces || [],
              targetCode,
              {
                movieFavorites: res.data.movieFavorites,
                movieHistory: res.data.movieHistory,
                customHazards: res.data.customHazards,
              }
            );
            if (res.data.pendingNav) {
              let isSelfSent = false;
              try {
                isSelfSent =
                  sessionStorage.getItem('carhub_self_sent_nav_id') === res.data.pendingNav.id;
              } catch {}
              const sentMs = Date.parse(res.data.pendingNav.sentAt || '');
              const isFresh = !isNaN(sentMs) && Date.now() - sentMs < 20 * 60 * 1000;
              if (!isSelfSent && isFresh && lastSeenNavIdRef.current !== res.data.pendingNav.id) {
                lastSeenNavIdRef.current = res.data.pendingNav.id;
                setIncomingNavTarget(res.data.pendingNav);
              }
            }
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự động đẩy ngầm lên mây khi người dùng sửa Yêu thích / Playlist / Điểm ghim (kèm Phim & Camera)
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (suppressNextAutoPushRef.current) {
      suppressNextAutoPushRef.current = false;
      return;
    }
    if (syncCode.length < 4 || copilotCode) return;
    const timer = window.setTimeout(() => {
      pushSyncData(syncCode, favorites, playlists, savedPlaces, {
        movieFavorites: loadMovieFavorites(),
        movieHistory: loadMovieHistory(),
        customHazards: loadCustomHazards(),
      }).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [favorites, playlists, savedPlaces, syncCode, copilotCode]);

  // Send-to-Car & Co-Pilot Polling tiết kiệm KV (25s/lần, chỉ chạy khi tab hiển thị & không ở chế độ Co-Pilot):
  // Nhận đồng thời điểm đến dẫn đường (pendingNav) VÀ lệnh Co-Pilot ghế sau (remoteCmd) trong cùng 1 request!
  useEffect(() => {
    if (syncCode.length < 4 || copilotCode) return;
    let cancelled = false;

    const checkRemote = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const { pendingNav, remoteCmd } = await pollCarRemoteState(syncCode);
      if (cancelled) return;

      if (pendingNav && pendingNav.id && lastSeenNavIdRef.current !== pendingNav.id) {
        let isSelfSent = false;
        try {
          isSelfSent = sessionStorage.getItem('carhub_self_sent_nav_id') === pendingNav.id;
        } catch {}
        const sentMs = Date.parse(pendingNav.sentAt || '');
        const isFresh = isNaN(sentMs) || Date.now() - sentMs < 20 * 60 * 1000;
        if (!isSelfSent && isFresh) {
          lastSeenNavIdRef.current = pendingNav.id;
          setIncomingNavTarget(pendingNav);
        }
      }

      if (remoteCmd && remoteCmd.id && lastSeenCmdIdRef.current !== remoteCmd.id) {
        let isSelfCmd = false;
        try {
          isSelfCmd = sessionStorage.getItem('carhub_self_sent_cmd_id') === remoteCmd.id;
        } catch {}
        const cmdMs = Date.parse(remoteCmd.sentAt || '');
        const isFreshCmd = isNaN(cmdMs) || Date.now() - cmdMs < 5 * 60 * 1000;
        if (!isSelfCmd && isFreshCmd) {
          lastSeenCmdIdRef.current = remoteCmd.id;
          clearRemoteCommand(syncCode).catch(() => {});
          if (remoteCmd.action === 'playTrack' && remoteCmd.payload?.id) {
            const tr = remoteCmd.payload as VideoItem;
            setVideos((prev) => mergeUniqueTracks([tr], prev));
            playVideoRef.current?.(tr, 'explore');
          } else if (remoteCmd.action === 'queueTrack' && remoteCmd.payload?.id) {
            const tr = remoteCmd.payload as VideoItem;
            setVideos((prev) => {
              if (prev.some((x) => x.id === tr.id)) return prev;
              return [...prev, tr];
            });
          } else if (remoteCmd.action === 'openMovie' && remoteCmd.payload?.slug) {
            setRailSection('movies');
            setMovieCommand({
              nonce: Date.now(),
              open: {
                slug: remoteCmd.payload.slug,
                source: remoteCmd.payload.source || 'kkphim',
              },
            });
          } else if (remoteCmd.action === 'playPause') {
            setRemoteTogglePlayNonce((n) => n + 1);
          } else if (remoteCmd.action === 'next') {
            handleNextRef.current?.();
          } else if (remoteCmd.action === 'prev') {
            handlePrevRef.current?.();
          }
        }
      }
    };

    const timer = window.setInterval(checkRemote, 25000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkRemote();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [syncCode, copilotCode]);

  const handleConsumeIncomingNav = useCallback(() => {
    setIncomingNavTarget(null);
    if (syncCode.length >= 4) {
      clearPendingNav(syncCode).catch(() => {});
    }
  }, [syncCode]);

  const handleSavePlace = useCallback((place: SavedPlace) => {
    setSavedPlaces((prev) => {
      if (place.slot === 'home' || place.slot === 'work') {
        const filtered = prev.filter((p) => p.slot !== place.slot);
        return [place, ...filtered];
      }
      const filtered = prev.filter((p) => p.id !== place.id);
      return [place, ...filtered].slice(0, 20);
    });
  }, []);

  const handleRemoveSavedPlace = useCallback((id: string) => {
    setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const playVideo = useCallback(
    (video: VideoItem, sourceOverride?: QueueSource, playlistId?: string) => {
      if (sourceOverride) {
        setQueueSource(sourceOverride);
      }
      if (playlistId) {
        setActiveQueuePlaylistId(playlistId);
      }
      setCurrentVideo(video);
      setStreamData(buildEmbedStreamData(video));

      try {
        localStorage.setItem('carhub_last_video', JSON.stringify(video));
      } catch {}

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== video.id);
        return [video, ...filtered].slice(0, 50);
      });
    },
    []
  );

  const loadCategory = useCallback(
    async (
      catId: string,
      query: string,
      isInitialStartup = false,
      sourceOverride?: MusicSource
    ) => {
      const activeSource = sourceOverride || musicSourceRef.current;
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSelectedCategory(catId);
      setSearchQuery('');
      setIsLoadingVideos(true);
      setNextContinuation(null);

      try {
        localStorage.setItem('carhub_last_category', catId);
      } catch {}

      if (!isInitialStartup) {
        setQueueSource('explore');
      }

      try {
        const result = await searchVideos(query, null, controller.signal, activeSource);
        if (controller.signal.aborted) return;
        if (result.items.length > 0) {
          setVideos(result.items);
          setNextContinuation(result.nextContinuation);
          if (!currentVideoRef.current || !isInitialStartup) {
            playVideo(result.items[0], 'explore');
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to load category', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingVideos(false);
        }
      }
    },
    [playVideo]
  );

  useEffect(() => {
    const startCat = selectedCategory || 'remix';
    loadCategory(startCat, getCategoryQuery(startCat), true, musicSourceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => {
      if (videos.length === 0) {
        const cat = selectedCategory || 'remix';
        loadCategory(cat, getCategoryQuery(cat), true, musicSourceRef.current);
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [videos.length, selectedCategory, loadCategory]);

  const handleSearch = useCallback(
    async (query: string, sourceOverride?: MusicSource) => {
      const cleanQuery = query.trim();
      if (!cleanQuery) return;
      const activeSource = sourceOverride || musicSourceRef.current;
      if (activeSource !== musicSourceRef.current) {
        musicSourceRef.current = activeSource;
        setMusicSource(activeSource);
      }

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearchQuery(cleanQuery);
      setSelectedCategory('');
      setQueueSource('explore');
      setIsLoadingVideos(true);
      setNextContinuation(null);

      // Mở ngay màn hình Kết quả tìm kiếm (browse) để thấy toàn bộ danh sách + nút "Xem thêm"
      setRailSection('browse');

      setRecentSearches((prev) => {
        const filtered = prev.filter((item) => item.toLowerCase() !== cleanQuery.toLowerCase());
        return [cleanQuery, ...filtered].slice(0, 10);
      });

      try {
        const result = await searchVideos(cleanQuery, null, controller.signal, activeSource);
        if (controller.signal.aborted) return;
        setVideos(result.items);
        setNextContinuation(result.nextContinuation);
        if (result.items.length > 0) {
          playVideo(result.items[0], 'explore');
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Search failed', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingVideos(false);
        }
      }
    },
    [playVideo]
  );

  // Chuyển đổi 1 chạm nguồn phát nhạc YouTube <-> SoundCloud và nạp ngay danh sách của nguồn mới
  const handleChangeMusicSource = useCallback(
    (nextSource: MusicSource) => {
      if (nextSource === musicSourceRef.current) return;
      musicSourceRef.current = nextSource;
      setMusicSource(nextSource);

      if (searchQuery.trim() && !selectedCategory) {
        handleSearch(searchQuery.trim(), nextSource);
      } else {
        const cat = selectedCategory || 'remix';
        loadCategory(cat, getCategoryQuery(cat), false, nextSource);
      }
    },
    [searchQuery, selectedCategory, handleSearch, loadCategory]
  );

  // Upgrade #5: Bật Đài phát thông minh (Auto-Mix) cho cả YouTube lẫn SoundCloud
  const handleStartAutoMix = useCallback(async () => {
    if (!currentVideo || isLoadingMix) return;
    setIsLoadingMix(true);
    try {
      const related = await fetchRadioMix(
        currentVideo.id,
        currentVideo.title,
        currentVideo.uploaderName,
        currentVideo.source
      );
      if (related.length > 0) {
        const newMix = [currentVideo, ...related.filter((r) => r.id !== currentVideo.id)];
        setMixVideos(newMix);
        setQueueSource('mix');
      }
    } catch (err) {
      console.error('Auto-mix failed', err);
    } finally {
      setIsLoadingMix(false);
    }
  }, [currentVideo, isLoadingMix]);

  const loadMoreExplore = useCallback(async (): Promise<VideoItem[]> => {
    if (!nextContinuation || isLoadingMore) return [];
    setIsLoadingMore(true);
    const activeQuery = selectedCategory
      ? getCategoryQuery(selectedCategory)
      : searchQuery || 'nhạc hay trên ô tô';

    try {
      const existingIds = new Set(videosRef.current.map((v) => v.id));
      let cursor: string | null = nextContinuation;
      let appended: VideoItem[] = [];

      // Thử tối đa 2 trang nếu trang kế tiếp trên SoundCloud chứa trùng lặp / Go+ SNIP
      for (let step = 0; step < 2 && cursor; step++) {
        const result = await searchVideos(
          activeQuery,
          cursor,
          undefined,
          musicSourceRef.current
        );
        const fresh = result.items.filter((item) => {
          if (existingIds.has(item.id)) return false;
          existingIds.add(item.id);
          return true;
        });
        if (fresh.length > 0) {
          appended = [...appended, ...fresh];
        }
        cursor = result.nextContinuation && result.nextContinuation !== cursor ? result.nextContinuation : null;
        if (appended.length > 0) break;
      }

      if (appended.length > 0) {
        setVideos((prev) => {
          const prevIds = new Set(prev.map((v) => v.id));
          const unique = appended.filter((item) => !prevIds.has(item.id));
          return [...prev, ...unique];
        });
      }
      setNextContinuation(cursor);
      return appended;
    } catch (err) {
      console.error('Load more failed', err);
      return [];
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextContinuation, isLoadingMore, selectedCategory, searchQuery]);

  // Xác định danh sách phát đang hoạt động
  const activePlaylistObj = playlists.find((p) => p.id === activeQueuePlaylistId);
  const activePlaybackList =
    queueSource === 'mix' && mixVideos.length > 0
      ? mixVideos
      : queueSource === 'playlist' && activePlaylistObj && activePlaylistObj.items.length > 0
      ? activePlaylistObj.items
      : queueSource === 'favorites' && favorites.length > 0
      ? favorites
      : queueSource === 'history' && history.length > 0
      ? history
      : videos;

  const currentIndex = currentVideo
    ? activePlaybackList.findIndex((v) => v.id === currentVideo.id)
    : -1;

  // Tự động nối thêm bài cho cả Explore lẫn Auto-Mix khi gần hết danh sách!
  useEffect(() => {
    if (
      queueSource === 'explore' &&
      currentIndex >= 0 &&
      videos.length > 0 &&
      currentIndex >= videos.length - 3 &&
      nextContinuation &&
      !isLoadingMore
    ) {
      loadMoreExplore();
    } else if (
      queueSource === 'mix' &&
      currentVideo &&
      mixVideos.length > 0 &&
      currentIndex >= mixVideos.length - 2 &&
      !isLoadingMix
    ) {
      // Nối tiếp vô tận Đài phát Auto-Mix dựa trên bài cuối cùng!
      setIsLoadingMix(true);
      fetchRadioMix(
        currentVideo.id,
        currentVideo.title,
        currentVideo.uploaderName,
        currentVideo.source
      )
        .then((more) => {
          if (more.length > 0) {
            setMixVideos((prev) => mergeUniqueTracks(prev, more).slice(0, 120));
          }
        })
        .finally(() => setIsLoadingMix(false));
    }
  }, [
    queueSource,
    currentIndex,
    videos.length,
    nextContinuation,
    isLoadingMore,
    loadMoreExplore,
    currentVideo,
    mixVideos.length,
    isLoadingMix,
  ]);

  const handleNext = useCallback(async () => {
    const list = activePlaybackList;
    if (list.length === 0) return;

    if (isShuffle && list.length > 1) {
      let randIdx = Math.floor(Math.random() * list.length);
      if (randIdx === currentIndex) {
        randIdx = (currentIndex + 1) % list.length;
      }
      playVideo(list[randIdx]);
      return;
    }

    if (currentIndex >= 0 && currentIndex < list.length - 1) {
      playVideo(list[currentIndex + 1]);
      return;
    }

    if (queueSource === 'explore' && nextContinuation) {
      const more = await loadMoreExplore();
      if (more.length > 0) {
        playVideo(more[0], 'explore');
        return;
      }
    }

    if (repeatMode === 'all' || currentIndex === -1) {
      playVideo(list[0]);
    }
  }, [
    activePlaybackList,
    isShuffle,
    currentIndex,
    playVideo,
    queueSource,
    nextContinuation,
    loadMoreExplore,
    repeatMode,
  ]);

  const handlePrev = useCallback(() => {
    const list = activePlaybackList;
    if (list.length === 0) return;

    if (currentIndex > 0) {
      playVideo(list[currentIndex - 1]);
    } else if (repeatMode === 'all' && list.length > 1) {
      playVideo(list[list.length - 1]);
    } else {
      playVideo(list[0]);
    }
  }, [activePlaybackList, currentIndex, repeatMode, playVideo]);

  const handleToggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  useCarHardwareControls({
    enabled: !currentVideo,
    streamData: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    onPlay: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0], 'explore');
    },
    onPause: () => {},
    onTogglePlay: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0], 'explore');
    },
    onNext: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0], 'explore');
    },
    onPrev: () => {},
    onSeekRelative: () => {},
  });

  const isFavorite = currentVideo ? favorites.some((f) => f.id === currentVideo.id) : false;

  const toggleFavoriteTrack = useCallback((track: VideoItem) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === track.id);
      return exists ? prev.filter((f) => f.id !== track.id) : [track, ...prev];
    });
  }, []);

  const toggleFavoriteCurrent = useCallback(() => {
    if (currentVideo) toggleFavoriteTrack(currentVideo);
  }, [currentVideo, toggleFavoriteTrack]);

  // Quản lý Playlist riêng (Upgrade #2)
  const handleToggleTrackInPlaylist = useCallback((playlistId: string, track: VideoItem) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.items.some((it) => it.id === track.id);
        return {
          ...pl,
          items: exists ? pl.items.filter((it) => it.id !== track.id) : [track, ...pl.items],
        };
      })
    );
  }, []);

  const handleCreatePlaylist = useCallback((name: string, icon: string): string => {
    const newId = `pl-${Date.now()}`;
    setPlaylists((prev) => [...prev, { id: newId, name, icon, items: [] }]);
    return newId;
  }, []);

  const handleDeletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
      if (selectedPlaylistId === playlistId) setSelectedPlaylistId('favorites');
      if (activeQueuePlaylistId === playlistId && queueSource === 'playlist') {
        setQueueSource('explore');
      }
    },
    [selectedPlaylistId, activeQueuePlaylistId, queueSource]
  );

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    if (queueSource === 'history') {
      setQueueSource('explore');
    }
  }, [queueSource]);

  const hasNext =
    activePlaybackList.length > 1 ||
    repeatMode === 'all' ||
    (queueSource === 'explore' && Boolean(nextContinuation));
  const hasPrev = activePlaybackList.length > 0;

  const selectedBrowsePlaylist = playlists.find((p) => p.id === selectedPlaylistId);
  const browseVideos =
    railSection === 'favorites'
      ? selectedPlaylistId === 'favorites'
        ? favorites
        : selectedBrowsePlaylist?.items || []
      : railSection === 'history'
      ? history
      : videos;

  const totalSavedCount =
    favorites.length + playlists.reduce((sum, p) => sum + p.items.length, 0);

  // Refs trỏ tới hàm phát/chuyển bài mới nhất cho Co-Pilot polling
  const playVideoRef = useRef(playVideo);
  playVideoRef.current = playVideo;
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  const handlePrevRef = useRef(handlePrev);
  handlePrevRef.current = handlePrev;

  // Trợ lý Giọng Nói Đa Năng Toàn App VF5
  const handleVoiceCommand = useCallback(
    (intent: VoiceCommandIntent): boolean => {
      const getLastCoords = () => {
        try {
          const saved = localStorage.getItem('carhub_last_coords');
          if (saved) {
            const p = JSON.parse(saved);
            if (typeof p.lat === 'number' && typeof p.lon === 'number') return p;
          }
        } catch {}
        return { lat: 21.0285, lon: 105.8542 };
      };

      if (intent.type === 'navigate_home') {
        const home = savedPlaces.find((p) => p.slot === 'home');
        setRailSection('cockpit');
        if (home) {
          setIncomingNavTarget({
            id: `voice-home-${Date.now()}`,
            name: home.name || 'Nhà riêng',
            subtitle: home.subtitle || 'Điểm đã ghim',
            lat: home.lat,
            lon: home.lon,
            sentAt: new Date().toISOString(),
          });
        }
        return true;
      }

      if (intent.type === 'navigate_work') {
        const work = savedPlaces.find((p) => p.slot === 'work');
        setRailSection('cockpit');
        if (work) {
          setIncomingNavTarget({
            id: `voice-work-${Date.now()}`,
            name: work.name || 'Cơ quan',
            subtitle: work.subtitle || 'Điểm đã ghim',
            lat: work.lat,
            lon: work.lon,
            sentAt: new Date().toISOString(),
          });
        }
        return true;
      }

      if (intent.type === 'find_ev') {
        setRailSection('cockpit');
        const c = getLastCoords();
        fetch(`/api/places?mode=ev&lat=${c.lat.toFixed(4)}&lon=${c.lon.toFixed(4)}`)
          .then((r) => r.json())
          .then((d) => {
            const first = Array.isArray(d?.items) ? d.items[0] : null;
            if (first) {
              setIncomingNavTarget({
                id: `voice-ev-${Date.now()}`,
                name: first.name || 'Trạm sạc VinFast gần nhất',
                subtitle: first.subtitle || '',
                lat: first.lat,
                lon: first.lon,
                sentAt: new Date().toISOString(),
              });
            }
          })
          .catch(() => {});
        return true;
      }

      if (intent.type === 'navigate_place') {
        setRailSection('cockpit');
        const c = getLastCoords();
        fetch(
          `/api/places?q=${encodeURIComponent(intent.query)}&lat=${c.lat.toFixed(4)}&lon=${c.lon.toFixed(4)}`
        )
          .then((r) => r.json())
          .then((d) => {
            const first = Array.isArray(d?.items) ? d.items[0] : null;
            if (first) {
              setIncomingNavTarget({
                id: `voice-nav-${Date.now()}`,
                name: first.name || intent.query,
                subtitle: first.subtitle || '',
                lat: first.lat,
                lon: first.lon,
                sentAt: new Date().toISOString(),
              });
            }
          })
          .catch(() => {});
        return true;
      }

      if (intent.type === 'search_movie') {
        setRailSection('movies');
        if (intent.query) {
          setMovieCommand({ nonce: Date.now(), search: intent.query });
        }
        return true;
      }

      if (intent.type === 'open_tv') {
        setRailSection('tv');
        if (intent.channelQuery) {
          setTvChannelCommand({ nonce: Date.now(), query: intent.channelQuery });
        }
        return true;
      }

      if (intent.type === 'open_news') {
        setRailSection('news');
        setNewsAutoPlayNonce((n) => n + 1);
        return true;
      }

      if (intent.type === 'open_hud') {
        setHudOpenNonce((n) => n + 1);
        return true;
      }

      if (intent.type === 'set_theme') {
        setMapTheme(intent.theme === 'light' ? 'vector3d' : 'dark3d');
        return true;
      }

      return false;
    },
    [savedPlaces]
  );

  // Chế độ Co-Pilot Hàng Ghế Sau (mở khi hành khách quét mã QR ?copilot=CODE)
  if (copilotCode) {
    return (
      <CoPilotRemoteView
        initialCode={copilotCode}
        onExitCoPilot={() => {
          setCopilotCode('');
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete('copilot');
            window.history.replaceState({}, '', u.toString());
          } catch {}
        }}
      />
    );
  }

  const theme = getCarTheme(isLightTheme);

  return (
    <div
      className={`car-app-shell w-full ${theme.shell} flex flex-col overflow-hidden transition-colors duration-300`}
    >
      <main className="flex-1 min-h-0 w-full h-full">
        {currentVideo ? (
          <VideoPlayer
            streamData={streamData || buildEmbedStreamData(currentVideo)}
            isLoading={false}
            railSection={railSection}
            onChangeRailSection={setRailSection}
            onNext={handleNext}
            onPrev={handlePrev}
            hasNext={hasNext}
            hasPrev={hasPrev}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavoriteCurrent}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            isShuffle={isShuffle}
            onToggleShuffle={() => setIsShuffle((s) => !s)}
            repeatMode={repeatMode}
            onToggleRepeat={handleToggleRepeat}
            playbackQueue={activePlaybackList}
            browseVideos={browseVideos}
            queueSource={queueSource}
            currentVideoId={currentVideo.id}
            onSelectQueueVideo={(v) => playVideo(v)}
            onSelectBrowseVideo={(v, source, plId) => {
              playVideo(v, source, plId);
              setRailSection('nowPlaying');
            }}
            isLoadingBrowse={railSection === 'browse' && isLoadingVideos}
            hasMoreExplore={Boolean(nextContinuation)}
            isLoadingMoreExplore={isLoadingMore}
            onLoadMoreExplore={loadMoreExplore}
            selectedCategory={selectedCategory}
            onSelectCategory={(catId, q) => loadCategory(catId, q, false)}
            searchQuery={searchQuery}
            favoritesCount={totalSavedCount}
            favoritesOnlyCount={favorites.length}
            historyCount={history.length}
            onClearHistory={handleClearHistory}
            onOpenSearchModal={handleOpenSearchModal}
            uiScale={uiScale}
            onChangeUiScale={setUiScale}
            autoSkipEnabled={autoSkipEnabled}
            onToggleAutoSkip={() => setAutoSkipEnabled((v) => !v)}
            playlists={playlists}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylistId={setSelectedPlaylistId}
            syncCode={syncCode}
            onOpenSyncModal={handleOpenSyncModal}
            nightMode={nightMode}
            isNightDimmed={isNightDimmed}
            onCycleNightMode={handleToggleDayNight}
            mapTheme={mapTheme}
            onChangeMapTheme={setMapTheme}
            isLightTheme={isLightTheme}
            isMixActive={queueSource === 'mix'}
            isLoadingMix={isLoadingMix}
            onStartAutoMix={handleStartAutoMix}
            savedPlaces={savedPlaces}
            onSavePlace={handleSavePlace}
            onRemoveSavedPlace={handleRemoveSavedPlace}
            incomingNavTarget={incomingNavTarget}
            onConsumeIncomingNav={handleConsumeIncomingNav}
            musicSource={musicSource}
            onChangeMusicSource={handleChangeMusicSource}
            syncPullNonce={syncPullNonce}
            movieCommand={movieCommand}
            tvChannelCommand={tvChannelCommand}
            newsAutoPlayNonce={newsAutoPlayNonce}
            hudOpenNonce={hudOpenNonce}
            remoteTogglePlayNonce={remoteTogglePlayNonce}
            onStartRouteToTarget={setIncomingNavTarget}
          />
        ) : isLoadingVideos ? (
          <div
            className={`w-full h-full ${theme.shell} flex flex-col items-center justify-center gap-3 text-center p-6`}
          >
            <div className="w-11 h-11 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <p className={`text-base font-bold ${theme.text}`}>
              {viewMode === 'classic'
                ? 'Đang chuẩn bị trình phát Video cho VF5...'
                : 'Đang tải danh sách nhạc cho VF5...'}
            </p>
          </div>
        ) : (
          <div
            className={`w-full h-full ${theme.shell} flex flex-col items-center justify-center gap-4 text-center p-6`}
          >
            <WifiOff className="w-12 h-12 text-rose-500" />
            <div className="max-w-md">
              <h2 className={`text-lg font-extrabold ${theme.text}`}>
                Chưa tải được danh sách nhạc (Sóng 4G yếu)
              </h2>
              <p className={`text-xs sm:text-sm ${theme.textSub} mt-1`}>
                Kiểm tra kết nối mạng trên iPhone hoặc bấm Thử lại khi xe đã ra khỏi tầng hầm.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  loadCategory(
                    selectedCategory || 'remix',
                    getCategoryQuery(selectedCategory || 'remix'),
                    false
                  )
                }
                className={`min-h-[46px] px-5 rounded-full font-extrabold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition ${theme.primaryCta}`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại ngay</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenSearchModal(false)}
                className={`min-h-[46px] px-5 rounded-full border font-extrabold text-sm flex items-center gap-2 active:scale-95 transition ${theme.iconBtn}`}
              >
                <Search className="w-4 h-4" />
                <span>Tìm kiếm</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenSearchModal(true)}
                className={`min-h-[46px] px-4 rounded-full border font-extrabold text-sm flex items-center gap-2 active:scale-95 transition ${
                  isLightTheme
                    ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
                    : 'bg-rose-500/25 border-rose-400/45 text-rose-200 hover:bg-rose-500/35'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Giọng nói</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <CarSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => {
          setIsSearchModalOpen(false);
          setStartVoiceOnOpen(false);
        }}
        onSearch={handleSearch}
        onVoiceCommand={handleVoiceCommand}
        initialQuery={searchQuery}
        musicSource={musicSource}
        onChangeMusicSource={handleChangeMusicSource}
        recentSearches={recentSearches}
        onClearRecentSearches={() => setRecentSearches([])}
        onRemoveRecentSearch={(itemToRemove) =>
          setRecentSearches((prev) => prev.filter((item) => item !== itemToRemove))
        }
        variant={viewMode}
        startVoice={startVoiceOnOpen}
        artworkBackdrop={streamData?.thumbnailUrl || currentVideo?.thumbnail}
        isLightTheme={isLightTheme}
      />

      <PlaylistSyncModal
        isOpen={syncModalOpen}
        mode={syncModalMode}
        onClose={() => setSyncModalOpen(false)}
        onSwitchMode={setSyncModalMode}
        currentTrack={currentVideo}
        favorites={favorites}
        onToggleFavoriteTrack={toggleFavoriteTrack}
        playlists={playlists}
        onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
        onCreatePlaylist={handleCreatePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
        savedPlaces={savedPlaces}
        syncCode={syncCode}
        onSaveSyncCode={setSyncCode}
        onApplyPulledData={applyPulledSync}
        isLightTheme={isLightTheme}
      />
    </div>
  );
};
