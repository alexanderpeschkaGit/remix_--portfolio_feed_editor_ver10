import fs from 'fs/promises';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { normalizeState } from './mediaNormalization.ts';
import { assertStateAcceptable } from './statePublishing.ts';
import {
  ensureStateVideoDimensions,
  fetchBunnyVideoMetadata,
  probeVideoDimensions,
} from './videoDimensionsService.ts';
import {
  DATA_BACKUPS_DIR,
  DATA_DIR,
  DATA_V2_DIR,
  getContentTypeForPath,
  isR2Configured,
  R2_CONFIG,
  R2_STORAGE_KEYS,
  s3Client,
} from './serverContext.ts';

export {
  ensureStateVideoDimensions,
  fetchBunnyVideoMetadata,
  probeVideoDimensions,
};

let inMemoryState: any = null;
let lastR2FetchMs = 0;
let lastCloudBackupMs = 0;
let r2StateVerified = false;
let activeWritePromise: Promise<void> = Promise.resolve();

const R2_READ_TTL_MS = 2_000;
const CLOUD_BACKUP_MIN_INTERVAL_MS = 60_000;

export async function liftLegacyDataV2UrlsInState(stateObj: any): Promise<void> {
  if (!stateObj || typeof stateObj !== 'object') return;
  const baseUrl = (R2_CONFIG.publicUrl || R2_CONFIG.publicDomain || '').replace(/\/+$/, '');

  async function walk(target: any) {
    if (!target || typeof target !== 'object') return;

    for (const key of Object.keys(target)) {
      const val = target[key];
      if (typeof val === 'string') {
        const clean = val.trim().replace(/\\/g, '/');
        if (clean.startsWith('/data_v2/') || clean.startsWith('data_v2/')) {
          const relativeSubpath = clean.replace(/^\/?data_v2\//, '');
          const localPath = path.join(DATA_V2_DIR, relativeSubpath);
          const r2Key = `v2/data/${relativeSubpath}`;

          if (isR2Configured() && s3Client) {
            try {
              const buf = await fs.readFile(localPath);
              const contentType = getContentTypeForPath(localPath);
              await s3Client.send(
                new PutObjectCommand({
                  Bucket: R2_CONFIG.bucketName,
                  Key: r2Key,
                  Body: buf,
                  ContentType: contentType,
                  CacheControl: 'public, max-age=31536000, immutable',
                })
              );
            } catch {
              // Local file might not exist or already be on R2
            }
          }

          if (baseUrl) {
            target[key] = `${baseUrl}/${r2Key}`;
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        await walk(val);
      }
    }
  }

  await walk(stateObj);
}

export async function loadState(options?: { forceRefresh?: boolean }): Promise<any> {
  const now = Date.now();
  const shouldQueryR2 =
    isR2Configured() &&
    s3Client &&
    (options?.forceRefresh || !inMemoryState || now - lastR2FetchMs > R2_READ_TTL_MS);

  if (shouldQueryR2 && s3Client) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: R2_STORAGE_KEYS.STATE_FILE,
        })
      );
      const rawJson = await response.Body?.transformToString('utf-8');
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        if (!parsed.lastUpdated || typeof parsed.lastUpdated !== 'string') {
          parsed.lastUpdated = new Date().toISOString();
        }
        inMemoryState = parsed;
        lastR2FetchMs = now;
        r2StateVerified = true;
        return inMemoryState;
      }
    } catch (err: any) {
      const isNotFound = err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
      if (isNotFound) {
        r2StateVerified = true;
      } else {
        console.warn('[stateManager] R2 GetObject Warnung, nutze Fallback:', err?.message || err);
      }
    }
  }

  if (inMemoryState) {
    return inMemoryState;
  }

  try {
    const localStatePath = path.join(DATA_DIR, 'state.json');
    const localRaw = await fs.readFile(localStatePath, 'utf-8');
    const localParsed = JSON.parse(localRaw);
    if (!localParsed.lastUpdated || typeof localParsed.lastUpdated !== 'string') {
      localParsed.lastUpdated = new Date().toISOString();
    }
    inMemoryState = localParsed;
    if (Array.isArray(localParsed.items) && localParsed.items.length > 0) {
      r2StateVerified = true;
    }
    return inMemoryState;
  } catch {
    // Lokale Datei existiert nicht -> nutze In-Memory-Default
  }

  inMemoryState = {
    items: [],
    settings: {},
    lastUpdated: new Date().toISOString(),
  };
  return inMemoryState;
}

  // ── Bunny media schema normalization (canonical thumbnail contract) ──
  // Every `type: "bunny"` media item must carry:
  //   url + image_original = embed URL (never an image)
  //   bunnyThumbUrl       = deterministic Bunny CDN thumbnail (never "")
  //   image               = best of the R2 variant set (2k -> 3k -> 1k -> thumb)
  export const isBunnyMediaLike = (obj: any) => {
    if (!obj || typeof obj !== 'object') return false;
    const type = String(obj.type || '').toLowerCase();
    return type === 'bunny' || (!!obj.videoId && !!obj.libraryId);
  };

  export const getBunnyEmbedUrl = (media: any) =>
    media.videoId && media.libraryId
      ? `https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}`
      : '';

  export const getBunnyThumbUrl = (media: any) =>
    media.videoId && media.libraryId
      ? `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`
      : '';

  export const normalizeBunnyMediaFields = (media: any) => {
    if (!isBunnyMediaLike(media)) return;

    if (String(media.type || '').toLowerCase() !== 'bunny') {
      media.type = 'bunny';
    }

    const embed = getBunnyEmbedUrl(media);
    const thumb = getBunnyThumbUrl(media);

    // 1. url + image_original are ALWAYS the embed URL (never an image)
    if (embed) {
      if (media.url !== embed) media.url = embed;
      if (media.image_original !== embed) media.image_original = embed;
    }

    // 2. bunnyThumbUrl always set (deterministic CDN fallback, independent of R2)
    if (thumb && !media.bunnyThumbUrl) media.bunnyThumbUrl = thumb;

    // 3. image = best of the variant set (2k -> 3k -> 1k -> thumb)
    const best =
      media.image_2k ||
      media.image_3k ||
      media.image_1k ||
      media.image_thumb ||
      media.image ||
      '';
    if (best && media.image !== best) media.image = best;
  };

  export const normalizeStateBunnyMedia = (state: any) => {
    if (!state || !Array.isArray(state.items)) return;
    for (const item of state.items) {
      normalizeBunnyMediaFields(item);
      if (Array.isArray(item.mergedMedia)) {
        for (const media of item.mergedMedia) normalizeBunnyMediaFields(media);
      }
    }
  };

  export function localTimestamp(): string {
    const now = new Date();
    const y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${y}-${M}-${d}T${h}-${m}-${s}-${ms}`;
  }

  export async function backupState(stateObj?: any) {
    const dataToBackup = stateObj || inMemoryState;

    if (isR2Configured() && s3Client) {
      try {
        let contentStr = '';
        if (dataToBackup) {
          contentStr = typeof dataToBackup === 'string' ? dataToBackup : JSON.stringify(dataToBackup, null, 2);
        } else {
          try {
            contentStr = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
          } catch {}
        }
        if (contentStr) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          await s3Client.send(
            new PutObjectCommand({
              Bucket: R2_CONFIG.bucketName,
              Key: `${R2_STORAGE_KEYS.BACKUP_PREFIX}state-${timestamp}.json`,
              Body: Buffer.from(contentStr),
              ContentType: 'application/json; charset=utf-8',
            })
          );
        }
      } catch (err: any) {
        console.warn('[stateManager] Cloud backup failed:', err?.message || err);
      }
    }

    try {
      const statePath = path.join(DATA_DIR, 'state.json');
      const stats = await fs.stat(statePath).catch(() => null);
      if (stats) {
        const timestamp = localTimestamp();
        const backupPath = path.join(DATA_BACKUPS_DIR, `state_${timestamp}.json`);
        await fs.copyFile(statePath, backupPath);

        // Keep only last 100 data backups
        const files = await fs.readdir(DATA_BACKUPS_DIR).catch(() => []);
        const backups = files.filter(f => f.startsWith('state_') && f.endsWith('.json')).sort().reverse();
        if (backups.length > 100) {
          for (const f of backups.slice(100)) {
            await fs.unlink(path.join(DATA_BACKUPS_DIR, f)).catch(() => {});
          }
        }
      } else if (dataToBackup) {
        const timestamp = localTimestamp();
        const backupPath = path.join(DATA_BACKUPS_DIR, `state_${timestamp}.json`);
        const contentStr = typeof dataToBackup === 'string' ? dataToBackup : JSON.stringify(dataToBackup, null, 2);
        await fs.writeFile(backupPath, contentStr, 'utf-8').catch(() => {});
      }
    } catch (e: any) {
      console.warn('[stateManager] Local backup failed:', e?.message || e);
    }
  }

  // One-time cleanup: Move loose .bak files from data/ to backups/data/
  export async function cleanupLooseBakFiles() {
    try {
      const files = await fs.readdir(DATA_DIR);
      const bakFiles = files.filter(f => f.includes('.bak'));
      for (const f of bakFiles) {
        const oldPath = path.join(DATA_DIR, f);
        const newPath = path.join(DATA_BACKUPS_DIR, f.replace('.json.bak.', '_bak_').replace('.bak.', '_bak_'));
        await fs.rename(oldPath, newPath).catch(() => {});
      }
    } catch (e) {}
  }
  cleanupLooseBakFiles();

  export const extractPortfolioDataFromHtml = (html: string) => {
    const fullStateMatch = html.match(/<script id="editor-state-backup" type="application\/json">([\s\S]*?)<\/script>/);
    const publicMatch = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
    const match = fullStateMatch || publicMatch;
    
    if (!match || !match[1]) {
      throw new Error('Backup-Format ungültig: Script-Tag fehlt.');
    }
    return JSON.parse(match[1]);
  };


  export async function persistAcceptedState(stateData: any, statePath = path.join(DATA_DIR, 'state.json'), createBackup = false) {
    let state = typeof stateData === 'string' ? JSON.parse(stateData) : stateData;
    const { state: normalized } = normalizeState(state, { rootDir: process.cwd(), checkDiskAssets: true });
    state = normalized;
    await ensureStateVideoDimensions(state);
    normalizeStateBunnyMedia(state);
    await liftLegacyDataV2UrlsInState(state);
    await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });

    state.lastUpdated = new Date().toISOString();
    inMemoryState = state;
    lastR2FetchMs = Date.now();

    const stateString = JSON.stringify(state, null, 2);
    const itemsList = Array.isArray(state.items) ? state.items : Array.isArray(state.posts) ? state.posts : [];
    const canSafelyWriteR2 = r2StateVerified || itemsList.length > 0;

    const writeTask = async () => {
      if (createBackup && canSafelyWriteR2) {
        await backupState(state);
      }

      if (isR2Configured() && s3Client && canSafelyWriteR2) {
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: R2_CONFIG.bucketName,
              Key: R2_STORAGE_KEYS.STATE_FILE,
              Body: Buffer.from(stateString, 'utf-8'),
              CacheControl: 'no-cache, no-store, must-revalidate',
              ContentType: 'application/json; charset=utf-8',
            })
          );
          r2StateVerified = true;
        } catch (err: any) {
          console.warn('[stateManager] Failed to put state.json to R2:', err?.message || err);
        }

        const now = Date.now();
        if (now - lastCloudBackupMs >= CLOUD_BACKUP_MIN_INTERVAL_MS) {
          lastCloudBackupMs = now;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          s3Client
            .send(
              new PutObjectCommand({
                Bucket: R2_CONFIG.bucketName,
                Key: `${R2_STORAGE_KEYS.BACKUP_PREFIX}state-${timestamp}.json`,
                Body: Buffer.from(stateString, 'utf-8'),
                ContentType: 'application/json; charset=utf-8',
              })
            )
            .catch((err: any) => console.warn('[stateManager] Cloud backup throttled save failed:', err?.message || err));
        }
      } else if (!canSafelyWriteR2) {
        console.warn('[stateManager] Blocked R2 overwrite: Cold-start fallback state is empty and R2 state was not verified.');
      }

      try {
        await fs.writeFile(statePath, stateString, 'utf-8');
      } catch (err: any) {
        console.warn(`[stateManager] Local state write failed to ${statePath}:`, err?.message || err);
      }
    };

    activeWritePromise = activeWritePromise.then(writeTask, writeTask);
    await activeWritePromise;

    return stateString;
  }

