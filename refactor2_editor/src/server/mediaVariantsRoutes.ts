import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { validateMediaState } from './mediaValidation.ts';
import { BACKUPS_DIR, DATA_DIR, R2_CONFIG, V2_MEDIA_GROUPS, getContentTypeForPath, s3Client, uploadToR2 } from './serverContext.ts';
import { backupState } from './stateManager.ts';
import { getVariantR2Key, toPosix } from './variantMaterializer.ts';
import { IMAGE_VARIANT_FIELDS, auditMediaVariantsInState, collectMediaVariantEntries, generateVariantsForEntry, logMediaVariantStatus, mediaVariantsStatus, publishStateJsonToR2, resetMediaVariantsStatus, syncItemFromPrimaryMedia, verifyPublishedMediaVariants } from './mediaVariantsService.ts';

export function registerMediaVariantsRoutes(app: Express) {
  app.post("/api/media-variants/audit", async (req, res) => {
    if (mediaVariantsStatus.running) return res.json({ status: mediaVariantsStatus, audit: mediaVariantsStatus.audit });

    resetMediaVariantsStatus('audit');
    mediaVariantsStatus.running = true;
    logMediaVariantStatus('Scanning state.json for missing media variants...');

    // Respond immediately — client polls GET /api/media-variants/status for progress
    res.json({ started: true, message: 'Audit started' });

    try {
      const state = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8'));
      // Pre-count entries for the progress bar
      const preEntries = collectMediaVariantEntries(state, true);
      mediaVariantsStatus.total = preEntries.length;
      const audit = await auditMediaVariantsInState(state, { includeTopLevelReferences: true });
      mediaVariantsStatus.audit = audit;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.phase = 'done';
      if (!mediaVariantsStatus.cancelled) {
        logMediaVariantStatus(`Audit complete: ${audit.issueCount} issues, ${audit.generatableIssueCount} generatable.`);
      }
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      logMediaVariantStatus(`Audit failed: ${mediaVariantsStatus.error}`);
    }
  });

  // GET status for polling (used by the progress bar in the frontend)
  app.get("/api/media-variants/status", (req, res) => {
    res.json({
      running: mediaVariantsStatus.running,
      cancelled: mediaVariantsStatus.cancelled,
      done: mediaVariantsStatus.done,
      phase: mediaVariantsStatus.phase,
      progress: mediaVariantsStatus.progress,
      total: mediaVariantsStatus.total,
      error: mediaVariantsStatus.error,
      audit: mediaVariantsStatus.done ? mediaVariantsStatus.audit : null,
      result: mediaVariantsStatus.done ? mediaVariantsStatus.result : null,
    });
  });

  // Cancel a running audit or generation
  app.post("/api/media-variants/audit/cancel", (req, res) => {
    if (!mediaVariantsStatus.running) {
      return res.json({ cancelled: false, message: 'No task running' });
    }
    mediaVariantsStatus.cancelled = true;
    logMediaVariantStatus('Cancel requested by user.');
    res.json({ cancelled: true, message: 'Cancel signal sent' });
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
      const postIds: string[] | undefined = Array.isArray(req.body?.postIds) && req.body.postIds.length > 0
        ? req.body.postIds.map(String)
        : undefined;
      const postIdSet = postIds ? new Set(postIds) : null;
      const statePath = path.join(DATA_DIR, 'state.json');
      const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      const auditBefore = await auditMediaVariantsInState(state, { includeTopLevelReferences: false });
      const issueEntryKeys = new Set(
        auditBefore.issues
          .filter((issue: any) => {
            if (!issue.canGenerate || issue.reason === 'source-unavailable') return false;
            if (postIdSet && !postIdSet.has(String(issue.itemId))) return false;
            return true;
          })
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
      const allLocalPaths: string[] = [];
      for (const g of generated) {
        if (g.localPaths) {
          for (const p of Object.values(g.localPaths as Record<string, string>)) {
            allLocalPaths.push(p);
          }
        }
      }
      let validationAfter: any = null;
      if (dryRun) {
        logMediaVariantStatus('Dry-run complete. No files, local state, or R2 objects were changed.');
      } else {
        validationAfter = await validateMediaState(state, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
        await fs.mkdir(path.dirname(candidatePath), { recursive: true });
        await fs.writeFile(candidatePath, JSON.stringify(state, null, 2), 'utf-8');
        logMediaVariantStatus(`Generated ${allLocalPaths.length} local files and wrote candidate state to ${candidatePath}. Nothing was published yet.`);
      }

      const result = {
        success: failed.length === 0,
        dryRun,
        published: false,
        generated,
        failed,
        generatedFiles: allLocalPaths,
        candidatePath: dryRun ? null : candidatePath,
        auditBefore,
        validationAfter,
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

  // One-step endpoint: generate variants, upload to R2, and publish state.json — all in one click.
  // Accepts { postIds?: string[] } to limit generation to specific posts (empty = all).
  app.post("/api/media-variants/generate-and-publish", async (req, res) => {
    if (mediaVariantsStatus.running) return res.status(409).json({ error: 'Media variant task already running', status: mediaVariantsStatus });

    resetMediaVariantsStatus('generate-and-publish');
    mediaVariantsStatus.running = true;
    logMediaVariantStatus('Starting one-step generate-and-publish for media variants...');

    try {
      const postIds: string[] | undefined = Array.isArray(req.body?.postIds) && req.body.postIds.length > 0
        ? req.body.postIds.map(String)
        : undefined;
      const postIdSet = postIds ? new Set(postIds) : null;

      const statePath = path.join(DATA_DIR, 'state.json');
      const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
      const auditBefore = await auditMediaVariantsInState(state, { includeTopLevelReferences: false });

      // Build set of generatable issue keys, optionally filtered by postIds
      const issueEntryKeys = new Set(
        auditBefore.issues
          .filter((issue: any) => {
            if (!issue.canGenerate || issue.reason === 'source-unavailable') return false;
            if (postIdSet && !postIdSet.has(String(issue.itemId))) return false;
            return true;
          })
          .map((issue: any) => `${issue.itemId}|${issue.mediaIndex}`)
      );

      const entries = collectMediaVariantEntries(state, false)
        .filter(entry => issueEntryKeys.has(`${entry.item?.id || ''}|${entry.mediaIndex}`));

      if (entries.length === 0) {
        mediaVariantsStatus.running = false;
        mediaVariantsStatus.done = true;
        mediaVariantsStatus.phase = 'done';
        logMediaVariantStatus('No generatable issues found. Nothing to do.');
        return res.json({ success: true, generated: [], failed: [], auditBefore, message: 'No generatable issues found.' });
      }

      mediaVariantsStatus.total = entries.length;
      const generated: any[] = [];
      const failed: any[] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        mediaVariantsStatus.progress = i + 1;
        try {
          logMediaVariantStatus(`Generating & uploading ${i + 1}/${entries.length}: ${entry.label}`);
          // uploadToCloud: true → materializeVariantSet generates AND uploads to R2 in one shot
          const result = await generateVariantsForEntry(entry, { dryRun: false, uploadToCloud: true });
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

      // Sync post root fields from primary mergedMedia
      for (const item of state.items || []) {
        if (Array.isArray(item.mergedMedia) && item.mergedMedia.length > 0) {
          syncItemFromPrimaryMedia(item);
        }
      }

      // Direct save to R2, skipping validation (variants already uploaded individually)
      state.lastUpdated = new Date().toISOString();
      const stateString = JSON.stringify(state, null, 2);
      await backupState();
      await fs.writeFile(path.join(DATA_DIR, 'state.json'), Buffer.from(stateString, 'utf-8'));
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'state.json',
        Body: Buffer.from(stateString),
        ContentType: "application/json; charset=utf-8",
      }));
      logMediaVariantStatus('State.json published to R2 and saved locally with CDN URLs.');

      const allGeneratedFiles: string[] = [];
      for (const g of generated) {
        if (g.localPaths) {
          for (const p of Object.values(g.localPaths as Record<string, string>)) {
            allGeneratedFiles.push(p);
          }
        }
      }

      const result = {
        success: failed.length === 0,
        generated,
        failed,
        generatedFiles: allGeneratedFiles,
        auditBefore,
        published: true,
      };

      mediaVariantsStatus.result = result;
      mediaVariantsStatus.audit = auditBefore;
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.phase = 'done';
      logMediaVariantStatus(`Generate-and-publish complete: ${generated.length} generated, ${failed.length} failed.`);
      res.json(result);
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      logMediaVariantStatus(`Generate-and-publish failed: ${mediaVariantsStatus.error}`);
      res.status(500).json({ error: mediaVariantsStatus.error, status: mediaVariantsStatus });
    }
  });

  app.post("/api/media-variants/publish", async (req, res) => {
    if (mediaVariantsStatus.running) return res.status(409).json({ error: 'Media variant task already running', status: mediaVariantsStatus });

    resetMediaVariantsStatus('publish');
    mediaVariantsStatus.running = true;
    logMediaVariantStatus('Starting R2 publish for generated media variants...');

    try {
      const candidatePath = path.join(BACKUPS_DIR, 'migrations', 'media-variants-candidate.json');
      let state: any;
      try {
        state = JSON.parse(await fs.readFile(candidatePath, 'utf-8'));
      } catch {
        throw new Error('No candidate state found. Run Generate first.');
      }

      // Collect all local files referenced in the candidate state
      const filesToUpload: Array<{ localPath: string; r2Key: string; contentType: string }> = [];
      const seen = new Set<string>();

      const collectFromMedia = (media: any) => {
        for (const field of [...IMAGE_VARIANT_FIELDS, 'image_original']) {
          const url = media?.[field];
          if (!url || typeof url !== 'string') continue;
          // Only process local data_v2 URLs (not R2 URLs, not external)
          if (url.includes('r2.dev') || url.includes('cloudflare') || url.startsWith('http')) continue;
          const localPath = path.join(process.cwd(), url.replace(/^\//, ''));
          if (seen.has(localPath)) continue;
          seen.add(localPath);

          // Determine group and R2 key from the local URL path
          // URL format: /data_v2/{group}/{variantDir}/{filename}
          const urlParts = url.replace(/^\/+/, '').split('/');
          // urlParts: ['data_v2', 'instagram', 'thumbs400', 'file.jpg']
          if (urlParts.length < 4 || urlParts[0] !== 'data_v2') continue;
          const group = urlParts[1];
          if (!(group in V2_MEDIA_GROUPS)) continue;
          const dirName = urlParts[2];
          const filename = urlParts.slice(3).join('/');
          const r2Key = getVariantR2Key(group as keyof typeof V2_MEDIA_GROUPS, dirName, filename);
          filesToUpload.push({ localPath, r2Key, contentType: getContentTypeForPath(localPath) });
        }
      };

      for (const item of state.items || []) {
        if (Array.isArray(item.mergedMedia)) {
          for (const media of item.mergedMedia) {
            collectFromMedia(media);
          }
        }
        collectFromMedia(item);
      }

      logMediaVariantStatus(`Found ${filesToUpload.length} files to upload to R2`);

      const uploaded: string[] = [];
      const uploadErrors: string[] = [];
      // Map absolute local paths to their CDN URLs for rewriting state.json
      const localPathToCdnUrl = new Map<string, string>();

      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        mediaVariantsStatus.progress = i + 1;
        mediaVariantsStatus.total = filesToUpload.length;
        try {
          const buffer = await fs.readFile(file.localPath);
          const r2Url = await uploadToR2(buffer, file.r2Key, file.contentType);
          uploaded.push(file.r2Key);
          // Track mapping: local path → CDN URL for URL rewriting
          localPathToCdnUrl.set(file.localPath, r2Url);
          // Also map the /data_v2/... URL form → CDN URL
          const relativeUrl = '/' + toPosix(path.relative(process.cwd(), file.localPath));
          localPathToCdnUrl.set(relativeUrl, r2Url);
          logMediaVariantStatus(`Uploaded ${i + 1}/${filesToUpload.length}: ${file.r2Key}`);
        } catch (err: any) {
          uploadErrors.push(`${file.r2Key}: ${err.message}`);
          logMediaVariantStatus(`Upload failed: ${file.r2Key}: ${err.message}`);
        }
      }

      // Rewrite local URLs in state to CDN URLs before publishing
      if (localPathToCdnUrl.size > 0) {
        logMediaVariantStatus(`Rewriting ${localPathToCdnUrl.size} local URL mappings to CDN URLs in state...`);
        const rewriteMediaUrls = (media: any) => {
          if (!media || typeof media !== 'object') return;
          // All fields that may contain image URLs
          const urlFields = [
            ...IMAGE_VARIANT_FIELDS,
            'image_original', 'image', 'image_large', 'image_preview',
            'url', 'link', 'thumbnail', 'thumb', 'preview', 'poster',
            'largeUrl', 'localUrl', 'local_highres', 'local_large_variant',
          ];
          for (const field of urlFields) {
            const value = media[field];
            if (!value || typeof value !== 'string') continue;
            // Check direct match
            if (localPathToCdnUrl.has(value)) {
              media[field] = localPathToCdnUrl.get(value)!;
              continue;
            }
            // Check by resolving to absolute local path
            if (value.startsWith('/data_v2/') || value.startsWith('data_v2/')) {
              const normalized = value.startsWith('/') ? value : '/' + value;
              if (localPathToCdnUrl.has(normalized)) {
                media[field] = localPathToCdnUrl.get(normalized)!;
                continue;
              }
              const absPath = path.join(process.cwd(), value.replace(/^\//, ''));
              if (localPathToCdnUrl.has(absPath)) {
                media[field] = localPathToCdnUrl.get(absPath)!;
              }
            }
          }
        };

        for (const item of state.items || []) {
          if (Array.isArray(item.mergedMedia)) {
            for (const media of item.mergedMedia) {
              rewriteMediaUrls(media);
            }
          }
          rewriteMediaUrls(item);
        }
        logMediaVariantStatus('URL rewriting complete.');
      }

      // Publish state.json to R2
      if (uploadErrors.length === 0 || uploaded.length > 0) {
        logMediaVariantStatus('Publishing state.json to R2...');
        await publishStateJsonToR2(state);

        // Also update local state.json (with CDN URLs now)
        await backupState();
        await fs.writeFile(path.join(DATA_DIR, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
        logMediaVariantStatus('Local state.json updated with CDN URLs.');
      }

      const publishResult = {
        success: uploadErrors.length === 0,
        uploaded,
        uploadErrors,
        totalFiles: filesToUpload.length,
      };

      mediaVariantsStatus.result = { ...mediaVariantsStatus.result, publishResult };
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.done = true;
      mediaVariantsStatus.phase = 'done';
      logMediaVariantStatus(`Publish complete: ${uploaded.length} uploaded, ${uploadErrors.length} errors.`);
      res.json(publishResult);
    } catch (error: any) {
      mediaVariantsStatus.running = false;
      mediaVariantsStatus.error = error.message || String(error);
      logMediaVariantStatus(`Publish failed: ${mediaVariantsStatus.error}`);
      res.status(500).json({ error: mediaVariantsStatus.error, status: mediaVariantsStatus });
    }
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


}
