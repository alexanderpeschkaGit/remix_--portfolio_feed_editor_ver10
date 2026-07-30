import fs from 'fs';

const state = JSON.parse(fs.readFileSync('data/state.json', 'utf-8'));

type Post = { id: string; title?: string; mergedMedia?: any[] };

const buggyPost = state.items.find((p: Post) => p.id === 'C89Nq88o8Qi');
if (!buggyPost) { console.log('Post not found'); process.exit(1); }

// Show all keys of first video item
const firstVid = (buggyPost.mergedMedia || [])[0];
console.log('=== ALL FIELDS of mergedMedia[0] ===');
console.log(JSON.stringify(firstVid, null, 2).substring(0, 3000));

// Also show image_thumb400 field
console.log('\n=== image_thumb400 for each item ===');
(buggyPost.mergedMedia || []).forEach((m: any, i: number) => {
  console.log(`[${i}] image_thumb400: ${(m.image_thumb400 || 'NONE').substring(0, 120)}`);
  console.log(`[${i}] image:          ${(m.image || 'NONE').substring(0, 120)}`);
  console.log(`[${i}] video:          ${(m.video || 'NONE').substring(0, 120)}`);
  console.log(`[${i}] image_large:    ${(m.image_large || 'NONE').substring(0, 120)}`);
  console.log('');
});
