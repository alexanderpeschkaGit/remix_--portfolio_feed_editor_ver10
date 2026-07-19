// File: ./src/server/mediaValidation.ts
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { discoverMediaAssetFamily, extractMediaAssetFamily, firstExistingLocalMediaPath, resolveMediaAssetLocation } from './mediaAssets.ts';

export const IMAGE_FIELDS = [
  'image_thumb',
  'image_1k',
  'image_2k',
  'image_3k',
  'image_original',
  'image_large',
  'image',
] as const;

export const GENERATED_VARIANT_FIELDS = ['image_1k', 'image_2k', 'image_3k'] as const;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff']);
const MIN_VARIANT_SIDE: Record<string, number> = { image_1k: 1024, image_2k: 2048, image_3k: 3072 };

export type ValidationSeverity = 'error' | 'warning';

export interface MediaValidationIssue {
  projectId: string;
  title: string;
  mediaIndex: number;
  field: string;
  severity: ValidationSeverity;
  code: string;
  error: string;
  evidence?: Record<string, unknown>;
  proposedRepair: string;
}

export interface ResolvedImageAsset {
  buffer: Buffer;
  contentType?: string;
  source?: string;
}

export type ImageAssetResolver = (url: string) => Promise<ResolvedImageAsset>;

export interface ValidateMediaStateOptions {
  resolver?: ImageAssetResolver;
  rootDir?: string;
  allowNetwork?: boolean;
  includeTopLevelReferences?: boolean;
  reportMissingOptionalVariants?: boolean;
  aspectRatioTolerance?: number;
}

export interface MediaValidationReport {
  checkedAt: string;
  scannedProjects: number;
  scannedMedia: number;
  errorCount: number;
  warningCount: number;
  ok: boolean;
  issues: MediaValidationIssue[];
}

interface DecodedAsset {
  url: string;
  normalizedUrl: string;
  width: number;
  height: number;
  format: string;
  contentType: string;
  hash: string;
}

const cleanUrl = (value: string) => value.trim().split('#')[0];

export const normalizedMediaUrl = (value: string) => {
  const location = resolveMediaAssetLocation(cleanUrl(value));
  return (location.canonicalR2Key ? `/${location.canonicalR2Key}` : location.pathname).toLowerCase();
};

const extensionForUrl = (value: string) => path.posix.extname(normalizedMediaUrl(value)).slice(1).toLowerCase();

const isYoutube = (media: any) => {
  const value = String(media?.url || media?.link || '');
  return String(media?.type || '').toLowerCase() === 'youtube' || !!media?.youtubeId || /youtu(?:be\.com|\.be)/i.test(value);
};

const isVideo = (media: any) => {
  const type = String(media?.type || '').toLowerCase();
  if (type === 'video' || type === 'bunny' || media?.videoId) return true;
  return ['video', 'video_large', 'url'].some(field => /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(String(media?.[field] || '')));
};

export const createDefaultImageResolver = (options: Pick<ValidateMediaStateOptions, 'rootDir' | 'allowNetwork'> = {}): ImageAssetResolver => {
  const rootDir = options.rootDir || process.cwd();
  const allowNetwork = options.allowNetwork !== false;
  return async (value: string) => {
    const candidate = await firstExistingLocalMediaPath(value, rootDir);
    if (candidate) return { buffer: await fs.readFile(candidate), source: candidate };
    if (!allowNetwork || !/^https?:\/\//i.test(value)) throw new Error('Asset is not available locally');
    const response = await fetch(value, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || '',
      source: value,
    };
  };
};

const decodedFormatMatchesExtension = (format: string, extension: string) => {
  const normalizedFormat = format === 'heif' ? 'avif' : format;
  if (normalizedFormat === 'jpeg') return extension === 'jpg' || extension === 'jpeg';
  if (normalizedFormat === 'tiff') return extension === 'tif' || extension === 'tiff';
  return normalizedFormat === extension;
};

const makeIssue = (
  item: any,
  mediaIndex: number,
  field: string,
  severity: ValidationSeverity,
  code: string,
  error: string,
  proposedRepair: string,
  evidence?: Record<string, unknown>,
): MediaValidationIssue => ({
  projectId: String(item?.id || ''),
  title: String(item?.title || ''),
  mediaIndex,
  field,
  severity,
  code,
  error,
  evidence,
  proposedRepair,
});

export async function validateMediaState(state: any, options: ValidateMediaStateOptions = {}): Promise<MediaValidationReport> {
  const resolver = options.resolver || createDefaultImageResolver(options);
  const tolerance = options.aspectRatioTolerance ?? 0.03;
  const issues: MediaValidationIssue[] = [];
  const assetCache = new Map<string, Promise<DecodedAsset>>();
  const items = Array.isArray(state?.items) ? state.items : [];
  let scannedMedia = 0;

  const decode = (url: string) => {
    const key = cleanUrl(url);
    if (!assetCache.has(key)) {
      assetCache.set(key, (async () => {
        const resolved = await resolver(url);
        const metadata = await sharp(resolved.buffer, { failOn: 'error' }).metadata();
        const orientedWidth = metadata.autoOrient?.width || metadata.width;
        const orientedHeight = metadata.autoOrient?.height || metadata.height;
        if (!orientedWidth || !orientedHeight || !metadata.format) throw new Error('Image dimensions or format could not be decoded');
        return {
          url,
          normalizedUrl: normalizedMediaUrl(url),
          width: orientedWidth,
          height: orientedHeight,
          format: metadata.format,
          contentType: String(resolved.contentType || '').split(';')[0].toLowerCase(),
          hash: createHash('sha256').update(resolved.buffer).digest('hex'),
        };
      })());
    }
    return assetCache.get(key)!;
  };

  for (const item of items) {
    const hasCarousel = Array.isArray(item?.mergedMedia) && item.mergedMedia.length > 0;
    const entries = hasCarousel ? item.mergedMedia.map((media: any, index: number) => ({ media, mediaIndex: index + 1 })) : [{ media: item, mediaIndex: 1 }];
    if (hasCarousel && options.includeTopLevelReferences) entries.push({ media: item, mediaIndex: 0 });

    for (const { media, mediaIndex } of entries) {
      if (!media || isYoutube(media) || isVideo(media)) continue;
      scannedMedia++;
      const decodedByField = new Map<string, DecodedAsset>();

      if (!IMAGE_FIELDS.some(field => String(media[field] || '').trim())) {
        issues.push(makeIssue(item, mediaIndex, 'image', 'error', 'IMAGE_REFERENCE_MISSING', 'The image media item has no usable image reference.', 'Restore a verified display image or remove the empty media item.'));
      }

      for (const field of IMAGE_FIELDS) {
        const value = String(media[field] || '').trim();
        if (!value) continue;
        const extension = extensionForUrl(value);
        if (!IMAGE_EXTENSIONS.has(extension)) {
          issues.push(makeIssue(item, mediaIndex, field, 'error', 'NON_IMAGE_EXTENSION', `The field points to an unsupported image extension${extension ? ` .${extension}` : ''}.`, 'Clear the field or replace it with a verified image asset.', { url: value, extension: extension || null }));
          continue;
        }
        try {
          const asset = await decode(value);
          decodedByField.set(field, asset);
          if (asset.contentType && !asset.contentType.startsWith('image/')) {
            issues.push(makeIssue(item, mediaIndex, field, 'error', 'NON_IMAGE_MIME', `The asset has non-image MIME type ${asset.contentType}.`, 'Replace the object with a correctly served image or clear the field.', { url: value, contentType: asset.contentType }));
          }
          if (!decodedFormatMatchesExtension(asset.format, extension)) {
            issues.push(makeIssue(item, mediaIndex, field, 'error', 'FORMAT_EXTENSION_MISMATCH', `Decoded ${asset.format} data does not match .${extension}.`, 'Upload the asset under a key with the correct extension and MIME type.', { url: value, extension, decodedFormat: asset.format }));
          }
          const minimum = MIN_VARIANT_SIDE[field];
          if (minimum && Math.max(asset.width, asset.height) < minimum) {
            issues.push(makeIssue(item, mediaIndex, field, 'error', 'VARIANT_TOO_SMALL', `${field} is ${asset.width}x${asset.height}, below its ${minimum}px contract.`, 'Clear the nominal variant field; keep the asset only in an appropriate legacy or thumbnail field.', { url: value, width: asset.width, height: asset.height, minimum }));
          }
        } catch (error: any) {
          issues.push(makeIssue(item, mediaIndex, field, 'error', 'IMAGE_DECODE_FAILED', `The asset could not be loaded and decoded: ${error.message || error}.`, 'Replace the asset with a verified decodable image or clear the field.', { url: value }));
        }
      }

      const thumb = decodedByField.get('image_thumb');
      if (thumb) {
        for (const field of [...GENERATED_VARIANT_FIELDS, 'image_original'] as const) {
          const candidate = decodedByField.get(field);
          if (!candidate) continue;
          const sameUrl = candidate.normalizedUrl === thumb.normalizedUrl;
          const sameBytes = candidate.hash === thumb.hash;
          if (sameUrl || sameBytes) {
            issues.push(makeIssue(item, mediaIndex, field, 'error', 'THUMBNAIL_ALIAS', `${field} aliases the thumbnail instead of a real variant.`, 'Clear the field unless a distinct verified asset exists.', { url: candidate.url, thumbnailUrl: thumb.url, sameUrl, sameBytes }));
          }
        }
        const legacyLarge = decodedByField.get('image_large');
        if (legacyLarge && (legacyLarge.normalizedUrl === thumb.normalizedUrl || legacyLarge.hash === thumb.hash)) {
          issues.push(makeIssue(item, mediaIndex, 'image_large', 'warning', 'LEGACY_FALLBACK_ALIAS', 'image_large falls back to the thumbnail.', 'Legacy fallback may remain temporarily; do not copy it into generated variant fields.', { url: legacyLarge.url }));
        }
      }

      const nominalFields = [...GENERATED_VARIANT_FIELDS, 'image_original'] as const;
      for (let leftIndex = 0; leftIndex < nominalFields.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < nominalFields.length; rightIndex++) {
          const leftField = nominalFields[leftIndex];
          const rightField = nominalFields[rightIndex];
          const left = decodedByField.get(leftField);
          const right = decodedByField.get(rightField);
          if (!left || !right) continue;
          const sameUrl = left.normalizedUrl === right.normalizedUrl;
          const sameBytes = left.hash === right.hash;
          if (sameUrl || sameBytes) {
            if ((leftField === 'image_3k' && rightField === 'image_original') || (leftField === 'image_original' && rightField === 'image_3k')) continue;
            issues.push(makeIssue(item, mediaIndex, rightField, 'error', 'GENERATED_VARIANT_ALIAS', `${rightField} aliases ${leftField}; they are not independently available variants.`, 'Keep the URL only in the field that accurately describes the asset and clear the other field.', { url: right.url, aliasedField: leftField, aliasedUrl: left.url, sameUrl, sameBytes }));
          }
        }
      }

      const original = decodedByField.get('image_original');
      const threeK = decodedByField.get('image_3k');
      if (original && threeK) {
        const sameUrl = original.normalizedUrl === threeK.normalizedUrl;
        const sameBytes = original.hash === threeK.hash;
        if (sameUrl || sameBytes) {
          let largerOriginal: { url: string; width: number; height: number } | null = null;
          const family = extractMediaAssetFamily(String(media.image_original || media.image_3k || ''));
          if (family) {
            const siblings = await discoverMediaAssetFamily(family, options.rootDir || process.cwd());
            const sibling = siblings.image_original;
            if (sibling && normalizedMediaUrl(sibling.url) !== original.normalizedUrl) {
              try {
                const metadata = await sharp(sibling.path, { failOn: 'error' }).metadata();
                const width = metadata.autoOrient?.width || metadata.width || 0;
                const height = metadata.autoOrient?.height || metadata.height || 0;
                const extension = extensionForUrl(sibling.url);
                if (metadata.format && decodedFormatMatchesExtension(metadata.format, extension)
                  && Math.max(width, height) > Math.max(original.width, original.height)) {
                  largerOriginal = { url: sibling.url, width, height };
                }
              } catch {}
            }
          }
          if (largerOriginal) {
            issues.push(makeIssue(item, mediaIndex, 'image_original', 'error', 'ORIGINAL_HIDDEN_BY_3K_ALIAS', 'image_original points to the 3K rendition although a larger local original exists.', 'Restore image_original from the verified originals sibling.', {
              currentUrl: original.url, threeKUrl: threeK.url, largerOriginal,
            }));
          }
        }
      }

      const declaredWidth = Number(media.image_width || 0);
      const declaredHeight = Number(media.image_height || 0);
      const candidates = [...decodedByField.values()].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
      const best = candidates[0];
      if (best) {
        if (options.reportMissingOptionalVariants !== false && mediaIndex !== 0) {
          const sourceMaxSide = Math.max(best.width, best.height);
          for (const field of GENERATED_VARIANT_FIELDS) {
            const minimum = MIN_VARIANT_SIDE[field];
            if (sourceMaxSide >= minimum && !String(media[field] || '').trim()) {
              issues.push(makeIssue(
                item,
                mediaIndex,
                field,
                'warning',
                'OPTIONAL_VARIANT_MISSING',
                `${field} is not available although the verified ${sourceMaxSide}px source can support it.`,
                'Generate the missing variant from the verified source without upscaling.',
                { sourceMaxSide, minimum, sourceUrl: best.url },
              ));
            }
          }
        }
        for (const [field, candidate] of decodedByField) {
          const bestRatio = best.width / best.height;
          const candidateRatio = candidate.width / candidate.height;
          const ratioDelta = Math.abs(bestRatio - candidateRatio) / bestRatio;
          if (ratioDelta > tolerance) {
            issues.push(makeIssue(item, mediaIndex, field, 'error', 'VARIANT_ASPECT_RATIO_MISMATCH', `${field} has aspect ratio ${candidate.width}x${candidate.height}, inconsistent with ${best.width}x${best.height}.`, 'Replace the misassociated variant or clear its field.', { url: candidate.url, width: candidate.width, height: candidate.height, referenceUrl: best.url, referenceWidth: best.width, referenceHeight: best.height, ratioDelta }));
          }
        }
        if (!(declaredWidth > 0 && declaredHeight > 0)) {
          issues.push(makeIssue(item, mediaIndex, 'image_width/image_height', 'warning', 'DIMENSIONS_MISSING', 'Per-media dimensions are missing.', `Set dimensions to ${best.width}x${best.height} from the verified asset.`, { actualWidth: best.width, actualHeight: best.height, sourceUrl: best.url }));
        } else {
          const declaredRatio = declaredWidth / declaredHeight;
          const actualRatio = best.width / best.height;
          const ratioDelta = Math.abs(declaredRatio - actualRatio) / actualRatio;
          if (ratioDelta > tolerance) {
            issues.push(makeIssue(item, mediaIndex, 'image_width/image_height', 'error', 'ASPECT_RATIO_MISMATCH', `Declared ${declaredWidth}x${declaredHeight} does not match the verified image aspect ratio ${best.width}x${best.height}.`, `Set dimensions independently to ${best.width}x${best.height}.`, { declaredWidth, declaredHeight, actualWidth: best.width, actualHeight: best.height, ratioDelta, sourceUrl: best.url }));
          } else if (declaredWidth !== best.width || declaredHeight !== best.height) {
            issues.push(makeIssue(item, mediaIndex, 'image_width/image_height', 'error', 'DIMENSIONS_DO_NOT_MATCH_BEST_ASSET', `Declared ${declaredWidth}x${declaredHeight} differs from the best verified asset ${best.width}x${best.height}.`, `Set dimensions independently to ${best.width}x${best.height}.`, { declaredWidth, declaredHeight, actualWidth: best.width, actualHeight: best.height, sourceUrl: best.url }));
          }
        }
      }
    }
  }

  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  return {
    checkedAt: new Date().toISOString(),
    scannedProjects: items.length,
    scannedMedia,
    errorCount,
    warningCount,
    ok: errorCount === 0,
    issues,
  };
}

export function formatValidationReport(report: MediaValidationReport) {
  const lines = [
    `Media validation: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Projects: ${report.scannedProjects}; media: ${report.scannedMedia}; errors: ${report.errorCount}; warnings: ${report.warningCount}`,
  ];
  for (const issue of report.issues) {
    lines.push(`[${issue.severity.toUpperCase()}] ${issue.projectId} media ${issue.mediaIndex} ${issue.field} ${issue.code}: ${issue.error} Repair: ${issue.proposedRepair}`);
  }
  return lines.join('\n');
}
