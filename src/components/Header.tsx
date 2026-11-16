import React, { useState, useEffect } from 'react';
import {
  Search,
  Mic,
  Clock,
  Sparkles,
  History,
  Bookmark,
  ZoomIn,
  ZoomOut,
  Play,
  Tv,
  Headphones,
} from 'lucide-react';
import { UiScale, ViewMode } from '../types';

interface HeaderProps {
  onSearch: (q: string) => void;
  activeTab: 'explore' | 'history' | 'favorites';
  setActiveTab: (tab: 'explore' | 'history' | 'favorites') => void;
  searchQuery: string;
  uiScale: UiScale;
  onChangeUiScale: (scale: UiScale) => void;
  onOpenSearchModal: (startVoice?: boolean) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  uiScale,
  onChangeUiScale,
  onOpenSearchModal,
  viewMode,
  onChangeViewMode,
}) => {
  const [time, setTime] = useState<string>('');
  const isYtMusic = viewMode === 'ytmusic';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const cycleScale = () => {
    if (uiScale === 'normal') onChangeUiScale('large');
    else if (uiScale === 'large') onChangeUiScale('xlarge');
    else onChangeUiScale('normal');
  };

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur-md border-b px-2.5 py-2 sm:px-5 transition-colors duration-200 ${
        isYtMusic
          ? 'bg-[#030303]/95 border-zinc-800/80 text-white'
          : 'bg-car-bg/98 border-car-border text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3 max-w-[1600px] mx-auto w-full min-w-0">
        {/* LEFT: Unified Brand + Mode Switcher (Chuyển đổi YT Music chỉ nghe nhạc vs Xem Video) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div
            className={`flex items-center p-1 rounded-2xl border ${
              isYtMusic
                ? 'bg-zinc-900 border-zinc-800'
                : 'bg-car-card border-car-border'
            }`}
          >
            {/* Nút Chế độ YouTube Music (Chỉ chạy âm thanh) */}
            <button
              type="button"
              onClick={() => onChangeViewMode('ytmusic')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap transition active:scale-95 ${
                isYtMusic
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Chế độ YouTube Music (Chỉ phát âm thanh - Không tải video)"
            >
              <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                <Play className="w-2.5 h-2.5 fill-rose-600 text-rose-600 ml-0.5" />
              </span>
              <span>YT Music</span>
            </button>

            {/* Nút Chế độ Xem Video */}
            <button
              type="button"
              onClick={() => onChangeViewMode('classic')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap transition active:scale-95 ${
                !isYtMusic
                  ? 'bg-car-accent text-white shadow-md shadow-car-accent/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Chế độ xem Video YouTube"
            >
              <Tv className="w-4 h-4 shrink-0" />
              <span>Video</span>
            </button>
          </div>
        </div>

        {/* CENTER: Search Bar + Voice Button (co giãn linh hoạt, không bao giờ vỡ khung) */}
        <div className="flex-1 min-w-[140px] max-w-xl flex items-center gap-1.5 sm:gap-2">
          <div
            onClick={() => onOpenSearchModal(false)}
            className={`flex-1 min-w-0 h-11 sm:h-12 px-3 sm:px-4 rounded-2xl border flex items-center gap-2.5 cursor-pointer transition active:scale-98 ${
              isYtMusic
                ? 'bg-zinc-900/90 hover:bg-zinc-800 text-white border-zinc-800 hover:border-rose-500/60'
                : 'bg-car-card hover:bg-slate-800/90 text-slate-100 border-car-border hover:border-car-accent'
            }`}
          >
            <Search
              className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${
                isYtMusic ? 'text-rose-500' : 'text-car-accent'
              }`}
            />
            <span
              className={`text-xs sm:text-sm font-bold truncate ${
                searchQuery
                  ? 'text-white'
                  : isYtMusic
                  ? 'text-zinc-400'
                  : 'text-car-textMuted/80'
              }`}
            >
              {searchQuery ||
                (isYtMusic
                  ? 'Tìm bài hát, ca sĩ, remix (Chỉ phát nhạc)...'
                  : 'Tìm bài hát, ca sĩ, video...')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenSearchModal(true)}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl text-white flex items-center justify-center border active:scale-95 transition shrink-0 ${
              isYtMusic
                ? 'bg-rose-600 hover:bg-rose-500 border-rose-400/50 shadow-md shadow-rose-600/30'
                : 'bg-blue-600 hover:bg-blue-500 border-blue-400/50 shadow-md shadow-blue-600/30'
            }`}
            title="Tìm kiếm bằng giọng nói"
          >
            <Mic className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* RIGHT: Tools & Compact Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isYtMusic ? (
            /* Ở chế độ YT Music: Các tab nằm ngay trong giao diện chính nên Header cực gọn */
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold whitespace-nowrap">
              <Headphones className="w-3.5 h-3.5 shrink-0" />
              <span>Audio-Only (Không tải Video)</span>
            </div>
          ) : (
            /* Ở chế độ Video: Hiển thị các tab gọn gàng */
            <div className="flex items-center gap-1 bg-car-card p-1 rounded-2xl border border-car-border">
              <button
                type="button"
                onClick={() => setActiveTab('explore')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition active:scale-95 ${
                  activeTab === 'explore'
                    ? 'bg-car-accent text-white shadow'
                    : 'text-car-textMuted hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Khám phá</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition active:scale-95 ${
                  activeTab === 'history'
                    ? 'bg-car-accent text-white shadow'
                    : 'text-car-textMuted hover:text-white'
                }`}
              >
                <History className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Lịch sử</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('favorites')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition active:scale-95 ${
                  activeTab === 'favorites'
                    ? 'bg-car-accent text-white shadow'
                    : 'text-car-textMuted hover:text-white'
                }`}
              >
                <Bookmark className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline">Đã lưu</span>
              </button>
            </div>
          )}

          {/* Nút Đổi Cỡ Chữ Gọn (100% / 120% / 140%) */}
          <button
            type="button"
            onClick={cycleScale}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-extrabold border whitespace-nowrap transition active:scale-95 ${
              isYtMusic
                ? 'bg-zinc-900 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                : 'bg-car-card text-slate-200 border-car-border hover:border-slate-500'
            }`}
            title="Đổi kích thước giao diện"
          >
            {uiScale === 'normal' ? (
              <>
                <ZoomIn className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>100%</span>
              </>
            ) : uiScale === 'large' ? (
              <>
                <ZoomIn className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-300">120%</span>
              </>
            ) : (
              <>
                <ZoomOut className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-300">140%</span>
              </>
            )}
          </button>

          {/* Đồng hồ xe */}
          <div
            className={`hidden md:flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-2 rounded-xl border whitespace-nowrap ${
              isYtMusic
                ? 'bg-zinc-900 text-zinc-300 border-zinc-800'
                : 'bg-car-card text-slate-200 border-car-border'
            }`}
          >
            <Clock
              className={`w-3.5 h-3.5 shrink-0 ${
                isYtMusic ? 'text-rose-500' : 'text-car-accent'
              }`}
            />
            <span>{time}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
