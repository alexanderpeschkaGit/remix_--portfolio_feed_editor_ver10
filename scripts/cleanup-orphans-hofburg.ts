import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { moveFileToBak, toPossibleR2Key } from '../src/server/mediaDeletion.ts';
import { resolveMediaAssetLocation } from '../src/server/mediaAssets.ts';

// One-off cleanup for the orphaned "ImpactDAY Hofburg" Instagram media files.
// After live_state2_final.json was deleted, these files are no longer referenced
// by data/state.json. They are moved to bak/ (structure-preserving) and the
// corresponding R2 objects are hard-deleted (manifest entries removed).
//
// Usage:
//   npx tsx scripts/cleanup-orphans-hofburg.ts            # DRY-RUN (default)
//   npx tsx scripts/cleanup-orphans-hofburg.ts --apply    # execute

const DEFAULT_PUBLIC_BASE = 'https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev';
const SYNC_MANIFEST_KEY = '.sync-manifest.json';
const TARGET_PREFIX = '2024-09-13_10-00-18_UTC_';
const TARGET_EXTS = ['.mp4', '.jpg'];

const apply = process.argv.includes('--apply');

const config = {
  accountId: process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY || process.env.CLOUDFLARE_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_BUCKET || process.env.CLOUDFLARE_BUCKET_NAME || '',
  publicBase: (process.env.CLOUDFLARE_PUBLIC_DOMAIN || DEFAULT_PUBLIC_BASE).replace(/\/+$/, ''),
};

const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
if (missing.length > 0) {
  console.error(`Missing R2 configuration: ${missing.join(', ')}. Set CF_* / CLOUDFLARE_* env (see .env).`);
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  forcePathStyle: false,
});

const root = process.cwd();

const MEDIA_FIELDS = [
  'image', 'image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_large', 'image_original', 'image_preview',
  'imageLarge', 'largeUrl', 'local_highres', 'video', 'video_large', 'url', 'link', 'poster', 'thumbnail', 'thumb', 'preview',
];

async function collectReferenced() {
  const local = new Set<string>();
  const keys = new Set<string>();
  let state: any = { items: [] };
  try {
    state = JSON.parse(await fs.readFile(path.join(root, 'data', 'state.json'), 'utf-8'));
  } catch {
    // no state file -> treat everything as unreferenced
  }
  for (const item of state.items || []) {
    const mediaObjects = [item, ...(Array.isArray(item.mergedMedia) ? item.mergedMedia : [])];
    for (const m of mediaObjects) {
      for (const field of MEDIA_FIELDS) {
        const value = m?.[field];
        if (typeof value !== 'string' || !value) continue;
        const loc = resolveMediaAssetLocation(value, root);
        if (loc.localPath) local.add(path.normalize(loc.localPath));
        const key = toPossibleR2Key(value);
        if (key) keys.add(key);
      }
    }
  }
  return { local, keys };
}

async function loadManifest() {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: SYNC_MANIFEST_KEY }));
    return JSON.parse(Buffer.from(await res.Body!.transformToByteArray()).toString('utf-8'));
  } catch {
    return {};
  }
}

async function saveManifest(manifest: any) {
  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: SYNC_MANIFEST_KEY,
    Body: Buffer.from(JSON.stringify(manifest, null, 2)),
    ContentType: 'application/json',
  }));
}

async function main() {
  const { local, keys } = await collectReferenced();
  const dir = path.join(root, 'data', 'instagram', 'vijay_sikanda');
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (e) {
    console.error('Cannot read dir:', dir, e);
    process.exit(1);
  }

  const targets = files
    .filter(f => f.startsWith(TARGET_PREFIX) && TARGET_EXTS.some(ext => f.toLowerCase().endsWith(ext)))
    .sort();

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'} (use --apply to execute)`);
  console.log(`Targets found on disk: ${targets.length}`);
  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const manifest = await loadManifest();
  let moved = 0;
  let deletedR2 = 0;
  let skippedRef = 0;
  let skippedMissing = 0;
  let r2NotFound = 0;
  let r2Errors = 0;

  for (const filename of targets) {
    const abs = path.join(dir, filename);
    const key = toPossibleR2Key(`/data/instagram/vijay_sikanda/${filename}`) || '';

    const referencedLocal = local.has(path.normalize(abs));
    const referencedKey = key ? keys.has(key) : false;
    if (referencedLocal || referencedKey) {
      console.log(`[SKIP referenced] ${filename} (still used in data/state.json)`);
      skippedRef++;
      continue;
    }

    const stats = await fs.stat(abs).catch(() => null);
    if (!stats || !stats.isFile()) {
      skippedMissing++;
      continue;
    }

    if (apply) {
      const movedEntry = await moveFileToBak(abs, root);
      if (movedEntry) {
        moved++;
        console.log(`[MOVE] ${abs} -> ${movedEntry.to}`);
      } else {
        console.log(`[FAIL move] ${abs}`);
      }
    } else {
      const plannedTo = path.join(root, 'bak', 'data', 'instagram', 'vijay_sikanda', filename);
      console.log(`[DRY MOVE] ${abs} -> ${plannedTo}`);
    }

    if (!key) continue;
    if (apply) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (e: any) {
        if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
          r2NotFound++;
          console.log(`[R2 not found] ${key}`);
          continue;
        }
        r2Errors++;
        console.log(`[R2 error HEAD] ${key}: ${e.message}`);
        continue;
      }
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
        if (manifest[key]) delete manifest[key];
        deletedR2++;
        console.log(`[R2 DELETE] ${key}`);
      } catch (e: any) {
        r2Errors++;
        console.log(`[R2 error DELETE] ${key}: ${e.message}`);
      }
    } else {
      console.log(`[DRY R2 DELETE] ${key}`);
    }
  }

  if (apply) await saveManifest(manifest);

  console.log('---');
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    targets: targets.length,
    moved,
    deletedR2,
    skippedRef,
    skippedMissing,
    r2NotFound,
    r2Errors,
  }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
