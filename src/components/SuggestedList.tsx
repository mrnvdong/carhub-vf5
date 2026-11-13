import React from 'react';
import { VideoItem } from '../types';
import { Play, Sparkles, ChevronDown, Loader2, ListMusic } from 'lucide-react';

interface SuggestedListProps {
  videos: VideoItem[];
  currentVideoId?: string;
  onSelectVideo: (video: VideoItem) => void;
  title?: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const SuggestedList: React.FC<SuggestedListProps> = ({
  videos,
  currentVideoId,
  onSelectVideo,
  title = 'Bài hát tiếp theo',
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}) => {
  if (isLoading && videos.length === 0) {
    return (
      <div className="py-12 text-center bg-car-card rounded-3xl border-2 border-car-border p-6">
        <Loader2 className="w-10 h-10 text-car-accent animate-spin mx-auto mb-3" />
        <p className="text-base text-slate-200 font-bold">Đang tải danh sách bài hát...</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="py-12 text-center bg-car-card rounded-3xl border-2 border-car-border p-6 text-car-textMuted">
        <Sparkles className="w-10 h-10 mx-auto text-car-border mb-2" />
        <p className="text-base font-bold text-slate-200">Không có bài hát nào</p>
      </div>
    );
  }

  return (
    <div className="bg-car-card/95 backdrop-blur rounded-3xl border-2 border-car-border p-3.5 sm:p-4 shadow-xl flex flex-col">
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-car-border">
        <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-car-accent" />
          <span>{title}</span>
        </h3>
        <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700">
          {videos.length} bài
        </span>
      </div>

      {/* Suggested Songs Scroll List (YouTube Style Sidebar) */}
      <div className="space-y-2.5 overflow-y-auto max-h-[calc(100vh-190px)] pr-1 no-scrollbar">
        {videos.map((item, idx) => {
          const isCurrent = currentVideoId === item.id;
          return (
            <div
              key={`${item.id}-${idx}`}
              onClick={() => onSelectVideo(item)}
              className={`group flex items-center gap-3 p-2 rounded-2xl border-2 transition-all cursor-pointer active:scale-98 ${
                isCurrent
                  ? 'bg-car-accent/20 border-car-accent ring-2 ring-car-accent/50 shadow-md'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-800/80'
              }`}
            >
              {/* Thumbnail Container */}
              <div className="relative w-28 sm:w-32 aspect-video shrink-0 bg-slate-950 rounded-xl overflow-hidden shadow">
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Duration Badge */}
                {item.durationText && (
                  <div className="absolute bottom-1 right-1 bg-black/85 text-white text-[11px] font-mono font-bold px-1.5 py-0.2 rounded backdrop-blur">
                    {item.durationText}
                  </div>
                )}

                {/* Active Playing Overlay */}
                {isCurrent && (
                  <div className="absolute inset-0 bg-car-accent/50 flex items-center justify-center backdrop-blur-xs">
                    <div className="bg-car-accent text-white p-2 rounded-full shadow-lg animate-pulse">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Title & Channel Info */}
              <div className="flex flex-col justify-between flex-1 min-w-0 pr-1">
                <h4
                  className={`text-sm sm:text-base font-bold line-clamp-2 leading-snug ${
                    isCurrent ? 'text-blue-300' : 'text-slate-100 group-hover:text-white'
                  }`}
                >
                  {item.title}
                </h4>
                <p className="text-xs text-slate-300 font-semibold truncate mt-1">
                  {item.uploaderName}
                </p>
              </div>
            </div>
          );
        })}

        {/* Load More Button inside Sidebar */}
        {hasMore && onLoadMore && (
          <div className="pt-2 pb-1 text-center">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="w-full h-13 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm sm:text-base rounded-2xl border-2 border-car-border hover:border-car-accent shadow-md flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-5 h-5 text-car-accent animate-spin" />
                  <span>Đang tải thêm...</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-5 h-5 text-car-accent" />
                  <span>Tải thêm gợi ý</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
