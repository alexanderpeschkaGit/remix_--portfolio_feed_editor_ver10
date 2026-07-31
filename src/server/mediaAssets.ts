import fs from 'fs/promises';
import path from 'path';

export const MEDIA_VARIANT_LAYOUT = {
  image_thumb: { dir: 'thumbs400', suffix: 'thumb' },
  image_1k: { dir: '1k', suffix: '1k' },
  image_2k: { dir: '2k', suffix: '2k' },
  image_3k: { dir: '3k', suffix: '3k' },
  image_original: { dir: 'originals', suffix: 'original' },
} as const;

export type InventoryImageField = keyof typeof MEDIA_VARIANT_LAYOUT;

export interface MediaAssetLocation {
  originalValue: string;
  pathname: string;
  canonicalR2Key: string | null;
  localPath: string | null;
  publicBaseUrl: string;
}

export interface MediaAssetFamily {
  group: string;
  baseName: string;
  publicBaseUrl: string;
}

const decodePath = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const cleanPathname = (value: string) => {
  const clean = String(value || '').trim().split('#')[0].split('?')[0];
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) {
    try {
      return decodePath(new URL(clean).pathname).replace(/\\/g, '/');
    } catch {
      return '';
    }
  }
  return decodePath(clean).replace(/\\/g, '/');
};

const canonicalKeyFromPathname = (pathname: string) => {
  const normalized = pathname.replace(/^\/+/, '');
  if (/^v2\/data\//i.test(normalized)) return normalized.replace(/^v2\/data\//i, 'v2/data/');
  if (/^data_v2\//i.test(normalized)) return `v2/data/${normalized.slice('data_v2/'.length)}`;
  return null;
};

export function resolveMediaAssetLocation(value: string, rootDir = process.cwd()): MediaAssetLocation {
  const originalValue = String(value || '').trim();
  const pathname = cleanPathname(originalValue);
  const canonicalR2Key = canonicalKeyFromPathname(pathname);
  let publicBaseUrl = '';
  if (/^https?:\/\//i.test(originalValue)) {
    try {
      publicBaseUrl = new URL(originalValue).origin;
    } catch {}
  }

  let localPath: string | null = null;
  if (canonicalR2Key) {
    localPath = path.join(rootDir, 'data_v2', canonicalR2Key.slice('v2/data/'.length));
  } else {
    const normalized = pathname.replace(/^\/+/, '');
    if (/^data\//i.test(normalized) || /^originals\//i.test(normalized)) {
      // App-internal web paths (e.g. /data/..., /originals/...) -> workspace-relative.
      // IMPORTANT: must be checked BEFORE path.isAbsolute — on Windows a leading "/"
      // is treated as drive-root-relative ("\data\..."), which would produce a bogus path.
      localPath = path.join(rootDir, normalized);
    } else if (path.isAbsolute(originalValue) && !/^https?:\/\//i.test(originalValue)) {
      localPath = path.normalize(originalValue);
    } else if (originalValue && !/^https?:\/\//i.test(originalValue)) {
      localPath = path.resolve(rootDir, originalValue);
    }
  }

  return { originalValue, pathname, canonicalR2Key, localPath, publicBaseUrl };
}

export function extractMediaAssetFamily(value: string): MediaAssetFamily | null {
  const location = resolveMediaAssetLocation(value);
  if (!location.canonicalR2Key) return null;
  const match = /^v2\/data\/([^/]+)\/(thumbs400|1k|2k|3k|originals)\/(.+)\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff)$/i.exec(location.canonicalR2Key);
  if (!match) return null;
  const suffix = match[2].toLowerCase() === 'thumbs400' ? 'thumb' : match[2].toLowerCase() === 'originals' ? 'original' : match[2].toLowerCase();
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const baseName = match[3].replace(new RegExp(`[_-]${escapedSuffix}$`, 'i'), '');
  if (!baseName) return null;
  return { group: match[1], baseName, publicBaseUrl: location.publicBaseUrl };
}

export function mediaAssetUrl(family: MediaAssetFamily, field: InventoryImageField, filename: string) {
  const key = `v2/data/${family.group}/${MEDIA_VARIANT_LAYOUT[field].dir}/${filename}`;
  return family.publicBaseUrl ? `${family.publicBaseUrl}/${key}` : `/${key}`;
}

export async function discoverMediaAssetFamily(
  family: MediaAssetFamily,
  rootDir = process.cwd(),
): Promise<Partial<Record<InventoryImageField, { path: string; url: string; filename: string }>>> {
  const result: Partial<Record<InventoryImageField, { path: string; url: string; filename: string }>> = {};
  for (const [field, layout] of Object.entries(MEDIA_VARIANT_LAYOUT) as Array<[InventoryImageField, typeof MEDIA_VARIANT_LAYOUT[InventoryImageField]]>) {
    const dir = path.join(rootDir, 'data_v2', family.group, layout.dir);
    let filenames: string[];
    try {
      filenames = await fs.readdir(dir);
    } catch {
      continue;
    }
    const prefix = `${family.baseName}_${layout.suffix}.`.toLowerCase();
    const filename = filenames.find(candidate => candidate.toLowerCase().startsWith(prefix));
    if (!filename) continue;
    const localPath = path.join(dir, filename);
    result[field] = { path: localPath, url: mediaAssetUrl(family, field, filename), filename };
  }
  return result;
}

export async function firstExistingLocalMediaPath(value: string, rootDir = process.cwd()) {
  const location = resolveMediaAssetLocation(value, rootDir);
  if (!location.localPath) return null;
  try {
    const stats = await fs.stat(location.localPath);
    return stats.isFile() ? location.localPath : null;
  } catch {
    return null;
  }
}
