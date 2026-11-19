import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { MusicSource, ViewMode } from '../types';

interface CarSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string, sourceOverride?: MusicSource) => void;
  initialQuery?: string;
  musicSource: MusicSource;
  onChangeMusicSource: (source: MusicSource) => void;
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
  { icon: '🎸', text: 'Acoustic nhạc Trịnh thư giãn' },
  { icon: '🎙️', text: 'Hieu TV podcast mới nhất' },
  { icon: '👶', text: 'Ca nhạc thiếu nhi vui nhộn cho bé' },
  { icon: '🎤', text: 'Nhạc karaoke hát trên ô tô' },
];

const POPULAR_ARTISTS = [
  'Sơn Tùng M-TP',
  'Đan Nguyên',
  'Quang Lập',
  'Như Quỳnh',
  'Hà Anh Tuấn',
  'Tuấn Hưng',
  'Mỹ Tâm',
  'Đen Vâu',
  'Bằng Kiều',
  'Vũ.',
];

export const CarSearchModal: React.FC<CarSearchModalProps> = ({
  isOpen,
  onClose,
  onSearch,
  initialQuery = '',
  musicSource,
  onChangeMusicSource: _onChangeMusicSource,
  recentSearches,
  onClearRecentSearches,
  onRemoveRecentSearch,
  artworkBackdrop,
  startVoice = false,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [modalSource, setModalSource] = useState<MusicSource>(musicSource);
  const modalSourceRef = useRef<MusicSource>(modalSource);
  modalSourceRef.current = modalSource;
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onSearchRef.current = onSearch;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setSpeechSupported(Boolean(SpeechRecognition));
    }
  }, []);

  const executeSearch = useCallback((searchVal: string) => {
    const clean = searchVal.trim();
    if (!clean || submittedRef.current) return;
    submittedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    onSearchRef.current(clean, modalSourceRef.current);
    onCloseRef.current();
  }, []);

  const startOrToggleVoice = useCallback(
    (forceStart = false) => {
      const SpeechRecognition =
        typeof window !== 'undefined'
          ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
          : null;

      if (!SpeechRecognition) {
        // Không dùng window.alert() vì WKWebView trên CarPlay (APTV / asCar) có thể treo luồng JS!
        setVoiceNotice(
          'WebView CarPlay chưa cấp quyền Web Speech — Hãy chạm ô nhập và bấm nút Micro (🎤) trên bàn phím iOS.'
        );
        inputRef.current?.focus();
        return;
      }

      if (isListening && !forceStart) {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }
        setIsListening(false);
        return;
      }

      try {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {}
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'vi-VN';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognitionRef.current = recognition;

        recognition.onstart = () => {
          setIsListening(true);
          setVoiceNotice(null);
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

          const activeText = (finalStr || interimStr).trim();
          setInterimTranscript(activeText);

          if (finalStr.trim()) {
            const cleanFinal = finalStr.trim();
            setQuery(cleanFinal);
            setIsListening(false);
            if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
            voiceTimerRef.current = window.setTimeout(() => {
              executeSearch(cleanFinal);
            }, 380);
          }
        };

        recognition.onerror = (ev: any) => {
          setIsListening(false);
          if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
            setVoiceNotice(
              'Chưa có quyền Micro trên WebView — Bạn có thể chạm ô nhập và dùng nút đọc chính tả (🎤) của bàn phím iPhone.'
            );
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
      } catch {
        setIsListening(false);
        setVoiceNotice(
          'Không thể bật Micro trực tiếp — Hãy chạm ô nhập để dùng Micro (🎤) trên bàn phím iPhone.'
        );
      }
    },
    [executeSearch, isListening]
  );

  // Mở / đóng modal (Lưu ý trên CarPlay VF5: KHÔNG tự auto-focus ô input để tránh bàn phím che kín màn hình 8 inch!)
  useEffect(() => {
    if (isOpen) {
      submittedRef.current = false;
      setQuery(initialQuery);
      setModalSource(musicSource);
      setInterimTranscript('');
      setVoiceNotice(null);
      setIsListening(false);

      if (startVoice) {
        startOrToggleVoice(true);
      }
    } else {
      if (voiceTimerRef.current) {
        window.clearTimeout(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      setIsListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialQuery, startVoice]);

  // Hỗ trợ phím Escape để đóng Modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // Gợi ý từ khóa tự động kèm AbortController chống race condition
  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm bài hát và video"
      onClick={onClose}
      className="car-app-shell fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-2xl overflow-hidden"
    >
      {/* Dynamic Ambient Color Backdrop */}
      {artworkBackdrop && (
        <div
          className="fixed inset-0 pointer-events-none opacity-30 blur-3xl scale-110"
          style={{
            backgroundImage: `url(${artworkBackdrop})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 max-w-5xl w-full h-full mx-auto flex flex-col min-h-0 px-3 sm:px-5 py-2.5 short:py-2 gap-2.5 short:gap-2 animate-ios-sheet-in"
      >
        {/* STICKY TOP BAR: Search Input + Quick Mic + Close Button (luôn cố định không trôi khi cuộn trên màn 8 inch) */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <form onSubmit={handleFormSubmit} className="flex-1 relative flex items-center min-w-0">
            <Search
              aria-hidden="true"
              className="w-5 h-5 absolute left-4 pointer-events-none text-white/60"
            />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chạm để nhập bài hát, ca sĩ..."
              className="w-full h-12 sm:h-13 short:h-11 text-white text-base sm:text-lg font-bold pl-11 pr-28 bg-white/[0.12] backdrop-blur-xl rounded-full border border-white/25 focus:border-white/55 focus:bg-white/[0.16] placeholder-white/45 focus:outline-none shadow-xl ios-spring-fast"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Xóa nội dung đang nhập"
                className="absolute right-[4.75rem] top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/65 hover:text-white rounded-full hover:bg-white/15 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 sm:h-10 short:h-8 px-4 rounded-full bg-white text-black hover:bg-white/90 font-extrabold text-sm flex items-center justify-center shadow-lg active:scale-95 ios-spring-fast"
            >
              Tìm
            </button>
          </form>

          {/* Nút Micro nhanh ngay cạnh thanh tìm kiếm */}
          <button
            type="button"
            onClick={() => startOrToggleVoice(false)}
            aria-label={isListening ? 'Dừng nhận diện giọng nói' : 'Tìm kiếm bằng giọng nói'}
            className={`h-12 w-12 sm:h-13 sm:w-13 short:h-11 short:w-11 rounded-full flex items-center justify-center shrink-0 border shadow-xl active:scale-90 ios-spring-fast ${
              isListening
                ? 'bg-rose-500 text-white border-rose-300 animate-pulse ring-4 ring-rose-500/40'
                : 'bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border-rose-400/45'
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Nút Đóng */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ tìm kiếm"
            className="h-12 w-12 sm:h-13 sm:w-13 short:h-11 short:w-11 rounded-full bg-white/[0.12] hover:bg-white/[0.22] border border-white/25 text-white flex items-center justify-center shrink-0 shadow-xl active:scale-90 ios-spring-fast"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* THANH CHỌN NGUỒN TÌM KIẾM: YOUTUBE <-> SOUNDCLOUD (1 chạm cực nhanh trên màn xe!) */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="inline-flex items-center p-1 rounded-full bg-white/10 border border-white/15">
            <button
              type="button"
              onClick={() => setModalSource('youtube')}
              className={`min-h-[34px] px-3.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition ${
                modalSource === 'youtube'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <span>▶ YouTube</span>
            </button>
            <button
              type="button"
              onClick={() => setModalSource('soundcloud')}
              className={`min-h-[34px] px-3.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition ${
                modalSource === 'soundcloud'
                  ? 'bg-[#ff5500] text-white shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <span>☁️ SoundCloud</span>
            </button>
          </div>
          <span className="text-[11px] font-bold text-white/55 truncate hidden xs:inline">
            {modalSource === 'soundcloud'
              ? 'Âm thanh Hi-Fi không quảng cáo • Vinahouse / Remix / Set DJ'
              : 'Kho Video & Nhạc YouTube đầy đủ nhất'}
          </span>
        </div>

        {/* SCROLLABLE BODY (tối ưu chiều cao cho màn hình ngang VF5 8 inch) */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 short:space-y-2 pb-3">
          {/* Trạng thái nhận diện giọng nói hoặc thông báo hướng dẫn CarPlay */}
          {(isListening || interimTranscript || voiceNotice || speechSupported) && !query && (
            <button
              type="button"
              onClick={() => startOrToggleVoice(false)}
              className={`w-full text-left p-3 sm:p-4 short:p-2.5 rounded-2xl border flex items-center gap-3.5 transition active:scale-[0.99] ${
                isListening
                  ? 'bg-rose-500/25 border-rose-400/60 shadow-lg'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/15'
              }`}
            >
              <div
                className={`w-12 h-12 short:w-10 short:h-10 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white'
                }`}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      isListening ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'
                    }`}
                  />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-white/65">
                    {isListening ? 'ĐANG NGHE TIẾNG VIỆT...' : 'TÌM NHANH BẰNG GIỌNG NÓI'}
                  </span>
                </div>
                <p className="text-sm sm:text-base font-extrabold text-white mt-0.5 line-clamp-2">
                  {voiceNotice ||
                    interimTranscript ||
                    (isListening
                      ? 'Hãy đọc tên bài hát hoặc ca sĩ...'
                      : 'Chạm vào đây rồi đọc tên bài hát (không cần gõ phím)')}
                </p>
              </div>
            </button>
          )}

          {/* REAL-TIME AUTO-COMPLETE SUGGESTIONS */}
          {suggestions.length > 0 && (
            <div className="p-3 bg-white/[0.08] rounded-2xl border border-white/15 shadow-xl animate-ios-browse-in">
              <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                <span>Gợi ý tìm kiếm</span>
              </h4>
              <div className="grid grid-cols-1 car:grid-cols-2 gap-1.5">
                {suggestions.map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => executeSearch(sug)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.16] border border-white/10 text-left text-sm sm:text-base font-bold text-white flex items-center justify-between gap-2 active:scale-[0.98] ios-spring-fast"
                  >
                    <span className="truncate">{sug}</span>
                    <ArrowUpRight className="w-4 h-4 text-white/60 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RECENT SEARCHES */}
          {recentSearches.length > 0 && !query && (
            <div className="p-3 sm:p-3.5 bg-white/[0.07] rounded-2xl border border-white/15 shadow-lg">
              <div className="flex items-center justify-between mb-2 px-1">
                <h4 className="text-xs sm:text-sm font-extrabold text-white/85 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-rose-400" />
                  <span>Tìm gần đây</span>
                </h4>
                <button
                  type="button"
                  onClick={onClearRecentSearches}
                  className="min-h-[36px] px-3 rounded-full text-xs font-bold text-white/65 hover:text-rose-300 hover:bg-white/10 flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa hết</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center rounded-full bg-white/[0.1] hover:bg-white/[0.18] border border-white/15 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => executeSearch(item)}
                      className="min-h-[42px] pl-4 pr-2.5 text-sm font-bold text-white active:scale-95 transition"
                    >
                      {item}
                    </button>
                    <button
                      type="button"
                      aria-label={`Xóa ${item} khỏi lịch sử tìm kiếm`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecentSearch(item);
                      }}
                      className="min-h-[42px] w-9 flex items-center justify-center text-white/55 hover:text-white hover:bg-white/15 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TRENDING CAR QUERIES */}
          {!query && (
            <div className="p-3 sm:p-3.5 bg-white/[0.07] rounded-2xl border border-white/15 shadow-lg">
              <h4 className="text-xs sm:text-sm font-extrabold text-white/85 uppercase tracking-wider flex items-center gap-1.5 mb-2.5 px-1">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Chủ đề nghe nhiều trên VF5</span>
              </h4>
              <div className="grid grid-cols-1 car:grid-cols-2 lg:grid-cols-3 gap-2">
                {CAR_TRENDING_QUERIES.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => executeSearch(item.text)}
                    className="min-h-[46px] px-3.5 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/12 text-left flex items-center gap-2.5 active:scale-95 ios-spring-fast"
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="text-sm font-bold text-white truncate">{item.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* POPULAR ARTISTS */}
          {!query && (
            <div className="p-3 sm:p-3.5 bg-white/[0.07] rounded-2xl border border-white/15 shadow-lg">
              <h4 className="text-xs sm:text-sm font-extrabold text-white/85 uppercase tracking-wider flex items-center gap-1.5 mb-2.5 px-1">
                <User className="w-4 h-4 text-rose-400" />
                <span>Ca sĩ nổi bật</span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {POPULAR_ARTISTS.map((artist, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => executeSearch(`nhạc ${artist} hay nhất`)}
                    className="min-h-[42px] px-4 rounded-full bg-white/[0.1] hover:bg-white/[0.2] border border-white/15 text-sm font-bold text-white flex items-center active:scale-95 ios-spring-fast"
                  >
                    {artist}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
