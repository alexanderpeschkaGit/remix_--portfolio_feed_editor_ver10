import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2KeyToLocalPath } from './mediaDeletion.ts';
import { buildRedundancyReport, listLocalMediaFiles, hashLocalFile, hashR2Body, groupCandidatesBySize, loadHashCache, saveHashCache, type HashedEntry, type RedundancyReport, type CandidateItem } from './redundancyScan.ts';
import { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, R2_STORAGE_KEYS, SYNC_MANIFEST_KEY, V2_PREFIX, getContentTypeForPath, isR2Configured, s3Client } from './serverContext.ts';
import { extractPortfolioDataFromHtml, liftLegacyDataV2UrlsInState, loadState } from './stateManager.ts';
export { liftLegacyDataV2UrlsInState };
import { toPosix } from './variantMaterializer.ts';

  export const visitMediaReferences = (referencedKeys: Set<string>, media: any) => {
    if (!media || typeof media !== 'object') return;
    for (const field of MEDIA_REFERENCE_FIELDS) {
      const key = normalizePossibleR2Key(media[field]);
      if (key) {
        referencedKeys.add(key);
      }
    }
  };

  export const collectReferencedR2KeysFromPortfolioData = (referencedKeys: Set<string>, data: any) => {
    for (const item of data?.items || data?.posts || []) {
      visitMediaReferences(referencedKeys, item);
      if (Array.isArray(item.mergedMedia)) {
        for (const media of item.mergedMedia) {
          visitMediaReferences(referencedKeys, media);
        }
      }
      // Media can also live one level deeper (custom thumbnails, metadata blocks,
      // scraped extras). Missing these produces false "orphaned" reports.
      for (const nestedKey of NESTED_MEDIA_CONTAINER_KEYS) {
        const nested = item?.[nestedKey];
        if (Array.isArray(nested)) {
          for (const media of nested) visitMediaReferences(referencedKeys, media);
        } else if (nested && typeof nested === 'object') {
          for (const media of Object.values(nested)) visitMediaReferences(referencedKeys, media);
        }
      }
    }
  };

  export const collectReferencedR2KeysFromHtml = (referencedKeys: Set<string>, html: string) => {
    try {
      const portfolioData = extractPortfolioDataFromHtml(html);
      collectReferencedR2KeysFromPortfolioData(referencedKeys, portfolioData);
    } catch (error) {
      console.error('Failed to extract portfolio data from HTML while collecting R2 references:', error);
    }
  };


  // Every field that can hold a media reference. MUST stay in sync with
  // MEDIA_DELETE_REFERENCE_FIELDS (src/server/mediaDeletion.ts) and IMAGE_FIELDS
  // (src/server/mediaValidation.ts) — a field missing here makes the orphan
  // detector trash files that are still in active use.
  export const MEDIA_REFERENCE_FIELDS = [
    'image',
    'image_thumb',
    'image_thumb400',
    'image_1k',
    'image_2k',
    'image_large',
    'image_3k',
    'image_original',
    'image_preview',
    'imageLarge',
    'largeUrl',
    'local_highres',
    'video',
    'video_large',
    'url',
    'link',
    'poster',
    'thumbnail',
    'thumb',
    'preview',
    'thumbnailUrl',
    'bunnyThumbUrl',
    'customThumbnail',
    'customThumbUrl',
  ] as const;

  // Item-level containers that may hold media objects one level below the post.
  // Any value found here is passed through the same managed-prefix filter as the
  // top-level fields, so non-media content is harmless.
  export const NESTED_MEDIA_CONTAINER_KEYS = [
    'metadata',
    'customFields',
    'customMedia',
    'extraMedia',
    'media',
    'gallery',
  ] as const;

  export const isVideoR2Key = (key: string) => /\.(mp4|webm|mov)$/i.test(key);
  export const isImageR2Key = (key: string) => /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(key);

  // Variant/derivation suffixes that may be STACKED on a media basename, e.g.
  //   X_thumb400.jpg, X_2k_thumb.jpg, X_preview_poster.jpg
  // The old implementation stripped only ONE trailing suffix, so `X_thumb400.jpg`
  // never matched the video stem `X` and got trashed as an orphan.
  // `thumb\d+` matters: the variant pipeline emits `*_thumb400.jpg`, and a plain
  // `thumb` token does not match the digits that follow it.
  export const MEDIA_STEM_SUFFIX = '(?:thumb\\d*|thumbnail|poster|preview|small|medium|large|orig|original|1k|2k|3k|4k|highres|full|edit|copy)';

  /**
   * Canonical stem of a media key: basename without extension and without any
   * trailing variant suffixes (removed repeatedly, so stacked suffixes collapse).
   * Used to keep video/poster siblings safe during cleanup.
   */
  export const toCanonicalMediaStem = (key: string) => {
    const basename = (key.split('/').pop() || key).toLowerCase().split('?')[0];
    let stem = basename.replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff|mp4|webm|mov|mkv|avi)$/i, '');
    let previous: string;
    do {
      previous = stem;
      stem = stem.replace(new RegExp(`[_-]${MEDIA_STEM_SUFFIX}$`, 'i'), '');
    } while (stem !== previous);
    return stem;
  };



export const loadSyncManifest = async () => {
    try {
      const result = await s3Client.send(new GetObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: SYNC_MANIFEST_KEY
      }));
      const body = await result.Body!.transformToString();
      return JSON.parse(body);
    } catch {
      return {};
    }
  };

  export const saveSyncManifest = async (manifest: Record<string, any>) => {
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: SYNC_MANIFEST_KEY,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: 'application/json'
      }));
    } catch (e) {
      console.error('Failed to save sync manifest:', e);
    }
  };

  export const updateSyncManifestEntries = async (entries: Array<{ r2Key: string; hash: string; size: number }>):
    Promise<void> => {
      if (entries.length === 0) return;
      const manifest = await loadSyncManifest();
      const syncedAt = new Date().toISOString();
      for (const entry of entries) {
        manifest[entry.r2Key] = {
          hash: entry.hash,
          size: entry.size,
          syncedAt
        };
      }
      await saveSyncManifest(manifest);
    };
  export const normalizePossibleR2Key = (value?: string) => {
    if (!value) return null;

    const fromPath = (pathname: string) => {
      let normalized = pathname.replace(/^\/+/, '');
      try {
        normalized = decodeURIComponent(normalized);
      } catch (e) {
        // Fallback to original if decoding fails
      }
      if (!normalized) return null;
      if (normalized.startsWith('data_v2/')) {
        return `${V2_PREFIX}/${toPosix(normalized.replace(/^data_v2\//, ''))}`;
      }
      if (
        normalized.startsWith('data/') ||
        normalized.startsWith('v2/data/') ||
        normalized.startsWith('uploads/') ||
        normalized.startsWith('highres/') ||
        normalized.startsWith('originals/')
      ) {
        return normalized;
      }
      return null;
    };

    if (value.startsWith('/')) {
      return fromPath(value);
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        return fromPath(parsed.pathname);
      } catch {
        return null;
      }
    }

    return fromPath(value);
  };

  export const localUrlToSyncTarget = (url?: string) => {
    if (!url) return null;
    let cleanUrl = url.split('?')[0];

    if (/^https?:\/\//i.test(cleanUrl)) {
      try {
        const parsed = new URL(cleanUrl);
        cleanUrl = parsed.pathname;
      } catch {
        return null;
      }
    }

    try {
      cleanUrl = decodeURIComponent(cleanUrl);
    } catch (e) {}

    const normalized = cleanUrl.replace(/^\/+/, '');
    if (normalized.startsWith('v2/data/')) {
      const relPath = normalized.slice('v2/data/'.length);
      return {
        localPath: path.join(DATA_V2_DIR, relPath),
        r2Key: `${V2_PREFIX}/${toPosix(relPath)}`
      };
    }
    if (normalized.startsWith('data_v2/')) {
      const relPath = normalized.slice('data_v2/'.length);
      return {
        localPath: path.join(DATA_V2_DIR, relPath),
        r2Key: `${V2_PREFIX}/${toPosix(relPath)}`
      };
    }
    if (normalized.startsWith('data/')) {
      return {
        localPath: path.join(DATA_DIR, normalized.slice('data/'.length)),
        r2Key: `data/${toPosix(normalized.slice('data/'.length))}`
      };
    }
    if (normalized.startsWith('originals/')) {
      return {
        localPath: path.join(ORIGINALS_DIR, normalized.slice('originals/'.length)),
        r2Key: `originals/${toPosix(normalized.slice('originals/'.length))}`
      };
    }
    return null;
  };

  export const collectReferencedSyncTargets = async () => {
    try {
      const stateData = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
      const state = JSON.parse(stateData);
      const candidates = new Map<string, { localPath: string; r2Key: string }>();
      const seen = new Set<string>();

      const visitMedia = (media: any) => {
        if (!media || typeof media !== 'object') return;
        for (const field of MEDIA_REFERENCE_FIELDS) {
          const target = localUrlToSyncTarget(media[field]);
          if (target && !seen.has(target.r2Key)) {
            seen.add(target.r2Key);
            candidates.set(target.r2Key, target);
          }
        }
      };

      for (const item of state.items || []) {
        visitMedia(item);
        if (Array.isArray(item.mergedMedia)) {
          for (const media of item.mergedMedia) {
            visitMedia(media);
          }
        }
      }

      const resolvedTargets = await Promise.all(
        Array.from(candidates.values()).map(async (target) => {
          try {
            const stats = await fs.stat(target.localPath);
            if (!stats.isFile()) return null;
            return target;
          } catch {
            return null;
          }
        })
      );

      return resolvedTargets.filter(Boolean) as Array<{ localPath: string; r2Key: string }>;
    } catch {
      return [];
    }
  };

  /**
   * Build the "keep set" of R2 keys that must never be trashed.
   *
   * CRITICAL: an incomplete keep set makes the orphan detector report files that
   * ARE referenced as orphans, and execute then trashes them. Any failure to read
   * a reference source therefore sets `refsComplete: false` so the cleanup routes
   * can refuse to produce a report at all.
   */
  export const collectReferencedR2Keys = async () => {
    const referencedKeys = new Set<string>();
    const warnings: string[] = [];
    let refsComplete = true;
    const publicBaseUrl = (R2_CONFIG.publicUrl || R2_CONFIG.publicDomain || '').replace(/\/+$/, '');

    referencedKeys.add('state.json');
    referencedKeys.add(R2_STORAGE_KEYS.SYNC_MANIFEST);

    try {
      const stateObj = await loadState();
      collectReferencedR2KeysFromPortfolioData(referencedKeys, stateObj);
    } catch (e) {
      refsComplete = false;
      warnings.push('State konnte nicht geladen werden.');
      console.error('Failed to collect referenced R2 keys from state:', e);
    }

    try {
      const previewPath = path.join(DATA_DIR, 'preview.html');
      const previewHtml = await fs.readFile(previewPath, 'utf-8');
      collectReferencedR2KeysFromHtml(referencedKeys, previewHtml);
    } catch {
      // local preview may not exist yet
    }

    try {
      const r2StateRes = await fetch(`${publicBaseUrl}/state.json?t=${Date.now()}`);
      if (r2StateRes.ok) {
        const r2State = await r2StateRes.json();
        collectReferencedR2KeysFromPortfolioData(referencedKeys, r2State);
      } else {
        refsComplete = false;
        warnings.push(`Veroeffentlichter state.json nicht erreichbar (HTTP ${r2StateRes.status}).`);
      }
    } catch (error) {
      refsComplete = false;
      warnings.push('Veroeffentlichter state.json konnte nicht abgerufen werden.');
      console.error('Failed to fetch published R2 state.json while collecting references:', error);
    }

    try {
      const indexRes = await fetch(`${publicBaseUrl}/index.html?t=${Date.now()}`);
      if (indexRes.ok) {
        const indexHtml = await indexRes.text();
        collectReferencedR2KeysFromHtml(referencedKeys, indexHtml);
      }
    } catch (error) {
      console.error('Failed to fetch published index.html while collecting references:', error);
    }

    // Protect all v2/data variants for every referenced key
    const currentKeys = Array.from(referencedKeys);
    for (const key of currentKeys) {
      const v2Match = key.match(/^v2\/data\/([^\/]+)\/([^\/]+)\/(.+?)(?:_(?:thumb|1k|2k|3k|original))?\.([^.]+)$/);
      if (v2Match) {
        const [, grp, , stem, ext] = v2Match;
        for (const v of ['thumbs400', '1k', '2k', '3k']) {
          const sfx = v === 'thumbs400' ? 'thumb' : v;
          referencedKeys.add(`v2/data/${grp}/${v}/${stem}_${sfx}.jpg`);
        }
        referencedKeys.add(`v2/data/${grp}/originals/${stem}_original.${ext}`);
      }
    }

    return { referencedKeys, warnings, refsComplete };
  };

  export const listR2ObjectsForPrefixes = async (prefixes: string[]) => {
    const objects: Array<{ key: string; size: number; eTag: string }> = [];

    for (const prefix of prefixes) {
      let continuationToken: string | undefined = undefined;
      let isTruncated = true;

      while (isTruncated) {
        const response = await s3Client.send(new ListObjectsV2Command({
          Bucket: R2_CONFIG.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }));

        for (const obj of response.Contents || []) {
          if (!obj.Key) continue;
          objects.push({
            key: obj.Key,
            size: obj.Size || 0,
            eTag: (obj.ETag || '').replace(/"/g, '')
          });
        }

        isTruncated = !!response.IsTruncated;
        continuationToken = response.NextContinuationToken;
      }
    }

    return objects;
  };

  export const buildR2CleanupReport = async () => {
    const managedPrefixes = ['data/', 'uploads/', 'highres/', 'originals/', 'v2/data/'];
    const { referencedKeys, warnings, refsComplete } = await collectReferencedR2Keys();
    const r2Objects = await listR2ObjectsForPrefixes(managedPrefixes);
    const allVideoStems = new Set(
      r2Objects
        .filter((obj) => isVideoR2Key(obj.key))
        .map((obj) => toCanonicalMediaStem(obj.key))
    );

    const orphaned = r2Objects.filter((obj) => {
      if (
        obj.key === 'state.json' ||
        obj.key === R2_STORAGE_KEYS.SYNC_MANIFEST ||
        obj.key.startsWith(R2_STORAGE_KEYS.BACKUP_PREFIX) ||
        obj.key.startsWith(R2_STORAGE_KEYS.TRASH_PREFIX) ||
        obj.key.startsWith('bak/') ||
        obj.key.startsWith('trash/')
      ) {
        return false;
      }
      if (referencedKeys.has(obj.key)) return false;

      if (isImageR2Key(obj.key) && allVideoStems.has(toCanonicalMediaStem(obj.key))) {
        return false;
      }

      return true;
    });
    const totalBytes = orphaned.reduce((sum, obj) => sum + obj.size, 0);

    return {
      scannedCount: r2Objects.length,
      orphanedCount: orphaned.length,
      totalBytes,
      orphaned,
      warnings,
      refsComplete,
      sampleKeys: orphaned.slice(0, 25).map(obj => obj.key)
    };
  };

  export const buildLegacyUploadDuplicateReport = async () => {
    const uploadObjects = await listR2ObjectsForPrefixes(['uploads/']);
    const allDataObjects = await listR2ObjectsForPrefixes(['data/uploads/']);
    const dataKeys = new Set(allDataObjects.map(obj => obj.key));

    const videoStems = new Set([
      ...Array.from(dataKeys).filter(isVideoR2Key).map(toCanonicalMediaStem),
      ...uploadObjects.map(obj => obj.key).filter(isVideoR2Key).map(toCanonicalMediaStem)
    ]);

    const duplicates = uploadObjects.filter(obj => {
      if (!dataKeys.has(`data/${obj.key}`)) return false;

      // Protect images that share a stem with any video in the same family
      if (isImageR2Key(obj.key) && videoStems.has(toCanonicalMediaStem(obj.key))) {
        return false;
      }

      return true;
    });

    const totalBytes = duplicates.reduce((sum, obj) => sum + obj.size, 0);

    return {
      scannedCount: uploadObjects.length,
      duplicateCount: duplicates.length,
      totalBytes,
      duplicates,
      sampleKeys: duplicates.slice(0, 25).map(obj => obj.key)
    };
  };

  export const REDUNDANCY_MANAGED_PREFIXES = ['data/', 'uploads/', 'highres/', 'originals/', 'v2/data/'];
  export const REDUNDANCY_LOCAL_ROOTS = ['data', 'data_v2', 'originals'];
  export const MEDIA_HASH_CACHE_PATH = path.join(process.cwd(), '.cache', 'media_hashes.json');

  /**
   * Scan managed R2 objects and local media files for byte-identical copies.
   *
   * Safeguard & Performance:
   * 1. Files are first grouped by size. Files with unique sizes are skipped entirely.
   * 2. Candidate files sharing a byte size are individually hashed with SHA-1.
   * 3. A persistent hash cache (.cache/media_hashes.json) keyed by ETag (R2) and
   *    mtime/size (local) prevents re-downloading/re-hashing on subsequent runs.
   */
  export const collectRedundancyData = async () => {
    const { referencedKeys, warnings, refsComplete } = await collectReferencedR2Keys();
    const hashCache = await loadHashCache(MEDIA_HASH_CACHE_PATH);
    let cacheModified = false;

    const candidates: CandidateItem[] = [];

    // --- R2 ---
    const r2Objects = await listR2ObjectsForPrefixes(REDUNDANCY_MANAGED_PREFIXES);
    for (const obj of r2Objects) {
      if (obj.size <= 0) continue;
      candidates.push({
        scope: 'r2',
        location: obj.key,
        size: obj.size,
        eTag: obj.eTag
      });
    }

    // --- Local ---
    for (const root of REDUNDANCY_LOCAL_ROOTS) {
      const files = await listLocalMediaFiles(path.join(process.cwd(), root));
      for (const abs of files) {
        const stats = await fs.stat(abs).catch(() => null);
        if (!stats || stats.size <= 0) continue;
        candidates.push({
          scope: 'local',
          location: abs,
          size: stats.size,
          mtimeMs: Math.round(stats.mtimeMs)
        });
      }
    }

    // Candidate groups sharing the exact same byte size (size >= 2 files)
    const candidateGroups = groupCandidatesBySize(candidates);

    const entries: HashedEntry[] = [];
    for (const group of candidateGroups.values()) {
      for (const item of group) {
        let hash: string | null = null;
        if (item.scope === 'r2') {
          const cached = hashCache.r2[item.location];
          if (cached && cached.size === item.size && (!item.eTag || cached.etag === item.eTag)) {
            hash = cached.hash;
          } else {
            try {
              const res = await s3Client.send(new GetObjectCommand({
                Bucket: R2_CONFIG.bucketName,
                Key: item.location
              }));
              hash = await hashR2Body(res.Body);
              if (hash) {
                hashCache.r2[item.location] = {
                  etag: item.eTag || '',
                  size: item.size,
                  hash
                };
                cacheModified = true;
              }
            } catch (e) {
              console.error(`Failed to fetch and hash R2 object ${item.location}:`, e);
              hash = null;
            }
          }
        } else {
          const cached = hashCache.local[item.location];
          if (cached && cached.size === item.size && (!item.mtimeMs || cached.mtimeMs === item.mtimeMs)) {
            hash = cached.hash;
          } else {
            hash = await hashLocalFile(item.location);
            if (hash) {
              hashCache.local[item.location] = {
                mtimeMs: item.mtimeMs || 0,
                size: item.size,
                hash
              };
              cacheModified = true;
            }
          }
        }

        if (hash) {
          entries.push({
            scope: item.scope,
            location: item.location,
            size: item.size,
            hash
          });
        }
      }
    }

    if (cacheModified) {
      await saveHashCache(MEDIA_HASH_CACHE_PATH, hashCache);
    }

    // Referenced local files, so a local copy of a referenced R2 key is protected.
    const referencedLocalPaths = new Set<string>();
    for (const key of referencedKeys) {
      const local = r2KeyToLocalPath(key, process.cwd());
      if (local) referencedLocalPaths.add(path.resolve(local));
    }

    const ctx = {
      isReferencedR2Key: (key: string) => referencedKeys.has(key),
      referencedLocalPaths,
      r2KeyToLocalPath: (key: string) => r2KeyToLocalPath(key, process.cwd()),
    };

    return {
      report: buildRedundancyReport(entries, ctx, candidates.length),
      entries,
      warnings,
      refsComplete
    };
  };

  /**
   * Drop the only surviving copy of a media family. If a redundant video's
   * sibling image (poster/thumb) is not itself redundant, keep the video.
   */
  export const filterRedundantWithSiblings = async (report: RedundancyReport) => {
    const r2Objects = await listR2ObjectsForPrefixes(REDUNDANCY_MANAGED_PREFIXES);
    const videoStems = new Set(
      r2Objects.filter((o) => isVideoR2Key(o.key)).map((o) => toCanonicalMediaStem(o.key))
    );
    const redundantLocations = new Set(report.duplicates.map((d) => d.location));

    return report.duplicates.filter((dup) => {
      // Only videos need the sibling guard.
      if (dup.scope !== 'r2' || !isVideoR2Key(dup.location)) return true;
      const stem = toCanonicalMediaStem(dup.location);
      if (!videoStems.has(stem)) return true;
      // Keep a video whose canonical stem is also present on a NON-redundant image.
      const siblingSurvives = r2Objects.some(
        (o) => isImageR2Key(o.key) && toCanonicalMediaStem(o.key) === stem && !redundantLocations.has(o.key)
      );
      return !siblingSurvives;
    });
  };

