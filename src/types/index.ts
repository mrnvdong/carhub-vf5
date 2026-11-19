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

export type UiScale = 'compact' | 'normal' | 'large' | 'xlarge';
export type ViewMode = 'classic' | 'ytmusic';
export type RepeatMode = 'off' | 'all' | 'one';
export type NightMode = 'auto' | 'on' | 'off';
export type MapTheme = 'vector3d' | 'dark3d' | 'osm' | 'satellite';
export type RailSection =
  | 'nowPlaying'
  | 'cockpit'
  | 'tv'
  | 'news'
  | 'movies'
  | 'browse'
  | 'favorites'
  | 'history';
export type QueueSource = 'explore' | 'mix' | 'favorites' | 'playlist' | 'history';
export type CockpitMediaTab = 'music' | 'video' | 'tv' | 'news';

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

export type NewsCategoryId =
  | 'hot'
  | 'audio'
  | 'tin-moi'
  | 'xa-hoi'
  | 'kinh-te'
  | 'xe-co'
  | 'the-gioi'
  | 'cong-nghe'
  | 'the-thao'
  | 'phap-luat'
  | 'giai-tri'
  | 'doi-song';

export interface NewsCategory {
  id: NewsCategoryId;
  label: string;
  icon: string;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  thumb: string;
  date: number;
  publisherName: string;
  publisherIcon: string;
  isAudioPost: boolean;
  durationText?: string;
  sectionTitle?: string;
}

export interface NewsVoice {
  id: number;
  name: string;
  streamingUrl: string;
}

export interface NewsBodyBlock {
  type: 'text' | 'image';
  text?: string;
  url?: string;
  isCaption?: boolean;
  isAuthor?: boolean;
}

export interface NewsArticleDetail {
  id: string;
  title: string;
  description: string;
  url: string;
  originalUrl?: string;
  thumb: string;
  date: number;
  categoryName?: string;
  publisherName: string;
  publisherIcon: string;
  durationText?: string;
  voices: NewsVoice[];
  blocks: NewsBodyBlock[];
  plainText: string;
}

export interface NewsFeedResponse {
  cat: string;
  query?: string;
  page: number;
  hasMore: boolean;
  total: number;
  items: NewsItem[];
  error?: string;
}

export interface NewsTtsVoiceOption {
  id: string;
  label: string;
  provider: 'azure' | 'fpt' | 'vieneu' | 'google';
}

export interface NewsTtsProviderInfo {
  provider: 'azure' | 'fpt' | 'vieneu' | 'google';
  providerLabel: string;
  isNeural: boolean;
  maxChunkLen: number;
  defaultVoice: string;
  voices: NewsTtsVoiceOption[];
}

export type MovieSource = 'kkphim' | 'vsmov' | 'nguonc' | 'cobephim' | 'k20' | 'vidsrc';

export type MovieListType =
  | 'moi-cap-nhat'
  | 'phim-thuyet-minh'
  | 'phim-long-tieng'
  | 'phim-le'
  | 'phim-bo'
  | 'phim-chieu-rap'
  | 'phim-dang-chieu'
  | 'subteam'
  | 'song-ngu'
  | 'trung-quoc'
  | 'au-my'
  | 'dien-anh'
  | 'phim-4k'
  | 'phim-xua'
  | 'the-thao'
  | 'top-imdb'
  | 'series-imdb'
  | 'hoat-hinh'
  | 'tv-shows'
  | 'phim-vietsub';

export interface MovieTaxon {
  name: string;
  slug: string;
}

export interface MovieItem {
  id: string;
  source?: MovieSource;
  name: string;
  originName: string;
  slug: string;
  type: string;
  posterUrl: string;
  thumbUrl: string;
  year: number;
  quality: string;
  lang: string;
  time: string;
  episodeCurrent: string;
  episodeTotal: string;
  chieurap: boolean;
  subDocQuyen: boolean;
  rating: number;
  categories: MovieTaxon[];
  countries: MovieTaxon[];
}

export interface MovieSubtitleTrack {
  label: string;
  lang: string;
  url: string;
}

export interface MovieEpisode {
  name: string;
  slug: string;
  filename: string;
  linkEmbed: string;
  linkM3u8: string;
}

export interface MovieServer {
  serverName: string;
  episodes: MovieEpisode[];
}

export interface MovieDetail extends MovieItem {
  content: string;
  status: string;
  trailerUrl: string;
  notify: string;
  showtimes: string;
  view: number;
  actors: string[];
  directors: string[];
  servers: MovieServer[];
}

export interface MovieListResponse {
  source?: MovieSource;
  title: string;
  keyword?: string;
  page: number;
  totalPages: number;
  totalItems: number;
  updateToday?: number;
  items: MovieItem[];
  error?: string;
}

export interface MovieMetaResponse {
  source?: MovieSource;
  genres: MovieTaxon[];
  countries: MovieTaxon[];
}

export interface MovieWatchHistoryItem {
  source?: MovieSource;
  slug: string;
  name: string;
  originName: string;
  posterUrl: string;
  thumbUrl: string;
  quality: string;
  lang: string;
  year: number;
  serverIndex: number;
  serverName: string;
  episodeSlug: string;
  episodeName: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
}
