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

export type PlaybackType = 'direct' | 'hls' | 'embed' | 'unplayable';

export interface VideoStreamItem {
  url: string;
  quality: string;
  resolution: string;
  mimeType: string;
  fps?: number;
  needsAudioSync?: boolean;
}

export interface AudioStreamItem {
  url: string;
  quality: string;
  mimeType: string;
  bitrate?: number;
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
  hlsUrl?: string | null;
  embedUrl?: string | null;
  videoStreams: VideoStreamItem[];
  audioStreams: AudioStreamItem[];
  relatedStreams?: VideoItem[];
  sponsorSegments?: Array<{
    category: string;
    start: number;
    end: number;
  }>;
}

export type PlayerMode = 'video' | 'audio';
export type UiScale = 'normal' | 'large' | 'xlarge';
