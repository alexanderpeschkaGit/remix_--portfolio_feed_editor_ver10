// File: ./tests/portfolioMigration.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { repairPortfolioState } from '../scripts/migrate-portfolio-media.ts';
import type { ImageAssetResolver } from '../src/server/mediaValidation.ts';

const thumb = await sharp({ create: { width: 400, height: 225, channels: 3, background: '#345678' } }).jpeg().toBuffer();
const large = await sharp({ create: { width: 3072, height: 1728, channels: 3, background: '#345678' } }).jpeg().toBuffer();
const different = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#aa2200' } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 1200, height: 675, channels: 3, background: '#345678' } }).png().toBuffer();

const resolver: ImageAssetResolver = async url => {
  if (url.includes('thumb')) return { buffer: thumb, contentType: 'image/jpeg' };
  if (url.includes('same-3k')) return { buffer: large, contentType: 'image/jpeg' };
  if (url.includes('different-original')) return { buffer: different, contentType: 'image/jpeg' };
  if (url.includes('png-under-jpg')) return { buffer: png, contentType: 'image/png' };
  throw new Error(`Unexpected asset ${url}`);
};

test('portfolio migration clears lower-resolution aliases but preserves a legitimate exact-3K original alias', async () => {
  const media = {
    type: 'image',
    image: 'https://fixture.test/thumb.jpg',
    image_thumb: 'https://fixture.test/thumb.jpg',
    image_large: 'https://fixture.test/thumb.jpg',
    image_1k: 'https://fixture.test/same-3k-a.jpg',
    image_2k: 'https://fixture.test/same-3k-b.jpg',
    image_3k: 'https://fixture.test/same-3k.jpg',
    image_original: 'https://fixture.test/same-3k.jpg',
    image_width: 1024,
    image_height: 576,
  };
  const state = { items: [{ id: 'aliases', title: 'Aliases', hidden: true, category: 'Keep', image_3k: 'wrong', mergedMedia: [media] }] };
  const first = await repairPortfolioState(state, { resolver });
  const repaired = first.state.items[0];
  assert.equal(repaired.mergedMedia[0].image_1k, '');
  assert.equal(repaired.mergedMedia[0].image_2k, '');
  assert.equal(repaired.mergedMedia[0].image_3k, 'https://fixture.test/same-3k.jpg');
  assert.equal(repaired.mergedMedia[0].image_original, 'https://fixture.test/same-3k.jpg');
  assert.equal(repaired.mergedMedia[0].image_width, 3072);
  assert.equal(repaired.mergedMedia[0].image_height, 1728);
  assert.equal(repaired.image_3k, repaired.mergedMedia[0].image_3k);
  assert.equal(repaired.hidden, true);
  assert.equal(repaired.category, 'Keep');
  assert.equal(first.validationAfter.errorCount, 0);
  assert(!first.validationAfter.issues.some(issue => issue.code === 'LEGITIMATE_ORIGINAL_3K_ALIAS'));

  const second = await repairPortfolioState(first.state, { resolver });
  assert.equal(second.changes.length, 0);
});

test('portfolio migration leaves visually ambiguous associations for manual review', async () => {
  const state = { items: [{
    id: 'ambiguous',
    image_thumb: 'https://fixture.test/thumb.jpg',
    image_original: 'https://fixture.test/originals/different-original.jpg',
    image_width: 400,
    image_height: 225,
  }] };
  const result = await repairPortfolioState(state, { resolver });
  assert.equal(result.state.items[0].image_width, 400);
  assert(result.manualReview.some(entry => entry.code === 'VISUAL_IDENTITY_CONFLICT'));
});

test('portfolio migration clears a redundant format mismatch but preserves the valid display image', async () => {
  const state = { items: [{
    id: 'format',
    image_thumb: 'https://fixture.test/thumb.jpg',
    image_original: 'https://fixture.test/originals/png-under-jpg.jpg',
    image_width: 400,
    image_height: 225,
  }] };
  const result = await repairPortfolioState(state, { resolver });
  assert.equal(result.state.items[0].image_original, '');
  assert.equal(result.state.items[0].image_thumb, 'https://fixture.test/thumb.jpg');
  assert(result.changes.some(change => change.reason.includes('Decoded png does not match .jpg')));
});
