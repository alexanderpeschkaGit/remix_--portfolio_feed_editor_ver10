/**
 * backfill_live_state_pass2.js
 *
 * Second pass: title-based fuzzy matching for the 13 posts
 * that had no direct ID match in pass 1.
 *
 * Reads:  live_state2_backfilled.json  (output from pass 1)
 * Reads:  data/flickr/flickr_data.json
 * Reads:  data/instagram/insta_data.json
 * Output: live_state2_final.json
 *
 * Usage:  node backfill_live_state_pass2.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

// ── Load sources ──────────────────────────────────────────────────────────────
const liveState  = JSON.parse(readFileSync(join(root, 'live_state2_backfilled.json'), 'utf8'));
const flickrData = JSON.parse(readFileSync(join(root, 'data/flickr/flickr_data.json'), 'utf8'));
const instaData  = JSON.parse(readFileSync(join(root, 'data/instagram/insta_data.json'), 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')      // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longest-common-subsequence word overlap score (0–1) */
function titleScore(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const wb = normalize(b).split(' ').filter(w => w.length > 2);
  if (!wa.size || !wb.length) return 0;
  const hits = wb.filter(w => wa.has(w)).length;
  return hits / Math.max(wa.size, wb.length);
}

function isVideo(url) { return url && /\.(mp4|webm|mov)$/i.test(url); }
function isImage(url) { return url && /\.(jpe?g|png|webp|gif|avif)$/i.test(url); }

function buildMergedMediaFromList(mediaList, primaryImage, imageLarge) {
  const images = (mediaList || []).filter(isImage);
  const videos = (mediaList || []).filter(isVideo);
  const all = [...images, ...videos];
  return all.map((url, idx) => {
    if (isVideo(url)) return { type: 'video', url, video: url };
    const entry = { type: 'image', image: url, image_thumb: url, image_1k: url };
    if (idx === 0 && imageLarge) { entry.image_large = imageLarge; entry.image_3k = imageLarge; }
    return entry;
  });
}

function applyFlickr(post, f) {
  post.image        = f.image;
  post.image_thumb  = f.image;
  post.image_1k     = f.image;
  post.image_large  = f.image_large;
  post.image_3k     = f.image_large;
  post.link         = post.link || f.link;
  post.network_name = post.network_name || 'Flickr';
  post.type         = 'image';
  const list = f.media_list?.length ? f.media_list : [f.image].filter(Boolean);
  post.mergedMedia  = buildMergedMediaFromList(list, f.image, f.image_large);
}

function applyInsta(post, ig) {
  const firstImage = (ig.media_list || []).find(isImage) || ig.image;
  post.image        = firstImage;
  post.image_thumb  = firstImage;
  post.image_1k     = firstImage;
  post.link         = post.link || ig.link;
  post.network_name = post.network_name || 'Instagram';
  post.type         = isVideo(ig.media_list?.[0]) ? 'video' : 'image';
  post.mergedMedia  = buildMergedMediaFromList(ig.media_list || [ig.image], firstImage, null);
}

// ── Build best-match finders ───────────────────────────────────────────────────
function bestFlickr(title) {
  let best = null, bestS = 0;
  for (const f of flickrData) {
    const s = titleScore(title, f.title);
    if (s > bestS) { bestS = s; best = f; }
  }
  return bestS >= 0.4 ? { match: best, score: bestS } : null;
}

function bestInsta(title) {
  let best = null, bestS = 0;
  for (const ig of instaData) {
    const s = titleScore(title, ig.title);
    if (s > bestS) { bestS = s; best = ig; }
  }
  return bestS >= 0.4 ? { match: best, score: bestS } : null;
}

// ── Process items ─────────────────────────────────────────────────────────────
const items = liveState.items || liveState.posts || [];
let filled = 0, stillMissing = 0;

for (const post of items) {
  const hasImage = post.image || (Array.isArray(post.mergedMedia) && post.mergedMedia.length > 0);
  if (hasImage) continue;

  const title = post.title || '';
  console.log(`\n🔍 Trying title match: "${title}"`);

  // Try Flickr first (higher res)
  const flickrResult = bestFlickr(title);
  const instaResult  = bestInsta(title);

  // Pick the better match
  const useFlickr = flickrResult && (!instaResult || flickrResult.score >= instaResult.score);
  const useInsta  = !useFlickr && instaResult;

  if (useFlickr) {
    console.log(`   ✅ Flickr match (score ${flickrResult.score.toFixed(2)}): "${flickrResult.match.title}" [${flickrResult.match.id}]`);
    applyFlickr(post, flickrResult.match);
    filled++;
  } else if (useInsta) {
    console.log(`   ✅ Insta match  (score ${instaResult.score.toFixed(2)}): "${instaResult.match.title}" [${instaResult.match.id}]`);
    applyInsta(post, instaResult.match);
    filled++;
  } else {
    console.log(`   ❌ No good match found — leaving empty`);
    stillMissing++;
  }
}

// ── Save output ───────────────────────────────────────────────────────────────
const outPath = join(root, 'live_state2_final.json');
writeFileSync(outPath, JSON.stringify(liveState, null, 2), 'utf8');

console.log('\n✅ Pass 2 complete!');
console.log(`   Newly filled  : ${filled}`);
console.log(`   Still missing : ${stillMissing}`);
console.log(`   Output        : live_state2_final.json`);
console.log('\nNext steps:');
console.log('  1. Check live_state2_final.json looks correct');
console.log('  2. Copy it over live_state2.json');
console.log('  3. Restart dev server and open Rearrange to verify thumbnails');
console.log('  4. Publish to R2 (cloud sync)');
