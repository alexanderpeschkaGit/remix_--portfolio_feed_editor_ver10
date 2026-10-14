import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { firstExistingLocalMediaPath, resolveMediaAssetLocation } from './mediaAssets.ts';
import { assertStateAcceptable } from './statePublishing.ts';
import { BUNNY_CONFIG, DATA_DIR, R2_CONFIG, V2_MEDIA_GROUPS, execAsync, s3Client } from './serverContext.ts';
import { backupState, ensureStateVideoDimensions, fetchBunnyVideoMetadata, normalizeStateBunnyMedia, persistAcceptedState } from './stateManager.ts';
import { materializeVariantSet, normalizeExt } from './variantMaterializer.ts';
import { isImageR2Key, normalizePossibleR2Key, updateSyncManifestEntries } from './r2StorageService.ts';

  export const IMAGE_VARIANT_FIELDS = ['image_thumb', 'image_1k', 'image_2k', 'image_3k'] as const;
  export const IMAGE_SOURCE_FIELDS = ['image_original', 'image_3k', 'image_2k', 'image_large', 'image_1k', 'image_thumb', 'image', 'url', 'link'] as const;
  export const VIDEO_SOURCE_FIELDS = ['video', 'video_large', 'image_original', 'url', 'link', 'image'] as const;
  export const VIDEO_THUMB_SOURCE_FIELDS = ['image_3k', 'image_2k', 'image_large', 'image_1k', 'image_thumb', 'image_preview', 'image'] as const;

  export const createMediaVariantsStatus = () => ({
    running: false,
    cancelled: false,
    done: false,
    phase: 'idle',
    progress: 0,
    total: 0,
    logs: [] as string[],
    error: null as string | null,
    audit: null as any,
    result: null as any,
  });
  export const mediaVariantsStatus = createMediaVariantsStatus();

  export const resetMediaVariantsStatus = (phase = 'idle') => {
    Object.assign(mediaVariantsStatus, createMediaVariantsStatus(), { phase });
  };

  export const logMediaVariantStatus = (message: string) => {
    mediaVariantsStatus.logs.push(message);
    console.log(`[media-variants] ${message}`);
  };

  export const sanitizeVariantBaseName = (value: string) => {
    const clean = String(value || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/(?:[_-](thumb|thumbnail|poster|preview|original|1k|2k|3k))$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean || `media-${Date.now()}`;
  };

  export const getUrlPathname = (value?: string) => {
    if (!value || typeof value !== 'string') return '';
    let clean = value.split('?')[0].trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) {
      try {
        clean = new URL(clean).pathname;
      } catch {
        return '';
      }
    }
    try {
      clean = decodeURIComponent(clean);
    } catch {}
    return clean;
  };

  export const localPathFromMediaUrl = async (value?: string) => {
    if (value) {
      const sharedPath = await firstExistingLocalMediaPath(value, process.cwd());
      if (sharedPath) return sharedPath;
    }
    const pathname = getUrlPathname(value);
    if (!pathname) return null;
    const normalized = pathname.replace(/^\/+/, '');
    const candidates: string[] = [];

    if (normalized.startsWith('v2/data/')) {
      candidates.push(path.join(process.cwd(), 'data_v2', normalized.replace(/^v2\/data\//, '')));
    } else if (normalized.startsWith('data_v2/')) {
      candidates.push(path.join(process.cwd(), normalized));
    } else if (normalized.startsWith('data/')) {
      candidates.push(path.join(process.cwd(), normalized));
    } else if (normalized.startsWith('originals/')) {
      candidates.push(path.join(process.cwd(), normalized));
    } else if (!/^https?:\/\//i.test(value || '') && !path.isAbsolute(value || '')) {
      candidates.push(path.join(process.cwd(), normalized));
    } else if (value && path.isAbsolute(value)) {
      candidates.push(value);
    }

    for (const candidate of candidates) {
      try {
        const stats = await fs.stat(candidate);
        if (stats.isFile()) return candidate;
      } catch {}
    }
    return null;
  };

  export const isImageUrlLike = (value?: string) => !!value && /\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff|mp4|webm|mov|avi|mkv|flv)$/i.test(value);
  export const isVideoUrlLike = (value?: string) => !!value && /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(value);
  export const isYoutubeMedia = (media: any) => {
    const type = String(media?.type || '').toLowerCase();
    return type === 'youtube' || !!media?.youtubeId || !!media?.youtubeUrl || String(media?.url || media?.link || '').includes('youtube.com');
  };
  export const isBunnyMedia = (media: any) => {
    const type = String(media?.type || '').toLowerCase();
    return type === 'bunny' || (!!media?.videoId && !!media?.libraryId) || String(media?.url || media?.image_original || '').includes('mediadelivery.net');
  };
  export const isVideoMedia = (media: any) => {
    if (!media || isYoutubeMedia(media)) return false;
    const type = String(media.type || '').toLowerCase();
    if (type === 'video' || isBunnyMedia(media)) return true;
    return VIDEO_SOURCE_FIELDS.some(field => isVideoUrlLike(media[field]));
  };

  export const getMediaMaxSide = (media: any) => {
    const width = Number(media?.image_width || media?.width || 0);
    const height = Number(media?.image_height || media?.height || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
    return Math.max(width, height);
  };

  export const getRequiredVariantFields = (media: any) => {
    if (isYoutubeMedia(media)) return [] as string[];
    if (!isVideoMedia(media)) return ['image_thumb'];

    const required = ['image_thumb', 'image_1k'];
    const maxSide = getMediaMaxSide(media);
    if (maxSide >= 2048) required.push('image_2k');
    if (maxSide >= 3072) required.push('image_3k');
    return required;
  };

  export const inferMediaGroup = (media: any): keyof typeof V2_MEDIA_GROUPS => {
    const values = [
      media?.image_original,
      media?.image_3k,
      media?.image_2k,
      media?.image_large,
      media?.image_1k,
      media?.image_thumb,
      media?.image,
      media?.video,
      media?.url,
      media?.link,
    ].filter(Boolean).map(String);

    for (const value of values) {
      const lower = value.toLowerCase();
      if (lower.includes('/v2/data/flickr/') || lower.includes('/data_v2/flickr/') || lower.includes('/data/flickr/')) return 'flickr';
      if (lower.includes('/v2/data/instagram/') || lower.includes('/data_v2/instagram/') || lower.includes('/data/instagram/')) return 'instagram';
      if (lower.includes('/v2/data/highres/') || lower.includes('/data_v2/highres/') || lower.includes('/data/highres/') || lower.includes('/originals/')) return 'highres';
      if (lower.includes('/v2/data/previews/') || lower.includes('/data_v2/previews/') || lower.includes('/data/previews/')) return 'previews';
    }
    return 'uploads';
  };

  export const getVariantBaseName = (item: any, media: any, mediaIndex: number) => {
    const values = [
      media?.image_thumb,
      media?.image_1k,
      media?.image_2k,
      media?.image_3k,
      media?.image_original,
      media?.video,
      media?.url,
      media?.link,
    ].filter(Boolean).map(String);

    for (const value of values) {
      const pathname = getUrlPathname(value);
      const basename = path.basename(pathname || value);
      if (basename && basename !== '.' && basename !== '/') {
        return sanitizeVariantBaseName(basename);
      }
    }

    if (isBunnyMedia(media) && media.videoId) return sanitizeVariantBaseName(`bunny-${media.videoId}`);
    return sanitizeVariantBaseName(`${item?.id || 'item'}_${mediaIndex + 1}`);
  };

  export const getPublicBaseUrl = () => {
    const base = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
    return base.replace(/\/+$/, '');
  };

  export const toPublicR2Url = (r2Key: string) => `${getPublicBaseUrl()}/${r2Key.replace(/^\/+/, '')}`;

  export const headR2KeyWithCache = async (key: string, cache: Map<string, boolean>) => {
    if (cache.has(key)) return cache.get(key) || false;
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: key }));
      cache.set(key, true);
      return true;
    } catch {
      cache.set(key, false);
      return false;
    }
  };

  export const hasLikelyGenerationSource = async (media: any) => {
    const fields = isVideoMedia(media)
      ? [...VIDEO_THUMB_SOURCE_FIELDS, ...VIDEO_SOURCE_FIELDS]
      : [...IMAGE_SOURCE_FIELDS];
    if (isBunnyMedia(media) && media.videoId) return true;

    for (const field of fields) {
      const value = media?.[field];
      if (!value || typeof value !== 'string') continue;
      if (await localPathFromMediaUrl(value)) return true;
      if (/^https?:\/\//i.test(value) && (isImageUrlLike(value) || isVideoUrlLike(value))) return true;
    }
    return false;
  };

  export const collectMediaVariantEntries = (state: any, includeTopLevelReferences = false) => {
    const entries: Array<{ item: any; media: any; itemIndex: number; mediaIndex: number; label: string; referenceOnly: boolean }> = [];
    const items = Array.isArray(state?.items) ? state.items : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (Array.isArray(item?.mergedMedia) && item.mergedMedia.length > 0) {
        item.mergedMedia.forEach((media: any, mediaIndex: number) => {
          entries.push({
            item,
            media,
            itemIndex,
            mediaIndex,
            label: `${item?.title || item?.id || `item-${itemIndex + 1}`} #${mediaIndex + 1}`,
            referenceOnly: false,
          });
        });
        if (includeTopLevelReferences) {
          entries.push({
            item,
            media: item,
            itemIndex,
            mediaIndex: -1,
            label: `${item?.title || item?.id || `item-${itemIndex + 1}`} top-level`,
            referenceOnly: true,
          });
        }
      } else {
        entries.push({
          item,
          media: item,
          itemIndex,
          mediaIndex: -1,
          label: `${item?.title || item?.id || `item-${itemIndex + 1}`}`,
          referenceOnly: false,
        });
      }
    }
    return entries;
  };

  export const auditMediaVariantsInState = async (state: any, options: { includeTopLevelReferences?: boolean } = {}) => {
    const issues: any[] = [];
    const issueKeys = new Set<string>();
    const headCache = new Map<string, boolean>();
    const entries = collectMediaVariantEntries(state, !!options.includeTopLevelReferences);
    let skippedYoutube = 0;

    const addIssue = async (
      entry: { item: any; media: any; mediaIndex: number; label: string; referenceOnly: boolean },
      field: string,
      reason: string,
      details: Partial<any> = {}
    ) => {
      const key = [
        entry.item?.id || entry.label,
        entry.mediaIndex,
        field,
        reason,
        details.r2Key || details.url || '',
      ].join('|');
      if (issueKeys.has(key)) return;
      issueKeys.add(key);
      const canGenerate = entry.referenceOnly ? false : await hasLikelyGenerationSource(entry.media);
      issues.push({
        itemId: entry.item?.id || '',
        title: entry.item?.title || '',
        mediaIndex: entry.mediaIndex,
        mediaType: entry.media?.type || (isVideoMedia(entry.media) ? 'video' : 'image'),
        field,
        reason,
        label: entry.label,
        canGenerate,
        ...details,
      });
    };

    for (const entry of entries) {
      // Check for cancellation
      if (mediaVariantsStatus.cancelled) {
        logMediaVariantStatus('Audit cancelled by user.');
        break;
      }
      mediaVariantsStatus.progress++;
      const media = entry.media;
      if (!media || isYoutubeMedia(media)) {
        if (isYoutubeMedia(media)) skippedYoutube++;
        continue;
      }

      const requiredFields = entry.referenceOnly ? [] : getRequiredVariantFields(media);
      for (const field of requiredFields) {
        const value = media[field];
        if (!value || !String(value).trim()) {
          await addIssue(entry, field, 'missing-json-field');
        }
      }

      const fieldsToCheck = new Set<string>([
        ...requiredFields,
        ...IMAGE_VARIANT_FIELDS.filter(field => !!media[field]),
      ]);

      for (const field of fieldsToCheck) {
        const value = media[field];
        if (!value || !String(value).trim()) continue;

        const r2Key = normalizePossibleR2Key(String(value));
        if (!r2Key) {
          if (/^https?:\/\//i.test(String(value)) && !String(value).includes('youtube.com')) {
            await addIssue(entry, field, 'not-r2-reference', { url: value });
          }
          continue;
        }

        if (!isImageR2Key(r2Key)) continue;
        const exists = await headR2KeyWithCache(r2Key, headCache);
        if (!exists) {
          await addIssue(entry, field, 'missing-r2-object', { url: value, r2Key });
        }
      }

      const needsGeneration = issues.some(issue =>
        issue.itemId === (entry.item?.id || '') &&
        issue.mediaIndex === entry.mediaIndex &&
        !entry.referenceOnly
      );
      if (needsGeneration && !(await hasLikelyGenerationSource(media))) {
        await addIssue(entry, 'source', 'source-unavailable', { canGenerate: false });
      }
    }

    const missingJsonCount = issues.filter(issue => issue.reason === 'missing-json-field').length;
    const missingR2Count = issues.filter(issue => issue.reason === 'missing-r2-object').length;
    const externalReferenceCount = issues.filter(issue => issue.reason === 'not-r2-reference').length;
    const sourceUnavailableCount = issues.filter(issue => issue.reason === 'source-unavailable').length;
    const generatableIssueCount = issues.filter(issue => issue.canGenerate && issue.reason !== 'source-unavailable').length;

    return {
      checkedAt: new Date().toISOString(),
      scannedMedia: entries.filter(entry => !entry.referenceOnly).length,
      checkedReferences: entries.length,
      skippedYoutube,
      issueCount: issues.length,
      missingJsonCount,
      missingR2Count,
      externalReferenceCount,
      sourceUnavailableCount,
      generatableIssueCount,
      ok: issues.length === 0,
      issues,
    };
  };

  export const fetchBufferFromUrl = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
  };

  export const readLocalOrRemoteBuffer = async (value?: string) => {
    if (!value || typeof value !== 'string') return null;
    const localPath = await localPathFromMediaUrl(value);
    if (localPath) {
      return {
        buffer: await fs.readFile(localPath),
        path: localPath,
        ext: normalizeExt(path.extname(localPath).slice(1)),
      };
    }
    if (/^https?:\/\//i.test(value)) {
      return {
        buffer: await fetchBufferFromUrl(value),
        path: '',
        ext: normalizeExt(path.extname(getUrlPathname(value)).slice(1)),
      };
    }
    return null;
  };

  export const resolveImageSource = async (media: any) => {
    for (const field of IMAGE_SOURCE_FIELDS) {
      const value = media?.[field];
      if (!value || !isImageUrlLike(String(value))) continue;
      try {
        const source = await readLocalOrRemoteBuffer(String(value));
        if (!source?.buffer?.length) continue;
        const location = resolveMediaAssetLocation(String(value), process.cwd());
        const pathname = location.pathname.toLowerCase();
        if (field === 'image_thumb' || /\/thumbs400\//.test(pathname) || /[_-]thumb\.[a-z0-9]+$/.test(pathname)) continue;
        const metadata = await sharp(source.buffer, { failOn: 'error' }).metadata();
        const width = metadata.autoOrient?.width || metadata.width || 0;
        const height = metadata.autoOrient?.height || metadata.height || 0;
        if (Math.max(width, height) <= 400) continue;
        return { ...source, sourceField: field, sourceUrl: String(value), width, height };
      } catch (error: any) {
        console.warn(`[media-variants] image source failed (${field}):`, error.message || error);
      }
    }
    return null;
  };

  export const resolveBunnyThumbnail = async (media: any) => {
    if (!isBunnyMedia(media) || !media.videoId) return null;

    const directThumbs = [media.bunnyThumbUrl, media.thumbnail, media.poster].filter(Boolean).map(String);
    for (const url of directThumbs) {
      if (!/^https?:\/\//i.test(url) || !isImageUrlLike(url)) continue;
      try {
        const buffer = await fetchBufferFromUrl(url);
        if (buffer.length) return { buffer, ext: normalizeExt(path.extname(getUrlPathname(url)).slice(1)) || 'jpg' };
      } catch (error: any) {
        console.warn(`[media-variants] Bunny direct thumbnail failed:`, error.message || error);
      }
    }

    if (!BUNNY_CONFIG.apiKey) return null;

    try {
      const libraryId = media.libraryId || BUNNY_CONFIG.libraryId;
      const metadata: any = await fetchBunnyVideoMetadata(libraryId, media.videoId);
      if (!metadata) return null;
      const thumbFilename = metadata.thumbnailFileName || 'thumbnail.jpg';

      // Try iframe.mediadelivery.net first (same domain as embeds, no pull zone needed)
      const thumbCandidates = [
        `https://iframe.mediadelivery.net/${libraryId}/${media.videoId}/thumbnail.jpg`,
      ];
      if (BUNNY_CONFIG.pullZone) {
        thumbCandidates.push(`https://${BUNNY_CONFIG.pullZone}/${media.videoId}/${thumbFilename}`);
      }

      for (const thumbUrl of thumbCandidates) {
        try {
          const buffer = await fetchBufferFromUrl(thumbUrl);
          if (buffer.length > 100) return { buffer, ext: 'jpg' };
        } catch {
          // try next candidate
        }
      }
      return null;
    } catch (error: any) {
      console.warn(`[media-variants] Bunny thumbnail lookup failed:`, error.message || error);
      return null;
    }
  };

  export const extractVideoThumbnailBuffer = async (videoSource: { buffer?: Buffer; path?: string; ext?: string }) => {
    let tmpDir: string | null = null;
    try {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-variant-video-'));
      const inputPath = videoSource.path || path.join(tmpDir, `input.${normalizeExt(videoSource.ext || 'mp4')}`);
      if (!videoSource.path && videoSource.buffer) {
        await fs.writeFile(inputPath, videoSource.buffer);
      }
      const outputPath = path.join(tmpDir, 'thumb.jpg');
      const ffInput = inputPath.replace(/\\/g, '/').replace(/"/g, '\\"');
      const ffOutput = outputPath.replace(/\\/g, '/').replace(/"/g, '\\"');

      const tryFrame = async (seconds: number) => {
        try {
          await execAsync(`ffmpeg -y -i "${ffInput}" -ss ${seconds.toFixed(2)} -frames:v 1 -q:v 2 "${ffOutput}"`, { timeout: 45000 });
          const data = await fs.readFile(outputPath).catch(() => null);
          return data && data.length > 100 ? data : null;
        } catch {
          return null;
        }
      };

      return await tryFrame(1) || await tryFrame(0.1);
    } finally {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  export const resolveVideoThumbnailSource = async (media: any) => {
    for (const field of VIDEO_THUMB_SOURCE_FIELDS) {
      const value = media?.[field];
      if (!value || !isImageUrlLike(String(value))) continue;
      try {
        const source = await readLocalOrRemoteBuffer(String(value));
        if (source?.buffer?.length) return { buffer: source.buffer, ext: source.ext || 'jpg' };
      } catch (error: any) {
        console.warn(`[media-variants] video poster source failed (${field}):`, error.message || error);
      }
    }

    // Try to find a sibling .jpg with the same base name as the video file
    // (e.g. data/instagram/vijay_sikanda/2016-11-19_01-49-06_UTC.mp4 → …_UTC.jpg)
    for (const field of VIDEO_SOURCE_FIELDS) {
      const value = media?.[field];
      if (!value || !isVideoUrlLike(String(value))) continue;
      try {
        const localPath = await localPathFromMediaUrl(String(value));
        if (localPath) {
          const dir = path.dirname(localPath);
          const baseName = path.basename(localPath, path.extname(localPath));
          for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
            const thumbPath = path.join(dir, baseName + ext);
            try {
              const stats = await fs.stat(thumbPath);
              if (stats.isFile() && stats.size > 0) {
                const buffer = await fs.readFile(thumbPath);
                logMediaVariantStatus(`Found sibling thumbnail: ${thumbPath}`);
                return { buffer, ext: normalizeExt(ext.slice(1)) || 'jpg' };
              }
            } catch {}
          }
        }
      } catch {}
    }

    const bunnyThumb = await resolveBunnyThumbnail(media);
    if (bunnyThumb?.buffer?.length) return bunnyThumb;

    for (const field of VIDEO_SOURCE_FIELDS) {
      const value = media?.[field];
      if (!value || !isVideoUrlLike(String(value))) continue;
      try {
        const source = await readLocalOrRemoteBuffer(String(value));
        if (!source?.buffer?.length && !source?.path) continue;
        const thumbBuffer = await extractVideoThumbnailBuffer(source);
        if (thumbBuffer?.length) return { buffer: thumbBuffer, ext: 'jpg' };
      } catch (error: any) {
        console.warn(`[media-variants] video source failed (${field}):`, error.message || error);
      }
    }
    return null;
  };

  export const bestLargeFromUrls = (urls: Record<string, string>) =>
    urls.image_2k || urls.image_3k || urls.image_1k || urls.image_thumb || urls.image || '';

  export const applyGeneratedVariantUrls = (media: any, generatedUrls: Record<string, string>, videoLike: boolean) => {
    const urls = { ...generatedUrls };
    const thumb = urls.image_thumb || media.image_thumb || urls.image_1k || urls.image_2k || urls.image_3k || '';
    if (thumb) media.image_thumb = thumb;
    if (urls.image_1k) media.image_1k = urls.image_1k;
    if (urls.image_2k) media.image_2k = urls.image_2k;
    if (urls.image_3k) media.image_3k = urls.image_3k;

    if (videoLike) {
      media.image = urls.image_2k || urls.image_3k || urls.image_1k || thumb || media.image || '';
      media.image_large = bestLargeFromUrls(urls) || media.image_large || media.image || '';
      return;
    }

    media.image = thumb || media.image || '';
    media.image_large = bestLargeFromUrls(urls) || media.image_large || media.image || '';
    if (urls.image_original) media.image_original = urls.image_original;
  };

  export const getPrimaryMediaScore = (media: any) => {
    if (!media) return -1;
    if (isYoutubeMedia(media) || isBunnyMedia(media)) return 25;
    if (media.image_original) return 100;
    if (media.image_3k) return 90;
    if (media.image_2k) return 80;
    if (media.image_large || media.largeUrl) return 70;
    if (media.image_1k) return 60;
    if (media.image) return 50;
    if (media.image_preview) return 40;
    if (media.image_thumb) return 30;
    if (media.url || media.link) return 10;
    return 0;
  };

  export const getPrimaryMedia = (mediaList: any[]) => {
    if (!Array.isArray(mediaList) || mediaList.length === 0) return null;
    return mediaList.reduce((best, media) => getPrimaryMediaScore(media) > getPrimaryMediaScore(best) ? media : best, mediaList[0]);
  };

  export const syncItemFromPrimaryMedia = (item: any) => {
    const primary = getPrimaryMedia(item?.mergedMedia);
    if (!primary) return;
    item.type = primary.type || item.type || 'image';
    item.image = primary.image || primary.image_thumb || item.image || '';
    item.image_thumb = primary.image_thumb || primary.image || item.image_thumb || '';
    item.image_1k = primary.image_1k || '';
    item.image_2k = primary.image_2k || '';
    item.image_large = primary.image_large || primary.image_2k || primary.image_3k || primary.image_1k || primary.image || item.image_large || '';
    item.image_3k = primary.image_3k || '';
    item.image_original = primary.image_original || '';
    item.image_preview = primary.image_preview || item.image_preview;
    item.url = primary.url || primary.link || item.url || '';
    item.youtubeId = primary.youtubeId || item.youtubeId || '';
    item.youtubeUrl = primary.youtubeUrl || item.youtubeUrl || '';
    item.videoId = primary.videoId || item.videoId || '';
    item.libraryId = primary.libraryId || item.libraryId || '';
    item.image_width = primary.image_width || item.image_width || 0;
    item.image_height = primary.image_height || item.image_height || 0;
  };

  export const generateVariantsForEntry = async (entry: { item: any; media: any; mediaIndex: number; label: string }, options: { dryRun?: boolean; uploadToCloud?: boolean } = {}) => {
    const media = entry.media;
    const videoLike = isVideoMedia(media);
    const group = inferMediaGroup(media);
    const baseName = getVariantBaseName(entry.item, media, entry.mediaIndex);

    const source = videoLike ? await resolveVideoThumbnailSource(media) : await resolveImageSource(media);
    if (!source?.buffer?.length) {
      throw new Error('No usable source found');
    }

    const variantSet = await materializeVariantSet(source.buffer, {
      group,
      baseName,
      originalBuffer: videoLike ? undefined : source.buffer,
      originalExt: source.ext || 'jpg',
      uploadToCloud: options.uploadToCloud === true,
      writeFiles: options.dryRun !== true,
    });
    if (variantSet.manifestEntries.length > 0) {
      await updateSyncManifestEntries(variantSet.manifestEntries);
    }

    const urls = Object.keys(variantSet.remoteUrls || {}).length > 0 ? variantSet.remoteUrls : variantSet.localUrls;
    applyGeneratedVariantUrls(media, urls, videoLike);

    if (!media.image_width || !media.image_height || (!videoLike && variantSet.sourceWidth && variantSet.sourceHeight)) {
      media.image_width = videoLike ? (media.image_width || variantSet.sourceWidth || 0) : variantSet.sourceWidth;
      media.image_height = videoLike ? (media.image_height || variantSet.sourceHeight || 0) : variantSet.sourceHeight;
    }

    return {
      itemId: entry.item?.id || '',
      title: entry.item?.title || '',
      mediaIndex: entry.mediaIndex,
      label: entry.label,
      group,
      baseName,
      fields: Object.keys(urls),
      missingVariants: variantSet.missingVariants,
      sourceField: (source as any).sourceField || (videoLike ? 'video-thumbnail' : 'unknown'),
      sourceUrl: (source as any).sourceUrl || '',
      localPaths: variantSet.localPaths,
      localUrls: variantSet.localUrls,
      remoteUrls: variantSet.remoteUrls,
      dryRun: options.dryRun === true,
    };
  };

  export const publishStateJsonToR2 = async (state: any) => {
    await ensureStateVideoDimensions(state);
    normalizeStateBunnyMedia(state);
    await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });
    state.lastUpdated = new Date().toISOString();
    const stateString = JSON.stringify(state, null, 2);
    await backupState();
    await persistAcceptedState(state, path.join(DATA_DIR, 'state.json'));
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: 'state.json',
      Body: Buffer.from(stateString),
      ContentType: "application/json; charset=utf-8",
    }));
    return stateString;
  };

  export const verifyPublishedMediaVariants = async () => {
    const publicStateUrl = `${getPublicBaseUrl()}/state.json?t=${Date.now()}`;
    const response = await fetch(publicStateUrl);
    if (!response.ok) {
      throw new Error(`Published state.json fetch failed: ${response.status} ${response.statusText}`);
    }
    const state = await response.json();
    return auditMediaVariantsInState(state, { includeTopLevelReferences: true });
  };

