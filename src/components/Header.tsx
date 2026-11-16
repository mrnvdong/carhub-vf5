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
  Music,
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
  onSearch,
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

  // Clock for car dashboard
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
      className={`sticky top-0 z-40 backdrop-blur border-b px-3 py-2.5 sm:px-6 transition-colors duration-300 ${
        isYtMusic
          ? 'bg-[#030303]/98 border-zinc-800/90 text-white'
          : 'bg-car-bg/98 border-car-border text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-[1600px] mx-auto">
        {/* LEFT SECTION: Branding & Mode Switcher */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Brand Logo: Dynamic based on viewMode */}
          {isYtMusic ? (
            <div className="flex items-center gap-2.5 bg-zinc-950 px-3.5 py-2 rounded-2xl border border-zinc-800 shadow-sm">
              <div className="w-7 h-7 rounded-full bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-600/50">
                <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
              </div>
              <span className="font-black text-base sm:text-lg tracking-wider text-white">
                YouTube <span className="text-rose-500 font-extrabold">Music</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-car-card px-3.5 py-2.5 rounded-2xl border border-car-border shadow-sm">
              <span className="w-3 h-3 rounded-full bg-car-accent animate-pulse"></span>
              <span className="font-extrabold text-base tracking-wider text-slate-100 uppercase">
                VF5 <span className="text-car-accent">CarHub</span>
              </span>
            </div>
          )}

          {/* PROMINENT MODE SWITCHER: 1-TOUCH TOGGLE BETWEEN VIDEO & YOUTUBE MUSIC */}
          <div
            className={`flex items-center p-1 rounded-2xl border shadow-inner ${
              isYtMusic
                ? 'bg-zinc-900/90 border-zinc-800'
                : 'bg-car-card border-car-border'
            }`}
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('ytmusic')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition active:scale-95 ${
                isYtMusic
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Chuyển sang Giao diện YouTube Music"
            >
              <Music className="w-4 h-4" />
              <span>YT Music</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('classic')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-black transition active:scale-95 ${
                !isYtMusic
                  ? 'bg-car-accent text-white shadow-lg shadow-car-accent/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Chuyển sang Giao diện Video YouTube"
            >
              <Tv className="w-4 h-4" />
              <span>Video</span>
            </button>
          </div>

          {/* Clock for dashboard */}
          <div
            className={`hidden lg:flex items-center gap-1.5 text-xs sm:text-sm font-mono font-bold px-3 py-2 rounded-2xl border ${
              isYtMusic
                ? 'bg-zinc-900 text-zinc-300 border-zinc-800'
                : 'bg-car-card/80 text-slate-200 border-car-border'
            }`}
          >
            <Clock
              className={`w-3.5 h-3.5 ${
                isYtMusic ? 'text-rose-500' : 'text-car-accent'
              }`}
            />
            <span>{time}</span>
          </div>

          {/* Quick UI Scale Button */}
          <button
            type="button"
            onClick={cycleScale}
            className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold border transition active:scale-95 ${
              isYtMusic
                ? 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                : 'bg-car-card text-slate-200 border-car-border hover:border-slate-500'
            }`}
            title="Đổi cỡ chữ trên màn hình xe"
          >
            {uiScale === 'normal' ? (
              <>
                <ZoomIn
                  className={`w-3.5 h-3.5 ${
                    isYtMusic ? 'text-rose-400' : 'text-car-accent'
                  }`}
                />
                <span>Cỡ: Chuẩn</span>
              </>
            ) : uiScale === 'large' ? (
              <>
                <ZoomIn className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-extrabold">Cỡ: To</span>
              </>
            ) : (
              <>
                <ZoomOut className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-300 font-extrabold">Cỡ: Cực đại</span>
              </>
            )}
          </button>
        </div>

        {/* CENTER SECTION: AUTOMOTIVE SEARCH BAR & GIANT VOICE BUTTON */}
        <div className="flex-1 max-w-xl flex items-center gap-2 sm:gap-3">
          <div
            onClick={() => onOpenSearchModal(false)}
            className={`flex-1 h-13 sm:h-14 pl-4 pr-4 rounded-2xl border-2 flex items-center gap-3 cursor-pointer shadow-inner active:scale-98 transition ${
              isYtMusic
                ? 'bg-zinc-900/90 hover:bg-zinc-800/90 text-white border-zinc-800 hover:border-rose-500'
                : 'bg-car-card hover:bg-slate-800/90 text-slate-100 border-car-border hover:border-car-accent'
            }`}
          >
            <Search
              className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 ${
                isYtMusic ? 'text-rose-500' : 'text-car-accent'
              }`}
            />
            <span
              className={`text-sm sm:text-base font-bold truncate ${
                searchQuery
                  ? 'text-white'
                  : isYtMusic
                  ? 'text-zinc-500'
                  : 'text-car-textMuted/80'
              }`}
            >
              {searchQuery ||
                (isYtMusic
                  ? 'Tìm bài hát, ca sĩ, album...'
                  : 'Tìm bài hát, ca sĩ, remix...')}
            </span>
          </div>

          {/* Voice Search Button */}
          <button
            type="button"
            onClick={() => onOpenSearchModal(true)}
            className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl text-white flex items-center justify-center border-2 active:scale-95 transition shrink-0 ${
              isYtMusic
                ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 border-rose-400 shadow-lg shadow-rose-600/40'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 border-blue-400 shadow-lg shadow-blue-600/40'
            }`}
            title="Tìm kiếm bằng giọng nói"
          >
            <Mic className="w-6 h-6 sm:w-7 sm:h-7 text-white animate-pulse" />
          </button>
        </div>

        {/* RIGHT SECTION: Navigation Tabs */}
        <div
          className={`flex items-center gap-1 sm:gap-1.5 shrink-0 p-1.5 rounded-2xl border ${
            isYtMusic
              ? 'bg-zinc-950 border-zinc-800'
              : 'bg-car-card border-car-border'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'explore'
                ? isYtMusic
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-car-accent text-white shadow-md'
                : isYtMusic
                ? 'text-zinc-400 hover:text-white'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden md:inline">
              {isYtMusic ? 'Trang chủ' : 'Khám phá'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'history'
                ? isYtMusic
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-car-accent text-white shadow-md'
                : isYtMusic
                ? 'text-zinc-400 hover:text-white'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <History className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'favorites'
                ? isYtMusic
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-car-accent text-white shadow-md'
                : isYtMusic
                ? 'text-zinc-400 hover:text-white'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Bookmark className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden md:inline">
              {isYtMusic ? 'Thư viện' : 'Đã lưu'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
