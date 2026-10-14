import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from './serverContext.ts';
import { backupState, persistAcceptedState } from './stateManager.ts';

  export async function getDeletedIds(): Promise<string[]> {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'deleted_ids.json'), 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  export async function saveDeletedIds(ids: string[]) {
    await fs.writeFile(path.join(DATA_DIR, 'deleted_ids.json'), JSON.stringify(ids));
  }

  export async function mergeScrapedData(source: string) {
    await backupState();
    
    const statePath = path.join(DATA_DIR, 'state.json');
    let state: any = { items: [] };
    try {
      const data = await fs.readFile(statePath, 'utf-8');
      state = JSON.parse(data);
    } catch (e) {}

    const deletedIds = await getDeletedIds();
    
    // Helper to check if an ID exists in state
    const existsInState = (id: string) => {
      for (const item of state.items) {
        if (item.id === id) return true;
        if (item.mergedMedia) {
          for (const m of item.mergedMedia) {
            if (m.id === id) return true;
          }
        }
      }
      return false;
    };

    let newItems = [];
    if (source === 'instagram') {
      try {
        const data = await fs.readFile(path.join(DATA_DIR, 'instagram', 'insta_data.json'), 'utf-8');
        const scraped = JSON.parse(data);
        const pickBestImage = (...candidates: any[]) => candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
        for (const item of scraped) {
          const id = item.id;
          if (!existsInState(id) && !deletedIds.includes(id)) {
            const mergedMedia = Array.isArray(item.media_list)
              ? item.media_list.map((media: any) => {
                  if (typeof media === 'string') {
                    if (media.endsWith('.mp4')) {
                      return { type: 'video', video: media, video_url: media, url: media, link: item.link };
                    }
                    return { type: 'image', image: media, image_large: media, link: item.link };
                  }
                  const bestImage = pickBestImage(media.image_original, media.image_3k, media.image_2k, media.image_large, media.image_1k, media.image_thumb, media.image);
                  return {
                    type: media.type || 'image',
                    image: bestImage || media.image || media.image_thumb || '',
                    image_thumb: media.image_thumb || media.image || '',
                    image_1k: media.image_1k || '',
                    image_2k: media.image_2k || '',
                    image_large: media.image_large || media.image_2k || media.image_3k || media.image_1k || media.image_thumb || media.image || '',
                    image_3k: media.image_3k || '',
                    image_original: media.image_original || '',
                    image_width: media.image_width || 0,
                    image_height: media.image_height || 0,
                    link: media.link || item.link
                  };
                })
              : (item.image ? [{
                  type: 'image',
                  image: item.image,
                  image_thumb: item.image_thumb || item.image || '',
                  image_1k: item.image_1k || '',
                  image_2k: item.image_2k || '',
                  image_large: item.image_large || item.image_2k || item.image_3k || item.image_1k || item.image_thumb || item.image || '',
                  image_3k: item.image_3k || '',
                  image_original: item.image_original || '',
                  image_width: item.image_width || 0,
                  image_height: item.image_height || 0,
                  link: item.link
                }] : []);
            newItems.push({
              id,
              type: mergedMedia.some((media: any) => media.type === 'video') ? 'video' : 'image',
              source: 'instagram',
              title: item.title || '',
              description: item.description || '',
              image: pickBestImage(item.image_original, item.image_3k, item.image_2k, item.image_large, item.image_1k, item.image_thumb, item.image) || item.image || item.image_thumb || '',
              image_thumb: item.image_thumb || item.image || '',
              image_1k: item.image_1k || '',
              image_2k: item.image_2k || '',
              image_large: item.image_large || item.image_2k || item.image_3k || item.image_1k || item.image_thumb || item.image || '',
              image_3k: item.image_3k || '',
              image_original: item.image_original || '',
              image_width: item.image_width || 0,
              image_height: item.image_height || 0,
              mergedMedia,
              url: item.link,
              date: item.timestamp || new Date().toISOString(),
              phash: item.phash
            });
          }
        }
      } catch (e) {}
    }

    if (source === 'flickr') {
      try {
        const data = await fs.readFile(path.join(DATA_DIR, 'flickr', 'flickr_data.json'), 'utf-8');
        const scraped = JSON.parse(data);
        for (const item of scraped) {
          const id = item.id;
          if (!existsInState(id) && !deletedIds.includes(id)) {
            const fallbackThumb = item.image_thumb || item.image || (item.img_1024 ? `/data/flickr/${item.img_1024}` : '');
            const fallback3k = item.image_3k || item.image_large || (item.img_3k ? `/data/flickr/${item.img_3k}` : '');
            const mergedMedia = Array.isArray(item.media_list)
              ? item.media_list.map((media: any) => {
                  if (typeof media === 'string') {
                    return { type: 'image', image: media, image_large: fallback3k || media, link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/` };
                  }
                  return {
                    type: media.type || 'image',
                    image: media.image || media.image_thumb || fallbackThumb,
                    image_thumb: media.image_thumb || '',
                    image_1k: media.image_1k || '',
                    image_2k: media.image_2k || '',
                    image_large: media.image_large || media.image_2k || media.image_3k || media.image_1k || media.image_thumb || fallback3k || '',
                    image_3k: media.image_3k || '',
                    image_original: media.image_original || '',
                    image_width: media.image_width || 0,
                    image_height: media.image_height || 0,
                    link: media.link || item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`
                  };
                })
              : [{
                  type: 'image',
                  image: fallbackThumb,
                  image_thumb: item.image_thumb || fallbackThumb,
                  image_1k: item.image_1k || '',
                  image_2k: item.image_2k || '',
                  image_large: item.image_large || item.image_2k || item.image_3k || fallback3k || '',
                  image_3k: item.image_3k || '',
                  image_original: item.image_original || '',
                  image_width: item.image_width || 0,
                  image_height: item.image_height || 0,
                  link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`
                }];
            newItems.push({
              id,
              type: 'image',
              source: 'flickr',
              title: item.title || '',
              description: item.description || item.desc || '',
              image: fallbackThumb,
              image_thumb: item.image_thumb || fallbackThumb,
              image_1k: item.image_1k || '',
              image_2k: item.image_2k || '',
              image_large: item.image_large || item.image_2k || item.image_3k || fallback3k || '',
              image_3k: item.image_3k || '',
              image_original: item.image_original || '',
              image_width: item.image_width || 0,
              image_height: item.image_height || 0,
              mergedMedia,
              url: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`,
              date: new Date().toISOString(),
              phash: item.phash
            });
          }
        }
      } catch (e) {}
    }



    if (newItems.length > 0) {
      state.items = [...newItems, ...state.items];
      await persistAcceptedState(state, statePath);
      return newItems.length;
    }
    return 0;
  }

  // Helper for Hamming Distance
  export function hammingDistance(h1: string, h2: string) {
    if (!h1 || !h2 || h1.length !== h2.length) return 999;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
      const b1 = parseInt(h1[i], 16).toString(2).padStart(4, '0');
      const b2 = parseInt(h2[i], 16).toString(2).padStart(4, '0');
      for (let j = 0; j < 4; j++) {
        if (b1[j] !== b2[j]) dist++;
      }
    }
    return dist;
  }

