import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { CategoryChips } from './components/CategoryChips';
import { VideoPlayer } from './components/VideoPlayer';
import { VideoList } from './components/VideoList';
import { SuggestedList } from './components/SuggestedList';
import { CarSearchModal } from './components/CarSearchModal';
import { VideoItem, StreamData, PlayerMode, UiScale } from './types';
import { searchVideos, getVideoDetails } from './services/api';
import { AlertCircle, RefreshCw, SkipForward } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explore' | 'history' | 'favorites'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>('remix');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('video');

  // Search Modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);

  // UI scale preset: default to 'large' (120%) for VinFast VF5
  const [uiScale, setUiScale] = useState<UiScale>(() => {
    try {
      const saved = localStorage.getItem('carhub_ui_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xlarge') return saved;
      return 'large';
    } catch {
      return 'large';
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

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('carhub_ui_scale', uiScale);
    } catch (e) {
      console.error(e);
    }
  }, [uiScale]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_history', JSON.stringify(history));
    } catch (e) {
      console.error(e);
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_favorites', JSON.stringify(favorites));
    } catch (e) {
      console.error(e);
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem('carhub_recent_searches', JSON.stringify(recentSearches));
    } catch (e) {
      console.error(e);
    }
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

    // Add to recent searches
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.toLowerCase() !== cleanQuery.toLowerCase());
      return [cleanQuery, ...filtered].slice(0, 10);
    });

    try {
      const result = await searchVideos(cleanQuery);
      setVideos(result.items);
      setNextContinuation(result.nextContinuation);
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

  const playVideo = useCallback(
    async (video: VideoItem, noCache = false) => {
      const reqId = ++requestCounterRef.current;

      setStreamData(null);
      setStreamErrorMessage(null);
      setCurrentVideo(video);
      setIsLoadingStream(true);

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== video.id);
        return [video, ...filtered].slice(0, 50);
      });

      try {
        const details = await getVideoDetails(video.id, noCache);
        if (reqId !== requestCounterRef.current) return;

        if (details && details.playbackType !== 'unplayable') {
          setStreamData({
            ...details,
            title: details.title || video.title,
            uploader: details.uploader || video.uploaderName,
          });
        } else {
          setStreamErrorMessage(
            details?.error || 'Không tìm thấy luồng phát hợp lệ cho video này.'
          );
        }
      } catch (err) {
        if (reqId !== requestCounterRef.current) return;
        console.error('Failed to fetch stream details', err);
        setStreamErrorMessage('Lỗi kết nối mạng khi tải luồng phát.');
      } finally {
        if (reqId === requestCounterRef.current) {
          setIsLoadingStream(false);
        }
      }
    },
    []
  );

  const getCurrentIndex = () => {
    if (!currentVideo) return -1;
    const list = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    return list.findIndex((v) => v.id === currentVideo.id);
  };

  const handleNext = () => {
    const list = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
    const currentIndex = getCurrentIndex();
    if (currentIndex >= 0 && currentIndex < list.length - 1) {
      playVideo(list[currentIndex + 1]);
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
    }
  };

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
  const currentList = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
  const hasNext =
    currentIndex < currentList.length - 1 ||
    (streamData?.relatedStreams?.length ?? 0) > 0 ||
    Boolean(nextContinuation);
  const hasPrev = currentIndex > 0;

  // Compute zoom style for in-car CarPlay screens
  const zoomFactor = uiScale === 'normal' ? 1.0 : uiScale === 'large' ? 1.2 : 1.38;

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
      className="min-h-screen bg-car-bg text-slate-100 flex flex-col pb-16 transition-all duration-200"
    >
      <Header
        onSearch={handleSearch}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        uiScale={uiScale}
        onChangeUiScale={setUiScale}
        onOpenSearchModal={() => setIsSearchModalOpen(true)}
      />

      {activeTab === 'explore' && (
        <CategoryChips
          selectedCategory={selectedCategory}
          onSelectCategory={loadCategory}
        />
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 pt-2">
        {currentVideo ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Player & Car Controls */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              {isLoadingStream && (
                <div className="w-full aspect-video bg-car-card rounded-3xl border-2 border-car-border flex flex-col items-center justify-center gap-4 p-6 text-center shadow-2xl">
                  <div className="w-12 h-12 border-4 border-car-accent border-t-transparent rounded-full animate-spin"></div>
                  <div className="max-w-md">
                    <p className="text-base sm:text-xl font-bold text-white line-clamp-1">
                      {currentVideo.title}
                    </p>
                    <p className="text-sm text-slate-300 font-semibold mt-1">
                      Đang chuẩn bị luồng phát mới...
                    </p>
                  </div>
                </div>
              )}

              {streamErrorMessage && !isLoadingStream && (
                <div className="w-full aspect-video bg-car-card rounded-3xl border-2 border-rose-500/40 p-6 flex flex-col items-center justify-center text-center gap-4 shadow-2xl">
                  <AlertCircle className="w-14 h-14 text-rose-500" />
                  <div className="max-w-md">
                    <h4 className="text-base sm:text-xl font-bold text-white line-clamp-1">
                      {currentVideo.title}
                    </h4>
                    <p className="text-sm text-rose-300 font-semibold mt-1">
                      {streamErrorMessage}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                    <button
                      onClick={() => playVideo(currentVideo, true)}
                      className="h-13 px-5 bg-slate-800 hover:bg-slate-700 text-sm sm:text-base font-bold rounded-2xl text-white border-2 border-car-border flex items-center gap-2 active:scale-95"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Thử tải lại</span>
                    </button>
                    {hasNext && (
                      <button
                        onClick={handleNext}
                        className="h-13 px-5 bg-car-accent hover:bg-car-accentHover text-sm sm:text-base font-bold rounded-2xl text-white flex items-center gap-2 active:scale-95"
                      >
                        <SkipForward className="w-5 h-5" />
                        <span>Bài tiếp theo</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {streamData && !isLoadingStream && !streamErrorMessage && (
                <VideoPlayer
                  key={streamData.id}
                  streamData={streamData}
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
                />
              )}
            </div>

            {/* RIGHT COLUMN: YouTube Suggested Playlist Column */}
            <div className="lg:col-span-5 xl:col-span-4 min-h-0 sticky top-24">
              <SuggestedList
                videos={activeSuggestedList}
                currentVideoId={currentVideo?.id}
                onSelectVideo={(v) => playVideo(v)}
                isLoading={isLoadingVideos}
                hasMore={Boolean(nextContinuation)}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                title={activeColumnTitle}
              />
            </div>
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
                title="Lịch sử bài hát vừa nghe trên xe"
              />
            )}

            {activeTab === 'favorites' && (
              <VideoList
                videos={favorites}
                onSelectVideo={(v) => playVideo(v)}
                title="Danh sách bài hát yêu thích"
              />
            )}
          </div>
        )}
      </main>

      {/* DEDICATED IN-CAR SEARCH OVERLAY / MODAL */}
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
