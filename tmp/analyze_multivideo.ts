import fs from 'fs';

const state = JSON.parse(fs.readFileSync('data/state.json', 'utf-8'));

type MediaItem = { type?: string; url?: string; video?: string; video_url?: string; image_thumb?: string; image?: string; image_1k?: string };
type Post = { id: string; title?: string; mergedMedia?: MediaItem[] };

const isVideo = (m: MediaItem) =>
  (m.type || '') === 'video' || /\.(mp4|mov|webm)$/i.test(m.url || m.video || m.video_url || '');

// Find posts with 2+ videos
const multiVideoPosts = state.items.filter((p: Post) =>
  (p.mergedMedia || []).filter(isVideo).length >= 2
);

console.log('Multi-video posts in state.json:', multiVideoPosts.length);

// Show first 5
for (const p of multiVideoPosts.slice(0, 5)) {
  console.log(`\nPost: ${p.id} | ${(p.title || '').substring(0, 80)}`);
  const thumbs = new Set<string>();
  (p.mergedMedia || []).forEach((m, i) => {
    const vid = isVideo(m);
    const thumb = m.image_thumb || m.image || m.image_1k || '';
    thumbs.add(thumb);
    const stem = (m.url || m.video || m.video_url || '').replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    console.log(`  [${i}] type=${m.type || '?'} videoStem=${stem} thumb=${thumb.substring(0, 70)}`);
  });
  if (thumbs.size === 1 && thumbs.has('')) {
    console.log('  >> All clips LACK thumbnails');
  } else if (thumbs.size === 1) {
    console.log('  >> BUG: All clips share the SAME thumbnail!');
  } else {
    console.log('  >> OK: Clips have unique thumbnails');
  }
  
  // Check if thumb files exist on disk
  console.log('  Disk check:');
  (p.mergedMedia || []).forEach((m) => {
    const videoUrl = m.url || m.video || m.video_url || '';
    if (!videoUrl) return;
    const dir = videoUrl.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const stem = videoUrl.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '') || '';
    for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
      const candidate = `${dir}/${stem}.${ext}`;
      if (fs.existsSync(candidate)) {
        console.log(`    FOUND: ${candidate}`);
        break;
      }
    }
  });
}

// Also check: how many video items total?
let totalVideos = 0;
let videosWithThumb = 0;
for (const p of state.items) {
  for (const m of (p.mergedMedia || [])) {
    if (isVideo(m)) {
      totalVideos++;
      if (m.image_thumb || m.image || m.image_1k) videosWithThumb++;
    }
  }
}
console.log(`\nTotal video clips: ${totalVideos}, with thumbnail: ${videosWithThumb}, missing: ${totalVideos - videosWithThumb}`);
