import React, { useState, useEffect, useCallback } from 'react';
import { VideoPlayer } from './components/VideoPlayer';
import { CarSearchModal } from './components/CarSearchModal';
import { VideoItem, StreamData, PlayerMode, UiScale, ViewMode, RepeatMode } from './types';
import { searchVideos } from './services/api';
import { useCarHardwareControls } from './hooks/useCarHardwareControls';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explore' | 'history' | 'favorites'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>('remix');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('video');

  // Search Modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [startVoiceOnOpen, setStartVoiceOnOpen] = useState<boolean>(false);

  const handleOpenSearchModal = (startVoice = false) => {
    setStartVoiceOnOpen(startVoice);
    setIsSearchModalOpen(true);
  };

  // UI scale preset: default to 'normal' or 'large' for VinFast VF5
  const [uiScale, setUiScale] = useState<UiScale>(() => {
    try {
      const saved = localStorage.getItem('carhub_ui_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') return saved;
      return 'large';
    } catch {
      return 'large';
    }
  });

  // View Mode: 'ytmusic' (Chỉ phát âm thanh - Giao diện YouTube Music) hoặc 'classic' (Xem Video)
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

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('carhub_view_mode', mode);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  };

  // Playback modes: Shuffle and Repeat (off | all | one)
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

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [nextContinuation, setNextContinuation] = useState<string | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [, setStreamErrorMessage] = useState<string | null>(null);

  // Local storage for history, favorites & recent searches
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
      localStorage.setItem('carhub_recent_searches', JSON.stringify(recentSearches));
    } catch {}
  }, [recentSearches]);

  // Initial load
  useEffect(() => {
    loadCategory('remix', 'nhạc trẻ remix bass cực căng lái xe');
  }, []);

  const loadCategory = async (catId: string, query: string) => {
    setSelectedCategory(catId);
    setActiveTab('explore');
    setIsLoadingVideos(true);
    setNextContinuation(null);
    try {
      const result = await searchVideos(query);
      setVideos(result.items);
      setNextContinuation(result.nextContinuation);
      if (!currentVideo && result.items.length > 0) {
        playVideo(result.items[0]);
      }
    } catch (err) {
      console.error('Failed to load category', err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    const cleanQuery = query.trim();
    setSearchQuery(cleanQuery);
    setActiveTab('explore');
    setSelectedCategory('');
    setIsLoadingVideos(true);
    setNextContinuation(null);

    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== cleanQuery.toLowerCase());
      return [cleanQuery, ...filtered].slice(0, 10);
    });

    try {
      const result = await searchVideos(cleanQuery);
      setVideos(result.items);
      setNextContinuation(result.nextContinuation);
      if (result.items.length > 0) {
        playVideo(result.items[0]);
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextContinuation || isLoadingMore) return;
    setIsLoadingMore(true);
    const activeQuery = selectedCategory
      ? getCategoryQuery(selectedCategory)
      : searchQuery || 'nhạc hay trên ô tô';

    try {
      const result = await searchVideos(activeQuery, nextContinuation);
      setVideos((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const newUnique = result.items.filter((item) => !existingIds.has(item.id));
        return [...prev, ...newUnique];
      });
      setNextContinuation(result.nextContinuation);
    } catch (err) {
      console.error('Load more failed', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const getCategoryQuery = (catId: string) => {
    const map: Record<string, string> = {
      remix: 'nhạc trẻ remix bass cực căng lái xe',
      driving: 'nhạc lái xe đường dài hay nhất',
      vinahouse: 'vinahouse nonstop căng đét',
      chill: 'nhạc lofi chill tiếng mưa lái xe',
      bolero: 'bolero trữ tình hay nhất trên ô tô',
      podcast: 'hieu tv podcast hay nhất',
      kids: 'ca nhạc thiếu nhi vui nhộn cho bé',
    };
    return map[catId] || 'nhạc hay';
  };

  // Phát bài hát tức thì 0ms qua YouTube Embed (bỏ hoàn toàn 4G Proxy / Direct để không lag)
  const playVideo = useCallback((video: VideoItem, _noCache = false) => {
    setStreamErrorMessage(null);
    setCurrentVideo(video);
    setIsLoadingStream(false);

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== video.id);
      return [video, ...filtered].slice(0, 50);
    });

    setStreamData({
      id: video.id,
      title: video.title,
      uploader: video.uploaderName,
      thumbnailUrl: video.thumbnail,
      duration: video.duration || 0,
      playbackType: 'embed',
      source: 'youtube-embed',
      embedUrl: `https://www.youtube-nocookie.com/embed/${video.id}?enablejsapi=1&autoplay=1&playsinline=1&modestbranding=1&rel=0`,
      videoStreams: [],
      audioStreams: [],
    });
  }, []);

  const getCurrentIndex = () => {
    if (!currentVideo) return -1;
    const list = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    return list.findIndex((v) => v.id === currentVideo.id);
  };

  const handleNext = () => {
    const list = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    const currentIndex = getCurrentIndex();

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
    } else if (repeatMode === 'all' && list.length > 0) {
      playVideo(list[0]);
    } else if (streamData?.relatedStreams && streamData.relatedStreams.length > 0) {
      playVideo(streamData.relatedStreams[0]);
    } else if (nextContinuation) {
      handleLoadMore();
    }
  };

  const handlePrev = () => {
    const list = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    const currentIndex = getCurrentIndex();
    if (currentIndex > 0) {
      playVideo(list[currentIndex - 1]);
    } else if (list.length > 0) {
      playVideo(list[0]);
    }
  };

  const handleToggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  // Fallback phím vô lăng khi chưa chọn bài nào
  useCarHardwareControls({
    streamData: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    onPlay: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0]);
    },
    onPause: () => {},
    onTogglePlay: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0]);
    },
    onNext: () => {
      if (!currentVideo && videos.length > 0) playVideo(videos[0]);
    },
    onPrev: () => {},
    onSeekRelative: () => {},
  });

  const isFavorite = currentVideo ? favorites.some((f) => f.id === currentVideo.id) : false;

  const toggleFavorite = () => {
    if (!currentVideo) return;
    if (isFavorite) {
      setFavorites((prev) => prev.filter((f) => f.id !== currentVideo.id));
    } else {
      setFavorites((prev) => [currentVideo, ...prev]);
    }
  };

  const handleClearRecentSearches = () => {
    setRecentSearches([]);
  };

  const handleRemoveRecentSearch = (itemToRemove: string) => {
    setRecentSearches((prev) => prev.filter((item) => item !== itemToRemove));
  };

  const currentIndex = getCurrentIndex();
  const currentList =
    activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
  const hasNext =
    currentIndex < currentList.length - 1 ||
    repeatMode === 'all' ||
    (streamData?.relatedStreams?.length ?? 0) > 0 ||
    Boolean(nextContinuation);
  const hasPrev = currentIndex > 0 || currentList.length > 0;

  const zoomFactor = uiScale === 'normal' ? 1.0 : uiScale === 'large' ? 1.18 : 1.32;

  const activeSuggestedList =
    activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;

  const activeColumnTitle =
    activeTab === 'favorites'
      ? 'Danh sách yêu thích'
      : activeTab === 'history'
      ? 'Lịch sử vừa nghe'
      : selectedCategory
      ? 'Danh sách tiếp theo'
      : 'Kết quả tìm kiếm';

  return (
    <div
      style={{ zoom: zoomFactor, '--ui-zoom': zoomFactor } as React.CSSProperties}
      className="min-h-screen bg-[#050507] text-slate-100 flex flex-col pb-2 transition-colors duration-200"
    >
      {/* Main Container: Unified Apple iPhone Duo Liquid Glass Workspace for both Music & Video */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-2 sm:px-3 pt-2">
        {currentVideo ? (
          <div className="w-full">
            <VideoPlayer
              streamData={
                streamData || {
                  id: currentVideo.id,
                  title: currentVideo.title,
                  uploader: currentVideo.uploaderName,
                  thumbnailUrl: currentVideo.thumbnail,
                  duration: currentVideo.duration || 0,
                  playbackType: 'embed',
                  source: 'youtube-embed',
                  videoStreams: [],
                  audioStreams: [],
                }
              }
              isLoading={isLoadingStream}
              playerMode={playerMode}
              onPlayerModeChange={setPlayerMode}
              onNext={handleNext}
              onPrev={handlePrev}
              onRetry={() => playVideo(currentVideo, true)}
              hasNext={hasNext}
              hasPrev={hasPrev}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              isShuffle={isShuffle}
              onToggleShuffle={() => setIsShuffle((s) => !s)}
              repeatMode={repeatMode}
              onToggleRepeat={handleToggleRepeat}
              queueVideos={activeSuggestedList}
              currentVideoId={currentVideo.id}
              onSelectVideo={(v) => playVideo(v)}
              isLoadingQueue={isLoadingVideos}
              hasMoreQueue={Boolean(nextContinuation)}
              isLoadingMoreQueue={isLoadingMore}
              onLoadMoreQueue={handleLoadMore}
              selectedCategory={selectedCategory}
              onSelectCategory={loadCategory}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              favoritesCount={favorites.length}
              historyCount={history.length}
              onOpenSearchModal={handleOpenSearchModal}
              uiScale={uiScale}
              onChangeUiScale={setUiScale}
            />
          </div>
        ) : (
          <div className="h-[calc((100dvh-16px)/var(--ui-zoom,1))] rounded-3xl bg-[#07070a] border border-white/10 flex flex-col items-center justify-center gap-4 text-center p-6">
            <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-bold text-white/80">
              {viewMode === 'classic'
                ? 'Đang chuẩn bị trình phát Video...'
                : 'Đang tải danh sách nhạc...'}
            </p>
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
        recentSearches={recentSearches}
        onClearRecentSearches={handleClearRecentSearches}
        onRemoveRecentSearch={handleRemoveRecentSearch}
        variant="ytmusic"
        startVoice={startVoiceOnOpen}
        artworkBackdrop={streamData?.thumbnailUrl || currentVideo?.thumbnail}
      />
    </div>
  );
};
