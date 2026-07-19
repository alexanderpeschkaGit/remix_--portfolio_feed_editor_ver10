// File: ./tests/mediaValidation.test.ts
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { validateMediaState, type ImageAssetResolver } from '../src/server/mediaValidation.ts';

const fixture = JSON.parse(await fs.readFile('tests/fixtures/media-corruption-cases.json', 'utf-8'));

const buffers = {
  landscape: await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7b4b2a' } }).jpeg().toBuffer(),
  square: await sharp({ create: { width: 608, height: 608, channels: 3, background: '#245d78' } }).jpeg().toBuffer(),
  alias: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#884477' } }).jpeg().toBuffer(),
  partialThumb: await sharp({ create: { width: 400, height: 267, channels: 3, background: '#447744' } }).jpeg().toBuffer(),
  partial1k: await sharp({ create: { width: 1024, height: 683, channels: 3, background: '#447744' } }).jpeg().toBuffer(),
  partialOriginal: await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#447744' } }).jpeg().toBuffer(),
  legacy: await sharp({ create: { width: 800, height: 600, channels: 3, background: '#555555' } }).jpeg().toBuffer(),
  source1920: await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#334466' } }).jpeg().toBuffer(),
  source2048: await sharp({ create: { width: 2048, height: 1152, channels: 3, background: '#446633' } }).jpeg().toBuffer(),
  exifRotated: await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#776633' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer(),
};

const resolver: ImageAssetResolver = async url => {
  if (url.endsWith('/landscape.jpg')) return { buffer: buffers.landscape, contentType: 'image/jpeg' };
  if (url.endsWith('/square.jpg')) return { buffer: buffers.square, contentType: 'image/jpeg' };
  if (url.includes('/alias-')) return { buffer: buffers.alias, contentType: 'image/jpeg' };
  if (url.endsWith('/partial-thumb.jpg')) return { buffer: buffers.partialThumb, contentType: 'image/jpeg' };
  if (url.endsWith('/partial-1k.jpg')) return { buffer: buffers.partial1k, contentType: 'image/jpeg' };
  if (url.endsWith('/partial-original.jpg')) return { buffer: buffers.partialOriginal, contentType: 'image/jpeg' };
  if (url.endsWith('/legacy.jpg')) return { buffer: buffers.legacy, contentType: 'image/jpeg' };
  if (url.endsWith('/source-1920.jpg')) return { buffer: buffers.source1920, contentType: 'image/jpeg' };
  if (url.endsWith('/source-2048.jpg')) return { buffer: buffers.source2048, contentType: 'image/jpeg' };
  throw new Error(`Unexpected URL ${url}`);
};

test('detects landscape-first dimension inheritance and invalid extensions', async () => {
  const report = await validateMediaState({ items: fixture.items.slice(0, 2) }, { resolver });
  assert(report.issues.some(issue => issue.projectId === 'mixed-carousel' && issue.mediaIndex === 2 && issue.code === 'ASPECT_RATIO_MISMATCH'));
  assert(report.issues.some(issue => issue.projectId === 'invalid-extension' && issue.code === 'NON_IMAGE_EXTENSION'));
});

test('detects thumbnail aliases by URL and content while allowing partial variants', async () => {
  const report = await validateMediaState({ items: fixture.items.slice(2, 4) }, { resolver });
  assert(report.issues.some(issue => issue.projectId === 'thumbnail-alias' && issue.field === 'image_1k' && issue.code === 'THUMBNAIL_ALIAS'));
  assert(report.issues.some(issue => issue.projectId === 'thumbnail-alias' && issue.field === 'image_2k' && issue.code === 'THUMBNAIL_ALIAS'));
  assert(!report.issues.some(issue => issue.projectId === 'partial-variants' && issue.severity === 'error'));
  assert(!report.issues.some(issue => issue.projectId === 'partial-variants' && issue.code === 'OPTIONAL_VARIANT_MISSING'));
});

test('legacy records without v2 fields remain structurally valid', async () => {
  const report = await validateMediaState({ items: [fixture.items[4]] }, { resolver });
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 0);
});

test('rejects a non-image MIME even when bytes happen to decode', async () => {
  const state = { items: [{ id: 'wrong-mime', image_thumb: 'https://fixture.test/wrong-mime.jpg', image_width: 400, image_height: 400 }] };
  const report = await validateMediaState(state, { resolver: async () => ({ buffer: buffers.alias, contentType: 'text/plain' }) });
  assert(report.issues.some(issue => issue.code === 'NON_IMAGE_MIME'));
});

test('sub-1K originals do not produce impossible higher-resolution warnings', async () => {
  const state = { items: [{ id: 'missing-original', image_thumb: 'https://fixture.test/legacy.jpg', image_width: 800, image_height: 600 }] };
  const report = await validateMediaState(state, { resolver });
  assert.equal(report.errorCount, 0);
  assert.deepEqual(report.issues.filter(issue => issue.code === 'OPTIONAL_VARIANT_MISSING').map(issue => issue.field), []);
});

test('missing variant warnings stop at the verified source resolution', async () => {
  const state = { items: [
    { id: 'instagram-608', image_original: 'https://fixture.test/square.jpg', image_width: 608, image_height: 608 },
    { id: 'source-1920', image_original: 'https://fixture.test/source-1920.jpg', image_width: 1920, image_height: 1080 },
    { id: 'source-2048', image_original: 'https://fixture.test/source-2048.jpg', image_width: 2048, image_height: 1152 },
  ] };
  const report = await validateMediaState(state, { resolver });
  const missingFor = (projectId: string) => report.issues
    .filter(issue => issue.projectId === projectId && issue.code === 'OPTIONAL_VARIANT_MISSING')
    .map(issue => issue.field);
  assert.deepEqual(missingFor('instagram-608'), []);
  assert.deepEqual(missingFor('source-1920'), ['image_1k']);
  assert.deepEqual(missingFor('source-2048'), ['image_1k', 'image_2k']);
});

test('uses display-oriented EXIF dimensions', async () => {
  const state = { items: [{ id: 'exif', image_original: 'https://fixture.test/exif.jpg', image_width: 800, image_height: 1200 }] };
  const report = await validateMediaState(state, { resolver: async () => ({ buffer: buffers.exifRotated, contentType: 'image/jpeg' }) });
  assert.equal(report.errorCount, 0, report.issues.map(issue => issue.error).join('\n'));
});

test('rejects undecodable image payloads and empty image records', async () => {
  const state = { items: [
    { id: 'bad-bytes', image_thumb: 'https://fixture.test/bad.jpg', image_width: 10, image_height: 10 },
    { id: 'empty-image', type: 'image' },
  ] };
  const report = await validateMediaState(state, { resolver: async () => ({ buffer: Buffer.from('not an image'), contentType: 'image/jpeg' }) });
  assert(report.issues.some(issue => issue.projectId === 'bad-bytes' && issue.code === 'IMAGE_DECODE_FAILED'));
  assert(report.issues.some(issue => issue.projectId === 'empty-image' && issue.code === 'IMAGE_REFERENCE_MISSING'));
});
