export interface VideoItem {
  id: string;
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
}

export type UiScale = 'normal' | 'large' | 'xlarge';
export type ViewMode = 'classic' | 'ytmusic';
export type RepeatMode = 'off' | 'all' | 'one';
export type NightMode = 'auto' | 'on' | 'off';
export type RailSection = 'nowPlaying' | 'cockpit' | 'browse' | 'favorites' | 'history';
export type QueueSource = 'explore' | 'mix' | 'favorites' | 'playlist' | 'history';
