import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import sharp from 'sharp';
import { IMAGE_FIELDS } from '../src/server/mediaValidation.ts';
import { resolveMediaAssetLocation } from '../src/server/mediaAssets.ts';

const DEFAULT_PUBLIC_BASE = 'https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev';
const CRITICAL_PROJECT_IDS = new Set(['custom-1779283310322', '17746219833230.29183560407802445']);

interface Reference {
  key: string;
  url: string;
  localPath: string;
  projects: Set<string>;
  fields: Set<string>;
  critical: boolean;
}

interface PreflightIssue {
  key: string;
  severity: 'error';
  code: string;
  problem: string;
  evidence?: Record<string, unknown>;
}

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url: string, method: 'HEAD' | 'GET') {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
      if (response.status >= 500 && attempt < 3) {
        await sleep(attempt * 300);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 300);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function concurrentMap<T>(values: T[], concurrency: number, task: (value: T, index: number) => Promise<void>) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      await task(values[index], index);
    }
  });
  await Promise.all(workers);
}

function collectReferences(state: any, rootDir: string, publicBase: string) {
  const references = new Map<string, Reference>();
  const visit = (item: any, media: any) => {
    for (const field of IMAGE_FIELDS) {
      const value = String(media?.[field] || '').trim();
      if (!value) continue;
      const location = resolveMediaAssetLocation(value, rootDir);
      if (!location.canonicalR2Key || !location.localPath) continue;
      const existing = references.get(location.canonicalR2Key);
      const projectId = String(item?.id || '');
      if (existing) {
        existing.projects.add(projectId);
        existing.fields.add(field);
        existing.critical ||= CRITICAL_PROJECT_IDS.has(projectId);
      } else {
        references.set(location.canonicalR2Key, {
          key: location.canonicalR2Key,
          url: `${publicBase}/${location.canonicalR2Key}`,
          localPath: location.localPath,
          projects: new Set([projectId]),
          fields: new Set([field]),
          critical: CRITICAL_PROJECT_IDS.has(projectId),
        });
      }
    }
  };
  for (const item of state.items || []) {
    visit(item, item);
    for (const media of item.mergedMedia || []) visit(item, media);
  }
  return [...references.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function textReport(report: any) {
  const lines = [
    `R2 media preflight: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Candidate: ${report.input}`,
    `Unique R2 keys: ${report.uniqueKeyCount}`,
    `Local decode checks: ${report.localChecked}`,
    `HEAD checks: ${report.headChecked}`,
    `Critical GET/decode/hash checks: ${report.criticalChecked}`,
    `Errors: ${report.errorCount}`,
    `Remote verified: ${report.remoteVerified ? 'yes' : 'no'}`,
    '',
    ...report.issues.map((issue: PreflightIssue) => `[ERROR] ${issue.key} ${issue.code}: ${issue.problem}`),
  ];
  return `${lines.join('\n')}\n`;
}

export async function preflightR2Media(options: {
  inputPath: string;
  rootDir?: string;
  publicBase?: string;
  concurrency?: number;
  remote?: boolean;
}) {
  const rootDir = options.rootDir || process.cwd();
  const publicBase = (options.publicBase || process.env.CLOUDFLARE_PUBLIC_DOMAIN || DEFAULT_PUBLIC_BASE).replace(/\/+$/, '');
  const state = JSON.parse(await fs.readFile(options.inputPath, 'utf-8'));
  const references = collectReferences(state, rootDir, publicBase);
  const issues: PreflightIssue[] = [];
  let headChecked = 0;
  let criticalChecked = 0;
  let localChecked = 0;

  await concurrentMap(references, options.concurrency || 12, async reference => {
    let localStats;
    try {
      localStats = await fs.stat(reference.localPath);
      if (!localStats.isFile()) throw new Error('not a file');
    } catch (error: any) {
      issues.push({ key: reference.key, severity: 'error', code: 'LOCAL_ASSET_MISSING', problem: error.message || String(error), evidence: { localPath: reference.localPath } });
      return;
    }
    try {
      await sharp(reference.localPath, { failOn: 'error' }).metadata();
      localChecked++;
    } catch (error: any) {
      issues.push({ key: reference.key, severity: 'error', code: 'LOCAL_DECODE_FAILED', problem: error.message || String(error), evidence: { localPath: reference.localPath } });
      return;
    }
    if (options.remote === false) return;

    let head: Response;
    try {
      head = await fetchWithRetry(reference.url, 'HEAD');
      headChecked++;
    } catch (error: any) {
      issues.push({ key: reference.key, severity: 'error', code: 'REMOTE_HEAD_FAILED', problem: error.message || String(error), evidence: { url: reference.url } });
      return;
    }
    if (!head.ok) {
      issues.push({ key: reference.key, severity: 'error', code: head.status === 404 ? 'REMOTE_ASSET_MISSING' : 'REMOTE_HEAD_STATUS', problem: `HTTP ${head.status} ${head.statusText}`, evidence: { url: reference.url } });
      return;
    }
    const contentType = String(head.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!contentType.startsWith('image/')) {
      issues.push({ key: reference.key, severity: 'error', code: 'REMOTE_MIME_INVALID', problem: `Expected image MIME, received ${contentType || 'none'}`, evidence: { url: reference.url, contentType } });
    }
    const remoteLength = Number(head.headers.get('content-length') || 0);
    if (remoteLength > 0 && remoteLength !== localStats.size) {
      issues.push({ key: reference.key, severity: 'error', code: 'REMOTE_SIZE_MISMATCH', problem: `Remote ${remoteLength} bytes differs from local ${localStats.size} bytes`, evidence: { url: reference.url, localPath: reference.localPath, remoteLength, localLength: localStats.size } });
    }

    if (!reference.critical) return;
    let response: Response;
    try {
      response = await fetchWithRetry(reference.url, 'GET');
    } catch (error: any) {
      issues.push({ key: reference.key, severity: 'error', code: 'CRITICAL_GET_FAILED', problem: error.message || String(error), evidence: { url: reference.url } });
      return;
    }
    if (!response.ok) {
      issues.push({ key: reference.key, severity: 'error', code: 'CRITICAL_GET_STATUS', problem: `HTTP ${response.status} ${response.statusText}`, evidence: { url: reference.url } });
      return;
    }
    try {
      const [remoteBuffer, localBuffer] = await Promise.all([
        response.arrayBuffer().then(value => Buffer.from(value)),
        fs.readFile(reference.localPath),
      ]);
      const [remoteMetadata, localMetadata] = await Promise.all([
        sharp(remoteBuffer, { failOn: 'error' }).metadata(),
        sharp(localBuffer, { failOn: 'error' }).metadata(),
      ]);
      criticalChecked++;
      const remoteHash = sha256(remoteBuffer);
      const localHash = sha256(localBuffer);
      if (remoteHash !== localHash) {
        issues.push({ key: reference.key, severity: 'error', code: 'CRITICAL_HASH_MISMATCH', problem: 'Remote and local SHA-256 hashes differ', evidence: { remoteHash, localHash, url: reference.url, localPath: reference.localPath } });
      }
      const remoteDimensions = [remoteMetadata.autoOrient?.width || remoteMetadata.width, remoteMetadata.autoOrient?.height || remoteMetadata.height];
      const localDimensions = [localMetadata.autoOrient?.width || localMetadata.width, localMetadata.autoOrient?.height || localMetadata.height];
      if (remoteDimensions[0] !== localDimensions[0] || remoteDimensions[1] !== localDimensions[1]) {
        issues.push({ key: reference.key, severity: 'error', code: 'CRITICAL_DIMENSION_MISMATCH', problem: 'Remote and local decoded dimensions differ', evidence: { remoteDimensions, localDimensions } });
      }
    } catch (error: any) {
      issues.push({ key: reference.key, severity: 'error', code: 'CRITICAL_DECODE_FAILED', problem: error.message || String(error), evidence: { url: reference.url, localPath: reference.localPath } });
    }
  });

  issues.sort((left, right) => left.key.localeCompare(right.key) || left.code.localeCompare(right.code));
  return {
    checkedAt: new Date().toISOString(),
    input: options.inputPath,
    publicBase,
    uniqueKeyCount: references.length,
    localChecked,
    headChecked,
    criticalKeyCount: references.filter(reference => reference.critical).length,
    criticalChecked,
    remoteVerified: options.remote !== false && headChecked === references.length && criticalChecked === references.filter(reference => reference.critical).length,
    errorCount: issues.length,
    ok: issues.length === 0,
    issues,
    uploadPlan: issues.map(issue => ({ key: issue.key, action: 'stage-and-verify', reason: issue.code, evidence: issue.evidence })),
  };
}

async function main() {
  const inputPath = arg('--input', 'backups/migrations/v2-portfolio-candidate.json');
  const reportJsonPath = arg('--report-json', 'backups/migrations/v2-r2-preflight.json');
  const reportTextPath = arg('--report-text', 'backups/migrations/v2-r2-preflight.txt');
  const uploadPlanPath = arg('--upload-plan', 'backups/migrations/v2-r2-upload-plan.json');
  const result = await preflightR2Media({
    inputPath,
    rootDir: process.cwd(),
    publicBase: arg('--public-base'),
    concurrency: Number(arg('--concurrency', '12')),
    remote: !process.argv.includes('--local-only'),
  });
  const text = textReport(result);
  await Promise.all([reportJsonPath, reportTextPath, uploadPlanPath].map(filename => fs.mkdir(path.dirname(filename), { recursive: true })));
  await Promise.all([
    fs.writeFile(reportJsonPath, JSON.stringify(result, null, 2), 'utf-8'),
    fs.writeFile(reportTextPath, text, 'utf-8'),
    fs.writeFile(uploadPlanPath, JSON.stringify(result.uploadPlan, null, 2), 'utf-8'),
  ]);
  console.log(text.trim());
  process.exitCode = result.ok ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
