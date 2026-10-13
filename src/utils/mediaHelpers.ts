// Pure media helpers extracted from App.tsx (deep-refactor batch 1).
export const formatDescription = (description: any, title: string) => {
  if (!description) return "";
  
  let text = "";
  if (typeof description === 'string') {
    text = description;
  } else if (typeof description === 'object') {
    // Handle corrupted data where description is an object (possibly the whole post)
    text = description.description || description.text || JSON.stringify(description);
    if (typeof text !== 'string') text = String(text);
  } else {
    text = String(description);
  }
  
  // Remove emojis
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
  
  // Remove hashtags
  text = text.replace(/#\w+/g, '');
  
  // Remove title if it appears
  if (title && typeof text === 'string') {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escapedTitle, 'gi'), '');
  }
  
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : "";
};

export const parseDimensions = (dimensions?: string) => {
  if (!dimensions) return null;
  const match = dimensions.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height, maxSide: Math.max(width, height) };
};

export const getResolutionLabel = (m: any, dimensions?: string) => {
  if (m.type === 'youtube') return 'YouTube';
  if (m.type === 'bunny') return 'Bunny Video';

  const url = String(
    m.image_3k || m.image_2k || m.image_1k || m.image_original || m.image_large || m.imageLarge || m.largeUrl || m.image || m.image_thumb || m.image_preview || m.url || m.link || ''
  ).toLowerCase();
  const parsed = parseDimensions(dimensions);
  const maxSide = parsed?.maxSide || 0;

  if (/(_thumb|thumb|_q\.jpg|_t\.jpg|\/thumbs400\/|\/s160x160\/|\/s320x320\/|\/s640x640\/)/.test(url)) {
    return 'THUMB';
  }
  if (/(_1k\.jpg|\/1k\/|_1024|_1024x1024|_1080x1080|_1080\.)/.test(url) || (maxSide >= 1024 && maxSide < 1800)) {
    return '1K';
  }
  if (/(_2k\.jpg|\/2k\/|_2048|_2048x2048)/.test(url) || (maxSide >= 1800 && maxSide < 3000)) {
    return '2K';
  }
  if (/(-3k\.jpg|_3k\.jpg|\/3k\/|flickr_3k|_k\.jpg|_original)/.test(url) || maxSide >= 3000) {
    return '3K';
  }
  if (/(_4k\.jpg|_5k\.jpg|_6k\.jpg)/.test(url) || maxSide >= 3840) {
    return '4K';
  }
  if (/(_o\.jpg|_original|original)/.test(url)) return 'Original';
  if (m.network_name === 'Flickr' || m.image_large || m.image_original) return 'HD / Large';
  if (maxSide) return `${maxSide}px`;
  return 'Original';
};

export const isDirectMediaFile = (url?: string) =>
  !!url && /\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\?.*)?$/i.test(url);

export const isValidImageCandidate = (url?: string) => {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  return !!url.match(/\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i);
};

export const getImageSrc = (media: any, preferLarge = false) => {
  // If it's a YouTube post, we can often generate the thumb even if image field is messy
  if (media?.type === 'youtube' || media?.youtubeId) {
    const id = media.youtubeId;
    if (id) {
      const stored = preferLarge
        ? (media?.image_3k || media?.image_2k || media?.image_original || media?.image_1k || media?.image_large || media?.imageLarge || media?.image)
        : (media?.custom_thumb || media?.image_thumb || media?.image_preview || media?.image_original || media?.image);
      if (isValidImageCandidate(stored)) return stored;
      return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    }
  }

  // If it's a Bunny video, check valid image fields (excluding embed URLs) or fall back to default CDN thumbnail
  if (media?.type === 'bunny' || media?.videoId) {
    const libId = media.libraryId;
    const vidId = media.videoId;
    const storedCandidates = preferLarge
      ? [media?.custom_thumb, media?.image_3k, media?.image_2k, media?.image_original, media?.image_1k, media?.bunnyThumbUrl, media?.image_large, media?.imageLarge, media?.largeUrl, media?.image, media?.image_preview, media?.image_thumb]
      : [media?.custom_thumb, media?.image_thumb, media?.image_preview, media?.image, media?.image_original, media?.image_1k, media?.bunnyThumbUrl, media?.image_2k, media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl];
    
    for (const candidate of storedCandidates) {
      if (isValidImageCandidate(candidate) && typeof candidate === 'string' && !candidate.includes('/embed/')) {
        return candidate;
      }
    }
    if (libId && vidId) {
      return `https://iframe.mediadelivery.net/${libId}/${vidId}/thumbnail.jpg`;
    }
  }

  const primary = preferLarge
    ? [media?.image_3k, media?.image_2k, media?.image_original, media?.image_1k, media?.bunnyThumbUrl, media?.image_large, media?.imageLarge, media?.largeUrl, media?.image, media?.image_preview, media?.custom_thumb, media?.image_thumb, media?.url, media?.link]
    : [media?.custom_thumb, media?.image_thumb, media?.image_preview, media?.image, media?.image_original, media?.image_1k, media?.bunnyThumbUrl, media?.image_2k, media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl, media?.url, media?.link];
    
  for (const candidate of primary) {
    if (isValidImageCandidate(candidate)) return candidate;
  }
  
  return undefined;
};

export const getVideoSrc = (media: any, preferLarge = false) => {
  if (media?.type === 'youtube' || media?.youtubeId || media?.type === 'bunny') return undefined;

  // Optimistic local preview: a blob: URL is a just-dropped video file → play it directly.
  if (typeof media?.video === 'string' && media.video.startsWith('blob:')) return media.video;

  const primary = preferLarge
    ? [media?.video, media?.video_large, media?.image_3k, media?.image_2k, media?.image_large, media?.imageLarge, media?.largeUrl, media?.image, media?.url, media?.link]
    : [media?.video, media?.video_large, media?.image, media?.image_preview, media?.image_thumb, media?.image_1k, media?.image_large, media?.imageLarge, media?.url, media?.link];
  for (const candidate of primary) {
    if (isDirectMediaFile(candidate) && /\.(mp4|webm|mov)(\?.*)?$/i.test(candidate)) return candidate;
  }
  return isDirectMediaFile(media?.url) && /\.(mp4|webm|mov)(\?.*)?$/i.test(media.url) ? media.url : undefined;
};

export const getRenderableMediaSource = (media: any) => {
  if (!media || typeof media !== 'object') return '';
  if (media.type === 'youtube') return media.youtubeId ? `yt:${media.youtubeId}` : 'yt:new';
  if (media.type === 'bunny') return media.videoId ? `bunny:${media.libraryId || ''}:${media.videoId}` : 'bunny:new';
  return (
    getImageSrc(media, true) ||
    getImageSrc(media) ||
    getVideoSrc(media, true) ||
    getVideoSrc(media) ||
    media.image_original ||
    media.image_3k ||
    media.image_2k ||
    media.image_large ||
    media.largeUrl ||
    media.image_1k ||
    media.image_preview ||
    media.image_thumb ||
    media.image ||
    media.youtubeId ||
    media.youtubeUrl ||
    ''
  );
};

export const hasRenderableMedia = (media: any) => !!getRenderableMediaSource(media);

export const getMediaDedupeKey = (media: any) => {
  if (!media || typeof media !== 'object') return '';
  return String(getRenderableMediaSource(media));
};

export const getMediaPriorityScore = (media: any) => {
  if (!media) return -1;
  if (media.type === 'youtube' || media.youtubeId || media.type === 'bunny') return 25;
  if (isValidImageCandidate(media.image_original)) return 100;
  if (isValidImageCandidate(media.image_3k)) return 90;
  if (isValidImageCandidate(media.image_2k)) return 80;
  if (isValidImageCandidate(media.image_large) || isValidImageCandidate(media.largeUrl)) return 70;
  if (isValidImageCandidate(media.image_1k)) return 60;
  if (isValidImageCandidate(media.image)) return 50;
  if (isValidImageCandidate(media.image_preview)) return 40;
  if (isValidImageCandidate(media.bunnyThumbUrl)) return 35;
  if (isValidImageCandidate(media.image_thumb)) return 30;
  if (isValidImageCandidate(media.url) || isValidImageCandidate(media.link)) return 10;
  return 0;
};

export const getPrimaryMergedMedia = (mediaList: any[]) => {
  if (!Array.isArray(mediaList) || mediaList.length === 0) return undefined;
  let bestMedia = mediaList[0];
  let bestScore = getMediaPriorityScore(bestMedia);

  for (let i = 1; i < mediaList.length; i++) {
    const candidate = mediaList[i];
    const candidateScore = getMediaPriorityScore(candidate);
    if (candidateScore > bestScore) {
      bestMedia = candidate;
      bestScore = candidateScore;
    }
  }

  return bestMedia;
};

export const syncMediaFieldsFromPrimary = (target: any, primary: any) => {
  if (!primary) return target;

  target.type = primary.type || target.type || 'image';
  target.image = primary.image || primary.image_thumb || target.image || '';
  target.image_thumb = primary.image_thumb || primary.image || target.image_thumb || '';
  target.image_1k = primary.image_1k || '';
  target.image_2k = primary.image_2k || '';
  target.image_large = primary.image_large || primary.image_2k || primary.image_3k || primary.image_1k || primary.image || target.image_large || '';
  target.image_3k = primary.image_3k || '';
  target.image_original = primary.image_original || '';
  target.image_preview = primary.image_preview || target.image_preview;
  target.url = primary.url || primary.link || target.url || '';
  target.youtubeId = primary.youtubeId || target.youtubeId || '';
  target.youtubeUrl = primary.youtubeUrl || target.youtubeUrl || '';
  target.videoId = primary.videoId || target.videoId || '';
  target.libraryId = primary.libraryId || target.libraryId || '';
  target.image_width = primary.image_width || target.image_width || 0;
  target.image_height = primary.image_height || target.image_height || 0;

  return target;
};

// Removes all media reference fields from a post (used when the last media entry is removed).
export const clearPostMediaFields = (post: any) => {
  const fields = [
    'image', 'image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_large', 'image_original', 'image_preview',
    'imageLarge', 'largeUrl', 'local_highres', 'video', 'video_large', 'url', 'link', 'poster', 'thumbnail', 'thumb', 'preview',
    'videoId', 'libraryId', 'youtubeId', 'youtubeUrl', 'image_width', 'image_height',
  ];
  const copy = { ...post };
  for (const f of fields) delete copy[f];
  return copy;
};

export const resizeImage = (file: File, maxSide: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSide) {
            height *= maxSide / width;
            width = maxSide;
          }
        } else {
          if (height > maxSide) {
            width *= maxSide / height;
            height = maxSide;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    });
  };

  export const createGetDisplayImage = (publicDomain: string) => (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean): string | undefined => {
    if (!url) return undefined;
    const localV2Match = url.match(/^https?:\/\/[^/]+\/(?:v2\/data|data_v2)\/(.+)$/);
    if (localV2Match) return `/data_v2/${localV2Match[1]}`;
    const localDataMatch = url.match(/^https?:\/\/[^/]+\/data\/(.+)$/);
    if (localDataMatch) return `/data/${localDataMatch[1]}`;
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    // Always keep root-relative local asset paths working in the editor runtime.
    // This is important for scraped/local files served via `app.use('/data', ...)`.
    if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return url;
    
    // If we are in R2 fallback mode or if the local server is not available,
    // we should prefix local paths with the Cloudflare domain.
    if (isR2Fallback || isEmbeddedData) {
      const baseUrl = publicDomain.endsWith('/') ? publicDomain.slice(0, -1) : publicDomain;
      const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
      return `${baseUrl}/${cleanUrl}`;
    }
    
    return url;
  };

  export const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
  };

  