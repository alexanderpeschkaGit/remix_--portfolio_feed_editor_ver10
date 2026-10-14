import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { resolveBakArchiveTarget, writeR2BodyToFile, extractFallbackOriginalKey } from './mediaDeletion.ts';
import { R2_CONFIG, TRASH_PREFIX, s3Client } from './serverContext.ts';
import { localTimestamp } from './stateManager.ts';
import { listR2ObjectsForPrefixes, loadSyncManifest, saveSyncManifest } from './r2StorageService.ts';

  export const normalizeTrashName = (value: string) =>
    value
      .replace(/[^a-z0-9._-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'file';

  export const buildTrashKey = (originalKey: string) => {
    const timestamp = localTimestamp();
    const hash = createHash('sha1').update(originalKey).digest('hex').slice(0, 12);
    const baseName = normalizeTrashName(path.basename(originalKey) || 'file');
    return `${TRASH_PREFIX}${timestamp}/${hash}-${baseName}`;
  };

  export type TrashItem = {
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

  export const moveR2ObjectsToTrash = async (
    objects: Array<{ key: string; size: number }>,
    reason: string
  ) => {
    const movedItems: TrashItem[] = [];
    const skippedKeys: string[] = [];
    const manifestDirty: string[] = [];

    try {
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

        manifestDirty.push(obj.key);

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
    } finally {
      if (manifestDirty.length > 0) {
        const manifest = await loadSyncManifest();
        for (const key of manifestDirty) delete manifest[key];
        await saveSyncManifest(manifest);
      }
    }

    return { movedItems, skippedKeys };
  };

  export const listTrashObjects = async () => {
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

  export const restoreTrashObjects = async (trashKeys: string[]) => {
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

  export const deleteTrashObjects = async (trashKeys: string[]) => {
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

  /**
   * Safe "empty trash": stream every trash object into `bak/r2-trash/<ts>/<originalKey>`
   * FIRST, verify the local write, and only then delete the R2 trash copy.
   * If the local write fails or the byte count does not match, the R2 object is
   * left untouched and the key is reported as skipped — the last copy survives.
   */
  export const archiveTrashObjectsToBak = async (trashKeys: string[]) => {
    const archived: Array<{ trashKey: string; originalKey: string; bakPath: string; size: number }> = [];
    const skippedKeys: string[] = [];

    for (const trashKey of trashKeys) {
      try {
        const head = await s3Client.send(new HeadObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));
        const originalKey = head.Metadata?.originalkey || extractFallbackOriginalKey(trashKey);
        const destPath = await resolveBakArchiveTarget(trashKey, originalKey, process.cwd());
        if (!destPath) {
          console.error(`Refusing to archive ${trashKey}: unsafe originalKey "${originalKey}"`);
          skippedKeys.push(trashKey);
          continue;
        }

        const result = await s3Client.send(new GetObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));

        const expectedSize = Number(head.Metadata?.originalsizedbytes) || head.ContentLength || 0;
        const written = await writeR2BodyToFile(result.Body, destPath, expectedSize);
        if (written === null) {
          skippedKeys.push(trashKey);
          continue;
        }

        // Local copy verified -> safe to drop the R2 trash copy.
        await s3Client.send(new DeleteObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: trashKey
        }));

        archived.push({
          trashKey,
          originalKey,
          bakPath: path.relative(process.cwd(), destPath).split(path.sep).join('/'),
          size: written
        });
      } catch (error) {
        console.error(`Failed to archive trash object ${trashKey} to bak/:`, error);
        skippedKeys.push(trashKey);
      }
    }

    return { archived, skippedKeys };
  };

  export async function getRecursiveFiles(dir: string, baseDir: string): Promise<string[]> {
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

