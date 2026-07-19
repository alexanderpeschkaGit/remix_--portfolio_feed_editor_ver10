// File: ./scripts/migrate-media-state.ts
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';
import { formatValidationReport, normalizedMediaUrl, validateMediaState } from '../src/server/mediaValidation.ts';

export const CID_DAY_ID = '17746219833230.29183560407802445';
const PUBLIC_BASE = 'https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev';

interface DiffEntry {
  op: 'add' | 'remove' | 'replace';
  path: string;
  before?: unknown;
  after?: unknown;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function jsonDiff(before: any, after: any, pointer = ''): DiffEntry[] {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) !== Array.isArray(after)) {
    return [{ op: before === undefined ? 'add' : after === undefined ? 'remove' : 'replace', path: pointer || '/', before, after }];
  }
  const result: DiffEntry[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
    result.push(...jsonDiff(before[key], after[key], `${pointer}/${escaped}`));
  }
  return result;
}

function basename(value: string) {
  return path.posix.basename(normalizedMediaUrl(value));
}

function backupMediaIdentities(project: any) {
  return (project?.mergedMedia || []).map((media: any) => basename(media.image_large || media.image || ''));
}

function localPathForUrl(value: string, rootDir = process.cwd()) {
  const normalized = normalizedMediaUrl(value).replace(/^\/+/, '');
  if (normalized.startsWith('v2/data/')) return path.join(rootDir, 'data_v2', normalized.slice('v2/data/'.length));
  if (normalized.startsWith('data_v2/')) return path.join(rootDir, normalized);
  if (normalized.startsWith('data/')) return path.join(rootDir, normalized);
  return null;
}

async function visualFingerprint(filename: string) {
  const { data } = await sharp(filename).rotate().resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function visualDistance(left: string, right: string) {
  const [a, b] = await Promise.all([visualFingerprint(left), visualFingerprint(right)]);
  let total = 0;
  for (let index = 0; index < a.length; index++) total += Math.abs(a[index] - b[index]);
  return total / a.length;
}

async function assertCanonicalCidMapping(project: any, rootDir = process.cwd()) {
  const originals = [2, 3, 4, 5, 6].map(index => path.join(rootDir, 'data_v2', 'instagram', 'originals', `${CID_DAY_ID}_${String(index).padStart(2, '0')}_original.jpg`));
  const thumbs = (project.mergedMedia || []).slice(1).map((media: any) => localPathForUrl(media.image_thumb, rootDir));
  if (thumbs.some((value: string | null) => !value)) throw new Error('A CID-Day thumbnail is unavailable locally; identity cannot be verified safely.');

  const matrix: number[][] = [];
  for (const thumb of thumbs as string[]) matrix.push(await Promise.all(originals.map(original => visualDistance(thumb, original))));
  matrix.forEach((row, rowIndex) => {
    const ranked = row.map((distance, index) => ({ distance, index })).sort((a, b) => a.distance - b.distance);
    if (ranked[0].index !== rowIndex || ranked[0].distance > 25) {
      throw new Error(`CID-Day media ${rowIndex + 2} has no unambiguous canonical original match (${JSON.stringify(ranked)}).`);
    }
  });
  return matrix;
}

async function decodedDimensions(filename: string) {
  const metadata = await sharp(filename).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Dimensions unavailable for ${filename}`);
  return { width: metadata.width, height: metadata.height };
}

export async function repairCidDay(state: any, backupState: any, rootDir = process.cwd()) {
  const repaired = clone(state);
  const currentProject = (repaired.items || []).find((item: any) => String(item.id) === CID_DAY_ID);
  const backupProject = (backupState.items || []).find((item: any) => String(item.id) === CID_DAY_ID);
  if (!currentProject || !backupProject) throw new Error('CID-Day must exist in both current and backup state.');
  if (!Array.isArray(currentProject.mergedMedia) || currentProject.mergedMedia.length !== 6) throw new Error('CID-Day current media count is not six.');

  const identities = backupMediaIdentities(backupProject);
  const expectedSuffixes = ['51535847862.jpg', '_1.jpg', '_3.jpg', '_4.jpg', '_5.jpg', '_6.jpg'];
  expectedSuffixes.forEach((suffix, index) => {
    if (!identities[index]?.endsWith(suffix)) throw new Error(`Backup media ${index + 1} does not match expected identity ${suffix}.`);
  });

  await assertCanonicalCidMapping(currentProject, rootDir);

  const first = currentProject.mergedMedia[0];
  const firstBestUrl = first.image_3k || first.image_large || first.image_2k || first.image_1k || first.image_thumb;
  const firstBestPath = localPathForUrl(firstBestUrl, rootDir);
  if (!firstBestPath) throw new Error('CID-Day Flickr source is unavailable locally.');
  const firstDimensions = await decodedDimensions(firstBestPath);
  first.image_width = firstDimensions.width;
  first.image_height = firstDimensions.height;
  first.image_original = '';

  for (let index = 1; index < 6; index++) {
    const media = currentProject.mergedMedia[index];
    const mediaNumber = String(index + 1).padStart(2, '0');
    const relativeKey = `v2/data/instagram/originals/${CID_DAY_ID}_${mediaNumber}_original.jpg`;
    const originalUrl = `${PUBLIC_BASE}/${relativeKey}`;
    const originalPath = path.join(rootDir, 'data_v2', 'instagram', 'originals', `${CID_DAY_ID}_${mediaNumber}_original.jpg`);
    const dimensions = await decodedDimensions(originalPath);
    media.image_large = originalUrl;
    media.image_original = originalUrl;
    media.image_1k = '';
    media.image_2k = '';
    media.image_3k = '';
    media.image_width = dimensions.width;
    media.image_height = dimensions.height;
  }

  // Top-level image fields mirror the first carousel item only.
  for (const field of ['image', 'image_thumb', 'image_1k', 'image_2k', 'image_large', 'image_3k', 'image_original', 'image_width', 'image_height']) {
    currentProject[field] = first[field] ?? '';
  }
  return repaired;
}

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const inputPath = arg('--input', 'data/state.json');
  const backupPath = arg('--backup-state', 'backups/data/state_bak_20260427_162355');
  const outputPath = arg('--output-state', 'backups/migrations/cid-day-state.dry-run.json');
  const projectOutputPath = arg('--project-output', 'backups/migrations/cid-day-project.dry-run.json');
  const diffJsonPath = arg('--diff-json', 'backups/migrations/cid-day-diff.json');
  const diffTextPath = arg('--diff-text', 'backups/migrations/cid-day-diff.txt');
  const projectId = arg('--project-id', CID_DAY_ID);
  const apply = process.argv.includes('--apply');
  if (projectId !== CID_DAY_ID) throw new Error('No generic automatic repair is defined yet; audit non-CID projects and repair ambiguous identities manually.');

  const [state, backupState] = await Promise.all([
    fs.readFile(inputPath, 'utf-8').then(JSON.parse),
    fs.readFile(backupPath, 'utf-8').then(JSON.parse),
  ]);
  const repaired = await repairCidDay(state, backupState);
  const projectOnly = { items: repaired.items.filter((item: any) => String(item.id) === projectId) };
  const validation = await validateMediaState(projectOnly, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
  if (!validation.ok) throw new Error(`${formatValidationReport(validation)}\nCandidate output was not written.`);

  const diff = jsonDiff(state, repaired);
  const human = [
    `CID-Day migration ${apply ? 'APPLY' : 'DRY RUN'}`,
    `Input: ${inputPath}`,
    `Backup identity source: ${backupPath}`,
    `Changes: ${diff.length}`,
    ...diff.map(entry => `${entry.op.toUpperCase()} ${entry.path}: ${JSON.stringify(entry.before)} -> ${JSON.stringify(entry.after)}`),
    '',
    formatValidationReport(validation),
  ].join('\n');

  await Promise.all([outputPath, projectOutputPath, diffJsonPath, diffTextPath].map(filename => fs.mkdir(path.dirname(filename), { recursive: true })));
  await Promise.all([
    fs.writeFile(outputPath, JSON.stringify(repaired, null, 2), 'utf-8'),
    fs.writeFile(projectOutputPath, JSON.stringify(projectOnly.items[0], null, 2), 'utf-8'),
    fs.writeFile(diffJsonPath, JSON.stringify({ projectId, dryRun: !apply, diff, validation }, null, 2), 'utf-8'),
    fs.writeFile(diffTextPath, `${human}\n`, 'utf-8'),
  ]);

  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupOutput = path.join('backups', 'data', `state_pre_media_migration_${timestamp}.json`);
    await fs.copyFile(inputPath, backupOutput);
    await fs.writeFile(inputPath, JSON.stringify(repaired, null, 2), 'utf-8');
    console.log(`Applied locally after backup ${backupOutput}. Nothing was published.`);
  } else {
    console.log(human);
    console.log(`Dry-run candidate: ${outputPath}`);
    console.log(`Corrected project preview: ${projectOutputPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
