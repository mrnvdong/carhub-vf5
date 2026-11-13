import React, { useState, useEffect } from 'react';
import { Search, Mic, MicOff, Clock, Sparkles, History, Bookmark, X, ZoomIn, ZoomOut } from 'lucide-react';
import { UiScale } from '../types';

interface HeaderProps {
  onSearch: (q: string) => void;
  activeTab: 'explore' | 'history' | 'favorites';
  setActiveTab: (tab: 'explore' | 'history' | 'favorites') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  uiScale: UiScale;
  onChangeUiScale: (scale: UiScale) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  uiScale,
  onChangeUiScale,
}) => {
  const [time, setTime] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

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

  // Check Web Speech API support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
      }
    }
  }, []);

  const handleVoiceSearch = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Trình duyệt trên xe chưa hỗ trợ nhận diện giọng nói Web Speech.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      onSearch(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const cycleScale = () => {
    if (uiScale === 'normal') onChangeUiScale('large');
    else if (uiScale === 'large') onChangeUiScale('xlarge');
    else onChangeUiScale('normal');
  };

  return (
    <header className="sticky top-0 z-40 bg-car-bg/98 backdrop-blur border-b border-car-border px-3 py-3 sm:px-6">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
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

        {/* Large Touch Search Bar */}
        <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative flex items-center">
          <div className="relative w-full">
            <Search className="w-6 h-6 absolute left-4 top-1/2 -translate-y-1/2 text-car-textMuted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bài hát, ca sĩ, remix..."
              className="w-full h-14 bg-car-card text-slate-100 placeholder-car-textMuted/70 pl-13 pr-24 rounded-2xl border-2 border-car-border focus:border-car-accent focus:outline-none text-base sm:text-lg font-semibold shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  onSearch('');
                }}
                className="absolute right-13 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-car-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {/* Voice Search Button (Big touch target) */}
            {speechSupported && (
              <button
                type="button"
                onClick={handleVoiceSearch}
                title="Bấm để nói tên bài hát bằng tiếng Việt"
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/50'
                    : 'bg-car-accent/20 text-car-accent hover:bg-car-accent hover:text-white'
                }`}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
            )}
          </div>
        </form>

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
