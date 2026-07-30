// File: ./tests/test_media_normalization.ts
import assert from 'assert';
import {
  normalizePostMedia,
  normalizeState,
  sanitizeImageField,
  resolveVideoThumbnailOnDisk,
  consolidateMergedMedia,
} from '../src/server/mediaNormalization.ts';

console.log('Running media normalization unit tests...');

// Test 1: Sanitize image field
assert.strictEqual(sanitizeImageField('/data/instagram/test.mp4'), '');
assert.strictEqual(sanitizeImageField('/data/instagram/test.jpg'), '/data/instagram/test.jpg');
console.log('✓ Test 1 Passed: sanitizeImageField');

// Test 2: Consolidate single video represented twice in mergedMedia
const dualMediaInput = [
  {
    type: 'image',
    image: '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.jpg',
    image_thumb: '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.jpg',
    image_1k: '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.jpg',
  },
  {
    type: 'video',
    url: '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4',
    video: '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4',
  },
];

const consolidated = consolidateMergedMedia(dualMediaInput);
assert.strictEqual(consolidated.length, 1, 'Should consolidate into 1 video item');
assert.strictEqual(consolidated[0].type, 'video');
assert.strictEqual(consolidated[0].url, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4');
assert.strictEqual(consolidated[0].video_url, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4');
assert.strictEqual(consolidated[0].image_thumb, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.jpg');
console.log('✓ Test 2 Passed: consolidateMergedMedia');

// Test 3: Normalizing post media with mp4 in image field and post-level propagation
const postInput = {
  id: 'test_post_1',
  type: 'image',
  image: '/data/instagram/test.mp4',
  image_thumb: '/data/instagram/test.mp4',
  mergedMedia: [
    {
      type: 'image',
      image: '/data/instagram/test.jpg',
      image_thumb: '/data/instagram/test.jpg',
    },
    {
      type: 'video',
      url: '/data/instagram/test_vid.mp4',
    },
  ],
};

const normalizedPost = normalizePostMedia(postInput, { checkDiskAssets: false });
assert.strictEqual(normalizedPost.type, 'carousel');
assert.strictEqual(normalizedPost.image_thumb, '/data/instagram/test.jpg');
assert.strictEqual(normalizedPost.image, '/data/instagram/test.jpg');
assert.strictEqual(normalizedPost.mergedMedia[1].type, 'video');
assert.strictEqual(normalizedPost.mergedMedia[1].url, '/data/instagram/test_vid.mp4');
assert.strictEqual(normalizedPost.mergedMedia[1].video_url, '/data/instagram/test_vid.mp4');
assert.strictEqual(normalizedPost.mergedMedia[1].video, '/data/instagram/test_vid.mp4');
// Video clip must NOT inherit another clip's thumbnail (primaryResolvedImage bug fix)
// Post-level thumb was sanitized (was .mp4), so clip thumb stays undefined
assert.strictEqual(normalizedPost.mergedMedia[1].image_thumb, undefined, 'Video clip must NOT steal another clips thumbnail');
console.log('✓ Test 3 Passed: normalizePostMedia');

// Test 4: Bunny posts must remain untouched
const bunnyPost = {
  id: 'bunny_post_1',
  type: 'bunny',
  libraryId: '12345',
  videoId: 'abc-def',
  mergedMedia: [
    {
      type: 'bunny',
      libraryId: '12345',
      videoId: 'abc-def',
    },
  ],
};

const normalizedBunny = normalizePostMedia(bunnyPost);
assert.strictEqual(normalizedBunny.type, 'bunny');
assert.strictEqual(normalizedBunny.videoId, 'abc-def');
console.log('✓ Test 4 Passed: Bunny posts untouched');

// Test 5: Multi-pair consolidation (Instagram carousel with N images + N videos)
const multiPairInput = [
  { type: 'image', image: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_1.jpg', image_thumb: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_1.jpg' },
  { type: 'image', image: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_2.jpg', image_thumb: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_2.jpg' },
  { type: 'image', image: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_3.jpg', image_thumb: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_3.jpg' },
  { type: 'video', url: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_1.mp4' },
  { type: 'video', url: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_2.mp4' },
  { type: 'video', url: '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_3.mp4' },
];

const multiConsolidated = consolidateMergedMedia(multiPairInput);
assert.strictEqual(multiConsolidated.length, 3, 'Should consolidate 3 image+video pairs into 3 video items');
assert.strictEqual(multiConsolidated[0].type, 'video');
assert.strictEqual(multiConsolidated[0].url, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_1.mp4');
assert.strictEqual(multiConsolidated[0].image_thumb, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_1.jpg', 'Video 1 should get image 1 thumbnail');
assert.strictEqual(multiConsolidated[1].type, 'video');
assert.strictEqual(multiConsolidated[1].url, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_2.mp4');
assert.strictEqual(multiConsolidated[1].image_thumb, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_2.jpg', 'Video 2 should get image 2 thumbnail');
assert.strictEqual(multiConsolidated[2].type, 'video');
assert.strictEqual(multiConsolidated[2].url, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_3.mp4');
assert.strictEqual(multiConsolidated[2].image_thumb, '/data/instagram/vijay_sikanda/2024-07-03_10-02-15_UTC_3.jpg', 'Video 3 should get image 3 thumbnail');
// Verify each video has a DIFFERENT thumbnail (the core bug fix)
const thumbs = multiConsolidated.map((m: any) => m.image_thumb);
assert.strictEqual(new Set(thumbs).size, 3, 'All 3 videos must have UNIQUE thumbnails');
console.log('✓ Test 5 Passed: Multi-pair consolidation (unique thumbs per clip)');

console.log('\nAll 5 unit tests passed successfully!');
