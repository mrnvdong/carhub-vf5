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

export interface StreamData {
  title: string;
  uploader: string;
  uploaderAvatar?: string | null;
  thumbnailUrl: string;
  duration: number;
  views?: number;
  hlsUrl?: string | null;
  embedUrl?: string;
  source?: string;
  videoStreams: Array<{
    url: string;
    quality: string;
    resolution: string;
    mimeType: string;
    fps?: number;
  }>;
  audioStreams: Array<{
    url: string;
    quality: string;
    mimeType: string;
    bitrate?: number;
  }>;
  relatedStreams?: VideoItem[];
  sponsorSegments?: Array<{
    category: string;
    start: number;
    end: number;
  }>;
}

export type PlayerMode = 'video' | 'audio';
