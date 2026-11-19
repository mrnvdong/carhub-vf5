import { MapTheme } from '../types';

export function isLightMapTheme(theme: MapTheme): boolean {
  return theme === 'vector3d' || theme === 'osm';
}

export interface CarThemeTokens {
  isLight: boolean;
  shell: string;
  rail: string;
  railNavIdle: string;
  railNavActive: string;
  railCockpitActive: string;
  railTvActive: string;
  railToolBtn: string;
  card: string;
  cardElevated: string;
  well: string;
  text: string;
  textSub: string;
  textMuted: string;
  textDim: string;
  divider: string;
  iconBtn: string;
  chipIdle: string;
  chipActive: string;
  segTrack: string;
  segActive: string;
  segIdle: string;
  input: string;
  primaryCta: string;
  primaryCtaIcon: string;
  itemIdle: string;
  itemActive: string;
  modalBackdrop: string;
  miniPlayer: string;
  toast: string;
  scrubber: string;
}

const LIGHT_THEME: CarThemeTokens = {
  isLight: true,
  shell: 'bg-[#e8edf5] text-slate-950',
  rail: 'bg-white/92 backdrop-blur-xl border-slate-300/90 shadow-sm',
  railNavIdle: 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/75',
  railNavActive: 'bg-slate-900 text-white border border-slate-900 shadow-sm',
  railCockpitActive: 'bg-emerald-600 text-white border border-emerald-600 shadow-sm',
  railTvActive: 'bg-blue-600 text-white border border-blue-600 shadow-sm',
  railToolBtn: 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700',
  card: 'bg-white/92 backdrop-blur-2xl border-slate-300/85 shadow-[0_10px_28px_rgba(15,23,42,0.09)]',
  cardElevated:
    'bg-white/96 backdrop-blur-2xl border-slate-300 shadow-[0_12px_32px_rgba(15,23,42,0.12)]',
  well: 'bg-slate-100/95 border-slate-300/85',
  text: 'text-slate-950',
  textSub: 'text-slate-600',
  textMuted: 'text-slate-500',
  textDim: 'text-slate-400',
  divider: 'border-slate-200',
  iconBtn:
    'bg-slate-100 hover:bg-slate-200 border-slate-300/90 text-slate-700 hover:text-slate-950',
  chipIdle: 'bg-white/90 text-slate-800 border-slate-300 hover:bg-slate-100',
  chipActive: 'bg-slate-900 text-white border-slate-900 shadow',
  segTrack: 'bg-slate-200/90 border-slate-300/90',
  segActive: 'bg-white text-slate-950 shadow-sm',
  segIdle: 'text-slate-600 hover:text-slate-950',
  input:
    'bg-white border-slate-300 text-slate-950 placeholder-slate-400 focus:border-blue-600 focus:bg-white',
  primaryCta:
    'bg-slate-950 hover:bg-slate-800 text-white shadow-[0_6px_20px_rgba(15,23,42,0.28)]',
  primaryCtaIcon: 'fill-white text-white',
  itemIdle: 'bg-white/85 hover:bg-slate-100 border-slate-200/90',
  itemActive: 'bg-blue-50 border-blue-400/85 shadow-sm',
  modalBackdrop: 'bg-slate-100/92 backdrop-blur-2xl text-slate-950',
  miniPlayer:
    'bg-white/96 hover:bg-white backdrop-blur-2xl border-slate-300 shadow-[0_10px_30px_rgba(15,23,42,0.15)]',
  toast: 'bg-slate-900/95 text-white border-slate-700',
  scrubber: 'car-scrubber car-scrubber-light',
};

const DARK_THEME: CarThemeTokens = {
  isLight: false,
  shell: 'bg-[#070a12] text-slate-100',
  rail: 'bg-[#0b1220]/85 backdrop-blur-xl border-white/12',
  railNavIdle: 'text-white/65 hover:text-white hover:bg-white/10',
  railNavActive: 'bg-white/20 text-white border border-white/25 shadow-inner',
  railCockpitActive:
    'bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 shadow-inner',
  railTvActive: 'bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-inner',
  railToolBtn: 'bg-white/10 hover:bg-white/20 border-white/15 text-white/80',
  card: 'bg-white/[0.06] backdrop-blur-2xl border-white/15 shadow-2xl',
  cardElevated: 'bg-white/[0.08] backdrop-blur-2xl border-white/15 shadow-xl',
  well: 'bg-black/40 border-white/12',
  text: 'text-white',
  textSub: 'text-white/65',
  textMuted: 'text-white/50',
  textDim: 'text-white/35',
  divider: 'border-white/10',
  iconBtn: 'bg-white/10 hover:bg-white/20 border-white/15 text-white/80 hover:text-white',
  chipIdle: 'bg-white/10 text-white/85 border-white/15 hover:bg-white/20',
  chipActive: 'bg-white text-black border-white shadow',
  segTrack: 'bg-black/45 border-white/15',
  segActive: 'bg-white text-slate-950 shadow-sm',
  segIdle: 'text-white/65 hover:text-white',
  input: 'bg-black/40 border-white/15 text-white placeholder-white/45 focus:border-sky-400',
  primaryCta:
    'bg-white hover:bg-white/90 text-black shadow-[0_6px_22px_rgba(255,255,255,0.28)]',
  primaryCtaIcon: 'fill-black text-black',
  itemIdle: 'bg-white/[0.06] hover:bg-white/[0.14] border-white/10',
  itemActive: 'bg-white/20 border-white/35 shadow-lg',
  modalBackdrop: 'bg-black/82 backdrop-blur-2xl text-white',
  miniPlayer:
    'bg-white/15 hover:bg-white/20 backdrop-blur-2xl border-white/25 shadow-2xl',
  toast: 'bg-black/88 text-white border-white/25',
  scrubber: 'car-scrubber',
};

export function getCarTheme(isLight: boolean): CarThemeTokens {
  return isLight ? LIGHT_THEME : DARK_THEME;
}
