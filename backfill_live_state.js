/**
 * backfill_live_state.js
 *
 * Merges local image paths from flickr_data.json + insta_data.json
 * into live_state2.json (which currently has media:[]).
 *
 * Rules:
 *   - Match by post ID
 *   - Flickr posts get: image (1k), image_large (3k), mergedMedia[]
 *   - Instagram posts get: image, mergedMedia[] (one entry per file)
 *   - Posts that already have a non-empty mergedMedia are left untouched
 *   - Output is saved to live_state2_backfilled.json (safe, non-destructive)
 *
 * Usage:  node backfill_live_state.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

// ── Load sources ──────────────────────────────────────────────────────────────
const liveState   = JSON.parse(readFileSync(join(root, 'live_state2.json'), 'utf8'));
const flickrData  = JSON.parse(readFileSync(join(root, 'data/flickr/flickr_data.json'), 'utf8'));
const instaData   = JSON.parse(readFileSync(join(root, 'data/instagram/insta_data.json'), 'utf8'));

// ── Build lookup maps ─────────────────────────────────────────────────────────
const flickrById = {};
for (const f of flickrData) {
  flickrById[String(f.id)] = f;
}

const instaById = {};
for (const i of instaData) {
  instaById[String(i.id)] = i;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isVideo(url) {
  return url && /\.(mp4|webm|mov)$/i.test(url);
}

function isImage(url) {
  return url && /\.(jpe?g|png|webp|gif|avif)$/i.test(url);
}

/**
 * Build a mergedMedia array from a list of local file paths.
 * Each JPG/PNG gets type:'image'; each MP4 gets type:'video'.
 */
function buildMergedMediaFromList(mediaList, primaryImage, imageLarge) {
  // Group: images first, then videos
  const images = mediaList.filter(isImage);
  const videos = mediaList.filter(isVideo);
  const all = [...images, ...videos];

  return all.map((url, idx) => {
    if (isVideo(url)) {
      return { type: 'video', url, video: url };
    }
    const entry = {
      type: 'image',
      image: url,
      image_thumb: url,
      image_1k: url,
    };
    // Attach the 3k large to the first image
    if (idx === 0 && imageLarge) {
      entry.image_large = imageLarge;
      entry.image_3k = imageLarge;
    }
    return entry;
  });
}

// ── Counters ──────────────────────────────────────────────────────────────────
let matched = 0;
let skipped = 0;
let unmatched = 0;

// ── Process items ─────────────────────────────────────────────────────────────
const items = liveState.items || liveState.posts || [];

for (const post of items) {
  const id = String(post.id);

  // Skip posts that already have image data
  const hasImage = post.image || (Array.isArray(post.mergedMedia) && post.mergedMedia.length > 0);
  if (hasImage) {
    skipped++;
    continue;
  }

  // ── Try Flickr match ───────────────────────────────────────────────────────
  if (flickrById[id]) {
    const f = flickrById[id];
    post.image       = f.image;          // 1k local path
    post.image_thumb = f.image;          // same file, good enough for thumb
    post.image_1k    = f.image;
    post.image_large = f.image_large;    // 3k local path
    post.image_3k    = f.image_large;
    post.link        = post.link || f.link;
    post.network_name = 'Flickr';
    post.type        = 'image';

    // Build mergedMedia from media_list (or fallback to the two known files)
    const mediaList = f.media_list && f.media_list.length
      ? f.media_list
      : [f.image].filter(Boolean);

    post.mergedMedia = buildMergedMediaFromList(mediaList, f.image, f.image_large);
    matched++;
    continue;
  }

  // ── Try Instagram match ────────────────────────────────────────────────────
  if (instaById[id]) {
    const ig = instaById[id];
    const firstImage = (ig.media_list || []).find(isImage) || ig.image;
    post.image        = firstImage;
    post.image_thumb  = firstImage;
    post.image_1k     = firstImage;
    post.link         = post.link || ig.link;
    post.network_name = 'Instagram';
    post.type         = isVideo(ig.media_list?.[0]) ? 'video' : 'image';

    post.mergedMedia  = buildMergedMediaFromList(ig.media_list || [ig.image], firstImage, null);
    matched++;
    continue;
  }

  // No match found
  unmatched++;
  console.warn(`  ⚠ No match for id="${id}" title="${post.title}"`);
}

// ── Save output ───────────────────────────────────────────────────────────────
const outPath = join(root, 'live_state2_backfilled.json');
writeFileSync(outPath, JSON.stringify(liveState, null, 2), 'utf8');

console.log('\n✅ Done!');
console.log(`   Matched & filled : ${matched}`);
console.log(`   Already had data : ${skipped}`);
console.log(`   No match found   : ${unmatched}`);
console.log(`   Output           : live_state2_backfilled.json`);
console.log('\nNext steps:');
console.log('  1. Review live_state2_backfilled.json in the editor');
console.log('  2. If it looks correct, rename it to live_state2.json');
console.log('  3. Then publish to R2 (cloud sync)');
