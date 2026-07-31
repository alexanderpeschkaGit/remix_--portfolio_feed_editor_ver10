// Media deletion helpers.
//
// Deleted media files are NEVER hard-deleted locally. Instead they are MOVED into
// the top-level `bak/` folder (git-ignored and excluded from every R2 upload/sync
// scan) while preserving their original relative location, so it stays obvious
// where each file originally came from:
//
//   data_v2/uploads/originals/x_original.jpg  ->  bak/data_v2/uploads/originals/x_original.jpg
//   data/flickr/flickr_3k/y.jpg               ->  bak/data/flickr/flickr_3k/y.jpg
//   originals/creation_1.png                  ->  bak/originals/creation_1.png
//
// The R2 counterpart is a HARD delete (see server.ts `deleteR2ObjectHard`).
// Undo restores files from `bak/` (see POST /api/bak/restore); the next Cloud
// Sync re-uploads restored files to R2 because their manifest entries were removed.
import fs from 'fs/promises';
import path from 'path';
import {
  resolveMediaAssetLocation,
  extractMediaAssetFamily,
  discoverMediaAssetFamily,
} from './mediaAssets.ts';

export const BAK_DIR_NAME = 'bak';

// Every media reference field that can point to a local file / R2 object.
export const MEDIA_DELETE_REFERENCE_FIELDS = [
  'image',
  'image_thumb',
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
] as const;

const toPosix = (value: string) => value.replace(/\\/g, '/');

/**
 * Normalize any media URL/path into a possible R2 key.
 * Mirrors `normalizePossibleR2Key` in server.ts so both sides agree.
 * Returns null for values that are not R2-managed (e.g. Bunny/YouTube/plain page URLs).
 */
export function toPossibleR2Key(value?: string): string | null {
  if (!value) return null;
  const clean = String(value).trim().split('#')[0].split('?')[0];
  if (!clean) return null;
  let pathname = clean;
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return null;
    }
  }
  pathname = pathname.replace(/^\/+/, '');
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // keep raw pathname if decoding fails
  }
  if (!pathname) return null;
  if (pathname.startsWith('data_v2/')) {
    return `v2/data/${toPosix(pathname.slice('data_v2/'.length))}`;
  }
  if (
    pathname.startsWith('data/') ||
    pathname.startsWith('v2/data/') ||
    pathname.startsWith('uploads/') ||
    pathname.startsWith('highres/') ||
    pathname.startsWith('originals/')
  ) {
    return toPosix(pathname);
  }
  return null;
}

export interface BakMove {
  from: string;
  to: string;
}

/**
 * Move a single local media file into `bak/`, preserving its original relative
 * location (data_v2/…, data/…, originals/…). Handles cross-device moves
 * (EXDEV) via copy + unlink and resolves name collisions with a timestamp suffix.
 * Returns the {from, to} mapping (used by Undo) or null if the source is missing.
 */
export async function moveFileToBak(localPath: string, rootDir = process.cwd()): Promise<BakMove | null> {
  const abs = path.resolve(localPath);
  let stats;
  try {
    stats = await fs.stat(abs);
  } catch {
    return null;
  }
  if (!stats.isFile()) return null;

  const root = path.resolve(rootDir);
  const relToRoot = path.relative(root, abs).split(path.sep).join('/');

  let rel: string;
  if (relToRoot === '..' || relToRoot.startsWith('../')) {
    // File outside the repo root -> keep just the filename to avoid path escapes.
    rel = path.basename(abs);
  } else if (relToRoot.startsWith('bak/') || relToRoot === BAK_DIR_NAME) {
    return null; // already in bak/
  } else if (
    relToRoot.startsWith('data_v2/') ||
    relToRoot.startsWith('data/') ||
    relToRoot.startsWith('originals/')
  ) {
    rel = relToRoot;
  } else {
    rel = relToRoot || path.basename(abs);
  }

  const bakDir = path.join(root, BAK_DIR_NAME);
  let dest = path.join(bakDir, rel.split('/').join(path.sep));
  await fs.mkdir(path.dirname(dest), { recursive: true });

  if (await fs.access(dest).then(() => true).catch(() => false)) {
    const ext = path.extname(dest);
    const base = dest.slice(0, dest.length - ext.length);
    dest = `${base}-${Date.now()}${ext}`;
  }

  try {
    await fs.rename(abs, dest);
  } catch (e: any) {
    if (e?.code === 'EXDEV' || e?.code === 'EPERM') {
      await fs.copyFile(abs, dest);
      await fs.unlink(abs);
    } else {
      throw e;
    }
  }
  return { from: abs, to: dest };
}

/**
 * Enumerate every local file belonging to a media object:
 * - the exact file for each reference field (via `resolveMediaAssetLocation`,
 *   which also understands absolute R2 public URLs)
 * - every sibling image variant on disk (thumbs400/1k/2k/3k/originals) for
 *   data_v2 references (via `discoverMediaAssetFamily`)
 */
export async function enumerateLocalFilesForMedia(mediaLike: any, rootDir = process.cwd()): Promise<string[]> {
  const found = new Set<string>();
  if (!mediaLike || typeof mediaLike !== 'object') return [];
  for (const field of MEDIA_DELETE_REFERENCE_FIELDS) {
    const value = (mediaLike as any)[field];
    if (typeof value !== 'string' || !value) continue;

    const location = resolveMediaAssetLocation(value, rootDir);
    if (location.localPath) {
      try {
        const s = await fs.stat(location.localPath);
        if (s.isFile()) found.add(location.localPath);
      } catch {
        // file may not exist locally (e.g. only ever on R2) -> skip
      }
    }

    const family = extractMediaAssetFamily(value);
    if (family) {
      const discovered = await discoverMediaAssetFamily(family, rootDir);
      for (const variant of Object.values(discovered)) {
        if (variant?.path) found.add(variant.path);
      }
    }
  }
  return Array.from(found);
}

/**
 * Enumerate every possible R2 key referenced by a media object.
 * (Bunny/YouTube/page URLs resolve to null and are skipped.)
 */
export function enumerateR2KeysForMedia(mediaLike: any): string[] {
  const keys = new Set<string>();
  if (!mediaLike || typeof mediaLike !== 'object') return [];
  for (const field of MEDIA_DELETE_REFERENCE_FIELDS) {
    const value = (mediaLike as any)[field];
    if (typeof value !== 'string' || !value) continue;
    const key = toPossibleR2Key(value);
    if (key) keys.add(key);
  }
  return Array.from(keys);
}
