import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { CategoryChips } from './components/CategoryChips';
import { VideoPlayer } from './components/VideoPlayer';
import { VideoList } from './components/VideoList';
import { SuggestedList } from './components/SuggestedList';
import { CarSearchModal } from './components/CarSearchModal';
import { VideoItem, StreamData, PlayerMode, UiScale, ViewMode, RepeatMode } from './types';
import { searchVideos, getVideoDetails } from './services/api';
import { AlertCircle, RefreshCw, SkipForward } from 'lucide-react';
import { useCarHardwareControls } from './hooks/useCarHardwareControls';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explore' | 'history' | 'favorites'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>('remix');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('video');

  // Search Modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);

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
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null);

  const requestCounterRef = useRef<number>(0);
  // Bộ nhớ đệm Pre-fetch giúp chuyển bài bằng phím vô lăng VF5 tức thì (0ms delay)
  const streamCacheRef = useRef<Map<string, StreamData>>(new Map());

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

  // Phát bài hát (Ưu tiên lấy ngay từ bộ nhớ đệm Pre-fetch để chuyển bài bằng vô lăng 0ms)
  const playVideo = useCallback(
    async (video: VideoItem, noCache = false) => {
      const reqId = ++requestCounterRef.current;

      setStreamErrorMessage(null);
      setCurrentVideo(video);

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== video.id);
        return [video, ...filtered].slice(0, 50);
      });

      // Nếu đã được Pre-fetch trong RAM -> Phát ngay lập tức trong 0ms (giữ nguyên kết nối CarPlay)!
      const cached = !noCache ? streamCacheRef.current.get(video.id) : undefined;
      if (cached && cached.playbackType !== 'unplayable') {
        setStreamData(cached);
        setIsLoadingStream(false);
        return;
      }

      setIsLoadingStream(true);
      setStreamData({
        id: video.id,
        title: video.title,
        uploader: video.uploaderName,
        thumbnailUrl: video.thumbnail,
        duration: video.duration || 0,
        playbackType: 'direct',
        source: 'init',
        videoStreams: [],
        audioStreams: [],
      });

      try {
        const details = await getVideoDetails(video.id, noCache);
        if (reqId !== requestCounterRef.current) return;

        if (details && details.playbackType !== 'unplayable') {
          const enriched: StreamData = {
            ...details,
            title: details.title || video.title,
            uploader: details.uploader || video.uploaderName,
          };
          streamCacheRef.current.set(video.id, enriched);
          setStreamData(enriched);
        } else {
          setStreamErrorMessage(
            details?.error || 'Không tìm thấy luồng phát hợp lệ cho bài hát này.'
          );
        }
      } catch (err) {
        if (reqId !== requestCounterRef.current) return;
        console.error('Failed to fetch stream details', err);
        setStreamErrorMessage('Lỗi kết nối mạng khi tải bài hát.');
      } finally {
        if (reqId === requestCounterRef.current) {
          setIsLoadingStream(false);
        }
      }
    },
    []
  );

  // Tự động Pre-fetch ngầm bài tiếp theo và bài trước đó để bấm vô lăng VF5 nhảy bài tức thì
  useEffect(() => {
    if (!currentVideo) return;
    const list =
      activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    const idx = list.findIndex((v) => v.id === currentVideo.id);
    if (idx === -1) return;

    const candidates: VideoItem[] = [];
    if (idx + 1 < list.length) candidates.push(list[idx + 1]);
    if (idx + 2 < list.length) candidates.push(list[idx + 2]);
    if (idx - 1 >= 0) candidates.push(list[idx - 1]);

    const timer = setTimeout(() => {
      for (const item of candidates) {
        if (!streamCacheRef.current.has(item.id)) {
          getVideoDetails(item.id)
            .then((details) => {
              if (details && details.playbackType !== 'unplayable') {
                streamCacheRef.current.set(item.id, {
                  ...details,
                  title: details.title || item.title,
                  uploader: details.uploader || item.uploaderName,
                });
              }
            })
            .catch(() => {});
        }
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [currentVideo, activeTab, videos, favorites, history]);

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
      style={{ zoom: zoomFactor }}
      className={`min-h-screen text-slate-100 flex flex-col pb-12 transition-colors duration-200 ${
        viewMode === 'ytmusic' ? 'bg-[#030303]' : 'bg-car-bg'
      }`}
    >
      <Header
        onSearch={handleSearch}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        uiScale={uiScale}
        onChangeUiScale={setUiScale}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
        viewMode={viewMode}
        onChangeViewMode={handleViewModeChange}
      />

      {/* Ở chế độ Xem Video (Classic) hoặc khi chưa có bài hát nào phát thì hiện thanh chủ đề ở trên */}
      {(viewMode === 'classic' || !currentVideo) && activeTab === 'explore' && (
        <CategoryChips
          selectedCategory={selectedCategory}
          onSelectCategory={loadCategory}
          variant={viewMode}
        />
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 pt-3">
        {currentVideo ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Giữ cùng 1 vị trí cây DOM cho VideoPlayer để chuyển đổi giữa YT Music và Video không bị ngắt nhạc */}
            <div
              className={
                viewMode === 'ytmusic'
                  ? 'lg:col-span-12'
                  : 'lg:col-span-7 xl:col-span-8 space-y-4'
              }
            >
              {streamErrorMessage && !isLoadingStream && (
                <div className="w-full bg-car-card rounded-3xl border-2 border-rose-500/40 p-6 mb-4 flex flex-col items-center justify-center text-center gap-4 shadow-2xl">
                  <AlertCircle className="w-12 h-12 text-rose-500" />
                  <div className="max-w-md">
                    <h4 className="text-base sm:text-xl font-bold text-white line-clamp-1">
                      {currentVideo.title}
                    </h4>
                    <p className="text-sm text-rose-300 font-semibold mt-1">
                      {streamErrorMessage}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => playVideo(currentVideo, true)}
                      className="h-12 px-5 bg-slate-800 hover:bg-slate-700 text-sm font-bold rounded-2xl text-white border border-car-border flex items-center gap-2 active:scale-95"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Thử tải lại</span>
                    </button>
                    {hasNext && (
                      <button
                        onClick={handleNext}
                        className="h-12 px-5 bg-rose-600 hover:bg-rose-500 text-sm font-bold rounded-2xl text-white flex items-center gap-2 active:scale-95"
                      >
                        <SkipForward className="w-4 h-4" />
                        <span>Bài tiếp theo</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <VideoPlayer
                streamData={
                  streamData || {
                    id: currentVideo.id,
                    title: currentVideo.title,
                    uploader: currentVideo.uploaderName,
                    thumbnailUrl: currentVideo.thumbnail,
                    duration: currentVideo.duration || 0,
                    playbackType: 'direct',
                    source: 'init',
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
              />
            </div>

            {/* Cột phải chỉ hiển thị ở chế độ Xem Video (vì chế độ YT Music đã tích hợp sẵn bảng Tab danh sách bên trong) */}
            {viewMode === 'classic' && (
              <div className="lg:col-span-5 xl:col-span-4 min-h-0 sticky top-20">
                <SuggestedList
                  videos={activeSuggestedList}
                  currentVideoId={currentVideo?.id}
                  onSelectVideo={(v) => playVideo(v)}
                  isLoading={isLoadingVideos}
                  hasMore={Boolean(nextContinuation)}
                  isLoadingMore={isLoadingMore}
                  onLoadMore={handleLoadMore}
                  title={activeColumnTitle}
                  variant={viewMode}
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            {activeTab === 'explore' && (
              <VideoList
                videos={videos}
                onSelectVideo={(v) => playVideo(v)}
                isLoading={isLoadingVideos}
                hasMore={Boolean(nextContinuation)}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                variant={viewMode}
                title={
                  selectedCategory
                    ? 'Danh sách phát đề xuất'
                    : `Kết quả tìm kiếm cho "${searchQuery}"`
                }
              />
            )}

            {activeTab === 'history' && (
              <VideoList
                videos={history}
                onSelectVideo={(v) => playVideo(v)}
                variant={viewMode}
                title="Lịch sử bài hát vừa nghe trên xe"
              />
            )}

            {activeTab === 'favorites' && (
              <VideoList
                videos={favorites}
                onSelectVideo={(v) => playVideo(v)}
                variant={viewMode}
                title="Danh sách bài hát yêu thích"
              />
            )}
          </div>
        )}
      </main>

      <CarSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSearch={handleSearch}
        initialQuery={searchQuery}
        recentSearches={recentSearches}
        onClearRecentSearches={handleClearRecentSearches}
        onRemoveRecentSearch={handleRemoveRecentSearch}
      />
    </div>
  );
};
