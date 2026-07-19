import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { assertStateAcceptable } from '../src/server/statePublishing.ts';

const DEFAULT_PUBLIC_BASE = 'https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev';

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const config = {
  accountId: process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY || process.env.CLOUDFLARE_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_BUCKET || process.env.CLOUDFLARE_BUCKET_NAME || '',
  publicBase: (process.env.CLOUDFLARE_PUBLIC_DOMAIN || DEFAULT_PUBLIC_BASE).replace(/\/+$/, ''),
};

if (!process.argv.includes('--confirm-publish')) throw new Error('Refusing to publish without --confirm-publish.');
for (const [name, value] of Object.entries(config)) {
  if (!value) throw new Error(`Missing R2 configuration ${name}.`);
}

const candidatePath = arg('--candidate', 'backups/migrations/v2-portfolio-candidate.json');
const uploadPlanPath = arg('--upload-plan', 'backups/migrations/v2-r2-upload-plan.json');
const statePath = arg('--state-path', 'data/state.json');
const publishTimestamp = new Date().toISOString();
const filesystemTimestamp = publishTimestamp.replace(/[:.]/g, '-');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  forcePathStyle: false,
});

async function getObject(key: string) {
  const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  return {
    body: Buffer.from(await result.Body!.transformToByteArray()),
    contentType: result.ContentType || (key.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'),
  };
}

async function putAndVerify(key: string, body: Buffer, contentType: string) {
  await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
  const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  if (head.ContentLength !== body.length) throw new Error(`HEAD size mismatch for ${key}: ${head.ContentLength} != ${body.length}`);
}

async function copyAndVerify(sourceKey: string, liveKey: string, expected: Buffer) {
  const copySource = `${config.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`;
  await client.send(new CopyObjectCommand({ Bucket: config.bucket, Key: liveKey, CopySource: copySource }));
  const live = await getObject(liveKey);
  if (sha256(live.body) !== sha256(expected)) throw new Error(`Promoted ${liveKey} differs from staged revision.`);
}

async function fetchPublicBuffer(key: string) {
  const response = await fetch(`${config.publicBase}/${key}?revision=${encodeURIComponent(filesystemTimestamp)}`, {
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Public ${key} returned HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function waitForPublicHash(key: string, expectedHash: string) {
  let lastHash = '';
  for (let attempt = 1; attempt <= 12; attempt++) {
    const buffer = await fetchPublicBuffer(key);
    lastHash = sha256(buffer);
    if (lastHash === expectedHash) return buffer;
    await sleep(attempt * 500);
  }
  throw new Error(`Public ${key} did not reach expected hash ${expectedHash}; last hash ${lastHash}.`);
}

const report: Record<string, unknown> = {
  startedAt: publishTimestamp,
  candidatePath,
  statePath,
  published: false,
  rolledBack: false,
};

let previousState: Awaited<ReturnType<typeof getObject>> | null = null;
let previousIndex: Awaited<ReturnType<typeof getObject>> | null = null;
let localStateBefore: Buffer | null = null;
let localApplied = false;
let livePromotionStarted = false;
let backupDir = '';

try {
  const uploadPlan = JSON.parse(await fs.readFile(uploadPlanPath, 'utf-8'));
  if (!Array.isArray(uploadPlan) || uploadPlan.length !== 0) throw new Error(`Upload plan is not empty (${Array.isArray(uploadPlan) ? uploadPlan.length : 'invalid'} entries).`);

  const candidateBuffer = await fs.readFile(candidatePath);
  const candidate = JSON.parse(candidateBuffer.toString('utf-8'));
  candidate.lastUpdated = publishTimestamp;
  const publishedStateBuffer = Buffer.from(JSON.stringify(candidate, null, 2));
  const validation = await assertStateAcceptable(candidate, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
  if (validation.report.errorCount || validation.report.warningCount) throw new Error(`Candidate validation is not clean: ${validation.report.errorCount} errors, ${validation.report.warningCount} warnings.`);

  [previousState, previousIndex, localStateBefore] = await Promise.all([
    getObject('state.json'),
    getObject('index.html'),
    fs.readFile(statePath),
  ]);

  const revisionHash = createHash('sha256').update(publishedStateBuffer).update(previousIndex.body).digest('hex').slice(0, 12);
  const revision = `${filesystemTimestamp}-${revisionHash}`;
  const revisionPrefix = `revisions/${revision}`;
  backupDir = path.join('backups', 'publish', revision);
  await fs.mkdir(backupDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(backupDir, 'local-state-before.json'), localStateBefore),
    fs.writeFile(path.join(backupDir, 'live-state-before.json'), previousState.body),
    fs.writeFile(path.join(backupDir, 'live-index-before.html'), previousIndex.body),
    fs.writeFile(path.join(backupDir, 'published-state.json'), publishedStateBuffer),
  ]);

  await fs.writeFile(statePath, publishedStateBuffer);
  localApplied = true;
  const persisted = JSON.parse(await fs.readFile(statePath, 'utf-8'));
  const persistedValidation = await assertStateAcceptable(persisted, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
  if (persistedValidation.report.errorCount || persistedValidation.report.warningCount) throw new Error('Persisted local state failed validation.');

  const manifest = Buffer.from(JSON.stringify({
    revision,
    publishedAt: publishTimestamp,
    candidateSha256: sha256(candidateBuffer),
    publishedStateSha256: sha256(publishedStateBuffer),
    indexSha256: sha256(previousIndex.body),
    previousStateSha256: sha256(previousState.body),
    previousIndexSha256: sha256(previousIndex.body),
  }, null, 2));

  await putAndVerify(`${revisionPrefix}/state.json`, publishedStateBuffer, 'application/json; charset=utf-8');
  await putAndVerify(`${revisionPrefix}/index.html`, previousIndex.body, previousIndex.contentType);
  await putAndVerify(`${revisionPrefix}/previous/state.json`, previousState.body, previousState.contentType);
  await putAndVerify(`${revisionPrefix}/previous/index.html`, previousIndex.body, previousIndex.contentType);
  await putAndVerify(`${revisionPrefix}/manifest.json`, manifest, 'application/json; charset=utf-8');

  livePromotionStarted = true;
  await copyAndVerify(`${revisionPrefix}/state.json`, 'state.json', publishedStateBuffer);
  await copyAndVerify(`${revisionPrefix}/index.html`, 'index.html', previousIndex.body);

  const [publicStateBuffer, publicIndexBuffer] = await Promise.all([
    waitForPublicHash('state.json', sha256(publishedStateBuffer)),
    waitForPublicHash('index.html', sha256(previousIndex.body)),
  ]);
  const publicState = JSON.parse(publicStateBuffer.toString('utf-8'));
  const liveValidation = await assertStateAcceptable(publicState, { rootDir: process.cwd(), allowNetwork: false, reportMissingOptionalVariants: true });
  if (liveValidation.report.errorCount || liveValidation.report.warningCount) throw new Error('Downloaded public state failed validation.');

  Object.assign(report, {
    completedAt: new Date().toISOString(),
    published: true,
    revision,
    revisionPrefix,
    backupDir,
    candidateSha256: sha256(candidateBuffer),
    publishedStateSha256: sha256(publishedStateBuffer),
    publicStateSha256: sha256(publicStateBuffer),
    indexSha256: sha256(publicIndexBuffer),
    previousStateSha256: sha256(previousState.body),
    projectCount: publicState.items?.length || 0,
    validation: { errors: liveValidation.report.errorCount, warnings: liveValidation.report.warningCount },
    uploadPlanEntries: 0,
  });
  await fs.writeFile(path.join(backupDir, 'publish-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  console.log(JSON.stringify(report, null, 2));
} catch (error: any) {
  const rollbackErrors: string[] = [];
  if (livePromotionStarted && previousState && previousIndex) {
    try {
      await putAndVerify('state.json', previousState.body, previousState.contentType);
      await putAndVerify('index.html', previousIndex.body, previousIndex.contentType);
      report.rolledBack = true;
    } catch (rollbackError: any) {
      rollbackErrors.push(`remote: ${rollbackError.message || rollbackError}`);
    }
  }
  if (localApplied && localStateBefore) {
    try {
      await fs.writeFile(statePath, localStateBefore);
    } catch (rollbackError: any) {
      rollbackErrors.push(`local: ${rollbackError.message || rollbackError}`);
    }
  }
  Object.assign(report, {
    completedAt: new Date().toISOString(),
    error: error.message || String(error),
    rollbackErrors,
  });
  if (backupDir) await fs.writeFile(path.join(backupDir, 'publish-report.json'), JSON.stringify(report, null, 2), 'utf-8').catch(() => {});
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
