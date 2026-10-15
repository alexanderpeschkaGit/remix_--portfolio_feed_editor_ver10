export interface MediaItem {
  type: 'image' | 'youtube' | 'bunny' | 'video';
  id?: string;
  image?: string;
  image_thumb?: string;
  image_1k?: string;
  image_2k?: string;
  image_3k?: string;
  image_original?: string;
  image_large?: string;
  image_width?: number;
  image_height?: number;
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
  image_width?: number;
  image_height?: number;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}

// History entries for undo/redo (extracted from App.tsx, deep-refactor batch 1)
export type PostHistoryEntry = { posts: any[]; action: string };
export type TrashHistoryEntry = { trashKeys: string[]; action: string };
export type MediaDeleteHistoryEntry = { posts: any[]; bakFiles: Array<{ from: string; to: string }>; action: string };
export type UndoHistoryEntry = PostHistoryEntry | TrashHistoryEntry | MediaDeleteHistoryEntry;

