import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import sharp from 'sharp';
import {
  discoverMediaAssetFamily,
  extractMediaAssetFamily,
  firstExistingLocalMediaPath,
  resolveMediaAssetLocation,
} from '../src/server/mediaAssets.ts';
import { repairPortfolioState } from '../scripts/migrate-portfolio-media.ts';

async function createFamily(root: string, base = 'fixture') {
  const dimensions = {
    thumbs400: [400, 267],
    '1k': [1024, 683],
    '2k': [2048, 1365],
    '3k': [3072, 2048],
    originals: [4240, 2832],
  } as const;
  for (const [dir, [width, height]] of Object.entries(dimensions)) {
    await fs.mkdir(path.join(root, 'data_v2', 'uploads', dir), { recursive: true });
    const suffix = dir === 'thumbs400' ? 'thumb' : dir === 'originals' ? 'original' : dir;
    const buffer = await sharp({ create: { width, height, channels: 3, background: '#527596' } }).jpeg().toBuffer();
    await fs.writeFile(path.join(root, 'data_v2', 'uploads', dir, `${base}_${suffix}.jpg`), buffer);
  }
}

test('shared resolver normalizes every supported v2 namespace and absolute local paths', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-assets-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createFamily(root);
  const relative = 'uploads/1k/fixture_1k.jpg';
  const values = [
    `/data_v2/${relative}`,
    `/v2/data/${relative}`,
    `data_v2/${relative}`,
    `v2/data/${relative}`,
    `https://assets.example/v2/data/${relative}`,
  ];
  for (const value of values) {
    const location = resolveMediaAssetLocation(value, root);
    assert.equal(location.canonicalR2Key, `v2/data/${relative}`);
    assert.equal(await firstExistingLocalMediaPath(value, root), path.join(root, 'data_v2', ...relative.split('/')));
  }
  const absolute = path.join(root, 'data_v2', 'uploads', 'originals', 'fixture_original.jpg');
  assert.equal(await firstExistingLocalMediaPath(absolute, root), absolute);
});

test('asset-family discovery and migration restore real siblings without fabricating missing sizes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-family-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createFamily(root, 'restored');
  await fs.rm(path.join(root, 'data_v2', 'uploads', '3k', 'restored_3k.jpg'));

  const reference = 'https://assets.example/v2/data/uploads/1k/restored_1k.jpg';
  const family = extractMediaAssetFamily(reference);
  assert(family);
  const siblings = await discoverMediaAssetFamily(family, root);
  assert(siblings.image_original);
  assert.equal(siblings.image_3k, undefined);

  const state = { items: [{
    id: 'family',
    title: 'Family',
    image: '/data_v2/uploads/thumbs400/restored_thumb.jpg',
    image_thumb: '/data_v2/uploads/thumbs400/restored_thumb.jpg',
    image_1k: reference,
    image_2k: '/data_v2/uploads/thumbs400/restored_thumb.jpg',
    image_3k: '/data_v2/uploads/thumbs400/restored_thumb.jpg',
    image_original: reference,
    image_width: 400,
    image_height: 267,
  }] };
  const first = await repairPortfolioState(state, { rootDir: root, allowNetwork: false, recoverProjectIds: [] });
  const media = first.state.items[0];
  assert.match(media.image_original, /\/originals\/restored_original\.jpg$/);
  assert.match(media.image_2k, /\/2k\/restored_2k\.jpg$/);
  assert.equal(media.image_3k, '');
  assert.deepEqual([media.image_width, media.image_height], [4240, 2832]);
  assert.equal(first.validationAfter.errorCount, 0);
  const second = await repairPortfolioState(first.state, { rootDir: root, allowNetwork: false, recoverProjectIds: [] });
  assert.equal(second.changes.length, 0);
});
