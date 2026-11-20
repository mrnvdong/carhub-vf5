import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Lỗi hiển thị không mong muốn',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[CarHub VF5 ErrorBoundary]', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      // Giữ lại Mã Xe & Yêu thích, chỉ xóa cache tạm có thể gây lỗi render
      const keepKeys = new Set([
        'carhub_sync_code',
        'carhub_favorites',
        'carhub_playlists',
        'carhub_saved_places',
        'carhub_movie_favorites_v1',
        'carhub_custom_hazards_v1',
      ]);
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !keepKeys.has(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-[100dvh] w-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="max-w-md w-full rounded-3xl border border-white/15 bg-slate-900/90 p-6 shadow-2xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
            <AlertTriangle className="w-9 h-9" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-black tracking-tight">CarHub VF5 vừa gặp sự cố tạm thời</h1>
            <p className="text-xs text-slate-300 font-semibold leading-relaxed">
              Hệ thống đã tự bảo vệ để không treo màn hình xe. Nhạc yêu thích, Playlist và Mã Xe của bạn vẫn an toàn.
            </p>
            {this.state.errorMessage && (
              <p className="text-[11px] font-mono text-rose-300/90 bg-black/40 rounded-xl p-2 mt-2 break-words">
                {this.state.errorMessage.slice(0, 180)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="min-h-[3rem] px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Khởi động lại</span>
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="min-h-[3rem] px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-extrabold text-sm flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>Dọn cache &amp; Tải lại</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
