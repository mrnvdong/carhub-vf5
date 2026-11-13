import React, { useState, useEffect } from 'react';
import { Search, Mic, Clock, Sparkles, History, Bookmark, ZoomIn, ZoomOut } from 'lucide-react';
import { UiScale } from '../types';

interface HeaderProps {
  onSearch: (q: string) => void;
  activeTab: 'explore' | 'history' | 'favorites';
  setActiveTab: (tab: 'explore' | 'history' | 'favorites') => void;
  searchQuery: string;
  uiScale: UiScale;
  onChangeUiScale: (scale: UiScale) => void;
  onOpenSearchModal: (startVoice?: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  activeTab,
  setActiveTab,
  searchQuery,
  uiScale,
  onChangeUiScale,
  onOpenSearchModal,
}) => {
  const [time, setTime] = useState<string>('');

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
    <header className="sticky top-0 z-40 bg-car-bg/98 backdrop-blur border-b border-car-border px-3 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-3 max-w-[1600px] mx-auto">
        {/* Car Branding & Clock */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-car-card px-3.5 py-2.5 rounded-2xl border border-car-border shadow-sm">
            <span className="w-3 h-3 rounded-full bg-car-accent animate-pulse"></span>
            <span className="font-extrabold text-base tracking-wider text-slate-100 uppercase">
              VF5 <span className="text-car-accent">CarHub</span>
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-sm text-slate-200 font-mono font-bold bg-car-card/80 px-3 py-2.5 rounded-2xl border border-car-border">
            <Clock className="w-4 h-4 text-car-accent" />
            <span>{time}</span>
          </div>

          {/* Quick UI Scale Button for Driver */}
          <button
            type="button"
            onClick={cycleScale}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs sm:text-sm font-bold bg-car-card border border-car-border hover:border-slate-500 text-slate-200 active:scale-95 transition"
            title="Đổi cỡ chữ / nút bấm trên màn hình xe"
          >
            {uiScale === 'normal' ? (
              <>
                <ZoomIn className="w-4 h-4 text-car-accent" />
                <span>Cỡ: Chuẩn</span>
              </>
            ) : uiScale === 'large' ? (
              <>
                <ZoomIn className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300 font-extrabold">Cỡ: To</span>
              </>
            ) : (
              <>
                <ZoomOut className="w-4 h-4 text-amber-400" />
                <span className="text-amber-300 font-extrabold">Cỡ: Cực đại</span>
              </>
            )}
          </button>
        </div>

        {/* AUTOMOTIVE ONE-TOUCH SEARCH BAR & GIANT VOICE BUTTON */}
        <div className="flex-1 max-w-2xl flex items-center gap-2 sm:gap-3">
          {/* Big Search Input Trigger */}
          <div
            onClick={() => onOpenSearchModal(false)}
            className="flex-1 h-14 bg-car-card hover:bg-slate-800/90 text-slate-100 pl-4 pr-4 rounded-2xl border-2 border-car-border hover:border-car-accent flex items-center gap-3 cursor-pointer shadow-inner active:scale-98 transition"
          >
            <Search className="w-6 h-6 text-car-accent shrink-0" />
            <span
              className={`text-base sm:text-lg font-bold truncate ${
                searchQuery ? 'text-white' : 'text-car-textMuted/80'
              }`}
            >
              {searchQuery || 'Tìm bài hát, ca sĩ, remix...'}
            </span>
          </div>

          {/* Quick Voice Search Mic Button */}
          <button
            type="button"
            onClick={() => onOpenSearchModal(true)}
            className="w-14 h-14 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 border-2 border-blue-400 active:scale-95 transition shrink-0"
            title="Tìm kiếm bằng giọng nói"
          >
            <Mic className="w-7 h-7 text-white animate-pulse" />
          </button>
        </div>

        {/* Big Navigation Tabs */}
        <div className="flex items-center gap-1.5 shrink-0 bg-car-card p-1.5 rounded-2xl border border-car-border">
          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'explore'
                ? 'bg-car-accent text-white shadow-md'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="hidden md:inline">Khám phá</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'history'
                ? 'bg-car-accent text-white shadow-md'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold transition active:scale-95 ${
              activeTab === 'favorites'
                ? 'bg-car-accent text-white shadow-md'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Bookmark className="w-5 h-5" />
            <span className="hidden md:inline">Đã lưu</span>
          </button>
        </div>
      </div>
    </header>
  );
};
