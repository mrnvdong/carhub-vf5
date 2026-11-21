import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  NewsArticleDetail,
  NewsCategoryId,
  NewsItem,
  NewsTtsProviderInfo,
  NewsVoice,
} from '../types';
import {
  buildNewsAudioProxyUrl,
  buildNewsTtsUrl,
  fetchNewsArticle,
  fetchNewsFeed,
  fetchNewsTtsInfo,
  getVoiceShortName,
  splitVietnameseTtsChunks,
} from '../services/news';

const SPEED_OPTIONS = [0.85, 1, 1.25, 1.5, 1.75];

export interface NewsAudioController {
  audioRef: React.RefObject<HTMLAudioElement>;
  // Danh mục & Tìm kiếm
  category: NewsCategoryId;
  setCategory: (cat: NewsCategoryId) => void;
  searchQuery: string;
  submitSearch: (q: string) => void;
  clearSearch: () => void;
  // Danh sách tin
  items: NewsItem[];
  isLoadingFeed: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  feedError: string | null;
  refreshFeed: () => void;
  loadMore: () => void;
  readIds: Set<string>;
  audioBadgeMap: Record<string, 'studio' | 'text-only'>;
  // Bài báo hiện tại
  activeItem: NewsItem | null;
  activeArticle: NewsArticleDetail | null;
  isLoadingArticle: boolean;
  articleError: string | null;
  selectArticle: (item: NewsItem, autoPlay?: boolean) => Promise<void>;
  playLatestAudioBulletin: () => Promise<void>;
  // Điều khiển phát Audio
  isPlaying: boolean;
  isBuffering: boolean;
  isTtsMode: boolean;
  isTtsSpeaking: boolean;
  ttsChunkIndex: number;
  ttsTotalChunks: number;
  ttsProviderInfo: NewsTtsProviderInfo | null;
  ttsVoiceId: string;
  selectTtsVoice: (voiceId: string) => void;
  audioError: string | null;
  currentTime: number;
  duration: number;
  preferredVoiceId: number;
  activeVoice: NewsVoice | null;
  selectVoice: (voiceId: number) => void;
  cycleVoice: () => void;
  playbackRate: number;
  cyclePlaybackRate: () => void;
  autoPlayNext: boolean;
  toggleAutoPlayNext: () => void;
  togglePlay: () => void;
  pauseNews: () => void;
  seekTo: (sec: number) => void;
  seekRelative: (deltaSec: number) => void;
  playNextArticle: (skipWithoutAudio?: boolean) => Promise<void>;
  playPrevArticle: () => Promise<void>;
  hasNextArticle: boolean;
  hasPrevArticle: boolean;
  toggleBrowserTts: () => void;
}

export function useNewsAudio(
  shouldActivate: boolean,
  onBeforePlayAudio?: () => void,
  onNotifyToast?: (msg: string) => void
): NewsAudioController {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasActivated, setHasActivated] = useState<boolean>(shouldActivate);

  useEffect(() => {
    if (shouldActivate && !hasActivated) {
      setHasActivated(true);
    }
  }, [shouldActivate, hasActivated]);

  const [category, setCategoryState] = useState<NewsCategoryId>(() => {
    try {
      const saved = localStorage.getItem('carhub_news_cat') as NewsCategoryId | null;
      return saved || 'hot';
    } catch {
      return 'hot';
    }
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedReloadNonce, setFeedReloadNonce] = useState<number>(0);

  const [readIdsList, setReadIdsList] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('carhub_news_read_ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
    } catch {
      return [];
    }
  });
  const readIds = useMemo(() => new Set(readIdsList), [readIdsList]);

  const [audioBadgeMap, setAudioBadgeMap] = useState<Record<string, 'studio' | 'text-only'>>({});

  const [activeItem, setActiveItem] = useState<NewsItem | null>(null);
  const [activeArticle, setActiveArticle] = useState<NewsArticleDetail | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState<boolean>(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  const [preferredVoiceId, setPreferredVoiceId] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('carhub_news_voice_id'));
      return Number.isFinite(saved) && saved > 0 ? saved : 2; // Mặc định: Nữ miền Bắc
    } catch {
      return 2;
    }
  });
  const preferredVoiceIdRef = useRef<number>(preferredVoiceId);
  preferredVoiceIdRef.current = preferredVoiceId;

  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('carhub_news_rate'));
      return SPEED_OPTIONS.includes(saved) ? saved : 1;
    } catch {
      return 1;
    }
  });
  const playbackRateRef = useRef<number>(playbackRate);
  playbackRateRef.current = playbackRate;

  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('carhub_news_autoplay');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const autoPlayNextRef = useRef<boolean>(autoPlayNext);
  autoPlayNextRef.current = autoPlayNext;

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isTtsMode, setIsTtsMode] = useState<boolean>(false);
  const [isSpeechFallbackSpeaking, setIsSpeechFallbackSpeaking] = useState<boolean>(false);
  const [ttsChunkIndex, setTtsChunkIndex] = useState<number>(0);
  const [ttsTotalChunks, setTtsTotalChunks] = useState<number>(0);
  const [ttsProviderInfo, setTtsProviderInfo] = useState<NewsTtsProviderInfo | null>(null);
  const ttsProviderInfoRef = useRef<NewsTtsProviderInfo | null>(null);
  ttsProviderInfoRef.current = ttsProviderInfo;

  const [ttsVoiceId, setTtsVoiceId] = useState<string>(() => {
    try {
      return localStorage.getItem('carhub_news_tts_voice') || '';
    } catch {
      return '';
    }
  });
  const ttsVoiceIdRef = useRef<string>(ttsVoiceId);
  ttsVoiceIdRef.current = ttsVoiceId;

  const [audioError, setAudioError] = useState<string | null>(null);

  // Nạp thông tin động cơ TTS (Azure Neural / FPT.AI / VieNeu / Google Dự phòng) 1 lần khi mở Báo Audio
  useEffect(() => {
    if (!hasActivated) return;
    let cancelled = false;
    fetchNewsTtsInfo().then((info) => {
      if (cancelled) return;
      setTtsProviderInfo(info);
      setTtsVoiceId((prev) => {
        if (prev && info.voices.some((v) => v.id === prev)) return prev;
        return info.defaultVoice;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [hasActivated]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const itemsRef = useRef<NewsItem[]>(items);
  itemsRef.current = items;
  const activeItemRef = useRef<NewsItem | null>(activeItem);
  activeItemRef.current = activeItem;
  const activeArticleRef = useRef<NewsArticleDetail | null>(activeArticle);
  activeArticleRef.current = activeArticle;

  const loadTokenRef = useRef<number>(0);
  const currentStreamingUrlRef = useRef<string>('');
  const usedProxyFallbackRef = useRef<boolean>(false);
  const pendingSeekTimeRef = useRef<number | null>(null);

  // State ref cho hàng đợi đọc giọng máy MP3 (Server TTS qua /api/news?action=tts + dự phòng Web Speech chia nhỏ câu)
  const isTtsModeRef = useRef<boolean>(false);
  const ttsChunksRef = useRef<string[]>([]);
  const ttsChunkIdxRef = useRef<number>(0);
  const speechSessionRef = useRef<number>(0);
  const speechFallbackActiveRef = useRef<boolean>(false);

  const onBeforePlayRef = useRef(onBeforePlayAudio);
  onBeforePlayRef.current = onBeforePlayAudio;
  const onNotifyToastRef = useRef(onNotifyToast);
  onNotifyToastRef.current = onNotifyToast;

  const markAsRead = useCallback((id: string) => {
    if (!id) return;
    setReadIdsList((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, 200);
      try {
        localStorage.setItem('carhub_news_read_ids', JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  const stopSpeechFallbackOnly = useCallback(() => {
    speechSessionRef.current += 1;
    speechFallbackActiveRef.current = false;
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
    setIsSpeechFallbackSpeaking(false);
  }, []);

  const stopBrowserTts = useCallback(() => {
    stopSpeechFallbackOnly();
    isTtsModeRef.current = false;
    ttsChunksRef.current = [];
    ttsChunkIdxRef.current = 0;
    setIsTtsMode(false);
    setTtsChunkIndex(0);
    setTtsTotalChunks(0);
  }, [stopSpeechFallbackOnly]);

  // Phát 1 đoạn MP3 tiếng Việt qua chính thẻ <audio> duy nhất (tương thích 100% iOS Safari / CarPlay WKWebView!)
  const playServerTtsChunk = useCallback(
    (chunkIdx: number) => {
      const audio = audioRef.current;
      const chunks = ttsChunksRef.current;
      if (!audio || !chunks.length || chunkIdx < 0 || chunkIdx >= chunks.length) {
        return;
      }

      stopSpeechFallbackOnly();
      isTtsModeRef.current = true;
      ttsChunkIdxRef.current = chunkIdx;
      currentStreamingUrlRef.current = '';
      usedProxyFallbackRef.current = false;
      pendingSeekTimeRef.current = null;

      setIsTtsMode(true);
      setTtsChunkIndex(chunkIdx);
      setTtsTotalChunks(chunks.length);
      setAudioError(null);
      setIsBuffering(true);

      const activeTtsVoice =
        ttsVoiceIdRef.current || ttsProviderInfoRef.current?.defaultVoice || '';
      const url = buildNewsTtsUrl(chunks[chunkIdx], activeTtsVoice);
      onBeforePlayRef.current?.();

      audio.src = url;
      audio.playbackRate = playbackRateRef.current;
      audio.load();
      audio.play().catch((err) => {
        console.warn('[NewsTTS] audio.play() rejected:', err);
        setIsBuffering(false);
        setIsPlaying(false);
        setAudioError('Chạm lại nút Phát để mở tiếng giọng đọc');
      });

      // Nạp trước đoạn tiếp theo vào cache trình duyệt & Cloudflare Edge để nối câu không bị khựng!
      if (chunkIdx + 1 < chunks.length) {
        fetch(buildNewsTtsUrl(chunks[chunkIdx + 1], activeTtsVoice)).catch(() => {});
      }
    },
    [stopSpeechFallbackOnly]
  );

  const selectTtsVoice = useCallback(
    (voiceId: string) => {
      setTtsVoiceId(voiceId);
      ttsVoiceIdRef.current = voiceId;
      try {
        localStorage.setItem('carhub_news_tts_voice', voiceId);
      } catch {
        // ignore
      }
      const label =
        ttsProviderInfoRef.current?.voices.find((v) => v.id === voiceId)?.label || voiceId;
      onNotifyToastRef.current?.(`🎙️ Giọng đọc AI: ${label}`);
      if (isTtsModeRef.current && ttsChunksRef.current.length > 0) {
        playServerTtsChunk(ttsChunkIdxRef.current);
      }
    },
    [playServerTtsChunk]
  );

  // Dự phòng cuối cùng bằng Web Speech API (chia nhỏ câu <=175 ký tự + delay 80ms sau cancel để không bị Chrome/Safari nuốt!)
  const startWebSpeechFallback = useCallback(
    (startIdx: number, onAllDone?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setAudioError('Thiết bị không hỗ trợ phát giọng đọc máy');
        return;
      }
      const chunks = ttsChunksRef.current;
      if (!chunks.length || startIdx >= chunks.length) return;

      // Dừng ngay Nhạc & TV trước khi đọc Web Speech dự phòng (tránh chồng tiếng!)
      onBeforePlayRef.current?.();

      const sessionId = ++speechSessionRef.current;
      speechFallbackActiveRef.current = true;
      setAudioError(null);
      setIsBuffering(false);
      setIsPlaying(false);
      setIsSpeechFallbackSpeaking(true);

      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const speakIdx = (idx: number) => {
        if (speechSessionRef.current !== sessionId || !speechFallbackActiveRef.current) return;
        if (idx >= chunks.length) {
          speechFallbackActiveRef.current = false;
          setIsSpeechFallbackSpeaking(false);
          onAllDone?.();
          return;
        }

        ttsChunkIdxRef.current = idx;
        setTtsChunkIndex(idx);

        const utter = new SpeechSynthesisUtterance(chunks[idx]);
        utter.lang = 'vi-VN';
        utter.rate = Math.min(1.5, Math.max(0.85, playbackRateRef.current));
        try {
          const viVoice = window.speechSynthesis
            .getVoices()
            .find((v) => v.lang.toLowerCase().startsWith('vi'));
          if (viVoice) utter.voice = viVoice;
        } catch {
          // ignore
        }

        utter.onend = () => {
          if (speechSessionRef.current !== sessionId) return;
          speakIdx(idx + 1);
        };
        utter.onerror = () => {
          if (speechSessionRef.current !== sessionId) return;
          speechFallbackActiveRef.current = false;
          setIsSpeechFallbackSpeaking(false);
          setAudioError('Không phát được giọng đọc máy trên thiết bị này');
        };

        window.speechSynthesis.speak(utter);
      };

      // Chờ 80ms sau cancel() để tránh lỗi Chrome/Safari hủy luôn câu vừa nạp!
      window.setTimeout(() => speakIdx(startIdx), 80);
    },
    []
  );

  // Chọn giọng khớp preferredVoiceId (hoặc giọng đầu tiên nếu là bản tin /audio.epi)
  const pickVoiceFromList = useCallback(
    (voices: NewsVoice[], prefId: number): NewsVoice | null => {
      if (!voices || voices.length === 0) return null;
      return voices.find((v) => v.id === prefId) || voices[0];
    },
    []
  );

  const activeVoice = useMemo(() => {
    if (!activeArticle?.voices?.length) return null;
    return pickVoiceFromList(activeArticle.voices, preferredVoiceId);
  }, [activeArticle, preferredVoiceId, pickVoiceFromList]);

  // Nạp file .m4a vào thẻ <audio> duy nhất
  const loadAudioStream = useCallback(
    (streamingUrl: string, shouldPlay: boolean, seekTimeSec?: number | null) => {
      const audio = audioRef.current;
      if (!audio) return;

      stopBrowserTts();
      currentStreamingUrlRef.current = streamingUrl;
      usedProxyFallbackRef.current = false;
      pendingSeekTimeRef.current =
        typeof seekTimeSec === 'number' && seekTimeSec > 0 ? seekTimeSec : null;

      setAudioError(null);
      setIsBuffering(shouldPlay);
      if (!seekTimeSec) {
        setCurrentTime(0);
        setDuration(0);
      }

      audio.src = streamingUrl;
      audio.playbackRate = playbackRateRef.current;
      audio.load();

      if (shouldPlay) {
        onBeforePlayRef.current?.();
        audio.play().catch((err) => {
          console.warn('[NewsAudio] play() blocked or failed:', err);
          setIsBuffering(false);
          setIsPlaying(false);
        });
      }
    },
    [stopBrowserTts]
  );

  const pauseNews = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
    }
    stopSpeechFallbackOnly();
    setIsPlaying(false);
    setIsBuffering(false);
  }, [stopSpeechFallbackOnly]);

  // Tải feed tin tức mỗi khi đổi danh mục / tìm kiếm / làm mới
  useEffect(() => {
    if (!hasActivated) return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingFeed(true);
      setFeedError(null);
      try {
        const res = await fetchNewsFeed(category, 1, searchQuery);
        if (cancelled) return;
        setItems(res.items || []);
        setPage(1);
        setHasMore(Boolean(res.hasMore));
        // Đánh dấu ngay các bài /audio.epi chắc chắn có audio studio
        if (res.items?.length) {
          setAudioBadgeMap((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const it of res.items) {
              if (it.isAudioPost && next[it.id] !== 'studio') {
                next[it.id] = 'studio';
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setFeedError(err?.message || 'Không tải được tin tức từ Báo Mới');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFeed(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [hasActivated, category, searchQuery, feedReloadNonce]);

  const setCategory = useCallback((cat: NewsCategoryId) => {
    setSearchQuery('');
    setCategoryState(cat);
    try {
      localStorage.setItem('carhub_news_cat', cat);
    } catch {
      // ignore
    }
  }, []);

  const submitSearch = useCallback((q: string) => {
    setSearchQuery(q.trim());
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const refreshFeed = useCallback(() => {
    setFeedReloadNonce((n) => n + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || searchQuery) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await fetchNewsFeed(category, nextPage, '');
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const merged = [...prev];
        for (const it of res.items || []) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            merged.push(it);
          }
        }
        return merged;
      });
      setPage(nextPage);
      setHasMore(Boolean(res.hasMore));
    } catch (err: any) {
      onNotifyToastRef.current?.(err?.message || 'Không tải thêm được tin');
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, searchQuery, page, category]);

  // Mở một bài báo (và tự động phát file Audio .m4a nếu có)
  const selectArticle = useCallback(
    async (item: NewsItem, autoPlay = true) => {
      const token = ++loadTokenRef.current;
      stopBrowserTts();
      setActiveItem(item);
      setArticleError(null);
      setAudioError(null);
      setIsLoadingArticle(true);
      markAsRead(item.id);

      // Tạm dừng bài cũ khi đang nạp bài mới
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
      }
      setIsPlaying(false);
      setIsBuffering(autoPlay);

      try {
        const detail = await fetchNewsArticle(item.url);
        if (loadTokenRef.current !== token) return;

        setActiveArticle(detail);
        setIsLoadingArticle(false);

        const hasStudioAudio = detail.voices.length > 0;
        setAudioBadgeMap((prev) => ({
          ...prev,
          [item.id]: hasStudioAudio ? 'studio' : 'text-only',
        }));

        if (hasStudioAudio) {
          const voice = pickVoiceFromList(detail.voices, preferredVoiceIdRef.current);
          if (voice) {
            loadAudioStream(voice.streamingUrl, autoPlay, 0);
          }
        } else {
          currentStreamingUrlRef.current = '';
          if (audio) {
            audio.removeAttribute('src');
            audio.load();
          }
          setCurrentTime(0);
          setDuration(0);
          setIsBuffering(false);
          setIsPlaying(false);
          if (autoPlay) {
            onNotifyToastRef.current?.(
              '📰 Bài này Báo Mới chưa tạo file Audio — bấm "Đọc giọng máy" hoặc đọc trực tiếp'
            );
          }
        }
      } catch (err: any) {
        if (loadTokenRef.current !== token) return;
        setIsLoadingArticle(false);
        setIsBuffering(false);
        setArticleError(err?.message || 'Không tải được nội dung bài báo');
      }
    },
    [stopBrowserTts, markAsRead, pickVoiceFromList, loadAudioStream]
  );

  // Phát bài kế tiếp (tùy chọn tự bỏ qua bài chưa có audio studio khi đang chạy rảnh tay trên xe!)
  const playNextArticle = useCallback(
    async (skipWithoutAudio = false) => {
      const list = itemsRef.current;
      if (!list.length) return;

      const curId = activeItemRef.current?.id;
      const curIdx = curId ? list.findIndex((x) => x.id === curId) : -1;
      let startIdx = curIdx >= 0 ? curIdx + 1 : 0;

      if (!skipWithoutAudio) {
        if (startIdx >= list.length) {
          onNotifyToastRef.current?.('📻 Đã hết danh sách tin hiện tại');
          return;
        }
        await selectArticle(list[startIdx], true);
        return;
      }

      // Quét tối đa 6 bài kế tiếp để tìm bài có file Audio .m4a (rảnh tay 100% khi lái xe VF5!)
      const token = ++loadTokenRef.current;
      stopBrowserTts();
      setIsLoadingArticle(true);
      setIsBuffering(true);
      setArticleError(null);

      const maxProbe = Math.min(list.length, startIdx + 6);
      for (let i = startIdx; i < maxProbe; i++) {
        if (loadTokenRef.current !== token) return;
        const candidate = list[i];
        try {
          const detail = await fetchNewsArticle(candidate.url);
          if (loadTokenRef.current !== token) return;

          setAudioBadgeMap((prev) => ({
            ...prev,
            [candidate.id]: detail.voices.length > 0 ? 'studio' : 'text-only',
          }));

          if (detail.voices.length > 0) {
            setActiveItem(candidate);
            setActiveArticle(detail);
            setIsLoadingArticle(false);
            markAsRead(candidate.id);
            const voice = pickVoiceFromList(detail.voices, preferredVoiceIdRef.current);
            if (voice) {
              loadAudioStream(voice.streamingUrl, true, 0);
            }
            onNotifyToastRef.current?.(`🎙️ Tiếp theo: ${candidate.title}`);
            return;
          }
        } catch {
          // Bỏ qua bài lỗi mạng và thử bài kế tiếp
        }
      }

      if (loadTokenRef.current === token) {
        setIsLoadingArticle(false);
        setIsBuffering(false);
        onNotifyToastRef.current?.(
          '📰 Các bài kế tiếp chưa có file Audio — chuyển sang mục "🎙️ Bản tin Audio" để nghe liên tục!'
        );
      }
    },
    [selectArticle, stopBrowserTts, markAsRead, pickVoiceFromList, loadAudioStream]
  );

  const playPrevArticle = useCallback(async () => {
    const list = itemsRef.current;
    if (!list.length) return;
    const curId = activeItemRef.current?.id;
    const curIdx = curId ? list.findIndex((x) => x.id === curId) : -1;
    if (curIdx > 0) {
      await selectArticle(list[curIdx - 1], true);
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  }, [selectArticle]);

  // 1 chạm "Phát bản tin ngay": tự chọn bài đầu tiên có Audio .m4a trong danh sách hiện tại
  const playLatestAudioBulletin = useCallback(async () => {
    const list = itemsRef.current;
    if (!list.length) {
      onNotifyToastRef.current?.('Đang tải tin từ Báo Mới...');
      return;
    }
    const token = ++loadTokenRef.current;
    stopBrowserTts();
    setIsLoadingArticle(true);
    setIsBuffering(true);
    setArticleError(null);

    const maxProbe = Math.min(list.length, 8);
    for (let i = 0; i < maxProbe; i++) {
      if (loadTokenRef.current !== token) return;
      const candidate = list[i];
      try {
        const detail = await fetchNewsArticle(candidate.url);
        if (loadTokenRef.current !== token) return;

        setAudioBadgeMap((prev) => ({
          ...prev,
          [candidate.id]: detail.voices.length > 0 ? 'studio' : 'text-only',
        }));

        if (detail.voices.length > 0) {
          setActiveItem(candidate);
          setActiveArticle(detail);
          setIsLoadingArticle(false);
          markAsRead(candidate.id);
          const voice = pickVoiceFromList(detail.voices, preferredVoiceIdRef.current);
          if (voice) {
            loadAudioStream(voice.streamingUrl, true, 0);
          }
          onNotifyToastRef.current?.(`🎙️ Đang đọc: ${candidate.title}`);
          return;
        }
      } catch {
        // Thử bài tiếp theo
      }
    }

    if (loadTokenRef.current === token) {
      setIsLoadingArticle(false);
      setIsBuffering(false);
      // Fallback: mở bài đầu tiên để đọc
      await selectArticle(list[0], false);
    }
  }, [stopBrowserTts, markAsRead, pickVoiceFromList, loadAudioStream, selectArticle]);

  // Đổi giọng đọc giữ nguyên thời điểm đang nghe!
  const selectVoice = useCallback(
    (voiceId: number) => {
      setPreferredVoiceId(voiceId);
      try {
        localStorage.setItem('carhub_news_voice_id', String(voiceId));
      } catch {
        // ignore
      }

      const detail = activeArticleRef.current;
      if (!detail?.voices?.length) return;
      const matched = detail.voices.find((v) => v.id === voiceId);
      if (!matched) return;

      const audio = audioRef.current;
      const resumeAt = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const wasPlaying = audio ? !audio.paused : false;
      loadAudioStream(matched.streamingUrl, wasPlaying || true, resumeAt);
      onNotifyToastRef.current?.(`🎙️ Giọng đọc: ${matched.name}`);
    },
    [loadAudioStream]
  );

  const cycleVoice = useCallback(() => {
    const voices = activeArticleRef.current?.voices;
    // Nếu bài hiện tại dùng Neural TTS (Azure / FPT.AI / VieNeu) -> xoay vòng giọng Neural ngay!
    if (
      (!voices || voices.length === 0) &&
      ttsProviderInfoRef.current &&
      ttsProviderInfoRef.current.voices.length > 1
    ) {
      const ttsVoices = ttsProviderInfoRef.current.voices;
      const curId = ttsVoiceIdRef.current || ttsProviderInfoRef.current.defaultVoice;
      const idx = ttsVoices.findIndex((v) => v.id === curId);
      const next = ttsVoices[(idx + 1) % ttsVoices.length];
      selectTtsVoice(next.id);
      return;
    }

    if (!voices || voices.length <= 1) {
      // Nếu chưa mở bài nào hoặc chỉ có 1 giọng -> vẫn cho xoay vòng preferredVoiceId [2, 1, 6, 7]
      const defaults = [2, 1, 6, 7];
      const idx = defaults.indexOf(preferredVoiceIdRef.current);
      const nextId = defaults[(idx + 1) % defaults.length];
      setPreferredVoiceId(nextId);
      try {
        localStorage.setItem('carhub_news_voice_id', String(nextId));
      } catch {
        // ignore
      }
      onNotifyToastRef.current?.(`🎙️ Giọng ưu tiên: ${getVoiceShortName(nextId)}`);
      return;
    }

    const cur = pickVoiceFromList(voices, preferredVoiceIdRef.current);
    const curIdx = cur ? voices.findIndex((v) => v.id === cur.id) : 0;
    const nextVoice = voices[(curIdx + 1) % voices.length];
    selectVoice(nextVoice.id);
  }, [pickVoiceFromList, selectVoice, selectTtsVoice]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev);
      const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
      if (audioRef.current) {
        audioRef.current.playbackRate = next;
      }
      try {
        localStorage.setItem('carhub_news_rate', String(next));
      } catch {
        // ignore
      }
      onNotifyToastRef.current?.(`⏩ Tốc độ đọc báo: ${next}x`);
      return next;
    });
  }, []);

  const toggleAutoPlayNext = useCallback(() => {
    setAutoPlayNext((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('carhub_news_autoplay', String(next));
      } catch {
        // ignore
      }
      onNotifyToastRef.current?.(
        next ? '📻 Tự động đọc bài tiếp theo: BẬT' : '⏹ Tự động đọc bài tiếp theo: TẮT'
      );
      return next;
    });
  }, []);

  // Đọc bằng giọng máy MP3 tiếng Việt (Server TTS chia câu nối liền qua thẻ <audio> -> chạy mượt 100% cả trên iOS CarPlay!)
  const toggleBrowserTts = useCallback(() => {
    const audio = audioRef.current;

    // Nếu đang chạy nhánh dự phòng Web Speech -> bấm để dừng
    if (speechFallbackActiveRef.current) {
      stopSpeechFallbackOnly();
      return;
    }

    // Nếu bài hiện tại đã ở chế độ đọc giọng máy MP3 -> Tạm dừng / Phát tiếp ngay tại đoạn đang đọc!
    if (isTtsModeRef.current && ttsChunksRef.current.length > 0 && audio) {
      if (!audio.paused) {
        audio.pause();
        setIsPlaying(false);
        return;
      }
      if (audio.src) {
        onBeforePlayRef.current?.();
        audio.playbackRate = playbackRateRef.current;
        audio.play().catch(() => {
          playServerTtsChunk(ttsChunkIdxRef.current);
        });
        return;
      }
      playServerTtsChunk(ttsChunkIdxRef.current);
      return;
    }

    const detail = activeArticleRef.current;
    const rawText =
      detail?.plainText ||
      [activeItemRef.current?.title, activeItemRef.current?.description].filter(Boolean).join('. ');
    const maxLen = ttsProviderInfoRef.current?.maxChunkLen || 175;
    const chunks = splitVietnameseTtsChunks(rawText, maxLen);
    if (!chunks.length) {
      onNotifyToastRef.current?.('Bài báo này không có nội dung văn bản để đọc');
      return;
    }

    ttsChunksRef.current = chunks;
    ttsChunkIdxRef.current = 0;
    setTtsTotalChunks(chunks.length);
    setTtsChunkIndex(0);
    const engineName = ttsProviderInfoRef.current?.providerLabel || 'AI Việt';
    onNotifyToastRef.current?.(`🔊 Đang phát ${engineName} (${chunks.length} đoạn)`);
    playServerTtsChunk(0);
  }, [stopSpeechFallbackOnly, playServerTtsChunk]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const detail = activeArticleRef.current;

    // Nếu chưa chọn bài nào -> 1 chạm tự phát bản tin mới nhất có Audio!
    if (!activeItemRef.current) {
      playLatestAudioBulletin();
      return;
    }

    // Nếu đang ở chế độ đọc giọng máy HOẶC bài hiện tại không có file .m4a từ Báo Mới -> điều khiển TTS MP3!
    if (isTtsModeRef.current || (detail && detail.voices.length === 0)) {
      toggleBrowserTts();
      return;
    }

    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (!audio.src && detail?.voices?.length) {
      const voice = pickVoiceFromList(detail.voices, preferredVoiceIdRef.current);
      if (voice) {
        loadAudioStream(voice.streamingUrl, true, 0);
        return;
      }
    }

    onBeforePlayRef.current?.();
    audio.playbackRate = playbackRateRef.current;
    audio.play().catch((err) => {
      console.warn('[NewsAudio] resume failed:', err);
      setAudioError('Không thể phát âm thanh — bấm lại để thử');
    });
  }, [playLatestAudioBulletin, toggleBrowserTts, pickVoiceFromList, loadAudioStream]);

  const seekTo = useCallback(
    (val: number) => {
      if (isTtsModeRef.current && ttsChunksRef.current.length > 0) {
        const idx = Math.max(0, Math.min(Math.round(val), ttsChunksRef.current.length - 1));
        playServerTtsChunk(idx);
        return;
      }
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(val)) return;
      const maxD = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : val;
      const clamped = Math.max(0, Math.min(val, maxD));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [playServerTtsChunk]
  );

  const seekRelative = useCallback(
    (deltaSec: number) => {
      if (isTtsModeRef.current && ttsChunksRef.current.length > 0) {
        const step = deltaSec >= 0 ? 1 : -1;
        const nextIdx = Math.max(
          0,
          Math.min(ttsChunkIdxRef.current + step, ttsChunksRef.current.length - 1)
        );
        playServerTtsChunk(nextIdx);
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      const target = (audio.currentTime || 0) + deltaSec;
      const maxD = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : target;
      const clamped = Math.max(0, Math.min(target, maxD));
      audio.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [playServerTtsChunk]
  );

  // Lắng nghe sự kiện từ thẻ <audio> duy nhất (hỗ trợ cả file .m4a Báo Mới lẫn hàng đợi TTS MP3!)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(d);
      audio.playbackRate = playbackRateRef.current;
      if (!isTtsModeRef.current && pendingSeekTimeRef.current !== null && d > 0) {
        const seekTarget = Math.min(pendingSeekTimeRef.current, Math.max(0, d - 1));
        audio.currentTime = seekTarget;
        setCurrentTime(seekTarget);
        pendingSeekTimeRef.current = null;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      setAudioError(null);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleEnded = () => {
      // Nếu đang đọc giọng máy TTS MP3 -> nối tiếp đoạn tiếp theo không bị gián đoạn!
      if (isTtsModeRef.current && ttsChunksRef.current.length > 0) {
        const nextIdx = ttsChunkIdxRef.current + 1;
        if (nextIdx < ttsChunksRef.current.length) {
          playServerTtsChunk(nextIdx);
          return;
        }
        // Đã đọc xong đoạn cuối của bài!
        ttsChunkIdxRef.current = 0;
        setTtsChunkIndex(0);
      }

      setIsPlaying(false);
      setIsBuffering(false);
      if (autoPlayNextRef.current) {
        playNextArticle(true);
      }
    };

    const handleError = () => {
      // Nếu TTS MP3 server gặp sự cố -> tự chuyển sang dự phòng Web Speech API chia câu ngắn!
      if (isTtsModeRef.current && ttsChunksRef.current.length > 0) {
        startWebSpeechFallback(ttsChunkIdxRef.current, () => {
          if (autoPlayNextRef.current) {
            playNextArticle(true);
          }
        });
        return;
      }

      const origUrl = currentStreamingUrlRef.current;
      if (origUrl && !usedProxyFallbackRef.current) {
        usedProxyFallbackRef.current = true;
        audio.src = buildNewsAudioProxyUrl(origUrl);
        audio.playbackRate = playbackRateRef.current;
        audio.load();
        audio.play().catch(() => {
          setIsPlaying(false);
          setIsBuffering(false);
          setAudioError('Không tải được file audio của bài báo này');
        });
        return;
      }
      setIsPlaying(false);
      setIsBuffering(false);
      setAudioError('Luồng audio gặp sự cố — thử đổi giọng đọc hoặc bài khác');
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [playNextArticle, playServerTtsChunk, startWebSpeechFallback]);

  // Đồng bộ nút vô-lăng CarPlay (MediaSession API) khi đang nghe Báo Audio
  useEffect(() => {
    if (!isPlaying || !activeItem) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      const voiceName = activeVoice ? ` • ${getVoiceShortName(activeVoice.id, activeVoice.name)}` : '';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: activeItem.title,
        artist: `${activeItem.publisherName}${voiceName}`,
        album: 'Báo Audio • CarHub VF5',
        artwork: activeItem.thumb
          ? [{ src: activeItem.thumb, sizes: '400x225', type: 'image/jpeg' }]
          : [],
      });
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => pauseNews());
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        playNextArticle(true);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        playPrevArticle();
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => seekRelative(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => seekRelative(15));
    } catch {
      // Một số WebView không hỗ trợ đầy đủ MediaSession
    }
  }, [
    isPlaying,
    activeItem,
    activeVoice,
    togglePlay,
    pauseNews,
    playNextArticle,
    playPrevArticle,
    seekRelative,
  ]);

  // Hủy TTS nếu unmount
  useEffect(() => {
    return () => {
      stopBrowserTts();
    };
  }, [stopBrowserTts]);

  const activeIdx = useMemo(() => {
    if (!activeItem) return -1;
    return items.findIndex((x) => x.id === activeItem.id);
  }, [items, activeItem]);

  const isTtsSpeaking = (isTtsMode && isPlaying) || isSpeechFallbackSpeaking;

  return {
    audioRef,
    category,
    setCategory,
    searchQuery,
    submitSearch,
    clearSearch,
    items,
    isLoadingFeed,
    isLoadingMore,
    hasMore,
    feedError,
    refreshFeed,
    loadMore,
    readIds,
    audioBadgeMap,
    activeItem,
    activeArticle,
    isLoadingArticle,
    articleError,
    selectArticle,
    playLatestAudioBulletin,
    isPlaying,
    isBuffering,
    isTtsMode,
    isTtsSpeaking,
    ttsChunkIndex,
    ttsTotalChunks,
    ttsProviderInfo,
    ttsVoiceId,
    selectTtsVoice,
    audioError,
    currentTime,
    duration,
    preferredVoiceId,
    activeVoice,
    selectVoice,
    cycleVoice,
    playbackRate,
    cyclePlaybackRate,
    autoPlayNext,
    toggleAutoPlayNext,
    togglePlay,
    pauseNews,
    seekTo,
    seekRelative,
    playNextArticle,
    playPrevArticle,
    hasNextArticle: activeIdx >= 0 ? activeIdx < items.length - 1 : items.length > 0,
    hasPrevArticle: activeIdx > 0,
    toggleBrowserTts,
  };
}
