import React, { useState, useEffect } from 'react';
import { Search, Mic, MicOff, Clock, Sparkles, History, Bookmark, X } from 'lucide-react';

interface HeaderProps {
  onSearch: (q: string) => void;
  activeTab: 'explore' | 'history' | 'favorites';
  setActiveTab: (tab: 'explore' | 'history' | 'favorites') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
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

  return (
    <header className="sticky top-0 z-30 bg-car-bg/95 backdrop-blur border-b border-car-border px-3 py-2.5 sm:px-6">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Car Branding & Clock */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-car-card px-3 py-1.5 rounded-xl border border-car-border">
            <span className="w-2.5 h-2.5 rounded-full bg-car-accent animate-pulse"></span>
            <span className="font-bold text-sm tracking-wider text-slate-100 uppercase">
              VF5 <span className="text-car-accent font-extrabold">CarHub</span>
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-car-textMuted font-mono bg-car-card/50 px-2.5 py-1.5 rounded-lg border border-car-border/50">
            <Clock className="w-3.5 h-3.5 text-car-accent" />
            <span>{time}</span>
          </div>
        </div>

        {/* Search Bar - Big touch target */}
        <form onSubmit={handleSubmit} className="flex-1 max-w-xl relative flex items-center">
          <div className="relative w-full">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-car-textMuted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhạc, ca sĩ, video trên ô tô..."
              className="w-full bg-car-card text-slate-100 placeholder-car-textMuted/70 pl-11 pr-20 py-2.5 rounded-xl border border-car-border focus:border-car-accent focus:outline-none text-sm sm:text-base font-medium shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  onSearch('');
                }}
                className="absolute right-11 top-1/2 -translate-y-1/2 p-1.5 text-car-textMuted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Voice Search Button */}
            {speechSupported && (
              <button
                type="button"
                onClick={handleVoiceSearch}
                title="Tìm kiếm bằng giọng nói tiếng Việt"
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all ${
                  isListening
                    ? 'bg-car-danger text-white animate-pulse'
                    : 'bg-car-accent/20 text-car-accent hover:bg-car-accent hover:text-white'
                }`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
          </div>
        </form>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 shrink-0 bg-car-card p-1 rounded-xl border border-car-border">
          <button
            type="button"
            onClick={() => setActiveTab('explore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'explore'
                ? 'bg-car-accent text-white shadow-sm'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden md:inline">Khám phá</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'history'
                ? 'bg-car-accent text-white shadow-sm'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span className="hidden md:inline">Lịch sử</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
              activeTab === 'favorites'
                ? 'bg-car-accent text-white shadow-sm'
                : 'text-car-textMuted hover:text-white'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span className="hidden md:inline">Đã lưu</span>
          </button>
        </div>
      </div>
    </header>
  );
};
