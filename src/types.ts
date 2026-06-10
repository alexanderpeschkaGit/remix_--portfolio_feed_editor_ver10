export interface MediaItem {
  type: 'image' | 'youtube' | 'bunny' | 'video';
  id?: string;
  image?: string;
  image_thumb?: string;
  image_1k?: string;
  image_2k?: string;
  image_3k?: string;
  image_original?: string;
  url?: string;
  link?: string;
  youtubeId?: string;
  youtubeUrl?: string;
  videoId?: string;
  libraryId?: string;
  duration?: number;
  [key: string]: any;
}

export interface PortfolioItem {
  id: string;
  source: 'instagram' | 'flickr' | 'bunny';
  title: string;
  description?: string;
  text?: string;
  type?: string;
  media: string[];
  mergedMedia?: MediaItem[];
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}
