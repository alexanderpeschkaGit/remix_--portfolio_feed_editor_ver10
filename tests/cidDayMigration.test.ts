// File: ./tests/cidDayMigration.test.ts
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import sharp from 'sharp';
import { CID_DAY_ID, jsonDiff, repairCidDay } from '../scripts/migrate-media-state.ts';
import { validateMediaState } from '../src/server/mediaValidation.ts';

const fixture = JSON.parse(await fs.readFile('tests/fixtures/cid-day-migration.json', 'utf-8'));

async function materializeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cid-day-migration-'));
  const flickrDirs = ['thumbs400', '1k', '2k', '3k'];
  const instagramDirs = ['thumbs400', 'originals'];
  await Promise.all([
    ...flickrDirs.map(dir => fs.mkdir(path.join(root, 'data_v2', 'flickr', dir), { recursive: true })),
    ...instagramDirs.map(dir => fs.mkdir(path.join(root, 'data_v2', 'instagram', dir), { recursive: true })),
  ]);

  for (const [dir, width] of [['thumbs400', 400], ['1k', 1024], ['2k', 2048], ['3k', 3072]] as const) {
    const buffer = await sharp({ create: { width, height: Math.round(width * 9 / 16), channels: 3, background: '#684722' } }).jpeg().toBuffer();
    await fs.writeFile(path.join(root, 'data_v2', 'flickr', dir, `${CID_DAY_ID}_01_${dir === 'thumbs400' ? 'thumb' : dir}.jpg`), buffer);
  }

  const project = fixture.currentProject;
  for (let index = 2; index <= 6; index++) {
    const mediaNumber = String(index).padStart(2, '0');
    const color = { r: index * 31, g: 180 - index * 13, b: 30 + index * 25 };
    const original = await sharp({ create: { width: 608, height: 608, channels: 3, background: color } })
      .composite([{ input: await sharp({ create: { width: 80 + index * 9, height: 140, channels: 3, background: '#ffffff' } }).png().toBuffer(), left: index * 35, top: index * 27 }])
      .jpeg().toBuffer();
    const thumb = await sharp(original).resize(400, 400).jpeg().toBuffer();
    await fs.writeFile(path.join(root, 'data_v2', 'instagram', 'originals', `${CID_DAY_ID}_${mediaNumber}_original.jpg`), original);
    await fs.writeFile(path.join(root, 'data_v2', 'instagram', 'thumbs400', `${CID_DAY_ID}_${mediaNumber}_thumb.jpg`), thumb);

    if (index > 2) {
      project.mergedMedia[index - 1] = {
        type: 'image',
        image: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_thumb: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_large: `https://example.invalid/v2/data/instagram/1k/shifted_${index - 2}.jpg`,
        image_1k: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_2k: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_3k: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_original: `https://example.invalid/v2/data/instagram/thumbs400/${CID_DAY_ID}_${mediaNumber}_thumb.jpg`,
        image_width: 1024,
        image_height: 576,
      };
    }
  }
  project.image = project.mergedMedia[0].image;
  project.image_thumb = project.mergedMedia[0].image_thumb;
  project.image_1k = project.mergedMedia[0].image_1k;
  project.image_2k = project.mergedMedia[0].image_2k;
  project.image_3k = project.mergedMedia[0].image_3k;
  project.image_large = project.mergedMedia[0].image_large;
  project.image_original = project.mergedMedia[0].image_original;
  project.image_width = 1024;
  project.image_height = 576;
  return root;
}

test('CID-Day repair uses backup identity, preserves metadata, and is idempotent', async t => {
  const root = await materializeFixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = { items: [fixture.currentProject] };
  const backup = { items: [fixture.backupProject] };
  const before = JSON.parse(JSON.stringify(fixture.currentProject));
  const repairedState = await repairCidDay(state, backup, root);
  const repaired = repairedState.items[0];

  assert.equal(repaired.mergedMedia.length, 6);
  assert.deepEqual(repaired.states, before.states);
  assert.equal(repaired.hidden, before.hidden);
  assert.equal(repaired.category, before.category);
  assert.equal(repaired.text, before.text);
  assert.equal(repaired.mergedMedia[1].image_large.endsWith('_02_original.jpg'), true);
  assert.deepEqual(repaired.mergedMedia.slice(1).map((media: any) => [media.image_width, media.image_height]), Array(5).fill([608, 608]));
  assert(repaired.mergedMedia.slice(1).every((media: any) => !media.image_1k && !media.image_2k && !media.image_3k));

  const secondPass = await repairCidDay(repairedState, backup, root);
  assert.deepEqual(jsonDiff(repairedState, secondPass), []);

  const report = await validateMediaState({ items: [repaired] }, { rootDir: root, allowNetwork: false, reportMissingOptionalVariants: true });
  assert.equal(report.errorCount, 0, report.issues.map(issue => `${issue.code}: ${issue.error}`).join('\n'));
});
