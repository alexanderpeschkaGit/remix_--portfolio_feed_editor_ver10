import type { Express } from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { BUNNY_CONFIG, DATA_DIR, V2_MEDIA_GROUPS, execAsync, upload } from './serverContext.ts';
import { fetchBunnyVideoMetadata } from './stateManager.ts';
import { getGroupBaseDir, getVariantLocalPath, getVariantLocalUrl, joinUrlPath, materializeVariantSet } from './variantMaterializer.ts';

  // ── Background task tracker for Bunny uploads ──
  export const bunnyTasks = new Map<string, { step: string; progress: number; result?: any; error?: string; startedAt: number; videoId?: string; libraryId?: string; projectId?: string }>();
  // Auto-clean old tasks after 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [id, task] of bunnyTasks) {
      if (now - task.startedAt > 600_000) bunnyTasks.delete(id);
    }
  }, 120_000);

  // ── Persistent recovery file for Bunny tasks (survives server restart) ──
  export const BUNNY_TASKS_FILE = path.join(DATA_DIR, 'bunny_tasks.json');

  export async function loadBunnyTasksFile(): Promise<Record<string, any>> {
    try { return JSON.parse(await fs.readFile(BUNNY_TASKS_FILE, 'utf-8')); }
    catch { return {}; }
  }

  export async function saveBunnyTasksFile(data: Record<string, any>) {
    await fs.writeFile(BUNNY_TASKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ── Serialized recovery-file writes (avoid concurrent load/save clobbering) ──
  let tasksFileWriteQueue: Promise<void> = Promise.resolve();
  export function mutateBunnyTasksFile(mutator: (persisted: Record<string, any>) => void | Promise<void>): Promise<void> {
    tasksFileWriteQueue = tasksFileWriteQueue.then(async () => {
      const persisted = await loadBunnyTasksFile();
      await mutator(persisted);
      await saveBunnyTasksFile(persisted);
    });
    return tasksFileWriteQueue;
  }

  // On startup: reconcile any interrupted Bunny uploads from the recovery file
  (async () => {
    const persisted = await loadBunnyTasksFile();
    const entries = Object.entries(persisted);
    if (entries.length === 0) return;

    // Only tasks still 'uploading' (with a video/library ref) are recoverable.
    const pending = entries.filter(([, t]: any) =>
      t && t.status !== 'done' && t.status !== 'error' && t.videoId && t.libraryId
    );

    if (pending.length > 0) {
      console.log(`[bunny-recovery] Reconciling ${pending.length} interrupted Bunny task(s)...`);
    }

    // Purge already-resolved entries (they no longer need recovery) + reconcile pending ones.
    await mutateBunnyTasksFile(async (p) => {
      for (const id of Object.keys(p)) {
        const t: any = p[id];
        if (t && (t.status === 'done' || t.status === 'error')) delete p[id];
      }
      for (const [taskId, entry] of pending) {
        const task: any = entry;
        try {
          const meta: any = await fetchBunnyVideoMetadata(task.libraryId, task.videoId);
          if (meta) {
            if (meta.status === 4 || meta.status === 0) {
              const result = {
                success: true, type: 'bunny',
                libraryId: task.libraryId, videoId: task.videoId,
                url: `https://iframe.mediadelivery.net/embed/${task.libraryId}/${task.videoId}`,
                image_original: `https://iframe.mediadelivery.net/embed/${task.libraryId}/${task.videoId}`,
                duration: meta.length || 0,
                image: '', image_thumb: '', image_1k: '', image_2k: '', image_3k: '',
                image_width: meta.width || 0, image_height: meta.height || 0, bunnyThumbUrl: '',
                previewCloudUploaded: false,
              };
              bunnyTasks.set(taskId, { step: 'done', progress: 100, startedAt: task.startedAt, result, videoId: task.videoId, libraryId: task.libraryId, projectId: task.projectId });
              delete p[taskId]; // resolved → remove from file
              console.log(`[bunny-recovery] Reconciled task ${taskId}: video ${task.videoId} (status ${meta.status})`);
            }
            // else: still encoding on Bunny → keep for next startup
          } else {
            delete p[taskId]; // not on Bunny → drop failed entry
          }
        } catch (e: any) {
          console.warn(`[bunny-recovery] Failed to reconcile task ${taskId}:`, e.message);
          // keep entry so it's retried next startup
        }
      }
    }).catch((e: any) => console.warn('[bunny-recovery] Recovery failed:', e.message));
  })();

  export const sanitizeProjectName = (name: string) =>
    (name || 'uncategorized')
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\-_ ]/gi, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 60) || 'uncategorized';

  // Helper: get project subfolder path within a variant dir
  export const getProjectSubPath = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, projectName: string, projectId: string, filename: string) => {
    const safeName = sanitizeProjectName(projectName);
    const subfolder = `${safeName}_${projectId}`;
    const groupDir = getGroupBaseDir(group);
    return path.join(groupDir, dir, subfolder, filename);
  };
  export const getProjectSubUrl = (group: keyof typeof V2_MEDIA_GROUPS, dir: string, projectName: string, projectId: string, filename: string) => {
    const safeName = sanitizeProjectName(projectName);
    const subfolder = `${safeName}_${projectId}`;
    return joinUrlPath('data_v2', group, dir, subfolder, filename);
  };


export function registerBunnyUploadRoutes(app: Express) {
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

      const localThumb = localVariantSet.localUrls.image_thumb || '';
      const local1k = localVariantSet.localUrls.image_1k || '';
      const local2k = localVariantSet.localUrls.image_2k || '';
      const local3k = localVariantSet.localUrls.image_3k || '';
      const previewCloudUploaded = !!Object.keys(localVariantSet.remoteUrls || {}).length;

      const videoBuffer = req.file.buffer;
      const originalFilename = req.file.originalname || `Video-${Date.now()}`;
      const bunnyTitle = projectName
        ? `${projectName} — ${originalFilename}`
        : originalFilename;

      // ── Phase 1.5: Create Bunny video entry synchronously (fast API call, ~200ms) ──
      // This ensures videoId is available immediately, eliminating the polling race condition.
      let bunnyVideoId: string | null = null;
      try {
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
        if (createRes.ok) {
          const videoData: any = await createRes.json();
          bunnyVideoId = videoData.guid;
        } else {
          console.warn('[bunny-hybrid] Bunny create entry failed in Phase 1:', createRes.status, createRes.statusText);
        }
      } catch (e: any) {
        console.warn('[bunny-hybrid] Bunny create entry error in Phase 1:', e.message);
        // Non-fatal: video will be created in background Phase 2 instead
      }

      // ── Phase 2: Start Bunny upload in background ──
      const taskId = `bunny-${Date.now()}-${Math.random().toString(36).substring(4)}`;
      const bunnyLibId = BUNNY_CONFIG.libraryId;

      const taskEntry: any = { step: 'starting', progress: 0, startedAt: Date.now(), videoId: bunnyVideoId || undefined, libraryId: bunnyLibId, projectId: projectId || undefined };
      bunnyTasks.set(taskId, taskEntry);

      // Persist task to recovery file
      mutateBunnyTasksFile((persisted) => {
        persisted[taskId] = { videoId: bunnyVideoId, libraryId: bunnyLibId, projectId: projectId || '', projectName: projectName || '', baseName, status: 'uploading', startedAt: Date.now() };
      }).catch((e: any) => console.warn('[bunny-recovery] Failed to persist task:', e.message));

      // Launch background task (do NOT await)
      (async () => {
        let videoId: string | null = bunnyVideoId;
        try {
          bunnyTasks.set(taskId, { step: 'uploading', progress: 15, startedAt: Date.now(), videoId: videoId || undefined, libraryId: bunnyLibId });

          // Step A: Create Bunny video entry if not already done in Phase 1
          if (!videoId) {
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
            videoId = videoData.guid;
          }

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
          let bunnyWidth = 0;
          let bunnyHeight = 0;

          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise(r => setTimeout(r, 3000));
            const pollProgress = 50 + Math.floor((attempt / 15) * 40); // 50%–90%
            bunnyTasks.set(taskId, { step: 'encoding', progress: pollProgress, startedAt: Date.now() });
            try {
              const meta: any = await fetchBunnyVideoMetadata(BUNNY_CONFIG.libraryId, videoId);
              if (!meta) continue;
              bunnyDuration = meta.length || 0;
              bunnyWidth = Number(meta.width) || 0;
              bunnyHeight = Number(meta.height) || 0;
              const thumbFilename = meta.thumbnailFileName;
              if (meta.status === 'finished' && thumbFilename) {
                // Try iframe.mediadelivery.net first (same domain as embeds)
                bunnyThumbUrl = `https://iframe.mediadelivery.net/${BUNNY_CONFIG.libraryId}/${videoId}/thumbnail.jpg`;
                if (BUNNY_CONFIG.pullZone) {
                  // Keep pull zone as fallback in case mediadelivery.net doesn't serve this thumbnail
                  try {
                    const testUrl = `https://${BUNNY_CONFIG.pullZone}/${videoId}/${thumbFilename}`;
                    const testRes = await fetch(testUrl, { method: 'HEAD' });
                    if (testRes.ok && (testRes.headers.get('content-type') || '').startsWith('image/')) {
                      bunnyThumbUrl = testUrl;
                    }
                  } catch {}
                }
                break;
              }
            } catch {}
          }

          // Step D: Build result from ffmpeg variants (single thumbnail model — no Bunny auto-thumb download).
          const finalThumb = localThumb;
          const final1k = local1k;
          const final2k = local2k;
          const final3k = local3k;

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
              image_width: bunnyWidth || localVariantSet.sourceWidth || 0,
              image_height: bunnyHeight || localVariantSet.sourceHeight || 0,
              duration: bunnyDuration,
              bunnyThumbUrl,
              previewCloudUploaded,
            }
          });
          // Remove resolved task from recovery file (no longer needs recovery)
          mutateBunnyTasksFile((persisted) => {
            if (persisted[taskId]) delete persisted[taskId];
          }).catch((e: any) => console.warn('[bunny-recovery] Failed to persist done:', e.message));
        } catch (bgError: any) {
          console.error("[bunny-bg] Background upload failed:", bgError.message);
          bunnyTasks.set(taskId, {
            step: 'error', progress: 0, startedAt: Date.now(),
            error: bgError.message || 'Unknown background error'
          });
          // Remove failed task from recovery file (no longer needs recovery)
          mutateBunnyTasksFile((persisted) => {
            if (persisted[taskId]) delete persisted[taskId];
          }).catch((e: any) => console.warn('[bunny-recovery] Failed to persist error:', e.message));
        }
      })();

      // ── Respond immediately with local results ──
      res.json({
        success: true,
        type: 'video', // local for now; will update to 'bunny' when bg task completes
        url: bunnyVideoId ? `https://iframe.mediadelivery.net/embed/${bunnyLibId}/${bunnyVideoId}` : originalUrl,
        videoId: bunnyVideoId || undefined,
        libraryId: bunnyVideoId ? bunnyLibId : undefined,
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


}
