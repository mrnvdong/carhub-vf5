export type MusicSource = 'youtube' | 'soundcloud';

export interface VideoItem {
  id: string;
  source?: MusicSource;
  title: string;
  uploaderName: string;
  thumbnail: string;
  duration?: number;
  durationText?: string;
  viewsText?: string;
  uploadedDate?: string;
}

export type PlaybackType = 'embed' | 'direct' | 'hls' | 'unplayable';

export interface SponsorSegment {
  category: string;
  start: number;
  end: number;
}

export interface StreamData {
  id: string;
  title: string;
  uploader: string;
  uploaderAvatar?: string | null;
  thumbnailUrl: string;
  duration: number;
  views?: number;
  playbackType: PlaybackType;
  source: string;
  error?: string;
  embedUrl?: string | null;
  relatedStreams?: VideoItem[];
}

export interface UserPlaylist {
  id: string;
  name: string;
  icon: string;
  items: VideoItem[];
}

export interface SavedPlace {
  id: string;
  slot?: 'home' | 'work' | 'custom';
  icon: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
}

export interface PendingNavTarget {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  sentAt: string;
}

export interface ActiveNavSummary {
  destinationName: string;
  remainingKm: number;
  remainingMin: number;
  nextInstruction: string;
  nextArrow: string;
  nextDistM: number;
  isRerouting?: boolean;
  isRouteOverview?: boolean;
  voiceNavEnabled?: boolean;
}

export interface CockpitNavControls {
  cancelRoute: () => void;
  startGuidanceFollow: () => void;
  toggleVoiceNav: () => void;
}

export type UiScale = 'normal' | 'large' | 'xlarge';
export type ViewMode = 'classic' | 'ytmusic';
export type RepeatMode = 'off' | 'all' | 'one';
export type NightMode = 'auto' | 'on' | 'off';
export type MapTheme = 'vector3d' | 'dark3d' | 'osm' | 'satellite';
export type RailSection = 'nowPlaying' | 'cockpit' | 'tv' | 'browse' | 'favorites' | 'history';
export type QueueSource = 'explore' | 'mix' | 'favorites' | 'playlist' | 'history';

export interface TvChannel {
  id: string;
  name: string;
  group: string;
  logo: string;
  tvgId: string;
  url: string;
  ua?: string;
  referer?: string;
  isRadio: boolean;
  isVod: boolean;
  isDrm?: boolean;
  manifestType?: 'hls' | 'mpd';
  clearKey?: string;
}

export interface TvGroupInfo {
  name: string;
  count: number;
}

export interface TvPlaylistData {
  sourceUrl: string;
  resolvedSourceUrl?: string;
  epgUrl: string | null;
  totalRaw: number;
  totalPlayable: number;
  totalDrmCount: number;
  groups: TvGroupInfo[];
  channels: TvChannel[];
}

export interface TvResolvedStream {
  mode: 'direct' | 'proxy';
  streamType: 'hls' | 'mpd' | 'audio';
  playUrl: string;
  directUrl: string | null;
  proxyUrl: string;
}

export interface TvPingResult {
  status: 'checking' | 'live' | 'dead';
  latencyMs?: number;
  checkedAt?: number;
  reason?: string;
}
