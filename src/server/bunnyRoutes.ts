import type { Express } from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BUNNY_CONFIG, DATA_DIR, R2_CONFIG, s3Client, upload } from './serverContext.ts';
import { fetchBunnyVideoMetadata, persistAcceptedState } from './stateManager.ts';
import { getGroupBaseDir, materializeVariantSet } from './variantMaterializer.ts';
import { bunnyTasks, sanitizeProjectName } from './bunnyUploadRoutes.ts';

export function registerBunnyRoutes(app: Express) {
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

  // Force-publish current state.json to R2, bypassing validation
  app.post("/api/state/force-publish", async (req, res) => {
    try {
      const statePath = path.join(DATA_DIR, 'state.json');
      const stateString = await fs.readFile(statePath, 'utf-8');
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'state.json',
        Body: Buffer.from(stateString),
        ContentType: "application/json; charset=utf-8",
      }));
      console.log("[Force Publish] state.json uploaded to R2 successfully.");
      res.json({ success: true, message: 'state.json force-published to R2.' });
    } catch (error: any) {
      console.error("[Force Publish] Failed:", error);
      res.status(500).json({ error: 'Force-publish failed', details: error.message || String(error) });
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
      if (!BUNNY_CONFIG.apiKey) {
        throw new Error("Bunny API key not configured in .env");
      }

      const metadata: any = await fetchBunnyVideoMetadata(libraryId, videoId);
      if (!metadata) throw new Error("Bunny metadata error: could not fetch video metadata");

      const thumbFilename = metadata.thumbnailFileName || 'thumbnail.jpg';
      // Try iframe.mediadelivery.net first, then pull zone CDN as fallback
      let thumbUrl = `https://iframe.mediadelivery.net/${libraryId}/${videoId}/thumbnail.jpg`;
      let thumbFetchRes = await fetch(thumbUrl);
      if (!thumbFetchRes.ok && BUNNY_CONFIG.pullZone) {
        thumbUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/${thumbFilename}`;
        thumbFetchRes = await fetch(thumbUrl);
      }
      
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
        bunnyThumbUrl: thumbUrl,
        image_width: metadata.width || variantSet.sourceWidth || 0,
        image_height: metadata.height || variantSet.sourceHeight || 0,
        ... (variantSet.remoteUrls || {})
      });
    } catch (error: any) {
      console.error("Error syncing Bunny video:", error);
      res.status(500).json({ error: error.message || "Failed to sync Bunny video" });
    }
  });

  // API: Get a direct playable video URL for a Bunny video (for canvas frame capture)
  app.post("/api/bunny/video-url", async (req, res) => {
    try {
      const { libraryId, videoId } = req.body;
      if (!libraryId || !videoId) {
        return res.status(400).json({ error: "Missing libraryId or videoId" });
      }
      if (!BUNNY_CONFIG.pullZone) {
        return res.status(400).json({ error: "Bunny pull zone not configured. Set BUNNY_PULL_ZONE in .env." });
      }

      // Try 720p first, then fall back to 480p, 360p
      const qualities = ['720p', '480p', '360p'];
      let bestUrl = '';
      for (const q of qualities) {
        const testUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/play_${q}.mp4`;
        try {
          const headRes = await fetch(testUrl, { method: 'HEAD' });
          if (headRes.ok) {
            bestUrl = testUrl;
            break;
          }
        } catch {}
      }

      if (!bestUrl) {
        // Fallback: return the first quality anyway, let the client handle errors
        bestUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/play_720p.mp4`;
      }

      // Best-effort metadata enrichment (width/height/length + availableResolutions).
      // Tolerated: on any failure these stay null/0 and success/videoUrl are never jeopardized.
      let meta: any = null;
      try {
        meta = await fetchBunnyVideoMetadata(libraryId, videoId);
      } catch {}

      const availableResolutions = meta && Array.isArray(meta.availableResolutions)
        ? meta.availableResolutions.join(',')
        : null;

      res.json({
        success: true,
        videoUrl: bestUrl,
        // Also provide HLS as alternative
        hlsUrl: `https://${BUNNY_CONFIG.pullZone}/${videoId}/playlist.m3u8`,
        // Optional enrichment fields (only attached when metadata lookup succeeded)
        ...(meta ? {
          availableResolutions,
          width: Number(meta.width) > 0 ? Number(meta.width) : 0,
          height: Number(meta.height) > 0 ? Number(meta.height) : 0,
          length: Number(meta.length) > 0 ? Number(meta.length) : 0,
        } : {}),
      });
    } catch (error: any) {
      console.error("Error getting Bunny video URL:", error);
      res.status(500).json({ error: error.message || "Failed to get Bunny video URL" });
    }
  });


}
