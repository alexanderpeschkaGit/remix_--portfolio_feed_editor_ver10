import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import fetch from "node-fetch";
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { createHash } from "crypto";
import { imageHash } from "image-hash";
import sharp from "sharp";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { validateMediaState } from "./src/server/mediaValidation.ts";
import { assertStateAcceptable, stateValidationHttpPayload } from "./src/server/statePublishing.ts";
import { firstExistingLocalMediaPath, resolveMediaAssetLocation } from "./src/server/mediaAssets.ts";
const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const upload = multer({ storage: multer.memoryStorage() });

  const DATA_DIR = path.join(process.cwd(), 'data');
  const DATA_V2_DIR = path.join(process.cwd(), 'data_v2');
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
  const TRASH_PREFIX = 'trash/';
  const V2_PREFIX = 'v2/data';

  const V2_MEDIA_GROUPS = {
    uploads: path.join(DATA_V2_DIR, 'uploads'),
    flickr: path.join(DATA_V2_DIR, 'flickr'),
    instagram: path.join(DATA_V2_DIR, 'instagram'),
    highres: path.join(DATA_V2_DIR, 'highres'),
    previews: path.join(DATA_V2_DIR, 'previews'),
  } as const;

  const MEDIA_VARIANTS = [
    { field: 'image_thumb', dir: 'thumbs400', suffix: 'thumb', maxSide: 400, quality: 74, alwaysCreate: true },
    { field: 'image_1k', dir: '1k', suffix: '1k', maxSide: 1024, quality: 78, alwaysCreate: false },
    { field: 'image_2k', dir: '2k', suffix: '2k', maxSide: 2048, quality: 80, alwaysCreate: false },
    { field: 'image_3k', dir: '3k', suffix: '3k', maxSide: 3072, quality: 82, alwaysCreate: false },
  ] as const;
  
  app.use('/data/preview.html', (req, res, next) => {
    res.setHeader("Content-Security-Policy", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://www.youtube.com https://s.ytimg.com; frame-src https://iframe.mediadelivery.net https://www.youtube.com;");
    next();
  });
  app.use('/data', express.static(DATA_DIR));
  app.use('/data_v2', express.static(DATA_V2_DIR));
  app.use('/originals', express.static(ORIGINALS_DIR));
  app.use('/backups', express.static(BACKUPS_DIR));
  
  // Ensure directories exist
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(DATA_V2_DIR, { recursive: true }).catch(() => {});
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
  for (const groupDir of Object.values(V2_MEDIA_GROUPS)) {
    await fs.mkdir(groupDir, { recursive: true }).catch(() => {});
    await fs.mkdir(path.join(groupDir, 'originals'), { recursive: true }).catch(() => {});
    for (const variant of MEDIA_VARIANTS) {
      await fs.mkdir(path.join(groupDir, variant.dir), { recursive: true }).catch(() => {});
    }
  }

  async function probeVideoDimensions(videoPathOrUrl: string): Promise<{ width: number; height: number } | null> {
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

  async function ensureStateVideoDimensions(state: any) {
    if (!state || !Array.isArray(state.items)) return;
    
    const isVideoUrl = (url?: string) => {
      if (!url) return false;
      return /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(url.split('?')[0]);
    };

    for (const item of state.items) {
      const itemType = String(item.type || '').toLowerCase();
      const isVideo = itemType === 'video' || isVideoUrl(item.video) || isVideoUrl(item.image) || isVideoUrl(item.url);
      
      if (isVideo) {
        const currentW = item.image_width;
        const currentH = item.image_height;
        const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
        
        if (isFallback) {
          const videoSrc = item.video || item.image || item.url;
          const dims = await probeVideoDimensions(videoSrc);
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
          const isMediaVideo = mediaType === 'video' || isVideoUrl(media.video) || isVideoUrl(media.image) || isVideoUrl(media.url);
          
          if (isMediaVideo) {
            const currentW = media.image_width;
            const currentH = media.image_height;
            const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
            
            if (isFallback) {
              const videoSrc = media.video || media.image || media.url;
              const dims = await probeVideoDimensions(videoSrc);
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
  async function cleanupLooseBakFiles() {
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

  const extractPortfolioDataFromHtml = (html: string) => {
    const fullStateMatch = html.match(/<script id="editor-state-backup" type="application\/json">([\s\S]*?)<\/script>/);
    const publicMatch = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
    const match = fullStateMatch || publicMatch;
    
    if (!match || !match[1]) {
      throw new Error('Backup-Format ungültig: Script-Tag fehlt.');
    }
    return JSON.parse(match[1]);
  };

  const visitMediaReferences = (referencedKeys: Set<string>, media: any) => {
    if (!media || typeof media !== 'object') return;
    for (const field of MEDIA_REFERENCE_FIELDS) {
      const key = normalizePossibleR2Key(media[field]);
      if (key) {
        referencedKeys.add(key);
      }
    }
  };

  const collectReferencedR2KeysFromPortfolioData = (referencedKeys: Set<string>, data: any) => {
    for (const item of data?.items || data?.posts || []) {
      visitMediaReferences(referencedKeys, item);
      if (Array.isArray(item.mergedMedia)) {
        for (const media of item.mergedMedia) {
          visitMediaReferences(referencedKeys, media);
        }
      }
    }
  };

  const collectReferencedR2KeysFromHtml = (referencedKeys: Set<string>, html: string) => {
    try {
      const portfolioData = extractPortfolioDataFromHtml(html);
      collectReferencedR2KeysFromPortfolioData(referencedKeys, portfolioData);
    } catch (error) {
      console.error('Failed to extract portfolio data from HTML while collecting R2 references:', error);
    }
  };

  const toPosix = (value: string) => value.replace(/\\/g, '/');
  const joinUrlPath = (...parts: string[]) => `/${parts.map(part => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
  const normalizeExt = (ext?: string) => {
    const clean = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean || 'jpg';
  };

  const normalizeUploadedImage = async (file: Express.Multer.File) => {
    const originalExt = normalizeExt(path.extname(file.originalname || '').slice(1));
    const metadata = await sharp(file.buffer, { failOn: 'none' }).metadata();
    const inputFormat = String(metadata.format || originalExt).toLowerCase();
    const convertToJpeg = inputFormat === 'png' || inputFormat === 'tiff' || originalExt === 'tif' || originalExt === 'tiff';

    if (!convertToJpeg) {
      return { buffer: file.buffer, ext: originalExt, inputFormat, convertedToJpeg: false };
    }

    const buffer = await sharp(file.buffer, { failOn: 'none' })
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer();

    return { buffer, ext: 'jpg', inputFormat, convertedToJpeg: true };
  };
  const getGroupBaseDir = (group: keyof typeof V2_MEDIA_GROUPS) => V2_MEDIA_GROUPS[group];
  const getVariantLocalPath = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    path.join(getGroupBaseDir(group), dir, filename);
  const getVariantLocalUrl = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    joinUrlPath('data_v2', group, dir, filename);
  const getVariantR2Key = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, filename: string) =>
    `${V2_PREFIX}/${group}/${dir}/${filename}`;

  const materializeVariantSet = async (
    input: sharp.Sharp | Buffer | string,
    options: {
      group: keyof typeof V2_MEDIA_GROUPS;
      baseName: string;
      originalBuffer?: Buffer;
      originalExt?: string;
      uploadToCloud?: boolean;
      writeFiles?: boolean;
    }
  ) => {
    const source = sharp(input as any, { failOn: 'none' });
    const metadata = await source.metadata();
    const sourceWidth = metadata.width || 0;
    const sourceHeight = metadata.height || 0;
    const sourceMaxSide = Math.max(sourceWidth, sourceHeight);
    const localUrls: Record<string, string> = {};
    const remoteUrls: Record<string, string> = {};
    const localPaths: Record<string, string> = {};
    const missingVariants: string[] = [];
    const manifestEntries: Array<{ r2Key: string; hash: string; size: number }> = [];

    if (options.originalBuffer) {
      const originalFilename = `${options.baseName}_original.${normalizeExt(options.originalExt)}`;
      const originalPath = getVariantLocalPath(options.group, 'originals', originalFilename);
      if (options.writeFiles !== false) {
        await fs.writeFile(originalPath, options.originalBuffer);
        localPaths.image_original = originalPath;
      }
      localUrls.image_original = getVariantLocalUrl(options.group, 'originals', originalFilename);

      if (options.uploadToCloud) {
        const r2Key = getVariantR2Key(options.group, 'originals', originalFilename);
        remoteUrls.image_original = await uploadToR2(options.originalBuffer, r2Key, getContentTypeForPath(originalFilename));
        manifestEntries.push({ r2Key, hash: getBufferSha1(options.originalBuffer), size: options.originalBuffer.length });
      }
    }

    for (const variant of MEDIA_VARIANTS) {
      if (!variant.alwaysCreate && sourceMaxSide < variant.maxSide) {
        missingVariants.push(variant.field);
        continue;
      }

      const filename = `${options.baseName}_${variant.suffix}.jpg`;
      const buffer = await sharp(input as any, { failOn: 'none' })
        .resize(variant.maxSide, variant.maxSide, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: variant.quality })
        .toBuffer();

      const localPath = getVariantLocalPath(options.group, variant.dir, filename);
      if (options.writeFiles !== false) {
        await fs.writeFile(localPath, buffer);
        localPaths[variant.field] = localPath;
      }
      localUrls[variant.field] = getVariantLocalUrl(options.group, variant.dir, filename);

      if (options.uploadToCloud) {
        const r2Key = getVariantR2Key(options.group, variant.dir, filename);
        remoteUrls[variant.field] = await uploadToR2(buffer, r2Key, 'image/jpeg');
        manifestEntries.push({ r2Key, hash: getBufferSha1(buffer), size: buffer.length });
      }
    }

    return { sourceMaxSide, sourceWidth, sourceHeight, localUrls, remoteUrls, localPaths, missingVariants, manifestEntries };
  };

  const publishHtmlAndState = async (htmlContent: string, stateData: string) => {
    await assertStateAcceptable(stateData, { rootDir: process.cwd(), allowNetwork: true });
    const indexBuffer = Buffer.from(htmlContent);
    const stateBuffer = Buffer.from(stateData);
    const revision = `${new Date().toISOString().replace(/[:.]/g, '-')}-${createHash('sha256').update(stateBuffer).update(indexBuffer).digest('hex').slice(0, 12)}`;
    const revisionPrefix = `revisions/${revision}`;
    const objects = [
      { liveKey: 'state.json', revisionKey: `${revisionPrefix}/state.json`, body: stateBuffer, contentType: 'application/json; charset=utf-8' },
      { liveKey: 'index.html', revisionKey: `${revisionPrefix}/index.html`, body: indexBuffer, contentType: 'text/html; charset=utf-8' },
    ];

    const previous = new Map<string, { body: Buffer; contentType: string } | null>();
    for (const object of objects) {
      try {
        const current = await s3Client.send(new GetObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey }));
        previous.set(object.liveKey, {
          body: Buffer.from(await current.Body!.transformToByteArray()),
          contentType: current.ContentType || object.contentType,
        });
      } catch (error: any) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) previous.set(object.liveKey, null);
        else throw error;
      }
    }

    // Upload and verify an immutable revision before changing either live key.
    for (const object of objects) {
      await s3Client.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.revisionKey, Body: object.body, ContentType: object.contentType }));
      await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.revisionKey }));
    }

    const promoted: string[] = [];
    try {
      for (const object of objects) {
        const copySource = `${R2_CONFIG.bucketName}/${object.revisionKey.split('/').map(encodeURIComponent).join('/')}`;
        await s3Client.send(new CopyObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey, CopySource: copySource }));
        await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: object.liveKey }));
        promoted.push(object.liveKey);
      }
    } catch (error) {
      // Restore the exact previous live pair if promotion is interrupted.
      for (const liveKey of promoted.reverse()) {
        const old = previous.get(liveKey);
        if (old) {
          await s3Client.send(new PutObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: liveKey, Body: old.body, ContentType: old.contentType }));
        } else {
          await s3Client.send(new DeleteObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: liveKey }));
        }
      }
      throw error;
    }
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
        const pickBestImage = (...candidates: any[]) => candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
        for (const item of scraped) {
          const id = item.id;
          if (!existsInState(id) && !deletedIds.includes(id)) {
            const mergedMedia = Array.isArray(item.media_list)
              ? item.media_list.map((media: any) => {
                  if (typeof media === 'string') {
                    return { type: media.endsWith('.mp4') ? 'video' : 'image', image: media, image_large: media, link: item.link };
                  }
                  const bestImage = pickBestImage(media.image_original, media.image_3k, media.image_2k, media.image_large, media.image_1k, media.image_thumb, media.image);
                  return {
                    type: media.type || 'image',
                    image: bestImage || media.image || media.image_thumb || '',
                    image_thumb: media.image_thumb || media.image || '',
                    image_1k: media.image_1k || '',
                    image_2k: media.image_2k || '',
                    image_large: media.image_large || media.image_2k || media.image_3k || media.image_1k || media.image_thumb || bestImage || '',
                    image_3k: media.image_3k || '',
                    image_original: media.image_original || '',
                    image_width: media.image_width || 0,
                    image_height: media.image_height || 0,
                    link: media.link || item.link
                  };
                })
              : (item.image ? [{
                  type: 'image',
                  image: item.image,
                  image_thumb: item.image_thumb || item.image || '',
                  image_1k: item.image_1k || '',
                  image_2k: item.image_2k || '',
                  image_large: item.image_large || item.image_2k || item.image_3k || item.image_1k || item.image_thumb || item.image || '',
                  image_3k: item.image_3k || '',
                  image_original: item.image_original || '',
                  image_width: item.image_width || 0,
                  image_height: item.image_height || 0,
                  link: item.link
                }] : []);
            newItems.push({
              id,
              type: mergedMedia.some((media: any) => media.type === 'video') ? 'video' : 'image',
              source: 'instagram',
              title: item.title || '',
              description: item.description || '',
              image: pickBestImage(item.image_original, item.image_3k, item.image_2k, item.image_large, item.image_1k, item.image_thumb, item.image) || item.image || item.image_thumb || '',
              image_thumb: item.image_thumb || item.image || '',
              image_1k: item.image_1k || '',
              image_2k: item.image_2k || '',
              image_large: item.image_large || item.image_2k || item.image_3k || item.image_1k || item.image_thumb || item.image || '',
              image_3k: item.image_3k || '',
              image_original: item.image_original || '',
              image_width: item.image_width || 0,
              image_height: item.image_height || 0,
              mergedMedia,
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
            const fallbackThumb = item.image_thumb || item.image || (item.img_1024 ? `/data/flickr/${item.img_1024}` : '');
            const fallback3k = item.image_3k || item.image_large || (item.img_3k ? `/data/flickr/${item.img_3k}` : '');
            const mergedMedia = Array.isArray(item.media_list)
              ? item.media_list.map((media: any) => {
                  if (typeof media === 'string') {
                    return { type: 'image', image: media, image_large: fallback3k || media, link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/` };
                  }
                  return {
                    type: media.type || 'image',
                    image: media.image || media.image_thumb || fallbackThumb,
                    image_thumb: media.image_thumb || '',
                    image_1k: media.image_1k || '',
                    image_2k: media.image_2k || '',
                    image_large: media.image_large || media.image_2k || media.image_3k || media.image_1k || media.image_thumb || fallback3k || '',
                    image_3k: media.image_3k || '',
                    image_original: media.image_original || '',
                    image_width: media.image_width || 0,
                    image_height: media.image_height || 0,
                    link: media.link || item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`
                  };
                })
              : [{
                  type: 'image',
                  image: fallbackThumb,
                  image_thumb: item.image_thumb || fallbackThumb,
                  image_1k: item.image_1k || '',
                  image_2k: item.image_2k || '',
                  image_large: item.image_large || item.image_2k || item.image_3k || fallback3k || '',
                  image_3k: item.image_3k || '',
                  image_original: item.image_original || '',
                  image_width: item.image_width || 0,
                  image_height: item.image_height || 0,
                  link: item.link || `https://www.flickr.com/photos/23689211@N04/${id}/`
                }];
            newItems.push({
              id,
              type: 'image',
              source: 'flickr',
              title: item.title || '',
              description: item.description || item.desc || '',
              image: fallbackThumb,
              image_thumb: item.image_thumb || fallbackThumb,
              image_1k: item.image_1k || '',
              image_2k: item.image_2k || '',
              image_large: item.image_large || item.image_2k || item.image_3k || fallback3k || '',
              image_3k: item.image_3k || '',
              image_original: item.image_original || '',
              image_width: item.image_width || 0,
              image_height: item.image_height || 0,
              mergedMedia,
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
      await persistAcceptedState(state, statePath);
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

  const BUNNY_CONFIG = {
    apiKey: process.env.BUNNY_API_KEY || "",
    libraryId: process.env.BUNNY_LIBRARY_ID || "",
    pullZone: process.env.BUNNY_PULL_ZONE || ""
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

  async function persistAcceptedState(stateData: any, statePath = path.join(DATA_DIR, 'state.json'), createBackup = false) {
    const state = typeof stateData === 'string' ? JSON.parse(stateData) : stateData;
    await ensureStateVideoDimensions(state);
    await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });
    if (createBackup) await backupState();
    const stateString = JSON.stringify(state, null, 2);
    await fs.writeFile(statePath, stateString, 'utf-8');
    return stateString;
  }

  const hasR2UploadCredentials = () => (
    !!R2_CONFIG.accountId &&
    !!R2_CONFIG.accessKeyId &&
    !!R2_CONFIG.secretAccessKey &&
    !!R2_CONFIG.bucketName
  );

  const uploadVariantSetToR2 = async (
    variantSet: {
      localPaths: Record<string, string>;
      localUrls: Record<string, string>;
    },
    options: {
      group: keyof typeof V2_MEDIA_GROUPS;
      originalBuffer?: Buffer;
      originalExt?: string;
    }
  ) => {
    const remoteUrls: Record<string, string> = {};
    const manifestEntries: Array<{ r2Key: string; hash: string; size: number }> = [];
    const uploadErrors: string[] = [];

    if (options.originalBuffer && variantSet.localPaths.image_original) {
      try {
        const originalFilename = path.basename(variantSet.localPaths.image_original);
        const originalR2Key = getVariantR2Key(options.group, 'originals', originalFilename);
        remoteUrls.image_original = await uploadToR2(
          options.originalBuffer,
          originalR2Key,
          getContentTypeForPath(originalFilename)
        );
        manifestEntries.push({
          r2Key: originalR2Key,
          hash: getBufferSha1(options.originalBuffer),
          size: options.originalBuffer.length,
        });
      } catch (error: any) {
        uploadErrors.push(`image_original: ${error.message || error}`);
      }
    }

    for (const variant of MEDIA_VARIANTS) {
      const localPath = variantSet.localPaths[variant.field];
      if (!localPath) continue;

      try {
        const buffer = await fs.readFile(localPath);
        const filename = path.basename(localPath);
        const r2Key = getVariantR2Key(options.group, variant.dir, filename);
        remoteUrls[variant.field] = await uploadToR2(buffer, r2Key, getContentTypeForPath(localPath));
        manifestEntries.push({
          r2Key,
          hash: getBufferSha1(buffer),
          size: buffer.length,
        });
      } catch (error: any) {
        uploadErrors.push(`${variant.field}: ${error.message || error}`);
      }
    }

    if (manifestEntries.length > 0) {
      await updateSyncManifestEntries(manifestEntries);
    }

    return { remoteUrls, manifestEntries, uploadErrors };
  };

  const getContentTypeForPath = (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') return 'application/json';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  };

  const getBufferSha1 = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');

  const MEDIA_REFERENCE_FIELDS = [
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

  const localUrlToSyncTarget = (url?: string) => {
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

    if (cleanUrl.startsWith('/data_v2/')) {
      return {
        localPath: path.join(process.cwd(), cleanUrl.replace(/^\/data_v2\//, 'data_v2/')),
        r2Key: `${V2_PREFIX}/${toPosix(cleanUrl.replace(/^\/data_v2\//, ''))}`
      };
    }
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
    const publicBaseUrl = R2_CONFIG.publicDomain.startsWith('http')
      ? R2_CONFIG.publicDomain.replace(/\/+$/, '')
      : `https://${R2_CONFIG.publicDomain}`.replace(/\/+$/, '');

    try {
      const stateData = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
      collectReferencedR2KeysFromPortfolioData(referencedKeys, JSON.parse(stateData));
    } catch (e) {
      console.error('Failed to collect referenced R2 keys:', e);
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
      }
    } catch (error) {
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
    const managedPrefixes = ['data/', 'uploads/', 'highres/', 'originals/', 'v2/data/'];
    const referencedKeys = await collectReferencedR2Keys();
    const r2Objects = await listR2ObjectsForPrefixes(managedPrefixes);
    const allVideoStems = new Set(
      r2Objects
        .filter((obj) => isVideoR2Key(obj.key))
        .map((obj) => toCanonicalMediaStem(obj.key))
    );

    const orphaned = r2Objects.filter((obj) => {
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

  const normalizeTrashName = (value: string) =>
    value
      .replace(/[^a-z0-9._-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'file';

  const buildTrashKey = (originalKey: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = createHash('sha1').update(originalKey).digest('hex').slice(0, 12);
    const baseName = normalizeTrashName(path.basename(originalKey) || 'file');
    return `${TRASH_PREFIX}${timestamp}/${hash}-${baseName}`;
  };

  type TrashItem = {
    key: string;
    trashKey: string;
    originalKey: string;
    reason: string;
    size: number;
    contentType: string;
    trashedAt: string;
    previewUrl: string;
    originalExists?: boolean;
  };

  const moveR2ObjectsToTrash = async (
    objects: Array<{ key: string; size: number }>,
    reason: string
  ) => {
    const movedItems: TrashItem[] = [];
    const skippedKeys: string[] = [];

    for (const obj of objects) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: obj.key
        }));

        const trashKey = buildTrashKey(obj.key);
        const trashedAt = new Date().toISOString();
        const contentType = head.ContentType || 'application/octet-stream';

        await s3Client.send(new CopyObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          CopySource: `${R2_CONFIG.bucketName}/${encodeURIComponent(obj.key)}`,
          Key: trashKey,
          MetadataDirective: 'REPLACE',
          Metadata: {
            originalkey: obj.key,
            trashreason: reason,
            trashedat: trashedAt,
            originalsizedbytes: String(obj.size || head.ContentLength || 0)
          },
          ContentType: contentType
        }));

        const trashHead = await s3Client.send(new HeadObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));

        if (trashHead.Metadata?.originalkey !== obj.key) {
          throw new Error(`Trash verification failed for ${obj.key}`);
        }

        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: obj.key
        }));

        const manifest = await loadSyncManifest();
        delete manifest[obj.key];
        await saveSyncManifest(manifest);

        movedItems.push({
          key: obj.key,
          trashKey,
          originalKey: obj.key,
          reason,
          size: obj.size || head.ContentLength || 0,
          contentType,
          trashedAt,
          previewUrl: `${R2_CONFIG.publicDomain.replace(/\/+$/, '')}/${trashKey}`
        });
      } catch (error) {
        console.error(`Failed to move ${obj.key} to trash:`, error);
        skippedKeys.push(obj.key);
      }
    }

    return { movedItems, skippedKeys };
  };

  const listTrashObjects = async () => {
    const trashObjects = await listR2ObjectsForPrefixes([TRASH_PREFIX]);
    const items: TrashItem[] = [];

    for (const obj of trashObjects) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: obj.key
        }));

        const originalKey = head.Metadata?.originalkey || '';
        if (!originalKey) continue;

        let originalExists = false;
        try {
          await s3Client.send(new HeadObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: originalKey
          }));
          originalExists = true;
        } catch (originalErr: any) {
          if (!(originalErr?.name === 'NotFound' || originalErr?.$metadata?.httpStatusCode === 404)) {
            throw originalErr;
          }
        }

        items.push({
          key: obj.key,
          trashKey: obj.key,
          originalKey,
          reason: head.Metadata?.trashreason || 'unknown',
          size: obj.size || head.ContentLength || 0,
          contentType: head.ContentType || 'application/octet-stream',
          trashedAt: head.Metadata?.trashedat || head.LastModified?.toISOString?.() || '',
          previewUrl: `${R2_CONFIG.publicDomain.replace(/\/+$/, '')}/${obj.key}`,
          originalExists
        });
      } catch (error) {
        console.error(`Failed to inspect trash object ${obj.key}:`, error);
      }
    }

    items.sort((a, b) => (b.trashedAt || '').localeCompare(a.trashedAt || ''));
    return items;
  };

  const restoreTrashObjects = async (trashKeys: string[]) => {
    const restoredItems: TrashItem[] = [];
    const skippedKeys: string[] = [];
    const conflicts: Array<{ trashKey: string; originalKey: string }> = [];

    for (const trashKey of trashKeys) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));

        const originalKey = head.Metadata?.originalkey;
        if (!originalKey) {
          skippedKeys.push(trashKey);
          continue;
        }

        let originalExists = false;
        try {
          await s3Client.send(new HeadObjectCommand({
            Bucket: R2_CONFIG.bucketName,
            Key: originalKey
          }));
          originalExists = true;
        } catch (originalErr: any) {
          if (!(originalErr?.name === 'NotFound' || originalErr?.$metadata?.httpStatusCode === 404)) {
            throw originalErr;
          }
        }

        if (originalExists) {
          conflicts.push({ trashKey, originalKey });
          continue;
        }

        await s3Client.send(new CopyObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          CopySource: `${R2_CONFIG.bucketName}/${encodeURIComponent(trashKey)}`,
          Key: originalKey,
          MetadataDirective: 'REPLACE',
          Metadata: {},
          ContentType: head.ContentType || 'application/octet-stream'
        }));

        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));

        restoredItems.push({
          key: originalKey,
          trashKey,
          originalKey,
          reason: head.Metadata?.trashreason || 'unknown',
          size: head.ContentLength || 0,
          contentType: head.ContentType || 'application/octet-stream',
          trashedAt: head.Metadata?.trashedat || '',
          previewUrl: `${R2_CONFIG.publicDomain.replace(/\/+$/, '')}/${originalKey}`,
          originalExists: false
        });
      } catch (error) {
        console.error(`Failed to restore trash object ${trashKey}:`, error);
        skippedKeys.push(trashKey);
      }
    }

    return { restoredItems, skippedKeys, conflicts };
  };

  const deleteTrashObjects = async (trashKeys: string[]) => {
    const deletedKeys: string[] = [];
    const skippedKeys: string[] = [];

    for (const trashKey of trashKeys) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));
        deletedKeys.push(trashKey);
      } catch (error) {
        console.error(`Failed to permanently delete trash object ${trashKey}:`, error);
        skippedKeys.push(trashKey);
      }
    }

    return { deletedKeys, skippedKeys };
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
          await persistAcceptedState(state, statePath);
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

            const originalBuffer = await fs.readFile(filePath);
            const variantSet = await materializeVariantSet(filePath, {
              group: 'highres',
              baseName,
              originalBuffer,
              originalExt: path.extname(file),
              uploadToCloud: true,
            });

            bestMatch.image_thumb = variantSet.remoteUrls.image_thumb || variantSet.localUrls.image_thumb;
            bestMatch.image_1k = variantSet.remoteUrls.image_1k || variantSet.localUrls.image_1k;
            bestMatch.image_2k = variantSet.remoteUrls.image_2k || variantSet.localUrls.image_2k;
            bestMatch.image_3k = variantSet.remoteUrls.image_3k || variantSet.localUrls.image_3k;
            bestMatch.image_original = variantSet.remoteUrls.image_original || variantSet.localUrls.image_original;
            bestMatch.image = bestMatch.image_thumb || bestMatch.image;
            bestMatch.image_large = bestMatch.image_2k || bestMatch.image_3k || bestMatch.image_large;
            bestMatch.local_highres = variantSet.localUrls.image_3k || variantSet.localUrls.image_2k || variantSet.localUrls.image_1k || '';
            if (variantSet.manifestEntries.length > 0) {
              await updateSyncManifestEntries(variantSet.manifestEntries);
            }
            if (variantSet.missingVariants.length > 0) {
              syncStatus.logs.push(`[INFO] ${file}: ausgelassene Stufen wegen kleiner Quelle: ${variantSet.missingVariants.join(', ')}`);
            }
            matchesFound++;
          } else if (bestMatch && minDistance <= 12) {
            syncStatus.logs.push(`[UNSICHER] ${file} ähnelt Post ${bestMatch.id} (Dist: ${minDistance})`);

            const previewSet = await materializeVariantSet(filePath, {
              group: 'previews',
              baseName,
              uploadToCloud: true,
            });
            const previewUrl = previewSet.remoteUrls.image_1k || previewSet.remoteUrls.image_thumb || previewSet.localUrls.image_1k || previewSet.localUrls.image_thumb;
            if (previewSet.manifestEntries.length > 0) {
              await updateSyncManifestEntries(previewSet.manifestEntries);
            }

            uncertainMatches.push({
              postId: bestMatch.id,
              localFile: file,
              previewUrl,
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
          await persistAcceptedState(state, statePath);
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

        for (const [sub, subDirPath] of Object.entries(V2_MEDIA_GROUPS)) {
          if (await fs.access(subDirPath).then(() => true).catch(() => false)) {
            const files = await getRecursiveFiles(subDirPath, subDirPath);
            const mediaFiles = files.filter(f => /\.(jpg|jpeg|png|webp|json|mp4|webm|mov)$/i.test(f)).map(f => ({
              localPath: path.join(subDirPath, f),
              r2Key: `${V2_PREFIX}/${sub}/${toPosix(f)}`
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
      await assertStateAcceptable(stateData, { rootDir: process.cwd(), allowNetwork: true });

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
        const originalBuffer = await fs.readFile(originalPath);
        const variantSet = await materializeVariantSet(originalPath, {
          group: 'highres',
          baseName: baseName || item.id,
          originalBuffer,
          originalExt: path.extname(originalPath),
          uploadToCloud: true,
        });

        item.image_thumb = variantSet.remoteUrls.image_thumb || variantSet.localUrls.image_thumb;
        item.image_1k = variantSet.remoteUrls.image_1k || variantSet.localUrls.image_1k;
        item.image_2k = variantSet.remoteUrls.image_2k || variantSet.localUrls.image_2k;
        item.image_3k = variantSet.remoteUrls.image_3k || variantSet.localUrls.image_3k;
        item.image_original = variantSet.remoteUrls.image_original || variantSet.localUrls.image_original;
        item.image = item.image_thumb || item.image;
        item.image_large = item.image_2k || item.image_3k || item.image_large;
        item.local_highres = variantSet.localUrls.image_3k || variantSet.localUrls.image_2k || variantSet.localUrls.image_1k || '';
        if (variantSet.manifestEntries.length > 0) {
          await updateSyncManifestEntries(variantSet.manifestEntries);
        }
        
        await backupState();
        await persistAcceptedState(state, statePath);
        
        // Remove from uncertain matches
        const uncertainPath = path.join(SYNC_DIR, 'uncertain_matches.json');
        try {
          const uncertainData = await fs.readFile(uncertainPath, 'utf-8');
          let uncertain = JSON.parse(uncertainData);
          uncertain = uncertain.filter((u: any) => u.postId !== postId);
          await fs.writeFile(uncertainPath, JSON.stringify(uncertain, null, 2));
        } catch (e) {}
        
        res.json({ success: true, url: item.image_3k || item.image_2k || item.image_1k || item.image_thumb });
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
        const knownKeys = new Set(allImageFiles.map(file => file.r2Key));

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
              images.forEach(file => knownKeys.add(file.r2Key));
            }
          }
        }

        for (const [sub, subDirPath] of Object.entries(V2_MEDIA_GROUPS)) {
          if (await fs.access(subDirPath).then(() => true).catch(() => false)) {
            const files = await getRecursiveFiles(subDirPath, subDirPath);
            const images = files
              .filter(f => /\.(jpg|jpeg|png|webp|json|mp4|webm|mov)$/i.test(f))
              .map(f => ({
                localPath: path.join(subDirPath, f),
                r2Key: `${V2_PREFIX}/${sub}/${toPosix(f)}`
              }))
              .filter(file => !knownKeys.has(file.r2Key));
            allImageFiles = [...allImageFiles, ...images];
            images.forEach(file => knownKeys.add(file.r2Key));
          }
        }

        // Add Connect_front_back.md to sync for external AI access
        const connectMdPath = path.join(process.cwd(), 'Connect_front_back.md');
        if (await fs.access(connectMdPath).then(() => true).catch(() => false)) {
          allImageFiles.push({
            localPath: connectMdPath,
            r2Key: 'v2/config/Connect_front_back.md'
          });
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

  const IMAGE_VARIANT_FIELDS = ['image_thumb', 'image_1k', 'image_2k', 'image_3k'] as const;
  const IMAGE_SOURCE_FIELDS = ['image_original', 'image_3k', 'image_2k', 'image_large', 'image_1k', 'image_thumb', 'image', 'url', 'link'] as const;
  const VIDEO_SOURCE_FIELDS = ['video', 'video_large', 'image_original', 'url', 'link', 'image'] as const;
  const VIDEO_THUMB_SOURCE_FIELDS = ['image_3k', 'image_2k', 'image_large', 'image_1k', 'image_thumb', 'image_preview', 'image'] as const;

  const createMediaVariantsStatus = () => ({
    running: false,
    done: false,
    phase: 'idle',
    progress: 0,
    total: 0,
    logs: [] as string[],
    error: null as string | null,
    audit: null as any,
    result: null as any,
  });
  const mediaVariantsStatus = createMediaVariantsStatus();

  const resetMediaVariantsStatus = (phase = 'idle') => {
    Object.assign(mediaVariantsStatus, createMediaVariantsStatus(), { phase });
  };

  const logMediaVariantStatus = (message: string) => {
    mediaVariantsStatus.logs.push(message);
    console.log(`[media-variants] ${message}`);
  };

  const sanitizeVariantBaseName = (value: string) => {
    const clean = String(value || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/(?:[_-](thumb|thumbnail|poster|preview|original|1k|2k|3k))$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean || `media-${Date.now()}`;
  };

  const getUrlPathname = (value?: string) => {
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

  const localPathFromMediaUrl = async (value?: string) => {
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

  const isImageUrlLike = (value?: string) => !!value && /\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff)(\?.*)?$/i.test(value);
  const isVideoUrlLike = (value?: string) => !!value && /\.(mp4|webm|mov|avi|mkv|flv)(\?.*)?$/i.test(value);
  const isYoutubeMedia = (media: any) => {
    const type = String(media?.type || '').toLowerCase();
    return type === 'youtube' || !!media?.youtubeId || !!media?.youtubeUrl || String(media?.url || media?.link || '').includes('youtube.com');
  };
  const isBunnyMedia = (media: any) => {
    const type = String(media?.type || '').toLowerCase();
    return type === 'bunny' || (!!media?.videoId && !!media?.libraryId) || String(media?.url || media?.image_original || '').includes('mediadelivery.net');
  };
  const isVideoMedia = (media: any) => {
    if (!media || isYoutubeMedia(media)) return false;
    const type = String(media.type || '').toLowerCase();
    if (type === 'video' || isBunnyMedia(media)) return true;
    return VIDEO_SOURCE_FIELDS.some(field => isVideoUrlLike(media[field]));
  };

  const getMediaMaxSide = (media: any) => {
    const width = Number(media?.image_width || media?.width || 0);
    const height = Number(media?.image_height || media?.height || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
    return Math.max(width, height);
  };

  const getRequiredVariantFields = (media: any) => {
    if (isYoutubeMedia(media)) return [] as string[];
    if (!isVideoMedia(media)) return ['image_thumb'];

    const required = ['image_thumb', 'image_1k'];
    const maxSide = getMediaMaxSide(media);
    if (maxSide >= 2048) required.push('image_2k');
    if (maxSide >= 3072) required.push('image_3k');
    return required;
  };

  const inferMediaGroup = (media: any): keyof typeof V2_MEDIA_GROUPS => {
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

  const getVariantBaseName = (item: any, media: any, mediaIndex: number) => {
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

  const getPublicBaseUrl = () => {
    const base = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
    return base.replace(/\/+$/, '');
  };

  const toPublicR2Url = (r2Key: string) => `${getPublicBaseUrl()}/${r2Key.replace(/^\/+/, '')}`;

  const headR2KeyWithCache = async (key: string, cache: Map<string, boolean>) => {
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

  const hasLikelyGenerationSource = async (media: any) => {
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

  const collectMediaVariantEntries = (state: any, includeTopLevelReferences = false) => {
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

  const auditMediaVariantsInState = async (state: any, options: { includeTopLevelReferences?: boolean } = {}) => {
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

  const fetchBufferFromUrl = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
    return Buffer.from(await response.arrayBuffer());
  };

  const readLocalOrRemoteBuffer = async (value?: string) => {
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

  const resolveImageSource = async (media: any) => {
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

  const resolveBunnyThumbnail = async (media: any) => {
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

    if (!BUNNY_CONFIG.apiKey || !BUNNY_CONFIG.pullZone) return null;

    try {
      const libraryId = media.libraryId || BUNNY_CONFIG.libraryId;
      const metaUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${media.videoId}`;
      const metaRes = await fetch(metaUrl, {
        headers: { "AccessKey": BUNNY_CONFIG.apiKey, "Accept": "application/json" }
      });
      if (!metaRes.ok) return null;
      const metadata: any = await metaRes.json();
      const thumbFilename = metadata.thumbnailFileName || 'thumbnail.jpg';
      const thumbUrl = `https://${BUNNY_CONFIG.pullZone}/${media.videoId}/${thumbFilename}`;
      const buffer = await fetchBufferFromUrl(thumbUrl);
      return { buffer, ext: 'jpg' };
    } catch (error: any) {
      console.warn(`[media-variants] Bunny thumbnail lookup failed:`, error.message || error);
      return null;
    }
  };

  const extractVideoThumbnailBuffer = async (videoSource: { buffer?: Buffer; path?: string; ext?: string }) => {
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

  const resolveVideoThumbnailSource = async (media: any) => {
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

  const bestLargeFromUrls = (urls: Record<string, string>) =>
    urls.image_2k || urls.image_3k || urls.image_1k || urls.image_thumb || urls.image || '';

  const applyGeneratedVariantUrls = (media: any, generatedUrls: Record<string, string>, videoLike: boolean) => {
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

  const getPrimaryMediaScore = (media: any) => {
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

  const getPrimaryMedia = (mediaList: any[]) => {
    if (!Array.isArray(mediaList) || mediaList.length === 0) return null;
    return mediaList.reduce((best, media) => getPrimaryMediaScore(media) > getPrimaryMediaScore(best) ? media : best, mediaList[0]);
  };

  const syncItemFromPrimaryMedia = (item: any) => {
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

  const generateVariantsForEntry = async (entry: { item: any; media: any; mediaIndex: number; label: string }, options: { dryRun?: boolean } = {}) => {
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
      uploadToCloud: false,
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
      dryRun: options.dryRun === true,
    };
  };

  const publishStateJsonToR2 = async (state: any) => {
    await ensureStateVideoDimensions(state);
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

  const verifyPublishedMediaVariants = async () => {
    const publicStateUrl = `${getPublicBaseUrl()}/state.json?t=${Date.now()}`;
    const response = await fetch(publicStateUrl);
    if (!response.ok) {
      throw new Error(`Published state.json fetch failed: ${response.status} ${response.statusText}`);
    }
    const state = await response.json();
    return auditMediaVariantsInState(state, { includeTopLevelReferences: true });
  };

  app.post("/api/media-variants/audit", async (req, res) => {
    if (mediaVariantsStatus.running) return res.json({ status: mediaVariantsStatus, audit: mediaVariantsStatus.audit });

    resetMediaVariantsStatus('audit');
    mediaVariantsStatus.running = true;
    logMediaVariantStatus('Scanning state.json for missing media variants...');

    try {
      const state = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8'));
      const audit = await auditMediaVariantsInState(state, { includeTopLevelReferences: true });
      mediaVariantsStatus.audit = audit;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.phase = 'done';
      logMediaVariantStatus(`Audit complete: ${audit.issueCount} issues, ${audit.generatableIssueCount} generatable.`);
      res.json({ success: true, audit, status: mediaVariantsStatus });
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      logMediaVariantStatus(`Audit failed: ${mediaVariantsStatus.error}`);
      res.status(500).json({ error: mediaVariantsStatus.error, status: mediaVariantsStatus });
    }
  });

  app.post("/api/media-validation/audit", async (req, res) => {
    try {
      const state = req.body?.state || JSON.parse(await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8'));
      const report = await validateMediaState(state, {
        rootDir: process.cwd(),
        allowNetwork: req.body?.allowNetwork !== false,
        includeTopLevelReferences: !!req.body?.includeTopLevelReferences,
        reportMissingOptionalVariants: req.body?.reportMissingOptionalVariants !== false,
      });
      res.status(report.ok ? 200 : 422).json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post("/api/media-variants/generate", async (req, res) => {
    if (mediaVariantsStatus.running) return res.status(409).json({ error: 'Media variant task already running', status: mediaVariantsStatus });

    resetMediaVariantsStatus('generate');
    mediaVariantsStatus.running = true;
    logMediaVariantStatus('Starting generation for missing media variants...');

    try {
      const dryRun = req.body?.dryRun !== false;
      const statePath = path.join(DATA_DIR, 'state.json');
      const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      const auditBefore = await auditMediaVariantsInState(state, { includeTopLevelReferences: false });
      const issueEntryKeys = new Set(
        auditBefore.issues
          .filter((issue: any) => issue.canGenerate && issue.reason !== 'source-unavailable')
          .map((issue: any) => `${issue.itemId}|${issue.mediaIndex}`)
      );

      const entries = collectMediaVariantEntries(state, false)
        .filter(entry => issueEntryKeys.has(`${entry.item?.id || ''}|${entry.mediaIndex}`));

      mediaVariantsStatus.total = entries.length;
      const generated: any[] = [];
      const failed: any[] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        mediaVariantsStatus.progress = i + 1;
        try {
          logMediaVariantStatus(`Generating ${i + 1}/${entries.length}: ${entry.label}`);
          const result = await generateVariantsForEntry(entry, { dryRun });
          generated.push(result);
        } catch (error: any) {
          const failure = {
            itemId: entry.item?.id || '',
            title: entry.item?.title || '',
            mediaIndex: entry.mediaIndex,
            label: entry.label,
            error: error.message || String(error),
          };
          failed.push(failure);
          logMediaVariantStatus(`Failed ${entry.label}: ${failure.error}`);
        }
      }

      for (const item of state.items || []) {
        if (Array.isArray(item.mergedMedia) && item.mergedMedia.length > 0) {
          syncItemFromPrimaryMedia(item);
        }
      }

      const candidatePath = path.join(BACKUPS_DIR, 'migrations', 'media-variants-candidate.json');
      let validationAfter: any = null;
      if (dryRun) {
        logMediaVariantStatus('Dry-run complete. No files, local state, or R2 objects were changed.');
      } else {
        validationAfter = await validateMediaState(state, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
        await fs.mkdir(path.dirname(candidatePath), { recursive: true });
        await fs.writeFile(candidatePath, JSON.stringify(state, null, 2), 'utf-8');
        logMediaVariantStatus(`Generated local assets and wrote candidate state to ${candidatePath}. Nothing was published.`);
      }

      const result = {
        success: failed.length === 0,
        dryRun,
        published: false,
        generated,
        failed,
        auditBefore,
        validationAfter,
        candidatePath: dryRun ? null : candidatePath,
      };

      mediaVariantsStatus.result = result;
      mediaVariantsStatus.audit = validationAfter || auditBefore;
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.phase = 'done';
      res.json(result);
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      logMediaVariantStatus(`Generation failed: ${mediaVariantsStatus.error}`);
      res.status(500).json({ error: mediaVariantsStatus.error, status: mediaVariantsStatus });
    }
  });

  app.get("/api/media-variants/status", (req, res) => {
    res.json(mediaVariantsStatus);
  });

  app.post("/api/media-variants/verify-published", async (req, res) => {
    try {
      resetMediaVariantsStatus('verify');
      mediaVariantsStatus.running = true;
      const audit = await verifyPublishedMediaVariants();
      mediaVariantsStatus.audit = audit;
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.phase = 'done';
      res.json({ success: true, audit, status: mediaVariantsStatus });
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      res.status(500).json({ error: mediaVariantsStatus.error, status: mediaVariantsStatus });
    }
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

  app.get("/api/media/exists", async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      if (!rawUrl) return res.json({ exists: false });

      let normalized = rawUrl.split('?')[0];
      if (/^https?:\/\//i.test(normalized)) {
        try {
          normalized = new URL(normalized).pathname;
        } catch {
          return res.json({ exists: false });
        }
      }

      let targetPath: string | null = null;
      if (normalized.startsWith('/data_v2/')) {
        targetPath = path.join(DATA_V2_DIR, normalized.replace('/data_v2/', ''));
      } else if (normalized.startsWith('/data/')) {
        targetPath = path.join(DATA_DIR, normalized.replace('/data/', ''));
      } else if (normalized.startsWith('/originals/')) {
        targetPath = path.join(ORIGINALS_DIR, normalized.replace('/originals/', ''));
      }

      if (!targetPath) {
        return res.json({ exists: false });
      }

      const stats = await fs.stat(targetPath).catch(() => null);
      return res.json({ exists: !!(stats && stats.isFile()) });
    } catch {
      return res.json({ exists: false });
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
      const { pushToR2, ...state } = req.body;
      await ensureStateVideoDimensions(state);
      await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });
      await backupState();

      const stateString = JSON.stringify(state, null, 2);
      await persistAcceptedState(state, path.join(DATA_DIR, 'state.json'));

      if (pushToR2) {
        console.log("[R2 Sync] Pushing state.json to R2...");
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: 'state.json',
          Body: Buffer.from(stateString),
          ContentType: "application/json; charset=utf-8",
        }));
        console.log("[R2 Sync] Pushing state.json to R2 completed successfully.");
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to save state:", e);
      const validationError = stateValidationHttpPayload(e);
      if (validationError) return res.status(validationError.status).json(validationError.body);
      res.status(500).json({ error: 'Failed to save state', details: e.message });
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

      // Update fields if provided (ensure they are strings)
      if (title !== undefined) {
        state.items[itemIndex].title = typeof title === 'object' ? (title.title || JSON.stringify(title)) : String(title);
      }
      if (description !== undefined) {
        state.items[itemIndex].description = typeof description === 'object' ? (description.description || description.text || JSON.stringify(description)) : String(description);
      }
      if (states !== undefined) state.items[itemIndex].states = states;
      
      // Auto-correct video dimensions if fallback
      await ensureStateVideoDimensions(state);

      // Update the lastUpdated timestamp so the frontend can detect the change
      state.lastUpdated = new Date().toISOString();

      await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });

      await backupState();
      const stateString = JSON.stringify(state, null, 2);
      await persistAcceptedState(state, statePath);
      
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
      const validationError = stateValidationHttpPayload(e);
      if (validationError) return res.status(validationError.status).json(validationError.body);
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
        if (cleanUrl.startsWith('/data_v2/')) {
          return path.join(DATA_V2_DIR, cleanUrl.replace('/data_v2/', ''));
        }
        if (cleanUrl.startsWith('/data/')) {
          return path.join(DATA_DIR, cleanUrl.replace('/data/', ''));
        } else if (cleanUrl.startsWith('/originals/')) {
          return path.join(ORIGINALS_DIR, cleanUrl.replace('/originals/', ''));
        }
        return null;
      };

      for (const item of itemsToDelete) {
        [item.image, item.image_thumb, item.image_1k, item.image_2k, item.image_large, item.image_3k, item.image_original].forEach(url => {
          const p = extractPath(url);
          if (p) filesToDelete.push(p);
        });
        
        if (item.mergedMedia) {
          for (const media of item.mergedMedia) {
            [media.image, media.image_thumb, media.image_1k, media.image_2k, media.image_large, media.image_3k, media.image_original].forEach((url: string) => {
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
      await persistAcceptedState(state, statePath);

      res.json({ success: true, deletedCount: itemsToDelete.length, filesDeleted: uniqueFiles.length });
    } catch (e) {
      console.error("Bulk delete error:", e);
      res.status(500).json({ error: 'Failed to bulk delete items' });
    }
  });

  // API route to list backups
  app.get("/api/backups", async (req, res) => {
    try {
      // 1. Get HTML backups (Full backups)
      const htmlFiles = await fs.readdir(BACKUPS_DIR);
      const fullBackups = htmlFiles
        .filter(f => f.endsWith('.html'))
        .map(f => ({ filename: f, type: 'full' }));

      // 2. Get JSON backups (Data backups)
      const jsonFiles = await fs.readdir(DATA_BACKUPS_DIR);
      const dataBackups = jsonFiles
        .filter(f => f.endsWith('.json'))
        .map(f => ({ filename: `data/${f}`, type: 'data' }));

      // Combine and sort by date (newest first)
      const allBackups = [...fullBackups, ...dataBackups].sort((a, b) => {
        // Extract timestamp from filename
        const getTime = (name: string) => {
          const match = name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
          return match ? match[1] : name;
        };
        return getTime(b.filename).localeCompare(getTime(a.filename));
      });

      res.json({ files: allBackups });
    } catch (e) {
      res.json({ files: [] });
    }
  });

  // API route to download a backup
  app.get("/api/backups/:folder/:filename", async (req, res) => {
    try {
      const { folder, filename } = req.params;
      const filepath = path.join(BACKUPS_DIR, folder, filename);
      res.download(filepath);
    } catch (e) {
      res.status(404).json({ error: 'Backup not found' });
    }
  });

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
        scrapeConfig: portfolioData.scrapeConfig || undefined,
        lastUpdated: new Date().toISOString()
      }, null, 2);

      const statePath = path.join(DATA_DIR, 'state.json');
      await backupState();
      await publishHtmlAndState(htmlContent, stateData);
      await persistAcceptedState(stateData, statePath);

      const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      res.json({
        success: true,
        restoredBackup: latestBackup,
        url: `${cleanBaseUrl}/index.html`,
        state: JSON.parse(stateData)
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
          movedCount: 0,
          movedBytes: 0,
          message: 'Keine verwaisten R2-Dateien gefunden.'
        });
      }

      const { movedItems, skippedKeys } = await moveR2ObjectsToTrash(
        report.orphaned,
        'orphaned-cleanup'
      );
      await syncStorageSize();

      res.json({
        success: true,
        movedCount: movedItems.length,
        movedBytes: report.totalBytes,
        skippedCount: skippedKeys.length,
        sampleKeys: report.sampleKeys,
        trashItems: movedItems
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
          movedCount: 0,
          movedBytes: 0,
          message: 'Keine Legacy-Duplikate gefunden.'
        });
      }

      const { movedItems, skippedKeys } = await moveR2ObjectsToTrash(
        report.duplicates,
        'legacy-duplicate-cleanup'
      );
      await syncStorageSize();

      res.json({
        success: true,
        movedCount: movedItems.length,
        movedBytes: report.totalBytes,
        skippedCount: skippedKeys.length,
        sampleKeys: report.sampleKeys,
        trashItems: movedItems
      });
    } catch (error: any) {
      console.error("Error deleting legacy duplicates:", error);
      res.status(500).json({ error: error.message || 'Legacy-Duplikat-Cleanup fehlgeschlagen' });
    }
  });

  app.get("/api/r2-trash", async (req, res) => {
    try {
      const items = await listTrashObjects();
      const totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
      res.json({ success: true, items, totalBytes, count: items.length });
    } catch (error: any) {
      console.error("Error loading trash items:", error);
      res.status(500).json({ error: error.message || 'Trash list failed' });
    }
  });

  app.post("/api/r2-trash/restore", async (req, res) => {
    try {
      const trashKeys = Array.isArray(req.body?.trashKeys)
        ? req.body.trashKeys.filter((key: any) => typeof key === 'string' && key.startsWith(TRASH_PREFIX))
        : [];
      if (trashKeys.length === 0) {
        return res.status(400).json({ error: 'trashKeys required' });
      }

      const { restoredItems, skippedKeys, conflicts } = await restoreTrashObjects(trashKeys);
      await syncStorageSize();

      res.json({
        success: true,
        restoredCount: restoredItems.length,
        skippedCount: skippedKeys.length,
        conflictCount: conflicts.length,
        conflicts,
        restoredItems
      });
    } catch (error: any) {
      console.error("Error restoring trash items:", error);
      res.status(500).json({ error: error.message || 'Trash restore failed' });
    }
  });

  app.post("/api/r2-trash/delete", async (req, res) => {
    try {
      const trashKeys = Array.isArray(req.body?.trashKeys)
        ? req.body.trashKeys.filter((key: any) => typeof key === 'string' && key.startsWith(TRASH_PREFIX))
        : [];
      if (trashKeys.length === 0) {
        return res.status(400).json({ error: 'trashKeys required' });
      }

      const { deletedKeys, skippedKeys } = await deleteTrashObjects(trashKeys);
      await syncStorageSize();

      res.json({
        success: true,
        deletedCount: deletedKeys.length,
        skippedCount: skippedKeys.length
      });
    } catch (error: any) {
      console.error("Error permanently deleting trash items:", error);
      res.status(500).json({ error: error.message || 'Trash delete failed' });
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



      // 2. Back up local state, then upload validated index.html and state.json.
      await backupState();
      await publishHtmlAndState(htmlContent, finalStateData);

      // 3. Also save the published state locally so /api/state stays in sync
      await persistAcceptedState(finalStateData, path.join(DATA_DIR, 'state.json'));

    const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/index.html`;

    res.json({ success: true, url });
    } catch (error: any) {
      console.error("Error publishing to Cloudflare:", error);
      const validationError = stateValidationHttpPayload(error);
      if (validationError) return res.status(validationError.status).json(validationError.body);
      res.status(500).json({ error: error.message || "Failed to publish to Cloudflare" });
    }
  });

  // API route to upload an image, store local variants, and mirror to R2 immediately when possible
  app.post("/api/upload-image", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
      }

      const normalizedImage = await normalizeUploadedImage(req.file);
      const ext = normalizedImage.ext;
      const imageBuffer = normalizedImage.buffer;
      const baseName = `img-${Date.now()}`;
      const variantSet = await materializeVariantSet(imageBuffer, {
        group: 'uploads',
        baseName,
        originalBuffer: imageBuffer,
        originalExt: ext,
        uploadToCloud: false,
      });

      const canUploadDirectly = hasR2UploadCredentials();
      const directUploadResult = canUploadDirectly
        ? await uploadVariantSetToR2(variantSet, {
            group: 'uploads',
            originalBuffer: imageBuffer,
            originalExt: ext,
          })
        : {
            remoteUrls: {} as Record<string, string>,
            uploadErrors: [] as string[],
          };
      const remoteUrls: Record<string, string> = directUploadResult.remoteUrls;
      const uploadErrors = directUploadResult.uploadErrors;

      const localThumb = variantSet.localUrls.image_thumb || '';
      const local1k = variantSet.localUrls.image_1k || '';
      const local2k = variantSet.localUrls.image_2k || '';
      const local3k = variantSet.localUrls.image_3k || '';
      const localLarge = local2k || local3k || local1k || localThumb;
      const localOriginal = variantSet.localUrls.image_original || '';
      const remoteThumb = remoteUrls.image_thumb || '';
      const remote1k = remoteUrls.image_1k || '';
      const remote2k = remoteUrls.image_2k || '';
      const remote3k = remoteUrls.image_3k || '';
      const remoteLarge = remote2k || remote3k || remote1k || remoteThumb || '';
      const remoteOriginal = remoteUrls.image_original || '';
      const localLargeVariant = local2k ? '2k' : (local3k ? '3k' : (local1k ? '1k' : 'thumb'));
      const cloudUploaded = canUploadDirectly && uploadErrors.length === 0 && Object.keys(remoteUrls).length > 0;

      res.json({
        success: true, 
        cloudUploaded,
        cloudUploadErrors: uploadErrors,
        // Prefer the direct R2 URLs when available, but keep local URLs as a fallback.
        url: remoteThumb || localThumb,
        url_1k: remote1k || local1k,
        url_2k: remote2k || local2k,
        url_3k: remote3k || local3k,
        url_large: remoteLarge || localLarge,
        url_original: remoteOriginal || localOriginal,
        image_thumb: remoteThumb || localThumb,
        image_1k: remote1k || local1k,
        image_2k: remote2k || local2k,
        image_3k: remote3k || local3k,
        image_original: remoteOriginal || localOriginal,
        image_width: variantSet.sourceWidth,
        image_height: variantSet.sourceHeight,
        local_large_variant: localLargeVariant,
        missing_variants: variantSet.missingVariants,
        remote_urls: remoteUrls,
        source_format: normalizedImage.inputFormat,
        converted_to_jpeg: normalizedImage.convertedToJpeg,
      });
    } catch (error: any) {
      console.error("Error processing local image upload:", error);
      res.status(500).json({ error: error.message || "Failed to process local image upload" });
    }
  });

  // API route to upload a video, extract thumbnail via ffmpeg, generate variants
  app.post("/api/upload-video", upload.single("video"), async (req, res) => {
    let tmpDir: string | null = null;
    let thumbBuffer: Buffer | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video provided" });
      }

      const ext = (req.file.originalname.split('.').pop() || 'mp4').toLowerCase();
      const baseName = `vid-${Date.now()}`;
      const group = 'uploads';
      
      // Save original video
      const originalFilename = `${baseName}.${ext}`;
      const originalPath = getVariantLocalPath(group, 'originals', originalFilename);
      await fs.writeFile(originalPath, req.file.buffer);
      const originalUrl = getVariantLocalUrl(group, 'originals', originalFilename);

      // Extract thumbnail via ffmpeg (frame at 1 second)
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vidthumb-'));
      const tmpVideoPath = path.join(tmpDir, `input.${ext}`);
      await fs.writeFile(tmpVideoPath, req.file.buffer);
      const thumbPath = path.join(tmpDir, 'thumb.jpg');

      let ffmpegAvailable = false;
      // Normalize paths to forward slashes – ffmpeg on Windows accepts them, and cmd.exe handles them better
      const ffInput = tmpVideoPath.replace(/\\/g, '/');
      const ffThumb = thumbPath.replace(/\\/g, '/');

      const tryFfmpegFrame = async (seconds: number): Promise<Buffer | null> => {
        try {
          const cmd = `ffmpeg -y -i "${ffInput}" -ss ${seconds.toFixed(2)} -frames:v 1 -q:v 2 "${ffThumb}"`;
          await execAsync(cmd, { timeout: 30000 });
          const data = await fs.readFile(thumbPath).catch(() => null);
          if (data && data.length > 100) return data;
          return null;
        } catch (e: any) {
          console.warn(`ffmpeg frame at ${seconds}s failed:`, e.stderr || e.message);
          return null;
        }
      };

      // Try frame at 1s, then 0.1s
      thumbBuffer = await tryFfmpegFrame(1);
      if (!thumbBuffer) thumbBuffer = await tryFfmpegFrame(0.1);
      if (thumbBuffer) ffmpegAvailable = true;

      // Transcode to MP4 if not already browser-compatible (mov, avi, mkv, etc.)
      let browserUrl = originalUrl;
      if (ext !== 'mp4' && ext !== 'webm' && ffmpegAvailable) {
        try {
          const mp4Out = path.join(tmpDir, 'output.mp4').replace(/\\/g, '/');
          await execAsync(`ffmpeg -y -i "${ffInput}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${mp4Out}"`, { timeout: 120000 });
          const mp4Path = path.join(tmpDir, 'output.mp4');
          const mp4Stat = await fs.stat(mp4Path).catch(() => null);
          if (mp4Stat && mp4Stat.size > 0) {
            const mp4Filename = `${baseName}.mp4`;
            const mp4DestPath = getVariantLocalPath(group, 'originals', mp4Filename);
            await fs.writeFile(mp4DestPath, await fs.readFile(mp4Path));
            browserUrl = getVariantLocalUrl(group, 'originals', mp4Filename);
          }
        } catch (transcodeErr: any) {
          console.warn("ffmpeg transcode to MP4 failed:", transcodeErr.stderr || transcodeErr.message);
        }
      }

      let variantSet: any = {};
      if (thumbBuffer && thumbBuffer.length > 0) {
        variantSet = await materializeVariantSet(thumbBuffer, {
          group: 'uploads',
          baseName,
          originalBuffer: thumbBuffer,
          originalExt: 'jpg',
          uploadToCloud: false,
        });
      }

      const localThumb = variantSet.localUrls?.image_thumb || '';
      const local1k = variantSet.localUrls?.image_1k || '';
      const local2k = variantSet.localUrls?.image_2k || '';
      const local3k = variantSet.localUrls?.image_3k || '';
      const localOriginal = variantSet.localUrls?.image_original || '';

      res.json({
        success: true,
        type: 'video',
        url: browserUrl,
        image: local2k || local3k || local1k || localThumb || '',
        image_thumb: localThumb,
        image_1k: local1k,
        image_2k: local2k,
        image_3k: local3k,
        image_original: originalUrl,
        image_width: variantSet.sourceWidth || 0,
        image_height: variantSet.sourceHeight || 0,
        missing_variants: variantSet.missingVariants || [],
      });
    } catch (error: any) {
      console.error("Error processing video upload:", error);
      res.status(500).json({ error: error.message || "Failed to process video upload" });
    } finally {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  // ── Background task tracker for Bunny uploads ──
  const bunnyTasks = new Map<string, { step: string; progress: number; result?: any; error?: string; startedAt: number }>();
  // Auto-clean old tasks after 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, task] of bunnyTasks) {
      if (now - task.startedAt > 600_000) bunnyTasks.delete(id);
    }
  }, 120_000);

  const sanitizeProjectName = (name: string) =>
    (name || 'uncategorized')
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\-_ ]/gi, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 60) || 'uncategorized';

  // Helper: get project subfolder path within a variant dir
  const getProjectSubPath = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, projectName: string, projectId: string, filename: string) => {
    const safeName = sanitizeProjectName(projectName);
    const subfolder = `${safeName}_${projectId}`;
    const groupDir = getGroupBaseDir(group);
    return path.join(groupDir, dir, subfolder, filename);
  };
  const getProjectSubUrl = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, projectName: string, projectId: string, filename: string) => {
    const safeName = sanitizeProjectName(projectName);
    const subfolder = `${safeName}_${projectId}`;
    return joinUrlPath('data_v2', group, dir, subfolder, filename);
  };

  // Hybrid: upload video to local + Bunny Stream, get immediate ffmpeg thumb + better Bunny thumb later
  // Phase 1 (synchronous): save locally, extract thumbnail → return immediately
  // Phase 2 (background): upload to Bunny, poll for thumbnail, generate variants
  app.post("/api/upload-video-to-bunny", upload.single("video"), async (req, res) => {
    // Check if Bunny is configured BEFORE any processing
    if (!BUNNY_CONFIG.apiKey || !BUNNY_CONFIG.libraryId) {
      return res.status(400).json({ error: "Bunny nicht konfiguriert (API Key oder Library ID fehlt)", bunnyMissing: true });
    }

    let tmpDir: string | null = null;
    let thumbBuffer: Buffer | null = null;
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video provided" });
      }

      const projectId = (req.body?.projectId || '').toString();
      const projectName = (req.body?.projectName || '').toString();
      const projectDescription = (req.body?.projectDescription || '').toString();
      const ext = (req.file.originalname.split('.').pop() || 'mp4').toLowerCase();
      const baseName = `vidbunny-${Date.now()}`;
      const group = 'uploads';

      // ── Phase 1a: Save original video locally (in project subfolder if available) ──
      let originalPath: string;
      let originalUrl: string;
      if (projectName && projectId) {
        // Ensure subfolder exists
        const safeName = sanitizeProjectName(projectName);
        const subfolder = `${safeName}_${projectId}`;
        const subDir = path.join(getGroupBaseDir(group), 'originals', subfolder);
        await fs.mkdir(subDir, { recursive: true }).catch(() => {});
        originalPath = path.join(subDir, `${baseName}.${ext}`);
        originalUrl = getProjectSubUrl(group, 'originals', projectName, projectId, `${baseName}.${ext}`);
      } else {
        originalPath = getVariantLocalPath(group, 'originals', `${baseName}.${ext}`);
        originalUrl = getVariantLocalUrl(group, 'originals', `${baseName}.${ext}`);
      }
      await fs.writeFile(originalPath, req.file.buffer);

      // ── Phase 1b: Extract ffmpeg thumbnail (immediate preview) ──
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vidthumb-'));
      const tmpVideoPath = path.join(tmpDir, `input.${ext}`);
      await fs.writeFile(tmpVideoPath, req.file.buffer);
      const ffmpegThumbPath = path.join(tmpDir, 'thumb.jpg');

      const ffInputB = tmpVideoPath.replace(/\\/g, '/');
      const ffThumbB = ffmpegThumbPath.replace(/\\/g, '/');

      const tryFfmpegFrameB = async (seconds: number): Promise<Buffer | null> => {
        try {
          const cmd = `ffmpeg -y -i "${ffInputB}" -ss ${seconds.toFixed(2)} -frames:v 1 -q:v 2 "${ffThumbB}"`;
          await execAsync(cmd, { timeout: 30000 });
          const data = await fs.readFile(ffmpegThumbPath).catch(() => null);
          if (data && data.length > 100) return data;
          return null;
        } catch (e: any) {
          console.warn(`[bunny-hybrid] ffmpeg frame at ${seconds}s failed:`, e.stderr || e.message);
          return null;
        }
      };

      thumbBuffer = await tryFfmpegFrameB(1);
      if (!thumbBuffer) thumbBuffer = await tryFfmpegFrameB(0.1);

      let localVariantSet: any = {};
      if (thumbBuffer && thumbBuffer.length > 0) {
        localVariantSet = await materializeVariantSet(thumbBuffer, {
          group: 'uploads',
          baseName: `${baseName}_local`,
          originalBuffer: thumbBuffer,
          originalExt: 'jpg',
          uploadToCloud: true,
        });
      }

      const localThumb = localVariantSet.localUrls?.image_thumb || '';
      const local1k = localVariantSet.localUrls?.image_1k || '';
      const local2k = localVariantSet.localUrls?.image_2k || '';
      const local3k = localVariantSet.localUrls?.image_3k || '';
      const previewCloudUploaded = !!Object.keys(localVariantSet.remoteUrls || {}).length;

      // ── Phase 2: Start Bunny upload in background ──
      const taskId = `bunny-${Date.now()}-${Math.random().toString(36).substring(4)}`;
      const videoBuffer = req.file.buffer;
      const originalFilename = req.file.originalname || `Video-${Date.now()}`;
      // Build rich title: project name + filename for easy searching in Bunny dashboard
      const bunnyTitle = projectName
        ? `${projectName} — ${originalFilename}`
        : originalFilename;

      bunnyTasks.set(taskId, { step: 'starting', progress: 0, startedAt: Date.now() });

      // Launch background task (do NOT await)
      (async () => {
        try {
          bunnyTasks.set(taskId, { step: 'creating', progress: 5, startedAt: Date.now() });

          // Step A: Create Bunny video entry with descriptive title
          const createUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos`;
          const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: {
              "AccessKey": BUNNY_CONFIG.apiKey,
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ title: bunnyTitle })
          });
          if (!createRes.ok) throw new Error(`Bunny create error: ${createRes.statusText}`);
          const videoData: any = await createRes.json();
          const videoId = videoData.guid;

          bunnyTasks.set(taskId, { step: 'uploading', progress: 15, startedAt: Date.now() });

          // Step B: Upload video data to Bunny
          const uploadUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos/${videoId}`;
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              "AccessKey": BUNNY_CONFIG.apiKey,
              "Content-Type": "application/octet-stream"
            },
            body: videoBuffer
          });
          if (!uploadRes.ok) throw new Error(`Bunny upload error: ${uploadRes.statusText}`);

          // Step B2: Add project context as metaTags (searchable in Bunny dashboard)
          bunnyTasks.set(taskId, { step: 'uploading', progress: 45, startedAt: Date.now() });
          try {
            const metaPayload: any = { title: bunnyTitle };
            const metaTags: { property: string; value: string }[] = [];
            if (projectName) metaTags.push({ property: 'project', value: projectName });
            if (projectId) metaTags.push({ property: 'projectId', value: projectId });
            if (projectDescription) {
              // Bunny limits values; truncate to reasonable size
              metaTags.push({ property: 'description', value: projectDescription.substring(0, 500) });
            }
            if (metaTags.length > 0) metaPayload.metaTags = metaTags;

            await fetch(uploadUrl, {
              method: 'POST',
              headers: {
                "AccessKey": BUNNY_CONFIG.apiKey,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(metaPayload)
            });
          } catch (metaErr: any) {
            console.warn('[bunny-bg] Failed to set metaTags:', metaErr.message);
            // Non-fatal: continue even if metaTags fail
          }

          bunnyTasks.set(taskId, { step: 'encoding', progress: 50, startedAt: Date.now() });

          // Step C: Poll Bunny for encoding & thumbnail (max 45 seconds)
          let bunnyThumbUrl = '';
          let bunnyDuration = 0;
          const metaUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos/${videoId}`;

          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise(r => setTimeout(r, 3000));
            const pollProgress = 50 + Math.floor((attempt / 15) * 40); // 50%–90%
            bunnyTasks.set(taskId, { step: 'encoding', progress: pollProgress, startedAt: Date.now() });
            try {
              const metaRes = await fetch(metaUrl, {
                headers: { "AccessKey": BUNNY_CONFIG.apiKey, "Accept": "application/json" }
              });
              if (!metaRes.ok) continue;
              const meta: any = await metaRes.json();
              bunnyDuration = meta.length || 0;
              const thumbFilename = meta.thumbnailFileName;
              if (meta.status === 'finished' && thumbFilename) {
                bunnyThumbUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/${thumbFilename}`;
                break;
              }
            } catch {}
          }

          bunnyTasks.set(taskId, { step: 'variants', progress: 90, startedAt: Date.now() });

          // Step D: Generate variants from Bunny thumbnail (better quality)
          let bunnyVariantSet: any = {};
          if (bunnyThumbUrl) {
            try {
              const thumbFetchRes = await fetch(bunnyThumbUrl);
              if (thumbFetchRes.ok) {
                const arrayBuffer = await thumbFetchRes.arrayBuffer();
                const bunnyThumbBuffer = Buffer.from(arrayBuffer);
                bunnyVariantSet = await materializeVariantSet(bunnyThumbBuffer, {
                  group: 'uploads',
                  baseName,
                  originalBuffer: bunnyThumbBuffer,
                  originalExt: 'jpg',
                  uploadToCloud: true,
                });
              }
            } catch (bErr: any) {
              console.warn("Bunny thumbnail variant generation failed:", bErr.message);
            }
          }

          const finalThumb = bunnyVariantSet.localUrls?.image_thumb || localThumb;
          const final1k = bunnyVariantSet.localUrls?.image_1k || local1k;
          const final2k = bunnyVariantSet.localUrls?.image_2k || local2k;
          const final3k = bunnyVariantSet.localUrls?.image_3k || local3k;
          const bunnyThumbCloudUploaded = !!Object.keys(bunnyVariantSet.remoteUrls || {}).length;

          bunnyTasks.set(taskId, {
            step: 'done', progress: 100, startedAt: Date.now(),
            result: {
              success: true, type: 'bunny',
              libraryId: BUNNY_CONFIG.libraryId, videoId,
              url: `https://iframe.mediadelivery.net/embed/${BUNNY_CONFIG.libraryId}/${videoId}`,
              image: final2k || final3k || final1k || finalThumb || bunnyThumbUrl || '',
              image_thumb: finalThumb,
              image_1k: final1k, image_2k: final2k, image_3k: final3k,
              image_original: `https://iframe.mediadelivery.net/embed/${BUNNY_CONFIG.libraryId}/${videoId}`,
              image_width: bunnyVariantSet.sourceWidth || localVariantSet.sourceWidth || 0,
              image_height: bunnyVariantSet.sourceHeight || localVariantSet.sourceHeight || 0,
              duration: bunnyDuration,
              bunnyThumbUrl,
              previewCloudUploaded,
              bunnyThumbCloudUploaded,
            }
          });
        } catch (bgError: any) {
          console.error("[bunny-bg] Background upload failed:", bgError.message);
          bunnyTasks.set(taskId, {
            step: 'error', progress: 0, startedAt: Date.now(),
            error: bgError.message || 'Unknown background error'
          });
        }
      })();

      // ── Respond immediately with local results ──
      res.json({
        success: true,
        type: 'video', // local for now; will update to 'bunny' when bg task completes
        url: originalUrl,
        image: local2k || local3k || local1k || localThumb || '',
        image_thumb: localThumb,
        image_1k: local1k,
        image_2k: local2k,
        image_3k: local3k,
        image_original: originalUrl,
        image_width: localVariantSet.sourceWidth || 0,
        image_height: localVariantSet.sourceHeight || 0,
        previewCloudUploaded,
        bunnyTaskId: taskId,
        bunnyStatus: 'starting',
      });
    } catch (error: any) {
      console.error("[hybrid] Error processing video upload:", error.message);
      if (error.response) console.error("[hybrid] Bunny API status:", error.response.status, error.response.statusText);
      res.status(500).json({ error: error.message || "Failed to process hybrid video upload", bunnyMissing: false });
    } finally {
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  // Poll Bunny background task status
  app.get("/api/bunny/task/:taskId/status", (req, res) => {
    const { taskId } = req.params;
    const task = bunnyTasks.get(taskId);
    if (!task) {
      return res.json({ step: 'unknown', progress: 0, found: false });
    }
    res.json({
      step: task.step,
      progress: task.progress,
      result: task.result || null,
      error: task.error || null,
      found: true,
    });
  });

  // Update Bunny video metadata (title + metaTags) when project title/description changes
  app.post("/api/bunny/update-video-metadata", async (req, res) => {
    try {
      const { videoId, libraryId, title, projectId, description } = req.body;
      if (!videoId) {
        return res.status(400).json({ error: "videoId is required" });
      }
      if (!BUNNY_CONFIG.apiKey) {
        return res.status(400).json({ error: "Bunny API key not configured" });
      }

      const libId = libraryId || BUNNY_CONFIG.libraryId;
      const updateUrl = `https://video.bunnycdn.com/library/${libId}/videos/${videoId}`;

      const metaPayload: any = {};
      if (title) metaPayload.title = title;

      const metaTags: { property: string; value: string }[] = [];
      if (title) metaTags.push({ property: 'project', value: title });
      if (projectId) metaTags.push({ property: 'projectId', value: String(projectId) });
      if (description) metaTags.push({ property: 'description', value: String(description).substring(0, 500) });
      if (metaTags.length > 0) metaPayload.metaTags = metaTags;

      if (Object.keys(metaPayload).length === 0) {
        return res.json({ success: true, message: 'Nothing to update' });
      }

      const updateRes = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          "AccessKey": BUNNY_CONFIG.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(metaPayload)
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text().catch(() => '');
        throw new Error(`Bunny update error ${updateRes.status}: ${errText || updateRes.statusText}`);
      }

      res.json({ success: true, message: `Updated metadata for video ${videoId}` });
    } catch (error: any) {
      console.error("[bunny-meta] Failed to update video metadata:", error.message);
      res.status(500).json({ error: error.message || "Failed to update Bunny metadata" });
    }
  });

  // Rename project folder when project name changes
  app.post("/api/rename-project-folder", async (req, res) => {
    try {
      const { projectId, oldName, newName } = req.body;
      if (!projectId || !newName) {
        return res.status(400).json({ error: "projectId and newName are required" });
      }

      const oldSafe = sanitizeProjectName(oldName || '');
      const newSafe = sanitizeProjectName(newName);
      if (oldSafe === newSafe && oldName) {
        return res.json({ success: true, changed: false, message: 'Name unchanged after sanitization' });
      }

      const group = 'uploads';
      const dirs = ['originals', 'thumbs400', '1k', '2k', '3k'];
      let renamed = 0;

      for (const dir of dirs) {
        const groupDir = getGroupBaseDir(group);
        const baseDir = path.join(groupDir, dir);

        // Find old folder: {oldSafe}_{projectId}
        let oldFolder: string | null = null;
        if (oldSafe) {
          const candidate = path.join(baseDir, `${oldSafe}_${projectId}`);
          try { await fs.access(candidate); oldFolder = candidate; } catch {}
        }
        // If oldName not given or not found, search by projectId suffix
        if (!oldFolder) {
          try {
            const entries = await fs.readdir(baseDir);
            for (const entry of entries) {
              if (entry.endsWith(`_${projectId}`)) {
                const candidate = path.join(baseDir, entry);
                const stat = await fs.stat(candidate);
                if (stat.isDirectory()) { oldFolder = candidate; break; }
              }
            }
          } catch {}
        }

        if (!oldFolder) continue;

        const newFolder = path.join(baseDir, `${newSafe}_${projectId}`);
        if (oldFolder === newFolder) continue;

        await fs.rename(oldFolder, newFolder);
        renamed++;
      }

      // Update URLs in state.json
      if (renamed > 0 && oldSafe) {
        const statePath = path.join(DATA_DIR, 'state.json');
        try {
          let state: any = { items: [] };
          const raw = await fs.readFile(statePath, 'utf-8');
          state = JSON.parse(raw);
          const oldSubPath = `/${oldSafe}_${projectId}/`;
          const newSubPath = `/${newSafe}_${projectId}/`;
          let stateChanged = false;
          const replacer = (obj: any): any => {
            if (typeof obj === 'string' && obj.includes(oldSubPath)) {
              stateChanged = true;
              return obj.split(oldSubPath).join(newSubPath);
            }
            if (Array.isArray(obj)) return obj.map(replacer);
            if (obj && typeof obj === 'object') {
              const n: any = {};
              for (const [k, v] of Object.entries(obj)) n[k] = replacer(v);
              return n;
            }
            return obj;
          };
          const newState = replacer(state);
          if (stateChanged) {
            await persistAcceptedState(newState, statePath, true);
          }
        } catch (e) {
          console.warn('Failed to update state.json after rename:', e);
        }
      }

      res.json({ success: true, changed: renamed > 0, renamed });
    } catch (error: any) {
      console.error("Error renaming project folder:", error);
      res.status(500).json({ error: error.message || "Failed to rename project folder" });
    }
  });

  // Check Bunny connection status
  app.get("/api/bunny/check", async (req, res) => {
    const hasApiKey = !!BUNNY_CONFIG.apiKey;
    const hasLibraryId = !!BUNNY_CONFIG.libraryId;
    const hasPullZone = !!BUNNY_CONFIG.pullZone;

    if (!hasApiKey || !hasLibraryId) {
      return res.json({
        configured: false,
        hasApiKey,
        hasLibraryId,
        hasPullZone,
        message: 'Bunny nicht konfiguriert — .env fehlt BUNNY_API_KEY oder BUNNY_LIBRARY_ID'
      });
    }

    try {
      const testUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos?page=1&itemsPerPage=1`;
      const testRes = await fetch(testUrl, {
        headers: { "AccessKey": BUNNY_CONFIG.apiKey, "Accept": "application/json" }
      });
      if (testRes.ok) {
        res.json({ configured: true, reachable: true, hasApiKey, hasLibraryId, hasPullZone, message: 'Bunny API erreichbar ✓' });
      } else {
        res.json({ configured: true, reachable: false, hasApiKey, hasLibraryId, hasPullZone, message: `Bunny API antwortet mit ${testRes.status}: ${testRes.statusText}` });
      }
    } catch (e: any) {
      res.json({ configured: true, reachable: false, hasApiKey, hasLibraryId, hasPullZone, message: `Bunny nicht erreichbar: ${e.message}` });
    }
  });

  app.post("/api/upload-bunny", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video provided" });
      }

      if (!BUNNY_CONFIG.apiKey || !BUNNY_CONFIG.libraryId) {
        throw new Error("Bunny API key or Library ID not configured in .env");
      }

      const title = req.file.originalname || `Video-${Date.now()}`;
      
      const createUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos`;
      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          "AccessKey": BUNNY_CONFIG.apiKey,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title })
      });
      if (!createRes.ok) throw new Error(`Bunny create error: ${createRes.statusText}`);
      const videoData: any = await createRes.json();
      const videoId = videoData.guid;

      const uploadUrl = `https://video.bunnycdn.com/library/${BUNNY_CONFIG.libraryId}/videos/${videoId}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          "AccessKey": BUNNY_CONFIG.apiKey,
          "Content-Type": "application/octet-stream"
        },
        body: req.file.buffer
      });
      if (!uploadRes.ok) throw new Error(`Bunny upload error: ${uploadRes.statusText}`);

      res.json({
        success: true,
        type: 'bunny',
        libraryId: BUNNY_CONFIG.libraryId,
        videoId: videoId,
        message: 'Video uploaded to Bunny Stream. Processing might take a moment.'
      });

    } catch (error: any) {
      console.error("Error processing Bunny video upload:", error);
      res.status(500).json({ error: error.message || "Failed to process Bunny video upload" });
    }
  });

  app.post("/api/bunny/sync-video", async (req, res) => {
    try {
      const { libraryId, videoId } = req.body;
      if (!libraryId || !videoId) {
        return res.status(400).json({ error: "Missing libraryId or videoId" });
      }
      if (!BUNNY_CONFIG.apiKey || !BUNNY_CONFIG.pullZone) {
        throw new Error("Bunny API key or Pull Zone not configured in .env");
      }

      const metaUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;
      const metaRes = await fetch(metaUrl, {
        headers: {
          "AccessKey": BUNNY_CONFIG.apiKey,
          "Accept": "application/json"
        }
      });
      if (!metaRes.ok) throw new Error(`Bunny metadata error: ${metaRes.statusText}`);
      const metadata: any = await metaRes.json();

      const thumbFilename = metadata.thumbnailFileName || 'thumbnail.jpg';
      const thumbUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/${thumbFilename}`;
      const thumbFetchRes = await fetch(thumbUrl);
      
      let variantSet: any = {};
      if (thumbFetchRes.ok) {
        const arrayBuffer = await thumbFetchRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const baseName = `bunny-${videoId}`;
        
        variantSet = await materializeVariantSet(buffer, {
          group: 'uploads',
          baseName,
          originalBuffer: buffer,
          originalExt: 'jpg',
          uploadToCloud: true,
        });
      }

      res.json({
        success: true,
        type: 'bunny',
        libraryId,
        videoId,
        duration: metadata.length || 0,
        url: thumbUrl,
        ... (variantSet.remoteUrls || {})
      });
    } catch (error: any) {
      console.error("Error syncing Bunny video:", error);
      res.status(500).json({ error: error.message || "Failed to sync Bunny video" });
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

  // Lightweight health check for batch file & auto-reload
  app.get("/api/ping", (req, res) => {
    res.json({ ok: true, time: Date.now() });
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
