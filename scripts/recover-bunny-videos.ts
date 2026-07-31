// scripts/recover-bunny-videos.ts
// Recovery script: finds broken Bunny video entries in state.json and repairs them
// by querying the Bunny Stream API for matching videos.
//
// Usage:
//   npx tsx scripts/recover-bunny-videos.ts --dry-run
//   npx tsx scripts/recover-bunny-videos.ts --project-id C89Nq88o8Qi --input live_state2.json --dry-run
//   npx tsx scripts/recover-bunny-videos.ts --apply
//
// Required env vars (from .env): BUNNY_API_KEY, BUNNY_LIBRARY_ID
// Optional: BUNNY_PULL_ZONE, CLOUDFLARE_PUBLIC_DOMAIN, CLOUDFLARE_ACCOUNT_ID, etc.

import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ── Configuration ──

const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || "679639";
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || "";
const BUNNY_PULL_ZONE = process.env.BUNNY_PULL_ZONE || "";

const R2_PUBLIC_DOMAIN = (process.env.CLOUDFLARE_PUBLIC_DOMAIN || "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev").replace(/\/+$/, "");
const R2_BUCKET = process.env.CLOUDFLARE_BUCKET_NAME || "portfoliodata";
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "9b109aa9587252172ccb60f664f603f0";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_V2_DIR = path.join(process.cwd(), "data_v2");

const V2_PREFIX = "v2/data";

const MEDIA_VARIANTS = [
  { field: "image_thumb", dir: "thumbs400", suffix: "thumb", maxSide: 400, quality: 74 },
  { field: "image_1k", dir: "1k", suffix: "1k", maxSide: 1024, quality: 78 },
  { field: "image_2k", dir: "2k", suffix: "2k", maxSide: 2048, quality: 80 },
  { field: "image_3k", dir: "3k", suffix: "3k", maxSide: 3072, quality: 82 },
] as const;

// ── R2 Client ──

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || "0e11678f19a97c193c9a5647f7c4b37b",
    secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d",
  },
  forcePathStyle: false,
});

// ── CLI Args ──

function arg(name: string, fallback = ""): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const INPUT_PATH = arg("--input", "data/state.json");
const OUTPUT_PATH = arg("--output", INPUT_PATH);
const PROJECT_ID_FILTER = arg("--project-id", "");
const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

// ── Helpers ──

function log(...args: any[]) { console.log("[recover-bunny]", ...args); }
function verbose(...args: any[]) { if (VERBOSE) console.log("[recover-bunny:verbose]", ...args); }

const toPosix = (v: string) => v.replace(/\\/g, "/");
const normalizeExt = (ext?: string) => (ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";

function getVariantR2Key(group: string, dir: string, filename: string): string {
  return `${V2_PREFIX}/${group}/${dir}/${filename}`;
}

function getVariantLocalPath(group: string, dir: string, filename: string): string {
  return path.join(DATA_V2_DIR, group, dir, filename);
}

function getVariantLocalUrl(group: string, dir: string, filename: string): string {
  return `/${["data_v2", group, dir, filename].map(p => p.replace(/^\/+|\/+$/g, "")).join("/")}`;
}

function getBufferSha1(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${res.status} for ${url}`);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  // Reject non-image responses (HTML error pages etc.)
  if (contentType && !contentType.startsWith("image/") && !contentType.startsWith("application/octet-stream")) {
    throw new Error(`Non-image content-type: ${contentType}`);
  }
  return buf;
}

async function uploadToR2(buffer: Buffer, r2Key: string, contentType: string): Promise<string> {
  await s3Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_DOMAIN}/${r2Key}`;
}

// ── Bunny API ──

interface BunnyVideo {
  guid: string;
  title: string;
  length: number;
  status: number; // 0=processing, 4=finished
  thumbnailFileName: string;
  metaTags?: Array<{ property: string; value: string }>;
}

async function listAllBunnyVideos(): Promise<BunnyVideo[]> {
  if (!BUNNY_API_KEY) throw new Error("BUNNY_API_KEY not set in environment");

  const allVideos: BunnyVideo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos?page=${page}&itemsPerPage=${perPage}&orderBy=date`;
    verbose(`Fetching Bunny videos page ${page}...`);
    const res = await fetch(url, {
      headers: { "AccessKey": BUNNY_API_KEY, "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`Bunny list API error: ${res.status} ${res.statusText}`);
    const data: any = await res.json();
    const items: BunnyVideo[] = data.items || [];
    allVideos.push(...items);
    verbose(`  got ${items.length} videos (total: ${allVideos.length})`);
    if (items.length < perPage) break;
    page++;
  }
  return allVideos;
}

async function getBunnyVideoDetail(videoId: string): Promise<BunnyVideo | null> {
  if (!BUNNY_API_KEY) return null;
  try {
    const url = `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`;
    const res = await fetch(url, {
      headers: { "AccessKey": BUNNY_API_KEY, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as BunnyVideo;
  } catch {
    return null;
  }
}

// ── Variant Generation ──

async function generateVariantSet(
  sourceBuffer: Buffer,
  baseName: string,
  options: { group?: string; uploadToCloud?: boolean } = {}
) {
  const group = options.group || "uploads";
  const uploadToCloud = options.uploadToCloud !== false;

  // Validate source buffer before processing
  if (!(await isValidImageBuffer(sourceBuffer))) {
    throw new Error("Source buffer is not a valid image");
  }

  const metadata = await sharp(sourceBuffer, { failOn: "error", limitInputPixels: false }).metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;
  const sourceMaxSide = Math.max(sourceWidth, sourceHeight);

  const localUrls: Record<string, string> = {};
  const remoteUrls: Record<string, string> = {};

  // Save original
  const originalFilename = `${baseName}_original.jpg`;
  const originalLocalPath = getVariantLocalPath(group, "originals", originalFilename);
  await fs.mkdir(path.dirname(originalLocalPath), { recursive: true });
  await fs.writeFile(originalLocalPath, sourceBuffer);
  localUrls["image_original"] = getVariantLocalUrl(group, "originals", originalFilename);

  if (uploadToCloud) {
    const r2Key = getVariantR2Key(group, "originals", originalFilename);
    remoteUrls["image_original"] = await uploadToR2(sourceBuffer, r2Key, "image/jpeg");
  }

  // Generate variants
  for (const variant of MEDIA_VARIANTS) {
    if (sourceMaxSide < variant.maxSide) continue;

    const filename = `${baseName}_${variant.suffix}.jpg`;
    const variantBuffer = await sharp(sourceBuffer, { failOn: "error", limitInputPixels: false })
      .resize(variant.maxSide, variant.maxSide, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: variant.quality })
      .toBuffer();

    const localPath = getVariantLocalPath(group, variant.dir, filename);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, variantBuffer);
    localUrls[variant.field] = getVariantLocalUrl(group, variant.dir, filename);

    if (uploadToCloud) {
      const r2Key = getVariantR2Key(group, variant.dir, filename);
      remoteUrls[variant.field] = await uploadToR2(variantBuffer, r2Key, "image/jpeg");
    }
  }

  return { sourceMaxSide, sourceWidth, sourceHeight, localUrls, remoteUrls };
}

// ── Bunny Thumbnail Resolution ──

async function isValidImageBuffer(buf: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buf, { failOn: "error", limitInputPixels: false }).metadata();
    return !!(meta.width && meta.height && meta.format);
  } catch {
    return false;
  }
}

async function resolveBunnyThumbnail(media: { videoId: string; libraryId?: string; bunnyThumbUrl?: string; thumbnail?: string; poster?: string }): Promise<Buffer | null> {
  // Try direct URLs first
  const directThumbs = [media.bunnyThumbUrl, media.thumbnail, media.poster].filter(Boolean) as string[];
  for (const url of directThumbs) {
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const buf = await fetchBuffer(url);
      if (buf.length > 100 && (await isValidImageBuffer(buf))) return buf;
    } catch (e: any) {
      verbose(`Direct thumb failed: ${e.message}`);
    }
  }

  // Try Bunny API metadata → get thumbnailFileName
  if (!BUNNY_API_KEY) return null;
  try {
    const libraryId = media.libraryId || BUNNY_LIBRARY_ID;
    const metaUrl = `https://video.bunnycdn.com/library/${libraryId}/videos/${media.videoId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { "AccessKey": BUNNY_API_KEY, "Accept": "application/json" },
    });
    if (!metaRes.ok) return null;
    const meta: any = await metaRes.json();
    const thumbFilename = meta.thumbnailFileName || "thumbnail.jpg";

    // Try iframe.mediadelivery.net first (same domain as embeds, no pull zone needed)
    const cdnCandidates: string[] = [
      `https://iframe.mediadelivery.net/${libraryId}/${media.videoId}/thumbnail.jpg`,
    ];
    if (BUNNY_PULL_ZONE) {
      cdnCandidates.push(`https://${BUNNY_PULL_ZONE}/${media.videoId}/${thumbFilename}`);
    }
    // Fallback: common Bunny CDN patterns
    cdnCandidates.push(`https://${libraryId}.b-cdn.net/${media.videoId}/${thumbFilename}`);

    for (const thumbUrl of cdnCandidates) {
      try {
        verbose(`Trying CDN thumb: ${thumbUrl}`);
        const buf = await fetchBuffer(thumbUrl);
        if (buf.length > 100 && (await isValidImageBuffer(buf))) {
          verbose(`  ✅ Valid image from ${thumbUrl}`);
          return buf;
        }
      } catch (e: any) {
        verbose(`  CDN thumb failed: ${e.message}`);
      }
    }
    return null;
  } catch (e: any) {
    verbose(`Bunny API thumb lookup failed: ${e.message}`);
    return null;
  }
}

// ── Core Logic ──

interface BrokenEntry {
  postId: string;
  postTitle: string;
  mediaIndex: number;
  mediaItem: any;
  localFilename: string; // extracted from url/image_original
}

function findBrokenEntries(state: any): BrokenEntry[] {
  const broken: BrokenEntry[] = [];
  for (const item of state.items || []) {
    if (PROJECT_ID_FILTER && String(item.id) !== PROJECT_ID_FILTER) continue;
    if (!Array.isArray(item.mergedMedia)) continue;

    for (let i = 0; i < item.mergedMedia.length; i++) {
      const m = item.mergedMedia[i];
      const mType = String(m.type || "").toLowerCase();

      // Case 1: type is 'video' but has bunnyTaskId (stuck in upload phase)
      const isStuckVideo = mType === "video" && !!m.bunnyTaskId && !m.videoId;

      // Case 2: type is 'bunny' but missing videoId (orphaned bunny entry)
      const isOrphanedBunny = mType === "bunny" && !m.videoId;

      if (isStuckVideo || isOrphanedBunny) {
        const localFilename = extractLocalFilename(m);
        broken.push({
          postId: String(item.id),
          postTitle: item.title || "Untitled",
          mediaIndex: i,
          mediaItem: m,
          localFilename,
        });
      }
    }
  }
  return broken;
}

function extractLocalFilename(media: any): string {
  // Try to extract filename from url, image_original, or any field pointing to a local MP4
  const candidates = [media.url, media.image_original, media.image, media.video];
  for (const url of candidates) {
    if (!url || typeof url !== "string") continue;
    // Extract filename from path
    const parts = url.replace(/\\/g, "/").split("/");
    const last = parts[parts.length - 1];
    if (/\.(mp4|webm|mov)$/i.test(last)) return last;
    // Also check for vidbunny- patterns
    const match = url.match(/(vidbunny-\d+\.\w+)/i);
    if (match) return match[1];
  }
  return "";
}

async function matchLocalMp4ToBunny(
  broken: BrokenEntry[],
  bunnyVideos: BunnyVideo[]
): Promise<Map<string, { video: BunnyVideo; broken: BrokenEntry }>> {
  const matches = new Map<string, { video: BunnyVideo; broken: BrokenEntry }>();

  for (const entry of broken) {
    // Strategy 1: Match by filename stem in Bunny video title
    // Bunny titles are: "{projectName} — {originalFilename}"
    const stem = entry.localFilename.replace(/\.[^.]+$/, "");

    for (const video of bunnyVideos) {
      if (matches.has(video.guid)) continue; // already matched

      const videoTitle = video.title || "";
      // Check if stem appears in title
      if (stem && videoTitle.includes(stem)) {
        matches.set(video.guid, { video, broken: entry });
        verbose(`Matched "${entry.localFilename}" → "${video.title}" (${video.guid})`);
        break;
      }
    }

    // Strategy 2: Match by project title in Bunny title
    if (![...matches.values()].some(m => m.broken === entry)) {
      const projectTitle = entry.postTitle.toLowerCase();
      for (const video of bunnyVideos) {
        if (matches.has(video.guid)) continue;
        const videoTitle = video.title.toLowerCase();
        if (videoTitle.includes(projectTitle)) {
          matches.set(video.guid, { video, broken: entry });
          verbose(`Matched by title "${entry.postTitle}" → "${video.title}" (${video.guid})`);
          break;
        }
      }
    }

    // Strategy 3: Match by metaTag projectId
    if (![...matches.values()].some(m => m.broken === entry)) {
      for (const video of bunnyVideos) {
        if (matches.has(video.guid)) continue;
        const metaTags = video.metaTags || [];
        const hasProjectId = metaTags.some(
          t => t.property === "projectId" && t.value === entry.postId
        );
        if (hasProjectId) {
          matches.set(video.guid, { video, broken: entry });
          verbose(`Matched by metaTag projectId="${entry.postId}" → "${video.title}" (${video.guid})`);
          break;
        }
      }
    }
  }

  return matches;
}

async function rebuildMediaEntry(
  entry: BrokenEntry,
  bunnyVideo: BunnyVideo
): Promise<any> {
  const libraryId = BUNNY_LIBRARY_ID;
  const videoId = bunnyVideo.guid;
  const embedUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`;
  const duration = bunnyVideo.length || 0;

  log(`  Rebuilding: "${entry.postTitle}" media[${entry.mediaIndex}] → ${videoId}`);

  // Resolve thumbnail
  const thumbBuffer = await resolveBunnyThumbnail({
    videoId,
    libraryId,
  });

  const baseName = `vidbunny-${Date.now()}-${Math.random().toString(36).substring(4)}`;

  let imageFields: Record<string, string> = {};
  let imageWidth = 0;
  let imageHeight = 0;

  if (thumbBuffer) {
    const variants = await generateVariantSet(thumbBuffer, baseName, {
      group: "uploads",
      uploadToCloud: true,
    });
    imageFields = {
      image: variants.remoteUrls["image_2k"] || variants.remoteUrls["image_1k"] || variants.localUrls["image_thumb"] || "",
      image_thumb: variants.remoteUrls["image_thumb"] || variants.localUrls["image_thumb"] || "",
      image_1k: variants.remoteUrls["image_1k"] || variants.localUrls["image_1k"] || "",
      image_2k: variants.remoteUrls["image_2k"] || variants.localUrls["image_2k"] || "",
      image_3k: variants.remoteUrls["image_3k"] || variants.localUrls["image_3k"] || "",
      image_original: embedUrl, // Bunny embed, not local path
    };
    imageWidth = variants.sourceWidth;
    imageHeight = variants.sourceHeight;
  } else {
    log(`  ⚠ No thumbnail available for ${videoId}, using placeholder fields`);
    imageFields = {
      image: "",
      image_thumb: "",
      image_1k: "",
      image_2k: "",
      image_3k: "",
      image_original: embedUrl,
    };
  }

  return {
    type: "bunny",
    videoId,
    libraryId,
    duration,
    url: embedUrl,
    image_width: imageWidth,
    image_height: imageHeight,
    bunnyThumbUrl: "",
    ...imageFields,
    // Remove stale fields
    uploadId: undefined,
    bunnyTaskId: undefined,
  };
}

// ── Special case: C89Nq88o8Qi (post with local MP4s but no state entries) ──

async function handleMissingPostFromLocalFiles(
  state: any,
  bunnyVideos: BunnyVideo[]
): Promise<{ postId: string; rebuiltMedia: any[] } | null> {
  if (!PROJECT_ID_FILTER) return null;

  const projectId = PROJECT_ID_FILTER;
  const postExists = (state.items || []).some((item: any) => String(item.id) === projectId);
  if (postExists) return null; // post exists, handled by findBrokenEntries

  // Check for local MP4 files in project subfolder
  // Pattern: data_v2/uploads/originals/{sanitizedName}_{projectId}/
  const uploadsDir = path.join(DATA_V2_DIR, "uploads", "originals");
  let subDir: string | null = null;
  try {
    const dirs = await fs.readdir(uploadsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (d.isDirectory() && d.name.endsWith(`_${projectId}`)) {
        subDir = path.join(uploadsDir, d.name);
        break;
      }
    }
  } catch { return null; }

  if (!subDir) {
    // Also try checking for loose files with project ID prefix
    log(`No subfolder found for project ${projectId}, checking loose files...`);
    return null; // handled below
  }

  const files = await fs.readdir(subDir);
  const mp4Files = files.filter(f => /\.mp4$/i.test(f));
  if (mp4Files.length === 0) return null;

  log(`\nFound ${mp4Files.length} orphaned MP4s in ${path.basename(subDir)}: ${mp4Files.join(", ")}`);

  // Try to match each MP4 to a Bunny video
  const projectName = arg("--project-name", "");
  const rebuiltMedia: any[] = [];

  for (const mp4File of mp4Files) {
    const stem = mp4File.replace(/\.mp4$/i, "");
    let matchedVideo: BunnyVideo | null = null;

    // Strategy 1: match by filename in title
    for (const video of bunnyVideos) {
      if (video.title.includes(stem)) {
        matchedVideo = video;
        break;
      }
    }

    // Strategy 2: match by project name in title
    if (!matchedVideo && projectName) {
      const nameLower = projectName.toLowerCase();
      for (const video of bunnyVideos) {
        if (video.title.toLowerCase().includes(nameLower)) {
          matchedVideo = video;
          break;
        }
      }
    }

    // Strategy 3: match by metaTag
    if (!matchedVideo) {
      for (const video of bunnyVideos) {
        const metaTags = video.metaTags || [];
        if (metaTags.some(t => t.property === "projectId" && t.value === projectId)) {
          matchedVideo = video;
          break;
        }
      }
    }

    if (matchedVideo) {
      const rebuilt = await rebuildMediaEntry(
        {
          postId: projectId,
          postTitle: projectName || "Untitled",
          mediaIndex: rebuiltMedia.length,
          mediaItem: {},
          localFilename: mp4File,
        },
        matchedVideo
      );
      rebuiltMedia.push(rebuilt);
      log(`  ✅ Matched "${mp4File}" → Bunny ${matchedVideo.guid}`);
    } else {
      log(`  ❌ No Bunny match for "${mp4File}"`);
    }
  }

  return { postId: projectId, rebuiltMedia };
}

// ── Main ──

async function main() {
  log("=== Bunny Video Recovery ===");
  log(`Input: ${INPUT_PATH}`);
  log(`Output: ${OUTPUT_PATH}`);
  log(`Filter project: ${PROJECT_ID_FILTER || "(all)"}`);
  log(`Mode: ${DRY_RUN ? "DRY RUN" : APPLY ? "APPLY" : "DRY RUN (default)"}`);
  log("");

  if (!BUNNY_API_KEY) {
    console.error("ERROR: BUNNY_API_KEY not set. Make sure your .env file is configured.");
    process.exit(1);
  }

  // 1. Load state
  let state: any;
  try {
    state = JSON.parse(await fs.readFile(INPUT_PATH, "utf-8"));
  } catch (e: any) {
    console.error(`Failed to load state from ${INPUT_PATH}:`, e.message);
    process.exit(1);
  }

  if (!Array.isArray(state.items)) {
    console.error("State file has no 'items' array. Is this a valid state.json?");
    process.exit(1);
  }

  log(`Loaded ${state.items.length} posts from state.`);

  // 2. Find broken entries
  const brokenEntries = findBrokenEntries(state);
  log(`\nFound ${brokenEntries.length} broken Bunny entries:`);
  for (const e of brokenEntries) {
    log(`  - Post "${e.postTitle}" (${e.postId}) media[${e.mediaIndex}]: type=${e.mediaItem.type}, localFile="${e.localFilename}"`);
  }

  // 3. Query Bunny API
  log("\nQuerying Bunny Stream API for all videos...");
  let bunnyVideos: BunnyVideo[] = [];
  try {
    bunnyVideos = await listAllBunnyVideos();
    log(`Retrieved ${bunnyVideos.length} videos from Bunny library ${BUNNY_LIBRARY_ID}.`);
  } catch (e: any) {
    console.error("Failed to query Bunny API:", e.message);
    process.exit(1);
  }

  // 4. Handle missing post from local files (special case)
  const missingPostResult = await handleMissingPostFromLocalFiles(state, bunnyVideos);

  // 5. Match broken entries to Bunny videos
  log("\nMatching broken entries to Bunny videos...");
  const matches = await matchLocalMp4ToBunny(brokenEntries, bunnyVideos);
  log(`Matched ${matches.size} of ${brokenEntries.length} broken entries.`);

  // 6. Rebuild media entries
  log("\nRebuilding media entries...");
  const repairMap = new Map<string, Map<number, any>>(); // postId → { mediaIndex → rebuiltItem }

  for (const [, { video, broken: entry }] of matches) {
    const rebuilt = await rebuildMediaEntry(entry, video);
    if (!repairMap.has(entry.postId)) repairMap.set(entry.postId, new Map());
    repairMap.get(entry.postId)!.set(entry.mediaIndex, rebuilt);
  }

  // 7. Apply repairs to state
  let repairedCount = 0;
  const repaired = JSON.parse(JSON.stringify(state)); // deep clone
  for (const item of repaired.items) {
    const postId = String(item.id);
    const postRepairs = repairMap.get(postId);
    if (!postRepairs) continue;

    if (!Array.isArray(item.mergedMedia)) item.mergedMedia = [];
    for (const [idx, rebuiltItem] of postRepairs) {
      item.mergedMedia[idx] = rebuiltItem;
      repairedCount++;
    }

    // Sync post-level fields from primary mergedMedia
    if (item.mergedMedia.length > 0) {
      const primary = item.mergedMedia[0];
      if (primary.type === "bunny" && primary.videoId) {
        item.type = "bunny";
        item.videoId = primary.videoId;
        item.libraryId = primary.libraryId;
        item.url = primary.url;
        item.image = primary.image;
        item.image_thumb = primary.image_thumb;
        item.image_1k = primary.image_1k;
        item.image_2k = primary.image_2k;
        item.image_3k = primary.image_3k;
        item.image_original = primary.image_original;
        item.image_width = primary.image_width;
        item.image_height = primary.image_height;
      }
    }
  }

  // 8. Handle missing post insertion
  if (missingPostResult && missingPostResult.rebuiltMedia.length > 0) {
    const existingIdx = repaired.items.findIndex((item: any) => String(item.id) === missingPostResult.postId);
    if (existingIdx >= 0) {
      // Update existing post
      repaired.items[existingIdx].mergedMedia = [
        ...(repaired.items[existingIdx].mergedMedia || []),
        ...missingPostResult.rebuiltMedia,
      ];
    } else {
      // Insert new post at top
      const postName = arg("--project-name", "Recovered Project");
      repaired.items.unshift({
        id: missingPostResult.postId,
        title: postName,
        description: "",
        network_name: "Custom",
        type: "bunny",
        states: [],
        mergedMedia: missingPostResult.rebuiltMedia,
        videoId: missingPostResult.rebuiltMedia[0]?.videoId || "",
        libraryId: missingPostResult.rebuiltMedia[0]?.libraryId || "",
      });
    }
    repairedCount += missingPostResult.rebuiltMedia.length;
  }

  // 9. Write result
  log(`\nTotal repaired: ${repairedCount} media entries.`);

  if (DRY_RUN || !APPLY) {
    const outputPath = arg("--dry-run-output", "backups/recovered-bunny-dry-run.json");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(repaired, null, 2), "utf-8");
    log(`Dry-run output written to: ${outputPath}`);
    log("Run with --apply to write changes to the state file.");
  }

  if (APPLY) {
    // Backup original
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join("backups", "data", `state_pre_bunny_recovery_${timestamp}.json`);
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(INPUT_PATH, backupPath);
    log(`Original backed up to: ${backupPath}`);

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(repaired, null, 2), "utf-8");
    log(`Repaired state written to: ${OUTPUT_PATH}`);
  }

  log("\nDone.");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
