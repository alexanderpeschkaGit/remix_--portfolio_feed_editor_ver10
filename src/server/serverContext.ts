import "dotenv/config";
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { BAK_DIR_NAME } from "./mediaDeletion.ts";

export const execAsync = promisify(exec);

export const pickBestImage = (...candidates: any[]) =>
  candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());

export const upload = multer({ storage: multer.memoryStorage() });

export const DATA_DIR = path.join(process.cwd(), 'data');
export const DATA_V2_DIR = path.join(process.cwd(), 'data_v2');
export const BACKUPS_DIR = path.join(process.cwd(), 'backups');
export const DATA_BACKUPS_DIR = path.join(BACKUPS_DIR, 'data');
export const ORIGINALS_DIR = path.join(process.cwd(), 'originals');
export const BAK_DIR = path.join(process.cwd(), BAK_DIR_NAME);
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const UPLOADS_ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
export const UPLOADS_2K_DIR = path.join(UPLOADS_DIR, '2k');
export const UPLOADS_3K_DIR = path.join(UPLOADS_DIR, '3k');
export const UPLOADS_THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
export const SYNC_DIR = path.join(DATA_DIR, 'sync');
export const HIGHRES_DIR = path.join(DATA_DIR, 'highres');
export const PREVIEWS_DIR = path.join(DATA_DIR, 'previews');
export const SYNC_MANIFEST_KEY = '.sync-manifest.json';
export const TRASH_PREFIX = 'trash/';
export const V2_PREFIX = 'v2/data';

export const V2_MEDIA_GROUPS = {
  uploads: path.join(DATA_V2_DIR, 'uploads'),
  flickr: path.join(DATA_V2_DIR, 'flickr'),
  instagram: path.join(DATA_V2_DIR, 'instagram'),
  highres: path.join(DATA_V2_DIR, 'highres'),
  previews: path.join(DATA_V2_DIR, 'previews'),
} as const;

export const MEDIA_VARIANTS = [
  { field: 'image_thumb', dir: 'thumbs400', suffix: 'thumb', maxSide: 400, quality: 74, alwaysCreate: true },
  { field: 'image_1k', dir: '1k', suffix: '1k', maxSide: 1024, quality: 78, alwaysCreate: false },
  { field: 'image_2k', dir: '2k', suffix: '2k', maxSide: 2048, quality: 80, alwaysCreate: false },
  { field: 'image_3k', dir: '3k', suffix: '3k', maxSide: 3072, quality: 82, alwaysCreate: false },
] as const;

export async function ensureServerDirectories() {
  const dirs = [
    DATA_DIR,
    DATA_V2_DIR,
    BACKUPS_DIR,
    DATA_BACKUPS_DIR,
    ORIGINALS_DIR,
    BAK_DIR,
    UPLOADS_DIR,
    UPLOADS_ORIGINALS_DIR,
    UPLOADS_2K_DIR,
    UPLOADS_3K_DIR,
    UPLOADS_THUMBS_DIR,
    SYNC_DIR,
    HIGHRES_DIR,
    PREVIEWS_DIR,
  ];

  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (err: any) {
      console.warn(`[serverContext] Could not create directory ${dir}:`, err?.message || err);
    }
  }

  for (const groupDir of Object.values(V2_MEDIA_GROUPS)) {
    try {
      await fs.mkdir(groupDir, { recursive: true });
    } catch (err: any) {
      console.warn(`[serverContext] Could not create directory ${groupDir}:`, err?.message || err);
    }
    try {
      await fs.mkdir(path.join(groupDir, 'originals'), { recursive: true });
    } catch (err: any) {
      console.warn(`[serverContext] Could not create directory ${path.join(groupDir, 'originals')}:`, err?.message || err);
    }
    for (const variant of MEDIA_VARIANTS) {
      try {
        await fs.mkdir(path.join(groupDir, variant.dir), { recursive: true });
      } catch (err: any) {
        console.warn(`[serverContext] Could not create directory ${path.join(groupDir, variant.dir)}:`, err?.message || err);
      }
    }
  }
}

const resolvedPublicUrl = process.env.CLOUDFLARE_PUBLIC_DOMAIN
  ? (process.env.CLOUDFLARE_PUBLIC_DOMAIN.startsWith('http') ? process.env.CLOUDFLARE_PUBLIC_DOMAIN : `https://${process.env.CLOUDFLARE_PUBLIC_DOMAIN}`)
  : "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev";

export const R2_CONFIG = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "9b109aa9587252172ccb60f664f603f0",
  accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || "0e11678f19a97c193c9a5647f7c4b37b",
  secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d",
  bucketName: process.env.CLOUDFLARE_BUCKET_NAME || "portfoliodata",
  publicDomain: resolvedPublicUrl,
  publicUrl: resolvedPublicUrl,
};

export const R2_STORAGE_KEYS = {
  STATE_FILE: process.env.R2_STATE_KEY || 'state.json',
  SYNC_MANIFEST: '.sync-manifest.json',
  BACKUP_PREFIX: 'bak/',
  TRASH_PREFIX: 'trash/',
  V2_DATA_PREFIX: 'v2/data',
} as const;

export function isR2Configured(): boolean {
  return Boolean(
    R2_CONFIG.accountId &&
    R2_CONFIG.accessKeyId &&
    R2_CONFIG.secretAccessKey &&
    R2_CONFIG.bucketName
  );
}

export function resolveR2PublicUrl(keyOrLocalPath: string): string | null {
  const baseUrl = (R2_CONFIG.publicUrl || '').replace(/\/+$/, '');
  if (!baseUrl) return null;

  const clean = keyOrLocalPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean === 'data/state.json' || clean === 'state.json') {
    return `${baseUrl}/state.json`;
  }
  if (clean.startsWith('data_v2/')) {
    return `${baseUrl}/v2/data/${clean.slice('data_v2/'.length)}`;
  }
  if (clean.startsWith('data/')) {
    return `${baseUrl}/v2/${clean}`;
  }
  if (clean.startsWith('originals/')) {
    return `${baseUrl}/v2/data/uploads/${clean}`;
  }
  return `${baseUrl}/${clean}`;
}

export const BUNNY_CONFIG = {
  apiKey: process.env.BUNNY_API_KEY || "",
  libraryId: process.env.BUNNY_LIBRARY_ID || "",
  pullZone: process.env.BUNNY_PULL_ZONE || ""
};

export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
  forcePathStyle: false,
});

export let usageStats = {
  classA: 0,
  classB: 0,
  storageBytes: 0,
  lastReset: new Date().toISOString()
};

export async function loadUsage() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'usage.json'), 'utf-8');
    usageStats = JSON.parse(data);
  } catch (e) {}
}

export async function saveUsage() {
  try {
    await fs.writeFile(path.join(DATA_DIR, 'usage.json'), JSON.stringify(usageStats, null, 2));
  } catch (e) {}
}

export async function syncStorageSize() {
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

export async function checkFileExistsOnR2(filename: string, localSize: number): Promise<boolean> {
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
    return response.ContentLength === localSize;
  } catch (e: any) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

export async function uploadToR2(buffer: Buffer, filename: string, contentType: string) {
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
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  const baseUrl = R2_CONFIG.publicUrl || R2_CONFIG.publicDomain || `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${cleanBaseUrl}/${filename.replace(/^\/+/, '')}`;
}

export const hasR2UploadCredentials = () => (
  !!R2_CONFIG.accountId &&
  !!R2_CONFIG.accessKeyId &&
  !!R2_CONFIG.secretAccessKey &&
  !!R2_CONFIG.bucketName
);

export const getContentTypeForPath = (filePath: string) => {
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

export const getBufferSha1 = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');
