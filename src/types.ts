export interface PortfolioItem {
  id: string;
  source: 'instagram' | 'flickr';
  title: string;
  text: string;
  media: string[];
}

export interface GeminiMessage {
  role: 'user' | 'model';
  text: string;
}
