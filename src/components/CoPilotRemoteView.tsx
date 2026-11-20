import React, { useState, useEffect } from 'react';
import {
  Search,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Film,
  MapPin,
  Music,
  Tv,
  Newspaper,
  Send,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Smartphone,
} from 'lucide-react';
import { MovieItem, MusicSource, TvChannel, VideoItem } from '../types';
import { searchVideos } from '../services/api';
import { fetchMovieList } from '../services/movie';
import { sendNavToCar, sendRemoteCommand, normalizeSyncCode } from '../services/sync';

interface CoPilotRemoteViewProps {
  initialCode: string;
  onExitCoPilot: () => void;
}

type RemoteTab = 'music' | 'movie' | 'tv' | 'nav';

const QUICK_TV_PICKS = ['VTV1', 'VTV3', 'VOV Giao thông', 'HTV7', 'HTV9', 'VTV Cần Thơ'];

export const CoPilotRemoteView: React.FC<CoPilotRemoteViewProps> = ({
  initialCode,
  onExitCoPilot,
}) => {
  const code = normalizeSyncCode(initialCode);
  const [tab, setTab] = useState<RemoteTab>('music');
  const [musicSource, setMusicSource] = useState<MusicSource>('youtube');
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [tracks, setTracks] = useState<VideoItem[]>([]);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [tvChannels, setTvChannels] = useState<TvChannel[]>([]);
  const [places, setPlaces] = useState<
    Array<{ name: string; subtitle: string; lat: number; lon: number }>
  >([]);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  // Tải sẵn danh sách kênh TV khi mở tab TV
  useEffect(() => {
    if (tab !== 'tv' || tvChannels.length > 0) return;
    fetch('/api/tv?action=playlist')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.channels)) setTvChannels(d.channels);
      })
      .catch(() => {});
  }, [tab, tvChannels.length]);

  const handleControl = async (
    action: 'prev' | 'playPause' | 'next' | 'openNews',
    label: string
  ) => {
    const res = await sendRemoteCommand(code, action);
    notify(res.success ? `✅ Đã gửi lên VF5: ${label}` : res.error || 'Lỗi gửi lệnh');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      if (tab === 'music') {
        const res = await searchVideos(q, null, undefined, musicSource);
        setTracks(res.items.slice(0, 15));
      } else if (tab === 'movie') {
        const settled = await Promise.allSettled([
          fetchMovieList({ source: 'k20', type: 'moi-cap-nhat', keyword: q, limit: 8 }),
          fetchMovieList({ source: 'kkphim', type: 'moi-cap-nhat', keyword: q, limit: 8 }),
          fetchMovieList({ source: 'vsmov', type: 'moi-cap-nhat', keyword: q, limit: 8 }),
          fetchMovieList({ source: 'cobephim', type: 'moi-cap-nhat', keyword: q, limit: 8 }),
        ]);
        const merged: MovieItem[] = [];
        for (const r of settled) {
          if (r.status === 'fulfilled' && Array.isArray(r.value.items)) {
            merged.push(...r.value.items);
          }
        }
        setMovies(merged.slice(0, 24));
      } else if (tab === 'nav') {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setPlaces(Array.isArray(data?.items) ? data.items : []);
      }
    } catch {
      notify('Không kết nối được máy chủ tìm kiếm');
    } finally {
      setLoading(false);
    }
  };

  const filteredTv = tvChannels
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 24);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col max-w-xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-300 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black truncate">Điều Khiển VF5 • Mã {code}</h1>
            <p className="text-[11px] text-slate-400 font-semibold truncate">
              Chọn nhạc, phim, TV Live, Báo Audio &amp; dẫn đường lên màn xe
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExitCoPilot}
          className="h-9 px-3 rounded-xl bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1 shrink-0 active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>App chính</span>
        </button>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Quick Transport + Báo Audio Controls */}
      <div className="px-4 pt-3 pb-2 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => handleControl('prev', 'Bài trước')}
          className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95"
        >
          <SkipBack className="w-4 h-4" />
          <span>Trước</span>
        </button>
        <button
          type="button"
          onClick={() => handleControl('playPause', 'Phát / Tạm dừng')}
          className="h-11 rounded-2xl bg-sky-500 text-slate-950 flex items-center justify-center gap-1 text-xs font-black active:scale-95"
        >
          <Play className="w-4 h-4" />
          <span>Phát</span>
        </button>
        <button
          type="button"
          onClick={() => handleControl('next', 'Bài tiếp')}
          className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95"
        >
          <span>Tiếp</span>
          <SkipForward className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => handleControl('openNews', 'Đọc Báo Audio mới nhất')}
          className="h-11 rounded-2xl bg-amber-500/20 border border-amber-400/45 text-amber-300 flex items-center justify-center gap-1 text-xs font-black active:scale-95"
        >
          <Newspaper className="w-4 h-4" />
          <span>Báo</span>
        </button>
      </div>

      {/* 4 Mode Tabs */}
      <div className="px-4 py-1.5 grid grid-cols-4 gap-1.5">
        {(
          [
            { id: 'music', icon: Music, label: 'Nhạc' },
            { id: 'movie', icon: Film, label: 'Phim' },
            { id: 'tv', icon: Tv, label: 'TV Live' },
            { id: 'nav', icon: MapPin, label: 'Bản đồ' },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-10 rounded-xl border text-xs font-black flex items-center justify-center gap-1 active:scale-95 transition ${
                active
                  ? 'bg-violet-600 border-violet-400 text-white shadow'
                  : 'bg-slate-900 border-white/10 text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* YouTube / SoundCloud switch when on Music tab */}
      {tab === 'music' && (
        <div className="px-4 pt-1 flex gap-1.5">
          <button
            type="button"
            onClick={() => setMusicSource('youtube')}
            className={`flex-1 h-8 rounded-lg text-xs font-extrabold border ${
              musicSource === 'youtube'
                ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-slate-900 border-white/10 text-slate-400'
            }`}
          >
            ▶️ YouTube
          </button>
          <button
            type="button"
            onClick={() => setMusicSource('soundcloud')}
            className={`flex-1 h-8 rounded-lg text-xs font-extrabold border ${
              musicSource === 'soundcloud'
                ? 'bg-orange-500 border-orange-300 text-slate-950'
                : 'bg-slate-900 border-white/10 text-slate-400'
            }`}
          >
            ☁️ SoundCloud
          </button>
        </div>
      )}

      {/* Search Form */}
      <form onSubmit={handleSearch} className="px-4 py-2 flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === 'music'
                ? `Tìm nhạc trên ${musicSource === 'soundcloud' ? 'SoundCloud' : 'YouTube'}...`
                : tab === 'movie'
                ? 'Tìm tên phim (4 nguồn sạch QC)...'
                : tab === 'tv'
                ? 'Lọc kênh VTV, HTV, VOV Giao thông...'
                : 'Tìm địa chỉ, quán ăn, trạm sạc...'
            }
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-slate-900 border border-white/15 text-sm font-bold text-white focus:outline-none focus:border-sky-400"
          />
        </div>
        {tab !== 'tv' && (
          <button
            type="submit"
            disabled={loading}
            className="h-11 px-4 rounded-xl bg-sky-500 text-slate-950 font-black text-xs shrink-0 active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tìm'}
          </button>
        )}
      </form>

      {/* Results */}
      <div className="flex-1 px-4 pb-10 pt-1 space-y-2">
        {tab === 'music' &&
          tracks.map((tr) => (
            <div
              key={tr.id}
              className="rounded-2xl bg-slate-900/90 border border-white/10 p-2.5 flex items-center gap-2.5"
            >
              <img
                src={tr.thumbnail}
                alt={tr.title}
                className="w-14 h-10 rounded-lg object-cover bg-slate-800 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold line-clamp-1">{tr.title}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {tr.uploaderName} • {tr.durationText}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await sendRemoteCommand(code, 'playTrack', tr);
                  notify(r.success ? `🎵 Đang phát trên VF5: ${tr.title}` : r.error || 'Lỗi');
                }}
                className="h-9 px-2.5 rounded-xl bg-sky-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Phát</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await sendRemoteCommand(code, 'queueTrack', tr);
                  notify(r.success ? `➕ Đã xếp hàng đợi VF5: ${tr.title}` : r.error || 'Lỗi');
                }}
                className="h-9 px-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

        {tab === 'movie' &&
          movies.map((m) => (
            <div
              key={`${m.source}:${m.slug}`}
              className="rounded-2xl bg-slate-900/90 border border-white/10 p-2.5 flex items-center gap-3"
            >
              <img
                src={m.posterUrl || m.thumbUrl}
                alt={m.name}
                className="w-11 h-16 rounded-lg object-cover bg-slate-800 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black line-clamp-1">{m.name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {(m.source || 'kkphim').toUpperCase()} • {m.quality} • {m.lang}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await sendRemoteCommand(code, 'openMovie', {
                    slug: m.slug,
                    source: m.source || 'kkphim',
                    name: m.name,
                  });
                  notify(r.success ? `🎬 Đang mở trên màn VF5: ${m.name}` : r.error || 'Lỗi');
                }}
                className="h-9 px-3 rounded-xl bg-violet-600 text-white text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Chiếu</span>
              </button>
            </div>
          ))}

        {tab === 'tv' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TV_PICKS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={async () => {
                    const r = await sendRemoteCommand(code, 'openTv', { query: ch });
                    notify(r.success ? `📺 Đang mở ${ch} trên VF5!` : r.error || 'Lỗi');
                  }}
                  className="h-9 px-3 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-extrabold active:scale-95"
                >
                  📺 {ch}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {filteredTv.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={async () => {
                    const r = await sendRemoteCommand(code, 'openTv', { query: ch.name });
                    notify(r.success ? `📺 Đang mở ${ch.name} trên VF5!` : r.error || 'Lỗi');
                  }}
                  className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-left flex items-center gap-2 active:scale-95"
                >
                  <Tv className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs font-bold truncate">{ch.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'nav' &&
          places.map((pl, i) => (
            <div
              key={`${pl.lat}-${pl.lon}-${i}`}
              className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-black truncate">{pl.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{pl.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const r = await sendNavToCar(code, pl);
                  notify(r.success ? `📍 Đã gửi lộ trình lên VF5: ${pl.name}` : r.error || 'Lỗi');
                }}
                className="h-9 px-3 rounded-xl bg-emerald-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dẫn đường</span>
              </button>
            </div>
          ))}
      </div>
    </div>
  );
};
