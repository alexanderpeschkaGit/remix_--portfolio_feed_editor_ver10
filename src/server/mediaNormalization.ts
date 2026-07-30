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
 * Consolidates Instagram carousel posts where mergedMedia has separate
 * type: "image" and type: "video" entries sharing the same base file stem.
 *
 * Each matching pair (image + video with same stem, e.g. 2024-07-03_10-02-15_UTC_1)
 * is merged into one self-contained type: "video" object with the image as thumbnail.
 * Handles both single-pair and multi-pair posts (N images + N videos).
 */
export const consolidateMergedMedia = (mergedMedia: any[], stats?: NormalizationStats): any[] => {
  if (!Array.isArray(mergedMedia) || mergedMedia.length === 0) return [];

  const items = mergedMedia.filter(Boolean);
  if (items.length <= 1) return items;

  const getBestUrl = (m: any): string => {
    if (isVideoMedia(m)) return m.url || m.video || m.video_url || '';
    return m.image || m.image_thumb || m.image_1k || m.url || '';
  };

  // ---- Group items by base file stem (without _N suffix) ----
  const stemGroups = new Map<string, { images: any[]; videos: any[] }>();
  const itemBaseMap = new Map<any, string>();

  for (const item of items) {
    if (isBunnyOrYoutube(item)) continue;
    const url = getBestUrl(item);
    const { stem } = extractFileStem(url);
    const baseStem = stem.replace(/_\d+$/, '');
    if (!baseStem) continue;

    itemBaseMap.set(item, baseStem);
    if (!stemGroups.has(baseStem)) {
      stemGroups.set(baseStem, { images: [], videos: [] });
    }
    const group = stemGroups.get(baseStem)!;
    if (isVideoMedia(item)) group.videos.push(item);
    else group.images.push(item);
  }

  // ---- Consolidate matching pairs, preserving original order ----
  const result: any[] = [];
  const consumed = new Set<any>();

  for (const item of items) {
    if (consumed.has(item)) continue;

    // Pass through items we can't pair
    if (isBunnyOrYoutube(item) || !itemBaseMap.has(item)) {
      result.push(item);
      continue;
    }

    const baseStem = itemBaseMap.get(item)!;
    const group = stemGroups.get(baseStem)!;

    // Find first unconsumed image+video pair for this stem
    const img = group.images.find(i => !consumed.has(i));
    const vid = group.videos.find(v => !consumed.has(v));

    if (img && vid) {
      consumed.add(img);
      consumed.add(vid);

      const videoStream = vid.url || vid.video || vid.video_url || img.url;
      const thumb = img.image_thumb || img.image_1k || img.image;

      if (stats) stats.consolidatedSingleVideos++;

      result.push({
        type: 'video',
        url: videoStream,
        video_url: videoStream,
        video: videoStream,
        image_thumb: thumb,
        image_1k: thumb,
        image: thumb,
        ...(img.image_large ? { image_large: img.image_large } : {}),
      });
    } else {
      result.push(item);
    }
  }

  // Append any items that were never iterated (consumed but not primary)
  for (const item of items) {
    if (!result.includes(item) && !consumed.has(item)) {
      result.push(item);
    }
  }

  return result;
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

      // Always attempt disk resolution for video thumbnails.
      // This ensures each clip gets its own unique thumbnail and fixes
      // previously inherited/wrong thumbnails from prior migrations.
      if (videoStream && checkDisk) {
        const diskThumb = resolveVideoThumbnailOnDisk(videoStream, rootDir);
        if (diskThumb) {
          const hadExisting = !!(newItem.image_thumb || newItem.image_1k || newItem.image);
          newItem.image_thumb = diskThumb;
          newItem.image_1k = diskThumb;
          newItem.image = diskThumb;
          if (stats && !hadExisting) stats.resolvedVideoThumbnailsOnDisk++;
        }
      }

      const existingThumb = newItem.image_thumb || newItem.image_1k || newItem.image;
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

  // 4. Second pass: video items still lacking their own thumbnail after disk search
  // get the post-level thumbnail as last-resort fallback.
  // IMPORTANT: We do NOT inherit from another clip's thumbnail (primaryResolvedImage).
  // Each clip must keep its own individually resolved thumbnail so that multi-video
  // posts show a different thumbnail per clip instead of all sharing the same one.
  const postLevelThumb = normalized.image_thumb || normalized.image_1k || normalized.image;
  for (const item of processedItems) {
    if (isVideoMedia(item) && !item.image_thumb && postLevelThumb) {
      item.image_thumb = postLevelThumb;
      item.image_1k = postLevelThumb;
      item.image = postLevelThumb;
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
