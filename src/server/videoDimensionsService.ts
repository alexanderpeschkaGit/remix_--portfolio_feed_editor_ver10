import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { BUNNY_CONFIG, DATA_DIR, execAsync } from './serverContext.ts';

export async function probeVideoDimensions(videoPathOrUrl: string): Promise<{ width: number; height: number } | null> {
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

export async function fetchBunnyVideoMetadata(libraryId: any, videoId: any): Promise<any | null> {
  if (!BUNNY_CONFIG.apiKey || !libraryId || !videoId) return null;
  try {
    const metaUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { "AccessKey": BUNNY_CONFIG.apiKey, "Accept": "application/json" }
    });
    if (!metaRes.ok) return null;
    return await metaRes.json();
  } catch (error: any) {
    console.warn(`[bunny] Metadata lookup failed for video ${videoId}:`, error.message || error);
    return null;
  }
}

export async function ensureStateVideoDimensions(state: any) {
  if (!state || !Array.isArray(state.items)) return;
  
  const isVideoUrl = (url?: string) => {
    if (!url) return false;
    return /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(url.split('?')[0]);
  };
  const isBunnyItem = (obj: any) => {
    const type = String(obj?.type || '').toLowerCase();
    return type === 'bunny' || (!!obj?.videoId && !!obj?.libraryId);
  };
  const resolveDims = async (obj: any) => {
    if (isBunnyItem(obj)) {
      const meta = await fetchBunnyVideoMetadata(obj.libraryId, obj.videoId);
      if (meta && Number(meta.width) > 0 && Number(meta.height) > 0) {
        return { width: Number(meta.width), height: Number(meta.height) };
      }
      return null;
    }
    const videoSrc = obj.video || obj.image || obj.url;
    return await probeVideoDimensions(videoSrc);
  };

  for (const item of state.items) {
    const itemType = String(item.type || '').toLowerCase();
    const isVideo = isBunnyItem(item) || itemType === 'video' || isVideoUrl(item.video) || isVideoUrl(item.image) || isVideoUrl(item.url);
    
    if (isVideo) {
      const currentW = item.image_width;
      const currentH = item.image_height;
      const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
      
      if (isFallback) {
        const dims = await resolveDims(item);
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
        const isMediaVideo = isBunnyItem(media) || mediaType === 'video' || isVideoUrl(media.video) || isVideoUrl(media.image) || isVideoUrl(media.url);
        
        if (isMediaVideo) {
          const currentW = media.image_width;
          const currentH = media.image_height;
          const isFallback = (currentW === 1080 && currentH === 1080) || !currentH || !currentW;
          
          if (isFallback) {
            const dims = await resolveDims(media);
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
