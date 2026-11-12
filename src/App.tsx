import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CategoryChips } from './components/CategoryChips';
import { VideoPlayer } from './components/VideoPlayer';
import { VideoList } from './components/VideoList';
import { VideoItem, StreamData } from './types';
import { searchVideos, getVideoDetails } from './services/api';
import { Car, ShieldCheck, AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explore' | 'history' | 'favorites'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>('remix');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [nextContinuation, setNextContinuation] = useState<string | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null);

  // Local storage for history & favorites
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

  // Save history & favorites to localStorage
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
    setActiveTab('explore');
    setSelectedCategory('');
    setIsLoadingVideos(true);
    setNextContinuation(null);
    try {
      const result = await searchVideos(query);
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
    async (video: VideoItem) => {
      // 1. Immediately reset current stream data and errors to clear old video/audio playback!
      setStreamData(null);
      setStreamErrorMessage(null);
      setCurrentVideo(video);
      setIsLoadingStream(true);

      // Add to history
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== video.id);
        return [video, ...filtered].slice(0, 50);
      });

      try {
        const details = await getVideoDetails(video.id);
        if (details && details.playbackType !== 'unplayable') {
          setStreamData(details);
        } else {
          setStreamErrorMessage('Không tìm thấy luồng phát hợp lệ cho video này.');
        }
      } catch (err) {
        console.error('Failed to fetch stream details', err);
        setStreamErrorMessage('Lỗi kết nối khi tải luồng phát.');
      } finally {
        setIsLoadingStream(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videos, currentVideo]
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

  const currentIndex = getCurrentIndex();
  const currentList = activeTab === 'favorites' ? favorites : activeTab === 'history' ? history : videos;
  const hasNext = currentIndex < currentList.length - 1 || (streamData?.relatedStreams?.length ?? 0) > 0 || !!nextContinuation;
  const hasPrev = currentIndex > 0;

  return (
    <div className="min-h-screen bg-car-bg text-slate-100 flex flex-col pb-16">
      <Header
        onSearch={handleSearch}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Safety Notice Banner */}
      <div className="bg-slate-900 border-b border-car-border px-3 py-1.5 flex items-center justify-between text-[11px] text-car-textMuted">
        <div className="flex items-center gap-1.5 mx-auto text-amber-300">
          <Car className="w-3.5 h-3.5 shrink-0" />
          <span>Lái xe an toàn • Bật chế độ <strong>Chỉ nghe nhạc</strong> khi xe đang di chuyển</span>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-slate-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-car-accent" />
          <span>Chặn quảng cáo cho luồng trực tiếp</span>
        </div>
      </div>

      {activeTab === 'explore' && (
        <CategoryChips
          selectedCategory={selectedCategory}
          onSelectCategory={loadCategory}
        />
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-6 pt-3">
        {/* Loading state before stream is ready */}
        {isLoadingStream && !streamData && currentVideo && (
          <div className="w-full aspect-video bg-car-card rounded-2xl border border-car-border flex flex-col items-center justify-center gap-3 mb-6 p-4 text-center">
            <div className="w-8 h-8 border-3 border-car-accent border-t-transparent rounded-full animate-spin"></div>
            <div>
              <p className="text-sm font-semibold text-white line-clamp-1">{currentVideo.title}</p>
              <p className="text-xs text-car-textMuted mt-1">Đang bóc tách luồng phát sạch không quảng cáo...</p>
            </div>
          </div>
        )}

        {/* Error state if stream failed */}
        {streamErrorMessage && currentVideo && !isLoadingStream && (
          <div className="w-full bg-car-card rounded-2xl border border-rose-500/30 p-6 flex flex-col items-center justify-center text-center gap-3 mb-6">
            <AlertCircle className="w-8 h-8 text-rose-500" />
            <div>
              <h4 className="text-sm font-bold text-white">{currentVideo.title}</h4>
              <p className="text-xs text-rose-400 mt-1">{streamErrorMessage}</p>
            </div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => playVideo(currentVideo)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-white border border-car-border"
              >
                Thử lại
              </button>
              {hasNext && (
                <button
                  onClick={handleNext}
                  className="px-3.5 py-2 bg-car-accent hover:bg-car-accentHover text-xs font-semibold rounded-xl text-white"
                >
                  Chuyển sang bài khác
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Player */}
        {streamData && currentVideo && !isLoadingStream && (
          <VideoPlayer
            streamData={streamData}
            isLoading={isLoadingStream}
            onNext={handleNext}
            onPrev={handlePrev}
            onRetry={() => playVideo(currentVideo)}
            hasNext={hasNext}
            hasPrev={hasPrev}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {activeTab === 'explore' && (
          <VideoList
            videos={videos}
            currentVideoId={currentVideo?.id}
            onSelectVideo={playVideo}
            isLoading={isLoadingVideos}
            hasMore={!!nextContinuation}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
            title={selectedCategory ? 'Danh sách phát đề xuất' : `Kết quả tìm kiếm cho "${searchQuery}"`}
          />
        )}

        {activeTab === 'history' && (
          <VideoList
            videos={history}
            currentVideoId={currentVideo?.id}
            onSelectVideo={playVideo}
            title="Lịch sử bài hát vừa nghe trên xe"
          />
        )}

        {activeTab === 'favorites' && (
          <VideoList
            videos={favorites}
            currentVideoId={currentVideo?.id}
            onSelectVideo={playVideo}
            title="Danh sách bài hát yêu thích"
          />
        )}
      </main>
    </div>
  );
};
