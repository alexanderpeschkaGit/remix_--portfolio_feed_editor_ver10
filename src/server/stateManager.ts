import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { normalizeState } from './mediaNormalization.ts';
import { assertStateAcceptable } from './statePublishing.ts';
import { BUNNY_CONFIG, DATA_BACKUPS_DIR, DATA_DIR, execAsync } from './serverContext.ts';

  export async function probeVideoDimensions(videoPathOrUrl: string): Promise<{ width: number; height: number } | null> {
    if (!videoPathOrUrl) return null;
    // blob: URLs are browser-only — ffprobe can't access them
    if (videoPathOrUrl.startsWith("blob:")) return null;
    let target = videoPathOrUrl;
    
    // Resolve HTTP URLs to local files if they match our patterns
    if (target.startsWith("http")) {
      try {
        const parsedUrl = new URL(target);
        // e.g. R2 public domain URLs point to data/ or v2/
        let pathname = decodeURIComponent(parsedUrl.pathname);
        if (pathname.startsWith("/data_v2/")) {
          const localPath = path.join(process.cwd(), pathname.replace(/^\/data_v2\//, 'data_v2/'));
          if (await fs.access(localPath).then(() => true).catch(() => false)) {
            target = localPath;
          }
        } else if (pathname.startsWith("/data/")) {
          const localPath = path.join(DATA_DIR, pathname.replace(/^\/data\//, ''));
          if (await fs.access(localPath).then(() => true).catch(() => false)) {
            target = localPath;
          }
        }
      } catch (err) {}
    } else if (target.startsWith("/")) {
      try {
        let pathname = decodeURIComponent(target);
        if (pathname.startsWith("/data_v2/")) {
          const localPath = path.join(process.cwd(), pathname.replace(/^\/data_v2\//, 'data_v2/'));
          if (await fs.access(localPath).then(() => true).catch(() => false)) {
            target = localPath;
          }
        } else if (pathname.startsWith("/data/")) {
          const localPath = path.join(DATA_DIR, pathname.replace(/^\/data\//, ''));
          if (await fs.access(localPath).then(() => true).catch(() => false)) {
            target = localPath;
          }
        }
      } catch (err) {}
    }

    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${target}"`
      );
      const dims = stdout.trim().split('x');
      if (dims.length === 2) {
        const width = parseInt(dims[0], 10);
        const height = parseInt(dims[1], 10);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
    } catch (err: any) {
      console.warn(`[Video Probe] Failed for ${videoPathOrUrl}:`, err.message || err);
    }
    return null;
  }

  export async function fetchBunnyVideoMetadata(libraryId: any, videoId: any): Promise<any | null> {
    if (!BUNNY_CONFIG.apiKey || !libraryId || !videoId) return null;
    try {
      const metaUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;
      const metaRes = await fetch(metaUrl, {
        headers: { "AccessKey": BUNNY_CONFIG.apiKey, "Accept": "application/json" }
      });
      if (!metaRes.ok) return null;
      return await metaRes.json();
    } catch (error: any) {
      console.warn(`[bunny] Metadata lookup failed for video ${videoId}:`, error.message || error);
      return null;
    }
  }

  export async function ensureStateVideoDimensions(state: any) {
    if (!state || !Array.isArray(state.items)) return;
    
    const isVideoUrl = (url?: string) => {
      if (!url) return false;
      return /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(url.split('?')[0]);
    };
    const isBunnyItem = (obj: any) => {
      const type = String(obj?.type || '').toLowerCase();
      return type === 'bunny' || (!!obj?.videoId && !!obj?.libraryId);
    };
    const resolveDims = async (obj: any) => {
      if (isBunnyItem(obj)) {
        const meta = await fetchBunnyVideoMetadata(obj.libraryId, obj.videoId);
        if (meta && Number(meta.width) > 0 && Number(meta.height) > 0) {
          return { width: Number(meta.width), height: Number(meta.height) };
        }
        return null;
      }
      const videoSrc = obj.video || obj.image || obj.url;
      return await probeVideoDimensions(videoSrc);
    };

    for (const item of state.items) {
      const itemType = String(item.type || '').toLowerCase();
      const isVideo = isBunnyItem(item) || itemType === 'video' || isVideoUrl(item.video) || isVideoUrl(item.image) || isVideoUrl(item.url);
      
      if (isVideo) {
        const currentW = item.image_width;
        const currentH = item.image_height;
        const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
        
        if (isFallback) {
          const dims = await resolveDims(item);
          if (dims) {
            item.image_width = dims.width;
            item.image_height = dims.height;
            console.log(`[Video Dimensions] Auto-corrected item ${item.id} to ${dims.width}x${dims.height}`);
          }
        }
      }

      if (Array.isArray(item.mergedMedia)) {
        for (let idx = 0; idx < item.mergedMedia.length; idx++) {
          const media = item.mergedMedia[idx];
          const mediaType = String(media.type || '').toLowerCase();
          const isMediaVideo = isBunnyItem(media) || mediaType === 'video' || isVideoUrl(media.video) || isVideoUrl(media.image) || isVideoUrl(media.url);
          
          if (isMediaVideo) {
            const currentW = media.image_width;
            const currentH = media.image_height;
            const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
            
            if (isFallback) {
              const dims = await resolveDims(media);
              if (dims) {
                media.image_width = dims.width;
                media.image_height = dims.height;
                console.log(`[Video Dimensions] Auto-corrected item ${item.id} media#${idx} to ${dims.width}x${dims.height}`);
              }
            }
          }
        }
      }
    }
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

  export async function backupState() {
    try {
      const statePath = path.join(DATA_DIR, 'state.json');
      const stats = await fs.stat(statePath).catch(() => null);
      if (stats) {
        const timestamp = localTimestamp();
        const backupPath = path.join(DATA_BACKUPS_DIR, `state_${timestamp}.json`);
        await fs.copyFile(statePath, backupPath);
        
        // Keep only last 50 data backups
        const files = await fs.readdir(DATA_BACKUPS_DIR);
        const backups = files.filter(f => f.startsWith('state_') && f.endsWith('.json')).sort().reverse();
        if (backups.length > 100) { // Increased to 100 for more safety
          for (const f of backups.slice(100)) {
            await fs.unlink(path.join(DATA_BACKUPS_DIR, f)).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("Backup failed:", e);
      throw e;
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
    await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });
    if (createBackup) await backupState();
    const stateString = JSON.stringify(state, null, 2);
    await fs.writeFile(statePath, stateString, 'utf-8');
    return stateString;
  }

