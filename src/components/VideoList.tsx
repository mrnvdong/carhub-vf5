import React from 'react';
import { VideoItem, ViewMode } from '../types';
import { Play, Clock, Sparkles, ChevronDown, Loader2, Music } from 'lucide-react';

interface VideoListProps {
  videos: VideoItem[];
  currentVideoId?: string;
  onSelectVideo: (video: VideoItem) => void;
  title?: string;
  isLoading?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  variant?: ViewMode;
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
  variant = 'classic',
}) => {
  const isYtMusic = variant === 'ytmusic';

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <div
          className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4 ${
            isYtMusic ? 'border-rose-500' : 'border-car-accent'
          }`}
        ></div>
        <p className="text-base sm:text-lg text-slate-200 font-bold">
          Đang tìm kiếm bài hát...
        </p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div
        className={`py-16 text-center rounded-3xl border-2 p-8 ${
          isYtMusic
            ? 'bg-zinc-950/80 border-zinc-800 text-zinc-500'
            : 'bg-car-card/60 border-car-border text-car-textMuted'
        }`}
      >
        <Sparkles className="w-14 h-14 mx-auto text-zinc-700 mb-3" />
        <p className="text-lg font-bold text-slate-200">
          Không tìm thấy bài hát nào
        </p>
        <p className="text-sm text-zinc-400 mt-1">
          Hãy thử tìm kiếm với từ khóa khác hoặc bấm nút Micro
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-6 pb-8">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wider flex items-center gap-2.5">
            {isYtMusic ? (
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
            ) : (
              <span className="w-3 h-3 rounded-full bg-car-accent"></span>
            )}
            <span>{title}</span>
          </h3>
          <span
            className={`text-sm font-mono font-bold px-3 py-1 rounded-xl border ${
              isYtMusic
                ? 'text-zinc-300 bg-zinc-900 border-zinc-700'
                : 'text-slate-300 bg-car-card border-car-border'
            }`}
          >
            {videos.length} bài
          </span>
        </div>
      )}

      {/* Grid: 2 columns in automotive landscape */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
        {videos.map((item) => {
          const isCurrent = currentVideoId === item.id;

          if (isYtMusic) {
            return (
              <div
                key={item.id}
                onClick={() => onSelectVideo(item)}
                className={`group flex rounded-2xl overflow-hidden border transition-all cursor-pointer active:scale-98 p-3 items-center gap-3.5 shadow-md ${
                  isCurrent
                    ? 'border-rose-500 ring-2 ring-rose-500/60 bg-rose-950/40'
                    : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/90'
                }`}
              >
                {/* Square Album Art */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 bg-black rounded-xl overflow-hidden shadow">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {item.durationText && (
                    <div className="absolute bottom-1 right-1 bg-black/85 text-white text-xs font-mono font-extrabold px-1.5 py-0.5 rounded backdrop-blur">
                      {item.durationText}
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="bg-rose-600 text-white p-2.5 rounded-full shadow-xl animate-pulse">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col justify-between flex-1 min-w-0 pr-1">
                  <div>
                    <h4
                      className={`text-base sm:text-lg font-bold line-clamp-2 leading-snug ${
                        isCurrent
                          ? 'text-rose-300 font-extrabold'
                          : 'text-zinc-100 group-hover:text-white'
                      }`}
                    >
                      {item.title}
                    </h4>
                    <p className="text-xs sm:text-sm text-zinc-400 font-medium mt-1 truncate">
                      {item.uploaderName}
                    </p>
                  </div>
                  {item.viewsText && (
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-2 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{item.viewsText}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Classic View Item
          return (
            <div
              key={item.id}
              onClick={() => onSelectVideo(item)}
              className={`group flex bg-car-card rounded-2xl overflow-hidden border-2 transition-all cursor-pointer active:scale-98 p-2.5 sm:p-3 items-center gap-3 sm:gap-4 shadow-md ${
                isCurrent
                  ? 'border-car-accent ring-2 ring-car-accent bg-car-accent/15'
                  : 'border-car-border hover:border-slate-500'
              }`}
            >
              {/* Large Thumbnail Container */}
              <div className="relative w-40 sm:w-48 aspect-video shrink-0 bg-slate-900 rounded-xl overflow-hidden shadow-sm">
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {item.durationText && (
                  <div className="absolute bottom-1.5 right-1.5 bg-black/85 text-white text-xs sm:text-sm font-mono font-extrabold px-2 py-0.5 rounded-lg backdrop-blur">
                    {item.durationText}
                  </div>
                )}

                {isCurrent && (
                  <div className="absolute inset-0 bg-car-accent/40 flex items-center justify-center backdrop-blur-xs">
                    <div className="bg-car-accent text-white p-3 rounded-full shadow-xl animate-pulse">
                      <Play className="w-6 h-6 fill-white ml-0.5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Video Info */}
              <div className="flex flex-col justify-between flex-1 min-w-0 pr-1">
                <div>
                  <h4
                    className={`text-base sm:text-lg font-bold line-clamp-2 leading-snug ${
                      isCurrent
                        ? 'text-car-accent'
                        : 'text-slate-100 group-hover:text-white'
                    }`}
                  >
                    {item.title}
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-300 font-semibold mt-1.5 truncate">
                    {item.uploaderName}
                  </p>
                </div>

                {item.viewsText && (
                  <div className="flex items-center gap-1.5 text-xs text-car-textMuted mt-2 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{item.viewsText}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && onLoadMore && (
        <div className="mt-8 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className={`w-full sm:max-w-md mx-auto h-16 font-extrabold text-base sm:text-lg rounded-2xl border-2 shadow-xl flex items-center justify-center gap-3 transition active:scale-95 disabled:opacity-50 ${
              isYtMusic
                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border-zinc-800 hover:border-rose-500'
                : 'bg-car-card hover:bg-slate-800 text-slate-100 border-car-border hover:border-car-accent'
            }`}
          >
            {isLoadingMore ? (
              <>
                <Loader2
                  className={`w-6 h-6 animate-spin ${
                    isYtMusic ? 'text-rose-500' : 'text-car-accent'
                  }`}
                />
                <span>Đang tải thêm danh sách...</span>
              </>
            ) : (
              <>
                <ChevronDown
                  className={`w-6 h-6 ${
                    isYtMusic ? 'text-rose-500' : 'text-car-accent'
                  }`}
                />
                <span>Tải thêm video khác</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
