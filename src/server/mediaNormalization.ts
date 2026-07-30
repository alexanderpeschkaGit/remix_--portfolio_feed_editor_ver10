// File: ./src/server/mediaNormalization.ts
import fs from 'fs';
import path from 'path';

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff']);
export const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi']);

export const IMAGE_FIELDS = [
  'image_thumb',
  'image_thumb400',
  'image_1k',
  'image_2k',
  'image_3k',
  'image_original',
  'image_large',
  'image',
  'thumbnail',
] as const;

export interface NormalizeOptions {
  rootDir?: string;
  checkDiskAssets?: boolean;
}

export interface NormalizationStats {
  totalPosts: number;
  consolidatedSingleVideos: number;
  strippedVideoFromImageFields: number;
  resolvedVideoThumbnailsOnDisk: number;
  inheritedPostThumbnails: number;
  updatedPostTypes: number;
}

const cleanUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().split('#')[0].split('?')[0];
};

export const hasVideoExtension = (value: unknown): boolean => {
  const url = cleanUrl(value);
  if (!url) return false;
  const ext = path.extname(url).slice(1).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
};

export const hasImageExtension = (value: unknown): boolean => {
  const url = cleanUrl(value);
  if (!url) return false;
  const ext = path.extname(url).slice(1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
};

export const sanitizeImageField = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (hasVideoExtension(url)) return '';
  return url;
};

export const isBunnyOrYoutube = (media: any): boolean => {
  const type = String(media?.type || '').toLowerCase();
  const url = String(media?.url || media?.link || '');
  if (type === 'bunny' || type === 'youtube' || media?.youtubeId || media?.videoId) return true;
  return /youtu(?:be\.com|\.be)/i.test(url);
};

export const isVideoMedia = (media: any): boolean => {
  if (!media) return false;
  if (isBunnyOrYoutube(media)) return false; // Handled separately
  const type = String(media?.type || '').toLowerCase();
  if (type === 'video') return true;
  return ['video', 'video_url', 'url'].some(field => hasVideoExtension(media?.[field]));
};

export const extractFileStem = (filePath: string): { dir: string; stem: string; filename: string } => {
  const cleaned = cleanUrl(filePath);
  const dir = path.dirname(cleaned);
  const filename = path.basename(cleaned);
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  return { dir, stem, filename };
};

/**
 * 3-Tier Disk Search for Video Thumbnail
 * Tier 1: Same directory as video (.jpg, .jpeg, .webp, .png)
 * Tier 2: /data/uploads/thumbs400/ or /data/instagram/thumbs400/ (${stem}_thumb.jpg, ${stem}.jpg)
 */
export const resolveVideoThumbnailOnDisk = (videoPath: string, rootDir = process.cwd()): string | null => {
  if (!videoPath || !hasVideoExtension(videoPath)) return null;
  const { dir, stem } = extractFileStem(videoPath);

  // Normalize dir path for filesystem
  const relativeDir = dir.startsWith('/') ? dir.slice(1) : dir;
  const absoluteDir = path.join(rootDir, relativeDir);

  // Tier 1: Check same directory for image extensions
  for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
    const candidateFilename = `${stem}.${ext}`;
    const candidateRelative = path.posix.join(dir, candidateFilename);
    const candidateAbsolute = path.join(absoluteDir, candidateFilename);
    if (fs.existsSync(candidateAbsolute)) {
      return candidateRelative;
    }
  }

  // Tier 2: Check designated thumbs400 folders
  const thumbsFolders = ['/data/uploads/thumbs400', '/data/instagram/thumbs400', '/data/thumbs400'];
  const thumbFilenames = [`${stem}_thumb.jpg`, `${stem}.jpg`, `${stem}_thumb.webp`, `${stem}.webp`];

  for (const thumbDir of thumbsFolders) {
    const absThumbDir = path.join(rootDir, thumbDir.startsWith('/') ? thumbDir.slice(1) : thumbDir);
    for (const filename of thumbFilenames) {
      const candidateRelative = path.posix.join(thumbDir, filename);
      const candidateAbsolute = path.join(absThumbDir, filename);
      if (fs.existsSync(candidateAbsolute)) {
        return candidateRelative;
      }
    }
  }

  return null;
};

/**
 * Consolidates single Instagram video posts where mergedMedia has separate
 * type: "image" and type: "video" entries into a single self-contained type: "video" object.
 */
export const consolidateMergedMedia = (mergedMedia: any[], stats?: NormalizationStats): any[] => {
  if (!Array.isArray(mergedMedia) || mergedMedia.length === 0) return [];

  // Filter out any completely empty items
  const items = mergedMedia.filter(Boolean);
  if (items.length <= 1) return items;

  // Check if items share the same stem (e.g. 2025-02-13_18-58-14_UTC.jpg and 2025-02-13_18-58-14_UTC.mp4)
  const imageItems = items.filter(m => !isVideoMedia(m) && !isBunnyOrYoutube(m));
  const videoItems = items.filter(m => isVideoMedia(m));

  if (imageItems.length === 1 && videoItems.length === 1) {
    const imgStem = extractFileStem(imageItems[0].image || imageItems[0].image_thumb || imageItems[0].url || '').stem;
    const vidStem = extractFileStem(videoItems[0].url || videoItems[0].video || videoItems[0].video_url || '').stem;

    // Remove suffix like _1, _2 if stems match
    const baseImgStem = imgStem.replace(/_\d+$/, '');
    const baseVidStem = vidStem.replace(/_\d+$/, '');

    if (baseImgStem && baseVidStem && baseImgStem === baseVidStem) {
      // Consolidate into single self-contained video item
      const videoStream = videoItems[0].url || videoItems[0].video || videoItems[0].video_url || imageItems[0].url;
      const thumb = imageItems[0].image_thumb || imageItems[0].image_1k || imageItems[0].image;

      if (stats) stats.consolidatedSingleVideos++;

      return [{
        type: 'video',
        url: videoStream,
        video_url: videoStream,
        video: videoStream,
        image_thumb: thumb,
        image_1k: thumb,
        image: thumb,
        ...(imageItems[0].image_large ? { image_large: imageItems[0].image_large } : {}),
      }];
    }
  }

  return items;
};

/**
 * Normalizes a single post item and all items in its mergedMedia.
 */
export const normalizePostMedia = (post: any, options: NormalizeOptions = {}, stats?: NormalizationStats): any => {
  if (!post || typeof post !== 'object') return post;

  const rootDir = options.rootDir || process.cwd();
  const checkDisk = options.checkDiskAssets !== false;

  const normalized = { ...post };

  // 1. Clean top-level image fields on post
  for (const field of IMAGE_FIELDS) {
    if (normalized[field]) {
      const sanitized = sanitizeImageField(normalized[field]);
      if (sanitized !== normalized[field]) {
        if (stats) stats.strippedVideoFromImageFields++;
        normalized[field] = sanitized;
      }
    }
  }

  // 2. Consolidate mergedMedia if single video represented twice
  let mediaList: any[] = Array.isArray(normalized.mergedMedia) && normalized.mergedMedia.length > 0
    ? [...normalized.mergedMedia]
    : [];

  if (mediaList.length > 0) {
    mediaList = consolidateMergedMedia(mediaList, stats);
  }

  // If no mergedMedia, treat post itself as single media item
  const hasMerged = mediaList.length > 0;
  const itemsToProcess = hasMerged ? mediaList : [normalized];

  // 3. Process each item in mergedMedia
  const processedItems: any[] = [];
  let primaryResolvedImage = '';

  for (const item of itemsToProcess) {
    if (isBunnyOrYoutube(item)) {
      processedItems.push(item);
      continue;
    }

    const isVid = isVideoMedia(item);
    const newItem = { ...item };

    // Clean image fields on item
    for (const field of IMAGE_FIELDS) {
      if (newItem[field]) {
        const sanitized = sanitizeImageField(newItem[field]);
        if (sanitized !== newItem[field]) {
          if (stats) stats.strippedVideoFromImageFields++;
          newItem[field] = sanitized;
        }
      }
    }

    if (isVid) {
      newItem.type = 'video';
      const videoStream = newItem.url || newItem.video_url || newItem.video;
      if (videoStream) {
        newItem.url = videoStream;
        newItem.video_url = videoStream;
        newItem.video = videoStream;
      }

      // Check for video thumbnail on disk if image fields empty
      let existingThumb = newItem.image_thumb || newItem.image_1k || newItem.image;
      if (!existingThumb && videoStream && checkDisk) {
        const diskThumb = resolveVideoThumbnailOnDisk(videoStream, rootDir);
        if (diskThumb) {
          existingThumb = diskThumb;
          newItem.image_thumb = diskThumb;
          newItem.image_1k = diskThumb;
          newItem.image = diskThumb;
          if (stats) stats.resolvedVideoThumbnailsOnDisk++;
        }
      }

      if (existingThumb && !primaryResolvedImage) {
        primaryResolvedImage = existingThumb;
      }
    } else {
      newItem.type = 'image';
      const img = newItem.image_thumb || newItem.image_1k || newItem.image;
      if (img && !primaryResolvedImage) {
        primaryResolvedImage = img;
      }
    }

    processedItems.push(newItem);
  }

  // 4. Second pass for video items still lacking clip thumbnail: inherit primaryResolvedImage
  for (const item of processedItems) {
    if (isVideoMedia(item) && !item.image_thumb && primaryResolvedImage) {
      item.image_thumb = primaryResolvedImage;
      item.image_1k = primaryResolvedImage;
      item.image = primaryResolvedImage;
      if (stats) stats.inheritedPostThumbnails++;
    }
  }

  // 5. Update mergedMedia on post if present
  if (hasMerged) {
    normalized.mergedMedia = processedItems;
  }

  // 6. Propagate top-level post image properties and type
  const firstItem = processedItems[0];
  if (firstItem) {
    const topThumb = firstItem.image_thumb || firstItem.image_1k || firstItem.image || primaryResolvedImage;
    if (topThumb) {
      normalized.image_thumb = topThumb;
      normalized.image_1k = topThumb;
      normalized.image = topThumb;
      if (firstItem.image_large && !hasVideoExtension(firstItem.image_large)) {
        normalized.image_large = firstItem.image_large;
      }
    }

    // Determine post type
    const newType = processedItems.length > 1
      ? 'carousel'
      : (isVideoMedia(firstItem) ? 'video' : (isBunnyOrYoutube(firstItem) ? (firstItem.type || 'video') : 'image'));

    if (normalized.type !== newType) {
      if (stats) stats.updatedPostTypes++;
      normalized.type = newType;
    }
  }

  return normalized;
};

/**
 * Normalizes an entire state object (items array).
 */
export const normalizeState = (state: any, options: NormalizeOptions = {}): { state: any; stats: NormalizationStats } => {
  const stats: NormalizationStats = {
    totalPosts: 0,
    consolidatedSingleVideos: 0,
    strippedVideoFromImageFields: 0,
    resolvedVideoThumbnailsOnDisk: 0,
    inheritedPostThumbnails: 0,
    updatedPostTypes: 0,
  };

  if (!state || typeof state !== 'object') {
    return { state, stats };
  }

  const itemsKey = Array.isArray(state.items) ? 'items' : (Array.isArray(state.posts) ? 'posts' : null);
  if (!itemsKey) {
    return { state, stats };
  }

  const rawItems: any[] = state[itemsKey] || [];
  stats.totalPosts = rawItems.length;

  const normalizedItems = rawItems.map(item => normalizePostMedia(item, options, stats));

  return {
    state: {
      ...state,
      [itemsKey]: normalizedItems,
    },
    stats,
  };
};
