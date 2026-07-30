import fs from 'fs';
import path from 'path';

const state = JSON.parse(fs.readFileSync('data/state.json', 'utf-8'));

type MediaItem = { type?: string; url?: string; video?: string; video_url?: string; image_thumb?: string; image?: string; image_1k?: string };
type Post = { id: string; title?: string; mergedMedia?: MediaItem[] };

const isVideo = (m: MediaItem) =>
  (m.type || '') === 'video' || /\.(mp4|mov|webm)$/i.test(m.url || m.video || m.video_url || '');

// Find the Tuntenball post
const buggyPost = state.items.find((p: Post) => p.id === 'C89Nq88o8Qi');
if (!buggyPost) { console.log('Post not found'); process.exit(1); }

console.log('Post:', buggyPost.id, buggyPost.title);
console.log('Post-level image_thumb:', (buggyPost as any).image_thumb?.substring(0, 120));

for (let i = 0; i < (buggyPost.mergedMedia || []).length; i++) {
  const m = (buggyPost.mergedMedia || [])[i];
  const vid = isVideo(m);
  const videoUrl = m.url || m.video || m.video_url || '';
  const thumb = m.image_thumb || m.image || m.image_1k || '';
  
  console.log(`\n[${i}] type=${m.type || '?'} isVideo=${vid}`);
  console.log(`    video_url:  ${videoUrl.substring(0, 150)}`);
  console.log(`    image_thumb: ${thumb.substring(0, 150)}`);
  
  // Try to find disk thumbnails for this video
  if (vid && videoUrl) {
    // Extract the path portion
    const urlPath = videoUrl.replace(/^https?:\/\/[^/]+\//, '');
    const stem = urlPath.replace(/\.[^.]+$/, ''); // remove extension
    const dir = path.dirname(stem);
    const baseName = path.basename(stem);
    
    console.log(`    local-dir:  ${dir}`);
    console.log(`    local-stem: ${baseName}`);
    
    // Check disk
    for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
      for (const suffix of ['', '_thumb']) {
        const candidate = path.join(dir, `${baseName}${suffix}.${ext}`);
        if (fs.existsSync(candidate)) {
          console.log(`    DISK FOUND: ${candidate}`);
        }
      }
    }
    
    // Also check data_v2/instagram/ and data_v2/uploads/
    for (const base of ['data_v2/instagram', 'data_v2/uploads', 'data/instagram', 'data/uploads']) {
      for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
        for (const suffix of ['', '_thumb']) {
          const candidate = path.join(base, 'thumbs400', `${baseName}${suffix}.${ext}`);
          if (fs.existsSync(candidate)) {
            console.log(`    DISK FOUND: ${candidate}`);
          }
        }
      }
    }
  }
}
