// Content-hash based redundancy detection.
//
// The existing legacy-duplicate routine (`buildLegacyUploadDuplicateReport` in
// server.ts) is NAME based: it trashes `uploads/x.jpg` when `data/uploads/x.jpg`
// happens to exist. That says nothing about the bytes, and it covers nothing
// outside `uploads/`.
//
// This module adds real content hashing (SHA-1) so redundant *material* can be
// identified regardless of filename or location. Two scopes are scanned:
//
//   - R2 keys under the managed prefixes
//   - local files under data/, data_v2/ and originals/
//
// Deliberately NOT used: perceptual hashes. pHash exists in the Python scrapers
// but is wired into no deletion path, and near-duplicate similarity is not a safe
// criterion for deleting a photographer's originals. SHA-1 exact-byte equality is.

import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { createHash, type Hash } from 'crypto';

/** Local roots scanned for redundant material. Mirrors server.ts sync scan roots. */
export const REDUNDANCY_LOCAL_ROOTS = ['data', 'data_v2', 'originals'] as const;

export type RedundancyScope = 'r2' | 'local';

export interface CandidateItem {
  scope: RedundancyScope;
  location: string;
  size: number;
  eTag?: string;
  mtimeMs?: number;
}

export interface HashedEntry {
  scope: RedundancyScope;
  /** R2 key, or absolute local path. */
  location: string;
  size: number;
  hash: string;
}

export interface RedundantEntry {
  scope: RedundancyScope;
  location: string;
  size: number;
  keeperLocation: string;
  keeperScope: RedundancyScope;
  groupSize: number;
  isReferenced: boolean;
  reason: 'duplicate-content';
}

export interface RedundancyReport {
  scannedCount: number;
  duplicateCount: number;
  totalBytes: number;
  duplicates: RedundantEntry[];
  sampleKeys: string[];
}

export interface MediaHashCache {
  r2: Record<string, { etag: string; size: number; hash: string }>;
  local: Record<string, { mtimeMs: number; size: number; hash: string }>;
}

export async function loadHashCache(cachePath: string): Promise<MediaHashCache> {
  try {
    const data = await fs.readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      r2: parsed?.r2 && typeof parsed.r2 === 'object' ? parsed.r2 : {},
      local: parsed?.local && typeof parsed.local === 'object' ? parsed.local : {},
    };
  } catch {
    return { r2: {}, local: {} };
  }
}

export async function saveHashCache(cachePath: string, cache: MediaHashCache): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save hash cache:', err);
  }
}

/**
 * Filter candidates by file size: only files sharing their exact byte size with
 * at least one other file can possibly be duplicates. Unique-size files are ignored.
 */
export function groupCandidatesBySize(candidates: CandidateItem[]): Map<number, CandidateItem[]> {
  const groups = new Map<number, CandidateItem[]>();
  for (const item of candidates) {
    if (!item.size || item.size <= 0) continue;
    const list = groups.get(item.size);
    if (list) list.push(item);
    else groups.set(item.size, [item]);
  }

  // Only keep groups with 2 or more files of the exact same size
  const filtered = new Map<number, CandidateItem[]>();
  for (const [size, list] of groups.entries()) {
    if (list.length >= 2) {
      filtered.set(size, list);
    }
  }
  return filtered;
}

/**
 * Keeper precedence. Higher wins. A referenced file always beats an unreferenced
 * one (see `pickKeeper`), this only orders the unreferenced candidates.
 */
const R2_PREFIX_RANK: Record<string, number> = {
  'v2/data/': 50,
  'data/': 40,
  'uploads/': 30,
  'highres/': 20,
  'originals/': 10,
};

const r2PrefixRank = (key: string) => {
  for (const [prefix, rank] of Object.entries(R2_PREFIX_RANK)) {
    if (key.startsWith(prefix)) return rank;
  }
  return 0;
};

const LOCAL_ROOT_RANK: Record<string, number> = {
  data_v2: 50,
  data: 40,
  originals: 10,
};

const localRootRank = (absPath: string) => {
  const posix = absPath.split(path.sep).join('/');
  for (const [root, rank] of Object.entries(LOCAL_ROOT_RANK)) {
    if (posix.includes(`/${root}/`) || posix.startsWith(`${root}/`)) return rank;
  }
  return 0;
};

export const isMediaFile = (name: string) =>
  /\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff|mp4|webm|mov|mkv|avi)$/i.test(name);

/** SHA-1 of a local file, streamed so large videos do not sit in memory. */
export async function hashLocalFile(absPath: string): Promise<string | null> {
  try {
    const hash: Hash = createHash('sha1');
    const stream = createReadStream(absPath);
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}

/** SHA-1 of an in-memory buffer (used for the R2 body path). */
export function hashBuffer(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex');
}

/**
 * Hash a stream-producing body (R2 GetObject) without buffering it twice.
 * Returns null if the stream errors mid-way.
 */
export async function hashR2Body(body: any): Promise<string | null> {
  try {
    const hash: Hash = createHash('sha1');
    for await (const chunk of body as AsyncIterable<Buffer | Uint8Array | string>) {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return hash.digest('hex');
  } catch {
    return null;
  }
}

/** Recursively list media files under a local root, skipping bak/ by construction. */
export async function listLocalMediaFiles(rootAbs: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        // Never descend into archives or dependency folders.
        if (dirent.name === 'bak' || dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue;
        await walk(full);
      } else if (dirent.isFile() && isMediaFile(dirent.name)) {
        out.push(full);
      }
    }
  };
  await walk(rootAbs);
  return out;
}

export interface PickKeeperContext {
  isReferencedR2Key: (key: string) => boolean;
  /** Local files currently referenced by state.json (absolute paths). */
  referencedLocalPaths?: Set<string>;
  /** R2 key -> local path, so an R2 entry can inherit its local referenced flag. */
  r2KeyToLocalPath?: (key: string) => string | null;
}

const isEntryReferenced = (entry: HashedEntry, ctx: PickKeeperContext) => {
  if (entry.scope === 'r2') {
    if (ctx.isReferencedR2Key(entry.location)) return true;
    const local = ctx.r2KeyToLocalPath?.(entry.location);
    return !!(local && ctx.referencedLocalPaths?.has(local));
  }
  return !!ctx.referencedLocalPaths?.has(entry.location);
};

/**
 * Pick the single keeper of a hash group.
 *
 * Guard: if exactly one member is referenced, that member is ALWAYS the keeper and
 * the others are redundant. Otherwise a referenced member would be trashed while a
 * byte-identical unreferenced copy survived - the exact failure mode we are avoiding.
 */
export function pickKeeper(group: HashedEntry[], ctx: PickKeeperContext): HashedEntry {
  const referenced = group.filter((entry) => isEntryReferenced(entry, ctx));
  const pool = referenced.length > 0 ? referenced : group;

  return pool.reduce((best, candidate) => {
    const score = (e: HashedEntry) => (e.scope === 'r2' ? r2PrefixRank(e.location) : localRootRank(e.location));
    if (score(candidate) !== score(best)) return score(candidate) > score(best) ? candidate : best;
    // Deterministic tie-break so repeated previews agree with execute.
    return candidate.location < best.location ? candidate : best;
  });
}

/**
 * Group hashed entries by content and report every non-keeper.
 * The keeper is removed from the report, so a group of N yields N-1 duplicates.
 */
export function findRedundantEntries(
  entries: HashedEntry[],
  ctx: PickKeeperContext
): RedundantEntry[] {
  // Group per scope + hash: an R2 object and its local synced copy are byte-identical
  // by design and must never be treated as duplicates of each other.
  const groups = new Map<string, HashedEntry[]>();
  for (const entry of entries) {
    if (!entry.hash) continue;
    const groupKey = `${entry.scope}:${entry.hash}`;
    const list = groups.get(groupKey);
    if (list) list.push(entry);
    else groups.set(groupKey, [entry]);
  }

  const duplicates: RedundantEntry[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keeper = pickKeeper(group, ctx);
    for (const entry of group) {
      if (entry.location === keeper.location) continue;
      duplicates.push({
        scope: entry.scope,
        location: entry.location,
        size: entry.size,
        keeperLocation: keeper.location,
        keeperScope: keeper.scope,
        groupSize: group.length,
        isReferenced: isEntryReferenced(entry, ctx),
        reason: 'duplicate-content',
      });
    }
  }

  duplicates.sort((a, b) => b.size - a.size);
  return duplicates;
}

/** Build a report from already-hashed entries. */
export function buildRedundancyReport(
  entries: HashedEntry[],
  ctx: PickKeeperContext,
  totalScannedCount?: number
): RedundancyReport {
  const duplicates = findRedundantEntries(entries, ctx);
  return {
    scannedCount: totalScannedCount !== undefined ? totalScannedCount : entries.length,
    duplicateCount: duplicates.length,
    totalBytes: duplicates.reduce((sum, d) => sum + d.size, 0),
    duplicates,
    sampleKeys: duplicates.slice(0, 25).map((d) => d.location),
  };
}
