import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { stateValidationHttpPayload } from './statePublishing.ts';
import { BACKUPS_DIR, DATA_DIR, R2_CONFIG, execAsync, hasR2UploadCredentials, upload } from './serverContext.ts';
import { backupState, localTimestamp, persistAcceptedState } from './stateManager.ts';
import { getVariantLocalPath, getVariantLocalUrl, materializeVariantSet, normalizeUploadedImage, publishHtmlAndState, uploadVariantSetToR2 } from './variantMaterializer.ts';
import { replaceMediaThumbnail } from './mediaDeleteRoutes.ts';

export function registerUploadRoutes(app: Express) {
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
      const timestamp = localTimestamp();
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

      let variantSet: any = null;
      let remoteUrls: Record<string, string> = {};
      let uploadErrors: string[] = [];
      const canUploadDirectly = hasR2UploadCredentials();

      if (thumbBuffer && thumbBuffer.length > 0) {
        variantSet = await materializeVariantSet(thumbBuffer, {
          group: 'uploads',
          baseName,
          originalBuffer: thumbBuffer,
          originalExt: 'jpg',
          uploadToCloud: false,
        });

        if (canUploadDirectly) {
          try {
            const directUploadResult = await uploadVariantSetToR2(variantSet, {
              group: 'uploads',
              originalBuffer: thumbBuffer,
              originalExt: 'jpg',
            });
            remoteUrls = directUploadResult.remoteUrls || {};
            uploadErrors = directUploadResult.uploadErrors || [];
          } catch (uploadError: any) {
            uploadErrors = [uploadError?.message || 'Thumbnail upload failed'];
          }
        }
      }

      const localUrls = variantSet?.localUrls || {};
      const localThumb = localUrls.image_thumb || '';
      const local1k = localUrls.image_1k || '';
      const local2k = localUrls.image_2k || '';
      const local3k = localUrls.image_3k || '';
      const localOriginal = localUrls.image_original || '';
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
        type: 'video',
        url: browserUrl,
        image: local2k || local3k || local1k || localThumb || '',
        image_thumb: localThumb,
        image_1k: local1k,
        image_2k: local2k,
        image_3k: local3k,
        image_original: remoteOriginal || localOriginal,
        image_width: variantSet.sourceWidth || 0,
        image_height: variantSet.sourceHeight || 0,
        missing_variants: variantSet.missingVariants,
        cloudUploaded,
        cloudUploadErrors: uploadErrors,
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

  // API: Upload a custom thumbnail image (captured from video frame via canvas)
  app.post("/api/upload-custom-thumb", async (req, res) => {
    try {
      const { imageData, postId, mediaIndex } = req.body;
      if (!imageData) {
        return res.status(400).json({ error: "No image data provided" });
      }

      // Decode base64 data URL (e.g. "data:image/jpeg;base64,...")
      const matches = imageData.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: "Invalid image data format. Expected data:image/...;base64,..." });
      }
      const ext = matches[1] === 'png' ? 'png' : 'jpg';
      const base64Data = matches[2];
      const imageBuffer = Buffer.from(base64Data, 'base64');

      if (imageBuffer.length < 100) {
        return res.status(400).json({ error: "Image data too small" });
      }

      // If mediaIndex is provided, use the unified replacement flow (cleanup old + generate new).
      if (postId && mediaIndex !== undefined && mediaIndex !== null) {
        const result = await replaceMediaThumbnail(String(postId), Number(mediaIndex), imageBuffer, 'custom');
        return res.json({
          success: true,
          cloudUploaded: true,
          cloudUploadErrors: [],
          image_thumb: result.image_thumb,
          image_1k: result.image_1k,
          image_2k: result.image_2k,
          image_3k: result.image_3k,
          image_original: result.image_original,
          image_width: result.image_width,
          image_height: result.image_height,
        });
      }

      // Legacy path (no mediaIndex): first-time thumbnail, no cleanup needed.
      const safePostId = (postId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
      const baseName = `custom-${safePostId}-${Date.now()}`;

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
        type: 'image',
        image: local2k || local3k || local1k || localThumb || '',
        image_thumb: localThumb,
        image_1k: local1k,
        image_2k: local2k,
        image_3k: local3k,
        image_original: remoteOriginal || localOriginal,
        image_width: variantSet.sourceWidth,
        image_height: variantSet.sourceHeight,
        missing_variants: variantSet.missingVariants,
        cloudUploaded,
        cloudUploadErrors: uploadErrors,
      });
    } catch (error: any) {
      console.error("Error processing custom thumbnail upload:", error);
      res.status(500).json({ error: error.message || "Failed to process custom thumbnail upload" });
    }
  });


}
