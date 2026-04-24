import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { imageHash } from "image-hash";
import sharp from "sharp";
import { spawn } from "child_process";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const upload = multer({ storage: multer.memoryStorage() });

  const DATA_DIR = path.join(process.cwd(), 'data');
  const BACKUPS_DIR = path.join(process.cwd(), 'backups');
  const DATA_BACKUPS_DIR = path.join(BACKUPS_DIR, 'data');
  const ORIGINALS_DIR = path.join(process.cwd(), 'originals');
  const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
  const UPLOADS_ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
  const UPLOADS_2K_DIR = path.join(UPLOADS_DIR, '2k');
  const UPLOADS_3K_DIR = path.join(UPLOADS_DIR, '3k');
  const UPLOADS_THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
  const SYNC_DIR = path.join(DATA_DIR, 'sync');
  const HIGHRES_DIR = path.join(DATA_DIR, 'highres');
  const PREVIEWS_DIR = path.join(DATA_DIR, 'previews');
  const SYNC_MANIFEST_KEY = '.sync-manifest.json';
  
  app.use('/data/preview.html', (req, res, next) => {
    res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://www.youtube.com https://s.ytimg.com;");
    next();
  });
  app.use('/data', express.static(DATA_DIR));
  app.use('/originals', express.static(ORIGINALS_DIR));
  app.use('/backups', express.static(BACKUPS_DIR));
  
  // Ensure directories exist
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(BACKUPS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(DATA_BACKUPS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(ORIGINALS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_ORIGINALS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_2K_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_3K_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_THUMBS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(SYNC_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(HIGHRES_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(PREVIEWS_DIR, { recursive: true }).catch(() => {});

  async function backupState() {
    try {
      const statePath = path.join(DATA_DIR, 'state.json');
      const stats = await fs.stat(statePath).catch(() => null);
      if (stats) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(DATA_BACKUPS_DIR, `state_${timestamp}.json`);
        await fs.copyFile(statePath, backupPath);
        
        // Keep only last 50 data backups
        const files = await fs.readdir(DATA_BACKUPS_DIR);
        const backups = files.filter(f => f.startsWith('state_') && f.endsWith('.json')).sort().reverse();
        if (backups.length > 50) {
          for (const f of backups.slice(50)) {
            await fs.unlink(path.join(DATA_BACKUPS_DIR, f)).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.error("Backup failed:", e);
    }
  }

  const extractPortfolioDataFromHtml = (html: string) => {
    const fullStateMatch = html.match(/<script id="editor-state-backup" type="application\/json">([\s\S]*?)<\/script>/);
    const publicMatch = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
    const match = fullStateMatch || publicMatch;
    
    if (!match || !match[1]) {
      throw new Error('Backup-Format ungültig: Script-Tag fehlt.');
    }
    return JSON.parse(match[1]);
  };

  const publishHtmlAndState = async (htmlContent: string, stateData: string) => {
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: 'index.html',
      Body: Buffer.from(htmlContent),
      ContentType: "text/html; charset=utf-8",
    }));

    await s3Client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: 'state.json',
      Body: Buffer.from(stateData),
      ContentType: "application/json; charset=utf-8",
    }));
  };

  async function getDeletedIds(): Promise<string[]> {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'deleted_ids.json'), 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  async function saveDeletedIds(ids: string[]) {
    await fs.writeFile(path.join(DATA_DIR, 'deleted_ids.json'), JSON.stringify(ids));
  }

  async function mergeScrapedData(source: string) {
    await backupState();
    
    const statePath = path.join(DATA_DIR, 'state.json');
    let state: any = { items: [] };
    try {
      const data = await fs.readFile(statePath, 'utf-8');
      state = JSON.parse(data);
    } catch (e) {}

    const deletedIds = await getDeletedIds();
    
    // Helper to check if an ID exists in state
    const existsInState = (id: string) => {
      for (const item of state.items) {
        if (item.id === id) return true;
        if (item.mergedMedia) {
          for (const m of item.mergedMedia) {
            if (m.id === id) return true;
          }
        }
      }
      return false;
    };

    let newItems = [];
    if (source === 'instagram' || source === 'combined') {
      try {
        const data = await fs.readFile(path.join(DATA_DIR, 'instagram', 'insta_data.json'), 'utf-8');
        const scraped = JSON.parse(data);
        for (const item of scraped) {
          const id = item.id;
          if (!existsInState(id) && !deletedIds.includes(id)) {
            newItems.push({
              id,
              type: item.media_list && item.media_list[0] && item.media_list[0].endsWith('.mp4') ? 'video' : 'image',
              source: 'instagram',
              title: item.title || '',
              description: item.description || '',
              image: item.image,
              mergedMedia: item.media_list ? item.media_list.map((url: string) => ({ type: url.endsWith('.mp4') ? 'video' : 'image', image: url, image_large: url, link: item.link })) : (item.image ? [{ type: 'image', image: item.image, image_large: item.image, link: item.link }] : []),
              url: item.link,
              date: item.timestamp || new Date().toISOString(),
              phash: item.phash
            });
          }
        }
      } catch (e) {}
    }

    if (source === 'flickr' || source === 'combined') {
      try {
        const data = await fs.readFile(path.join(DATA_DIR, 'flickr', 'flickr_data.json'), 'utf-8');
        const scraped = JSON.parse(data);
        for (const item of scraped) {
          const id = item.id;
          if (!existsInState(id) && !deletedIds.includes(id)) {
            newItems.push({
              id,
              type: 'image',
              source: 'flickr',
              title: item.title || '',
              description: item.description || item.desc || '',
              image: item.image || `/data/flickr/${item.img_1024}`,
              image_large: item.image_large || `/data/flickr/${item.img_3k}`,
              image_3k: item.image_large || `/data/flickr/${item.img_3k}`,
              mergedMedia: item.media_list ? item.media_list.map((url: string) => ({ type: 'image', image: url, image_large: item.image_large || url, image_3k: item.image_large || url, link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/` })) : [{ type: 'image', image: item.image || `/data/flickr/${item.img_1024}`, image_large: item.image_large || `/data/flickr/${item.img_3k}`, image_3k: item.image_large || `/data/flickr/${item.img_3k}`, link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/` }],
              url: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`,
              date: new Date().toISOString(),
              phash: item.phash
            });
          }
        }
      } catch (e) {}
    }

    if (source === 'flickr_html' || source === 'combined') {
      try {
        const dataPath = path.join(DATA_DIR, 'flickr_html', 'flickr_html_data.json');
        console.log(`[MERGE] Reading flickr_html data from ${dataPath}`);
        const data = await fs.readFile(dataPath, 'utf-8');
        const scraped = JSON.parse(data);
        console.log(`[MERGE] Found ${scraped.length} items in flickr_html_data.json`);
        
        let skippedExisting = 0;
        let skippedDeleted = 0;
        
        for (const item of scraped) {
          const id = item.id;
          if (existsInState(id)) {
            skippedExisting++;
            continue;
          }
          if (deletedIds.includes(id)) {
            skippedDeleted++;
            continue;
          }
          
          newItems.push({
            id,
            type: item.type || 'image',
            source: 'flickr_html',
            title: item.title || '',
            description: item.description || '',
            image: item.image || '',
            image_large: item.image_large || item.imageLarge || '',
            url: item.link || '',
            youtubeId: item.youtubeId || '',
            date: new Date().toISOString(),
            phash: ''
          });
        }
        console.log(`[MERGE] Added ${scraped.length - skippedExisting - skippedDeleted} new items. Skipped: ${skippedExisting} existing, ${skippedDeleted} deleted.`);
      } catch (e) {
        console.error(`[MERGE] Error processing flickr_html: ${e}`);
      }
    }

    if (newItems.length > 0) {
      state.items = [...newItems, ...state.items];
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));
      return newItems.length;
    }
    return 0;
  }

  // Helper for Hamming Distance
  function hammingDistance(h1: string, h2: string) {
    if (!h1 || !h2 || h1.length !== h2.length) return 999;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
      const b1 = parseInt(h1[i], 16).toString(2).padStart(4, '0');
      const b2 = parseInt(h2[i], 16).toString(2).padStart(4, '0');
      for (let j = 0; j < 4; j++) {
        if (b1[j] !== b2[j]) dist++;
      }
    }
    return dist;
  }

  const R2_CONFIG = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "9b109aa9587252172ccb60f664f603f0",
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || "0e11678f19a97c193c9a5647f7c4b37b",
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d",
    bucketName: process.env.CLOUDFLARE_BUCKET_NAME || "portfoliodata",
    publicDomain: process.env.CLOUDFLARE_PUBLIC_DOMAIN ? (process.env.CLOUDFLARE_PUBLIC_DOMAIN.startsWith('http') ? process.env.CLOUDFLARE_PUBLIC_DOMAIN : `https://${process.env.CLOUDFLARE_PUBLIC_DOMAIN}`) : "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev"
  };

  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
    forcePathStyle: false,
  });

  // Cloudflare Usage Tracking
  let usageStats = {
    classA: 0,
    classB: 0,
    storageBytes: 0,
    lastReset: new Date().toISOString()
  };

  async function loadUsage() {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'usage.json'), 'utf-8');
      usageStats = JSON.parse(data);
    } catch (e) {}
  }

  async function saveUsage() {
    try {
      await fs.writeFile(path.join(DATA_DIR, 'usage.json'), JSON.stringify(usageStats, null, 2));
    } catch (e) {}
  }

  async function syncStorageSize() {
    if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) return;
    try {
      let totalSize = 0;
      let isTruncated = true;
      let continuationToken = undefined;

      while (isTruncated) {
        const command: any = new ListObjectsV2Command({
          Bucket: R2_CONFIG.bucketName,
          ContinuationToken: continuationToken,
        });
        const response: any = await s3Client.send(command);
        
        if (response.Contents) {
          for (const obj of response.Contents) {
            totalSize += obj.Size || 0;
          }
        }
        
        isTruncated = response.IsTruncated;
        continuationToken = response.NextContinuationToken;
      }
      
      usageStats.storageBytes = totalSize;
      await saveUsage();
      console.log(`Synced storage size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    } catch (e) {
      console.error("Failed to sync storage size:", e);
    }
  }

  loadUsage().then(() => {
    syncStorageSize();
  });

  async function checkFileExistsOnR2(filename: string, localSize: number): Promise<boolean> {
    usageStats.classB++;
    saveUsage();
    if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) {
      return false;
    }

    try {
      const response = await s3Client.send(new HeadObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: filename,
      }));
      
      // If the file exists and the size is the same, we don't need to upload
      return response.ContentLength === localSize;
    } catch (e: any) {
      // If it's a 404, the file doesn't exist
      if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // For other errors, we assume it doesn't exist or we should try uploading anyway
      return false;
    }
  }

  async function uploadToR2(buffer: Buffer, filename: string, contentType: string) {
    usageStats.classA++;
    usageStats.storageBytes += buffer.length;
    saveUsage();
    if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) {
      throw new Error("Cloudflare credentials not configured.");
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: contentType,
    }));

    const baseUrl = R2_CONFIG.publicDomain || `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${cleanBaseUrl}/${filename.replace(/^\/+/, '')}`;
  }

  const getContentTypeForPath = (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') return 'application/json';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
  };

  const getBufferSha1 = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');

  const MEDIA_REFERENCE_FIELDS = [
    'image',
    'image_large',
    'image_3k',
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

  const isVideoR2Key = (key: string) => /\.(mp4|webm|mov)$/i.test(key);
  const isImageR2Key = (key: string) => /\.(jpg|jpeg|png|webp|gif|avif|bmp)$/i.test(key);

  // Keep video sibling images (e.g. *_thumb.jpg, *_poster.jpg) safe during cleanup.
  const toCanonicalMediaStem = (key: string) => {
    const basename = key.split('/').pop() || key;
    return basename
      .toLowerCase()
      .split('?')[0]
      .replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)$/i, '')
      .replace(/(?:[_-](thumb|thumbnail|poster|preview))$/i, '');
  };

  const loadSyncManifest = async () => {
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

  const saveSyncManifest = async (manifest: Record<string, any>) => {
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

  const updateSyncManifestEntries = async (entries: Array<{ r2Key: string; hash: string; size: number }>) => {
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

  const normalizePossibleR2Key = (value?: string) => {
    if (!value) return null;

    const fromPath = (pathname: string) => {
      const normalized = pathname.replace(/^\/+/, '');
      if (!normalized) return null;
      if (
        normalized.startsWith('data/') ||
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

  const localUrlToSyncTarget = (url?: string) => {
    if (!url) return null;
    const cleanUrl = url.split('?')[0];
    if (cleanUrl.startsWith('/data/')) {
      return {
        localPath: path.join(DATA_DIR, cleanUrl.replace('/data/', '')),
        r2Key: cleanUrl.replace(/^\/+/, '')
      };
    }
    if (cleanUrl.startsWith('/originals/')) {
      return {
        localPath: path.join(ORIGINALS_DIR, cleanUrl.replace('/originals/', '')),
        r2Key: cleanUrl.replace(/^\/+/, '')
      };
    }
    return null;
  };

  const collectReferencedSyncTargets = async () => {
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

  const collectReferencedR2Keys = async () => {
    const referencedKeys = new Set<string>();

    try {
      const stateData = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
      const state = JSON.parse(stateData);

      const visitMedia = (media: any) => {
        if (!media || typeof media !== 'object') return;
        for (const field of MEDIA_REFERENCE_FIELDS) {
          const key = normalizePossibleR2Key(media[field]);
          if (key) {
            referencedKeys.add(key);
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
    } catch (e) {
      console.error('Failed to collect referenced R2 keys:', e);
    }

    return referencedKeys;
  };

  const listR2ObjectsForPrefixes = async (prefixes: string[]) => {
    const objects: Array<{ key: string; size: number }> = [];

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
          objects.push({ key: obj.Key, size: obj.Size || 0 });
        }

        isTruncated = !!response.IsTruncated;
        continuationToken = response.NextContinuationToken;
      }
    }

    return objects;
  };

  const buildR2CleanupReport = async () => {
    const managedPrefixes = ['data/', 'uploads/', 'highres/', 'originals/'];
    const referencedKeys = await collectReferencedR2Keys();
    const r2Objects = await listR2ObjectsForPrefixes(managedPrefixes);
    const referencedVideoStems = new Set(
      Array.from(referencedKeys)
        .filter((key) => isVideoR2Key(key))
        .map((key) => toCanonicalMediaStem(key))
    );

    const orphaned = r2Objects.filter((obj) => {
      if (referencedKeys.has(obj.key)) return false;

      if (isImageR2Key(obj.key) && referencedVideoStems.has(toCanonicalMediaStem(obj.key))) {
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
      sampleKeys: orphaned.slice(0, 25).map(obj => obj.key)
    };
  };

  const buildLegacyUploadDuplicateReport = async () => {
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

  async function getRecursiveFiles(dir: string, baseDir: string): Promise<string[]> {
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const files = await Promise.all(dirents.map(async (dirent) => {
        const res = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          return getRecursiveFiles(res, baseDir);
        } else {
          return path.relative(baseDir, res).split(path.sep).join('/');
        }
      }));
      return files.flat();
    } catch (e: any) {
      console.error(`Error in getRecursiveFiles for ${dir}:`, e);
      return [];
    }
  }

  // API route to start high-res sync
  const syncStatus = { running: false, logs: [], done: false, error: null as string | null };
  app.post("/api/sync/highres", async (req, res) => {
    if (syncStatus.running) return res.json({ message: 'Sync already in progress', status: syncStatus });

    syncStatus.running = true;
    syncStatus.logs = ["Starte High-Res Sync (inkl. Unterordner)..."];
    syncStatus.done = false;
    syncStatus.error = null;

    res.json({ message: 'Sync started', status: syncStatus });

    (async () => {
      try {
        const statePath = path.join(DATA_DIR, 'state.json');
        const stateData = await fs.readFile(statePath, 'utf-8');
        const state = JSON.parse(stateData);
        const items = state.items || [];

        syncStatus.logs.push(`CWD: ${process.cwd()}`);
        syncStatus.logs.push(`Looking in: ${ORIGINALS_DIR}`);

        const allFiles = await getRecursiveFiles(ORIGINALS_DIR, ORIGINALS_DIR);
        syncStatus.logs.push(`Raw files found: ${JSON.stringify(allFiles)}`);

        const imageFiles = allFiles.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        
        syncStatus.logs.push(`Gefunden: ${imageFiles.length} lokale Originale.`);

        // 1. Ensure all items in state have a phash
        let stateChanged = false;
        for (const item of items) {
          if (!item.phash && item.image && item.type === 'image') {
            try {
              syncStatus.logs.push(`Generiere Hash für Item: ${item.title || item.id}...`);
              const imgRes = await fetch(item.image);
              if (imgRes.ok) {
                const buffer = await imgRes.buffer();
                const hash = await new Promise<string>((resolve, reject) => {
                  imageHash({ data: buffer }, 16, true, (error: any, data: string) => {
                    if (error) reject(error);
                    else resolve(data);
                  });
                });
                item.phash = hash;
                stateChanged = true;
              }
            } catch (e) {
              syncStatus.logs.push(`Fehler beim Hashen von Item ${item.id}: ${e}`);
            }
          }
        }

        if (stateChanged) {
          await fs.writeFile(statePath, JSON.stringify(state, null, 2));
          syncStatus.logs.push("state.json mit Hashes aktualisiert.");
        }

        const uncertainMatches: any[] = [];
        let matchesFound = 0;

        for (const file of imageFiles) {
          const filePath = path.join(ORIGINALS_DIR, file);
          const baseName = path.parse(file).name;
          syncStatus.logs.push(`Verarbeite: ${file}...`);

          // Generate pHash for local file
          const localHash: string = await new Promise((resolve, reject) => {
            imageHash(filePath, 16, true, (err: any, hash: string) => {
              if (err) reject(err);
              else resolve(hash);
            });
          });

          let bestMatch = null;
          let minDistance = 999;

          for (const item of items) {
            if (!item.phash) continue;
            const dist = hammingDistance(localHash, item.phash);
            if (dist < minDistance) {
              minDistance = dist;
              bestMatch = item;
            }
          }

          if (bestMatch && minDistance <= 5) {
            syncStatus.logs.push(`[MATCH] ${file} passt zu Post ${bestMatch.id} (Dist: ${minDistance})`);
            
            // Create 3K version locally
            const buffer3k = await sharp(filePath)
              .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toBuffer();
            
            const localFilename3k = `${baseName}_3k.jpg`;
            const localPath3k = path.join(HIGHRES_DIR, localFilename3k);
            await fs.writeFile(localPath3k, buffer3k);
            
            // Upload to R2
            const url3k = await uploadToR2(buffer3k, `highres/${localFilename3k}`, 'image/jpeg');
            
            bestMatch.image_3k = url3k;
            bestMatch.local_highres = `/data/highres/${localFilename3k}`;
            matchesFound++;
          } else if (bestMatch && minDistance <= 12) {
            syncStatus.logs.push(`[UNSICHER] ${file} ähnelt Post ${bestMatch.id} (Dist: ${minDistance})`);
            
            // Create 1024 preview locally
            const buffer1024 = await sharp(filePath)
              .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toBuffer();
            
            const localFilename1024 = `${baseName}_1024.jpg`;
            const localPath1024 = path.join(PREVIEWS_DIR, localFilename1024);
            await fs.writeFile(localPath1024, buffer1024);
            
            // Upload to R2 for comparison
            const url1024 = await uploadToR2(buffer1024, `previews/${localFilename1024}`, 'image/jpeg');

            uncertainMatches.push({
              postId: bestMatch.id,
              localFile: file,
              previewUrl: url1024,
              distance: minDistance,
              originalPath: filePath,
              baseName: baseName
            });
          } else if (bestMatch) {
            syncStatus.logs.push(`[KEIN MATCH] ${file} - Beste Übereinstimmung: "${bestMatch.title}" (Dist: ${minDistance})`);
          }
        }

        if (matchesFound > 0) {
          await backupState();
          await fs.writeFile(statePath, JSON.stringify(state, null, 2));
          syncStatus.logs.push(`${matchesFound} High-Res Bilder automatisch verknüpft.`);
        } else if (uncertainMatches.length === 0) {
          syncStatus.logs.push(`Keine automatischen Übereinstimmungen für die ${imageFiles.length} Dateien gefunden.`);
        }

        if (uncertainMatches.length > 0) {
          await fs.writeFile(path.join(SYNC_DIR, 'uncertain_matches.json'), JSON.stringify(uncertainMatches, null, 2));
          syncStatus.logs.push(`${uncertainMatches.length} unsichere Treffer zur Überprüfung gespeichert.`);
        }

        syncStatus.done = true;
        syncStatus.running = false;
        syncStatus.logs.push("High-Res Sync abgeschlossen.");

      } catch (err: any) {
        syncStatus.running = false;
        syncStatus.error = err.message;
        syncStatus.logs.push(`[FEHLER] ${err.message}`);
      }
    })();
  });

  app.get("/api/sync/status", (req, res) => {
    res.json(syncStatus);
  });

  // API route to reset R2 and rebuild it from current local data
  app.post("/api/reset-all", async (req, res) => {
    try {
      const { confirm } = req.body || {};
      if (confirm !== 'YES') return res.status(400).json({ error: 'confirm=YES required' });

      // 1) Wipe complete R2 bucket content
      let deletedCount = 0;
      let isTruncated = true;
      let continuationToken: string | undefined = undefined;

      while (isTruncated) {
        const response: any = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: R2_CONFIG.bucketName,
            ContinuationToken: continuationToken,
          })
        );

        const keys: string[] = (response.Contents || [])
          .map((obj: any) => obj.Key)
          .filter((k: any) => typeof k === 'string');

        if (keys.length > 0) {
          // DeleteObjects supports up to 1000 keys per request
          const chunkSize = 1000;
          for (let i = 0; i < keys.length; i += chunkSize) {
            const chunk = keys.slice(i, i + chunkSize);
            await s3Client.send(
              new DeleteObjectsCommand({
                Bucket: R2_CONFIG.bucketName,
                Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
              })
            );
            deletedCount += chunk.length;
          }
        }

        isTruncated = !!response.IsTruncated;
        continuationToken = response.NextContinuationToken;
      }

      // 2) Mirror local media files back to R2
      let allImageFiles = await collectReferencedSyncTargets();
      if (allImageFiles.length === 0) {
        const subDirs = ['uploads', 'flickr', 'instagram', 'highres', 'previews'];
        for (const sub of subDirs) {
          const subDirPath = path.join(DATA_DIR, sub);
          if (await fs.access(subDirPath).then(() => true).catch(() => false)) {
            const files = await getRecursiveFiles(subDirPath, subDirPath);
            const mediaFiles = files.filter(f => /\.(jpg|jpeg|png|webp|json|mp4|webm|mov)$/i.test(f)).map(f => ({
              localPath: path.join(subDirPath, f),
              r2Key: `data/${sub}/${f}`
            }));
            allImageFiles = [...allImageFiles, ...mediaFiles];
          }
        }
      }

      const dedupTargets = new Map<string, { localPath: string; r2Key: string }>();
      for (const target of allImageFiles) dedupTargets.set(target.r2Key, target);
      const uploadTargets = Array.from(dedupTargets.values());

      const newManifest: Record<string, any> = {};
      for (const target of uploadTargets) {
        const buffer = await fs.readFile(target.localPath);
        await uploadToR2(buffer, target.r2Key, getContentTypeForPath(target.localPath));
        newManifest[target.r2Key] = {
          hash: getBufferSha1(buffer),
          size: buffer.length,
          syncedAt: new Date().toISOString()
        };
      }
      await saveSyncManifest(newManifest);

      // 3) Republish state.json and, if available, index.html
      const statePath = path.join(DATA_DIR, 'state.json');
      const stateData = await fs.readFile(statePath, 'utf-8').catch(() => JSON.stringify({ items: [] }, null, 2));

      let htmlContent: string | null = null;
      const previewPath = path.join(DATA_DIR, 'preview.html');
      htmlContent = await fs.readFile(previewPath, 'utf-8').catch(() => null);

      if (!htmlContent) {
        const backupFiles = await fs.readdir(BACKUPS_DIR).catch(() => []);
        const latestBackup = backupFiles
          .filter(f => f.endsWith('.html'))
          .sort()
          .reverse()[0];

        if (latestBackup) {
          htmlContent = await fs.readFile(path.join(BACKUPS_DIR, latestBackup), 'utf-8').catch(() => null);
        }
      }

      let republishedHtml = false;
      if (htmlContent) {
        await publishHtmlAndState(htmlContent, stateData);
        republishedHtml = true;
      } else {
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: 'state.json',
          Body: Buffer.from(stateData),
          ContentType: "application/json; charset=utf-8",
        }));
      }

      await syncStorageSize();
      res.json({
        success: true,
        deletedR2Objects: deletedCount,
        uploadedFiles: uploadTargets.length,
        republishedHtml
      });
    } catch (e: any) {
      console.error("Reset failed:", e);
      res.status(500).json({ error: 'Reset failed', details: e?.message || String(e) });
    }
  });

  app.get("/api/sync/uncertain", async (req, res) => {
    try {
      const data = await fs.readFile(path.join(SYNC_DIR, 'uncertain_matches.json'), 'utf-8');
      res.json(JSON.parse(data));
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/sync/confirm", async (req, res) => {
    const { postId, originalPath, baseName } = req.body;
    try {
      const statePath = path.join(DATA_DIR, 'state.json');
      const stateData = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateData);
      
      const item = state.items.find((i: any) => i.id === postId);
      if (item) {
        // Create 3K version locally
        const buffer3k = await sharp(originalPath)
          .resize(3000, 3000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
        
        const localFilename3k = `${baseName || item.id}_3k.jpg`;
        const localPath3k = path.join(HIGHRES_DIR, localFilename3k);
        await fs.writeFile(localPath3k, buffer3k);
        
        // Upload to R2
        const url3k = await uploadToR2(buffer3k, `highres/${localFilename3k}`, 'image/jpeg');
        
        item.image_3k = url3k;
        item.local_highres = `/data/highres/${localFilename3k}`;
        
        await backupState();
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
        
        // Remove from uncertain matches
        const uncertainPath = path.join(SYNC_DIR, 'uncertain_matches.json');
        try {
          const uncertainData = await fs.readFile(uncertainPath, 'utf-8');
          let uncertain = JSON.parse(uncertainData);
          uncertain = uncertain.filter((u: any) => u.postId !== postId);
          await fs.writeFile(uncertainPath, JSON.stringify(uncertain, null, 2));
        } catch (e) {}
        
        res.json({ success: true, url: url3k });
      } else {
        res.status(404).json({ error: 'Post not found' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/sync/reject", async (req, res) => {
    const { postId } = req.body;
    try {
      const uncertainPath = path.join(SYNC_DIR, 'uncertain_matches.json');
      const uncertainData = await fs.readFile(uncertainPath, 'utf-8');
      let uncertain = JSON.parse(uncertainData);
      uncertain = uncertain.filter((u: any) => u.postId !== postId);
      await fs.writeFile(uncertainPath, JSON.stringify(uncertain, null, 2));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API route for full R2 sync (mirrors all local data to Cloudflare)
  const fullR2SyncStatus = { running: false, logs: [] as string[], done: false, error: null as string | null, progress: 0, total: 0 };
  
  app.post("/api/sync/r2-full", async (req, res) => {
    if (fullR2SyncStatus.running) return res.json({ message: 'Sync already in progress', status: fullR2SyncStatus });

    fullR2SyncStatus.running = true;
    fullR2SyncStatus.logs = ["Starte inkrementellen Cloudflare R2 Sync..."];
    fullR2SyncStatus.done = false;
    fullR2SyncStatus.error = null;
    fullR2SyncStatus.progress = 0;
    fullR2SyncStatus.total = 0;

    res.json({ message: 'Full sync started', status: fullR2SyncStatus });

    (async () => {
      try {
        // Load existing sync manifest
        const manifest = await loadSyncManifest();
        let uploaded = 0;
        let skipped = 0;

        let allImageFiles = await collectReferencedSyncTargets();

        if (allImageFiles.length === 0) {
          fullR2SyncStatus.logs.push("Keine referenzierten Dateien in state.json gefunden. Fallback auf Verzeichnis-Scan...");
          const subDirs = ['uploads', 'flickr', 'instagram', 'highres', 'previews'];
          for (const sub of subDirs) {
            const subDirPath = path.join(DATA_DIR, sub);
            if (await fs.access(subDirPath).then(() => true).catch(() => false)) {
              const files = await getRecursiveFiles(subDirPath, subDirPath);
              const images = files.filter(f => /\.(jpg|jpeg|png|webp|json|mp4|webm|mov)$/i.test(f)).map(f => ({
                localPath: path.join(subDirPath, f),
                r2Key: `data/${sub}/${f}`
              }));
              allImageFiles = [...allImageFiles, ...images];
            }
          }
        }

        fullR2SyncStatus.total = allImageFiles.length;
        fullR2SyncStatus.logs.push(`Gefunden: ${allImageFiles.length} Dateien. Überprüfe auf Änderungen...`);

        for (let i = 0; i < allImageFiles.length; i++) {
          const file = allImageFiles[i];
          try {
            const buffer = await fs.readFile(file.localPath);
            const localHash = getBufferSha1(buffer);
            const localSize = buffer.length;

            const manifestEntry = manifest[file.r2Key];
            if (manifestEntry && manifestEntry.hash === localHash && manifestEntry.size === localSize) {
              skipped++;
              fullR2SyncStatus.progress = i + 1;
              if ((i + 1) % 20 === 0 || i === allImageFiles.length - 1) {
                fullR2SyncStatus.logs.push(`[SKIPPED] ${i + 1}/${allImageFiles.length} - ${file.r2Key} ist aktuell.`);
              }
              continue;
            }

            await uploadToR2(buffer, file.r2Key, getContentTypeForPath(file.localPath));

            manifest[file.r2Key] = {
              hash: localHash,
              size: localSize,
              syncedAt: new Date().toISOString()
            };
            
            uploaded++;
            fullR2SyncStatus.progress = i + 1;
            if ((i + 1) % 10 === 0 || i === allImageFiles.length - 1) {
              fullR2SyncStatus.logs.push(`[UPLOAD] ${i + 1}/${allImageFiles.length} - ${file.r2Key} hochgeladen.`);
            }
          } catch (e: any) {
            fullR2SyncStatus.logs.push(`[FEHLER] Konnte ${file.r2Key} nicht verarbeiten: ${e.message}`);
          }
        }

        // Save updated manifest
        await saveSyncManifest(manifest);

        fullR2SyncStatus.done = true;
        fullR2SyncStatus.running = false;
        fullR2SyncStatus.logs.push(`Sync abgeschlossen: ${uploaded} hochgeladen, ${skipped} übersprungen.`);
      } catch (err: any) {
        fullR2SyncStatus.running = false;
        fullR2SyncStatus.error = err.message;
        fullR2SyncStatus.logs.push(`[KRITISCHER FEHLER] ${err.message}`);
      }
    })();
  });

  app.get("/api/sync/r2-full/status", (req, res) => {
    res.json(fullR2SyncStatus);
  });

  // API route to get saved state
  app.get("/api/state", async (req, res) => {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
      res.json(JSON.parse(data));
    } catch (e) {
      res.json({ items: [] });
    }
  });

  // API route to proxy R2 state.json (bypasses CORS)
  app.get("/api/r2-state", async (req, res) => {
    try {
      const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
      const timestamp = Date.now();
      
      // First try to fetch the SSOT (state.json) directly with a cache buster
      try {
        const r2Url = `${baseUrl}/state.json?t=${timestamp}`;
        const response = await fetch(r2Url);
        if (response.ok) {
          const data = await response.json();
          return res.json(data);
        }
      } catch (e) {
        console.log("Failed to fetch state.json directly, falling back to index.html embedded state.");
      }
      
      // Fallback: extract the embedded state from index.html (legacy / fallback)
      const r2HtmlUrl = `${baseUrl}/index.html?t=${timestamp}`;
      const htmlResponse = await fetch(r2HtmlUrl);
      
      if (htmlResponse.ok) {
        const htmlText = await htmlResponse.text();
        const match = htmlText.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
        if (match && match[1]) {
          const data = JSON.parse(match[1]);
          return res.json(data);
        }
      }

      throw new Error("R2 fetch failed for both state.json and index.html");
    } catch (e) {
      console.error("Failed to fetch R2 state:", e);
      res.status(500).json({ error: 'Failed to fetch R2 state' });
    }
  });

  // API route to preview the generated HTML
  app.post("/api/preview", async (req, res) => {
    try {
      const { htmlContent } = req.body;
      if (!htmlContent) return res.status(400).json({ error: 'HTML content required' });
      
      await fs.writeFile(path.join(DATA_DIR, 'preview.html'), htmlContent);
      res.json({ success: true, url: '/data/preview.html' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save preview' });
    }
  });

  // API route to save state
  app.post("/api/state", async (req, res) => {
    try {
      await backupState();
      await fs.writeFile(path.join(DATA_DIR, 'state.json'), JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save state' });
    }
  });

  // API route to update a single item (used by rendering script AI)
  app.post("/api/item/update", async (req, res) => {
    try {
      const { id, title, description, states } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });

      const statePath = path.join(DATA_DIR, 'state.json');
      const stateData = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateData);

      const itemIndex = state.items.findIndex((item: any) => String(item.id) === String(id));
      if (itemIndex === -1) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Update fields if provided
      if (title !== undefined) state.items[itemIndex].title = title;
      if (description !== undefined) state.items[itemIndex].description = description;
      if (states !== undefined) state.items[itemIndex].states = states;
      
      // Update the lastUpdated timestamp so the frontend can detect the change
      state.lastUpdated = new Date().toISOString();

      await backupState();
      const stateString = JSON.stringify(state, null, 2);
      await fs.writeFile(statePath, stateString);
      
      // Push the updated state to Cloudflare R2 so the polling detects it
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'state.json',
        Body: Buffer.from(stateString),
        ContentType: 'application/json'
      }));
      
      res.json({ success: true, item: state.items[itemIndex] });
    } catch (e: any) {
      console.error("Failed to update item:", e);
      res.status(500).json({ error: 'Failed to update item', details: e.message });
    }
  });

  // API route to delete a post (adds to blacklist)
  app.post("/api/state/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      
      const deletedIds = await getDeletedIds();
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        await saveDeletedIds(deletedIds);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to blacklist ID' });
    }
  });

  // API route to bulk delete posts (removes from state, deletes files, adds to blacklist)
  app.post("/api/state/bulk-delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Array of IDs required' });
      const normalizedIds = ids.map((id: any) => String(id));
      const idsSet = new Set(normalizedIds);
      
      // 1. Add to deleted_ids.json
      const deletedIds = await getDeletedIds();
      let addedToBlacklist = false;
      for (const id of normalizedIds) {
        if (!deletedIds.includes(id)) {
          deletedIds.push(id);
          addedToBlacklist = true;
        }
      }
      if (addedToBlacklist) {
        await saveDeletedIds(deletedIds);
      }

      // 2. Read state.json
      const statePath = path.join(DATA_DIR, 'state.json');
      let state: any = { items: [] };
      try {
        const data = await fs.readFile(statePath, 'utf-8');
        state = JSON.parse(data);
      } catch (e) {}

      // 3. Find items to delete and extract their file paths
      const itemsToDelete = state.items.filter((item: any) => idsSet.has(String(item.id)));
      
      const filesToDelete: string[] = [];
      const extractPath = (url: string) => {
        if (!url) return null;
        // Remove query parameters
        const cleanUrl = url.split('?')[0];
        if (cleanUrl.startsWith('/data/')) {
          return path.join(DATA_DIR, cleanUrl.replace('/data/', ''));
        } else if (cleanUrl.startsWith('/originals/')) {
          return path.join(ORIGINALS_DIR, cleanUrl.replace('/originals/', ''));
        }
        return null;
      };

      for (const item of itemsToDelete) {
        [item.image, item.image_large, item.image_3k].forEach(url => {
          const p = extractPath(url);
          if (p) filesToDelete.push(p);
        });
        
        if (item.mergedMedia) {
          for (const media of item.mergedMedia) {
            [media.image, media.image_large, media.image_3k].forEach((url: string) => {
              const p = extractPath(url);
              if (p) filesToDelete.push(p);
            });
          }
        }
      }

      // 4. Delete files from local disk
      const uniqueFiles = [...new Set(filesToDelete)];
      for (const file of uniqueFiles) {
        try {
          await fs.unlink(file);
          console.log(`Deleted file: ${file}`);
        } catch (err) {
          // Ignore if file doesn't exist
        }
      }

      // 5. Remove items from state.json and save
      state.items = state.items.filter((item: any) => !idsSet.has(String(item.id)));
      await backupState();
      await fs.writeFile(statePath, JSON.stringify(state, null, 2));

      res.json({ success: true, deletedCount: itemsToDelete.length, filesDeleted: uniqueFiles.length });
    } catch (e) {
      console.error("Bulk delete error:", e);
      res.status(500).json({ error: 'Failed to bulk delete items' });
    }
  });

  // API route to list backups
  app.get("/api/backups", async (req, res) => {
    try {
      const files = await fs.readdir(BACKUPS_DIR);
      const htmlFiles = files.filter(f => f.endsWith('.html')).sort().reverse();
      res.json({ files: htmlFiles });
    } catch (e) {
      res.json({ files: [] });
    }
  });

  // API route to download a backup
  app.get("/api/backups/:filename", async (req, res) => {
    try {
      const filepath = path.join(BACKUPS_DIR, req.params.filename);
      res.download(filepath);
    } catch (e) {
      res.status(404).json({ error: 'Backup not found' });
    }
  });

  app.post("/api/backups/restore-latest-publish", async (req, res) => {
    try {
      const files = await fs.readdir(BACKUPS_DIR);
      const htmlFiles = files.filter(f => f.endsWith('.html')).sort().reverse();
      const latestBackup = htmlFiles[0];

      if (!latestBackup) {
        return res.status(404).json({ error: 'Kein HTML-Backup gefunden' });
      }

      const backupPath = path.join(BACKUPS_DIR, latestBackup);
      const htmlContent = await fs.readFile(backupPath, 'utf-8');
      const portfolioData = extractPortfolioDataFromHtml(htmlContent);
      const stateData = JSON.stringify({
        items: portfolioData.items || portfolioData.posts || [],
        title: portfolioData.title || 'ProjectionArt',
        subtitle: portfolioData.subtitle || '',
        bio: portfolioData.bio || '',
        projectStates: portfolioData.projectStates || [],
        publicDomain: portfolioData.publicDomain || '',
        lastUpdated: new Date().toISOString()
      }, null, 2);

      await publishHtmlAndState(htmlContent, stateData);

      const statePath = path.join(DATA_DIR, 'state.json');
      await backupState();
      await fs.writeFile(statePath, stateData);

      const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      res.json({
        success: true,
        restoredBackup: latestBackup,
        url: `${cleanBaseUrl}/index.html`
      });
    } catch (error: any) {
      console.error("Error restoring latest published backup:", error);
      res.status(500).json({ error: error.message || 'Restore fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/preview", async (req, res) => {
    try {
      const report = await buildR2CleanupReport();
      res.json({ success: true, ...report });
    } catch (error: any) {
      console.error("Error generating R2 cleanup preview:", error);
      res.status(500).json({ error: error.message || 'Cleanup-Vorschau fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/execute", async (req, res) => {
    try {
      const report = await buildR2CleanupReport();

      if (report.orphanedCount === 0) {
        return res.json({
          success: true,
          deletedCount: 0,
          deletedBytes: 0,
          message: 'Keine verwaisten R2-Dateien gefunden.'
        });
      }

      const batches: Array<Array<{ Key: string }>> = [];
      for (let i = 0; i < report.orphaned.length; i += 1000) {
        batches.push(report.orphaned.slice(i, i + 1000).map(obj => ({ Key: obj.key })));
      }

      for (const batch of batches) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: R2_CONFIG.bucketName,
          Delete: {
            Objects: batch,
            Quiet: true
          }
        }));
      }

      const manifest = await loadSyncManifest();
      for (const obj of report.orphaned) {
        delete manifest[obj.key];
      }
      await saveSyncManifest(manifest);
      await syncStorageSize();

      res.json({
        success: true,
        deletedCount: report.orphanedCount,
        deletedBytes: report.totalBytes,
        sampleKeys: report.sampleKeys
      });
    } catch (error: any) {
      console.error("Error executing R2 cleanup:", error);
      res.status(500).json({ error: error.message || 'Cleanup fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/preview-legacy-uploads", async (req, res) => {
    try {
      const report = await buildLegacyUploadDuplicateReport();
      res.json({ success: true, ...report });
    } catch (error: any) {
      console.error("Error generating legacy duplicate preview:", error);
      res.status(500).json({ error: error.message || 'Legacy-Duplikat-Vorschau fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/execute-legacy-uploads", async (req, res) => {
    try {
      const report = await buildLegacyUploadDuplicateReport();

      if (report.duplicateCount === 0) {
        return res.json({
          success: true,
          deletedCount: 0,
          deletedBytes: 0,
          message: 'Keine Legacy-Duplikate gefunden.'
        });
      }

      const batches: Array<Array<{ Key: string }>> = [];
      for (let i = 0; i < report.duplicates.length; i += 1000) {
        batches.push(report.duplicates.slice(i, i + 1000).map(obj => ({ Key: obj.key })));
      }

      for (const batch of batches) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: R2_CONFIG.bucketName,
          Delete: {
            Objects: batch,
            Quiet: true
          }
        }));
      }

      const manifest = await loadSyncManifest();
      for (const obj of report.duplicates) {
        delete manifest[obj.key];
      }
      await saveSyncManifest(manifest);
      await syncStorageSize();

      res.json({
        success: true,
        deletedCount: report.duplicateCount,
        deletedBytes: report.totalBytes,
        sampleKeys: report.sampleKeys
      });
    } catch (error: any) {
      console.error("Error deleting legacy duplicates:", error);
      res.status(500).json({ error: error.message || 'Legacy-Duplikat-Cleanup fehlgeschlagen' });
    }
  });

  const scrapeStatus: Record<string, { running: boolean, logs: string[], done: boolean, error: string | null }> = {
    instagram: { running: false, logs: [], done: false, error: null },
    flickr: { running: false, logs: [], done: false, error: null },
    flickr_html: { running: false, logs: [], done: false, error: null },
    combined: { running: false, logs: [], done: false, error: null }
  };

  // API route to start scraping
  app.post("/api/scrape/start", async (req, res) => {
    const { source } = req.body;
    if (!source || !['instagram', 'flickr', 'flickr_html', 'combined'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source' });
    }

    if (scrapeStatus[source].running) {
      return res.json({ message: 'Scrape already in progress', status: scrapeStatus[source] });
    }

    let scriptPath = path.join(process.cwd(), 'scrape_combined.py');
    if (source === 'flickr_html') {
      scriptPath = path.join(process.cwd(), 'scrape_flickr_html.py');
    }
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
    
    scrapeStatus[source] = { running: true, logs: [`Starte ${source} Scraper...`, `Running: ${pythonCmd} ${path.basename(scriptPath)} ${source}`], done: false, error: null };

    try {
      // Check if script exists
      try {
        await fs.access(scriptPath);
      } catch (e) {
        throw new Error(`Python script not found: ${scriptPath}`);
      }

      // Read state to get scrape config
      let igAccount = "vijay_sikanda";
      let flickrUrl = "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/";
      try {
        const stateData = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8'));
        if (stateData.scrapeConfig) {
          if (stateData.scrapeConfig.igAccount) igAccount = stateData.scrapeConfig.igAccount;
          if (stateData.scrapeConfig.flickrUrl) flickrUrl = stateData.scrapeConfig.flickrUrl;
        }
      } catch (e) {
        console.log("Could not read state.json for scrape config, using defaults.");
      }

      scrapeStatus[source].logs.push(`Instagram Target: ${igAccount}`);
      scrapeStatus[source].logs.push(`Flickr Target: ${flickrUrl}`);

      console.log(`[SCRAPE] Starting ${source} with command: ${pythonCmd} ${scriptPath}`);

      const py = spawn(pythonCmd, [scriptPath, source, igAccount, flickrUrl], {
        shell: os.platform() === 'win32'
      });

      py.on('error', (err: any) => {
        console.error(`[SCRAPE] Failed to start ${source} process:`, err);
        scrapeStatus[source].running = false;
        scrapeStatus[source].error = `Failed to start process: ${err.message}`;
        scrapeStatus[source].logs.push(`[ERROR] Failed to start process: ${err.message}`);
        if (os.platform() === 'win32') {
          scrapeStatus[source].logs.push(`[TIP] Ensure 'python' is in your PATH. You might need to use 'python3' or 'py' instead.`);
        }
      });

      py.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        scrapeStatus[source].logs.push(...lines);
        if (scrapeStatus[source].logs.length > 500) scrapeStatus[source].logs.shift();
      });

      py.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        scrapeStatus[source].logs.push(`[ERROR] ${lines.join(' ')}`);
      });

      py.on('close', async (code: number) => {
        scrapeStatus[source].running = false;
        scrapeStatus[source].done = true;
        if (code !== 0) {
          scrapeStatus[source].error = `Prozess beendet mit Code ${code}`;
          scrapeStatus[source].logs.push(`Scraping fehlgeschlagen (Code ${code}).`);
        } else {
          scrapeStatus[source].logs.push('Scraping erfolgreich beendet. Starte Smart Merge...');
          const addedCount = await mergeScrapedData(source);
          scrapeStatus[source].logs.push(`Smart Merge abgeschlossen. ${addedCount} neue Elemente hinzugefügt.`);
        }
      });

      res.json({ message: 'Scrape started', status: scrapeStatus[source] });
    } catch (err: any) {
      scrapeStatus[source].running = false;
      scrapeStatus[source].error = err.message;
      res.status(500).json({ error: 'Failed to start scraper', details: err.message });
    }
  });

  // API route to check scraping status
  app.get("/api/scrape/status/:source", (req, res) => {
    const { source } = req.params;
    if (!source || !scrapeStatus[source]) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json(scrapeStatus[source]);
  });

  // API route to get scraped data from local JSON files
  app.get("/api/scraped-data", async (req, res) => {
    try {
      const instagramDataPath = path.join(DATA_DIR, 'instagram', 'insta_data.json');
      const flickrDataPath = path.join(DATA_DIR, 'flickr', 'flickr_data.json');
      
      let instagramItems = [];
      let flickrItems = [];
      
      try {
        const data = await fs.readFile(instagramDataPath, 'utf-8');
        instagramItems = JSON.parse(data);
      } catch (e) {}
      
      try {
        const data = await fs.readFile(flickrDataPath, 'utf-8');
        flickrItems = JSON.parse(data);
      } catch (e) {}
      
      res.json({ instagram: instagramItems, flickr: flickrItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to load scraped data" });
    }
  });

  // API route to simulate scraping and stream logs (Legacy/Simulation)
  app.get("/api/scrape", (req, res) => {
    const source = req.query.source as string || 'unbekannt';
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Here you would normally spawn a python script like:
    // const { spawn } = require('child_process');
    // const py = spawn('python3', ['scraper.py', source]);
    // py.stdout.on('data', data => res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`));
    // py.on('close', () => res.write(`data: ${JSON.stringify({ done: true })}\n\n`));

    // Simulation for now:
    let step = 0;
    const steps = [
      `Starte Python Scraper für ${source}...`,
      `Verbinde mit ${source} API...`,
      `Lade neueste Beiträge herunter...`,
      `Verarbeite Bilder und Metadaten...`,
      `Speichere Daten lokal...`,
      `Scraping erfolgreich beendet.`
    ];

    const interval = setInterval(() => {
      if (step < steps.length) {
        res.write(`data: ${JSON.stringify({ log: steps[step] })}\n\n`);
        step++;
      } else {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 1500);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // API route to fetch Flickr album
  app.get("/api/flickr", async (req, res) => {
    const albumUrl = req.query.url as string || "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/";
    
    try {
      const response = await fetch(albumUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      let allPhotos: any[] = [];
      
      // Try to parse modelExport which contains all the data including titles and descriptions
      const modelExportMatch = html.match(/modelExport:\s*({.*}),\n/);
      if (modelExportMatch) {
        try {
          const data = JSON.parse(modelExportMatch[1]);
          
          const findPhotos = (obj: any): void => {
            if (!obj || typeof obj !== 'object') return;
            
            if (Array.isArray(obj)) {
              obj.forEach(item => findPhotos(item));
            } else {
              // Look for photo objects (they have _flickrModelRegistry: 'photo-models' or just id, title, description, secret)
              if (obj.id && obj.title !== undefined && obj.secret && obj.sizes && obj.sizes.data) {
                // We found a photo object!
                allPhotos.push(obj);
              }
              for (const key in obj) {
                findPhotos(obj[key]);
              }
            }
          };
          
          findPhotos(data);
          
          // Deduplicate photos by ID
          const uniquePhotos = new Map();
          for (const photo of allPhotos) {
            if (!uniquePhotos.has(photo.id)) {
              uniquePhotos.set(photo.id, photo);
            }
          }
          allPhotos = Array.from(uniquePhotos.values());
          
        } catch (e) {
          console.error("Failed to parse modelExport:", e);
        }
      }
      
      // If modelExport failed or didn't find anything, fallback to API key approach
      if (allPhotos.length === 0) {
        const apiKeyMatch = html.match(/"api_key":"([^"]+)"/) || html.match(/site_key"\s*:\s*"([^"]+)"/);
        const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
        
        if (apiKey) {
          // Extract user_id and photoset_id from URL
          const urlParts = albumUrl.split('/');
          const userId = urlParts[4];
          const photosetId = urlParts[6];
          
          if (userId && photosetId) {
            // Fetch all pages using Flickr API
            let page = 1;
            let pages = 1;
            
            while (page <= pages) {
              const apiUrl = `https://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key=${apiKey}&photoset_id=${photosetId}&user_id=${userId}&format=json&nojsoncallback=1&page=${page}&per_page=500&extras=description,url_m,url_b,url_k,url_3k,url_4k,url_o`;
              const apiRes = await fetch(apiUrl);
              const apiData = await apiRes.json() as any;
              
              if (apiData.stat === 'ok' && apiData.photoset) {
                allPhotos = allPhotos.concat(apiData.photoset.photo);
                pages = apiData.photoset.pages;
                page++;
              } else {
                break;
              }
            }
          }
        }
      }
      
      // Format to match the structure the user wants in their TS snippet
      const items = allPhotos.map(photo => {
        // If we got it from modelExport, the sizes are in photo.sizes.data
        let mUrl = '';
        let bUrl = '';
        let bestUrl = '';
        
        if (photo.sizes && photo.sizes.data) {
          // modelExport format
          const sizes = photo.sizes.data;
          
          // Extract URLs from the nested structure
          const getUrl = (sizeObj: any) => {
            if (!sizeObj) return '';
            let url = '';
            if (typeof sizeObj.url === 'string') url = sizeObj.url;
            else if (sizeObj.data && typeof sizeObj.data.url === 'string') url = sizeObj.data.url;
            
            if (url && url.startsWith('//')) {
              url = 'https:' + url;
            }
            return url;
          };
          
          mUrl = getUrl(sizes.m) || getUrl(sizes.z) || getUrl(sizes.c) || '';
          bUrl = getUrl(sizes.b) || getUrl(sizes.l) || getUrl(sizes.c) || mUrl;
          // Try original, then 6k, 5k, 4k, 3k, 2k(k), h, l, b
          bestUrl = getUrl(sizes.o) || getUrl(sizes.k6) || getUrl(sizes.k5) || getUrl(sizes.k4) || getUrl(sizes.k3) || getUrl(sizes.k) || getUrl(sizes.h) || getUrl(sizes.l) || getUrl(sizes.b) || bUrl;
        } else if (photo.url_m) {
          // API format
          mUrl = photo.url_m;
          bUrl = photo.url_b || mUrl.replace('_m.jpg', '_b.jpg');
          bestUrl = photo.url_o || photo.url_4k || photo.url_3k || photo.url_k || bUrl.replace('_b.jpg', '_k.jpg');
        } else if (photo.server && photo.secret) {
          // Fallback format
          mUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`;
          bUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
          bestUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_k.jpg`;
        }
        
        let cleanTitle = photo.title || '';
        if (typeof cleanTitle === 'object' && cleanTitle._content) {
          cleanTitle = cleanTitle._content;
        }
        
        let cleanDesc = photo.description || '';
        if (typeof cleanDesc === 'object' && cleanDesc._content) {
          cleanDesc = cleanDesc._content;
        }
        
        return {
          id: photo.id,
          title: cleanTitle,
          description: cleanDesc,
          link: `https://www.flickr.com/photos/23689211@N04/${photo.id}/`,
          media: { m: mUrl },
          best_resolution: bestUrl 
        };
      });
      
      res.json({ items });
      
    } catch (error) {
      console.error("Error fetching Flickr data:", error);
      res.status(500).json({ error: "Failed to fetch Flickr data" });
    }
  });

  // API route to get configuration
  app.get("/api/config", (req, res) => {
    res.json({
      publicDomain: process.env.CLOUDFLARE_PUBLIC_DOMAIN || "pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev"
    });
  });

  // API route to publish to Cloudflare R2
  app.post("/api/publish", async (req, res) => {
    try {
      const { htmlContent, stateData, title, subtitle } = req.body;
      
      if (!htmlContent) {
        return res.status(400).json({ error: "No HTML content provided" });
      }

      const finalStateData = stateData || JSON.stringify({
        items: req.body.items || [],
        title: title || "ProjectionArt",
        subtitle: subtitle || "",
        lastUpdated: new Date().toISOString()
      });

      // 1. Save local backup of HTML with full state injected
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `portfolio_${timestamp}.html`;
      const htmlWithFullState = htmlContent.includes('</body>') 
        ? htmlContent.replace('</body>', `<script id="editor-state-backup" type="application/json">\n${finalStateData}\n</script>\n</body>`)
        : htmlContent + `\n<script id="editor-state-backup" type="application/json">\n${finalStateData}\n</script>`;
        
      await fs.writeFile(path.join(BACKUPS_DIR, backupFilename), htmlWithFullState);
      
      // Cleanup old backups (keep 20)
      const files = await fs.readdir(BACKUPS_DIR);
      const htmlFiles = files.filter(f => f.endsWith('.html')).sort().reverse();
      if (htmlFiles.length > 20) {
        for (const f of htmlFiles.slice(20)) {
          await fs.unlink(path.join(BACKUPS_DIR, f)).catch(() => {});
        }
      }



      // 2. Upload index.html and state.json to R2
      await publishHtmlAndState(htmlContent, finalStateData);

    const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/index.html`;

    res.json({ success: true, url });
    } catch (error: any) {
      console.error("Error publishing to Cloudflare:", error);
      res.status(500).json({ error: error.message || "Failed to publish to Cloudflare" });
    }
  });

  // API route to upload an image, store local variants, and mirror to R2
  app.post("/api/upload-image", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
      }

      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const baseName = `img-${Date.now()}`;
      
      // 1. Original
      const originalFilename = `${baseName}_original.${ext}`;
      await fs.writeFile(path.join(UPLOADS_ORIGINALS_DIR, originalFilename), req.file.buffer);
      
      const metadata = await sharp(req.file.buffer).metadata();
      const maxSide = Math.max(metadata.width || 0, metadata.height || 0);
      const use3k = maxSide > 2048;
      const largeTarget = use3k ? 3072 : 2048;
      const largeFolder = use3k ? '3k' : '2k';
      const largeDir = use3k ? UPLOADS_3K_DIR : UPLOADS_2K_DIR;
      const largeSuffix = use3k ? '3k' : '2k';

      // 2. Large version (max 2048px or 3072px depending on source size)
      const bufferLarge = await sharp(req.file.buffer)
        .resize(largeTarget, largeTarget, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      const filenameLarge = `${baseName}_${largeSuffix}.jpg`;
      await fs.writeFile(path.join(largeDir, filenameLarge), bufferLarge);
      
      // 3. Thumb Version (max 1024px)
      const bufferThumb = await sharp(req.file.buffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      const filenameThumb = `${baseName}_thumb.jpg`;
      await fs.writeFile(path.join(UPLOADS_THUMBS_DIR, filenameThumb), bufferThumb);

      const basePublicUrl = '/data/uploads';
      const localThumb = `${basePublicUrl}/thumbs/${filenameThumb}`;
      const localLarge = `${basePublicUrl}/${largeFolder}/${filenameLarge}`;
      const localOriginal = `${basePublicUrl}/originals/${originalFilename}`;

      res.json({
        success: true, 
        // Manual uploads stay local until Cloud Sync mirrors only the changed files to R2.
        url: localThumb,
        url_large: localLarge,
        url_original: localOriginal,
        local_large_variant: largeSuffix
      });
    } catch (error: any) {
      console.error("Error processing local image upload:", error);
      res.status(500).json({ error: error.message || "Failed to process local image upload" });
    }
  });

  app.get("/api/cloudflare/usage", async (req, res) => {
    // Calculate estimated costs
    // Free Tier: 1M Class A, 10M Class B, 10GB Storage
    const freeA = 1000000;
    const freeB = 10000000;
    const freeStorage = 10 * 1024 * 1024 * 1024;

    const costA = Math.max(0, (usageStats.classA - freeA) * 0.0000045); // $4.50 per million
    const costB = Math.max(0, (usageStats.classB - freeB) * 0.00000036); // $0.36 per million
    const costStorage = Math.max(0, (usageStats.storageBytes - freeStorage) / (1024 * 1024 * 1024) * 0.015); // $0.015 per GB

    const totalCost = costA + costB + costStorage;

    res.json({
      local: usageStats,
      estimatedCost: totalCost.toFixed(4),
      limits: {
        freeA,
        freeB,
        freeStorage
      },
      hasApiToken: !!process.env.CLOUDFLARE_API_TOKEN
    });
  });

  // Catch-all for undefined API routes to prevent HTML responses
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Global error handler to ensure JSON responses for all errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global server error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/backups/**']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
