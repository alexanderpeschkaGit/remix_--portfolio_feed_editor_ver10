import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { stateValidationHttpPayload } from './statePublishing.ts';
import { resolveMediaAssetLocation } from './mediaAssets.ts';
import { moveFileToBak, enumerateLocalFilesForMedia, enumerateR2KeysForMedia, toPossibleR2Key, BAK_DIR_NAME, listBakFiles } from './mediaDeletion.ts';
import { BAK_DIR, DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, s3Client } from './serverContext.ts';
import { backupState, persistAcceptedState } from './stateManager.ts';
import { materializeVariantSet } from './variantMaterializer.ts';
import { getDeletedIds, saveDeletedIds } from './scrapeService.ts';
import { MEDIA_REFERENCE_FIELDS, loadSyncManifest, saveSyncManifest } from './r2StorageService.ts';

  // ===================== Media deletion: local bak/ + R2 hard delete =====================

  export const deleteR2ObjectHard = async (key: string): Promise<boolean> => {
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: key }));
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return false;
      throw e;
    }
    await s3Client.send(new DeleteObjectCommand({ Bucket: R2_CONFIG.bucketName, Key: key }));
    try {
      const manifest = await loadSyncManifest();
      if (manifest[key]) {
        delete manifest[key];
        await saveSyncManifest(manifest);
      }
    } catch (e) {
      console.error(`Failed to update sync manifest after deleting ${key}:`, e);
    }
    return true;
  };

  // ── Unified thumbnail replacement: clean up old variants (local → bak, R2 → delete),
  //     generate new ones from a fresh buffer, update state.json, return new URLs. ──
  export const replaceMediaThumbnail = async (
    postId: string,
    mediaIndex: number,
    newThumbBuffer: Buffer,
    source: 'bunny' | 'custom',
  ) => {
    const statePath = path.join(DATA_DIR, 'state.json');
    const rawState = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(rawState);

    const item = Array.isArray(state.items) ? state.items.find((p: any) => String(p?.id) === String(postId)) : null;
    if (!item || !Array.isArray(item.mergedMedia)) {
      throw new Error(`Post ${postId} not found or has no media`);
    }
    if (mediaIndex < 0 || mediaIndex >= item.mergedMedia.length) {
      throw new Error(`Media index ${mediaIndex} out of range for post ${postId}`);
    }

    const media = { ...item.mergedMedia[mediaIndex] };
    const isBunny = media.type === 'bunny' || (!!media.videoId && !!media.libraryId);

    // Fields that hold thumbnail variant URLs (all are image URLs, never the Bunny embed).
    const thumbFields = ['image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_original'] as const;

    // Phase A: clean up existing variants (local → bak, R2 → delete).
    const cleanupResult = { movedToBak: 0, r2Deleted: 0, r2Skipped: 0 };

    for (const field of thumbFields) {
      const url = String(media[field] || '');
      if (!url) continue;

      // For Bunny items, image_original is the embed URL — NEVER delete it.
      if (isBunny && field === 'image_original') continue;
      // Skip if the URL is a Bunny CDN thumbnail (not our R2-managed variant).
      if (url.includes('mediadelivery.net') && (url.includes('thumbnail.jpg') || url.includes('/embed/'))) continue;

      // Resolve local file.
      const loc = resolveMediaAssetLocation(url, process.cwd());
      if (loc.localPath) {
        try {
          await moveFileToBak(loc.localPath, process.cwd());
          cleanupResult.movedToBak++;
        } catch (e: any) {
          console.warn(`[replaceMediaThumbnail] bak move failed for ${field}: ${e.message}`);
        }
      }

      // Resolve R2 key.
      const r2Key = toPossibleR2Key(url);
      if (r2Key) {
        try {
          await deleteR2ObjectHard(r2Key);
          cleanupResult.r2Deleted++;
        } catch (e: any) {
          console.warn(`[replaceMediaThumbnail] R2 delete failed for ${field} (${r2Key}): ${e.message}`);
        }
      }
    }

    // Phase B: generate new variants from the fresh buffer.
    const baseName = source === 'bunny'
      ? `bunny-${media.videoId || postId}-${Date.now()}`
      : `custom-${String(postId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40)}-${Date.now()}`;

    const variantSet = await materializeVariantSet(newThumbBuffer, {
      group: 'uploads',
      baseName,
      originalBuffer: newThumbBuffer,
      originalExt: 'jpg',
      uploadToCloud: true, // R2 upload is part of the unified flow
    });

    // Build URLs — prefer remote (R2) over local.
    const pick = (field: string) => variantSet.remoteUrls[field] || variantSet.localUrls[field] || '';

    // Phase C: update the media item in state.
    const updatedMedia = {
      ...media,
      image_thumb: pick('image_thumb'),
      image_1k: pick('image_1k'),
      image_2k: pick('image_2k'),
      image_3k: pick('image_3k'),
      image_original: isBunny
        ? `https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}`
        : pick('image_original'),
      custom_thumb: source === 'custom' ? pick('image_thumb') : (media.custom_thumb || ''),
      image_width: variantSet.sourceWidth,
      image_height: variantSet.sourceHeight,
    };

    const newMergedMedia = [...item.mergedMedia];
    newMergedMedia[mediaIndex] = updatedMedia;
    state.items = state.items.map((p: any) =>
      String(p?.id) === String(postId) ? { ...p, mergedMedia: newMergedMedia } : p
    );

    await persistAcceptedState(state, statePath);
    console.log(`[replaceMediaThumbnail] ${source} thumb replaced for post=${postId} idx=${mediaIndex}: ${cleanupResult.movedToBak} bak, ${cleanupResult.r2Deleted} R2 deleted`);

    return {
      image_thumb: pick('image_thumb'),
      image_1k: pick('image_1k'),
      image_2k: pick('image_2k'),
      image_3k: pick('image_3k'),
      image_original: updatedMedia.image_original,
      image_width: variantSet.sourceWidth,
      image_height: variantSet.sourceHeight,
    };
  };

  // Exact local paths + R2 keys still referenced by the given items -> "keep" set for the delete guard.
  export const collectExactMediaResources = async (items: any[]) => {
    const localFiles = new Set<string>();
    const r2Keys = new Set<string>();
    for (const item of items) {
      const mediaObjects = [item, ...(Array.isArray(item.mergedMedia) ? item.mergedMedia : [])];
      for (const m of mediaObjects) {
        for (const field of MEDIA_REFERENCE_FIELDS) {
          const value = m?.[field];
          if (typeof value !== 'string' || !value) continue;
          const loc = resolveMediaAssetLocation(value, process.cwd());
          if (loc.localPath) localFiles.add(loc.localPath);
          const key = toPossibleR2Key(value);
          if (key) r2Keys.add(key);
        }
      }
    }
    return { localFiles, r2Keys };
  };

  // Move files to bak/ + hard-delete from R2, skipping anything still referenced by finalStateItems.
  export const deleteMediaResources = async (mediaObjects: any[], finalStateItems: any[]) => {
    const movedToBak: Array<{ from: string; to: string }> = [];
    const r2Deleted: string[] = [];
    const r2Skipped: string[] = [];
    const localSkipped: string[] = [];

    const keep = await collectExactMediaResources(finalStateItems);
    const localFiles = new Set<string>();
    const r2Keys = new Set<string>();
    for (const m of mediaObjects) {
      for (const f of await enumerateLocalFilesForMedia(m, process.cwd())) localFiles.add(f);
      for (const k of enumerateR2KeysForMedia(m)) r2Keys.add(k);
    }

    for (const file of localFiles) {
      if (keep.localFiles.has(file)) { localSkipped.push(file); continue; }
      try {
        const moved = await moveFileToBak(file, process.cwd());
        if (moved) movedToBak.push(moved); else localSkipped.push(file);
      } catch (e: any) {
        console.error(`Failed to move ${file} to bak:`, e);
        localSkipped.push(file);
      }
    }

    for (const key of r2Keys) {
      if (keep.r2Keys.has(key)) { r2Skipped.push(key); continue; }
      try {
        const deleted = await deleteR2ObjectHard(key);
        if (deleted) r2Deleted.push(key); else r2Skipped.push(key);
      } catch (e: any) {
        console.error(`Failed to delete R2 object ${key}:`, e);
        r2Skipped.push(key);
      }
    }

    return { movedToBak, r2Deleted, r2Skipped, localSkipped };
  };

  export const serverMediaPriorityScore = (m: any): number => {
    if (!m) return -1;
    if (m.type === 'youtube' || m.youtubeId || m.type === 'bunny') return 25;
    if (m.image_original) return 100;
    if (m.image_3k) return 90;
    if (m.image_2k) return 80;
    if (m.image_large || m.largeUrl) return 70;
    if (m.image_1k) return 60;
    if (m.image) return 50;
    if (m.image_preview) return 40;
    if (m.image_thumb) return 30;
    if (m.url || m.link) return 10;
    return 0;
  };

  export const serverGetPrimaryMergedMedia = (mediaList: any[]) => {
    if (!Array.isArray(mediaList) || mediaList.length === 0) return undefined;
    let best = mediaList[0];
    let bestScore = serverMediaPriorityScore(best);
    for (let i = 1; i < mediaList.length; i++) {
      const s = serverMediaPriorityScore(mediaList[i]);
      if (s > bestScore) { best = mediaList[i]; bestScore = s; }
    }
    return best;
  };

  export const serverSyncMediaFieldsFromPrimary = (target: any, primary: any) => {
    if (!primary) return target;
    target.type = primary.type || target.type || 'image';
    target.image = primary.image || primary.image_thumb || target.image || '';
    target.image_thumb = primary.image_thumb || primary.image || target.image_thumb || '';
    target.image_1k = primary.image_1k || '';
    target.image_2k = primary.image_2k || '';
    target.image_large = primary.image_large || primary.image_2k || primary.image_3k || primary.image_1k || primary.image || target.image_large || '';
    target.image_3k = primary.image_3k || '';
    target.image_original = primary.image_original || '';
    target.image_preview = primary.image_preview || target.image_preview;
    target.url = primary.url || primary.link || target.url || '';
    target.youtubeId = primary.youtubeId || target.youtubeId || '';
    target.youtubeUrl = primary.youtubeUrl || target.youtubeUrl || '';
    target.videoId = primary.videoId || target.videoId || '';
    target.libraryId = primary.libraryId || target.libraryId || '';
    target.image_width = primary.image_width || target.image_width || 0;
    target.image_height = primary.image_height || target.image_height || 0;
    return target;
  };

  export const POST_MEDIA_CLEAR_FIELDS = [
    'image', 'image_thumb', 'image_1k', 'image_2k', 'image_3k', 'image_large', 'image_original', 'image_preview',
    'imageLarge', 'largeUrl', 'local_highres', 'video', 'video_large', 'url', 'link', 'poster', 'thumbnail', 'thumb', 'preview',
    'videoId', 'libraryId', 'youtubeId', 'youtubeUrl', 'image_width', 'image_height',
  ] as const;

  export const serverClearPostMediaFields = (item: any) => {
    for (const field of POST_MEDIA_CLEAR_FIELDS) delete item[field];
    return item;
  };


export function registerMediaDeleteRoutes(app: Express) {
  // API route to delete a post: removes it from state, moves local files to bak/,
  // hard-deletes the R2 objects and adds the ID to the scrape blacklist.
  app.post("/api/state/delete", async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      const idStr = String(id);

      const statePath = path.join(DATA_DIR, 'state.json');
      let state: any = { items: [] };
      try {
        state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      } catch (e) {}

      const item = state.items.find((it: any) => String(it.id) === idStr);
      if (!item) return res.status(404).json({ error: 'Post nicht gefunden' });

      const finalState = { ...state, items: state.items.filter((it: any) => String(it.id) !== idStr) };
      const result = await deleteMediaResources([item], finalState.items);

      const deletedIds = await getDeletedIds();
      if (!deletedIds.includes(idStr)) {
        deletedIds.push(idStr);
        await saveDeletedIds(deletedIds);
      }

      await backupState();
      await persistAcceptedState(finalState, statePath);

      res.json({ success: true, deletedCount: 1, filesMovedToBak: result.movedToBak.length, r2DeletedCount: result.r2Deleted.length, ...result });
    } catch (e: any) {
      console.error("Delete post error:", e);
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  // API route to remove a single media entry from a post: moves its files to bak/,
  // hard-deletes its R2 objects, re-syncs the post's primary fields and persists.
  app.post("/api/state/delete-media", async (req, res) => {
    try {
      const { id, mediaId, mediaIndex, mediaUrl } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      const idStr = String(id);
      const mediaIdStr = mediaId === undefined || mediaId === null ? undefined : String(mediaId);
      const mediaIndexNum = (typeof mediaIndex === 'number' && Number.isInteger(mediaIndex))
        ? mediaIndex
        : (typeof mediaIndex === 'string' && mediaIndex !== '' ? Number(mediaIndex) : NaN);
      const mediaUrlStr = (typeof mediaUrl === 'string' && mediaUrl) ? mediaUrl : undefined;

      const statePath = path.join(DATA_DIR, 'state.json');
      let state: any = { items: [] };
      try {
        state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      } catch (e) {}

      const itemIndex = state.items.findIndex((it: any) => String(it.id) === idStr);
      if (itemIndex === -1) return res.status(404).json({ error: 'Post nicht gefunden' });
      const item = state.items[itemIndex];
      const mergedMedia = Array.isArray(item.mergedMedia) ? item.mergedMedia : [];

      let removed: any = null;
      if (mediaIdStr) {
        removed = mergedMedia.find((m: any) => String(m.id) === mediaIdStr) || null;
      }
      if (!removed && Number.isInteger(mediaIndexNum) && mediaIndexNum >= 0 && mediaIndexNum < mergedMedia.length) {
        removed = mergedMedia[mediaIndexNum] || null;
      }
      if (!removed && mediaUrlStr) {
        removed = mergedMedia.find((m: any) => {
          for (const field of MEDIA_REFERENCE_FIELDS) {
            if (typeof m?.[field] === 'string' && m[field] === mediaUrlStr) return true;
          }
          return false;
        }) || null;
      }
      if (!removed) return res.status(404).json({ error: 'Media-Eintrag nicht gefunden' });

      const newMedia = mergedMedia.filter((m: any) => m !== removed);
      const updatedItem = { ...item };
      if (newMedia.length > 0) {
        updatedItem.mergedMedia = newMedia;
        const primary = serverGetPrimaryMergedMedia(newMedia);
        if (primary) serverSyncMediaFieldsFromPrimary(updatedItem, primary);
      } else {
        delete updatedItem.mergedMedia;
        serverClearPostMediaFields(updatedItem);
      }

      const finalState = { ...state, items: state.items.map((it: any, idx: number) => idx === itemIndex ? updatedItem : it) };
      const result = await deleteMediaResources([removed], finalState.items);

      await backupState();
      await persistAcceptedState(finalState, statePath);

      res.json({ success: true, filesMovedToBak: result.movedToBak.length, r2DeletedCount: result.r2Deleted.length, ...result });
    } catch (e: any) {
      console.error("Delete media error:", e);
      const validationError = stateValidationHttpPayload(e);
      if (validationError) return res.status(validationError.status).json(validationError.body);
      res.status(500).json({ error: 'Failed to delete media' });
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

      // 3. Find items to delete
      const itemsToDelete = state.items.filter((item: any) => idsSet.has(String(item.id)));

      // 4. Move files to bak/ + hard-delete from R2 (skips files still referenced by remaining items)
      const finalState = { ...state, items: state.items.filter((item: any) => !idsSet.has(String(item.id))) };
      const result = await deleteMediaResources(itemsToDelete, finalState.items);

      // 5. Remove items from state.json and save
      await backupState();
      await persistAcceptedState(finalState, statePath);

      res.json({ success: true, deletedCount: itemsToDelete.length, filesMovedToBak: result.movedToBak.length, r2DeletedCount: result.r2Deleted.length, ...result });
    } catch (e) {
      console.error("Bulk delete error:", e);
      res.status(500).json({ error: 'Failed to bulk delete items' });
    }
  });

  // Permanently remove files from the local bak/ archive. This is IRREVERSIBLE and
  // is the counterpart of archiveTrashObjectsToBak - without it bak/ grows forever.
  app.post("/api/bak/purge", async (req, res) => {
    try {
      const targetRel = typeof req.body?.target === 'string' ? req.body.target : '';
      const bakRoot = path.resolve(BAK_DIR);

      let targetAbs: string;
      if (targetRel) {
        targetAbs = path.resolve(process.cwd(), targetRel.split('/').join(path.sep));
        const allowed =
          targetAbs === bakRoot ||
          targetAbs.startsWith(bakRoot + path.sep) ||
          targetAbs === path.resolve(process.cwd(), BAK_DIR_NAME);
        if (!allowed) {
          return res.status(400).json({ error: 'Pfad nicht erlaubt' });
        }
      } else {
        targetAbs = bakRoot;
      }

      const stats = await fs.stat(targetAbs).catch(() => null);
      if (!stats) {
        return res.status(404).json({ error: 'Pfad nicht gefunden' });
      }

      const files = await listBakFiles(targetAbs, targetAbs);
      const bytes = await Promise.all(
        files.map(async (rel) => (await fs.stat(path.join(targetAbs, rel.split('/').join(path.sep))).catch(() => null))?.size || 0)
      );
      const totalBytes = bytes.reduce((sum, size) => sum + size, 0);

      await fs.rm(targetAbs, { recursive: true, force: true });
      if (targetAbs === bakRoot) {
        await fs.mkdir(BAK_DIR, { recursive: true });
      }

      res.json({ success: true, deletedCount: files.length, deletedBytes: totalBytes, target: targetRel || BAK_DIR_NAME });
    } catch (error: any) {
      console.error("Bak purge error:", error);
      res.status(500).json({ error: error.message || 'Bak-Bereinigung fehlgeschlagen' });
    }
  });

  // API route to restore files from the local bak/ folder (used by Undo)
  app.post("/api/bak/restore", async (req, res) => {
    try {
      const bakFiles = Array.isArray(req.body?.bakFiles) ? req.body.bakFiles : [];
      const restored: string[] = [];
      const failed: Array<{ from: string; to: string; error: string }> = [];
      const bakRoot = path.resolve(BAK_DIR) + path.sep;
      const dataV2Root = path.resolve(DATA_V2_DIR) + path.sep;
      const dataRoot = path.resolve(DATA_DIR) + path.sep;
      const originalsRoot = path.resolve(ORIGINALS_DIR) + path.sep;

      for (const entry of bakFiles) {
        const from = typeof entry?.from === 'string' ? entry.from : '';
        const to = typeof entry?.to === 'string' ? entry.to : '';
        if (!from || !to) { failed.push({ from, to, error: 'Ungültiger Eintrag' }); continue; }
        const fromPath = path.resolve(from);
        const toPath = path.resolve(to);
        const inBak = toPath.startsWith(bakRoot);
        const inMediaRoot =
          fromPath.startsWith(dataV2Root) ||
          fromPath.startsWith(dataRoot) ||
          fromPath.startsWith(originalsRoot);
        if (!inBak || !inMediaRoot) { failed.push({ from, to, error: 'Pfad nicht erlaubt' }); continue; }
        try {
          const stats = await fs.stat(toPath).catch(() => null);
          if (!stats || !stats.isFile()) { failed.push({ from, to, error: 'Datei in bak/ nicht gefunden' }); continue; }
          if (await fs.access(fromPath).then(() => true).catch(() => false)) {
            failed.push({ from, to, error: 'Ziel existiert bereits' }); continue;
          }
          await fs.mkdir(path.dirname(fromPath), { recursive: true });
          await fs.rename(toPath, fromPath);
          restored.push(fromPath);
        } catch (e: any) {
          failed.push({ from, to, error: e.message || 'Unbekannter Fehler' });
        }
      }
      res.json({ success: true, restoredCount: restored.length, failedCount: failed.length, restored, failed });
    } catch (e: any) {
      console.error("Bak restore error:", e);
      res.status(500).json({ error: 'Bak-Wiederherstellung fehlgeschlagen' });
    }
  });


}
