import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KeyRound, Loader2, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { RemoteHostController } from '../hooks/useRemoteHostSession';
import { buildSecureCoPilotUrl } from '../services/remoteSession';

interface NoTouchPairingOverlayProps {
  enabled: boolean;
  isFullscreen: boolean;
  isLightTheme: boolean;
  remoteHost?: RemoteHostController;
}

/**
 * Giao diện ghép nối 0-chạm dành riêng cho màn hình xe KHÔNG có cảm ứng (Mazda, BMW, Mercedes, Box HDMI...).
 * - Khi chưa có điện thoại kết nối: hiện thẻ QR sắc nét + PIN 4 số lớn ngay góc trái dưới để chủ xe quét trực tiếp.
 * - Khi điện thoại đã kết nối thành công: tự động ẩn thẻ QR để trả lại 100% không gian màn hình, chỉ hiện huy hiệu nhỏ P2P!
 */
export const NoTouchPairingOverlay: React.FC<NoTouchPairingOverlayProps> = ({
  enabled,
  isFullscreen,
  isLightTheme,
  remoteHost,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const state = remoteHost?.state || null;
  const sessionId = state?.sessionId || '';
  const hasConnectedPhone = Boolean(
    remoteHost && (remoteHost.approvedDevices.length > 0 || remoteHost.isP2pConnected)
  );

  useEffect(() => {
    if (!enabled || hasConnectedPhone || !sessionId) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    const url = buildSecureCoPilotUrl(sessionId);
    QRCode.toDataURL(url, {
      width: 190,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((data) => {
        if (!cancelled) setQrDataUrl(data);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, hasConnectedPhone, sessionId]);

  if (!enabled || isFullscreen || !remoteHost) return null;

  // Đã kết nối điện thoại -> ẩn sạch thẻ QR, chỉ để huy hiệu siêu gọn xác nhận kết nối!
  if (hasConnectedPhone) {
    return (
      <div
        className={`fixed bottom-2 left-2.5 z-30 pointer-events-none px-2.5 py-1 rounded-full border backdrop-blur-xl shadow-lg flex items-center gap-1.5 text-[11px] font-black ${
          remoteHost.isP2pConnected
            ? isLightTheme
              ? 'bg-emerald-600/95 border-emerald-400 text-white'
              : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
            : isLightTheme
            ? 'bg-sky-600/95 border-sky-400 text-white'
            : 'bg-sky-500/20 border-sky-400/50 text-sky-200'
        }`}
      >
        {remoteHost.isP2pConnected ? (
          <Wifi className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{remoteHost.isP2pConnected ? 'P2P Remote 0ms' : 'Remote Điện thoại'}</span>
      </div>
    );
  }

  // Chưa có điện thoại kết nối -> hiện thẻ QR + PIN 4 số sắc nét để quét 0-chạm!
  return (
    <div
      className={`fixed bottom-3 left-3 z-[95] w-[min(92vw,23.5rem)] rounded-3xl border-2 backdrop-blur-2xl shadow-2xl p-3.5 flex items-center gap-3.5 animate-ios-sheet-in ${
        isLightTheme
          ? 'bg-white/96 border-sky-500 text-slate-950'
          : 'bg-slate-950/95 border-sky-400/70 text-white'
      }`}
    >
      <div className="w-32 h-32 rounded-2xl bg-white p-1.5 shadow-lg border border-slate-200 flex items-center justify-center shrink-0">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR điều khiển màn không cảm ứng" className="w-full h-full object-contain" />
        ) : (
          <Loader2 className="w-7 h-7 text-sky-500 animate-spin" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-xs font-black uppercase tracking-wide truncate">
            Màn Không Cảm Ứng
          </p>
        </div>
        <p
          className={`text-[11px] font-semibold leading-snug ${
            isLightTheme ? 'text-slate-600' : 'text-slate-300'
          }`}
        >
          Quét QR trên điện thoại &amp; nhập mã PIN bên dưới để điều khiển 100% màn hình xe:
        </p>

        {state?.pin ? (
          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${
              isLightTheme
                ? 'bg-amber-100 border-amber-400 text-amber-950'
                : 'bg-amber-500/20 border-amber-400/60 text-amber-200'
            }`}
          >
            <span className="text-[11px] font-black flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5" />
              PIN:
            </span>
            <span className="text-xl font-mono font-black tracking-[0.28em]">{state.pin}</span>
          </div>
        ) : (
          <div className="text-xs font-bold text-sky-500">
            {remoteHost.sessionError || 'Đang tạo mã PIN bảo mật...'}
          </div>
        )}
      </div>
    </div>
  );
};
