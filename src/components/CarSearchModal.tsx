import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Mic,
  MicOff,
  X,
  Clock,
  Sparkles,
  ArrowUpRight,
  Flame,
  Trash2,
  User,
} from 'lucide-react';
import { ViewMode } from '../types';

interface CarSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  initialQuery?: string;
  recentSearches: string[];
  onClearRecentSearches: () => void;
  onRemoveRecentSearch: (query: string) => void;
  variant?: ViewMode;
  startVoice?: boolean;
  artworkBackdrop?: string;
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
  variant = 'ytmusic',
  startVoice = false,
  artworkBackdrop,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAppleGlass = variant === 'ytmusic';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setInterimTranscript('');
      setIsListening(false);
      if (startVoice) {
        setTimeout(() => {
          toggleVoiceSearch();
        }, 200);
      } else {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 180);
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    }
  }, [isOpen, initialQuery, startVoice]);

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
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex flex-col p-3 sm:p-6 overflow-y-auto no-scrollbar ${
        isAppleGlass
          ? 'bg-black/65 backdrop-blur-2xl'
          : 'bg-black/90 backdrop-blur-md'
      }`}
    >
      {/* Dynamic Ambient Color Backdrop for Apple Music Search */}
      {isAppleGlass && artworkBackdrop && (
        <div
          className="fixed inset-0 pointer-events-none opacity-35 blur-[100px] scale-125"
          style={{
            backgroundImage: `url(${artworkBackdrop})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* Animated Spring Sheet Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 max-w-4xl w-full mx-auto flex flex-col gap-4 my-auto py-2 ${
          isAppleGlass ? 'animate-ios-sheet-in' : ''
        }`}
      >
        {/* Top Bar with Liquid Glass Input & Close */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleFormSubmit} className="flex-1 relative flex items-center">
            <Search
              className={`w-6 h-6 absolute left-4 pointer-events-none ${
                isAppleGlass ? 'text-white/60' : 'text-car-accent'
              }`}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nhập tên bài hát, ca sĩ hoặc bấm Micro..."
              className={`w-full h-14 sm:h-16 text-white text-base sm:text-xl font-bold pl-12 pr-24 focus:outline-none ios-spring-fast ${
                isAppleGlass
                  ? 'bg-white/[0.1] backdrop-blur-2xl rounded-full border border-white/20 focus:border-white/45 focus:bg-white/[0.14] placeholder-white/45 shadow-2xl'
                  : 'bg-car-card rounded-2xl border-2 border-car-border focus:border-car-accent shadow-2xl'
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-16 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-white/60 hover:text-white rounded-full hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              className={`absolute right-2 top-1/2 -translate-y-1/2 h-10 sm:h-12 px-4 sm:px-5 font-extrabold text-sm flex items-center gap-1 active:scale-95 ios-spring-fast ${
                isAppleGlass
                  ? 'rounded-full bg-white text-black hover:bg-white/90 shadow-lg'
                  : 'rounded-xl bg-car-accent hover:bg-car-accentHover text-white shadow-md'
              }`}
            >
              Tìm
            </button>
          </form>

          {/* Liquid Glass Close Button */}
          <button
            onClick={onClose}
            className={`h-14 w-14 sm:h-16 sm:w-16 flex items-center justify-center active:scale-90 shrink-0 ios-spring-fast ${
              isAppleGlass
                ? 'rounded-full bg-white/[0.1] hover:bg-white/[0.2] backdrop-blur-2xl border border-white/20 text-white shadow-xl'
                : 'rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-slate-200 shadow-lg'
            }`}
            title="Đóng tìm kiếm"
          >
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* VOICE SEARCH HERO SECTION */}
        {speechSupported && (
          <div
            onClick={toggleVoiceSearch}
            className={`w-full p-4 sm:p-5 flex items-center gap-4 cursor-pointer active:scale-[0.98] ios-spring-fast ${
              isAppleGlass
                ? `rounded-3xl backdrop-blur-2xl border shadow-xl ${
                    isListening
                      ? 'bg-rose-500/25 border-rose-400/60 shadow-rose-500/20'
                      : 'bg-white/[0.08] hover:bg-white/[0.12] border-white/15'
                  }`
                : `rounded-3xl border-2 shadow-xl ${
                    isListening
                      ? 'bg-rose-950/60 border-rose-500 ring-2 ring-rose-500/50'
                      : 'bg-gradient-to-r from-blue-950/50 to-car-card border-blue-500/40 hover:border-blue-400'
                  }`
            }`}
          >
            <div
              className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center shrink-0 shadow-2xl ios-spring-fast ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse ring-4 ring-rose-400/50'
                  : isAppleGlass
                  ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white border border-white/25'
                  : 'bg-car-accent text-white'
              }`}
            >
              {isListening ? (
                <MicOff className="w-8 h-8" />
              ) : (
                <Mic className="w-8 h-8" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isListening ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'
                  }`}
                ></span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-white/60">
                  {isListening ? 'ĐANG LẮNG NGHE TIẾNG VIỆT...' : 'TÌM KIẾM BẰNG GIỌNG NÓI'}
                </span>
              </div>
              <p className="text-lg sm:text-xl font-extrabold text-white mt-1 truncate">
                {interimTranscript ||
                  (isListening
                    ? 'Hãy nói tên bài hát hoặc ca sĩ...'
                    : 'Chạm để nói tên bài hát (Không cần gõ)')}
              </p>
            </div>
          </div>
        )}

        {/* REAL-TIME AUTO-COMPLETE SUGGESTIONS */}
        {suggestions.length > 0 && (
          <div
            className={`p-3 sm:p-4 shadow-xl ${
              isAppleGlass
                ? 'bg-white/[0.07] backdrop-blur-2xl rounded-3xl border border-white/15 animate-ios-browse-in'
                : 'bg-car-card rounded-3xl border-2 border-car-border'
            }`}
          >
            <h4 className="text-xs sm:text-sm font-bold text-white/60 uppercase tracking-wider mb-2 px-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <span>Gợi ý tìm kiếm</span>
            </h4>
            <div className="space-y-1.5">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleExecuteSearch(sug)}
                  className={`w-full min-h-[48px] px-4 py-2.5 text-left text-base font-bold text-white flex items-center justify-between gap-3 active:scale-[0.98] ios-spring-fast ${
                    isAppleGlass
                      ? 'rounded-2xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10'
                      : 'rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span className="truncate">{sug}</span>
                  <ArrowUpRight className="w-5 h-5 text-white/60 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* RECENT SEARCHES */}
        {recentSearches.length > 0 && !query && (
          <div
            className={`p-4 shadow-xl ${
              isAppleGlass
                ? 'bg-white/[0.07] backdrop-blur-2xl rounded-3xl border border-white/15'
                : 'bg-car-card rounded-3xl border-2 border-car-border'
            }`}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <Clock className={`w-4 h-4 ${isAppleGlass ? 'text-rose-400' : 'text-car-accent'}`} />
                <span>Tìm kiếm gần đây</span>
              </h4>
              <button
                type="button"
                onClick={onClearRecentSearches}
                className="text-xs sm:text-sm font-bold text-white/60 hover:text-rose-400 flex items-center gap-1 px-2.5 py-1 rounded-full hover:bg-white/10 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lịch sử</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-1 rounded-full pl-4 pr-1.5 py-1.5 active:scale-95 ios-spring-fast ${
                    isAppleGlass
                      ? 'bg-white/[0.1] hover:bg-white/[0.18] border border-white/15'
                      : 'bg-slate-900 border-2 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleExecuteSearch(item)}
                    className="text-sm font-bold text-white"
                  >
                    {item}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecentSearch(item);
                    }}
                    className="p-1 text-white/50 hover:text-white rounded-full"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TRENDING CAR QUERIES */}
        {!query && (
          <div
            className={`p-4 shadow-xl ${
              isAppleGlass
                ? 'bg-white/[0.07] backdrop-blur-2xl rounded-3xl border border-white/15'
                : 'bg-car-card rounded-3xl border-2 border-car-border'
            }`}
          >
            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 mb-3 px-1">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Gợi ý nghe nhiều trên ô tô</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {CAR_TRENDING_QUERIES.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExecuteSearch(item.text)}
                  className={`h-13 px-4 text-left flex items-center gap-3 active:scale-95 ios-spring-fast ${
                    isAppleGlass
                      ? 'rounded-2xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/12'
                      : 'rounded-2xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 hover:border-car-accent'
                  }`}
                >
                  <span className="text-lg shrink-0">{item.icon}</span>
                  <span className="text-sm font-bold text-white truncate">{item.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* POPULAR ARTISTS */}
        {!query && (
          <div
            className={`p-4 shadow-xl ${
              isAppleGlass
                ? 'bg-white/[0.07] backdrop-blur-2xl rounded-3xl border border-white/15'
                : 'bg-car-card rounded-3xl border-2 border-car-border'
            }`}
          >
            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 mb-3 px-1">
              <User className="w-4 h-4 text-rose-400" />
              <span>Ca sĩ & Nghệ sĩ nổi bật</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {POPULAR_ARTISTS.map((artist, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExecuteSearch(`nhạc ${artist} hay nhất`)}
                  className={`h-11 px-4 text-sm font-bold flex items-center gap-2 active:scale-95 ios-spring-fast ${
                    isAppleGlass
                      ? 'rounded-full bg-white/[0.1] hover:bg-white/[0.2] border border-white/15 text-white'
                      : 'rounded-xl bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 hover:border-blue-400 text-slate-200'
                  }`}
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
