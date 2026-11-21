import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Play,
  Pause,
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
  Unlock,
  KeyRound,
  Clock,
  AlertTriangle,
  ListPlus,
  RefreshCw,
  Wifi,
  Gamepad2,
  Gauge,
  Compass,
  Bookmark,
  History,
  Heart,
  Shuffle,
  Repeat,
  Maximize2,
  Sun,
  Moon,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Navigation,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Volume2,
  SlidersHorizontal,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import {
  MovieItem,
  MusicSource,
  RailSection,
  RemoteControlCommand,
  RemoteLiveSnapshot,
  RemoteMapAction,
  TvChannel,
  VideoItem,
} from '../types';
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
  sendGuestRtcOffer,
  toggleOwnerJoinLock,
} from '../services/remoteSession';
import { createGuestRtcPeer, GuestRtcPeer } from '../services/webrtcRemote';
import { fetchWithTimeout } from '../utils/timedFetch';

interface CoPilotRemoteViewProps {
  initialCode: string;
  onExitCoPilot: () => void;
}

type RemoteTab = 'remote' | 'music' | 'movie' | 'tv' | 'nav';
type GatePhase = 'checking' | 'legacy' | 'expired' | 'blocked' | 'join' | 'pending' | 'approved';

const QUICK_TV_PICKS = ['VTV1', 'VTV3', 'VOV Giao thông', 'HTV7', 'HTV9', 'VTV Cần Thơ'];

const SCREEN_LABELS: Record<RailSection, string> = {
  cockpit: 'Cockpit 3D',
  nowPlaying: 'Đang phát',
  tv: 'TV Live',
  news: 'Báo Audio',
  movies: 'Rạp Phim',
  browse: 'Khám phá',
  favorites: 'Playlist',
  history: 'Lịch sử',
};

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
  const [noTouchMode, setNoTouchMode] = useState<boolean>(false);
  const [role, setRole] = useState<'owner' | 'guest'>('guest');
  const [ownerJoinLocked, setOwnerJoinLocked] = useState<boolean>(false);
  const [locked, setLocked] = useState<boolean>(false);
  const [queueOnly, setQueueOnly] = useState<boolean>(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [joining, setJoining] = useState<boolean>(false);

  // WebRTC P2P Direct Link state (0ms & 0 server cost!)
  const [isP2pOpen, setIsP2pOpen] = useState<boolean>(false);
  const [liveSnapshot, setLiveSnapshot] = useState<RemoteLiveSnapshot | null>(null);
  const rtcPeerRef = useRef<GuestRtcPeer | null>(null);
  const appliedAnswerTsRef = useRef<number>(0);
  const didInitiateOfferRef = useRef<boolean>(false);
  const waitingForAnswerUntilRef = useRef<number>(0);

  const [tab, setTab] = useState<RemoteTab>('music');
  const hasAutoSelectedRemoteTabRef = useRef<boolean>(false);
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

  const isFullController = noTouchMode && role === 'owner';

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      rtcPeerRef.current?.close();
      rtcPeerRef.current = null;
    };
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const startFreshRtcOffer = useCallback(async (): Promise<string | undefined> => {
    rtcPeerRef.current?.close();
    rtcPeerRef.current = null;
    setIsP2pOpen(false);
    appliedAnswerTsRef.current = 0;

    const peer = await createGuestRtcPeer({
      onOpen: () => {
        setIsP2pOpen(true);
      },
      onClose: () => {
        setIsP2pOpen(false);
      },
      onStateSnapshot: (snap) => {
        setLiveSnapshot(snap);
      },
    });
    if (!peer) return undefined;
    rtcPeerRef.current = peer;
    waitingForAnswerUntilRef.current = Date.now() + 18_000;
    return peer.offerSdp;
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!sessionId) {
      setPhase('legacy');
      return;
    }
    const res = await checkGuestSessionStatus(sessionId, deviceId);
    if (!res.ok) {
      if (res.code === 'SESSION_EXPIRED' || res.code === 'INVALID_SESSION') {
        rtcPeerRef.current?.close();
        setIsP2pOpen(false);
        setPhase('expired');
        setGateError(res.error || 'Phiên QR đã hết hạn hoặc bị thu hồi.');
      } else {
        setGateError(res.error || 'Không kết nối được máy chủ. Hãy kiểm tra 4G/WiFi và thử lại.');
      }
      return;
    }

    setRequirePin(Boolean(res.requirePin));
    setRequireApproval(Boolean(res.requireApproval));
    setNoTouchMode(Boolean(res.noTouchMode));
    setRole(res.role === 'owner' ? 'owner' : 'guest');
    setOwnerJoinLocked(Boolean(res.ownerJoinLocked));
    setLocked(Boolean(res.locked));
    setQueueOnly(Boolean(res.queueOnly));
    if (res.expiresAt) setExpiresAt(res.expiresAt);
    setGateError(null);

    if (res.status === 'approved') {
      setPhase('approved');
      // Nếu là chủ xe trên màn Không Cảm Ứng -> mở thẳng Bàn Điều Khiển Toàn Phần!
      if (res.noTouchMode && res.role === 'owner' && !hasAutoSelectedRemoteTabRef.current) {
        hasAutoSelectedRemoteTabRef.current = true;
        setTab('remote');
      }
      // Hoàn tất bắt tay WebRTC P2P ngay khi Host trả rtcAnswer!
      if (
        res.rtcAnswer?.sdp &&
        res.rtcAnswer.ts !== appliedAnswerTsRef.current &&
        rtcPeerRef.current &&
        !rtcPeerRef.current.isOpen()
      ) {
        appliedAnswerTsRef.current = res.rtcAnswer.ts;
        rtcPeerRef.current.applyAnswer(res.rtcAnswer.sdp).catch(() => {});
      } else if (!rtcPeerRef.current && !didInitiateOfferRef.current) {
        // Trường hợp F5 tải lại trang khi đã được duyệt -> tự khởi tạo Offer để nối lại P2P!
        didInitiateOfferRef.current = true;
        startFreshRtcOffer().then((sdp) => {
          if (sdp) sendGuestRtcOffer(sessionId, deviceId, sdp).catch(() => {});
        });
      }
    } else if (res.status === 'blocked') {
      rtcPeerRef.current?.close();
      setIsP2pOpen(false);
      setPhase('blocked');
    } else if (res.status === 'pending') {
      setPhase('pending');
    } else {
      setPhase('join');
    }
  }, [sessionId, deviceId, startFreshRtcOffer]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Poll thích ứng siêu tiết kiệm server:
  // - Khi đang đợi rtcAnswer hoặc đang pending duyệt: 2.2s
  // - Khi WebRTC P2P đã thông: 45s keepalive (giảm 92% Worker req & KV read!)
  // - Khi fallback HTTP: 15s
  useEffect(() => {
    if (phase !== 'pending' && phase !== 'join' && phase !== 'blocked' && phase !== 'approved') {
      return;
    }
    const awaitingRtc =
      phase === 'approved' && !isP2pOpen && Date.now() < waitingForAnswerUntilRef.current;
    const intervalMs =
      phase === 'pending' || awaitingRtc
        ? 2200
        : phase === 'approved'
        ? isP2pOpen
          ? 45000
          : 15000
        : 5000;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [phase, isP2pOpen, refreshStatus]);

  useEffect(() => {
    if (queueOnly && !isFullController && tab !== 'music') {
      setTab('music');
    }
  }, [queueOnly, isFullController, tab]);

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

  useEffect(() => {
    if (phase !== 'approved' || tab !== 'tv' || tvChannels.length > 0 || tvLoading) return;
    loadTvChannels();
  }, [phase, tab, tvChannels.length, tvLoading, loadTvChannels]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) return;
    if (requirePin && pinInput.replace(/\D/g, '').length < 4) {
      setGateError('Hãy nhập đủ 4 chữ số PIN hiển thị ngay cạnh mã QR trên màn hình xe.');
      return;
    }
    setJoining(true);
    setGateError(null);

    // Tạo luôn WebRTC SDP Offer để nhúng vào lệnh join (0 thêm lượt ghi KV!)
    didInitiateOfferRef.current = true;
    const offerSdp = await startFreshRtcOffer();

    const res = await joinGuestRemoteSession(
      sessionId,
      deviceId,
      deviceLabel.trim() || detectGuestDeviceLabel(),
      pinInput.replace(/\D/g, ''),
      offerSdp
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
      setGateError(res.error || 'Không kết nối được vào màn hình xe.');
      return;
    }

    setLocked(Boolean(res.locked));
    setQueueOnly(Boolean(res.queueOnly));
    setNoTouchMode(Boolean(res.noTouchMode));
    setRole(res.role === 'owner' ? 'owner' : 'guest');
    setOwnerJoinLocked(Boolean(res.ownerJoinLocked));
    if (res.expiresAt) setExpiresAt(res.expiresAt);

    if (res.status === 'approved') {
      setPhase('approved');
      if (res.noTouchMode && res.role === 'owner') {
        hasAutoSelectedRemoteTabRef.current = true;
        setTab('remote');
      }
      // Poll sớm sau 1.5s để nhận rtcAnswer ngay lập tức!
      window.setTimeout(() => refreshStatus(), 1500);
    } else {
      setPhase('pending');
    }
  };

  const handleServerRejection = (code?: string, errMsg?: string) => {
    if (code === 'SESSION_EXPIRED' || code === 'INVALID_SESSION') {
      rtcPeerRef.current?.close();
      setIsP2pOpen(false);
      setPhase('expired');
      setGateError(errMsg || 'Phiên QR đã hết hạn hoặc chủ xe đã thu hồi.');
      return;
    }
    if (code === 'BLOCKED') {
      rtcPeerRef.current?.close();
      setIsP2pOpen(false);
      setPhase('blocked');
      return;
    }
    if (code === 'NOT_APPROVED') {
      setPhase('pending');
      return;
    }
    if (code === 'LOCKED') setLocked(true);
    if (code === 'QUEUE_ONLY') setQueueOnly(true);
    notify(`⚠️ ${errMsg || 'Lệnh chưa được thực thi.'}`);
  };

  // Gửi lệnh ưu tiên WebRTC P2P (0ms, 0 Worker req, 0 KV write!) -> Tự rơi mượt sang HTTP nếu không có P2P!
  const dispatchCommand = async (
    action: RemoteControlCommand['action'],
    payload?: any,
    okMsg?: string
  ) => {
    if (!sessionId) return;
    if (locked) {
      notify('🔒 Chủ xe đang bật Khóa Remote');
      return;
    }
    if (queueOnly && !isFullController && action !== 'queueTrack') {
      notify('🎵 Đang ở chế độ Chỉ xếp hàng đợi — hãy bấm dấu (+)');
      return;
    }

    const peer = rtcPeerRef.current;
    if (peer && peer.isOpen()) {
      const sent = peer.sendPacket({
        type: 'cmd',
        cmd: {
          id: `p2p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action,
          payload,
          sentAt: new Date().toISOString(),
        },
      });
      if (sent) {
        if (okMsg) notify(okMsg);
        return;
      }
    }

    const r = await sendGuestRemoteCommand(sessionId, deviceId, action, payload);
    if (!r.ok) {
      handleServerRejection(r.code, r.error);
      return;
    }
    if (typeof r.queueOnly === 'boolean') setQueueOnly(r.queueOnly);
    if (typeof r.locked === 'boolean') setLocked(r.locked);
    if (okMsg) notify(okMsg);
  };

  const dispatchNav = async (pl: { name: string; subtitle: string; lat: number; lon: number }) => {
    if (!sessionId) return;
    const peer = rtcPeerRef.current;
    if (peer && peer.isOpen()) {
      const sent = peer.sendPacket({
        type: 'nav',
        nav: {
          id: `p2pnav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: pl.name,
          subtitle: pl.subtitle,
          lat: pl.lat,
          lon: pl.lon,
          sentAt: new Date().toISOString(),
        },
      });
      if (sent) {
        notify(`📍 Đã gửi lộ trình tức thì (P2P): ${pl.name}`);
        return;
      }
    }

    const r = await sendGuestRemoteNav(sessionId, deviceId, pl);
    if (!r.ok) {
      handleServerRejection(r.code, r.error);
    } else {
      notify(`📍 Đã gửi lộ trình lên màn xe: ${pl.name}`);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      if (tab === 'music') {
        const res = await searchVideos(q, null, undefined, musicSource);
        setTracks(res.items || []);
      } else if (tab === 'movie') {
        const res = await fetchMovieList({ source: 'kkphim', type: 'moi-cap-nhat', keyword: q, limit: 20 });
        setMovies(res.items || []);
      } else if (tab === 'nav') {
        const r = await fetchWithTimeout(`/api/places?q=${encodeURIComponent(q)}`, {}, 7000);
        const d = r.ok ? await r.json() : null;
        setPlaces(Array.isArray(d?.items) ? d.items : []);
      }
    } catch {
      notify('⚠️ Không tìm được kết quả — kiểm tra mạng 4G');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // CỔNG XÁC THỰC BẢO MẬT (CHECKING / LEGACY / EXPIRED / BLOCKED / JOIN / PENDING)
  // =========================================================================
  if (phase !== 'approved') {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl bg-slate-900/95 border border-white/15 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 text-sky-300 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black leading-tight">
                  {noTouchMode ? 'Điều Khiển Toàn Phần Màn Xe' : 'CarHub Remote Bảo Mật'}
                </h1>
                <p className="text-[11px] text-slate-400 font-semibold">
                  {noTouchMode
                    ? 'Phiên Màn Không Cảm Ứng • P2P siêu nhạy'
                    : 'Xác thực 4 lớp • Chỉ người trong xe mới dùng được'}
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
                  'Mỗi phiên QR chỉ dùng tạm trong 3 giờ và có mã PIN riêng. Hãy quét mã QR mới trên màn hình xe.'}
              </p>
            </div>
          )}

          {phase === 'blocked' && (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/40 p-4 space-y-3 text-center">
              <Lock className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-black text-rose-200">Thiết bị đã bị chủ xe chặn</p>
              <p className="text-xs text-slate-300">
                Chủ xe đã từ chối hoặc ngắt quyền điều khiển của thiết bị này trong phiên hiện tại.
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
                Thông báo xác nhận cho thiết bị <strong className="text-sky-300">{deviceLabel}</strong> đã hiện trên màn hình xe. Tài xế bấm <strong>Cho phép</strong> 1 lần là bạn dùng được suốt chuyến đi!
              </p>
            </div>
          )}

          {phase === 'join' && (
            <form onSubmit={handleJoin} className="space-y-3.5">
              {noTouchMode && (
                <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-3 py-2 text-xs font-bold text-emerald-200 flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 shrink-0" />
                  <span>Chế độ Màn Không Cảm Ứng: Nhập PIN 4 số để điều khiển toàn bộ màn hình xe không cần chạm!</span>
                </div>
              )}

              {locked && (
                <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-200 flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>Chủ xe đang bật Khóa Remote — hãy nhờ mở khóa trên màn hình xe.</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-slate-300 block">
                  Tên thiết bị của bạn
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder="VD: iPhone Chủ Xe"
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
                  {requireApproval ? 'Gửi yêu cầu kết nối vào xe' : 'Kết nối điều khiển xe ngay'}
                </span>
              </button>

              {expiresAt && (
                <p className="text-[11px] text-center text-slate-400 font-semibold flex items-center justify-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Phiên QR tự hủy sau {formatRemainingTime(expiresAt)} • Tự động nâng cấp P2P 0ms</span>
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

  const navTabs: Array<{ id: RemoteTab; icon: any; label: string }> = isFullController
    ? [
        { id: 'remote', icon: Gamepad2, label: 'Điều khiển' },
        { id: 'music', icon: Music, label: 'Nhạc' },
        { id: 'movie', icon: Film, label: 'Phim' },
        { id: 'tv', icon: Tv, label: 'TV' },
        { id: 'nav', icon: MapPin, label: 'Bản đồ' },
      ]
    : [
        { id: 'music', icon: Music, label: 'Nhạc' },
        { id: 'movie', icon: Film, label: 'Phim' },
        { id: 'tv', icon: Tv, label: 'TV Live' },
        { id: 'nav', icon: MapPin, label: 'Bản đồ' },
      ];

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col max-w-xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md border-b border-white/10 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              isP2pOpen
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                : 'bg-sky-500/20 border-sky-400/40 text-sky-300'
            }`}
          >
            {isP2pOpen ? <Wifi className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black truncate flex items-center gap-1.5">
              <span>{isFullController ? 'Remote Chủ Xe' : 'Đã nối Màn Xe'}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  isP2pOpen
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40'
                    : 'bg-white/10 text-sky-300'
                }`}
              >
                {isP2pOpen ? '⚡ P2P 0ms' : '☁️ Cloud'}
              </span>
              {expiresAt && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-slate-300">
                  {formatRemainingTime(expiresAt)}
                </span>
              )}
            </h1>
            <p className="text-[11px] text-slate-400 font-semibold truncate">
              {locked
                ? '🔒 Chủ xe đang tạm khóa điều khiển từ xa'
                : queueOnly && !isFullController
                ? '🎵 Chế độ Chỉ xếp hàng đợi'
                : isP2pOpen
                ? 'Kết nối trực tiếp 0ms • Không tốn hạn mức server'
                : 'Chọn nhạc, phim, TV Live, Báo Audio & dẫn đường'}
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
        <div className="mx-4 mt-2.5 rounded-2xl bg-rose-500/20 border border-rose-400/45 px-3.5 py-2 text-xs font-extrabold text-rose-200 flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Chủ xe đang bật Khóa Remote. Mọi nút gửi lệnh tạm ngưng.</span>
        </div>
      )}

      {!locked && queueOnly && !isFullController && (
        <div className="mx-4 mt-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 px-3.5 py-2 text-xs font-extrabold text-amber-200 flex items-center gap-2">
          <ListPlus className="w-4 h-4 shrink-0" />
          <span>Chế độ An toàn: chỉ được bấm (+) xếp bài nhạc vào hàng đợi kế tiếp.</span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-50 rounded-2xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-black shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{toast}</span>
        </div>
      )}

      {/* Thanh trạng thái trực tiếp từ màn hình xe (khi có WebRTC P2P!) */}
      {liveSnapshot && (
        <div className="mx-4 mt-2.5 rounded-2xl bg-slate-900/90 border border-sky-400/30 px-3.5 py-2.5 flex items-center justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-sky-300">
              <span>{SCREEN_LABELS[liveSnapshot.screen] || 'Màn Xe'}</span>
              {liveSnapshot.speedKmh !== null && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  {liveSnapshot.speedKmh} km/h
                </span>
              )}
              {liveSnapshot.activeNavName && (
                <span className="truncate text-amber-300">• 🧭 {liveSnapshot.activeNavName}</span>
              )}
            </div>
            <p className="text-xs font-black text-white truncate mt-0.5">{liveSnapshot.title}</p>
            {liveSnapshot.subtitle && (
              <p className="text-[11px] text-slate-400 truncate">{liveSnapshot.subtitle}</p>
            )}
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              liveSnapshot.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
        </div>
      )}

      {/* Quick Transport + Báo Audio Controls */}
      {(!queueOnly || isFullController) && (
        <div className="px-4 pt-2.5 pb-1.5 grid grid-cols-4 gap-1.5">
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('prev', null, '⏮ Bài trước')}
            className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95 disabled:opacity-40"
          >
            <SkipBack className="w-4 h-4" />
            <span>Trước</span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('playPause', null, '⏯ Phát / Tạm dừng')}
            className="h-11 rounded-2xl bg-sky-500 text-slate-950 flex items-center justify-center gap-1 text-xs font-black active:scale-95 disabled:opacity-40"
          >
            {liveSnapshot?.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{liveSnapshot?.isPlaying ? 'Dừng' : 'Phát'}</span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('next', null, '⏭ Bài tiếp')}
            className="h-11 rounded-2xl bg-slate-900 border border-white/15 flex items-center justify-center gap-1 text-xs font-extrabold active:scale-95 disabled:opacity-40"
          >
            <span>Tiếp</span>
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => dispatchCommand('openNews', null, '📰 Mở Báo Audio')}
            className="h-11 rounded-2xl bg-amber-500/20 border border-amber-400/45 text-amber-300 flex items-center justify-center gap-1 text-xs font-black active:scale-95 disabled:opacity-40"
          >
            <Newspaper className="w-4 h-4" />
            <span>Báo</span>
          </button>
        </div>
      )}

      {/* Mode Tabs */}
      {(!queueOnly || isFullController) && (
        <div
          className={`px-4 py-1.5 grid gap-1.5 ${
            navTabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
          }`}
        >
          {navTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`h-10 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1 active:scale-95 transition px-1 ${
                  active
                    ? 'bg-violet-600 border-violet-400 text-white shadow'
                    : 'bg-slate-900 border-white/10 text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          TAB 0 (MÀN KHÔNG CẢM ỨNG): BÀN ĐIỀU KHIỂN TOÀN PHẦN MÀN HÌNH XE!
         ===================================================================== */}
      {isFullController && tab === 'remote' && (
        <div className="flex-1 px-4 pb-10 pt-2 space-y-3">
          {/* 1. Chuyển nhanh 8 màn hình xe 1 chạm */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Chuyển màn hình xe (1 chạm)
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (!sessionId) return;
                  const next = !ownerJoinLocked;
                  const r = await toggleOwnerJoinLock(sessionId, deviceId, next);
                  if (r.ok) {
                    setOwnerJoinLocked(Boolean(r.ownerJoinLocked));
                    notify(
                      r.ownerJoinLocked
                        ? '🔒 Đã khóa — chỉ điện thoại bạn điều khiển được màn xe'
                        : '🔓 Đã mở cho điện thoại khác trong xe nhập PIN'
                    );
                  }
                }}
                className={`h-7 px-2.5 rounded-lg border text-[10px] font-black flex items-center gap-1 active:scale-95 ${
                  ownerJoinLocked
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                }`}
              >
                {ownerJoinLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{ownerJoinLocked ? 'Đã khóa máy lạ' : 'Đang mở máy lạ'}</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'cockpit', label: 'Cockpit', icon: Gauge },
                  { id: 'nowPlaying', label: 'Đang phát', icon: Music },
                  { id: 'tv', label: 'TV Live', icon: Tv },
                  { id: 'news', label: 'Báo', icon: Newspaper },
                  { id: 'movies', label: 'Phim', icon: Film },
                  { id: 'browse', label: 'Khám phá', icon: Compass },
                  { id: 'favorites', label: 'Playlist', icon: Bookmark },
                  { id: 'history', label: 'Lịch sử', icon: History },
                ] as Array<{ id: RailSection; label: string; icon: any }>
              ).map((s) => {
                const Icon = s.icon;
                const isCur = liveSnapshot?.screen === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      dispatchCommand('switchScreen', { screen: s.id }, `🖥️ Mở ${s.label}`)
                    }
                    className={`h-14 rounded-xl border flex flex-col items-center justify-center gap-1 active:scale-95 transition disabled:opacity-40 ${
                      isCur
                        ? 'bg-sky-500 border-sky-300 text-slate-950 font-black shadow'
                        : 'bg-slate-950 border-white/10 text-slate-200 font-bold'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-[11px] leading-none">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Tua bài, Yêu thích, Trộn/Lặp, Nhạc/Video & Toàn màn hình */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
              Điều khiển phát &amp; Chuyển kênh / Cuộn trang
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('seekRelative', { delta: -15 }, '⏪ Tua -15 giây')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>-15s</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('seekRelative', { delta: 15 }, '⏩ Tua +15 giây')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>+15s</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleFavorite', null, '❤️ Yêu thích')}
                className={`h-11 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 active:scale-95 ${
                  liveSnapshot?.isFavorite
                    ? 'bg-rose-600 border-rose-400 text-white'
                    : 'bg-slate-950 border-white/10 text-slate-200'
                }`}
              >
                <Heart className="w-3.5 h-3.5" />
                <span>Thích</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleFullscreen', null, '⛶ Toàn màn hình')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleShuffle', null, '🔀 Bật/tắt Trộn bài')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Trộn</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleRepeat', null, '🔁 Đổi chế độ Lặp')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Lặp</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('tvZap', { dir: 'prev' }, '📺 Kênh TV trước')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>TV -</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('tvZap', { dir: 'next' }, '📺 Kênh TV sau')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <span>TV +</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('scrollPage', { dir: 'up' })}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <ChevronUp className="w-4 h-4" />
                <span>Cuộn lên</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('scrollPage', { dir: 'down' })}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <ChevronDown className="w-4 h-4" />
                <span>Cuộn xuống</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('newsNav', { dir: 'prev' }, '📰 Tin trước')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Tin -</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('newsNav', { dir: 'next' }, '📰 Tin sau')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <span>Tin +</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 3. Điều khiển Bản đồ 3D Cockpit từ xa */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
              Điều khiển Bản đồ 3D Cockpit
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { act: 'zoomIn', label: 'Zoom +', icon: ZoomIn },
                  { act: 'zoomOut', label: 'Zoom -', icon: ZoomOut },
                  { act: 'recenter', label: 'Về xe', icon: LocateFixed },
                  { act: 'toggleFollow', label: 'Bám mũi', icon: Navigation },
                  { act: 'toggleExpand', label: 'Mở rộng', icon: Maximize2 },
                  { act: 'toggleCameras', label: 'Camera', icon: ShieldCheck },
                  { act: 'toggleTraffic', label: 'Tắc đường', icon: Gauge },
                  { act: 'cancelRoute', label: 'Hủy đường', icon: AlertTriangle },
                ] as Array<{ act: RemoteMapAction; label: string; icon: any }>
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.act}
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      dispatchCommand('mapControl', { mapAction: m.act }, `🗺️ ${m.label}`)
                    }
                    className="h-11 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex flex-col items-center justify-center gap-0.5 active:scale-95 disabled:opacity-40"
                  >
                    <Icon className="w-3.5 h-3.5 text-sky-400" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Cài đặt nhanh màn hình xe từ xa */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-3 space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
              Cài đặt nhanh màn xe
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleTheme', null, '☀️/🌙 Đã đổi Sáng / Tối')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                {liveSnapshot?.isLightTheme ? (
                  <Moon className="w-4 h-4 text-sky-300" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-300" />
                )}
                <span>Sáng / Tối</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleHud', null, '🪞 Mở HUD Kính lái')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <span>🪞 HUD</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleViewMode', null, '🎬 Đổi Nhạc / Video')}
                className="h-11 rounded-xl bg-slate-950 border border-white/10 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Tv className="w-4 h-4 text-violet-300" />
                <span>Nhạc/Vid</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('toggleVoiceAlert', null, '🔊 Bật/tắt giọng cảnh báo')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>Âm cảnh báo</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('cycleUiScale', null, '🔍 Đổi cỡ chữ')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-300" />
                <span>Cỡ chữ</span>
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatchCommand('cycleDockMode', null, '◫ Đổi vị trí Menu nổi')}
                className="h-10 rounded-xl bg-slate-950 border border-white/10 text-[11px] font-extrabold flex items-center justify-center gap-1 active:scale-95"
              >
                <span>◫ Menu nổi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Music source toggle */}
      {tab === 'music' && (
        <div className="px-4 pt-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMusicSource('youtube')}
            className={`h-8 px-3 rounded-full text-xs font-extrabold border ${
              musicSource === 'youtube'
                ? 'bg-rose-600 border-rose-400 text-white'
                : 'bg-slate-900 border-white/10 text-slate-300'
            }`}
          >
            YouTube
          </button>
          <button
            type="button"
            onClick={() => setMusicSource('soundcloud')}
            className={`h-8 px-3 rounded-full text-xs font-extrabold border ${
              musicSource === 'soundcloud'
                ? 'bg-orange-500 border-orange-300 text-slate-950'
                : 'bg-slate-900 border-white/10 text-slate-300'
            }`}
          >
            SoundCloud Remix
          </button>
        </div>
      )}

      {/* Search Form (Ẩn khi ở tab Điều khiển) */}
      {tab !== 'remote' && (
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
      )}

      {/* Results */}
      {tab !== 'remote' && (
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
                {(!queueOnly || isFullController) && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => dispatchCommand('playTrack', tr, `🎵 Đang phát: ${tr.title}`)}
                    className="h-9 px-2.5 rounded-xl bg-sky-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Phát</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => dispatchCommand('queueTrack', tr, `➕ Đã xếp hàng đợi: ${tr.title}`)}
                  className={`h-9 px-2.5 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40 ${
                    queueOnly && !isFullController
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-white/10 border border-white/15 text-white'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {queueOnly && !isFullController && <span>Xếp đợi</span>}
                </button>
              </div>
            ))}

          {(!queueOnly || isFullController) &&
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
                    {m.year || ''} • {m.quality} • {m.lang}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() =>
                    dispatchCommand(
                      'openMovie',
                      { slug: m.slug, source: m.source || 'kkphim', name: m.name },
                      `🎬 Đang mở phim: ${m.name}`
                    )
                  }
                  className="h-9 px-3 rounded-xl bg-violet-600 text-white text-[11px] font-black shrink-0 active:scale-95 disabled:opacity-40"
                >
                  Chiếu lên xe
                </button>
              </div>
            ))}

          {(!queueOnly || isFullController) && tab === 'tv' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TV_PICKS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      dispatchCommand('openTv', { query: ch }, `📺 Đang mở ${ch}!`)
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
                      dispatchCommand('openTv', { query: ch.name }, `📺 Đang mở ${ch.name}!`)
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

          {(!queueOnly || isFullController) &&
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
                  onClick={() => dispatchNav(pl)}
                  className="h-9 px-3 rounded-xl bg-emerald-500 text-slate-950 text-[11px] font-black flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dẫn đường</span>
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
