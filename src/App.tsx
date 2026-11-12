import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { CategoryChips } from './components/CategoryChips';
import { VideoPlayer } from './components/VideoPlayer';
import { VideoList } from './components/VideoList';
import { VideoItem, StreamData } from './types';
import { searchVideos, getVideoDetails } from './services/api';
import { AlertTriangle, Car, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explore' | 'history' | 'favorites'>('explore');
  const [selectedCategory, setSelectedCategory] = useState<string>('remix');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState<boolean>(true);

  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [streamData, setStreamData] = useState<StreamData | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState<boolean>(false);

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
    try {
      const results = await searchVideos(query);
      setVideos(results);
      // Auto pick first video if no video is playing yet
      if (!currentVideo && results.length > 0) {
        playVideo(results[0]);
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
    try {
      const results = await searchVideos(query);
      setVideos(results);
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const playVideo = useCallback(
    async (video: VideoItem) => {
      setCurrentVideo(video);
      setIsLoadingStream(true);

      // Add to history
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.id !== video.id);
        return [video, ...filtered].slice(0, 40);
      });

      try {
        const details = await getVideoDetails(video.id);
        if (details) {
          setStreamData(details);
        } else {
          alert('Không thể tải luồng video này. Đang chuyển sang bài tiếp theo...');
          handleNext();
        }
      } catch (err) {
        console.error('Failed to fetch stream details', err);
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
  const hasNext = currentIndex < currentList.length - 1 || (streamData?.relatedStreams?.length ?? 0) > 0;
  const hasPrev = currentIndex > 0;

  return (
    <div className="min-h-screen bg-car-bg text-slate-100 flex flex-col pb-16">
      {/* Top Header with clock & search */}
      <Header
        onSearch={handleSearch}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Safety Notice Banner for In-Car Screens */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 flex items-center justify-between text-[11px] text-amber-300">
        <div className="flex items-center gap-1.5 mx-auto">
          <Car className="w-3.5 h-3.5 shrink-0" />
          <span>Lái xe an toàn • Nên dùng chế độ <strong>Chỉ nghe nhạc</strong> khi xe đang di chuyển</span>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>100% Chặn quảng cáo</span>
        </div>
      </div>

      {/* Quick Category Chips for Driver Touch */}
      {activeTab === 'explore' && (
        <CategoryChips
          selectedCategory={selectedCategory}
          onSelectCategory={loadCategory}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-2 sm:px-6 pt-3">
        {/* Active Player */}
        {streamData && currentVideo && (
          <VideoPlayer
            streamData={streamData}
            isLoading={isLoadingStream}
            onNext={handleNext}
            onPrev={handlePrev}
            hasNext={hasNext}
            hasPrev={hasPrev}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {/* Video Lists based on Active Tab */}
        {activeTab === 'explore' && (
          <VideoList
            videos={videos}
            currentVideoId={currentVideo?.id}
            onSelectVideo={playVideo}
            isLoading={isLoadingVideos}
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
