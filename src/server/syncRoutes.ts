import type { Express } from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { imageHash } from 'image-hash';
import { ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { assertStateAcceptable } from './statePublishing.ts';
import { BACKUPS_DIR, DATA_DIR, ORIGINALS_DIR, R2_CONFIG, SYNC_DIR, V2_MEDIA_GROUPS, V2_PREFIX, getBufferSha1, getContentTypeForPath, s3Client, syncStorageSize, uploadToR2 } from './serverContext.ts';
import { backupState, persistAcceptedState } from './stateManager.ts';
import { materializeVariantSet, publishHtmlAndState, toPosix } from './variantMaterializer.ts';
import { hammingDistance } from './scrapeService.ts';
import { collectReferencedSyncTargets, loadSyncManifest, saveSyncManifest, updateSyncManifestEntries } from './r2StorageService.ts';
import { getRecursiveFiles } from './r2TrashService.ts';

export function registerSyncRoutes(app: Express) {
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
            const mediaFiles = files
              .filter(f => /\.(jpg|jpeg|png|webp|json|mp4|webm|mov)$/i.test(f))
              .map(f => ({
                localPath: path.join(subDirPath, f),
                r2Key: `${V2_PREFIX}/${sub}/${toPosix(f)}`
              }))
              .filter(file => !allImageFiles.some(f => f.r2Key === file.r2Key));
            allImageFiles = [...allImageFiles, ...mediaFiles];
            mediaFiles.forEach(file => allImageFiles.push(file));
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


}
