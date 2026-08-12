// File: ./tests/mediaNormalization.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizePostMedia,
  normalizeState,
  sanitizeImageField,
  resolveVideoThumbnailOnDisk,
  consolidateMergedMedia,
} from '../src/server/mediaNormalization.ts';

test('sanitizeImageField strips video URLs from image fields', () => {
  assert.equal(sanitizeImageField('/data/instagram/test.mp4'), '');
  assert.equal(sanitizeImageField('/data/instagram/test.jpg'), '/data/instagram/test.jpg');
});

test('consolidateMergedMedia merges a single video represented twice', () => {
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
  assert.equal(consolidated.length, 1, 'Should consolidate into 1 video item');
  assert.equal(consolidated[0].type, 'video');
  assert.equal(consolidated[0].url, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4');
  assert.equal(consolidated[0].video_url, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.mp4');
  assert.equal(consolidated[0].image_thumb, '/data/instagram/vijay_sikanda/2025-02-13_18-58-14_UTC.jpg');
});

test('normalizePostMedia strips mp4 from image fields and propagates thumbnails', () => {
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
  assert.equal(normalizedPost.type, 'carousel');
  assert.equal(normalizedPost.image_thumb, '/data/instagram/test.jpg');
  assert.equal(normalizedPost.image, '/data/instagram/test.jpg');
  assert.equal(normalizedPost.mergedMedia[1].type, 'video');
  assert.equal(normalizedPost.mergedMedia[1].url, '/data/instagram/test_vid.mp4');
  assert.equal(normalizedPost.mergedMedia[1].video_url, '/data/instagram/test_vid.mp4');
  assert.equal(normalizedPost.mergedMedia[1].video, '/data/instagram/test_vid.mp4');
  assert.equal(normalizedPost.mergedMedia[1].image_thumb, '/data/instagram/test.jpg', 'Video clip should inherit primary post thumbnail');
});

test('Bunny posts remain untouched', () => {
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
  assert.equal(normalizedBunny.type, 'bunny');
  assert.equal(normalizedBunny.videoId, 'abc-def');
});

test('resolveVideoThumbnailOnDisk finds a tier-2 thumbs400 thumbnail', () => {
  // Use an isolated temp rootDir so the real data_v2 tree is never touched.
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-normalization-'));
  const testVideoPath = '/data_v2/uploads/originals/test_normal_video.mp4';
  const testThumbDir = path.join(rootDir, 'data_v2', 'uploads', 'thumbs400');
  const testThumbPath = path.join(testThumbDir, 'test_normal_video_thumb.jpg');

  fs.mkdirSync(testThumbDir, { recursive: true });
  fs.writeFileSync(testThumbPath, 'dummy data');

  try {
    const resolved = resolveVideoThumbnailOnDisk(testVideoPath, rootDir);
    assert.equal(resolved, '/data_v2/uploads/thumbs400/test_normal_video_thumb.jpg');
  } finally {
    try {
      fs.rmSync(rootDir, { recursive: true, force: true });
    } catch {}
  }
});

test('normalizeState processes an entire state object and reports stats', () => {
  const state = {
    items: [
      {
        id: 'state_post_1',
        type: 'image',
        image: '/data/instagram/state_test.mp4',
        image_thumb: '/data/instagram/state_test.mp4',
        mergedMedia: [
          { type: 'image', image: '/data/instagram/state_test.jpg', image_thumb: '/data/instagram/state_test.jpg' },
          { type: 'video', url: '/data/instagram/state_test.mp4' },
        ],
      },
      {
        id: 'state_post_2',
        type: 'image',
        image: '/data/instagram/plain.jpg',
        image_thumb: '/data/instagram/plain.jpg',
      },
    ],
  };

  const { state: normalized, stats } = normalizeState(state, { checkDiskAssets: false });
  assert.equal(normalized.items.length, 2);
  assert.equal(stats.totalPosts, 2);
  assert.equal(normalized.items[0].type, 'video', 'Single video state post should consolidate to video');
  assert.equal(normalized.items[0].mergedMedia.length, 1);
  assert.equal(normalized.items[0].mergedMedia[0].url, '/data/instagram/state_test.mp4');
  assert.equal(normalized.items[0].mergedMedia[0].image_thumb, '/data/instagram/state_test.jpg');
  assert.ok(stats.consolidatedSingleVideos >= 1);
  assert.ok(stats.strippedVideoFromImageFields >= 1);
  assert.equal(normalized.items[1].type, 'image');
});
