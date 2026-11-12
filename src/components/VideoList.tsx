import React from 'react';
import { VideoItem } from '../types';
import { Play, Clock, Sparkles, ChevronDown, Loader2 } from 'lucide-react';

interface VideoListProps {
  videos: VideoItem[];
  currentVideoId?: string;
  onSelectVideo: (video: VideoItem) => void;
  title?: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const VideoList: React.FC<VideoListProps> = ({
  videos,
  currentVideoId,
  onSelectVideo,
  title,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) => {
  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="w-9 h-9 border-3 border-car-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-car-textMuted font-medium">Đang tìm kiếm toàn bộ video...</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="py-12 text-center text-car-textMuted bg-car-card/50 rounded-2xl border border-car-border p-6">
        <Sparkles className="w-10 h-10 mx-auto text-car-border mb-3" />
        <p className="text-sm font-semibold text-slate-300">Không tìm thấy video nào</p>
        <p className="text-xs text-car-textMuted mt-1">Hãy thử tìm kiếm với từ khóa khác</p>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 pb-6">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm sm:text-base font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-car-accent"></span>
            {title}
          </h3>
          <span className="text-xs text-car-textMuted font-mono">
            {videos.length} video
          </span>
        </div>
      )}

      {/* Grid optimized for landscape car screens (VF5 CarPlay) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {videos.map((item) => {
          const isCurrent = currentVideoId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onSelectVideo(item)}
              className={`group flex sm:flex-col bg-car-card rounded-xl overflow-hidden border transition-all cursor-pointer active:scale-98 ${
                isCurrent
                  ? 'border-car-accent ring-1 ring-car-accent bg-car-accent/10'
                  : 'border-car-border hover:border-slate-600'
              }`}
            >
              {/* Thumbnail Container */}
              <div className="relative w-36 sm:w-full aspect-video shrink-0 bg-slate-900 overflow-hidden">
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Duration badge */}
                {item.durationText && (
                  <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded backdrop-blur">
                    {item.durationText}
                  </div>
                )}

                {/* Active Playing Badge */}
                {isCurrent && (
                  <div className="absolute inset-0 bg-car-accent/40 flex items-center justify-center backdrop-blur-xs">
                    <div className="bg-car-accent text-white p-2 rounded-full shadow-lg animate-pulse">
                      <Play className="w-4 h-4 fill-white" />
                    </div>
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div className="p-2.5 sm:p-3 flex flex-col justify-between flex-1 min-w-0">
                <div>
                  <h4
                    className={`text-xs sm:text-sm font-semibold line-clamp-2 leading-snug ${
                      isCurrent ? 'text-car-accent' : 'text-slate-100 group-hover:text-white'
                    }`}
                  >
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-car-textMuted mt-1 truncate font-medium">
                    {item.uploaderName}
                  </p>
                </div>

                {item.viewsText && (
                  <div className="flex items-center gap-1 text-[10px] text-car-textMuted/70 mt-2">
                    <Clock className="w-3 h-3" />
                    <span>{item.viewsText}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Large Car-friendly Load More Button */}
      {hasMore && onLoadMore && (
        <div className="mt-6 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full sm:w-auto min-w-[280px] bg-car-card hover:bg-slate-800 text-slate-100 font-bold py-3.5 px-6 rounded-2xl border border-car-border hover:border-car-accent shadow-lg flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="w-5 h-5 text-car-accent animate-spin" />
                <span>Đang tải thêm kết quả...</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-5 h-5 text-car-accent" />
                <span>Tải thêm video khác</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
