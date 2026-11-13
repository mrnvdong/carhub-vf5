import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Mic,
  MicOff,
  X,
  Clock,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  Flame,
  Radio,
  Trash2,
  User,
} from 'lucide-react';

interface CarSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  initialQuery?: string;
  recentSearches: string[];
  onClearRecentSearches: () => void;
  onRemoveRecentSearch: (query: string) => void;
}

const CAR_TRENDING_QUERIES = [
  { icon: '🔥', text: 'Nhạc trẻ remix bass căng' },
  { icon: '⚡', text: 'Vinahouse nonstop cực mạnh' },
  { icon: '🚗', text: 'Nhạc lái xe đường dài hay nhất' },
  { icon: '📻', text: 'Bolero trữ tình hải ngoại' },
  { icon: '☕', text: 'Lofi chill tiếng mưa lái xe' },
  { icon: '🎙️', text: 'Hieu TV podcast mới nhất' },
  { icon: '👶', text: 'Ca nhạc thiếu nhi vui nhộn cho bé' },
  { icon: '🎤', text: 'Nhạc karaoke hát trên ô tô' },
  { icon: '🎸', text: 'Acoustic nhạc Trịnh thư giãn' },
];

const POPULAR_ARTISTS = [
  'Sơn Tùng M-TP',
  'Đan Nguyên',
  'Quang Lập',
  'Như Quỳnh',
  'Tuấn Hưng',
  'Mỹ Tâm',
  'Đen Vâu',
  'Vũ.',
];

export const CarSearchModal: React.FC<CarSearchModalProps> = ({
  isOpen,
  onClose,
  onSearch,
  initialQuery = '',
  recentSearches,
  onClearRecentSearches,
  onRemoveRecentSearch,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check speech recognition support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
      }
    }
  }, []);

  // Sync initial query and focus when opened
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setInterimTranscript('');
      setIsListening(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    }
  }, [isOpen, initialQuery]);

  // Fetch auto-complete suggestions as user types
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        setSuggestions([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Voice Search Handler (Web Speech API)
  const toggleVoiceSearch = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Trình duyệt trên xe chưa hỗ trợ nhận diện giọng nói Web Speech.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
    };

    recognition.onresult = (event: any) => {
      let finalStr = '';
      let interimStr = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalStr += event.results[i][0].transcript;
        } else {
          interimStr += event.results[i][0].transcript;
        }
      }

      const activeText = finalStr || interimStr;
      setInterimTranscript(activeText);

      if (finalStr.trim()) {
        setQuery(finalStr.trim());
        setIsListening(false);
        // Auto search after speaking finishes
        setTimeout(() => {
          handleExecuteSearch(finalStr.trim());
        }, 500);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleExecuteSearch = (searchVal: string) => {
    const clean = searchVal.trim();
    if (!clean) return;
    onSearch(clean);
    onClose();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecuteSearch(query);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-3 sm:p-6 overflow-y-auto">
      {/* Top Bar with Input & Close */}
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <form onSubmit={handleFormSubmit} className="flex-1 relative flex items-center">
            <Search className="w-7 h-7 absolute left-4 text-car-accent pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên bài hát hoặc bấm Micro để nói..."
              className="w-full h-16 sm:h-18 bg-car-card text-white text-lg sm:text-2xl font-bold pl-14 pr-24 rounded-2xl border-2 border-car-border focus:border-car-accent focus:outline-none shadow-2xl"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-14 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-12 px-4 rounded-xl bg-car-accent hover:bg-car-accentHover text-white font-extrabold text-sm sm:text-base flex items-center gap-1 active:scale-95 shadow-md"
            >
              Tìm
            </button>
          </form>

          {/* Big Close Button */}
          <button
            onClick={onClose}
            className="h-16 w-16 sm:h-18 sm:w-18 bg-slate-800 hover:bg-slate-700 rounded-2xl border-2 border-slate-700 text-slate-200 flex flex-col items-center justify-center active:scale-95 shrink-0 shadow-lg"
            title="Đóng tìm kiếm"
          >
            <X className="w-8 h-8" />
            <span className="text-[11px] font-bold">Đóng</span>
          </button>
        </div>

        {/* GIANT AUTOMOTIVE VOICE SEARCH HERO SECTION */}
        {speechSupported && (
          <div
            className={`w-full p-4 sm:p-5 rounded-3xl border-2 transition-all flex items-center gap-4 cursor-pointer active:scale-98 shadow-xl ${
              isListening
                ? 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/50'
                : 'bg-gradient-to-r from-blue-950/50 to-car-card border-blue-500/40 hover:border-blue-400'
            }`}
            onClick={toggleVoiceSearch}
          >
            {/* Giant Pulsing Mic Icon (80px) */}
            <div
              className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shrink-0 shadow-2xl transition-all ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/60 ring-4 ring-rose-400'
                  : 'bg-car-accent text-white shadow-car-accent/40 hover:scale-105'
              }`}
            >
              {isListening ? (
                <MicOff className="w-9 h-9 sm:w-10 sm:h-10" />
              ) : (
                <Mic className="w-9 h-9 sm:w-10 sm:h-10" />
              )}
            </div>

            {/* Voice Status & Transcript */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isListening ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
                  }`}
                ></span>
                <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-300">
                  {isListening ? 'ĐANG LẮNG NGHE GIỌNG NÓI TIẾNG VIỆT...' : 'TÌM KIẾM BẰNG GIỌNG NÓI'}
                </span>
              </div>
              <p
                className={`text-lg sm:text-2xl font-black mt-1 truncate ${
                  isListening
                    ? 'text-rose-200'
                    : interimTranscript
                    ? 'text-white'
                    : 'text-slate-100'
                }`}
              >
                {interimTranscript ||
                  (isListening
                    ? 'Hãy nói tên bài hát hoặc ca sĩ...'
                    : 'Chạm vào đây để nói tên bài hát (Không cần gõ phím)')}
              </p>
            </div>
          </div>
        )}

        {/* Real-time YouTube Search Auto-Complete Suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-car-card rounded-3xl border-2 border-car-border p-3 sm:p-4 shadow-xl">
            <h4 className="text-xs sm:text-sm font-bold text-car-textMuted uppercase tracking-wider mb-2 px-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-car-accent" />
              <span>Gợi ý hoàn tất</span>
            </h4>
            <div className="space-y-1.5">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleExecuteSearch(sug)}
                  className="w-full min-h-[52px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-left text-base sm:text-lg font-bold text-slate-100 flex items-center justify-between gap-3 active:scale-98 transition border border-slate-800"
                >
                  <span className="truncate">{sug}</span>
                  <ArrowUpRight className="w-5 h-5 text-car-accent shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Search History (Lịch sử tìm kiếm gần đây) */}
        {recentSearches.length > 0 && !query && (
          <div className="bg-car-card rounded-3xl border-2 border-car-border p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 px-1">
              <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-car-accent" />
                <span>Tìm kiếm gần đây</span>
              </h4>
              <button
                type="button"
                onClick={onClearRecentSearches}
                className="text-xs sm:text-sm font-bold text-car-textMuted hover:text-rose-400 flex items-center gap-1 px-2.5 py-1 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                <span>Xóa lịch sử</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {recentSearches.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-slate-900 border-2 border-slate-700 hover:border-slate-500 rounded-2xl pl-4 pr-1.5 py-1.5 shadow-sm active:scale-95 transition"
                >
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch(item)}
                    className="text-sm sm:text-base font-bold text-slate-100 hover:text-white"
                  >
                    {item}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecentSearch(item);
                    }}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending Car Keywords (Từ khóa hay nghe trên xe) */}
        {!query && (
          <div className="bg-car-card rounded-3xl border-2 border-car-border p-4 shadow-xl">
            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 mb-3 px-1">
              <Flame className="w-5 h-5 text-amber-400" />
              <span>Gợi ý nghe nhiều trên ô tô (Chạm để phát ngay)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {CAR_TRENDING_QUERIES.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExecuteSearch(item.text)}
                  className="h-14 sm:h-15 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-left border-2 border-slate-700 hover:border-car-accent flex items-center gap-3 active:scale-95 transition shadow-sm"
                >
                  <span className="text-xl shrink-0">{item.icon}</span>
                  <span className="text-sm sm:text-base font-bold text-slate-100 truncate">
                    {item.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Vietnamese Artists (Ca sĩ thịnh hành) */}
        {!query && (
          <div className="bg-car-card rounded-3xl border-2 border-car-border p-4 shadow-xl">
            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 mb-3 px-1">
              <User className="w-5 h-5 text-blue-400" />
              <span>Ca sĩ & Nghệ sĩ nổi bật</span>
            </h4>
            <div className="flex flex-wrap gap-2.5">
              {POPULAR_ARTISTS.map((artist, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExecuteSearch(`nhạc ${artist} hay nhất`)}
                  className="h-12 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 hover:border-blue-400 text-sm sm:text-base font-bold text-slate-200 hover:text-white flex items-center gap-2 active:scale-95 transition"
                >
                  <span>{artist}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
