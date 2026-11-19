import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import {
  Tv,
  Radio,
  Film,
  Search,
  X,
  Star,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  ShieldAlert,
  Wifi,
  Activity,
  Square,
} from 'lucide-react';
import { TvPingResult } from '../types';
import { DEFAULT_TV_PLAYLIST_URL } from '../services/tv';
import {
  TvLiveController,
  getChannelFavKey,
  stripVietnameseTones,
} from '../hooks/useTvLive';
import { VideoSlotRect } from './CockpitView';
import { getCarTheme } from '../utils/theme';

interface TvLiveViewProps {
  tv: TvLiveController;
  onPauseMusic: () => void;
  onNotifyToast: (msg: string) => void;
  onTvSlotRectChange: (rect: VideoSlotRect | null) => void;
  isLightTheme: boolean;
}

const PingBadge: React.FC<{
  ping?: TvPingResult;
  isLightTheme: boolean;
  compact?: boolean;
}> = ({ ping, isLightTheme, compact = false }) => {
  if (!ping) {
    return (
      <span
        title="Chưa kiểm tra tín hiệu — bấm Ping để quét"
        className={`inline-flex items-center justify-center rounded-full border shrink-0 ${
          compact ? 'px-1.5 py-0.5 text-[0.65rem]' : 'px-2 py-0.5 text-[0.7rem]'
        } font-bold ${
          isLightTheme
            ? 'bg-slate-100 border-slate-300 text-slate-400'
            : 'bg-white/5 border-white/10 text-white/35'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      </span>
    );
  }

  if (ping.status === 'checking') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border shrink-0 ${
          compact ? 'px-2 py-0.5 text-[0.68rem]' : 'px-2 py-0.5 text-xs'
        } font-extrabold ${
          isLightTheme
            ? 'bg-blue-50 border-blue-200 text-blue-600'
            : 'bg-sky-500/15 border-sky-400/35 text-sky-300'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
        <span>...</span>
      </span>
    );
  }

  if (ping.status === 'live') {
    return (
      <span
        title={
          ping.latencyMs
            ? `Đang phát trực tiếp • Phản hồi ${ping.latencyMs}ms`
            : 'Đang phát trực tiếp'
        }
        className={`inline-flex items-center gap-1 rounded-full border shrink-0 font-mono font-extrabold ${
          compact ? 'px-2 py-0.5 text-[0.68rem]' : 'px-2 py-0.5 text-xs'
        } ${
          isLightTheme
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-300'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span>{ping.latencyMs ? `${ping.latencyMs}ms` : 'Live'}</span>
      </span>
    );
  }

  return (
    <span
      title={ping.reason ? `Offline: ${ping.reason}` : 'Kênh đang ngoại tuyến'}
      className={`inline-flex items-center gap-1 rounded-full border shrink-0 font-extrabold ${
        compact ? 'px-2 py-0.5 text-[0.68rem]' : 'px-2 py-0.5 text-xs'
      } ${
        isLightTheme
          ? 'bg-rose-50 border-rose-300 text-rose-700'
          : 'bg-rose-500/20 border-rose-400/45 text-rose-300'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
      <span>Off</span>
    </span>
  );
};

export const TvLiveView: React.FC<TvLiveViewProps> = ({
  tv,
  onPauseMusic,
  onNotifyToast,
  onTvSlotRectChange,
  isLightTheme,
}) => {
  const theme = getCarTheme(isLightTheme);
  const {
    playlistUrl,
    setPlaylistUrl,
    playlist,
    isLoadingPlaylist,
    playlistError,
    reloadPlaylist,
    activeChannel,
    setActiveChannel,
    favoriteKeys,
    favoriteSet,
    toggleFavoriteChannel,
    popularChannels,
    pingMap,
    isPinging,
    pingChannels,
    cancelPing,
    isMuted,
    toggleMute,
    reloadStream,
    switchStreamMode,
    playerStatus,
    togglePlay,
    setZapContextList,
    zapChannel,
  } = tv;

  const [customUrlInput, setCustomUrlInput] = useState<string>(playlistUrl);
  const [showSourceModal, setShowSourceModal] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<string>('__popular__');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyLiveFilter, setOnlyLiveFilter] = useState<boolean>(false);
  const [isTvFullscreen, setIsTvFullscreen] = useState<boolean>(false);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});

  const outerScrollRef = useRef<HTMLDivElement | null>(null);
  const tvSlotRef = useRef<HTMLDivElement | null>(null);

  // Đồng bộ tọa độ khung phát TV duy nhất (0ms reload khi chuyển TV Live <-> Cockpit!)
  const syncTvSlotRect = useCallback(() => {
    const el = tvSlotRef.current;
    if (!el) {
      onTvSlotRectChange(null);
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width > 40 && r.height > 40) {
      onTvSlotRectChange({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    } else {
      onTvSlotRectChange(null);
    }
  }, [onTvSlotRectChange]);

  useLayoutEffect(() => {
    syncTvSlotRect();
    const rafId = window.requestAnimationFrame(syncTvSlotRect);
    const t1 = window.setTimeout(syncTvSlotRect, 120);

    const slotEl = tvSlotRef.current;
    const outerEl = outerScrollRef.current;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => syncTvSlotRect());
      if (slotEl) ro.observe(slotEl);
      if (outerEl) ro.observe(outerEl);
    }

    window.addEventListener('resize', syncTvSlotRect);
    window.visualViewport?.addEventListener('resize', syncTvSlotRect);
    outerEl?.addEventListener('scroll', syncTvSlotRect, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      ro?.disconnect();
      window.removeEventListener('resize', syncTvSlotRect);
      window.visualViewport?.removeEventListener('resize', syncTvSlotRect);
      outerEl?.removeEventListener('scroll', syncTvSlotRect);
    };
  }, [isTvFullscreen, showSourceModal, syncTvSlotRect]);

  useEffect(() => {
    return () => {
      onTvSlotRectChange(null);
    };
  }, [onTvSlotRectChange]);

  // Hỗ trợ phím Escape thoát toàn màn hình TV
  useEffect(() => {
    if (!isTvFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTvFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTvFullscreen]);

  // Danh sách kênh gốc của nhóm / tìm kiếm (100% không ẩn kênh nào!)
  const baseChannels = useMemo(() => {
    if (!playlist) return [];
    const q = stripVietnameseTones(searchQuery.trim());
    if (q) {
      return playlist.channels.filter(
        (c) =>
          stripVietnameseTones(c.name).includes(q) ||
          stripVietnameseTones(c.group).includes(q)
      );
    }
    if (selectedGroup === '__favorites__') {
      return playlist.channels.filter((c) => favoriteSet.has(getChannelFavKey(c)));
    }
    if (selectedGroup === '__popular__') {
      return popularChannels;
    }
    if (selectedGroup === '__all__') {
      return playlist.channels;
    }
    return playlist.channels.filter((c) => c.group === selectedGroup);
  }, [playlist, searchQuery, selectedGroup, favoriteSet, popularChannels]);

  // Bộ đếm Live / Off cho danh sách hiện tại
  const pingSummary = useMemo(() => {
    let live = 0;
    let dead = 0;
    let checking = 0;
    for (const ch of baseChannels) {
      const p = pingMap[ch.id];
      if (!p) continue;
      if (p.status === 'live') live++;
      else if (p.status === 'dead') dead++;
      else if (p.status === 'checking') checking++;
    }
    return { live, dead, checking };
  }, [baseChannels, pingMap]);

  // Chỉ lọc theo "Chỉ Live" khi người dùng chủ động bật chip lọc (mặc định TẮT để hiện 100% kênh!)
  const displayedChannels = useMemo(() => {
    if (!onlyLiveFilter) return baseChannels;
    return baseChannels.filter((ch) => pingMap[ch.id]?.status === 'live');
  }, [baseChannels, onlyLiveFilter, pingMap]);

  // Đồng bộ danh sách chuyển kênh với bộ phát TV dùng chung
  useEffect(() => {
    if (displayedChannels.length > 0) {
      setZapContextList(displayedChannels);
    } else if (baseChannels.length > 0) {
      setZapContextList(baseChannels);
    }
  }, [displayedChannels, baseChannels, setZapContextList]);

  // Tự động Ping nhẹ nhàng nhóm kênh đang mở (có cache 5 phút, tránh lặp thừa)
  useEffect(() => {
    if (!playlist || baseChannels.length === 0) return;
    const isSearching = searchQuery.trim().length > 0;
    const delayMs = isSearching ? 450 : 120;
    const timer = window.setTimeout(() => {
      const limit = selectedGroup === '__all__' && !isSearching ? 30 : 40;
      pingChannels(baseChannels.slice(0, limit), false);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [playlist, selectedGroup, searchQuery, baseChannels, pingChannels]);

  const activeChannelIndex = useMemo(() => {
    if (!activeChannel) return -1;
    return displayedChannels.findIndex((c) => c.id === activeChannel.id);
  }, [displayedChannels, activeChannel]);

  const handleZapChannel = useCallback(
    (delta: number) => {
      zapChannel(delta, displayedChannels.length > 0 ? displayedChannels : baseChannels);
    },
    [zapChannel, displayedChannels, baseChannels]
  );

  const isCurrentFav = activeChannel ? favoriteSet.has(getChannelFavKey(activeChannel)) : false;
  const activePing = activeChannel ? pingMap[activeChannel.id] : undefined;

  return (
    <div
      ref={outerScrollRef}
      className="flex-1 min-h-0 h-full w-full max-w-[1960px] mx-auto flex flex-col car:flex-row gap-2.5 short:gap-2 overflow-y-auto car:overflow-hidden no-scrollbar"
    >
      {/* =====================================================================
          1. KHUNG PHÁT TV / RADIO TRỰC TIẾP (56% chiều ngang hoặc 100% Toàn màn hình)
         ===================================================================== */}
      <div
        className={`flex flex-col min-h-0 rounded-2xl sm:rounded-3xl border p-2.5 sm:p-3 gap-2 ${theme.card} ${
          isTvFullscreen
            ? 'flex-1 w-full h-full'
            : 'w-full car:w-[54%] lg:w-[56%] shrink-0 car:h-full'
        }`}
      >
        {/* Thanh tiêu đề kênh đang xem */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {activeChannel?.logo && !failedLogos[activeChannel.id] ? (
              <img
                src={activeChannel.logo}
                alt=""
                onError={() =>
                  setFailedLogos((prev) => ({ ...prev, [activeChannel.id]: true }))
                }
                className={`w-10 h-10 rounded-xl object-contain p-1 shrink-0 border ${
                  isLightTheme ? 'bg-slate-900 border-slate-300' : 'bg-black/60 border-white/15'
                }`}
              />
            ) : (
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  isLightTheme
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-sky-500/20 border-sky-400/40 text-sky-300'
                }`}
              >
                {activeChannel?.isRadio ? (
                  <Radio className="w-5 h-5" />
                ) : activeChannel?.isVod ? (
                  <Film className="w-5 h-5" />
                ) : (
                  <Tv className="w-5 h-5" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[0.65rem] font-black uppercase tracking-wider shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {activeChannel?.isVod ? 'PHIM' : activeChannel?.isRadio ? 'RADIO' : 'LIVE'}
                </span>
                <h3 className={`text-sm sm:text-base font-black truncate ${theme.text}`}>
                  {activeChannel ? activeChannel.name : 'Truyền hình & Radio VF5'}
                </h3>
                {activeChannel && (
                  <PingBadge ping={activePing} isLightTheme={isLightTheme} compact />
                )}
              </div>
              <p className={`text-xs font-semibold truncate mt-0.5 ${theme.textSub}`}>
                {activeChannel
                  ? `${activeChannel.group}${
                      activeChannel.manifestType === 'mpd' ? ' • DASH ClearKey' : ''
                    } • ${
                      playerStatus.streamMode === 'proxy'
                        ? 'Proxy chống chặn CORS'
                        : 'CDN trực tiếp'
                    }`
                  : 'Chọn kênh bên phải để phát ngay'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeChannel && (
              <button
                type="button"
                onClick={() => toggleFavoriteChannel(activeChannel)}
                aria-label={isCurrentFav ? 'Bỏ yêu thích kênh' : 'Lưu kênh yêu thích'}
                title={isCurrentFav ? 'Bỏ khỏi Yêu thích' : 'Lưu kênh Yêu thích'}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                  isCurrentFav
                    ? 'bg-amber-400 border-amber-400 text-slate-950'
                    : theme.iconBtn
                }`}
              >
                <Star className={`w-4 h-4 ${isCurrentFav ? 'fill-slate-950' : ''}`} />
              </button>
            )}

            {activeChannel && (
              <button
                type="button"
                onClick={switchStreamMode}
                title="Đổi giữa phát CDN trực tiếp và Proxy chống chặn"
                className={`min-h-[2.5rem] px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition ${
                  playerStatus.streamMode === 'proxy'
                    ? isLightTheme
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                    : theme.iconBtn
                }`}
              >
                <Wifi className="w-4 h-4" />
                <span className="hidden xs:inline">
                  {playerStatus.streamMode === 'proxy' ? 'Proxy' : 'CDN'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsTvFullscreen((v) => !v)}
              aria-label={isTvFullscreen ? 'Thu gọn danh sách kênh' : 'Xem TV toàn màn hình'}
              title={isTvFullscreen ? 'Hiện danh sách kênh' : 'Xem toàn màn hình'}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                isLightTheme
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-sky-300'
              }`}
            >
              {isTvFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Khung neo tọa độ sân khấu TV (Bộ phát TV duy nhất sẽ khớp 100% khung này — 0ms reload khi chuyển Cockpit <-> TV Live!) */}
        <div
          ref={tvSlotRef}
          aria-label="Khung phát Truyền hình & Radio trực tiếp"
          className={`relative flex-1 min-h-[190px] car:min-h-0 w-full rounded-2xl overflow-hidden bg-black border ${
            isLightTheme ? 'border-slate-300' : 'border-white/12'
          }`}
        />

        {/* Thanh điều khiển TV chuẩn cảm ứng ô tô */}
        <div className="flex items-center justify-between gap-2 shrink-0 pt-0.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleZapChannel(-1)}
              className={`min-h-[2.75rem] px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${theme.iconBtn}`}
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="hidden xs:inline">Kênh trước</span>
            </button>

            <button
              type="button"
              onClick={() => togglePlay(onPauseMusic)}
              aria-label={playerStatus.isPlaying ? 'Tạm dừng' : 'Phát'}
              className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition ${theme.primaryCta}`}
            >
              {playerStatus.isPlaying ? (
                <Pause className={`w-5 h-5 ${theme.primaryCtaIcon}`} />
              ) : (
                <Play className={`w-5 h-5 ml-0.5 ${theme.primaryCtaIcon}`} />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleZapChannel(1)}
              className={`min-h-[2.75rem] px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition ${theme.iconBtn}`}
            >
              <span className="hidden xs:inline">Kênh sau</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
              className={`w-11 h-11 rounded-xl border flex items-center justify-center active:scale-90 transition ${
                isMuted
                  ? isLightTheme
                    ? 'bg-rose-50 border-rose-300 text-rose-600'
                    : 'bg-rose-500/25 border-rose-400/50 text-rose-300'
                  : theme.iconBtn
              }`}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {activeChannel && (
              <button
                type="button"
                onClick={reloadStream}
                aria-label="Tải lại luồng kênh"
                title="Tải lại kênh hiện tại"
                className={`w-11 h-11 rounded-xl border flex items-center justify-center active:scale-90 transition ${theme.iconBtn}`}
              >
                <RefreshCw
                  className={`w-5 h-5 ${playerStatus.isResolving ? 'animate-spin' : ''}`}
                />
              </button>
            )}

            {activeChannelIndex >= 0 && (
              <span
                className={`hidden sm:inline text-xs font-mono font-bold px-2 ${theme.textMuted}`}
              >
                {activeChannelIndex + 1}/{displayedChannels.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. DANH SÁCH ĐẦY ĐỦ TẤT CẢ KÊNH TV / RADIO / PHIM + PING LIVE TRỰC TIẾP
         ===================================================================== */}
      {!isTvFullscreen && (
        <div
          className={`tv-list-cq flex-1 min-w-0 min-h-[280px] car:min-h-0 car:h-full rounded-2xl sm:rounded-3xl border p-2.5 sm:p-3 flex flex-col gap-2 overflow-hidden ${theme.card}`}
        >
          {/* Ô tìm kiếm kênh + Nút đổi nguồn M3U8 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative flex-1 min-w-0">
              <Search
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textMuted}`}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kênh (vtv3, vov giao thong, tv360...)"
                className={`w-full h-11 pl-9 pr-8 rounded-xl border text-sm font-bold focus:outline-none ${theme.input}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa tìm kiếm kênh"
                  className={`w-8 h-8 rounded-full absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${theme.textMuted}`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setCustomUrlInput(playlistUrl);
                setShowSourceModal((v) => !v);
              }}
              title="Cấu hình link danh sách M3U8"
              className={`h-11 px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shrink-0 active:scale-95 transition ${
                showSourceModal
                  ? isLightTheme
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-sky-400 text-slate-950 border-sky-300'
                  : theme.iconBtn
              }`}
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">M3U</span>
            </button>
          </div>

          {/* Hộp đổi link M3U8 tùy chỉnh */}
          {showSourceModal && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cleaned = customUrlInput.trim() || DEFAULT_TV_PLAYLIST_URL;
                setPlaylistUrl(cleaned);
                setShowSourceModal(false);
                onNotifyToast('📺 Đang nạp danh sách kênh M3U mới...');
              }}
              className={`p-3 rounded-xl border space-y-2 shrink-0 ${
                isLightTheme
                  ? 'bg-blue-50/90 border-blue-300'
                  : 'bg-black/60 border-sky-400/40'
              }`}
            >
              <div
                className={`flex items-center justify-between gap-2 text-xs font-extrabold ${
                  isLightTheme ? 'text-blue-800' : 'text-sky-300'
                }`}
              >
                <span>Nguồn danh sách M3U / M3U8</span>
                {playlist && (
                  <span className={`font-mono text-[0.7rem] ${theme.textMuted}`}>
                    Đủ {playlist.totalPlayable} kênh
                    {playlist.totalDrmCount > 0 ? ` (${playlist.totalDrmCount} MPD)` : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://tinyurl.com/vmt47"
                  className={`flex-1 min-w-0 h-10 px-3 rounded-xl border text-xs font-mono focus:outline-none ${theme.input}`}
                />
                <button
                  type="submit"
                  className={`h-10 px-4 rounded-xl text-xs font-black shrink-0 active:scale-95 ${
                    isLightTheme ? 'bg-blue-600 text-white' : 'bg-sky-400 text-slate-950'
                  }`}
                >
                  Nạp
                </button>
              </div>
              {playlistUrl !== DEFAULT_TV_PLAYLIST_URL && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomUrlInput(DEFAULT_TV_PLAYLIST_URL);
                    setPlaylistUrl(DEFAULT_TV_PLAYLIST_URL);
                    setShowSourceModal(false);
                  }}
                  className={`text-xs font-bold hover:underline ${
                    isLightTheme ? 'text-amber-700' : 'text-amber-300'
                  }`}
                >
                  ↩ Khôi phục nguồn mặc định (tinyurl.com/vmt47)
                </button>
              )}
            </form>
          )}

          {/* Thanh nhóm kênh ngang */}
          {!searchQuery.trim() && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
              {[
                { id: '__popular__', label: '🔥 Phổ biến' },
                { id: '__favorites__', label: `⭐ Yêu thích (${favoriteKeys.length})` },
                ...(playlist?.groups.map((g) => ({
                  id: g.name,
                  label: `${g.name} (${g.count})`,
                })) || []),
                ...(playlist
                  ? [{ id: '__all__', label: `Tất cả (${playlist.totalPlayable})` }]
                  : []),
              ].map((tab) => {
                const active = selectedGroup === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedGroup(tab.id)}
                    className={`min-h-[2.35rem] px-3 rounded-full text-xs font-extrabold whitespace-nowrap border active:scale-95 transition ${
                      active
                        ? isLightTheme
                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                          : 'bg-sky-400 text-slate-950 border-sky-300 shadow'
                        : theme.chipIdle
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Thanh trạng thái Ping Live & nút quét Ping thủ công */}
          {playlist && baseChannels.length > 0 && (
            <div
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border shrink-0 ${theme.well}`}
            >
              <div className="flex items-center gap-2.5 min-w-0 text-xs font-extrabold">
                <span
                  className={`inline-flex items-center gap-1 ${
                    isLightTheme ? 'text-emerald-700' : 'text-emerald-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{pingSummary.live} Live</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    isLightTheme ? 'text-rose-700' : 'text-rose-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>{pingSummary.dead} Off</span>
                </span>
                {pingSummary.checking > 0 && (
                  <span className={`truncate ${theme.textMuted}`}>
                    ({pingSummary.checking}...)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setOnlyLiveFilter((v) => !v)}
                  title="Tùy chọn chỉ lọc kênh đang Live (mặc định tắt để hiện 100% kênh)"
                  className={`min-h-[2.15rem] px-3 rounded-full border text-xs font-extrabold active:scale-95 transition ${
                    onlyLiveFilter
                      ? isLightTheme
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : theme.chipIdle
                  }`}
                >
                  Chỉ Live
                </button>

                {isPinging ? (
                  <button
                    type="button"
                    onClick={cancelPing}
                    title="Dừng quét Ping"
                    className={`min-h-[2.15rem] px-3 rounded-full border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition ${
                      isLightTheme
                        ? 'bg-rose-100 border-rose-300 text-rose-700'
                        : 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                    }`}
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Dừng</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onNotifyToast(
                        `📡 Đang kiểm tra tín hiệu ${Math.min(baseChannels.length, 120)} kênh...`
                      );
                      pingChannels(baseChannels, true);
                    }}
                    title="Quét lại tín hiệu Live / Off của danh sách hiện tại"
                    className={`min-h-[2.15rem] px-3 rounded-full border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition ${
                      isLightTheme
                        ? 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-sky-500/20 hover:bg-sky-500/35 border-sky-400/45 text-sky-200'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Ping</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Danh sách kênh cuộn mượt (tự chia 2 cột trên màn hình to / dài!) */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5">
            {isLoadingPlaylist ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className={`text-sm font-bold ${theme.textSub}`}>
                  Đang tải toàn bộ danh sách kênh TV & Radio...
                </p>
              </div>
            ) : playlistError ? (
              <div
                className={`p-4 rounded-2xl border text-center space-y-2 ${
                  isLightTheme
                    ? 'bg-rose-50 border-rose-300'
                    : 'bg-rose-500/15 border-rose-400/35'
                }`}
              >
                <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
                <p className={`text-sm font-bold ${theme.text}`}>{playlistError}</p>
                <button
                  type="button"
                  onClick={reloadPlaylist}
                  className={`min-h-[2.5rem] px-4 rounded-full text-xs font-extrabold active:scale-95 ${theme.primaryCta}`}
                >
                  Thử tải lại
                </button>
              </div>
            ) : displayedChannels.length === 0 ? (
              <div className={`py-8 text-center space-y-2 text-sm font-bold ${theme.textMuted}`}>
                <p>
                  {onlyLiveFilter
                    ? 'Chưa có kênh Live nào trong nhóm này (hoặc đang ping).'
                    : selectedGroup === '__favorites__'
                    ? 'Chưa có kênh yêu thích — bấm biểu tượng ⭐ cạnh tên kênh để lưu nhanh.'
                    : 'Không tìm thấy kênh phù hợp.'}
                </p>
                {onlyLiveFilter && (
                  <button
                    type="button"
                    onClick={() => setOnlyLiveFilter(false)}
                    className={`min-h-[2.4rem] px-4 rounded-full text-xs font-extrabold ${theme.primaryCta}`}
                  >
                    Hiện lại tất cả kênh
                  </button>
                )}
              </div>
            ) : (
              <div className="tv-channel-grid pb-1">
                {displayedChannels.map((ch) => {
                  const isSelected = activeChannel?.id === ch.id;
                  const isFav = favoriteSet.has(getChannelFavKey(ch));
                  const ping = pingMap[ch.id];
                  return (
                    <div
                      key={ch.id}
                      className={`w-full min-h-[3.35rem] rounded-xl border flex items-center gap-2 p-2 transition ${
                        isSelected
                          ? isLightTheme
                            ? 'bg-blue-50 border-blue-500 shadow-sm'
                            : 'bg-sky-500/25 border-sky-400/70 shadow-md'
                          : theme.itemIdle
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveChannel(ch)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:scale-[0.99]"
                      >
                        <div
                          className={`w-12 h-9 rounded-lg border flex items-center justify-center overflow-hidden p-1 shrink-0 ${
                            isLightTheme
                              ? 'bg-slate-900 border-slate-300'
                              : 'bg-black/55 border-white/10'
                          }`}
                        >
                          {ch.logo && !failedLogos[ch.id] ? (
                            <img
                              src={ch.logo}
                              alt=""
                              loading="lazy"
                              onError={() =>
                                setFailedLogos((prev) => ({ ...prev, [ch.id]: true }))
                              }
                              className="w-full h-full object-contain"
                            />
                          ) : ch.isRadio ? (
                            <Radio className="w-5 h-5 text-emerald-400" />
                          ) : ch.isVod ? (
                            <Film className="w-5 h-5 text-amber-300" />
                          ) : (
                            <Tv className="w-5 h-5 text-sky-300" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            className={`text-sm font-extrabold truncate leading-snug ${theme.text}`}
                          >
                            {ch.name}
                          </h4>
                          <div
                            className={`flex items-center gap-1 text-xs font-semibold mt-0.5 ${theme.textMuted}`}
                          >
                            <span className="truncate">{ch.group}</span>
                            {ch.isRadio && (
                              <span
                                className={`px-1 rounded text-[0.65rem] font-bold shrink-0 ${
                                  isLightTheme
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                FM
                              </span>
                            )}
                            {ch.isVod && (
                              <span
                                className={`px-1 rounded text-[0.65rem] font-bold shrink-0 ${
                                  isLightTheme
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                VOD
                              </span>
                            )}
                            {ch.manifestType === 'mpd' && (
                              <span
                                className={`px-1 rounded text-[0.65rem] font-bold shrink-0 ${
                                  isLightTheme
                                    ? 'bg-violet-100 text-violet-800'
                                    : 'bg-violet-500/25 text-violet-200'
                                }`}
                              >
                                MPD
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Nhãn Ping Live / Off + độ trễ ms */}
                      <PingBadge ping={ping} isLightTheme={isLightTheme} compact />

                      <button
                        type="button"
                        onClick={() => toggleFavoriteChannel(ch)}
                        aria-label={isFav ? `Bỏ yêu thích ${ch.name}` : `Lưu ${ch.name}`}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 active:scale-90 transition ${
                          isFav
                            ? 'text-amber-500'
                            : isLightTheme
                            ? 'text-slate-400 hover:text-slate-700'
                            : 'text-white/35 hover:text-white/75'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-amber-500' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TvLiveView;
