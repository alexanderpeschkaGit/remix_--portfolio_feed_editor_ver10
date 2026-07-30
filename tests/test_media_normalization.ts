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
assert.strictEqual(normalizedPost.mergedMedia[1].image_thumb, '/data/instagram/test.jpg', 'Video clip should inherit primary post thumbnail');
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

console.log('\nAll 4 unit tests passed successfully!');
