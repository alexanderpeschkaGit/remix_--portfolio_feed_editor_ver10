import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import test from 'node:test';
import {
  groupCandidatesBySize,
  hashLocalFile,
  hashBuffer,
  findRedundantEntries,
  pickKeeper,
  buildRedundancyReport,
  loadHashCache,
  saveHashCache,
  type CandidateItem,
  type HashedEntry,
  type PickKeeperContext
} from '../src/server/redundancyScan.ts';
import {
  buildBakArchiveRelPath,
  resolveBakArchiveTarget,
  r2KeyToLocalPath,
  moveFileToBak,
  extractFallbackOriginalKey
} from '../src/server/mediaDeletion.ts';

test('groupCandidatesBySize filters out unique-sized files and groups size collisions', () => {
  const candidates: CandidateItem[] = [
    { scope: 'r2', location: 'data/file1.jpg', size: 100 },
    { scope: 'r2', location: 'data/unique.jpg', size: 250 },
    { scope: 'local', location: '/data/file2.jpg', size: 100 },
    { scope: 'local', location: '/data/zero.jpg', size: 0 },
    { scope: 'r2', location: 'uploads/a.png', size: 500 },
    { scope: 'r2', location: 'uploads/b.png', size: 500 },
    { scope: 'r2', location: 'uploads/c.png', size: 500 },
  ];

  const grouped = groupCandidatesBySize(candidates);

  assert.equal(grouped.has(250), false, 'unique size 250 must be skipped');
  assert.equal(grouped.has(0), false, 'zero size must be skipped');
  assert.equal(grouped.has(100), true, 'size 100 must be grouped');
  assert.equal(grouped.get(100)?.length, 2);
  assert.equal(grouped.has(500), true, 'size 500 must be grouped');
  assert.equal(grouped.get(500)?.length, 3);
});

test('hashLocalFile and hashBuffer produce correct SHA-1 hashes', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hash-test-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const content = 'Hello World Content Hashing Test';
  const filePath = path.join(tmpDir, 'test.txt');
  await fs.writeFile(filePath, content, 'utf-8');

  const buf = Buffer.from(content, 'utf-8');
  const bufHash = hashBuffer(buf);
  const fileHash = await hashLocalFile(filePath);

  assert.ok(bufHash);
  assert.equal(fileHash, bufHash, 'Buffer hash and streamed file hash must match');
});

test('findRedundantEntries does NOT flag files of the same size with different contents', () => {
  const ctx: PickKeeperContext = {
    isReferencedR2Key: () => false,
  };

  const entries: HashedEntry[] = [
    { scope: 'r2', location: 'data/imageA.jpg', size: 5000, hash: 'hashAAAA' },
    { scope: 'r2', location: 'data/imageB.jpg', size: 5000, hash: 'hashBBBB' },
  ];

  const duplicates = findRedundantEntries(entries, ctx);
  assert.equal(duplicates.length, 0, 'Different hashes of the same size must not be considered duplicates');
});

test('findRedundantEntries identifies identical content and protects referenced file as keeper', () => {
  const referenced = new Set(['data/referenced_keeper.jpg']);
  const ctx: PickKeeperContext = {
    isReferencedR2Key: (key: string) => referenced.has(key),
  };

  const entries: HashedEntry[] = [
    { scope: 'r2', location: 'uploads/dup1.jpg', size: 8000, hash: 'same_hash_123' },
    { scope: 'r2', location: 'data/referenced_keeper.jpg', size: 8000, hash: 'same_hash_123' },
    { scope: 'r2', location: 'v2/data/dup2.jpg', size: 8000, hash: 'same_hash_123' },
  ];

  const keeper = pickKeeper(entries, ctx);
  assert.equal(keeper.location, 'data/referenced_keeper.jpg', 'Referenced item must always be selected as keeper');

  const duplicates = findRedundantEntries(entries, ctx);
  assert.equal(duplicates.length, 2, '2 out of 3 identical items must be reported as duplicates');
  assert.ok(duplicates.every((d) => d.keeperLocation === 'data/referenced_keeper.jpg'));
});

test('buildRedundancyReport computes totals and sample keys properly', () => {
  const ctx: PickKeeperContext = {
    isReferencedR2Key: () => false,
  };

  const entries: HashedEntry[] = [
    { scope: 'r2', location: 'data/k.jpg', size: 2048, hash: 'hash_x' },
    { scope: 'r2', location: 'uploads/d.jpg', size: 2048, hash: 'hash_x' },
  ];

  const report = buildRedundancyReport(entries, ctx, 10);
  assert.equal(report.scannedCount, 10);
  assert.equal(report.duplicateCount, 1);
  assert.equal(report.totalBytes, 2048);
  assert.equal(report.duplicates[0].location, 'uploads/d.jpg');
});

test('loadHashCache and saveHashCache persist and retrieve media hashes correctly', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const cachePath = path.join(tmpDir, '.cache', 'media_hashes.json');
  const initial = await loadHashCache(cachePath);
  assert.deepEqual(initial, { r2: {}, local: {} });

  await saveHashCache(cachePath, {
    r2: { 'data/foo.jpg': { etag: 'etag1', size: 100, hash: 'h1' } },
    local: { '/abs/path/bar.jpg': { mtimeMs: 1234567, size: 200, hash: 'h2' } },
  });

  const loaded = await loadHashCache(cachePath);
  assert.equal(loaded.r2['data/foo.jpg']?.hash, 'h1');
  assert.equal(loaded.local['/abs/path/bar.jpg']?.hash, 'h2');
});

test('r2KeyToLocalPath maps all supported prefixes correctly to local disk paths', () => {
  const root = path.resolve('C:/mock_repo');

  assert.equal(r2KeyToLocalPath('v2/data/uploads/1k/test.jpg', root), path.join(root, 'data_v2', 'uploads/1k/test.jpg'));
  assert.equal(r2KeyToLocalPath('data/uploads/test.jpg', root), path.join(root, 'data', 'uploads/test.jpg'));
  assert.equal(r2KeyToLocalPath('uploads/test.jpg', root), path.join(root, 'data', 'uploads', 'test.jpg'));
  assert.equal(r2KeyToLocalPath('highres/test.jpg', root), path.join(root, 'data', 'highres', 'test.jpg'));
  assert.equal(r2KeyToLocalPath('originals/test.jpg', root), path.join(root, 'originals', 'test.jpg'));
  assert.equal(r2KeyToLocalPath('other/unmanaged.jpg', root), null);
});

test('buildBakArchiveRelPath and resolveBakArchiveTarget safely handle fallbacks and path traversal', async () => {
  const root = path.resolve('C:/mock_repo');

  // Normal archive path
  const rel1 = buildBakArchiveRelPath('trash/2026-10-06T15-00-00/hash-photo.jpg', 'data/uploads/photo.jpg');
  assert.equal(rel1, 'bak/r2-trash/2026-10-06T15-00-00/data/uploads/photo.jpg');

  // Fallback archive path when originalKey is missing
  const fallbackKey = extractFallbackOriginalKey('trash/2026-10-06T15-00-00/0123456789ab-legacy.jpg');
  assert.equal(fallbackKey, 'unlabeled/legacy.jpg');

  const rel2 = buildBakArchiveRelPath('trash/2026-10-06T15-00-00/0123456789ab-legacy.jpg');
  assert.equal(rel2, 'bak/r2-trash/2026-10-06T15-00-00/unlabeled/legacy.jpg');

  // Security: path traversal attempt should be rejected by resolveBakArchiveTarget
  const escaped = await resolveBakArchiveTarget('trash/2026-10-06/foo.jpg', '../../outside.txt', root);
  // Any path escaping bak root must return null or stay within bak
  if (escaped) {
    const bakRoot = path.join(root, 'bak');
    assert.ok(escaped.startsWith(bakRoot));
  }
});

test('moveFileToBak with subFolder moves local file into bak/subfolder', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bak-test-'));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const dataDir = path.join(tmpDir, 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const srcFile = path.join(dataDir, 'sample.jpg');
  await fs.writeFile(srcFile, 'sample content', 'utf-8');

  const result = await moveFileToBak(srcFile, tmpDir, 'redundant');
  assert.ok(result);
  assert.equal(result.from, srcFile);
  assert.ok(result.to.includes(path.join('bak', 'redundant')));

  const existsSource = await fs.access(srcFile).then(() => true).catch(() => false);
  const existsDest = await fs.access(result.to).then(() => true).catch(() => false);
  assert.equal(existsSource, false, 'Source must no longer exist');
  assert.equal(existsDest, true, 'Destination in bak/redundant must exist');
});

test('findRedundantEntries never groups an R2 object with its local synced copy', () => {
  const entries: HashedEntry[] = [
    { scope: 'r2', location: 'data/x.jpg', size: 10, hash: 'same' },
    { scope: 'local', location: path.join(process.cwd(), 'data', 'x.jpg'), size: 10, hash: 'same' },
  ];
  const ctx: PickKeeperContext = { isReferencedR2Key: () => true };
  assert.equal(findRedundantEntries(entries, ctx).length, 0);
});

test('findRedundantEntries flags every referenced duplicate so execute can skip it', () => {
  const entries: HashedEntry[] = [
    { scope: 'r2', location: 'data/a.jpg', size: 10, hash: 'same' },
    { scope: 'r2', location: 'data/b.jpg', size: 10, hash: 'same' },
  ];
  const ctx: PickKeeperContext = { isReferencedR2Key: () => true };
  const dups = findRedundantEntries(entries, ctx);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].isReferenced, true);
});
