import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, usageStats } from './serverContext.ts';
import { toPosix } from './variantMaterializer.ts';

export function registerVideoResolveRoutes(app: Express) {
  // ── Instagram video source resolution (custom thumbnail capture) ──
  const INSTA_DATA_PATH = path.join(DATA_DIR, 'instagram', 'insta_data.json');
  let instaDataCache: any[] | null = null;

  const loadInstaData = async (): Promise<any[]> => {
    if (instaDataCache) return instaDataCache;
    try {
      const raw = await fs.readFile(INSTA_DATA_PATH, 'utf-8');
      instaDataCache = JSON.parse(raw);
    } catch {
      instaDataCache = [];
    }
    return instaDataCache;
  };

  const isDirectVideoFile = (value?: string) =>
    !!value && /\.(mp4|webm|mov)(\?.*)?$/i.test(String(value).split('?')[0]);

  const extractInstagramShortcode = (value?: string): string | null => {
    if (!value) return null;
    const match = String(value).match(/instagram\.com\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/i);
    return match ? match[1] : null;
  };

  const stripFileStem = (filePath: string) => {
    const clean = filePath.split('?')[0];
    const base = clean.split('/').pop() || clean;
    return base.replace(/\.(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff|mp4|webm|mov|avi|mkv|flv)$/i, '');
  };

  const localPathToUrl = (absPath: string) => {
    const rel = path.relative(DATA_DIR, absPath);
    return `/data/${toPosix(rel)}`;
  };

  const getInstagramVideoFilesOnDisk = async (): Promise<string[]> => {
    const files: string[] = [];
    const root = path.join(DATA_DIR, 'instagram');
    const walk = async (dir: string) => {
      let entries: string[] = [];
      try { entries = await fs.readdir(dir); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        let stat;
        try { stat = await fs.stat(full); } catch { continue; }
        if (stat.isDirectory()) await walk(full);
        else if (stat.isFile() && isDirectVideoFile(entry)) files.push(full);
      }
    };
    await walk(root);
    return files;
  };

  const resolveInstagramVideoSource = async (
    post: any,
    media: any,
    index: number
  ): Promise<{ videoUrl: string; source: string } | null> => {
    if (!media || typeof media !== 'object') return null;

    // 1) Direct playable file already on the media item (any field, incl. legacy mp4-in-image)
    for (const field of ['video', 'video_url', 'url', 'image', 'image_original', 'image_1k', 'image_large']) {
      const value = media?.[field];
      if (typeof value === 'string' && isDirectVideoFile(value)) {
        return { videoUrl: value, source: 'direct' };
      }
    }

    // 2) insta_data.json lookup by shortcode (id/link)
    const shortcode =
      extractInstagramShortcode(media?.link) ||
      extractInstagramShortcode(media?.url) ||
      extractInstagramShortcode(media?.video) ||
      extractInstagramShortcode(post?.link) ||
      extractInstagramShortcode(post?.url);
    if (shortcode) {
      const instaData = await loadInstaData();
      const entry = instaData.find(
        (e: any) => e?.id === shortcode || (typeof e?.link === 'string' && e.link.includes(shortcode))
      );
      if (entry && Array.isArray(entry.media_list)) {
        const videoFiles = entry.media_list.filter((p: any) => typeof p === 'string' && isDirectVideoFile(p));
        if (videoFiles.length > 0) {
          // Prefer stem match against any local path hint on the media item
          const localHint = ['video', 'video_url', 'url', 'image', 'image_thumb', 'image_1k', 'image_2k', 'image_3k']
            .map((f) => media?.[f])
            .find((v) => typeof v === 'string' && v.startsWith('/data/'));
          if (localHint) {
            const hintStem = stripFileStem(localHint);
            const byStem = videoFiles.find((p: string) => stripFileStem(p) === hintStem);
            if (byStem) return { videoUrl: byStem, source: 'insta-data-stem' };
          }
          // "Nth video" mapping within the post's mergedMedia (order is preserved)
          const merged = Array.isArray(post?.mergedMedia) ? post.mergedMedia : [];
          const priorVideos = merged.slice(0, index).filter((m: any) =>
            m?.type === 'video' || isDirectVideoFile(m?.video) || isDirectVideoFile(m?.url)
          ).length;
          const chosen = videoFiles[Math.min(priorVideos, videoFiles.length - 1)] || videoFiles[0];
          return { videoUrl: chosen, source: 'insta-data' };
        }
      }
    }

    // 3) Disk fallback: match by post date (filename pattern YYYY-MM-DD_HH-MM-SS_UTC[_N].mp4)
    const dateStr = post?.date || post?.timestamp;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const stem = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}_UTC`;
        const files = await getInstagramVideoFilesOnDisk();
        const suffixes = index > 0 ? [`_${index + 1}`, ''] : ['', `_${index + 1}`];
        for (const suffix of suffixes) {
          const found = files.find((f) => stripFileStem(f) === stem + suffix);
          if (found) return { videoUrl: localPathToUrl(found), source: 'disk-date' };
        }
      }
    }

    return null;
  };

  // API: Resolve a playable video source for a standard/Instagram video item (custom thumbnail capture)
  app.post("/api/video/resolve-source", async (req, res) => {
    try {
      const { postId, index, media } = req.body || {};
      let post: any = { id: postId };
      try {
        const stateData = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
        const state = JSON.parse(stateData);
        const found = Array.isArray(state.items) ? state.items.find((it: any) => it?.id === postId) : null;
        if (found) post = found;
      } catch {}

      const resolved = await resolveInstagramVideoSource(
        post,
        media || {},
        typeof index === 'number' ? index : 0
      );

      if (!resolved) {
        return res.json({
          success: false,
          videoUrl: '',
          error: 'No local Instagram video file found for this item.',
        });
      }

      res.json({ success: true, videoUrl: resolved.videoUrl, source: resolved.source });
    } catch (error: any) {
      console.error("Error resolving Instagram video source:", error);
      res.status(500).json({ success: false, error: error.message || 'Failed to resolve video source' });
    }
  });

  app.get("/api/cloudflare/usage", async (req, res) => {
    // Calculate estimated costs
    // Free Tier: 1M Class A, 10M Class B, 10GB Storage
    const freeA = 1000000;
    const freeB = 10000000;
    const freeStorage = 10 * 1024 * 1024 * 1024;

    const costA = Math.max(0, (usageStats.classA - freeA) * 0.0000045); // $4.50 per million
    const costB = Math.max(0, (usageStats.classB - freeB) * 0.00000036); // $0.36 per million
    const costStorage = Math.max(0, (usageStats.storageBytes - freeStorage) / (1024 * 1024 * 1024) * 0.015); // $0.015 per GB

    const totalCost = costA + costB + costStorage;

    res.json({
      local: usageStats,
      estimatedCost: totalCost.toFixed(4),
      limits: {
        freeA,
        freeB,
        freeStorage
      },
      hasApiToken: !!process.env.CLOUDFLARE_API_TOKEN
    });
  });

  // Lightweight health check for batch file & auto-reload
  app.get("/api/ping", (req, res) => {
    res.json({ ok: true, time: Date.now() });
  });


}
