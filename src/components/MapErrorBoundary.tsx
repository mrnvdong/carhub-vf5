import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; isLightTheme?: boolean },
  State
> {
  constructor(props: { children: React.ReactNode; isLightTheme?: boolean }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.error('Cockpit Map chunk/runtime error:', err);
  }

  render() {
    if (this.state.hasError) {
      const light = Boolean(this.props.isLightTheme);
      return (
        <div
          className={`w-full h-full min-h-[260px] rounded-2xl sm:rounded-3xl border flex flex-col items-center justify-center gap-3 p-5 text-center shadow-2xl ${
            light ? 'bg-white/95 border-slate-300' : 'bg-[#0b1220] border-white/15'
          }`}
        >
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <div>
            <h3
              className={`text-sm sm:text-base font-extrabold ${
                light ? 'text-slate-950' : 'text-white'
              }`}
            >
              Chưa tải được Bản đồ 3D (Sóng 4G chập chờn)
            </h3>
            <p className={`text-xs mt-1 ${light ? 'text-slate-600' : 'text-slate-300'}`}>
              Nhạc vẫn phát bình thường. Hãy bấm thử lại khi ra khỏi hầm hoặc có sóng mạnh hơn.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="min-h-[40px] px-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow active:scale-95 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Thử tải lại Bản đồ</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
