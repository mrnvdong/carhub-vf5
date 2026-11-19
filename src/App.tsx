import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Search, Mic, WifiOff } from 'lucide-react';
import { VideoPlayer } from './components/VideoPlayer';
import { CarSearchModal } from './components/CarSearchModal';
import { PlaylistSyncModal } from './components/PlaylistSyncModal';
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
  SavedPlace,
  PendingNavTarget,
  MusicSource,
} from './types';
import { getCategoryQuery } from './constants/categories';
import { searchVideos, fetchRadioMix } from './services/api';
import {
  pullSyncData,
  pushSyncData,
  normalizeSyncCode,
  pollPendingNav,
  clearPendingNav,
} from './services/sync';
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

  // UI Scale
  const [uiScale, setUiScale] = useState<UiScale>(() => {
    try {
      const saved = localStorage.getItem('carhub_ui_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') return saved;
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

  // Upgrade #4: Night Mode ('auto' dims between 18:00 and 05:30)
  const [nightMode, setNightMode] = useState<NightMode>(() => {
    try {
      const saved = localStorage.getItem('carhub_night_mode') as NightMode | null;
      if (saved === 'auto' || saved === 'on' || saved === 'off') return saved;
      return 'auto';
    } catch {
      return 'auto';
    }
  });

  const [isAfterDusk, setIsAfterDusk] = useState<boolean>(() => {
    const hr = new Date().getHours();
    return hr >= 18 || hr < 6;
  });

  useEffect(() => {
    const checkHour = () => {
      const hr = new Date().getHours();
      setIsAfterDusk(hr >= 18 || hr < 6);
    };
    const id = window.setInterval(checkHour, 60000);
    return () => window.clearInterval(id);
  }, []);

  const isNightDimmed = nightMode === 'on' || (nightMode === 'auto' && isAfterDusk);

  const handleCycleNightMode = useCallback(() => {
    setNightMode((prev) => {
      if (prev === 'auto') return 'on';
      if (prev === 'on') return 'off';
      return 'auto';
    });
  }, []);

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

  // Responsive root font-size scaling for APTV & asCar
  useEffect(() => {
    const applyResponsiveRootScale = () => {
      const h = window.innerHeight || 480;
      const w = window.innerWidth || 800;

      let basePx = 15.5;
      if (h <= 400 || w <= 660) {
        basePx = uiScale === 'normal' ? 13.5 : uiScale === 'large' ? 14.5 : 15.5;
      } else if (h <= 520) {
        basePx = uiScale === 'normal' ? 14.5 : uiScale === 'large' ? 16 : 17.25;
      } else if (w >= 960) {
        basePx = uiScale === 'normal' ? 16 : uiScale === 'large' ? 17.75 : 19.5;
      } else {
        basePx = uiScale === 'normal' ? 15.5 : uiScale === 'large' ? 16.5 : 18;
      }

      document.documentElement.style.fontSize = `${basePx}px`;
    };

    applyResponsiveRootScale();
    window.addEventListener('resize', applyResponsiveRootScale);
    window.visualViewport?.addEventListener('resize', applyResponsiveRootScale);
    return () => {
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

  // Upgrade #2: Đồng bộ chuẩn xác (hỗ trợ xóa bài/playlist + đồng bộ điểm ghim bản đồ + không tự đẩy ngược sau khi tải!)
  const applyPulledSync = useCallback(
    (
      pulledFavs: VideoItem[],
      pulledPlaylists: UserPlaylist[],
      pulledPlaces: SavedPlace[],
      code: string
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
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
              targetCode
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

  // Tự động đẩy ngầm lên mây khi người dùng sửa Yêu thích / Playlist / Điểm ghim (bỏ qua nếu vừa tải về từ mây!)
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
    if (syncCode.length < 4) return;
    const timer = window.setTimeout(() => {
      pushSyncData(syncCode, favorites, playlists, savedPlaces).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [favorites, playlists, savedPlaces, syncCode]);

  // Send-to-Car Polling nhẹ (12s/lần khi tab đang bật & đã gắn Mã Xe): nhận điểm đến từ điện thoại lên màn VF5!
  useEffect(() => {
    if (syncCode.length < 4) return;
    let cancelled = false;

    const checkNav = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      const pending = await pollPendingNav(syncCode);
      if (cancelled || !pending || !pending.id) return;
      if (lastSeenNavIdRef.current === pending.id) return;
      try {
        if (sessionStorage.getItem('carhub_self_sent_nav_id') === pending.id) return;
      } catch {}

      const sentMs = Date.parse(pending.sentAt || '');
      const isFresh = isNaN(sentMs) || Date.now() - sentMs < 20 * 60 * 1000;
      if (!isFresh) return;

      lastSeenNavIdRef.current = pending.id;
      setIncomingNavTarget(pending);
    };

    const timer = window.setInterval(checkNav, 12000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkNav();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [syncCode]);

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

  return (
    <div className="car-app-shell w-full bg-[#050507] text-slate-100 flex flex-col overflow-hidden">
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
            onCycleNightMode={handleCycleNightMode}
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
          />
        ) : isLoadingVideos ? (
          <div className="w-full h-full bg-[#050507] flex flex-col items-center justify-center gap-3 text-center p-6">
            <div className="w-11 h-11 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-bold text-white/85">
              {viewMode === 'classic'
                ? 'Đang chuẩn bị trình phát Video cho VF5...'
                : 'Đang tải danh sách nhạc cho VF5...'}
            </p>
          </div>
        ) : (
          <div className="w-full h-full bg-[#050507] flex flex-col items-center justify-center gap-4 text-center p-6">
            <WifiOff className="w-12 h-12 text-rose-400" />
            <div className="max-w-md">
              <h2 className="text-lg font-extrabold text-white">
                Chưa tải được danh sách nhạc (Sóng 4G yếu)
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1">
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
                className="min-h-[46px] px-5 rounded-full bg-white text-black font-extrabold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại ngay</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenSearchModal(false)}
                className="min-h-[46px] px-5 rounded-full bg-white/12 hover:bg-white/20 border border-white/20 text-white font-extrabold text-sm flex items-center gap-2 active:scale-95 transition"
              >
                <Search className="w-4 h-4" />
                <span>Tìm kiếm</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenSearchModal(true)}
                className="min-h-[46px] px-4 rounded-full bg-rose-500/25 border border-rose-400/45 text-rose-200 font-extrabold text-sm flex items-center gap-2 active:scale-95 transition"
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
      />
    </div>
  );
};
