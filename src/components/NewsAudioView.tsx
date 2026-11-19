import React, { useState, useEffect, useRef } from 'react';
import {
  Newspaper,
  Search,
  RefreshCw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Loader2,
  Volume2,
  Mic,
  Headphones,
  Repeat,
  X,
  ChevronDown,
  Gauge,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { NewsAudioController } from '../hooks/useNewsAudio';
import {
  NEWS_CATEGORIES,
  formatNewsRelativeTime,
  getVoiceShortName,
} from '../services/news';
import { formatSeconds } from '../services/api';
import { getCarTheme } from '../utils/theme';

interface NewsAudioViewProps {
  news: NewsAudioController;
  isLightTheme: boolean;
  onOpenCockpitWithNews: () => void;
}

export const NewsAudioView: React.FC<NewsAudioViewProps> = ({
  news,
  isLightTheme,
  onOpenCockpitWithNews,
}) => {
  const theme = getCarTheme(isLightTheme);
  const [searchInput, setSearchInput] = useState<string>(news.searchQuery);
  const [mobilePane, setMobilePane] = useState<'list' | 'reader'>('list');
  const readerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(news.searchQuery);
  }, [news.searchQuery]);

  // Cuộn khung đọc báo về đầu mỗi khi đổi bài
  useEffect(() => {
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [news.activeItem?.id]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    news.submitSearch(searchInput);
  };

  const safeDuration = news.duration > 0 ? news.duration : 0;
  const progressPct =
    safeDuration > 0 ? Math.min(100, Math.max(0, (news.currentTime / safeDuration) * 100)) : 0;
  const remainingTime = Math.max(0, safeDuration - news.currentTime);
  const hasStudioAudio = Boolean(news.activeArticle && news.activeArticle.voices.length > 0);
  const isActuallySpeaking = news.isPlaying || news.isTtsSpeaking;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 max-w-[1920px] mx-auto w-full animate-ios-browse-in">
      {/* =====================================================================
          1. THANH ĐẦU TRANG: TIÊU ĐỀ + TÌM KIẾM + PHÁT BẢN TIN NHANH + LIÊN TỤC
         ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isLightTheme
                ? 'bg-amber-100 border-amber-300 text-amber-700'
                : 'bg-amber-500/20 border-amber-400/45 text-amber-300'
            }`}
          >
            <Newspaper className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className={`text-base sm:text-lg font-black tracking-tight truncate ${theme.text}`}>
              Báo Audio • Báo Mới
            </h2>
            <p className={`text-xs font-semibold truncate ${theme.textSub}`}>
              {news.searchQuery
                ? `Kết quả tìm "${news.searchQuery}" (${news.items.length} bài)`
                : `Nghe tin tức 4 giọng AI tự nhiên • ${news.items.length} tin mới nhất`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 flex-1 justify-end min-w-[16rem]">
          {/* Ô tìm kiếm tin tức trên Báo Mới */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[10rem] max-w-[18rem]">
            <Search
              className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textMuted}`}
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm tin VinFast, giá xăng..."
              className={`w-full min-h-[2.5rem] pl-9 pr-8 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
            />
            {(searchInput || news.searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  news.clearSearch();
                }}
                aria-label="Xóa từ khóa tìm kiếm"
                className={`w-7 h-7 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${theme.textMuted}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          {/* Nút 1 chạm Phát bản tin Audio ngay */}
          <button
            type="button"
            onClick={() => {
              news.playLatestAudioBulletin();
              setMobilePane('reader');
            }}
            disabled={news.isLoadingFeed && news.items.length === 0}
            className="min-h-[2.5rem] px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95 transition disabled:opacity-50 shrink-0"
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span>Nghe bản tin</span>
          </button>

          {/* Bật/tắt tự động đọc tiếp bài sau (Rảnh tay khi lái xe) */}
          <button
            type="button"
            onClick={news.toggleAutoPlayNext}
            title="Tự động chuyển sang bài báo tiếp theo khi đọc xong"
            className={`min-h-[2.5rem] px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
              news.autoPlayNext
                ? isLightTheme
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                : theme.iconBtn
            }`}
          >
            <Repeat className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Liên tục</span>
          </button>

          {/* Làm mới tin */}
          <button
            type="button"
            onClick={news.refreshFeed}
            aria-label="Cập nhật tin mới nhất"
            title="Làm mới danh sách tin"
            className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition shrink-0 ${theme.iconBtn}`}
          >
            <RefreshCw className={`w-4 h-4 ${news.isLoadingFeed ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. THANH CHUYÊN MỤC BÁO MỚI (Cuộn ngang mượt, nút to dễ chạm trên VF5)
         ===================================================================== */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 shrink-0">
        {NEWS_CATEGORIES.map((cat) => {
          const active = !news.searchQuery && news.category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                news.setCategory(cat.id);
                setMobilePane('list');
              }}
              className={`min-h-[2.35rem] px-3.5 rounded-full text-xs font-extrabold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
                active
                  ? cat.id === 'audio'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : theme.chipActive
                  : theme.chipIdle
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Nút chuyển Danh sách / Bài đang đọc trên màn dọc điện thoại */}
      <div className={`grid grid-cols-2 p-1 rounded-xl border car:hidden shrink-0 ${theme.segTrack}`}>
        <button
          type="button"
          onClick={() => setMobilePane('list')}
          className={`min-h-[2.35rem] rounded-lg text-xs font-extrabold transition ${
            mobilePane === 'list' ? theme.segActive : theme.segIdle
          }`}
        >
          📰 Danh sách tin ({news.items.length})
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('reader')}
          className={`min-h-[2.35rem] rounded-lg text-xs font-extrabold transition ${
            mobilePane === 'reader' ? theme.segActive : theme.segIdle
          }`}
        >
          🎧 {news.activeItem ? 'Đang nghe & đọc' : 'Khung đọc báo'}
        </button>
      </div>

      {/* =====================================================================
          3. BỐ CỤC 2 CỘT: DANH SÁCH TIN (TRÁI) + TRÌNH PHÁT AUDIO & ĐỌC BÁO (PHẢI)
         ===================================================================== */}
      <div className="flex-1 min-h-0 grid grid-cols-1 car:grid-cols-12 gap-2.5">
        {/* CỘT TRÁI: DANH SÁCH TIN TỨC */}
        <div
          className={`${
            mobilePane === 'list' ? 'flex' : 'hidden car:flex'
          } car:col-span-5 xl:col-span-4 flex-col min-h-0 rounded-2xl sm:rounded-3xl border overflow-hidden ${
            theme.card
          }`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 space-y-1.5">
            {news.isLoadingFeed && news.items.length === 0 ? (
              <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-2.5 text-center px-4">
                <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
                <p className={`text-sm font-bold ${theme.textSub}`}>
                  Đang lấy tin nóng &amp; bản tin Audio từ Báo Mới...
                </p>
              </div>
            ) : news.feedError && news.items.length === 0 ? (
              <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-3 text-center px-4">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <p className={`text-sm font-bold ${theme.text}`}>{news.feedError}</p>
                <button
                  type="button"
                  onClick={news.refreshFeed}
                  className="min-h-[2.5rem] px-4 rounded-xl bg-amber-500 text-slate-950 text-xs font-black active:scale-95"
                >
                  Thử tải lại
                </button>
              </div>
            ) : news.items.length === 0 ? (
              <div className="h-full min-h-[14rem] flex flex-col items-center justify-center gap-2 text-center px-4">
                <Newspaper className={`w-8 h-8 ${theme.textMuted}`} />
                <p className={`text-sm font-bold ${theme.textSub}`}>
                  Không tìm thấy bài báo nào phù hợp
                </p>
              </div>
            ) : (
              <>
                {news.items.map((item) => {
                  const isActive = news.activeItem?.id === item.id;
                  const isRead = news.readIds.has(item.id);
                  const audioBadge = news.audioBadgeMap[item.id];
                  const relTime = formatNewsRelativeTime(item.date);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        news.selectArticle(item, true);
                        setMobilePane('reader');
                      }}
                      className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-2xl border transition active:scale-[0.99] ${
                        isActive ? theme.itemActive : theme.itemIdle
                      }`}
                    >
                      {/* Ảnh đại diện bài báo */}
                      <div className="relative w-[5.25rem] h-[3.65rem] rounded-xl overflow-hidden shrink-0 bg-slate-900 border border-black/15">
                        {item.thumb ? (
                          <img
                            src={item.thumb}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-400">
                            <Newspaper className="w-5 h-5" />
                          </div>
                        )}

                        {/* Hiệu ứng sóng nhạc nếu bài này đang phát */}
                        {isActive && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            {news.isLoadingArticle || news.isBuffering ? (
                              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                            ) : isActuallySpeaking ? (
                              <div className="flex items-end gap-0.5 h-4">
                                <span className="w-1 bg-amber-400 rounded-full h-full animate-bounce" />
                                <span
                                  className="w-1 bg-amber-400 rounded-full h-3/5 animate-bounce"
                                  style={{ animationDelay: '150ms' }}
                                />
                                <span
                                  className="w-1 bg-amber-400 rounded-full h-4/5 animate-bounce"
                                  style={{ animationDelay: '300ms' }}
                                />
                              </div>
                            ) : (
                              <Play className="w-5 h-5 text-white fill-white" />
                            )}
                          </div>
                        )}

                        {item.durationText && !isActive && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[0.6rem] font-mono font-bold leading-none">
                            {item.durationText}
                          </span>
                        )}
                      </div>

                      {/* Tiêu đề & nguồn báo */}
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`text-xs sm:text-sm font-extrabold leading-snug line-clamp-2 ${
                            isActive
                              ? isLightTheme
                                ? 'text-blue-700'
                                : 'text-amber-300'
                              : isRead
                              ? theme.textSub
                              : theme.text
                          }`}
                        >
                          {item.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1">
                          <span className={`text-[0.7rem] font-bold truncate max-w-[9rem] ${theme.textSub}`}>
                            {item.publisherName}
                          </span>
                          {relTime && (
                            <span className={`text-[0.68rem] font-semibold ${theme.textMuted}`}>
                              • {relTime}
                            </span>
                          )}
                          {(item.isAudioPost || audioBadge === 'studio') && (
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[0.6rem] font-black leading-none ${
                                isLightTheme
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                              }`}
                            >
                              🎙️ Audio
                            </span>
                          )}
                          {isRead && !isActive && (
                            <span className={`inline-flex items-center gap-0.5 text-[0.65rem] font-bold ${theme.textMuted}`}>
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {news.hasMore && (
                  <button
                    type="button"
                    onClick={news.loadMore}
                    disabled={news.isLoadingMore}
                    className={`w-full min-h-[2.75rem] mt-1 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-50 ${theme.iconBtn}`}
                  >
                    {news.isLoadingMore ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <span>Tải thêm tin tức</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: TRÌNH PHÁT BÁO AUDIO (CỐ ĐỊNH TRÊN) + NỘI DUNG BÀI BÁO SẠCH (CUỘN DƯỚI) */}
        <div
          className={`${
            mobilePane === 'reader' ? 'flex' : 'hidden car:flex'
          } car:col-span-7 xl:col-span-8 flex-col min-h-0 rounded-2xl sm:rounded-3xl border overflow-hidden ${
            theme.card
          }`}
        >
          {!news.activeItem ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
              <div
                className={`w-20 h-20 rounded-3xl border flex items-center justify-center ${
                  isLightTheme
                    ? 'bg-amber-50 border-amber-300 text-amber-600'
                    : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                }`}
              >
                <Headphones className="w-10 h-10" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h3 className={`text-lg sm:text-xl font-black ${theme.text}`}>
                  Nghe Báo Audio rảnh tay trên xe VF5
                </h3>
                <p className={`text-xs sm:text-sm font-semibold leading-relaxed ${theme.textSub}`}>
                  Chọn bất kỳ bài báo nào bên trái hoặc bấm nút bên dưới để nghe ngay bản tin giọng đọc
                  AI Báo Mới (Nam/Nữ miền Bắc &amp; miền Nam). Âm thanh vẫn tiếp tục phát mượt khi bạn
                  quay lại bản đồ Cockpit!
                </p>
              </div>
              <button
                type="button"
                onClick={() => news.playLatestAudioBulletin()}
                disabled={news.items.length === 0}
                className="min-h-[3rem] px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-black flex items-center gap-2 shadow-xl active:scale-95 transition disabled:opacity-40"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>Phát bản tin nóng ngay</span>
              </button>
            </div>
          ) : (
            <>
              {/* KHUNG ĐIỀU KHIỂN AUDIO CỐ ĐỊNH TRÊN ĐẦU */}
              <div
                className={`shrink-0 p-3 sm:p-3.5 border-b space-y-2.5 ${theme.divider} ${
                  isLightTheme ? 'bg-slate-50/95' : 'bg-black/30'
                }`}
              >
                {/* Dòng 1: Thông tin bài đang nghe + Nút quay lại Cockpit 0ms reload */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[0.68rem] font-black ${
                          isLightTheme
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        }`}
                      >
                        {news.activeArticle?.publisherName || news.activeItem.publisherName}
                      </span>
                      {news.activeArticle?.categoryName && (
                        <span className={`text-[0.7rem] font-bold ${theme.textMuted}`}>
                          • {news.activeArticle.categoryName}
                        </span>
                      )}
                      <span className={`text-[0.7rem] font-bold ${theme.textMuted}`}>
                        • {formatNewsRelativeTime(news.activeArticle?.date || news.activeItem.date)}
                      </span>
                    </div>
                    <h3 className={`text-sm sm:text-base font-black leading-snug line-clamp-2 ${theme.text}`}>
                      {news.activeArticle?.title || news.activeItem.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={onOpenCockpitWithNews}
                    title="Chuyển sang Cockpit 3D vừa lái xe vừa nghe bài báo này (không ngắt tiếng!)"
                    className={`min-h-[2.45rem] px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 shrink-0 active:scale-95 transition ${
                      isLightTheme
                        ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                        : 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/35'
                    }`}
                  >
                    <Gauge className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Vừa lái vừa nghe</span>
                  </button>
                </div>

                {/* Dòng 2: Chọn 4 Giọng đọc Báo Mới (Nam/Nữ Bắc/Nam) hoặc TTS dự phòng */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  {news.isLoadingArticle ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang tải file Audio từ Báo Mới...</span>
                    </div>
                  ) : hasStudioAudio && news.activeArticle ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[0.7rem] font-extrabold flex items-center gap-1 ${theme.textSub}`}>
                        <Mic className="w-3.5 h-3.5 text-amber-500" />
                        <span>Giọng đọc:</span>
                      </span>
                      {news.activeArticle.voices.map((v) => {
                        const selected = news.activeVoice?.id === v.id;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => news.selectVoice(v.id)}
                            className={`min-h-[2.1rem] px-2.5 rounded-full text-xs font-extrabold border active:scale-95 transition ${
                              selected
                                ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-sm'
                                : theme.chipIdle
                            }`}
                          >
                            {getVoiceShortName(v.id, v.name)}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={news.toggleBrowserTts}
                        className={`min-h-[2.2rem] px-3 rounded-full text-xs font-black flex items-center gap-1.5 active:scale-95 transition ${
                          news.isTtsSpeaking
                            ? 'bg-rose-600 text-white shadow'
                            : 'bg-amber-500 text-slate-950 shadow'
                        }`}
                      >
                        {news.isTtsMode && news.isBuffering ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                        <span>
                          {news.isTtsSpeaking
                            ? `Tạm dừng${
                                news.ttsTotalChunks > 0
                                  ? ` (${news.ttsChunkIndex + 1}/${news.ttsTotalChunks})`
                                  : ''
                              }`
                            : news.isTtsMode && news.ttsTotalChunks > 0
                            ? `Nghe tiếp (${news.ttsChunkIndex + 1}/${news.ttsTotalChunks})`
                            : news.ttsProviderInfo?.isNeural
                            ? `Đọc ${news.ttsProviderInfo.providerLabel}`
                            : 'Đọc giọng máy (AI Việt)'}
                        </span>
                      </button>

                      {/* Nút chọn giọng Neural (Azure Hoài My / Nam Minh hoặc FPT.AI Ban Mai / Lê Minh / Lan Nhi / Minh Quang) */}
                      {news.ttsProviderInfo && news.ttsProviderInfo.voices.length > 1 ? (
                        news.ttsProviderInfo.voices.map((v) => {
                          const selected =
                            (news.ttsVoiceId || news.ttsProviderInfo?.defaultVoice) === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => news.selectTtsVoice(v.id)}
                              className={`min-h-[2.1rem] px-2.5 rounded-full text-xs font-extrabold border active:scale-95 transition ${
                                selected
                                  ? isLightTheme
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                    : 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm'
                                  : theme.chipIdle
                              }`}
                            >
                              {v.label}
                            </button>
                          );
                        })
                      ) : (
                        <span
                          className={`text-[0.7rem] font-bold px-2.5 py-1 rounded-full border ${
                            isLightTheme
                              ? 'bg-slate-100 border-slate-300 text-slate-600'
                              : 'bg-white/10 border-white/15 text-white/70'
                          }`}
                        >
                          {news.ttsProviderInfo?.providerLabel || 'TTS Dự phòng'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Nút chỉnh tốc độ đọc (0.85x - 1.75x) */}
                  <button
                    type="button"
                    onClick={news.cyclePlaybackRate}
                    title="Đổi tốc độ đọc báo (0.85x → 1x → 1.25x → 1.5x → 1.75x)"
                    className={`min-h-[2.1rem] px-2.5 rounded-full border text-xs font-mono font-black active:scale-95 transition shrink-0 ${
                      news.playbackRate !== 1
                        ? isLightTheme
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-sky-400 border-sky-300 text-slate-950'
                        : theme.iconBtn
                    }`}
                  >
                    {news.playbackRate}x
                  </button>
                </div>

                {news.audioError && (
                  <p className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{news.audioError}</span>
                  </p>
                )}

                {/* Dòng 3: Thanh tua .m4a (hoặc theo đoạn TTS MP3) + Nút điều khiển lớn chuẩn cảm ứng ô tô */}
                {(hasStudioAudio || news.isTtsMode) && (
                  <div className="space-y-1">
                    <div>
                      <input
                        type="range"
                        aria-label="Thanh tua Báo Audio"
                        min={0}
                        max={
                          news.isTtsMode
                            ? Math.max(1, news.ttsTotalChunks - 1)
                            : safeDuration || 100
                        }
                        step={1}
                        value={
                          news.isTtsMode
                            ? news.ttsChunkIndex
                            : Math.min(news.currentTime, safeDuration || 100)
                        }
                        style={
                          {
                            '--progress': `${
                              news.isTtsMode
                                ? news.ttsTotalChunks > 1
                                  ? Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        (news.ttsChunkIndex / (news.ttsTotalChunks - 1)) * 100
                                      )
                                    )
                                  : 100
                                : progressPct
                            }%`,
                          } as React.CSSProperties
                        }
                        onChange={(e) => news.seekTo(parseFloat(e.target.value))}
                        className={theme.scrubber}
                      />
                      <div
                        className={`flex justify-between text-[0.72rem] font-mono font-bold -mt-1.5 px-0.5 ${theme.textMuted}`}
                      >
                        <span>
                          {news.isTtsMode
                            ? `Đoạn ${news.ttsChunkIndex + 1}/${Math.max(1, news.ttsTotalChunks)}`
                            : formatSeconds(news.currentTime)}
                        </span>
                        <span>
                          {news.isTtsMode
                            ? news.ttsProviderInfo?.providerLabel || 'AI TTS Việt'
                            : safeDuration > 0
                            ? `-${formatSeconds(remainingTime)}`
                            : '--:--'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2.5 sm:gap-4 pt-0.5">
                      <button
                        type="button"
                        onClick={() => news.playPrevArticle()}
                        disabled={!news.hasPrevArticle}
                        aria-label="Bài báo trước"
                        className={`w-11 h-11 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
                      >
                        <SkipBack className="w-5 h-5 fill-current" />
                      </button>

                      <button
                        type="button"
                        onClick={() => news.seekRelative(-15)}
                        aria-label={news.isTtsMode ? 'Đoạn trước' : 'Tua lùi 15 giây'}
                        className={`w-11 h-11 rounded-full border flex flex-col items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="text-[0.6rem] font-black leading-none mt-0.5">
                          {news.isTtsMode ? '-1 câu' : '-15s'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={news.togglePlay}
                        aria-label={isActuallySpeaking ? 'Tạm dừng đọc báo' : 'Phát báo audio'}
                        className={`w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
                      >
                        {news.isBuffering || news.isLoadingArticle ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : isActuallySpeaking ? (
                          <Pause className={`w-6 h-6 ${theme.primaryCtaIcon}`} />
                        ) : (
                          <Play className={`w-6 h-6 ml-0.5 ${theme.primaryCtaIcon}`} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => news.seekRelative(15)}
                        aria-label={news.isTtsMode ? 'Đoạn tiếp' : 'Tua tới 15 giây'}
                        className={`w-11 h-11 rounded-full border flex flex-col items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span className="text-[0.6rem] font-black leading-none mt-0.5">
                          {news.isTtsMode ? '+1 câu' : '+15s'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => news.playNextArticle(false)}
                        disabled={!news.hasNextArticle}
                        aria-label="Bài báo tiếp theo"
                        className={`w-11 h-11 rounded-full border flex items-center justify-center disabled:opacity-30 active:scale-90 transition ${theme.iconBtn}`}
                      >
                        <SkipForward className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* KHUNG ĐỌC BÁO SẠCH KHÔNG QUẢNG CÁO */}
              <div
                ref={readerScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3.5"
              >
                {news.isLoadingArticle && !news.activeArticle ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
                    <span className={`text-sm font-bold ${theme.textSub}`}>
                      Đang tải nội dung bài viết...
                    </span>
                  </div>
                ) : news.articleError ? (
                  <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
                    <AlertCircle className="w-8 h-8 text-rose-500" />
                    <p className={`text-sm font-bold ${theme.text}`}>{news.articleError}</p>
                    <button
                      type="button"
                      onClick={() => news.activeItem && news.selectArticle(news.activeItem, true)}
                      className="min-h-[2.5rem] px-4 rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
                    >
                      Thử tải lại
                    </button>
                  </div>
                ) : news.activeArticle ? (
                  <article className="max-w-3xl mx-auto space-y-3.5 pb-6">
                    {/* Sapo in đậm */}
                    {news.activeArticle.description && (
                      <p className={`text-sm sm:text-base font-extrabold leading-relaxed ${theme.text}`}>
                        {news.activeArticle.description}
                      </p>
                    )}

                    {/* Nếu là bản tin Podcast /audio.epi (không có bodys dài) -> hiện ảnh lớn nổi bật */}
                    {news.activeArticle.blocks.length === 0 && news.activeArticle.thumb && (
                      <figure className="rounded-2xl overflow-hidden border border-black/15">
                        <img
                          src={news.activeArticle.thumb}
                          alt={news.activeArticle.title}
                          className="w-full max-h-[22rem] object-cover"
                        />
                      </figure>
                    )}

                    {/* Các đoạn văn & ảnh minh họa sạch */}
                    {news.activeArticle.blocks.map((block, idx) => {
                      if (block.type === 'image' && block.url) {
                        return (
                          <figure
                            key={`img-${idx}`}
                            className="rounded-2xl overflow-hidden border border-black/10 bg-black/10"
                          >
                            <img
                              src={block.url}
                              alt=""
                              loading="lazy"
                              className="w-full max-h-[26rem] object-contain mx-auto"
                            />
                          </figure>
                        );
                      }
                      if (block.type === 'text' && block.text) {
                        if (block.isCaption) {
                          return (
                            <p
                              key={`cap-${idx}`}
                              className={`text-xs italic text-center -mt-1.5 ${theme.textMuted}`}
                            >
                              {block.text}
                            </p>
                          );
                        }
                        if (block.isAuthor) {
                          return (
                            <p
                              key={`auth-${idx}`}
                              className={`text-xs sm:text-sm font-black text-right pt-1 ${theme.textSub}`}
                            >
                              {block.text}
                            </p>
                          );
                        }
                        return (
                          <p
                            key={`p-${idx}`}
                            className={`text-sm sm:text-base font-medium leading-[1.7] ${theme.text}`}
                          >
                            {block.text}
                          </p>
                        );
                      }
                      return null;
                    })}

                    {/* Footer nguồn báo */}
                    <div
                      className={`pt-4 mt-4 border-t flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${theme.divider} ${theme.textMuted}`}
                    >
                      <span>
                        Nguồn: {news.activeArticle.publisherName} • Tổng hợp từ Báo Mới
                      </span>
                      {news.activeArticle.originalUrl && (
                        <a
                          href={news.activeArticle.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline hover:opacity-80"
                        >
                          <span>Xem bài gốc</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </article>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
