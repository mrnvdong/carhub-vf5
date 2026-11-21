import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clapperboard,
  Search,
  SlidersHorizontal,
  Heart,
  Clock,
  Play,
  ArrowLeft,
  Star,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  Film,
  Globe,
  Calendar,
  Layers,
  Check,
} from 'lucide-react';
import {
  MovieDetail,
  MovieEpisode,
  MovieItem,
  MovieListType,
  MovieSource,
  MovieTaxon,
  MovieWatchHistoryItem,
} from '../types';
import {
  MOVIE_YEARS,
  fetchMovieDetail,
  fetchMovieList,
  fetchMovieMeta,
  getMovieKey,
  getMovieTabsForSource,
  loadMovieFavorites,
  loadMovieHistory,
  removeMovieHistoryItem,
  saveMovieHistoryItem,
  toggleMovieFavoriteStorage,
} from '../services/movie';
import { formatSeconds } from '../services/api';
import { pushExtrasSyncData } from '../services/sync';
import { MoviePlayerStage } from './MoviePlayerStage';
import { getCarTheme } from '../utils/theme';

export interface MovieExternalCommand {
  nonce: number;
  search?: string;
  open?: { slug: string; source: MovieSource };
}

interface MoviesViewProps {
  isLightTheme: boolean;
  onPauseOtherAudio: () => void;
  onNotifyToast: (msg: string) => void;
  syncCode?: string;
  syncPullNonce?: number;
  moviePreferDub?: boolean;
  drivingVideoLock?: boolean;
  currentSpeedKmh?: number | null;
  externalCommand?: MovieExternalCommand | null;
}

type LibraryMode = 'browse' | 'favorites' | 'history';

function getLangBadgeStyle(lang: string): string {
  const low = lang.toLowerCase();
  if (low.includes('thuyết minh') || low.includes('song ngữ')) return 'bg-emerald-500 text-slate-950';
  if (low.includes('lồng tiếng')) return 'bg-amber-400 text-slate-950';
  if (low.includes('trực tiếp') || low.includes('live')) return 'bg-rose-600 text-white';
  if (low.includes('multi-sub')) return 'bg-cyan-500 text-slate-950';
  return 'bg-slate-900/85 text-white border border-white/20';
}

const MOVIE_SOURCE_OPTIONS: Array<{
  id: MovieSource;
  icon: string;
  label: string;
  activeClass: string;
}> = [
  { id: 'kkphim', icon: '🎬', label: 'KKPhim', activeClass: 'bg-violet-600 text-white shadow' },
  { id: 'vsmov', icon: '🍿', label: 'VSMov', activeClass: 'bg-rose-600 text-white shadow' },
  { id: 'cobephim', icon: '🎀', label: 'CoBePhim', activeClass: 'bg-fuchsia-600 text-white shadow' },
  { id: 'k20', icon: '⚡', label: 'K20 4K', activeClass: 'bg-amber-500 text-slate-950 shadow' },
];

function getSourceLabel(src: MovieSource): string {
  if (src === 'vsmov') return 'VSMov';
  if (src === 'cobephim') return 'CoBePhim';
  if (src === 'k20') return 'K20';
  return 'KKPhim';
}

function getSourceBadgeClass(src: MovieSource): string {
  if (src === 'vsmov') return 'bg-rose-600 text-white';
  if (src === 'cobephim') return 'bg-fuchsia-600 text-white';
  if (src === 'k20') return 'bg-amber-500 text-slate-950';
  return 'bg-violet-600 text-white';
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  isLightTheme,
  onPauseOtherAudio,
  onNotifyToast,
  syncCode = '',
  syncPullNonce = 0,
  moviePreferDub = true,
  drivingVideoLock = false,
  currentSpeedKmh = null,
  externalCommand = null,
}) => {
  const theme = getCarTheme(isLightTheme);
  const browseScrollRef = useRef<HTMLDivElement>(null);

  // 4 kho phim sạch QC chuẩn CarPlay: KKPhim | VSMov | CoBePhim | K20 (Phim 4K & CLB Phim Xưa)
  const [movieSource, setMovieSourceState] = useState<MovieSource>(() => {
    try {
      const saved = localStorage.getItem('carhub_movie_source');
      if (saved === 'vsmov' || saved === 'cobephim' || saved === 'k20') {
        return saved;
      }
      return 'kkphim';
    } catch {
      return 'kkphim';
    }
  });

  // Danh mục & Bộ lọc
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('browse');
  const [activeTab, setActiveTab] = useState<MovieListType>('moi-cap-nhat');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [searchAllSources, setSearchAllSources] = useState<boolean>(true);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedSortLang, setSelectedSortLang] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  const handleChangeMovieSource = (nextSource: MovieSource) => {
    if (nextSource === movieSource) return;
    setMovieSourceState(nextSource);
    try {
      localStorage.setItem('carhub_movie_source', nextSource);
    } catch {}
    setLibraryMode('browse');
    setActiveTab('moi-cap-nhat');
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedYear('');
    setSelectedSortLang('');
    setPage(1);
    onNotifyToast(
      nextSource === 'vsmov'
        ? '🍿 Đã chuyển sang VSMov (1080p Sạch QC & Chiếu rạp)'
        : nextSource === 'cobephim'
        ? '🎀 Đã chuyển sang CoBePhim (Song Ngữ & Đa Server KK/VS)'
        : nextSource === 'k20'
        ? '⚡ Đã chuyển sang K20 (Phim 4K & CLB Phim Xưa)'
        : '🎬 Đã chuyển sang KKPhim (1080p HLS Sạch QC)'
    );
  };

  // Meta Thể loại & Quốc gia từ /api/movie?action=meta&source=...
  const [genres, setGenres] = useState<MovieTaxon[]>([]);
  const [countries, setCountries] = useState<MovieTaxon[]>([]);

  // Danh sách phim hiện tại
  const [items, setItems] = useState<MovieItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [updateToday, setUpdateToday] = useState<number>(0);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Lịch sử xem & Phim yêu thích đa nguồn (localStorage)
  const [history, setHistory] = useState<MovieWatchHistoryItem[]>(() => loadMovieHistory());
  const [favorites, setFavorites] = useState<MovieItem[]>(() => loadMovieFavorites());
  const favoriteSet = useMemo(
    () => new Set(favorites.map((x) => getMovieKey(x.source, x.slug))),
    [favorites]
  );
  const activeSourceTabs = useMemo(() => getMovieTabsForSource(movieSource), [movieSource]);

  // Trạng thái Phòng Chiếu Phim (Detail + Watch)
  const [activeTarget, setActiveTarget] = useState<{ slug: string; source: MovieSource } | null>(
    null
  );
  const [movieDetail, setMovieDetail] = useState<MovieDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [serverIdx, setServerIdx] = useState<number>(0);
  const [episodeIdx, setEpisodeIdx] = useState<number>(0);
  const [resumeTimeSec, setResumeTimeSec] = useState<number>(0);
  const [episodeChunkPage, setEpisodeChunkPage] = useState<number>(0);
  const [relatedMovies, setRelatedMovies] = useState<MovieItem[]>([]);

  const detailLoadTokenRef = useRef<number>(0);
  const latestPlayPosRef = useRef<number>(0);

  // Tải Meta Thể loại + Quốc gia theo nguồn đang chọn (KKPhim hoặc VSMov)
  useEffect(() => {
    let cancelled = false;
    fetchMovieMeta(movieSource)
      .then((m) => {
        if (!cancelled) {
          setGenres(m.genres || []);
          setCountries(m.countries || []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [movieSource]);

  // Tải danh sách phim theo nguồn / tab / từ khóa / bộ lọc / trang
  useEffect(() => {
    if (libraryMode !== 'browse') return;
    let cancelled = false;

    const load = async () => {
      setIsLoadingList(true);
      setListError(null);
      try {
        // Tìm gộp cả 4 kho phim song song (KKPhim + VSMov + CoBePhim + K20 4K) khi có từ khóa & bật chế độ gộp!
        if (searchKeyword && searchAllSources) {
          const sources: MovieSource[] = ['k20', 'kkphim', 'vsmov', 'cobephim'];
          const settled = await Promise.allSettled(
            sources.map((src) =>
              fetchMovieList({
                source: src,
                type: 'moi-cap-nhat',
                keyword: searchKeyword,
                page: 1,
                limit: 12,
              })
            )
          );
          if (cancelled) return;
          const merged: MovieItem[] = [];
          const seen = new Set<string>();
          for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            const src = sources[i];
            if (r.status !== 'fulfilled' || !Array.isArray(r.value.items)) continue;
            for (const item of r.value.items) {
              const withSrc: MovieItem = { ...item, source: item.source || src };
              const k = getMovieKey(withSrc.source, withSrc.slug);
              if (seen.has(k)) continue;
              seen.add(k);
              merged.push(withSrc);
            }
          }
          // Ưu tiên 4K & Thuyết minh/Lồng tiếng lên đầu cho tài xế VF5!
          const scoreMovie = (m: MovieItem): number => {
            let s = 0;
            if ((m.quality || '').toUpperCase().includes('4K')) s += 4;
            const lowLang = (m.lang || '').toLowerCase();
            if (lowLang.includes('thuyết minh') || lowLang.includes('lồng tiếng')) s += 3;
            if (lowLang.includes('song ngữ')) s += 2;
            if (m.source === 'k20') s += 1;
            return s;
          };
          merged.sort((a, b) => scoreMovie(b) - scoreMovie(a));

          setItems(merged);
          setTotalPages(1);
          setTotalItems(merged.length);
          setUpdateToday(0);
          if (browseScrollRef.current) {
            browseScrollRef.current.scrollTop = 0;
          }
          return;
        }

        const res = await fetchMovieList({
          source: movieSource,
          type: activeTab,
          page,
          limit: 24,
          category: movieSource === 'k20' ? '' : selectedGenre,
          country: movieSource === 'k20' ? '' : selectedCountry,
          year: movieSource === 'cobephim' || movieSource === 'k20' ? '' : selectedYear,
          sortLang: movieSource === 'kkphim' ? selectedSortLang : '',
          keyword: searchKeyword,
        });
        if (cancelled) return;
        setItems(res.items || []);
        setTotalPages(Math.max(1, res.totalPages || 1));
        setTotalItems(res.totalItems || res.items?.length || 0);
        setUpdateToday(res.updateToday || 0);
        if (browseScrollRef.current) {
          browseScrollRef.current.scrollTop = 0;
        }
      } catch (err: any) {
        if (!cancelled) {
          setListError(
            err?.message ||
              `Không tải được danh sách phim từ ${getSourceLabel(movieSource)}`
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingList(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    movieSource,
    libraryMode,
    activeTab,
    page,
    selectedGenre,
    selectedCountry,
    selectedYear,
    selectedSortLang,
    searchKeyword,
    searchAllSources,
    reloadNonce,
  ]);

  const activeFiltersCount =
    (movieSource !== 'k20' && selectedGenre ? 1 : 0) +
    (movieSource !== 'k20' && selectedCountry ? 1 : 0) +
    (movieSource !== 'cobephim' && movieSource !== 'k20' && selectedYear ? 1 : 0) +
    (movieSource === 'kkphim' && selectedSortLang ? 1 : 0);

  const clearAllFilters = () => {
    setSelectedGenre('');
    setSelectedCountry('');
    setSelectedYear('');
    setSelectedSortLang('');
    setSearchInput('');
    setSearchKeyword('');
    setPage(1);
  };

  // Mở 1 bộ phim từ KKPhim hoặc VSMov (tự khôi phục đúng Server + Tập + Giây đang xem dở nếu có!)
  const openMovie = useCallback(
    async (slug: string, sourceArg?: MovieSource, historyHint?: MovieWatchHistoryItem) => {
      if (!slug) return;
      const src: MovieSource = sourceArg || historyHint?.source || movieSource;
      const token = ++detailLoadTokenRef.current;
      setActiveTarget({ slug, source: src });
      setMovieDetail(null);
      setDetailError(null);
      setIsLoadingDetail(true);
      setRelatedMovies([]);
      latestPlayPosRef.current = 0;

      const targetKey = getMovieKey(src, slug);
      const savedHist =
        historyHint || history.find((h) => getMovieKey(h.source, h.slug) === targetKey);

      try {
        const det = await fetchMovieDetail(slug, src);
        if (detailLoadTokenRef.current !== token) return;
        const normalizedDet: MovieDetail = { ...det, source: src };
        setMovieDetail(normalizedDet);
        setIsLoadingDetail(false);

        let targetSrv = 0;
        let targetEp = 0;
        let targetResume = 0;

        if (savedHist && normalizedDet.servers.length > 0) {
          const foundSrvIdx =
            normalizedDet.servers[savedHist.serverIndex] !== undefined
              ? savedHist.serverIndex
              : Math.max(
                  0,
                  normalizedDet.servers.findIndex((s) => s.serverName === savedHist.serverName)
                );
          targetSrv = foundSrvIdx;
          const eps = normalizedDet.servers[targetSrv]?.episodes || [];
          const foundEpIdx = eps.findIndex((e) => e.slug === savedHist.episodeSlug);
          if (foundEpIdx >= 0) {
            targetEp = foundEpIdx;
            targetResume = savedHist.currentTime || 0;
          }
        } else if (normalizedDet.servers.length > 1) {
          if (activeTab === 'phim-thuyet-minh') {
            const idx = normalizedDet.servers.findIndex((s) =>
              s.serverName.toLowerCase().includes('thuyết minh')
            );
            if (idx >= 0) targetSrv = idx;
          } else if (activeTab === 'phim-long-tieng') {
            const idx = normalizedDet.servers.findIndex((s) =>
              s.serverName.toLowerCase().includes('lồng tiếng')
            );
            if (idx >= 0) targetSrv = idx;
          } else if (moviePreferDub) {
            // Tự động ưu tiên bản Thuyết Minh / Lồng Tiếng (tránh server 4K mã hóa CoBePhim) để nghe dễ trên xe VF5!
            const idx = normalizedDet.servers.findIndex((s) => {
              const low = s.serverName.toLowerCase();
              return (
                (low.includes('thuyết minh') || low.includes('lồng tiếng')) &&
                !(src === 'cobephim' && low.includes('4k'))
              );
            });
            if (idx >= 0) targetSrv = idx;
          }
        }

        setServerIdx(targetSrv);
        setEpisodeIdx(targetEp);
        setResumeTimeSec(targetResume);
        setEpisodeChunkPage(Math.floor(targetEp / 30));

        // Với nguồn chỉ có Embed (như VSMov), lưu luôn tập đang mở vào "Tiếp tục xem"
        const chosenSrv = normalizedDet.servers[targetSrv];
        const chosenEp = chosenSrv?.episodes?.[targetEp];
        if (chosenSrv && chosenEp && !chosenEp.linkM3u8 && chosenEp.linkEmbed) {
          const updated = saveMovieHistoryItem({
            source: src,
            slug: normalizedDet.slug,
            name: normalizedDet.name,
            originName: normalizedDet.originName,
            posterUrl: normalizedDet.posterUrl,
            thumbUrl: normalizedDet.thumbUrl,
            quality: normalizedDet.quality,
            lang: normalizedDet.lang,
            year: normalizedDet.year,
            serverIndex: targetSrv,
            serverName: chosenSrv.serverName,
            episodeSlug: chosenEp.slug,
            episodeName: chosenEp.name,
            currentTime: targetResume,
            duration: 0,
            updatedAt: Date.now(),
          });
          setHistory(updated);
        }

        // Nạp thêm phim gợi ý cùng thể loại đầu tiên trên cùng nguồn
        const primaryCat = normalizedDet.categories?.[0]?.slug;
        if (primaryCat) {
          fetchMovieList({
            source: src,
            type: 'moi-cap-nhat',
            category: primaryCat,
            page: 1,
            limit: 12,
          })
            .then((rel) => {
              if (detailLoadTokenRef.current === token) {
                setRelatedMovies(
                  (rel.items || []).filter((x) => x.slug !== normalizedDet.slug).slice(0, 8)
                );
              }
            })
            .catch(() => {});
        }
      } catch (err: any) {
        if (detailLoadTokenRef.current !== token) return;
        setIsLoadingDetail(false);
        setDetailError(err?.message || 'Không tải được chi tiết bộ phim');
      }
    },
    [movieSource, history, activeTab, moviePreferDub]
  );

  const activeServer = movieDetail?.servers?.[serverIdx] || null;
  const activeEpisodes: MovieEpisode[] = activeServer?.episodes || [];
  const activeEpisode: MovieEpisode | null = activeEpisodes[episodeIdx] || null;

  // Đổi Server âm thanh giữ nguyên tập & thời điểm đang xem!
  const handleSwitchServer = (nextSrvIdx: number) => {
    if (!movieDetail || nextSrvIdx === serverIdx) return;
    const nextSrv = movieDetail.servers[nextSrvIdx];
    if (!nextSrv) return;
    const clampedEp = Math.min(episodeIdx, Math.max(0, nextSrv.episodes.length - 1));
    setServerIdx(nextSrvIdx);
    setEpisodeIdx(clampedEp);
    setResumeTimeSec(latestPlayPosRef.current);
    onNotifyToast(`🎙️ Đã chuyển sang ${nextSrv.serverName}`);
  };

  const handleSelectEpisode = (idx: number) => {
    if (idx < 0 || idx >= activeEpisodes.length) return;
    setEpisodeIdx(idx);
    setResumeTimeSec(0);
    latestPlayPosRef.current = 0;
    setEpisodeChunkPage(Math.floor(idx / 30));
    // Lưu lịch sử ngay khi chuyển tập trên nguồn Embed (VSMov)
    const nextEp = activeEpisodes[idx];
    if (movieDetail && activeServer && nextEp && !nextEp.linkM3u8 && nextEp.linkEmbed) {
      const updated = saveMovieHistoryItem({
        source: movieDetail.source || activeTarget?.source || movieSource,
        slug: movieDetail.slug,
        name: movieDetail.name,
        originName: movieDetail.originName,
        posterUrl: movieDetail.posterUrl,
        thumbUrl: movieDetail.thumbUrl,
        quality: movieDetail.quality,
        lang: movieDetail.lang,
        year: movieDetail.year,
        serverIndex: serverIdx,
        serverName: activeServer.serverName,
        episodeSlug: nextEp.slug,
        episodeName: nextEp.name,
        currentTime: 0,
        duration: 0,
        updatedAt: Date.now(),
      });
      setHistory(updated);
    }
  };

  const handleProgressSave = useCallback(
    (curSec: number, durSec: number) => {
      latestPlayPosRef.current = curSec;
      if (!movieDetail || !activeServer || !activeEpisode) return;
      const entry: MovieWatchHistoryItem = {
        source: movieDetail.source || activeTarget?.source || movieSource,
        slug: movieDetail.slug,
        name: movieDetail.name,
        originName: movieDetail.originName,
        posterUrl: movieDetail.posterUrl,
        thumbUrl: movieDetail.thumbUrl,
        quality: movieDetail.quality,
        lang: movieDetail.lang,
        year: movieDetail.year,
        serverIndex: serverIdx,
        serverName: activeServer.serverName,
        episodeSlug: activeEpisode.slug,
        episodeName: activeEpisode.name,
        currentTime: Math.floor(curSec),
        duration: Math.floor(durSec),
        updatedAt: Date.now(),
      };
      const updated = saveMovieHistoryItem(entry);
      setHistory(updated);
    },
    [movieDetail, activeServer, activeEpisode, serverIdx, activeTarget, movieSource]
  );

  // Nạp lại Phim Yêu thích & Lịch sử xem mỗi khi App vừa đồng bộ từ mây về
  useEffect(() => {
    if (syncPullNonce > 0) {
      setFavorites(loadMovieFavorites());
      setHistory(loadMovieHistory());
    }
  }, [syncPullNonce]);

  // Tự động đẩy Phim Yêu thích & Lịch sử xem dở lên Mã Xe CARHUB_KV (debounce 3s)
  const movieSyncInitRef = useRef(true);
  useEffect(() => {
    if (movieSyncInitRef.current) {
      movieSyncInitRef.current = false;
      return;
    }
    if (!syncCode || syncCode.length < 4) return;
    const t = window.setTimeout(() => {
      pushExtrasSyncData(syncCode, {
        movieFavorites: favorites,
        movieHistory: history,
      }).catch(() => {});
    }, 3000);
    return () => window.clearTimeout(t);
  }, [favorites, history, syncCode]);

  // Nhận lệnh từ Trợ lý giọng nói ("Mở phim ...") hoặc Co-Pilot ghế sau ("openMovie")
  const handledCmdNonceRef = useRef<number>(0);
  useEffect(() => {
    if (!externalCommand || externalCommand.nonce === handledCmdNonceRef.current) return;
    handledCmdNonceRef.current = externalCommand.nonce;
    if (externalCommand.open) {
      openMovie(externalCommand.open.slug, externalCommand.open.source);
    } else if (externalCommand.search) {
      setActiveTarget(null);
      setMovieDetail(null);
      setLibraryMode('browse');
      setSearchAllSources(true);
      setSearchInput(externalCommand.search);
      setSearchKeyword(externalCommand.search);
      setPage(1);
    }
  }, [externalCommand, openMovie]);

  const handleToggleFavorite = (movie: MovieItem) => {
    const withSource: MovieItem = { ...movie, source: movie.source || movieSource };
    const { list, isFav } = toggleMovieFavoriteStorage(withSource);
    setFavorites(list);
    onNotifyToast(isFav ? `❤️ Đã lưu phim "${movie.name}"` : `💔 Đã bỏ lưu "${movie.name}"`);
  };

  const handleRemoveHistory = (
    slug: string,
    src: MovieSource | undefined,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const updated = removeMovieHistoryItem(slug, src || 'kkphim');
    setHistory(updated);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLibraryMode('browse');
    setSearchKeyword(searchInput.trim());
    setPage(1);
  };

  const handleFindOnOtherSource = (targetSrc?: MovieSource) => {
    if (!movieDetail) return;
    const curSrc = movieDetail.source || activeTarget?.source || movieSource;
    const otherSrc: MovieSource =
      targetSrc || (curSrc === 'kkphim' ? 'vsmov' : 'kkphim');
    const kw = movieDetail.name || movieDetail.originName;
    setActiveTarget(null);
    setMovieDetail(null);
    setMovieSourceState(otherSrc);
    try {
      localStorage.setItem('carhub_movie_source', otherSrc);
    } catch {}
    setLibraryMode('browse');
    setActiveTab('moi-cap-nhat');
    setSearchInput(kw);
    setSearchKeyword(kw);
    setPage(1);
    onNotifyToast(`🔍 Đang tìm "${kw}" trên ${getSourceLabel(otherSrc)}...`);
  };

  // =========================================================================
  // CHẾ ĐỘ 2: PHÒNG CHIẾU PHIM CHI TIẾT (PLAYER 1080P SẠCH QC / VSMOV EMBED + TẬP PHIM + ĐỀ XUẤT)
  // =========================================================================
  if (activeTarget) {
    const epChunkCount = Math.ceil(activeEpisodes.length / 30);
    const epStart = episodeChunkPage * 30;
    const epSlice = activeEpisodes.slice(epStart, epStart + 30);
    const activeSrc = movieDetail?.source || activeTarget.source;
    const isFavCurrent = movieDetail
      ? favoriteSet.has(getMovieKey(activeSrc, movieDetail.slug))
      : false;

    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2 max-w-[1920px] mx-auto w-full animate-ios-browse-in">
        {/* Header phòng chiếu (cân đối 1 hàng gọn gàng trên mọi màn hình) */}
        <div
          className={`rounded-2xl border p-2 sm:p-2.5 flex items-center justify-between gap-2 shrink-0 ${theme.card}`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setActiveTarget(null);
                setMovieDetail(null);
              }}
              className={`h-10 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 shrink-0 active:scale-95 transition ${theme.iconBtn}`}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Kho phim</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[0.62rem] font-black uppercase shrink-0 ${getSourceBadgeClass(
                    activeSrc
                  )}`}
                >
                  {getSourceLabel(activeSrc)}
                </span>
                <h2 className={`text-sm sm:text-base font-black truncate ${theme.text}`}>
                  {movieDetail?.name || 'Đang tải phim...'}
                </h2>
              </div>
              {movieDetail?.originName && (
                <p className={`text-[0.7rem] sm:text-xs font-semibold truncate ${theme.textSub}`}>
                  {movieDetail.originName}
                  {movieDetail.year ? ` (${movieDetail.year})` : ''}
                  {movieDetail.quality ? ` • ${movieDetail.quality}` : ''}
                  {movieDetail.lang ? ` • ${movieDetail.lang}` : ''}
                </p>
              )}
            </div>
          </div>

          {movieDetail && (
            <div className="flex items-center gap-1.5 shrink-0">
              {(['kkphim', 'vsmov', 'cobephim', 'k20'] as MovieSource[])
                .filter((s) => s !== activeSrc)
                .slice(0, 2)
                .map((other) => (
                  <button
                    key={other}
                    type="button"
                    onClick={() => handleFindOnOtherSource(other)}
                    title={`Tìm bộ phim này trên nguồn ${getSourceLabel(other)}`}
                    className={`h-10 px-2.5 rounded-xl border text-xs font-extrabold hidden md:flex items-center gap-1 active:scale-95 transition ${theme.iconBtn}`}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span>{getSourceLabel(other)}</span>
                  </button>
                ))}

              <button
                type="button"
                onClick={() => handleToggleFavorite(movieDetail)}
                className={`h-10 px-3 rounded-xl border text-xs font-black flex items-center gap-1.5 active:scale-95 transition ${
                  isFavCurrent
                    ? 'bg-rose-600 border-rose-500 text-white shadow'
                    : theme.iconBtn
                }`}
              >
                <Heart className={`w-4 h-4 shrink-0 ${isFavCurrent ? 'fill-white' : ''}`} />
                <span className="hidden sm:inline">{isFavCurrent ? 'Đã lưu' : 'Yêu thích'}</span>
              </button>
            </div>
          )}
        </div>

        {isLoadingDetail ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-9 h-9 text-violet-500 animate-spin" />
            <p className={`text-sm font-bold ${theme.textSub}`}>
              Đang nạp thông tin &amp; nguồn phát từ {getSourceLabel(activeTarget.source)}...
            </p>
          </div>
        ) : detailError || !movieDetail ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-4">
            <AlertCircle className="w-10 h-10 text-rose-500" />
            <p className={`text-sm font-bold ${theme.text}`}>{detailError || 'Không tìm thấy phim'}</p>
            <button
              type="button"
              onClick={() => openMovie(activeTarget.slug, activeTarget.source)}
              className="min-h-[2.6rem] px-5 rounded-xl bg-violet-600 text-white text-xs font-black"
            >
              Thử tải lại
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto car:overflow-hidden grid grid-cols-1 car:grid-cols-12 gap-3">
            {/* CỘT CHÍNH: TRÌNH PHÁT PHIM 16:9 + SERVER ÂM THANH + MÔ TẢ CHI TIẾT */}
            <div className="car:col-span-8 xl:col-span-9 car:min-h-0 car:overflow-y-auto no-scrollbar space-y-3 pr-0.5 pb-4">
              <MoviePlayerStage
                movieTitle={movieDetail.name}
                posterUrl={movieDetail.thumbUrl || movieDetail.posterUrl}
                serverName={activeServer?.serverName || movieDetail.lang}
                episode={activeEpisode}
                resumeTimeSec={resumeTimeSec}
                hasPrevEpisode={episodeIdx > 0}
                hasNextEpisode={episodeIdx < activeEpisodes.length - 1}
                nextEpisodeName={activeEpisodes[episodeIdx + 1]?.name}
                onPrevEpisode={() => handleSelectEpisode(episodeIdx - 1)}
                onNextEpisode={() => handleSelectEpisode(episodeIdx + 1)}
                onBeforePlay={onPauseOtherAudio}
                onProgressSave={handleProgressSave}
                onNotifyToast={onNotifyToast}
                drivingVideoLock={drivingVideoLock}
                currentSpeedKmh={currentSpeedKmh}
              />

              {/* THANH CHUYỂN SERVER ÂM THANH / MÙA PHIM + NÚT TẬP TRƯỚC/SAU NHANH */}
              {movieDetail.servers.length > 0 && (
                <div className={`rounded-2xl border p-3 space-y-2 ${theme.card}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-black uppercase tracking-wider ${theme.textSub}`}>
                        🎙️ Nguồn phát ({getSourceLabel(activeSrc)})
                      </span>
                      {activeEpisode?.filename && activeEpisode.filename !== activeEpisode.name && (
                        <span className={`text-xs font-bold truncate max-w-[20rem] ${theme.text}`}>
                          • {activeEpisode.filename}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {activeEpisodes.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={episodeIdx <= 0}
                            onClick={() => handleSelectEpisode(episodeIdx - 1)}
                            className={`min-h-[2rem] px-2.5 rounded-lg border text-xs font-extrabold disabled:opacity-35 active:scale-95 ${theme.iconBtn}`}
                          >
                            ◀ Tập trước
                          </button>
                          <button
                            type="button"
                            disabled={episodeIdx >= activeEpisodes.length - 1}
                            onClick={() => handleSelectEpisode(episodeIdx + 1)}
                            className="min-h-[2rem] px-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold disabled:opacity-35 active:scale-95"
                          >
                            Tập tiếp ▶
                          </button>
                        </>
                      )}
                      {movieDetail.episodeCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-600/20 border border-violet-400/40 text-violet-400 text-[0.7rem] font-black">
                          {movieDetail.episodeCurrent}
                          {movieDetail.episodeTotal ? ` / ${movieDetail.episodeTotal}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {movieDetail.servers.map((srv, idx) => {
                      const active = idx === serverIdx;
                      return (
                        <button
                          key={`${srv.serverName}-${idx}`}
                          type="button"
                          onClick={() => handleSwitchServer(idx)}
                          className={`min-h-[2.35rem] px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition ${
                            active
                              ? 'bg-violet-600 border-violet-500 text-white shadow'
                              : theme.chipIdle
                          }`}
                        >
                          {active && <Check className="w-3.5 h-3.5" />}
                          <span>{srv.serverName}</span>
                          <span className="opacity-75 text-[0.68rem]">({srv.episodes.length} tập)</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* THÔNG TIN & NỘI DUNG BỘ PHIM */}
              <div className={`rounded-2xl border p-3.5 sm:p-4 space-y-3 ${theme.card}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {movieDetail.rating > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-black">
                      <Star className="w-3.5 h-3.5 fill-slate-950" />
                      <span>{movieDetail.rating}</span>
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-full bg-violet-600 text-white text-xs font-black">
                    {movieDetail.quality}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-black ${getLangBadgeStyle(
                      movieDetail.lang
                    )}`}
                  >
                    {movieDetail.lang}
                  </span>
                  {movieDetail.time && (
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${theme.chipIdle}`}>
                      ⏱ {movieDetail.time}
                    </span>
                  )}
                  {movieDetail.year > 0 && (
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-bold ${theme.chipIdle}`}>
                      📅 {movieDetail.year}
                    </span>
                  )}
                </div>

                {/* Thể loại & Quốc gia (bấm để lọc nhanh!) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {movieDetail.categories.map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => {
                        setMovieSourceState(activeSrc);
                        setActiveTarget(null);
                        setLibraryMode('browse');
                        setActiveTab('moi-cap-nhat');
                        setSelectedGenre(cat.slug);
                        setPage(1);
                      }}
                      className={`min-h-[2rem] px-2.5 rounded-lg border text-xs font-bold active:scale-95 transition ${theme.iconBtn}`}
                    >
                      #{cat.name}
                    </button>
                  ))}
                  {movieDetail.countries.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => {
                        setMovieSourceState(activeSrc);
                        setActiveTarget(null);
                        setLibraryMode('browse');
                        setActiveTab('moi-cap-nhat');
                        setSelectedCountry(c.slug);
                        setPage(1);
                      }}
                      className={`min-h-[2rem] px-2.5 rounded-lg border text-xs font-bold active:scale-95 transition ${theme.iconBtn}`}
                    >
                      🌍 {c.name}
                    </button>
                  ))}
                </div>

                {movieDetail.content && (
                  <p className={`text-xs sm:text-sm leading-relaxed font-medium ${theme.text}`}>
                    {movieDetail.content}
                  </p>
                )}

                {(movieDetail.directors.length > 0 || movieDetail.actors.length > 0) && (
                  <div className={`pt-2.5 border-t space-y-1 text-xs ${theme.divider} ${theme.textSub}`}>
                    {movieDetail.directors.length > 0 && (
                      <p>
                        <strong className={theme.text}>Đạo diễn:</strong>{' '}
                        {movieDetail.directors.join(', ')}
                      </p>
                    )}
                    {movieDetail.actors.length > 0 && (
                      <p>
                        <strong className={theme.text}>Diễn viên:</strong>{' '}
                        {movieDetail.actors.slice(0, 12).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* CỘT PHẢI: CHỌN TẬP PHIM + PHIM ĐỀ XUẤT CÙNG THỂ LOẠI */}
            <div className="car:col-span-4 xl:col-span-3 flex flex-col gap-2.5 car:min-h-0 car:overflow-y-auto no-scrollbar pb-4">
              {/* Bảng chọn tập phim */}
              {activeEpisodes.length > 1 && (
                <div className={`rounded-2xl border p-3 space-y-2.5 ${theme.card}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`text-xs sm:text-sm font-black ${theme.text}`}>
                      📺 Danh sách tập ({activeEpisodes.length})
                    </h3>
                  </div>

                  {/* Nhóm khoảng tập (1-30, 31-60...) cho phim bộ dài tập */}
                  {epChunkCount > 1 && (
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                      {Array.from({ length: epChunkCount }, (_, i) => {
                        const s = i * 30 + 1;
                        const e = Math.min((i + 1) * 30, activeEpisodes.length);
                        const active = i === episodeChunkPage;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setEpisodeChunkPage(i)}
                            className={`min-h-[2rem] px-2.5 rounded-lg border text-xs font-extrabold whitespace-nowrap active:scale-95 transition ${
                              active
                                ? 'bg-violet-600 border-violet-500 text-white'
                                : theme.chipIdle
                            }`}
                          >
                            {s}–{e}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-3 sm:grid-cols-4 car:grid-cols-3 gap-1.5 max-h-[19rem] overflow-y-auto no-scrollbar pr-0.5">
                    {epSlice.map((ep, localIdx) => {
                      const absIdx = epStart + localIdx;
                      const isCurrent = absIdx === episodeIdx;
                      return (
                        <button
                          key={`${ep.slug}-${absIdx}`}
                          type="button"
                          title={ep.filename || ep.name}
                          onClick={() => handleSelectEpisode(absIdx)}
                          className={`min-h-[2.5rem] px-2 rounded-xl border text-xs font-extrabold truncate active:scale-95 transition ${
                            isCurrent
                              ? 'bg-violet-600 border-violet-400 text-white shadow-md'
                              : theme.itemIdle
                          }`}
                        >
                          {ep.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Phim đề xuất cùng thể loại */}
              {relatedMovies.length > 0 && (
                <div className={`rounded-2xl border p-3 space-y-2 ${theme.card}`}>
                  <h3 className={`text-xs sm:text-sm font-black ${theme.text}`}>
                    🎬 Phim cùng thể loại
                  </h3>
                  <div className="space-y-1.5">
                    {relatedMovies.map((rel) => (
                      <button
                        key={getMovieKey(rel.source || activeSrc, rel.slug)}
                        type="button"
                        onClick={() => openMovie(rel.slug, rel.source || activeSrc)}
                        className={`w-full text-left flex items-center gap-2.5 p-2 rounded-xl border active:scale-[0.99] transition ${theme.itemIdle}`}
                      >
                        <img
                          src={rel.posterUrl || rel.thumbUrl}
                          alt={rel.name}
                          loading="lazy"
                          className="w-11 h-16 rounded-lg object-cover shrink-0 bg-slate-900"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className={`text-xs font-extrabold line-clamp-2 leading-snug ${theme.text}`}>
                            {rel.name}
                          </h4>
                          <p className={`text-[0.68rem] font-semibold truncate mt-0.5 ${theme.textSub}`}>
                            {rel.year || ''} • {rel.quality} • {rel.lang}
                          </p>
                          {rel.episodeCurrent && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-violet-600/20 text-violet-400 text-[0.62rem] font-black">
                              {rel.episodeCurrent}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // CHẾ ĐỘ 1: KHO PHIM RẠP KKPHIM (HERO BANNER + TIẾP TỤC XEM + BỘ LỌC + LƯỚI POSTER)
  // =========================================================================
  const heroMovie =
    libraryMode === 'browse' &&
    page === 1 &&
    !searchKeyword &&
    activeFiltersCount === 0 &&
    items.length > 0
      ? items[0]
      : null;

  const displayedList: MovieItem[] =
    libraryMode === 'favorites'
      ? favorites
      : libraryMode === 'browse'
      ? items
      : [];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 max-w-[1920px] mx-auto w-full animate-ios-browse-in">
      {/* 1. HEADER KHO PHIM CÂN ĐỐI 2 HÀNG GỌN GÀNG (4 NGUỒN SẠCH QC KHÔNG VỠ KHUNG TRÊN MỌI MÀN HÌNH) */}
      <div className={`shrink-0 rounded-2xl border p-2.5 sm:p-3 space-y-2 ${theme.card}`}>
        {/* Hàng 1: Thương hiệu Rạp Phim (trái) ↔ Bộ chuyển 4 nguồn phim cuộn ngang gọn gàng (phải) */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                movieSource === 'vsmov'
                  ? isLightTheme
                    ? 'bg-rose-100 border-rose-300 text-rose-700'
                    : 'bg-rose-500/20 border-rose-400/45 text-rose-300'
                  : movieSource === 'cobephim'
                  ? isLightTheme
                    ? 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700'
                    : 'bg-fuchsia-500/20 border-fuchsia-400/45 text-fuchsia-300'
                  : movieSource === 'k20'
                  ? isLightTheme
                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                    : 'bg-amber-500/20 border-amber-400/45 text-amber-300'
                  : isLightTheme
                  ? 'bg-violet-100 border-violet-300 text-violet-700'
                  : 'bg-violet-500/20 border-violet-400/45 text-violet-300'
              }`}
            >
              <Clapperboard className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className={`text-sm sm:text-base font-black tracking-tight truncate ${theme.text}`}>
                  Rạp Phim
                </h2>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[0.62rem] font-black uppercase shrink-0 ${getSourceBadgeClass(
                    movieSource
                  )}`}
                >
                  {getSourceLabel(movieSource)}
                </span>
              </div>
              <p className={`text-[0.7rem] sm:text-xs font-semibold truncate ${theme.textSub}`}>
                {libraryMode === 'favorites'
                  ? `Phim yêu thích đã lưu (${favorites.length})`
                  : libraryMode === 'history'
                  ? `Lịch sử phim đang xem (${history.length})`
                  : searchKeyword
                  ? `Kết quả "${searchKeyword}" (${totalItems} phim)`
                  : movieSource === 'k20'
                  ? 'K20 Tổng Hợp • Phim 4K & CLB Phim Xưa MP4'
                  : movieSource === 'cobephim'
                  ? 'CoBePhim • Song Ngữ & Đa Server KK/VS'
                  : `${
                      totalItems > 0
                        ? `${totalItems.toLocaleString('vi-VN')} phim HD/FHD`
                        : movieSource === 'vsmov'
                        ? '38.000+ phim Sạch QC & Chiếu rạp'
                        : '30.000+ phim 1080p Sạch QC'
                    }${updateToday > 0 ? ` • Hôm nay +${updateToday}` : ''}`}
              </p>
            </div>
          </div>

          {/* Thanh chuyển 4 nguồn phim sạch 1 hàng gọn gàng (cuộn mượt trên màn nhỏ, không vỡ dòng!) */}
          <div
            className={`flex items-center p-1 rounded-xl border gap-1 overflow-x-auto no-scrollbar max-w-full ${theme.segTrack}`}
          >
            {MOVIE_SOURCE_OPTIONS.map((opt) => {
              const active = movieSource === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeMovieSource(opt.id)}
                  className={`h-9 px-2.5 sm:px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1 whitespace-nowrap shrink-0 active:scale-95 transition ${
                    active ? opt.activeClass : theme.segIdle
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hàng 2: Thanh tìm kiếm giãn đều + cụm nút Lọc / Đang xem / Yêu thích / Làm mới thẳng hàng */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-0">
            <Search
              className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${theme.textMuted}`}
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                movieSource === 'k20'
                  ? 'Tìm phim 4K, phim xưa TVB, phim lẻ K20...'
                  : 'Tìm tên phim, diễn viên...'
              }
              className={`w-full h-10 pl-9 pr-8 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
            />
            {(searchInput || searchKeyword) && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchKeyword('');
                  setPage(1);
                }}
                aria-label="Xóa từ khóa tìm phim"
                className={`w-7 h-7 absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center ${theme.textMuted}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Bật/tắt Tìm gộp 4 kho phim cùng lúc */}
            <button
              type="button"
              onClick={() => {
                setSearchAllSources((prev) => {
                  const next = !prev;
                  onNotifyToast(
                    next
                      ? '🔎 Tìm kiếm gộp song song cả 4 kho phim (KKPhim + VSMov + CoBePhim + K20 4K)'
                      : `🎯 Chỉ tìm riêng trong nguồn ${getSourceLabel(movieSource)}`
                  );
                  return next;
                });
              }}
              title="Bật để 1 lần tìm quét cả 4 kho phim cùng lúc"
              className={`h-10 px-2.5 rounded-xl border text-xs font-extrabold flex items-center gap-1 active:scale-95 transition shrink-0 ${
                searchAllSources
                  ? 'bg-amber-500 border-amber-400 text-slate-950 shadow'
                  : theme.iconBtn
              }`}
            >
              <span>🔎</span>
              <span className="hidden sm:inline">{searchAllSources ? '4 nguồn' : '1 nguồn'}</span>
            </button>

            {/* Bộ lọc nâng cao (ẩn trên K20 vì K20 dùng tab chuyên mục riêng) */}
            {movieSource !== 'k20' && (
              <button
                type="button"
                onClick={() => {
                  setLibraryMode('browse');
                  setShowFilters((v) => !v);
                }}
                className={`h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
                  showFilters || activeFiltersCount > 0
                    ? 'bg-violet-600 border-violet-500 text-white shadow'
                    : theme.iconBtn
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Lọc</span>
                {activeFiltersCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white text-violet-700 text-[0.65rem] font-black leading-none">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            )}

            {/* Đang xem (History) */}
            <button
              type="button"
              onClick={() => setLibraryMode((m) => (m === 'history' ? 'browse' : 'history'))}
              className={`h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
                libraryMode === 'history'
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                  : theme.iconBtn
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">Đang xem</span>
              {history.length > 0 && <span className="tabular-nums">({history.length})</span>}
            </button>

            {/* Phim yêu thích */}
            <button
              type="button"
              onClick={() => setLibraryMode((m) => (m === 'favorites' ? 'browse' : 'favorites'))}
              className={`h-10 px-2.5 sm:px-3 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
                libraryMode === 'favorites'
                  ? 'bg-rose-600 border-rose-500 text-white shadow'
                  : theme.iconBtn
              }`}
            >
              <Heart className={`w-4 h-4 shrink-0 ${libraryMode === 'favorites' ? 'fill-white' : ''}`} />
              <span className="hidden md:inline">Yêu thích</span>
              {favorites.length > 0 && <span className="tabular-nums">({favorites.length})</span>}
            </button>

            {/* Làm mới */}
            <button
              type="button"
              onClick={() => {
                setLibraryMode('browse');
                setReloadNonce((n) => n + 1);
              }}
              aria-label="Làm mới danh sách phim"
              className={`w-10 h-10 rounded-xl border flex items-center justify-center active:scale-90 transition shrink-0 ${theme.iconBtn}`}
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingList ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. THANH DANH MỤC PHIM NHANH (Tự đổi theo nguồn KKPhim hoặc VSMov) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 shrink-0">
        {activeSourceTabs.map((tab) => {
          const active = libraryMode === 'browse' && !searchKeyword && activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setLibraryMode('browse');
                setSearchKeyword('');
                setSearchInput('');
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={`min-h-[2.35rem] px-3.5 rounded-full text-xs font-extrabold whitespace-nowrap border flex items-center gap-1.5 active:scale-95 transition shrink-0 ${
                active
                  ? tab.id === 'phim-thuyet-minh' || tab.id === 'song-ngu'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow'
                    : tab.id === 'phim-long-tieng' || tab.id === 'subteam' || tab.id === 'phim-xua'
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow'
                    : tab.id === 'phim-chieu-rap'
                    ? 'bg-rose-600 text-white border-rose-500 shadow'
                    : movieSource === 'vsmov'
                    ? 'bg-rose-600 text-white border-rose-500 shadow'
                    : movieSource === 'cobephim'
                    ? 'bg-fuchsia-600 text-white border-fuchsia-500 shadow'
                    : movieSource === 'k20'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-violet-600 text-white border-violet-500 shadow'
                  : theme.chipIdle
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. BẢNG BỘ LỌC NÂNG CAO (Tự thích nghi theo từng nguồn phim) */}
      {showFilters && libraryMode === 'browse' && movieSource !== 'k20' && (
        <div
          className={`shrink-0 rounded-2xl border p-3 grid gap-2 animate-ios-sheet-in ${
            movieSource === 'kkphim'
              ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5'
              : movieSource === 'cobephim'
              ? 'grid-cols-2 sm:grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-4'
          } ${theme.cardElevated}`}
        >
          <label className="flex flex-col gap-1">
            <span className={`text-[0.68rem] font-extrabold flex items-center gap-1 ${theme.textSub}`}>
              <Film className="w-3.5 h-3.5" /> Thể loại
            </span>
            <select
              value={selectedGenre}
              onChange={(e) => {
                setSelectedGenre(e.target.value);
                setPage(1);
              }}
              className={`min-h-[2.35rem] px-2.5 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
            >
              <option value="">Tất cả thể loại</option>
              {genres.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={`text-[0.68rem] font-extrabold flex items-center gap-1 ${theme.textSub}`}>
              <Globe className="w-3.5 h-3.5" /> Quốc gia
            </span>
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setPage(1);
              }}
              className={`min-h-[2.35rem] px-2.5 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
            >
              <option value="">Tất cả quốc gia</option>
              {countries.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {movieSource !== 'cobephim' && (
            <label className="flex flex-col gap-1">
              <span className={`text-[0.68rem] font-extrabold flex items-center gap-1 ${theme.textSub}`}>
                <Calendar className="w-3.5 h-3.5" /> Năm
              </span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setPage(1);
                }}
                className={`min-h-[2.35rem] px-2.5 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
              >
                <option value="">Tất cả năm</option>
                {MOVIE_YEARS.map((y) => (
                  <option key={y} value={String(y)}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </label>
          )}

          {movieSource === 'kkphim' && (
            <label className="flex flex-col gap-1">
              <span className={`text-[0.68rem] font-extrabold flex items-center gap-1 ${theme.textSub}`}>
                <Layers className="w-3.5 h-3.5" /> Âm thanh
              </span>
              <select
                value={selectedSortLang}
                onChange={(e) => {
                  setSelectedSortLang(e.target.value);
                  setPage(1);
                }}
                className={`min-h-[2.35rem] px-2.5 rounded-xl border text-xs font-bold focus:outline-none ${theme.input}`}
              >
                <option value="">Tất cả ngôn ngữ</option>
                <option value="thuyet-minh">🎙️ Thuyết minh</option>
                <option value="long-tieng">🗣️ Lồng tiếng</option>
                <option value="vietsub">📝 Vietsub</option>
              </select>
            </label>
          )}

          <div
            className={`flex items-end ${
              movieSource === 'kkphim'
                ? 'col-span-2 sm:col-span-4 lg:col-span-1'
                : movieSource === 'cobephim'
                ? 'col-span-2 sm:col-span-1'
                : 'col-span-1'
            }`}
          >
            <button
              type="button"
              onClick={clearAllFilters}
              className={`w-full min-h-[2.35rem] px-3 rounded-xl border text-xs font-extrabold active:scale-95 transition ${theme.iconBtn}`}
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      )}

      {/* 4. NỘI DUNG CUỘN CHÍNH */}
      <div
        ref={browseScrollRef}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4 pb-6 pr-0.5"
      >
        {/* CHẾ ĐỘ LỊCH SỬ ĐANG XEM */}
        {libraryMode === 'history' ? (
          history.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center gap-2">
              <Clock className={`w-10 h-10 ${theme.textMuted}`} />
              <p className={`text-sm font-bold ${theme.textSub}`}>
                Bạn chưa xem bộ phim nào — hãy chọn 1 phim để bắt đầu!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {history.map((h) => {
                const hSrc = h.source || 'kkphim';
                const pct =
                  h.duration > 0 ? Math.min(100, Math.round((h.currentTime / h.duration) * 100)) : 0;
                return (
                  <div
                    key={getMovieKey(hSrc, h.slug)}
                    onClick={() => openMovie(h.slug, hSrc, h)}
                    className={`group relative rounded-2xl border overflow-hidden cursor-pointer active:scale-[0.99] transition ${theme.itemIdle}`}
                  >
                    <div className="relative aspect-video bg-slate-900 overflow-hidden">
                      <img
                        src={h.thumbUrl || h.posterUrl}
                        alt={h.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <span
                        className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[0.6rem] font-black uppercase ${getSourceBadgeClass(
                          hSrc
                        )}`}
                      >
                        {getSourceLabel(hSrc)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveHistory(h.slug, hSrc, e)}
                        aria-label="Xóa khỏi lịch sử xem"
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 text-white">
                        <span className="px-2 py-0.5 rounded-md bg-violet-600 text-[0.68rem] font-black">
                          {h.episodeName}
                        </span>
                        {h.duration > 0 && (
                          <span className="text-[0.68rem] font-mono font-bold bg-black/65 px-1.5 py-0.5 rounded">
                            {formatSeconds(h.currentTime)} / {formatSeconds(h.duration)}
                          </span>
                        )}
                      </div>
                      {/* Thanh tiến trình kiểu Netflix */}
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/25">
                        <div className="h-full bg-rose-500" style={{ width: `${pct || 15}%` }} />
                      </div>
                    </div>
                    <div className="p-2.5">
                      <h4 className={`text-xs sm:text-sm font-black truncate ${theme.text}`}>
                        {h.name}
                      </h4>
                      <p className={`text-[0.7rem] font-semibold truncate mt-0.5 ${theme.textSub}`}>
                        {h.serverName} • {h.duration > 0 ? `Tiếp tục xem (${pct}%)` : `Đang ở ${h.episodeName}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            {/* HERO SPOTLIGHT BANNER (TRANG 1 DUYỆT PHIM) */}
            {heroMovie && (
              <div
                onClick={() => openMovie(heroMovie.slug, heroMovie.source || movieSource)}
                className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-white/15 bg-slate-950 min-h-[14.5rem] sm:min-h-[17.5rem] flex items-end cursor-pointer group shadow-2xl"
              >
                <img
                  src={heroMovie.thumbUrl || heroMovie.posterUrl}
                  alt={heroMovie.name}
                  className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/25" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30" />

                <div className="relative z-10 p-4 sm:p-6 max-w-2xl space-y-2.5 text-white">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[0.7rem] font-black uppercase ${getSourceBadgeClass(
                        movieSource
                      )}`}
                    >
                      🔥 Tiêu điểm {getSourceLabel(movieSource)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[0.7rem] font-black">
                      {heroMovie.quality}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[0.7rem] font-black ${getLangBadgeStyle(
                        heroMovie.lang
                      )}`}
                    >
                      {heroMovie.lang}
                    </span>
                    {heroMovie.year > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-white/15 text-[0.7rem] font-bold">
                        {heroMovie.year}
                      </span>
                    )}
                    {heroMovie.episodeCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-600/90 text-[0.7rem] font-black">
                        {heroMovie.episodeCurrent}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black leading-tight drop-shadow">
                      {heroMovie.name}
                    </h3>
                    {heroMovie.originName && (
                      <p className="text-xs sm:text-sm font-semibold text-white/75 mt-0.5">
                        {heroMovie.originName}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMovie(heroMovie.slug, heroMovie.source || movieSource);
                      }}
                      className="min-h-[2.75rem] px-5 rounded-xl bg-white hover:bg-white/90 text-slate-950 text-xs sm:text-sm font-black flex items-center gap-2 shadow-xl active:scale-95 transition"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>Xem phim ngay</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(heroMovie);
                      }}
                      className={`min-h-[2.75rem] px-4 rounded-xl border text-xs sm:text-sm font-extrabold flex items-center gap-1.5 backdrop-blur-md active:scale-95 transition ${
                        favoriteSet.has(getMovieKey(heroMovie.source || movieSource, heroMovie.slug))
                          ? 'bg-rose-600 border-rose-400 text-white'
                          : 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          favoriteSet.has(getMovieKey(heroMovie.source || movieSource, heroMovie.slug))
                            ? 'fill-white'
                            : ''
                        }`}
                      />
                      <span>
                        {favoriteSet.has(getMovieKey(heroMovie.source || movieSource, heroMovie.slug))
                          ? 'Đã lưu'
                          : 'Lưu phim'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* KỆ "▶️ TIẾP TỤC XEM" NGAY TRÊN TRANG CHỦ PHIM (nếu có lịch sử xem!) */}
            {libraryMode === 'browse' &&
              page === 1 &&
              !searchKeyword &&
              history.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-black flex items-center gap-1.5 ${theme.text}`}>
                      <span>▶️ Tiếp tục xem</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLibraryMode('history')}
                      className={`text-xs font-extrabold ${theme.textSub} hover:underline`}
                    >
                      Xem tất cả ({history.length})
                    </button>
                  </div>
                  <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                    {history.slice(0, 8).map((h) => {
                      const hSrc = h.source || 'kkphim';
                      const pct =
                        h.duration > 0
                          ? Math.min(100, Math.round((h.currentTime / h.duration) * 100))
                          : 0;
                      return (
                        <button
                          key={getMovieKey(hSrc, h.slug)}
                          type="button"
                          onClick={() => openMovie(h.slug, hSrc, h)}
                          className={`w-[13.5rem] shrink-0 text-left rounded-2xl border overflow-hidden active:scale-[0.98] transition ${theme.itemIdle}`}
                        >
                          <div className="relative aspect-video bg-slate-900">
                            <img
                              src={h.thumbUrl || h.posterUrl}
                              alt={h.name}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                            <span
                              className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[0.58rem] font-black uppercase ${getSourceBadgeClass(
                                hSrc
                              )}`}
                            >
                              {getSourceLabel(hSrc)}
                            </span>
                            <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-violet-600 text-white text-[0.65rem] font-black">
                              {h.episodeName}
                            </span>
                            {h.duration > 0 && (
                              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[0.62rem] font-mono font-bold">
                                {formatSeconds(h.currentTime)}
                              </span>
                            )}
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-white/25">
                              <div className="h-full bg-rose-500" style={{ width: `${pct || 15}%` }} />
                            </div>
                          </div>
                          <div className="p-2">
                            <p className={`text-xs font-extrabold truncate ${theme.text}`}>
                              {h.name}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* LƯỚI POSTER PHIM CHÍNH */}
            {isLoadingList && libraryMode === 'browse' ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2.5">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                <p className={`text-sm font-bold ${theme.textSub}`}>
                  Đang tải kho phim từ {getSourceLabel(movieSource)}...
                </p>
              </div>
            ) : listError && libraryMode === 'browse' ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="w-9 h-9 text-rose-500" />
                <p className={`text-sm font-bold ${theme.text}`}>{listError}</p>
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="min-h-[2.5rem] px-5 rounded-xl bg-violet-600 text-white text-xs font-black"
                >
                  Thử lại
                </button>
              </div>
            ) : displayedList.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2 text-center">
                <Clapperboard className={`w-10 h-10 ${theme.textMuted}`} />
                <p className={`text-sm font-bold ${theme.textSub}`}>
                  {libraryMode === 'favorites'
                    ? 'Chưa có phim yêu thích nào — bấm ❤️ trên poster để lưu!'
                    : 'Không tìm thấy bộ phim nào khớp bộ lọc'}
                </p>
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="min-h-[2.4rem] px-4 rounded-xl bg-violet-600 text-white text-xs font-black mt-1"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3">
                  {displayedList.map((movie) => {
                    const mSrc = movie.source || movieSource;
                    const mKey = getMovieKey(mSrc, movie.slug);
                    const isFav = favoriteSet.has(mKey);
                    return (
                      <div
                        key={mKey}
                        onClick={() => openMovie(movie.slug, mSrc)}
                        className={`group rounded-2xl border overflow-hidden cursor-pointer flex flex-col active:scale-[0.98] transition ${theme.itemIdle}`}
                      >
                        <div className="relative aspect-[2/3] bg-slate-900 overflow-hidden">
                          <img
                            src={movie.posterUrl || movie.thumbUrl}
                            alt={movie.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/45" />

                          {/* Top badges: Source (khi Tìm gộp 4 nguồn hoặc Yêu thích) + Quality + Lang */}
                          <div className="absolute top-2 left-2 right-10 flex flex-wrap items-center gap-1">
                            {(libraryMode === 'favorites' || Boolean(searchKeyword && searchAllSources)) && (
                              <span
                                className={`px-1.5 py-0.5 rounded-md text-[0.58rem] font-black leading-none uppercase shadow ${getSourceBadgeClass(
                                  mSrc
                                )}`}
                              >
                                {getSourceLabel(mSrc)}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded-md bg-violet-600 text-white text-[0.6rem] font-black leading-none shadow">
                              {movie.quality}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[0.6rem] font-black leading-none shadow ${getLangBadgeStyle(
                                movie.lang
                              )}`}
                            >
                              {movie.lang}
                            </span>
                          </div>

                          {/* Nút tim nhanh góc phải trên */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(movie);
                            }}
                            aria-label={isFav ? 'Bỏ lưu phim' : 'Lưu phim yêu thích'}
                            className={`absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md active:scale-90 transition ${
                              isFav
                                ? 'bg-rose-600 text-white'
                                : 'bg-black/55 hover:bg-black/80 text-white/85'
                            }`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
                          </button>

                          {/* Bottom badges: Tập phim + Năm / Điểm */}
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 text-white">
                            {movie.episodeCurrent ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-black/75 border border-white/15 text-[0.62rem] font-extrabold truncate">
                                {movie.episodeCurrent}
                              </span>
                            ) : (
                              <span />
                            )}
                            {movie.rating > 0 ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[0.62rem] font-black shrink-0">
                                ★ {movie.rating}
                              </span>
                            ) : movie.year > 0 ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-[0.62rem] font-mono font-bold shrink-0">
                                {movie.year}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="p-2.5 flex-1 flex flex-col justify-between">
                          <h4
                            className={`text-xs sm:text-sm font-extrabold line-clamp-2 leading-snug ${theme.text}`}
                          >
                            {movie.name}
                          </h4>
                          {movie.originName && (
                            <p className={`text-[0.68rem] font-semibold truncate mt-0.5 ${theme.textMuted}`}>
                              {movie.originName}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* THANH PHÂN TRANG RÕ RÀNG DỄ BẤM TRÊN CẢM ỨNG Ô TÔ */}
                {libraryMode === 'browse' && totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={`min-h-[2.65rem] px-4 rounded-xl border text-xs font-extrabold flex items-center gap-1 disabled:opacity-35 active:scale-95 transition ${theme.iconBtn}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Trang trước</span>
                    </button>

                    <span
                      className={`min-h-[2.65rem] px-4 rounded-xl border text-xs font-mono font-black flex items-center ${theme.card}`}
                    >
                      Trang {page} / {totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={`min-h-[2.65rem] px-4 rounded-xl border text-xs font-extrabold flex items-center gap-1 disabled:opacity-35 active:scale-95 transition ${theme.iconBtn}`}
                    >
                      <span>Trang sau</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
