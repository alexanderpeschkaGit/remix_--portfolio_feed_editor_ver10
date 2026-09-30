// File: ./tests/mediaOrientation.test.ts
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import sharp from 'sharp';
import { orientMediaSource } from '../src/server/mediaOrientation.ts';

/**
 * These tests target the GENERATOR side of the EXIF contract.
 *
 * `src/server/mediaValidation.ts` (the consumer) already auto-orients and is
 * pinned by `mediaValidation.test.ts:84`. The regression this suite guards
 * against happened because the producer did NOT orient: variants came out
 * transposed relative to the original, so a publish was rejected with
 * VARIANT_ASPECT_RATIO_MISMATCH + ASPECT_RATIO_MISMATCH.
 */

const RAW_W = 1200;
const RAW_H = 800;

/** A landscape JPEG carrying the given EXIF orientation tag. */
const orientedJpeg = (orientation: number) =>
  sharp({ create: { width: RAW_W, height: RAW_H, channels: 3, background: '#776633' } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();

/** A landscape JPEG with no EXIF tag at all. */
const plainJpeg = () =>
  sharp({ create: { width: RAW_W, height: RAW_H, channels: 3, background: '#776633' } })
    .jpeg()
    .toBuffer();

/** The validator's notion of display dimensions. */
const autoOrientedSize = async (buffer: Buffer) => {
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  return {
    width: metadata.autoOrient?.width || metadata.width || 0,
    height: metadata.autoOrient?.height || metadata.height || 0,
  };
};

test('orientation 6 JPEG reports display-oriented (transposed) dimensions', async () => {
  const oriented = await orientMediaSource(await orientedJpeg(6));

  assert.equal(oriented.sourceOrientation, 6);
  assert.equal(oriented.rotated, true);
  // 1200x800 rotated 90deg displays as 800x1200 (portrait).
  assert.equal(oriented.width, RAW_H);
  assert.equal(oriented.height, RAW_W);
});

test('orientation 8 JPEG reports the opposite transposition', async () => {
  const oriented = await orientMediaSource(await orientedJpeg(8));

  assert.equal(oriented.sourceOrientation, 8);
  assert.equal(oriented.rotated, true);
  assert.equal(oriented.width, RAW_H);
  assert.equal(oriented.height, RAW_W);
});

test('orientation 1 and untagged sources are passed through untouched', async () => {
  const source = await plainJpeg();
  const oriented = await orientMediaSource(source);

  assert.equal(oriented.sourceOrientation, 1);
  assert.equal(oriented.rotated, false);
  assert.equal(oriented.width, RAW_W);
  assert.equal(oriented.height, RAW_H);
  // Untouched means the SAME buffer, so an upright upload is never re-compressed.
  assert.equal(oriented.buffer, source);
});

test('the rotated buffer no longer carries an EXIF orientation tag', async () => {
  const oriented = await orientMediaSource(await orientedJpeg(6));
  const metadata = await sharp(oriented.buffer, { failOn: 'none' }).metadata();

  // autoOrient consumed the tag; re-reading must not rotate a second time.
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.width, RAW_H);
  assert.equal(metadata.height, RAW_W);
});

test('generator dimensions agree with the validator for an EXIF-rotated source', async () => {
  const oriented = await orientMediaSource(await orientedJpeg(6));

  // The validator auto-orients the ORIGINAL (which keeps its EXIF tag).
  const validatorView = await autoOrientedSize(await orientedJpeg(6));
  assert.equal(oriented.width, validatorView.width);
  assert.equal(oriented.height, validatorView.height);

  // And it agrees with a variant resized from the oriented buffer, which is the
  // exact condition the old code violated (400x300 vs 300x400 -> ratioDelta 0.77).
  const thumb = await sharp(oriented.buffer, { failOn: 'none' })
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg()
    .toBuffer();
  const thumbMeta = await sharp(thumb, { failOn: 'error' }).metadata();

  const variantRatio = (thumbMeta.width || 0) / (thumbMeta.height || 0);
  const sourceRatio = validatorView.width / validatorView.height;
  const ratioDelta = Math.abs(sourceRatio - variantRatio) / sourceRatio;

  assert.ok(ratioDelta <= 0.03, `variant aspect ratio drifted by ${ratioDelta}`);
  assert.equal(thumbMeta.height > thumbMeta.width, true, 'thumb must stay portrait');
});

test('mirrored orientations (2, 4) keep the original pixel dimensions', async () => {
  // 2 = flip horizontal, 4 = flip vertical. Neither transposes the grid.
  for (const orientation of [2, 4]) {
    const oriented = await orientMediaSource(await orientedJpeg(orientation));
    assert.equal(oriented.sourceOrientation, orientation, `orientation ${orientation}`);
    assert.equal(oriented.rotated, true, `orientation ${orientation} should be normalized`);
    assert.equal(oriented.width, RAW_W, `orientation ${orientation} width`);
    assert.equal(oriented.height, RAW_H, `orientation ${orientation} height`);
  }
});

test('transposing orientations (5, 6, 7, 8) all report portrait dimensions', async () => {
  // 5/6/7/8 each rotate by 90 degrees (optionally with a mirror), so a
  // landscape 1200x800 source always becomes a portrait 800x1200.
  for (const orientation of [5, 6, 7, 8]) {
    const oriented = await orientMediaSource(await orientedJpeg(orientation));
    assert.equal(oriented.rotated, true, `orientation ${orientation} should be normalized`);
    assert.equal(oriented.width, RAW_H, `orientation ${orientation} width`);
    assert.equal(oriented.height, RAW_W, `orientation ${orientation} height`);
  }
});

test('accepts a sharp instance and a file path as well as a Buffer', async () => {
  const fromSharp = await orientMediaSource(sharp(await orientedJpeg(6), { failOn: 'none' }));
  assert.equal(fromSharp.width, RAW_H);
  assert.equal(fromSharp.height, RAW_W);

  const tmp = path.join(os.tmpdir(), `media-orientation-${Date.now()}.jpg`);
  await fs.writeFile(tmp, await orientedJpeg(8));
  try {
    const fromPath = await orientMediaSource(tmp);
    assert.equal(fromPath.width, RAW_H);
    assert.equal(fromPath.height, RAW_W);
    assert.equal(fromPath.sourceOrientation, 8);
  } finally {
    await fs.rm(tmp, { force: true });
  }
});

test('PNG source with an EXIF tag is oriented as well', async () => {
  const png = await sharp({ create: { width: RAW_W, height: RAW_H, channels: 4, background: '#ffffff' } })
    .withMetadata({ orientation: 6 })
    .png()
    .toBuffer();

  const oriented = await orientMediaSource(png);
  assert.equal(oriented.rotated, true);
  assert.equal(oriented.width, RAW_H);
  assert.equal(oriented.height, RAW_W);
});
