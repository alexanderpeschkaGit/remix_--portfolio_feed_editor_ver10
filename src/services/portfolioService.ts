import { PortfolioItem } from '../types';

// The URL where your database.json and media are hosted on Cloudflare R2
const R2_URL = import.meta.env.VITE_R2_URL || '';

export const fetchPortfolioData = async (): Promise<PortfolioItem[]> => {
  if (!R2_URL) {
    console.warn('VITE_R2_URL is not set. Using mock data for development.');
    return mockData;
  }

  try {
    const response = await fetch(`${R2_URL}/database.json`);
    if (!response.ok) throw new Error('Failed to fetch portfolio data');
    const data = await response.json();
    
    // Prefix media paths with the R2_URL if they are relative
    return data.map((item: PortfolioItem) => ({
      ...item,
      media: item.media.map(m => m.startsWith('http') ? m : `${R2_URL}/${m}`)
    }));
  } catch (error) {
    console.error('Error fetching portfolio data:', error);
    return mockData;
  }
};

const mockData: PortfolioItem[] = [
  {
    id: 'mock1',
    source: 'instagram',
    title: 'Architectural Study 01',
    text: 'A deep dive into brutalist structures and their relationship with natural light.',
    media: ['https://picsum.photos/seed/arch1/1200/800']
  },
  {
    id: 'mock2',
    source: 'flickr',
    title: 'Urban Textures',
    text: 'Capturing the hidden details of the city streets.',
    media: ['https://picsum.photos/seed/urban1/800/1200']
  },
  {
    id: 'mock3',
    source: 'instagram',
    title: 'Minimalist Interiors',
    text: 'Exploring the beauty of empty spaces.',
    media: ['https://picsum.photos/seed/minimal1/1200/1200']
  }
];
