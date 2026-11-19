import React, { useState, useEffect } from 'react';
import {
  X,
  CloudUpload,
  CloudDownload,
  Check,
  Plus,
  FolderPlus,
  Heart,
  Loader2,
  Link2,
  Delete,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SavedPlace, UserPlaylist, VideoItem } from '../types';
import { normalizeSyncCode, pushSyncData, pullSyncData } from '../services/sync';
import { getCarTheme } from '../utils/theme';

interface PlaylistSyncModalProps {
  isOpen: boolean;
  mode: 'sync' | 'addTrack';
  onClose: () => void;
  onSwitchMode: (mode: 'sync' | 'addTrack') => void;
  currentTrack: VideoItem | null;
  favorites: VideoItem[];
  onToggleFavoriteTrack: (track: VideoItem) => void;
  playlists: UserPlaylist[];
  onToggleTrackInPlaylist: (playlistId: string, track: VideoItem) => void;
  onCreatePlaylist: (name: string, icon: string) => string;
  onDeletePlaylist: (playlistId: string) => void;
  savedPlaces: SavedPlace[];
  syncCode: string;
  onSaveSyncCode: (code: string) => void;
  onApplyPulledData: (
    favorites: VideoItem[],
    playlists: UserPlaylist[],
    savedPlaces: SavedPlace[],
    code: string
  ) => void;
  isLightTheme?: boolean;
}

const PRESET_NEW_PLAYLISTS = [
  { icon: '🚗', name: 'Đi Cao Tốc' },
  { icon: '🌙', name: 'Lái Đêm Êm Ái' },
  { icon: '🧧', name: 'Về Quê Đường Dài' },
  { icon: '🕺', name: 'Nhạc Bốc Lái Xe' },
];

export const PlaylistSyncModal: React.FC<PlaylistSyncModalProps> = ({
  isOpen,
  mode,
  onClose,
  onSwitchMode,
  currentTrack,
  favorites,
  onToggleFavoriteTrack,
  playlists,
  onToggleTrackInPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  savedPlaces,
  syncCode,
  onSaveSyncCode,
  onApplyPulledData,
  isLightTheme = false,
}) => {
  const theme = getCarTheme(isLightTheme);
  const [codeDigits, setCodeDigits] = useState<string>(syncCode || '6868');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [confirmEmptyPush, setConfirmEmptyPush] = useState<boolean>(false);

  const [newPlName, setNewPlName] = useState<string>('');
  const [newPlIcon, setNewPlIcon] = useState<string>('🎵');

  useEffect(() => {
    if (isOpen) {
      setCodeDigits(syncCode || '');
      setStatusMsg(null);
      setCopiedLink(false);
      setConfirmEmptyPush(false);
    }
  }, [isOpen, syncCode]);

  if (!isOpen) return null;

  const cleanCode = normalizeSyncCode(codeDigits);
  const totalPlaylistTracks = playlists.reduce((acc, p) => acc + p.items.length, 0);
  const isLocalEmpty =
    favorites.length === 0 && totalPlaylistTracks === 0 && savedPlaces.length === 0;

  const handleDigitPress = (d: string) => {
    setStatusMsg(null);
    setConfirmEmptyPush(false);
    setCodeDigits((prev) => (prev.length < 6 ? prev + d : prev));
  };

  const handleBackspace = () => {
    setStatusMsg(null);
    setConfirmEmptyPush(false);
    setCodeDigits((prev) => prev.slice(0, -1));
  };

  const handlePush = async () => {
    if (cleanCode.length < 4) {
      setStatusMsg({ type: 'err', text: 'Hãy bấm đủ ít nhất 4 chữ số cho Mã Xe (ví dụ: 6868).' });
      return;
    }
    // Chống lỡ tay bấm Đẩy lên mây từ màn xe trống làm ghi đè mất dữ liệu đã soạn trên điện thoại!
    if (isLocalEmpty && !confirmEmptyPush) {
      setConfirmEmptyPush(true);
      setStatusMsg({
        type: 'err',
        text: 'Máy này đang có 0 bài hát & 0 điểm ghim. Nếu bạn muốn TẢI nhạc về xe hãy bấm nút xanh "Tải về màn VF5"! Bấm "Đẩy lên mây" lần nữa nếu chắc chắn muốn ghi đè trống.',
      });
      return;
    }

    setConfirmEmptyPush(false);
    setIsSyncing(true);
    setStatusMsg(null);
    const res = await pushSyncData(cleanCode, favorites, playlists, savedPlaces);
    setIsSyncing(false);

    if (res.success) {
      onSaveSyncCode(cleanCode);
      setStatusMsg({
        type: 'ok',
        text: `Đã lưu thành công lên mã VF5-${cleanCode}! Mở APTV / asCar trên xe nhập mã ${cleanCode} để tải nhạc, điểm ghim & nhận dẫn đường từ điện thoại.`,
      });
    } else {
      setStatusMsg({ type: 'err', text: res.error || 'Không thể đẩy dữ liệu.' });
    }
  };

  const handlePull = async () => {
    if (cleanCode.length < 4) {
      setStatusMsg({ type: 'err', text: 'Hãy bấm đủ ít nhất 4 chữ số Mã Xe để tải về.' });
      return;
    }
    setConfirmEmptyPush(false);
    setIsSyncing(true);
    setStatusMsg(null);
    const res = await pullSyncData(cleanCode);
    setIsSyncing(false);

    if (res.success && res.data) {
      onApplyPulledData(
        res.data.favorites || [],
        res.data.playlists || [],
        res.data.savedPlaces || [],
        cleanCode
      );
      setStatusMsg({
        type: 'ok',
        text: `Đã đồng bộ về xe: ${res.data.favorites?.length || 0} bài Yêu thích, ${
          res.data.playlists?.length || 0
        } Playlist & ${res.data.savedPlaces?.length || 0} điểm bản đồ!`,
      });
    } else {
      setStatusMsg({ type: 'err', text: res.error || 'Không tìm thấy mã xe này.' });
    }
  };

  const handleCopyAutoSyncUrl = async () => {
    if (cleanCode.length < 4 || typeof window === 'undefined') return;
    try {
      const u = new URL(window.location.origin);
      u.searchParams.set('sync', cleanCode);
      await navigator.clipboard.writeText(u.toString());
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setStatusMsg({
        type: 'ok',
        text: `Link mở nhanh trên APTV / asCar: ${window.location.origin}/?sync=${cleanCode}`,
      });
    }
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlName.trim();
    if (!trimmed) return;
    const newId = onCreatePlaylist(trimmed, newPlIcon);
    if (currentTrack && mode === 'addTrack') {
      onToggleTrackInPlaylist(newId, currentTrack);
    }
    setNewPlName('');
  };

  const isTrackFav = currentTrack ? favorites.some((f) => f.id === currentTrack.id) : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quản lý Playlist và Đồng bộ Mã Xe VF5"
      onClick={onClose}
      className={`car-app-shell fixed inset-0 z-50 flex flex-col overflow-hidden ${theme.modalBackdrop}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 max-w-4xl w-full h-full mx-auto flex flex-col min-h-0 px-3 sm:px-5 py-2.5 short:py-2 gap-2.5 short:gap-2 animate-ios-sheet-in"
      >
        {/* TOP HEADER */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className={`flex items-center gap-1.5 p-1 rounded-full border ${theme.segTrack}`}>
            {currentTrack && (
              <button
                type="button"
                onClick={() => onSwitchMode('addTrack')}
                className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition ${
                  mode === 'addTrack' ? theme.segActive : theme.segIdle
                }`}
              >
                <FolderPlus className="w-4 h-4" />
                <span>Lưu vào Playlist</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSwitchMode('sync')}
              className={`min-h-[38px] short:min-h-[34px] px-3.5 rounded-full text-xs sm:text-sm font-extrabold flex items-center gap-1.5 transition ${
                mode === 'sync' ? theme.segActive : theme.segIdle
              }`}
            >
              <CloudUpload className="w-4 h-4" />
              <span>Đồng bộ Mã Xe VF5</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className={`h-11 w-11 short:h-10 short:w-10 rounded-full border flex items-center justify-center shrink-0 active:scale-90 transition ${theme.iconBtn}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-2">
          {mode === 'sync' ? (
            <div className="grid grid-cols-1 car:grid-cols-12 gap-3 items-start">
              {/* CỘT TRÁI: BÀN PHÍM SỐ TO CHO MÀN CẢM ỨNG XE */}
              <div className={`car:col-span-6 border rounded-2xl p-3 short:p-2.5 ${theme.card}`}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span
                    className={`text-xs font-extrabold uppercase tracking-wider ${theme.textSub}`}
                  >
                    Nhập Mã Xe (4–6 số)
                  </span>
                  <span
                    className={`text-base sm:text-lg font-mono font-black tracking-widest px-3 py-0.5 rounded-lg border ${
                      isLightTheme
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                        : 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
                    }`}
                  >
                    VF5-{cleanCode || '____'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5 short:gap-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleDigitPress(digit)}
                      className={`min-h-[46px] short:min-h-[40px] rounded-xl border text-lg font-black active:scale-95 transition ${theme.iconBtn} ${theme.text}`}
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCodeDigits('');
                      setStatusMsg(null);
                    }}
                    className={`min-h-[46px] short:min-h-[40px] rounded-xl border text-xs font-extrabold active:scale-95 transition ${
                      isLightTheme
                        ? 'bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-700'
                        : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-400/30 text-rose-200'
                    }`}
                  >
                    Xóa hết
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDigitPress('0')}
                    className={`min-h-[46px] short:min-h-[40px] rounded-xl border text-lg font-black active:scale-95 transition ${theme.iconBtn} ${theme.text}`}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleBackspace}
                    aria-label="Xóa 1 số"
                    className={`min-h-[46px] short:min-h-[40px] rounded-xl border flex items-center justify-center active:scale-95 transition ${theme.iconBtn}`}
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* CỘT PHẢI: NÚT ĐẨY LÊN MÂY & TẢI VỀ XE */}
              <div className="car:col-span-6 flex flex-col gap-2.5 short:gap-2">
                <div className={`border rounded-2xl p-3.5 short:p-2.5 space-y-2 ${theme.card}`}>
                  <h3 className={`text-sm sm:text-base font-extrabold ${theme.text}`}>
                    Đồng bộ giữa Điện thoại ở nhà &amp; APTV / asCar
                  </h3>
                  <p className={`text-xs leading-relaxed ${theme.textSub}`}>
                    Soạn sẵn nhạc trên điện thoại hoặc máy tính rồi bấm{' '}
                    <strong className={theme.text}>Đẩy lên mây</strong>. Khi lên xe VF5, nhập đúng
                    mã số này và bấm{' '}
                    <strong className={isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}>
                      Tải về màn VF5
                    </strong>
                    .
                  </p>
                  <div
                    className={`text-xs font-bold border rounded-xl px-3 py-1.5 ${
                      isLightTheme
                        ? 'text-blue-800 bg-blue-50 border-blue-200'
                        : 'text-sky-300 bg-sky-500/10 border-sky-400/25'
                    }`}
                  >
                    Máy này: {favorites.length} Yêu thích • {playlists.length} Playlist (
                    {totalPlaylistTracks} bài) • {savedPlaces.length} điểm ghim bản đồ
                  </div>
                  <p
                    className={`text-[11px] font-semibold ${
                      isLightTheme ? 'text-emerald-700' : 'text-emerald-300/90'
                    }`}
                  >
                    💡 Mẹo Send-to-Car: Khi đã gắn cùng Mã Xe, tìm địa chỉ trên điện thoại rồi bấm{' '}
                    <strong>“Gửi xe”</strong> — Bản đồ 3D trên VF5 sẽ tự vẽ lộ trình ngay!
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSyncing || cleanCode.length < 4}
                    onClick={handlePush}
                    className={`min-h-[50px] short:min-h-[44px] px-4 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl disabled:opacity-40 active:scale-95 transition ${theme.primaryCta}`}
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CloudUpload className="w-4 h-4" />
                    )}
                    <span>Đẩy lên mây</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSyncing || cleanCode.length < 4}
                    onClick={handlePull}
                    className="min-h-[50px] short:min-h-[44px] px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl disabled:opacity-40 active:scale-95 transition"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CloudDownload className="w-4 h-4" />
                    )}
                    <span>Tải về màn VF5</span>
                  </button>
                </div>

                {cleanCode.length >= 4 && (
                  <button
                    type="button"
                    onClick={handleCopyAutoSyncUrl}
                    className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition ${theme.iconBtn}`}
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span className={isLightTheme ? 'text-emerald-700' : 'text-emerald-300'}>
                          Đã chép Link tự đồng bộ (?sync={cleanCode}) cho APTV / asCar!
                        </span>
                      </>
                    ) : (
                      <>
                        <Link2
                          className={`w-4 h-4 ${isLightTheme ? 'text-blue-600' : 'text-sky-300'}`}
                        />
                        <span>Chép Link mở tự động trên APTV / asCar (?sync={cleanCode})</span>
                      </>
                    )}
                  </button>
                )}

                {statusMsg && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold ${
                      statusMsg.type === 'ok'
                        ? isLightTheme
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                        : isLightTheme
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-rose-500/20 border-rose-400/50 text-rose-100'
                    }`}
                  >
                    {statusMsg.text}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* CHẾ ĐỘ LƯU BÀI HÁT VÀO PLAYLIST RIÊNG */
            <div className="space-y-3">
              {currentTrack && (
                <div className={`flex items-center gap-3 p-2.5 rounded-2xl border ${theme.card}`}>
                  <img
                    src={currentTrack.thumbnail}
                    alt={currentTrack.title}
                    className="w-12 h-12 rounded-xl object-cover shrink-0 bg-black"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-sm font-extrabold truncate ${theme.text}`}>
                      {currentTrack.title}
                    </h4>
                    <p className={`text-xs truncate ${theme.textSub}`}>
                      {currentTrack.uploaderName}
                    </p>
                  </div>
                </div>
              )}

              {/* Danh sách chọn 1 chạm */}
              <div className="grid grid-cols-1 car:grid-cols-2 gap-2">
                {currentTrack && (
                  <button
                    type="button"
                    onClick={() => onToggleFavoriteTrack(currentTrack)}
                    className={`min-h-[48px] px-4 py-2.5 rounded-2xl border flex items-center justify-between gap-2 active:scale-98 transition ${
                      isTrackFav
                        ? isLightTheme
                          ? 'bg-rose-50 border-rose-400 text-rose-950'
                          : 'bg-rose-500/25 border-rose-400/60 text-white'
                        : `${theme.itemIdle} ${theme.text}`
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Heart
                        className={`w-5 h-5 shrink-0 ${
                          isTrackFav
                            ? 'fill-rose-500 text-rose-500'
                            : isLightTheme
                            ? 'text-rose-500'
                            : 'text-rose-300'
                        }`}
                      />
                      <span className="text-sm font-extrabold truncate">
                        Bài hát Yêu thích ({favorites.length})
                      </span>
                    </div>
                    {isTrackFav && (
                      <Check
                        className={`w-5 h-5 shrink-0 ${
                          isLightTheme ? 'text-rose-600' : 'text-rose-300'
                        }`}
                      />
                    )}
                  </button>
                )}

                {playlists.map((pl) => {
                  const inPl = currentTrack
                    ? pl.items.some((it) => it.id === currentTrack.id)
                    : false;
                  return (
                    <div
                      key={pl.id}
                      className={`min-h-[48px] pl-4 pr-2 py-2 rounded-2xl border flex items-center justify-between gap-2 ${
                        inPl
                          ? isLightTheme
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                            : 'bg-emerald-500/20 border-emerald-400/50 text-white'
                          : `${theme.itemIdle} ${theme.text}`
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => currentTrack && onToggleTrackInPlaylist(pl.id, currentTrack)}
                        className="flex-1 flex items-center justify-between gap-2 text-left min-w-0 py-1"
                      >
                        <span className="text-sm font-extrabold truncate">
                          {pl.icon} {pl.name} ({pl.items.length})
                        </span>
                        {inPl ? (
                          <Check
                            className={`w-5 h-5 shrink-0 ${
                              isLightTheme ? 'text-emerald-600' : 'text-emerald-300'
                            }`}
                          />
                        ) : (
                          <Plus className={`w-4 h-4 shrink-0 ${theme.textMuted}`} />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa playlist ${pl.name}`}
                        onClick={() => onDeletePlaylist(pl.id)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                          isLightTheme
                            ? 'text-slate-400 hover:text-rose-600 hover:bg-slate-200/70'
                            : 'text-white/40 hover:text-rose-300 hover:bg-white/10'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Tạo nhanh Playlist 1 chạm cho màn xe */}
              <div className={`p-3 rounded-2xl border space-y-2.5 ${theme.card}`}>
                <div
                  className={`flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider ${theme.textSub}`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Tạo thêm Playlist mới</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PRESET_NEW_PLAYLISTS.filter(
                    (pr) => !playlists.some((p) => p.name.toLowerCase() === pr.name.toLowerCase())
                  ).map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        const id = onCreatePlaylist(preset.name, preset.icon);
                        if (currentTrack) onToggleTrackInPlaylist(id, currentTrack);
                      }}
                      className={`min-h-[38px] px-3 rounded-full border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition ${theme.chipIdle}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {preset.icon} {preset.name}
                      </span>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleCreateCustom} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const icons = ['🎵', '🚗', '🔥', '📻', '☕', '👶'];
                      const idx = icons.indexOf(newPlIcon);
                      setNewPlIcon(icons[(idx + 1) % icons.length]);
                    }}
                    className={`h-11 w-11 rounded-xl border text-lg flex items-center justify-center shrink-0 ${theme.iconBtn}`}
                    title="Đổi biểu tượng"
                  >
                    {newPlIcon}
                  </button>
                  <input
                    type="text"
                    value={newPlName}
                    onChange={(e) => setNewPlName(e.target.value)}
                    placeholder="Nhập tên Playlist riêng..."
                    className={`flex-1 h-11 px-3.5 rounded-xl border text-sm font-bold focus:outline-none ${theme.input}`}
                  />
                  <button
                    type="submit"
                    disabled={!newPlName.trim()}
                    className={`h-11 px-4 rounded-xl font-extrabold text-xs sm:text-sm disabled:opacity-40 active:scale-95 transition shrink-0 ${theme.primaryCta}`}
                  >
                    Tạo mới
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
