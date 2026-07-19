// File: ./scripts/migrate-portfolio-media.ts
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { createHash } from 'crypto';
import sharp from 'sharp';
import {
  createDefaultImageResolver,
  normalizedMediaUrl,
  validateMediaState,
  type ImageAssetResolver,
  type MediaValidationReport,
} from '../src/server/mediaValidation.ts';
import {
  discoverMediaAssetFamily,
  extractMediaAssetFamily,
  type InventoryImageField,
  type MediaAssetFamily,
} from '../src/server/mediaAssets.ts';

const IMAGE_FIELDS = ['image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_original', 'image_large', 'image'] as const;
const NOMINAL_FIELDS = ['image_1k', 'image_2k', 'image_3k'] as const;
const MIN_SIDE: Record<string, number> = { image_1k: 1024, image_2k: 2048, image_3k: 3072 };
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff']);

interface AssetInfo {
  field: string;
  url: string;
  normalizedUrl: string;
  buffer: Buffer;
  hash: string;
  width: number;
  height: number;
  format: string;
  contentType: string;
  extension: string;
}

export interface PortfolioRepairChange {
  projectId: string;
  title: string;
  mediaIndex: number;
  field: string;
  before: unknown;
  after: unknown;
  oldValue: unknown;
  newValue: unknown;
  sourceAsset?: string;
  dimensions?: { width: number; height: number };
  reason: string;
  confidence: 'high' | 'medium';
  automatic: true;
}

export interface PortfolioManualReview {
  projectId: string;
  title: string;
  mediaIndex: number;
  field: string;
  code: string;
  problem: string;
  evidence?: Record<string, unknown>;
}

export interface PortfolioRepairResult {
  state: any;
  changes: PortfolioRepairChange[];
  manualReview: PortfolioManualReview[];
  validationBefore: MediaValidationReport;
  validationAfter: MediaValidationReport;
}

export interface PortfolioRepairOptions {
  rootDir?: string;
  allowNetwork?: boolean;
  resolver?: ImageAssetResolver;
  visualDistanceThreshold?: number;
  recoveryState?: any;
  recoverProjectIds?: string[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const extensionFor = (value: string) => path.posix.extname(normalizedMediaUrl(value)).slice(1).toLowerCase();

const isSkippedMedia = (media: any) => {
  const type = String(media?.type || '').toLowerCase();
  if (type === 'youtube' || type === 'video' || type === 'bunny' || media?.youtubeId || media?.videoId) return true;
  return ['video', 'video_large', 'url'].some(field => /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(String(media?.[field] || '')));
};

const formatMatchesExtension = (format: string, extension: string) => {
  if (format === 'jpeg') return extension === 'jpg' || extension === 'jpeg';
  if (format === 'tiff') return extension === 'tif' || extension === 'tiff';
  if (format === 'heif') return extension === 'avif';
  return format === extension;
};

const intendedFieldFromUrl = (url: string, maxSide: number) => {
  const normalized = normalizedMediaUrl(url);
  if (/\/originals?\//.test(normalized) || /[_-]original\./.test(normalized)) return 'image_original';
  if (/\/3k\//.test(normalized) || /[_-]3k\./.test(normalized)) return 'image_3k';
  if (/\/2k\//.test(normalized) || /[_-]2k\./.test(normalized)) return 'image_2k';
  if (/\/1k\//.test(normalized) || /[_-]1k\./.test(normalized)) return 'image_1k';
  if (maxSide >= 3072) return 'image_3k';
  if (maxSide >= 2048) return 'image_2k';
  if (maxSide >= 1024) return 'image_1k';
  return '';
};

const visualFingerprint = async (buffer: Buffer) => (
  await sharp(buffer).rotate().resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer()
);

const visualDistance = async (left: Buffer, right: Buffer) => {
  const [a, b] = await Promise.all([visualFingerprint(left), visualFingerprint(right)]);
  let total = 0;
  for (let index = 0; index < a.length; index++) total += Math.abs(a[index] - b[index]);
  return total / a.length;
};

export async function repairPortfolioState(inputState: any, options: PortfolioRepairOptions = {}): Promise<PortfolioRepairResult> {
  const state = clone(inputState);
  const rootDir = options.rootDir || process.cwd();
  const resolver = options.resolver || createDefaultImageResolver({ rootDir, allowNetwork: options.allowNetwork !== false });
  const visualThreshold = options.visualDistanceThreshold ?? 25;
  const changes: PortfolioRepairChange[] = [];
  const manualReview: PortfolioManualReview[] = [];
  const assetCache = new Map<string, Promise<AssetInfo>>();

  const resolveAsset = (field: string, url: string) => {
    const cacheKey = url.trim().split('#')[0];
    if (!assetCache.has(cacheKey)) {
      assetCache.set(cacheKey, (async () => {
        const resolved = await resolver(url);
        const metadata = await sharp(resolved.buffer, { failOn: 'error' }).metadata();
        const width = metadata.autoOrient?.width || metadata.width;
        const height = metadata.autoOrient?.height || metadata.height;
        if (!width || !height || !metadata.format) throw new Error('Image metadata is incomplete');
        return {
          field,
          url,
          normalizedUrl: normalizedMediaUrl(url),
          buffer: resolved.buffer,
          hash: createHash('sha256').update(resolved.buffer).digest('hex'),
          width,
          height,
          format: metadata.format,
          contentType: String(resolved.contentType || '').split(';')[0].toLowerCase(),
          extension: extensionFor(url),
        };
      })());
    }
    return assetCache.get(cacheKey)!;
  };

  const addManual = (item: any, mediaIndex: number, field: string, code: string, problem: string, evidence?: Record<string, unknown>) => {
    const key = `${item.id}|${mediaIndex}|${field}|${code}`;
    if (manualReview.some(entry => `${entry.projectId}|${entry.mediaIndex}|${entry.field}|${entry.code}` === key)) return;
    manualReview.push({ projectId: String(item.id || ''), title: String(item.title || ''), mediaIndex, field, code, problem, evidence });
  };

  const setField = (
    item: any,
    media: any,
    mediaIndex: number,
    field: string,
    after: unknown,
    reason: string,
    details: { sourceAsset?: string; dimensions?: { width: number; height: number }; confidence?: 'high' | 'medium' } = {},
  ) => {
    const before = media[field];
    if (Object.is(before, after)) return;
    media[field] = after;
    changes.push({
      projectId: String(item.id || ''), title: String(item.title || ''), mediaIndex, field,
      before, after,
      oldValue: before === undefined ? null : before,
      newValue: after === undefined ? null : after,
      reason,
      sourceAsset: details.sourceAsset,
      dimensions: details.dimensions,
      confidence: details.confidence || 'high',
      automatic: true,
    });
  };

  const decodeDiscovered = async (field: InventoryImageField, asset: { path: string; url: string }) => {
    const buffer = await fs.readFile(asset.path);
    const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    const width = metadata.autoOrient?.width || metadata.width;
    const height = metadata.autoOrient?.height || metadata.height;
    if (!width || !height || !metadata.format) throw new Error('Image metadata is incomplete');
    const extension = extensionFor(asset.url);
    if (!formatMatchesExtension(metadata.format, extension)) throw new Error(`Decoded ${metadata.format} does not match .${extension}`);
    return {
      field,
      url: asset.url,
      normalizedUrl: normalizedMediaUrl(asset.url),
      buffer,
      hash: createHash('sha256').update(buffer).digest('hex'),
      width,
      height,
      format: metadata.format,
      contentType: '',
      extension,
      sourcePath: asset.path,
    };
  };

  const reconstructFromLocalFamily = async (item: any, media: any, mediaIndex: number) => {
    const families = new Map<string, MediaAssetFamily>();
    for (const field of IMAGE_FIELDS) {
      const family = extractMediaAssetFamily(String(media[field] || ''));
      if (family) families.set(`${family.group.toLowerCase()}|${family.baseName.toLowerCase()}`, family);
    }
    if (!families.size) return;

    let reference: AssetInfo | null = null;
    for (const field of ['image_thumb', 'image', 'image_large'] as const) {
      const value = String(media[field] || '').trim();
      if (!value) continue;
      try {
        reference = await resolveAsset(field, value);
        break;
      } catch {}
    }

    const candidates: Array<{
      family: MediaAssetFamily;
      assets: Partial<Record<InventoryImageField, Awaited<ReturnType<typeof decodeDiscovered>>>>;
      score: number;
      distance: number | null;
    }> = [];
    for (const family of families.values()) {
      const discovered = await discoverMediaAssetFamily(family, rootDir);
      const assets: Partial<Record<InventoryImageField, Awaited<ReturnType<typeof decodeDiscovered>>>> = {};
      for (const field of Object.keys(discovered) as InventoryImageField[]) {
        try {
          assets[field] = await decodeDiscovered(field, discovered[field]!);
        } catch {}
      }
      const entries = Object.values(assets).filter(Boolean) as Array<Awaited<ReturnType<typeof decodeDiscovered>>>;
      if (!entries.length) continue;
      const identity = assets.image_thumb || assets.image_1k || assets.image_2k || assets.image_3k || assets.image_original;
      let distance: number | null = null;
      if (reference && identity) distance = reference.hash === identity.hash ? 0 : await visualDistance(reference.buffer, identity.buffer);
      const score = (distance !== null && distance <= visualThreshold ? 1000 : 0)
        + (assets.image_original ? 100 : 0)
        + (assets.image_3k ? 30 : 0)
        + (assets.image_2k ? 20 : 0)
        + (assets.image_1k ? 10 : 0)
        + entries.length;
      candidates.push({ family, assets, score, distance });
    }
    candidates.sort((left, right) => right.score - left.score);
    const winner = candidates[0];
    if (!winner) return;
    if (reference && winner.distance !== null && winner.distance > visualThreshold) {
      addManual(item, mediaIndex, 'image_original', 'ASSET_FAMILY_IDENTITY_CONFLICT', 'A local sibling family exists but does not visually match the display image.', {
        family: `${winner.family.group}/${winner.family.baseName}`,
        distance: winner.distance,
        threshold: visualThreshold,
      });
      return;
    }

    for (const field of Object.keys(winner.assets) as InventoryImageField[]) {
      const asset = winner.assets[field]!;
      const current = String(media[field] || '').trim();
      const currentFamily = extractMediaAssetFamily(current);
      const sameFamily = currentFamily
        && currentFamily.group.toLowerCase() === winner.family.group.toLowerCase()
        && currentFamily.baseName.toLowerCase() === winner.family.baseName.toLowerCase();
      if (!current || !sameFamily || intendedFieldFromUrl(current, 0) !== field) {
        setField(item, media, mediaIndex, field, asset.url, `Restored ${field} from verified local asset family`, {
          sourceAsset: asset.sourcePath,
          dimensions: { width: asset.width, height: asset.height },
        });
      }
    }
    for (const field of NOMINAL_FIELDS) {
      if (!winner.assets[field] && media[field]) {
        const currentFamily = extractMediaAssetFamily(String(media[field]));
        if (currentFamily && currentFamily.group.toLowerCase() === winner.family.group.toLowerCase()
          && currentFamily.baseName.toLowerCase() === winner.family.baseName.toLowerCase()) {
          setField(item, media, mediaIndex, field, '', `${field} has no local sibling asset in the verified family`);
        }
      }
    }
    const original = winner.assets.image_original;
    const dimensionSource = original
      || winner.assets.image_3k
      || winner.assets.image_2k
      || winner.assets.image_1k
      || winner.assets.image_thumb;
    if (dimensionSource) {
      const details = { sourceAsset: dimensionSource.sourcePath, dimensions: { width: dimensionSource.width, height: dimensionSource.height } };
      setField(item, media, mediaIndex, 'image_width', dimensionSource.width, `Decoded from verified ${dimensionSource.field}`, details);
      setField(item, media, mediaIndex, 'image_height', dimensionSource.height, `Decoded from verified ${dimensionSource.field}`, details);
    }
    const display = winner.assets.image_2k || winner.assets.image_3k || winner.assets.image_1k || winner.assets.image_original || winner.assets.image_thumb;
    if (display) setField(item, media, mediaIndex, 'image_large', display.url, 'Selected verified display variant from local asset family', {
      sourceAsset: display.sourcePath,
      dimensions: { width: display.width, height: display.height },
    });
    if (winner.assets.image_thumb) setField(item, media, mediaIndex, 'image', winner.assets.image_thumb.url, 'Display image mirrors verified thumbnail', {
      sourceAsset: winner.assets.image_thumb.sourcePath,
      dimensions: { width: winner.assets.image_thumb.width, height: winner.assets.image_thumb.height },
    });
  };

  const repairMedia = async (item: any, media: any, mediaIndex: number) => {
    if (!media || isSkippedMedia(media)) return;
    await reconstructFromLocalFamily(item, media, mediaIndex);
    const validAssets = new Map<string, AssetInfo>();
    const failures = new Map<string, string>();

    await Promise.all(IMAGE_FIELDS.map(async field => {
      const url = String(media[field] || '').trim();
      if (!url) return;
      const extension = extensionFor(url);
      if (!IMAGE_EXTENSIONS.has(extension)) {
        failures.set(field, `Unsupported extension${extension ? ` .${extension}` : ''}`);
        return;
      }
      try {
        const asset = await resolveAsset(field, url);
        if (asset.contentType && !asset.contentType.startsWith('image/')) throw new Error(`Non-image MIME ${asset.contentType}`);
        if (!formatMatchesExtension(asset.format, asset.extension)) throw new Error(`Decoded ${asset.format} does not match .${asset.extension}`);
        validAssets.set(field, { ...asset, field });
      } catch (error: any) {
        failures.set(field, error.message || String(error));
      }
    }));

    for (const [field, problem] of failures) {
      const otherValid = [...validAssets.keys()].some(otherField => otherField !== field && String(media[otherField] || '').trim());
      const optionalOrFallback = [...NOMINAL_FIELDS, 'image_original', 'image_large', 'image'].includes(field as any);
      if (otherValid && optionalOrFallback) {
        setField(item, media, mediaIndex, field, '', `Cleared invalid redundant image field: ${problem}`);
      } else {
        addManual(item, mediaIndex, field, 'INVALID_OR_UNDECODABLE_ONLY_SOURCE', problem, { url: media[field] });
      }
    }

    for (const field of NOMINAL_FIELDS) {
      const asset = validAssets.get(field);
      if (!asset || !media[field]) continue;
      const minimum = MIN_SIDE[field];
      if (Math.max(asset.width, asset.height) < minimum) {
        setField(item, media, mediaIndex, field, '', `${field} is ${asset.width}x${asset.height}, below ${minimum}px`);
      }
    }

    const thumb = validAssets.get('image_thumb');
    if (thumb && media.image_thumb) {
      for (const field of [...NOMINAL_FIELDS, 'image_original'] as const) {
        const asset = validAssets.get(field);
        if (!asset || !media[field]) continue;
        const sameUrl = asset.normalizedUrl === thumb.normalizedUrl;
        const sameBytes = asset.hash === thumb.hash;
        if (sameUrl || (sameBytes && !/\/originals?\//.test(asset.normalizedUrl))) {
          setField(item, media, mediaIndex, field, '', `${field} aliases the thumbnail`);
        } else if (field === 'image_original' && sameBytes) {
          addManual(item, mediaIndex, field, 'SMALL_ORIGINAL_MATCHES_THUMB', 'The originals-path asset has the same bytes as the thumbnail; keep it pending source review.', { url: asset.url });
        }
      }
    }

    const activeNominal = [...NOMINAL_FIELDS, 'image_original']
      .map(field => validAssets.get(field))
      .filter((asset): asset is AssetInfo => !!asset && !!media[asset.field]);
    const duplicateGroups = new Map<string, AssetInfo[]>();
    for (const asset of activeNominal) {
      const key = asset.hash;
      const group = duplicateGroups.get(key) || [];
      group.push(asset);
      duplicateGroups.set(key, group);
    }
    for (const group of duplicateGroups.values()) {
      if (group.length < 2) continue;
      const original = group.find(asset => asset.field === 'image_original' && intendedFieldFromUrl(asset.url, Math.max(asset.width, asset.height)) === 'image_original');
      const originalAlias = group.find(asset => asset.field === 'image_original');
      const threeKAlias = group.find(asset => asset.field === 'image_3k');
      if (originalAlias && threeKAlias && Math.max(originalAlias.width, originalAlias.height) === 3072) {
        for (const asset of group) {
          if (asset.field !== 'image_original' && asset.field !== 'image_3k' && media[asset.field]) {
            setField(item, media, mediaIndex, asset.field, '', `${asset.field} duplicates the legitimate 3K/original asset`);
          }
        }
        continue;
      }
      const sizeOrder = Math.max(group[0].width, group[0].height) >= 3072
        ? ['image_3k', 'image_2k', 'image_1k']
        : Math.max(group[0].width, group[0].height) >= 2048
          ? ['image_2k', 'image_1k']
          : ['image_1k'];
      const keep = original || sizeOrder.map(field => group.find(asset => asset.field === field)).find(Boolean) || group.find(asset => intendedFieldFromUrl(asset.url, Math.max(asset.width, asset.height)) === asset.field) || group[0];
      for (const asset of group) {
        if (asset.field !== keep.field && media[asset.field]) {
          setField(item, media, mediaIndex, asset.field, '', `${asset.field} duplicates ${keep.field}; retained the field matching path and dimensions`);
        }
      }
    }

    const activeAssets = [...validAssets.values()].filter(asset => !!media[asset.field]);
    if (!activeAssets.length) return;
    activeAssets.sort((left, right) => Math.max(right.width, right.height) - Math.max(left.width, left.height));
    const best = activeAssets[0];
    const ratios = activeAssets.map(asset => ({ asset, ratio: asset.width / asset.height }));
    const bestRatio = best.width / best.height;
    const inconsistent = ratios.filter(({ ratio }) => Math.abs(ratio - bestRatio) / bestRatio > 0.03);
    if (inconsistent.length) {
      addManual(item, mediaIndex, 'image_width/image_height', 'ASPECT_OR_ASSOCIATION_CONFLICT', 'Available fields do not share one aspect ratio; dimensions were not changed.', {
        best: { field: best.field, width: best.width, height: best.height, url: best.url },
        conflicting: inconsistent.map(({ asset }) => ({ field: asset.field, width: asset.width, height: asset.height, url: asset.url })),
      });
      return;
    }

    const identityReference = validAssets.get('image_thumb') || validAssets.get('image') || best;
    if (identityReference.hash !== best.hash) {
      const distance = await visualDistance(identityReference.buffer, best.buffer);
      if (distance > visualThreshold) {
        addManual(item, mediaIndex, 'image_width/image_height', 'VISUAL_IDENTITY_CONFLICT', 'The best asset does not visually match the display image; dimensions were not changed.', {
          referenceField: identityReference.field,
          bestField: best.field,
          distance,
          threshold: visualThreshold,
          referenceUrl: identityReference.url,
          bestUrl: best.url,
        });
        return;
      }
    }
    setField(item, media, mediaIndex, 'image_width', best.width, `Decoded from best verified ${best.field}`);
    setField(item, media, mediaIndex, 'image_height', best.height, `Decoded from best verified ${best.field}`);
  };

  const validationBefore = await validateMediaState(inputState, { rootDir, allowNetwork: options.allowNetwork !== false, resolver: options.resolver, reportMissingOptionalVariants: true });
  for (const item of state.items || []) {
    const recoverIds = new Set(options.recoverProjectIds || ['custom-1779283310322']);
    const recoveryItem = recoverIds.has(String(item.id || ''))
      ? options.recoveryState?.items?.find((candidate: any) => String(candidate.id || '') === String(item.id || ''))
      : null;
    if (recoveryItem && Array.isArray(recoveryItem.mergedMedia) && Array.isArray(item.mergedMedia)
      && recoveryItem.mergedMedia.length > item.mergedMedia.length) {
      const start = item.mergedMedia.length;
      for (let index = start; index < recoveryItem.mergedMedia.length; index++) {
        const recovered = clone(recoveryItem.mergedMedia[index]);
        item.mergedMedia.push(recovered);
        changes.push({
          projectId: String(item.id || ''), title: String(item.title || ''), mediaIndex: index + 1,
          field: `mergedMedia[${index}]`, before: null, after: recovered,
          oldValue: null, newValue: recovered,
          reason: 'Recovered missing media entry from historical project order; asset fields are revalidated locally',
          confidence: 'high', automatic: true,
        });
      }
    }
    const mediaList = Array.isArray(item.mergedMedia) && item.mergedMedia.length ? item.mergedMedia : [item];
    for (let index = 0; index < mediaList.length; index++) await repairMedia(item, mediaList[index], index + 1);

    if (Array.isArray(item.mergedMedia) && item.mergedMedia.length) {
      const primary = item.mergedMedia[0];
      for (const field of [...IMAGE_FIELDS, 'image_width', 'image_height']) {
        setField(item, item, 0, field, primary[field] ?? '', `Top-level field mirrors carousel media 1 ${field}`);
      }
    }
  }
  const validationAfter = await validateMediaState(state, { rootDir, allowNetwork: options.allowNetwork !== false, resolver: options.resolver, reportMissingOptionalVariants: true });
  return { state, changes, manualReview, validationBefore, validationAfter };
}

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function humanReport(result: PortfolioRepairResult, apply: boolean) {
  const byReason = new Map<string, number>();
  for (const change of result.changes) byReason.set(change.reason, (byReason.get(change.reason) || 0) + 1);
  const lines = [
    `Portfolio media migration ${apply ? 'APPLY' : 'DRY RUN'}`,
    `Changes: ${result.changes.length}`,
    `Manual review entries: ${result.manualReview.length}`,
    `Before: ${result.validationBefore.errorCount} errors, ${result.validationBefore.warningCount} warnings`,
    `After: ${result.validationAfter.errorCount} errors, ${result.validationAfter.warningCount} warnings`,
    '',
    'Change reasons:',
    ...[...byReason].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `- ${count} × ${reason}`),
    '',
    'Manual review:',
    ...result.manualReview.map(entry => `- ${entry.projectId} media ${entry.mediaIndex} ${entry.field} ${entry.code}: ${entry.problem}`),
  ];
  return lines.join('\n');
}

function htmlReport(result: PortfolioRepairResult) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
  const rows = result.changes.map(change => `<tr><td>${escape(change.projectId)}</td><td>${escape(change.title)}</td><td>${change.mediaIndex}</td><td>${escape(change.field)}</td><td>${escape(change.oldValue)}</td><td>${escape(change.newValue)}</td><td>${escape(change.sourceAsset)}</td><td>${escape(change.reason)}</td><td>${change.confidence}</td></tr>`).join('\n');
  const manualRows = result.manualReview.map(entry => `<tr><td>${escape(entry.projectId)}</td><td>${entry.mediaIndex}</td><td>${escape(entry.field)}</td><td>${escape(entry.code)}</td><td>${escape(entry.problem)}</td></tr>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Portfolio media recovery report</title><style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse;width:100%;margin-bottom:2rem}th,td{border:1px solid #ccc;padding:.35rem;text-align:left;vertical-align:top}th{background:#eee}</style><h1>Portfolio media recovery dry-run</h1><p>Changes: ${result.changes.length}; manual review: ${result.manualReview.length}; validation: ${result.validationBefore.errorCount} errors before, ${result.validationAfter.errorCount} after.</p><h2>Automatic changes</h2><table><thead><tr><th>Project</th><th>Title</th><th>Media</th><th>Field</th><th>Old</th><th>New</th><th>Source asset</th><th>Reason</th><th>Confidence</th></tr></thead><tbody>${rows}</tbody></table><h2>Manual review</h2><table><thead><tr><th>Project</th><th>Media</th><th>Field</th><th>Code</th><th>Problem</th></tr></thead><tbody>${manualRows}</tbody></table>`;
}

async function main() {
  const inputPath = arg('--input', 'data/state.json');
  const outputPath = arg('--output', arg('--output-state', 'backups/migrations/portfolio-repair-state.dry-run.json'));
  const reportJsonPath = arg('--report-json', 'backups/migrations/portfolio-repair-report.json');
  const reportTextPath = arg('--report-text', 'backups/migrations/portfolio-repair-report.txt');
  const reportHtmlPath = arg('--report-html', 'backups/migrations/portfolio-repair-report.html');
  const manualPath = arg('--manual-review', 'backups/migrations/portfolio-manual-review.json');
  const recoveryInputPath = arg('--recovery-input', 'backups/data/state_2026-05-29T09-59-47-542Z.json.bak');
  const apply = process.argv.includes('--apply');
  const summaryOnly = process.argv.includes('--summary-only');
  const allowNetwork = !process.argv.includes('--no-network');
  const state = JSON.parse(await fs.readFile(inputPath, 'utf-8'));
  const recoveryState = await fs.readFile(recoveryInputPath, 'utf-8').then(JSON.parse).catch(() => undefined);
  const result = await repairPortfolioState(state, { rootDir: process.cwd(), allowNetwork, recoveryState });
  const text = humanReport(result, apply);

  await Promise.all([outputPath, reportJsonPath, reportTextPath, reportHtmlPath, manualPath].map(filename => fs.mkdir(path.dirname(filename), { recursive: true })));
  await Promise.all([
    fs.writeFile(outputPath, JSON.stringify(result.state, null, 2), 'utf-8'),
    fs.writeFile(reportJsonPath, JSON.stringify({ dryRun: !apply, changes: result.changes, validationBefore: result.validationBefore, validationAfter: result.validationAfter }, null, 2), 'utf-8'),
    fs.writeFile(reportTextPath, `${text}\n`, 'utf-8'),
    fs.writeFile(reportHtmlPath, htmlReport(result), 'utf-8'),
    fs.writeFile(manualPath, JSON.stringify(result.manualReview, null, 2), 'utf-8'),
  ]);

  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join('backups', 'data', `state_pre_portfolio_media_migration_${timestamp}.json`);
    await fs.copyFile(inputPath, backupPath);
    await fs.writeFile(inputPath, JSON.stringify(result.state, null, 2), 'utf-8');
    console.log(`Applied locally after backup ${backupPath}. Nothing was published.`);
  }
  console.log(summaryOnly
    ? `Portfolio migration ${apply ? 'APPLY' : 'DRY RUN'}: changes=${result.changes.length}; manual=${result.manualReview.length}; errors ${result.validationBefore.errorCount}->${result.validationAfter.errorCount}; warnings ${result.validationBefore.warningCount}->${result.validationAfter.warningCount}`
    : text);
  console.log(`Candidate: ${outputPath}`);
  console.log(`Manual review: ${manualPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
