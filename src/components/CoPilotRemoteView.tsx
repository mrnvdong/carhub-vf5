import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ShieldCheck,
  Lock,
  KeyRound,
  Clock,
  AlertTriangle,
  ListPlus,
  RefreshCw,
} from 'lucide-react';
import { fetchWithTimeout } from '../utils/timedFetch';
import { MovieItem, MusicSource, TvChannel, VideoItem } from '../types';
import { searchVideos } from '../services/api';
import { fetchMovieList } from '../services/movie';
import {
  checkGuestSessionStatus,
  detectGuestDeviceLabel,
  extractRemoteSessionId,
  getOrCreateGuestDeviceId,
  joinGuestRemoteSession,
  sendGuestRemoteCommand,
  sendGuestRemoteNav,
} from '../services/remoteSession';

interface CoPilotRemoteViewProps {
  initialCode: string;
  onExitCoPilot: () => void;
}

type RemoteTab = 'music' | 'movie' | 'tv' | 'nav';
type GatePhase = 'checking' | 'legacy' | 'expired' | 'blocked' | 'join' | 'pending' | 'approved';

const QUICK_TV_PICKS = ['VTV1', 'VTV3', 'VOV Giao thông', 'HTV7', 'HTV9', 'VTV Cần Thơ'];

function formatRemainingTime(expiresAt: number | null): string {
  if (!expiresAt) return '';
  const diffMs = Math.max(0, expiresAt - Date.now());
  const mins = Math.ceil(diffMs / 60_000);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}g${m > 0 ? ` ${m}p` : ''}`;
  }
  return `${mins}p`;
}

export const CoPilotRemoteView: React.FC<CoPilotRemoteViewProps> = ({
  initialCode,
  onExitCoPilot,
}) => {
  const sessionId = extractRemoteSessionId(initialCode);
  const [deviceId] = useState<string>(() => getOrCreateGuestDeviceId());
  const [deviceLabel, setDeviceLabel] = useState<string>(() => detectGuestDeviceLabel());
  const [pinInput, setPinInput] = useState<string>('');

  const [phase, setPhase] = useState<GatePhase>(() => (sessionId ? 'checking' : 'legacy'));
  const [gateError, setGateError] = useState<string | null>(null);
  const [requirePin, setRequirePin] = useState<boolean>(true);
  const [requireApproval, setRequireApproval] = useState<boolean>(true);
  const [locked, setLocked] = useState<boolean>(false);
  const [queueOnly, setQueueOnly] = useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [joining, setJoining] = useState<boolean>(false);

  const [tab, setTab] = useState<RemoteTab>('music');
  const [musicSource, setMusicSource] = useState<MusicSource>('youtube');
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [tracks, setTracks] = useState<VideoItem[]>([]);
  const [movies, setMovies] = useState<MovieItem[]>([]);
  const [tvChannels, setTvChannels] = useState<TvChannel[]>([]);
  const [tvLoadError, setTvLoadError] = useState<string | null>(null);
  const [tvLoading, setTvLoading] = useState<boolean>(false);
  const [places, setPlaces] = useState<
    Array<{ name: string; subtitle: string; lat: number; lon: number }>
  >([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!sessionId) {
      setPhase('legacy');
      return;
    }
    const res = await checkGuestSessionStatus(sessionId, deviceId);
    if (!res.ok) {
      if (res.code === 'SESSION_EXPIRED' || res.code === 'INVALID_SESSION') {
        setPhase('expired');
        setGateError(res.error || 'Phiên QR đã hết hạn hoặc bị thu hồi.');
      } else {
        setGateError(res.error || 'Không kết nối được máy chủ. Hãy kiểm tra 4G/WiFi và thử lại.');
      }
      return;
    }

    setRequirePin(Boolean(res.requirePin));
    setRequireApproval(Boolean(res.requireApproval));
    setLocked(Boolean(res.locked));
    setQueueOnly(Boolean(res.queueOnly));
    if (res.expiresAt) setExpiresAt(res.expiresAt);
    setGateError(null);

    if (res.status === 'approved') {
      setPhase('approved');
    } else if (res.status === 'blocked') {
      setPhase('blocked');
    } else if (res.status === 'pending') {
      setPhase('pending');
    } else {
      setPhase('join');
    }
  }, [sessionId, deviceId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Tự đồng bộ trạng thái phiên cho tất cả pha đang chờ (pending: 2.5s, join/blocked: 5s, approved: 12s)
  useEffect(() => {
    if (phase !== 'pending' && phase !== 'join' && phase !== 'blocked' && phase !== 'approved') {
      return;
    }
    const intervalMs = phase === 'pending' ? 2500 : phase === 'approved' ? 12000 : 5000;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [phase, refreshStatus]);

  // Nếu chủ xe bật Chỉ xếp hàng đợi -> tự đưa về tab Nhạc để hành khách dễ thêm bài vào hàng đợi
  useEffect(() => {
    if (queueOnly && tab !== 'music') {
      setTab('music');
    }
  }, [queueOnly, tab]);

  const loadTvChannels = useCallback(async () => {
    setTvLoading(true);
    setTvLoadError(null);
    try {
      const r = await fetchWithTimeout('/api/tv?action=playlist', {}, 7000);
      const d = r.ok ? await r.json() : null;
      if (Array.isArray(d?.channels) && d.channels.length > 0) {
        setTvChannels(d.channels);
      } else {
        setTvLoadError('Không tải được danh sách kênh TV.');
      }
    } catch {
      setTvLoadError('Mất kết nối mạng khi tải danh sách kênh TV.');
    } finally {
      setTvLoading(false);
    }
  }, []);

  // Tải sẵn danh sách kênh TV khi mở tab TV
  useEffect(() => {
    if (phase !== 'approved' || tab !== 'tv' || tvChannels.length > 0 || tvLoading) return;
    loadTvChannels();
  }, [phase, tab, tvChannels.length, tvLoading, loadTvChannels]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    if (requirePin && pinInput.replace(/\D/g, '').length < 4) {
      setGateError('Hãy nhập đủ 4 chữ số PIN hiển thị ngay cạnh mã QR trên màn hình xe VF5.');
      return;
    }
    setJoining(true);
    setGateError(null);
    const res = await joinGuestRemoteSession(
      sessionId,
      deviceId,
      deviceLabel.trim() || detectGuestDeviceLabel(),
      pinInput.replace(/\D/g, '')
    );
    setJoining(false);

    if (!res.ok) {
      if (res.code === 'SESSION_EXPIRED' || res.code === 'INVALID_SESSION') {
        setPhase('expired');
      } else if (res.code === 'BLOCKED') {
        setPhase('blocked');
      } else if (res.code === 'LOCKED' || res.code === 'PIN_LOCKED') {
        setLocked(true);
      } else if (res.code === 'WRONG_PIN') {
        setRequirePin(true);
      }
      setGateError(res.error || 'Không kết nối được vào xe VF5.');
      return;
    }

    setLocked(Boolean(res.locked));
    setQueueOnly(Boolean(res.queueOnly));
    if (res.expiresAt) setExpiresAt(res.expiresAt);
    setPhase(res.status === 'approved' ? 'approved' : 'pending');
  };

  const handleServerRejection = (code?: string, errMsg?: string) => {
    if (code === 'SESSION_EXPIRED' || code === 'INVALID_SESSION') {
      setPhase('expired');
      setGateError(errMsg || 'Phiên QR đã hết hạn hoặc chủ xe đã thu hồi.');
      return;
    }
    if (code === 'BLOCKED') {
      setPhase('blocked');
      return;
    }
    if (code === 'NOT_APPROVED') {
      setPhase('pending');
      return;
    }
    if (code === 'LOCKED') {
      setLocked(true);
    }
    if (code === 'QUEUE_ONLY') {
      setQueueOnly(true);
    }
    notify(errMsg || 'Không gửi được lệnh lên xe VF5.');
  };

  const dispatchCommand = async (
    action: 'playTrack' | 'queueTrack' | 'openMovie' | 'openTv' | 'openNews' | 'playPause' | 'next' | 'prev',
    payload: any,
    okText: string
  ) => {
    if (!sessionId) return;
    const res = await sendGuestRemoteCommand(sessionId, deviceId, action, payload);
    if (!res.ok) {
      handleServerRejection(res.code, res.error);
      return;
    }
    if (typeof res.queueOnly === 'boolean') setQueueOnly(res.queueOnly);
    if (typeof res.locked === 'boolean') setLocked(res.locked);
    notify(okText);
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

  // =========================================================================
  // CỔNG BẢO MẬT TRƯỚC KHI VÀO ĐIỀU KHIỂN (PIN 4 SỐ + DUYỆT THIẾT BỊ + HẾT HẠN)
  // =========================================================================
  if (phase !== 'approved') {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-white/15 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-300 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black">Điều Khiển VF5 Bảo Mật</h1>
                <p className="text-[11px] text-slate-400 font-semibold">
                  Phiên QR tạm thời • Chống điều khiển trái phép từ xa
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onExitCoPilot}
              className="h-9 px-3 rounded-xl bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1 active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Thoát</span>
            </button>
          </div>

          {phase === 'checking' && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              {gateError ? (
                <>
                  <AlertTriangle className="w-8 h-8 text-amber-400" />
                  <p className="text-xs font-bold text-amber-200 max-w-xs">{gateError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setGateError(null);
                      refreshStatus();
                    }}
                    className="h-10 px-4 rounded-xl bg-sky-500 text-slate-950 text-xs font-black flex items-center gap-1.5 active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Thử kết nối lại</span>
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                  <p className="text-xs font-bold text-slate-300">Đang kiểm tra phiên QR bảo mật...</p>
                </>
              )}
            </div>
          )}

          {(phase === 'legacy' || phase === 'expired') && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-400/35 p-4 space-y-2 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm font-black text-amber-200">
                {phase === 'legacy'
                  ? 'Mã QR cũ đã ngưng hỗ trợ để bảo mật'
                  : 'Phiên QR đã hết hạn hoặc chủ xe đã thu hồi'}
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {gateError ||
                  'Để chống người ngoài phá xe từ xa, mỗi phiên QR chỉ dùng tạm trong 3 giờ và có mã PIN riêng. Hãy bấm nút QR trên màn hình xe VF5 để quét mã mới.'}
              </p>
            </div>
          )}

          {phase === 'blocked' && (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/40 p-4 space-y-3 text-center">
              <Lock className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-black text-rose-200">Thiết bị đã bị chủ xe chặn</p>
              <p className="text-xs text-slate-300">
                Chủ xe đã từ chối hoặc ngắt quyền điều khiển của thiết bị này trong phiên hiện tại. Nếu chủ xe vừa mở lại quyền cho bạn, bấm kiểm tra lại bên dưới.
              </p>
              <button
                type="button"
                onClick={() => refreshStatus()}
                className="h-9 px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-black inline-flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kiểm tra lại quyền</span>
              </button>
            </div>
          )}

          {phase === 'pending' && (
            <div className="rounded-2xl bg-sky-500/10 border border-sky-400/35 p-5 space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
              <p className="text-sm font-black text-white">
                Đang chờ chủ xe bấm &ldquo;Cho phép&rdquo;
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Thông báo xác nhận cho thiết bị <strong className="text-sky-300">{deviceLabel}</strong> đã hiện trên màn hình xe VF5. Tài xế bấm <strong>Cho phép</strong> 1 lần là bạn dùng được suốt chuyến đi!
              </p>
            </div>
          )}

          {phase === 'join' && (
            <form onSubmit={handleJoin} className="space-y-3.5">
              {locked && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Chủ xe đang bật Khóa Remote — hãy nhờ mở khóa trên màn hình xe.</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-300 block">
                  Tên thiết bị của bạn (hiển thị trên màn xe để duyệt)
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder="VD: iPhone ghế sau"
                  className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-white/15 text-sm font-bold text-white focus:outline-none focus:border-sky-400"
                />
              </div>

              {requirePin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>Nhập mã PIN 4 số hiển thị ngay cạnh mã QR trên màn xe</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-full h-14 px-4 rounded-2xl bg-slate-950 border-2 border-sky-400/50 text-center text-2xl font-mono font-black tracking-[0.55em] text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              )}

              {gateError && (
                <p className="text-xs font-bold text-rose-300 bg-rose-500/15 border border-rose-400/30 rounded-xl px-3 py-2">
                  {gateError}
                </p>
              )}

              <button
                type="submit"
                disabled={joining || locked}
                className="w-full h-12 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                <span>
                  {requireApproval ? 'Gửi yêu cầu kết nối vào xe VF5' : 'Kết nối vào xe VF5 ngay'}
                </span>
              </button>

              {expiresAt && (
                <p className="text-[11px] text-center text-slate-400 font-semibold flex items-center justify-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Phiên QR tự hủy sau {formatRemainingTime(expiresAt)} • Không lộ dữ liệu cá nhân</span>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    );
  }

  const filteredTv = tvChannels
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 24);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col max-w-xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black truncate flex items-center gap-1.5">
              <span>Đã nối VF5</span>
              {expiresAt && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-sky-300">
                  Còn {formatRemainingTime(expiresAt)}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold truncate">
              {locked
                ? '🔒 Chủ xe đang tạm khóa điều khiển từ xa'
                : queueOnly
                ? '🎵 Chế độ Chỉ xếp hàng đợi (không cắt ngang nhạc đang phát)'
                : 'Chọn nhạc, phim, TV Live, Báo Audio & dẫn đường lên màn xe'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExitCoPilot}
          className="h-9 px-3 rounded-xl bg-white/10 border border-white/15 text-xs font-bold flex items-center gap-1 shrink-0 active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Thoát</span>
        </button>
      </header>

      {/* Banner trạng thái khóa hoặc chỉ xếp hàng đợi */}
      {locked && (
        <div className="mx-4 mt-3 rounded-2xl bg-rose-500/20 border border-rose-400/45 px-3.5 py-2.5 text-xs font-extrabold text-rose-200 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Chủ xe đang bật Khóa Remote. Mọi nút gửi lệnh sẽ tạm ngưng cho đến khi mở khóa.</span>
        </div>
      )}

      {!locked && queueOnly && (
        <div className="mx-4 mt-3 rounded-2xl bg-amber-500/15 border border-amber-400/40 px-3.5 py-2 text-xs font-extrabold text-amber-200 flex items-center gap-2">
          <ListPlus className="w-4 h-4 shrink-0" />
          <span>Chủ xe bật chế độ An toàn: bạn chỉ có thể bấm (+) xếp bài nhạc vào hàng đợi kế tiếp.</span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Quick Transport + Báo Audio Controls (Ẩn khi chế độ Chỉ xếp hàng đợi) */}
      {!queueOnly && (
        <div className="px-4 pt-3 pb-2 grid grid-cols-4 gap-1.5">
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('prev', null, '✅ Đã gửi lên VF5: Bài trước')}
            className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95 disabled:opacity-40"
          >
            <SkipBack className="w-4 h-4" />
            <span>Trước</span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('playPause', null, '✅ Đã gửi lên VF5: Phát / Tạm dừng')}
            className="h-11 rounded-2xl bg-sky-500 text-slate-950 flex items-center justify-center gap-1 text-xs font-black active:scale-95 disabled:opacity-40"
          >
            <Play className="w-4 h-4" />
            <span>Phát</span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('next', null, '✅ Đã gửi lên VF5: Bài tiếp')}
            className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95 disabled:opacity-40"
          >
            <span>Tiếp</span>
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('openNews', null, '✅ Đã gửi lên VF5: Đọc Báo Audio')}
            className="h-11 rounded-2xl bg-amber-500/20 border border-amber-400/45 text-amber-300 flex items-center justify-center gap-1 text-xs font-black active:scale-95 disabled:opacity-40"
          >
            <Newspaper className="w-4 h-4" />
            <span>Báo</span>
          </button>
        </div>
      )}

      {/* 4 Mode Tabs (Chỉ giữ tab Nhạc khi Queue-Only) */}
      {!queueOnly && (
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
      )}

      {/* YouTube / SoundCloud switch when on Music tab */}
      {tab === 'music' && (
        <div className="px-4 pt-2 flex gap-1.5">
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
              {!queueOnly && (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => dispatchCommand('playTrack', tr, `🎵 Đang phát trên VF5: ${tr.title}`)}
                  className="h-9 px-2.5 rounded-xl bg-sky-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Phát</span>
                </button>
              )}
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('queueTrack', tr, `➕ Đã xếp hàng đợi VF5: ${tr.title}`)}
                className={`h-9 px-2.5 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40 ${
                  queueOnly
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-white/10 border border-white/15 text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {queueOnly && <span>Xếp đợi</span>}
              </button>
            </div>
          ))}

        {!queueOnly &&
          tab === 'movie' &&
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
                disabled={locked}
                onClick={() =>
                  dispatchCommand(
                    'openMovie',
                    { slug: m.slug, source: m.source || 'kkphim', name: m.name },
                    `🎬 Đang mở trên màn VF5: ${m.name}`
                  )
                }
                className="h-9 px-3 rounded-xl bg-violet-600 text-white text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Chiếu</span>
              </button>
            </div>
          ))}

        {!queueOnly && tab === 'tv' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TV_PICKS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    dispatchCommand('openTv', { query: ch }, `📺 Đang mở ${ch} trên VF5!`)
                  }
                  className="h-9 px-3 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-extrabold active:scale-95 disabled:opacity-40"
                >
                  📺 {ch}
                </button>
              ))}
            </div>
            {tvLoadError && tvChannels.length === 0 && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-200">{tvLoadError}</span>
                <button
                  type="button"
                  onClick={() => loadTvChannels()}
                  className="h-8 px-3 rounded-lg bg-sky-500 text-slate-950 text-xs font-black shrink-0"
                >
                  Tải lại
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {filteredTv.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    dispatchCommand('openTv', { query: ch.name }, `📺 Đang mở ${ch.name} trên VF5!`)
                  }
                  className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-left flex items-center gap-2 active:scale-95 disabled:opacity-40"
                >
                  <Tv className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-xs font-bold truncate">{ch.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!queueOnly &&
          tab === 'nav' &&
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
                disabled={locked}
                onClick={async () => {
                  if (!sessionId) return;
                  const r = await sendGuestRemoteNav(sessionId, deviceId, pl);
                  if (!r.ok) {
                    handleServerRejection(r.code, r.error);
                  } else {
                    notify(`📍 Đã gửi lộ trình lên VF5: ${pl.name}`);
                  }
                }}
                className="h-9 px-3 rounded-xl bg-emerald-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40"
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
