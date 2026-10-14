## Execution Metadata

- **Recommended Execution Model:** FLASH (3.8 Flash Low / `#oneshot` + `#flash` Single-Action-Protocol)
- **Complexity Assessment:** Deterministischer One-Shot-Split von `server.ts` (3.280 Zeilen / 67 Express-Routes) in 18 fokussierte Module unter `src/server/` (jedes < 450 Zeilen) und einen ~110-Zeilen-Orchestrator `server.ts`. Alle Funktions- und Route-Körper werden verlustfrei und UTF-8-sicher per `scripts/splice-block.cjs` verschoben; kein internes Umschreiben von Business-Logik erforderlich.

---

# Deep-Refactor Blueprint: `server.ts` (< 500 Zeilen, One-Shot für 3.8 Flash Low)

> **Ausführungs-Regeln für Antigravity (3.8 Flash Low):**
> 1. **Modus:** Mode B (`#oneshot` Blueprint Mode) kombiniert mit `#flash` (Single-Action-Protocol).
> 2. **Keine Befehls-Verkettung:** Führe niemals Shell-Befehle mit `&&` oder `;` verkettet aus. Immer **genau ein** Befehl pro Schritt, Exit-Code abwarten, dann nächster Schritt.
> 3. **Reihenfolge strikt einhalten:** Die `splice-block.cjs`-Befehle in Phase 2 arbeiten **Top-Down** mit exakten Text-Ankern (`--from` / `--to`), wobei der `--to`-Anker jeweils für den nächsten Schritt in `server.ts` stehen bleibt.
> 4. **Keine Platzhalter:** Beim Schreiben von `scripts/splice-block.cjs`, `src/server/serverContext.ts` und dem finalen `server.ts` den Code exakt und vollständig übernehmen.

---

## 1. Architektur & Ziel-Modul-Übersicht

| Datei | Rolle & Inhalt | Ziel-Zeilen |
|---|---|---|
| `server.ts` | Express- & Vite-Orchestrator, Static-Mounts, Route-Registrierung, Error-Handler | ~110 |
| `src/server/serverContext.ts` | Geteilte Pfad-Konstanten (`DATA_DIR`, `DATA_V2_DIR`, …), `R2_CONFIG`, `BUNNY_CONFIG`, `s3Client`, `upload` (Multer), `usageStats`, `uploadToR2`, `ensureServerDirectories` | ~175 |
| `src/server/stateManager.ts` | `probeVideoDimensions`, `fetchBunnyVideoMetadata`, `ensureStateVideoDimensions`, Bunny-Schema-Normalisierung, `localTimestamp`, `backupState`, `cleanupLooseBakFiles`, `extractPortfolioDataFromHtml`, `persistAcceptedState` | ~235 |
| `src/server/variantMaterializer.ts` | `toPosix`, `joinUrlPath`, `normalizeExt`, `normalizeUploadedImage`, `getGroupBaseDir`, `getVariantLocalPath/Url/R2Key`, `materializeVariantSet`, `publishHtmlAndState`, `uploadVariantSetToR2` | ~235 |
| `src/server/scrapeService.ts` | `getDeletedIds`, `saveDeletedIds`, `mergeScrapedData`, `hammingDistance` | ~185 |
| `src/server/r2StorageService.ts` | `MEDIA_REFERENCE_FIELDS`, `visitMediaReferences`, `collectReferencedR2Keys*`, Sync-Manifest (`loadSyncManifest`, `saveSyncManifest`, `updateSyncManifestEntries`), `buildR2CleanupReport`, `buildLegacyUploadDuplicateReport`, `collectRedundancyData`, `filterRedundantWithSiblings` | ~390 |
| `src/server/r2TrashService.ts` | `TrashItem`, `moveR2ObjectsToTrash`, `listTrashObjects`, `restoreTrashObjects`, `deleteTrashObjects`, `archiveTrashObjectsToBak`, `getRecursiveFiles` | ~250 |
| `src/server/syncRoutes.ts` | `registerSyncRoutes(app)`: `/api/sync/highres`, `/api/sync/status`, `/api/reset-all`, `/api/sync/uncertain`, `/api/sync/confirm`, `/api/sync/reject`, `/api/sync/r2-full`, `/api/sync/r2-full/status` | ~385 |
| `src/server/mediaVariantsService.ts` | Audit-, Source-Resolution- & Variant-Generierungs-Logik (`auditMediaVariantsInState`, `generateVariantsForEntry`, `publishStateJsonToR2`, `verifyPublishedMediaVariants`, …) | ~440 |
| `src/server/mediaVariantsRoutes.ts` | `registerMediaVariantsRoutes(app)`: `/api/media-variants/*` + `/api/media-validation/audit` *(ohne das abgeschattete Duplikat von `GET /api/media-variants/status`)* | ~355 |
| `src/server/stateRoutes.ts` | `registerStateRoutes(app)`: `GET/POST /api/state`, `/api/r2-state`, `/api/media/exists`, `/api/preview`, `/api/item/update` | ~215 |
| `src/server/kiEditRoutes.ts` | `registerKiEditRoutes(app)`: `POST /api/ki-edit` (Gemini Case-Study-Generator) | ~225 |
| `src/server/mediaDeleteRoutes.ts` | `deleteR2ObjectHard`, `replaceMediaThumbnail`, `deleteMediaResources` + `registerMediaDeleteRoutes(app)`: `/api/state/delete`, `/api/state/delete-media`, `/api/state/bulk-delete`, `/api/bak/purge`, `/api/bak/restore` | ~380 |
| `src/server/maintenanceRoutes.ts` | `registerMaintenanceRoutes(app)`: `/api/backups/*`, `/api/r2-cleanup/*`, `/api/r2-redundancy/*`, `/api/r2-trash/*` | ~335 |
| `src/server/scrapeRoutes.ts` | `registerScrapeRoutes(app)`: `/api/scrape/start`, `/api/scrape/status/:source`, `/api/scrape/merge`, `/api/scraped-data`, `/api/scrape`, `/api/flickr` | ~395 |
| `src/server/uploadRoutes.ts` | `registerUploadRoutes(app)`: `/api/config`, `/api/publish`, `/api/upload-image`, `/api/upload-video`, `/api/upload-custom-thumb` | ~315 |
| `src/server/bunnyUploadRoutes.ts` | `bunnyTasks`, Task-Recovery-File-Queue, `sanitizeProjectName`, `getProjectSubPath/Url` + `registerBunnyUploadRoutes(app)`: `POST /api/upload-video-to-bunny` | ~320 |
| `src/server/bunnyRoutes.ts` | `registerBunnyRoutes(app)`: `/api/bunny/task/:taskId/status`, `/api/bunny/update-video-metadata`, `/api/rename-project-folder`, `/api/bunny/check`, `/api/state/force-publish`, `/api/upload-bunny`, `/api/bunny/sync-video`, `/api/bunny/video-url` | ~250 |
| `src/server/videoResolveRoutes.ts` | `registerVideoResolveRoutes(app)`: Instagram-Video-Source-Resolver + `/api/video/resolve-source`, `/api/cloudflare/usage`, `/api/ping` | ~195 |

---

## Phase 0: Preflight

Führe nacheinander (einzeln) aus:

```powershell
git status --short
```

```powershell
npm run lint
```

---

## Phase 1: `scripts/splice-block.cjs` erweitern & `src/server/serverContext.ts` anlegen

### Schritt 1.1 — `scripts/splice-block.cjs` komplett ersetzen
Erweitert `applyExports` um `async function` und `let` sowie das CLI um `--footer`, damit Route-Blöcke direkt in `export function registerXxxRoutes(app: Express) { ... }` eingeschlossen werden können.

Ersetze den gesamten Inhalt von `scripts/splice-block.cjs` durch:

```javascript
#!/usr/bin/env node
/**
 * splice-block.cjs — verbatim code-block splicing for deep-refactor.
 */
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('splice-block: ERROR: ' + msg);
  process.exit(1);
}

function arg(args, name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeUtf8(p, text) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, text, { encoding: 'utf8' });
}

function applyExports(block, names) {
  if (!names || names.length === 0) return block;
  const list = names.split(',').map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return block;
  const re = new RegExp('^(\\s*)(async\\s+function|const|let|type|function)\\s+(' + list.join('|') + ')\\b', 'gm');
  return block.replace(re, (m, indent, kw, name) => indent + 'export ' + kw + ' ' + name);
}

function indexOfAnchor(raw, anchor, fromIndex = 0) {
  let i = raw.indexOf(anchor, fromIndex);
  if (i === -1 && anchor.includes('\n')) {
    i = raw.indexOf(anchor.replace(/\n/g, '\r\n'), fromIndex);
  }
  return i;
}

function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  if (op !== 'move' && op !== 'remove') {
    fail('first argument must be "move" or "remove"');
  }
  const src = arg(args, '--src');
  const from = arg(args, '--from');
  const to = arg(args, '--to');
  if (!src || from === undefined || to === undefined) fail('--src, --from and --to are required');
  const out = arg(args, '--out');
  const header = arg(args, '--header');
  const footer = arg(args, '--footer');
  const exportsArg = arg(args, '--exports');
  const replacement = arg(args, '--replacement') !== undefined ? arg(args, '--replacement') : '';
  const append = args.includes('--append');

  const raw = readUtf8(src);
  const startIdx = indexOfAnchor(raw, from);
  if (startIdx === -1) fail('--from anchor not found in ' + src);
  if (indexOfAnchor(raw, from, startIdx + 1) !== -1) fail('--from anchor is not unique in ' + src);
  const endIdx = indexOfAnchor(raw, to, startIdx);
  if (endIdx === -1) fail('--to anchor not found after --from in ' + src);
  if (indexOfAnchor(raw, to, endIdx + 1) !== -1) {
    console.warn('splice-block: warning: --to anchor occurs more than once; using first occurrence after --from');
  }
  const block = raw.substring(startIdx, endIdx);

  if (raw.indexOf(block) === -1) fail('internal error: block not re-found in source');

  const newRaw = raw.substring(0, startIdx) + replacement + raw.substring(endIdx);
  writeUtf8(src, newRaw);

  if (out) {
    const exportedBlock = applyExports(block, exportsArg);
    const content = (header || '') + exportedBlock + (footer || '');
    if (append && fs.existsSync(out)) {
      writeUtf8(out, readUtf8(out) + content);
    } else {
      writeUtf8(out, content);
    }
  }

  const lines = block.split('\n').length - 1;
  console.log(`splice-block: ${op} done: removed ${lines} lines from ${src}` + (out ? ` -> ${out}${append ? ' (appended)' : ''}` : ''));
}

main();
```

### Schritt 1.2 — `src/server/serverContext.ts` neu erstellen
Erstelle die Datei `src/server/serverContext.ts` mit exakt folgendem Inhalt:

```typescript
import "dotenv/config";
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { BAK_DIR_NAME } from "./mediaDeletion.ts";

export const execAsync = promisify(exec);

export const pickBestImage = (...candidates: any[]) =>
  candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());

export const upload = multer({ storage: multer.memoryStorage() });

export const DATA_DIR = path.join(process.cwd(), 'data');
export const DATA_V2_DIR = path.join(process.cwd(), 'data_v2');
export const BACKUPS_DIR = path.join(process.cwd(), 'backups');
export const DATA_BACKUPS_DIR = path.join(BACKUPS_DIR, 'data');
export const ORIGINALS_DIR = path.join(process.cwd(), 'originals');
export const BAK_DIR = path.join(process.cwd(), BAK_DIR_NAME);
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const UPLOADS_ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
export const UPLOADS_2K_DIR = path.join(UPLOADS_DIR, '2k');
export const UPLOADS_3K_DIR = path.join(UPLOADS_DIR, '3k');
export const UPLOADS_THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
export const SYNC_DIR = path.join(DATA_DIR, 'sync');
export const HIGHRES_DIR = path.join(DATA_DIR, 'highres');
export const PREVIEWS_DIR = path.join(DATA_DIR, 'previews');
export const SYNC_MANIFEST_KEY = '.sync-manifest.json';
export const TRASH_PREFIX = 'trash/';
export const V2_PREFIX = 'v2/data';

export const V2_MEDIA_GROUPS = {
  uploads: path.join(DATA_V2_DIR, 'uploads'),
  flickr: path.join(DATA_V2_DIR, 'flickr'),
  instagram: path.join(DATA_V2_DIR, 'instagram'),
  highres: path.join(DATA_V2_DIR, 'highres'),
  previews: path.join(DATA_V2_DIR, 'previews'),
} as const;

export const MEDIA_VARIANTS = [
  { field: 'image_thumb', dir: 'thumbs400', suffix: 'thumb', maxSide: 400, quality: 74, alwaysCreate: true },
  { field: 'image_1k', dir: '1k', suffix: '1k', maxSide: 1024, quality: 78, alwaysCreate: false },
  { field: 'image_2k', dir: '2k', suffix: '2k', maxSide: 2048, quality: 80, alwaysCreate: false },
  { field: 'image_3k', dir: '3k', suffix: '3k', maxSide: 3072, quality: 82, alwaysCreate: false },
] as const;

export async function ensureServerDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(DATA_V2_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(BACKUPS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(DATA_BACKUPS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(ORIGINALS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(BAK_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_ORIGINALS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_2K_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_3K_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(UPLOADS_THUMBS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(SYNC_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(HIGHRES_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(PREVIEWS_DIR, { recursive: true }).catch(() => {});
  for (const groupDir of Object.values(V2_MEDIA_GROUPS)) {
    await fs.mkdir(groupDir, { recursive: true }).catch(() => {});
    await fs.mkdir(path.join(groupDir, 'originals'), { recursive: true }).catch(() => {});
    for (const variant of MEDIA_VARIANTS) {
      await fs.mkdir(path.join(groupDir, variant.dir), { recursive: true }).catch(() => {});
    }
  }
}

export const R2_CONFIG = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "9b109aa9587252172ccb60f664f603f0",
  accessKeyId: process.env.CLOUDFLARE_ACCESS_KEY_ID || "0e11678f19a97c193c9a5647f7c4b37b",
  secretAccessKey: process.env.CLOUDFLARE_SECRET_ACCESS_KEY || "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d",
  bucketName: process.env.CLOUDFLARE_BUCKET_NAME || "portfoliodata",
  publicDomain: process.env.CLOUDFLARE_PUBLIC_DOMAIN
    ? (process.env.CLOUDFLARE_PUBLIC_DOMAIN.startsWith('http') ? process.env.CLOUDFLARE_PUBLIC_DOMAIN : `https://${process.env.CLOUDFLARE_PUBLIC_DOMAIN}`)
    : "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev"
};

export const BUNNY_CONFIG = {
  apiKey: process.env.BUNNY_API_KEY || "",
  libraryId: process.env.BUNNY_LIBRARY_ID || "",
  pullZone: process.env.BUNNY_PULL_ZONE || ""
};

export const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
  forcePathStyle: false,
});

export let usageStats = {
  classA: 0,
  classB: 0,
  storageBytes: 0,
  lastReset: new Date().toISOString()
};

export async function loadUsage() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'usage.json'), 'utf-8');
    usageStats = JSON.parse(data);
  } catch (e) {}
}

export async function saveUsage() {
  try {
    await fs.writeFile(path.join(DATA_DIR, 'usage.json'), JSON.stringify(usageStats, null, 2));
  } catch (e) {}
}

export async function syncStorageSize() {
  if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) return;
  try {
    let totalSize = 0;
    let isTruncated = true;
    let continuationToken = undefined;

    while (isTruncated) {
      const command: any = new ListObjectsV2Command({
        Bucket: R2_CONFIG.bucketName,
        ContinuationToken: continuationToken,
      });
      const response: any = await s3Client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          totalSize += obj.Size || 0;
        }
      }

      isTruncated = response.IsTruncated;
      continuationToken = response.NextContinuationToken;
    }

    usageStats.storageBytes = totalSize;
    await saveUsage();
    console.log(`Synced storage size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
  } catch (e) {
    console.error("Failed to sync storage size:", e);
  }
}

export async function checkFileExistsOnR2(filename: string, localSize: number): Promise<boolean> {
  usageStats.classB++;
  saveUsage();
  if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) {
    return false;
  }

  try {
    const response = await s3Client.send(new HeadObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: filename,
    }));
    return response.ContentLength === localSize;
  } catch (e: any) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

export async function uploadToR2(buffer: Buffer, filename: string, contentType: string) {
  usageStats.classA++;
  usageStats.storageBytes += buffer.length;
  saveUsage();
  if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId || !R2_CONFIG.secretAccessKey || !R2_CONFIG.bucketName) {
    throw new Error("Cloudflare credentials not configured.");
  }

  await s3Client.send(new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: filename,
    Body: buffer,
    ContentType: contentType,
  }));

  const baseUrl = R2_CONFIG.publicDomain || `https://${R2_CONFIG.bucketName}.${R2_CONFIG.accountId}.r2.cloudflarestorage.com`;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${cleanBaseUrl}/${filename.replace(/^\/+/, '')}`;
}

export const hasR2UploadCredentials = () => (
  !!R2_CONFIG.accountId &&
  !!R2_CONFIG.accessKeyId &&
  !!R2_CONFIG.secretAccessKey &&
  !!R2_CONFIG.bucketName
);

export const getContentTypeForPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
};

export const getBufferSha1 = (buffer: Buffer) => createHash('sha1').update(buffer).digest('hex');
```

---

## Phase 2: Deterministische Block-Extraktion aus `server.ts` (Einzelbefehle)

Führe jeden der folgenden `node scripts/splice-block.cjs`-Befehle **einzeln** nacheinander im Terminal aus.

### Schritt 2.1 — `src/server/stateManager.ts` (Teil 1: Video-Dims, Bunny-Schema, Backups)
*(Entspricht Original-Zeilen 112–342)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  async function probeVideoDimensions(videoPathOrUrl: string): Promise<{ width: number; height: number } | null> {" --to "  const visitMediaReferences = (referencedKeys: Set<string>, media: any) => {" --out src/server/stateManager.ts --header "import fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { normalizeState } from './mediaNormalization.ts';\nimport { assertStateAcceptable } from './statePublishing.ts';\nimport { BUNNY_CONFIG, DATA_BACKUPS_DIR, DATA_DIR, execAsync } from './serverContext.ts';\n\n" --exports "probeVideoDimensions,fetchBunnyVideoMetadata,ensureStateVideoDimensions,isBunnyMediaLike,getBunnyEmbedUrl,getBunnyThumbUrl,normalizeBunnyMediaFields,normalizeStateBunnyMedia,localTimestamp,backupState,cleanupLooseBakFiles,extractPortfolioDataFromHtml"
```

### Schritt 2.2 — `src/server/stateManager.ts` (Teil 2: `persistAcceptedState` anhängen)
*(Entspricht Original-Zeilen 819–830)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  async function persistAcceptedState(stateData: any, statePath = path.join(DATA_DIR, 'state.json'), createBackup = false) {" --to "  const hasR2UploadCredentials = () => (" --out src/server/stateManager.ts --append --header "\n" --exports "persistAcceptedState"
```

### Schritt 2.3 — `src/server/r2StorageService.ts` (Teil 1: `visitMediaReferences` & HTML/Data Reference Collectors)
*(Entspricht Original-Zeilen 343–375)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const visitMediaReferences = (referencedKeys: Set<string>, media: any) => {" --to "  const toPosix = (value: string) => value.replace(/\\/g, '/');" --out src/server/r2StorageService.ts --header "import fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';\nimport { r2KeyToLocalPath } from './mediaDeletion.ts';\nimport { buildRedundancyReport, listLocalMediaFiles, hashLocalFile, hashR2Body, groupCandidatesBySize, loadHashCache, saveHashCache, type HashedEntry, type RedundancyReport, type CandidateItem } from './redundancyScan.ts';\nimport { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, SYNC_MANIFEST_KEY, V2_PREFIX, s3Client } from './serverContext.ts';\nimport { extractPortfolioDataFromHtml } from './stateManager.ts';\nimport { toPosix } from './variantMaterializer.ts';\n\n" --exports "visitMediaReferences,collectReferencedR2KeysFromPortfolioData,collectReferencedR2KeysFromHtml"
```

### Schritt 2.4 — `src/server/variantMaterializer.ts` (Teil 1: `toPosix`, `normalizeUploadedImage`, `materializeVariantSet`, `publishHtmlAndState`)
*(Entspricht Original-Zeilen 376–549)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const toPosix = (value: string) => value.replace(/\\/g, '/');" --to "  async function getDeletedIds(): Promise<string[]> {" --out src/server/variantMaterializer.ts --header "import fs from 'fs/promises';\nimport path from 'path';\nimport { createHash } from 'crypto';\nimport sharp from 'sharp';\nimport { GetObjectCommand, PutObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';\nimport { assertStateAcceptable } from './statePublishing.ts';\nimport { describeOrientationChange, orientMediaSource } from './mediaOrientation.ts';\nimport { MEDIA_VARIANTS, R2_CONFIG, V2_MEDIA_GROUPS, V2_PREFIX, getBufferSha1, getContentTypeForPath, s3Client, uploadToR2 } from './serverContext.ts';\nimport { updateSyncManifestEntries } from './r2StorageService.ts';\n\n" --exports "toPosix,joinUrlPath,normalizeExt,normalizeUploadedImage,getGroupBaseDir,getVariantLocalPath,getVariantLocalUrl,getVariantR2Key,materializeVariantSet,publishHtmlAndState"
```

### Schritt 2.5 — `src/server/variantMaterializer.ts` (Teil 2: `uploadVariantSetToR2` anhängen)
*(Entspricht Original-Zeilen 838–895)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const uploadVariantSetToR2 = async (" --to "  const getContentTypeForPath = (filePath: string) => {" --out src/server/variantMaterializer.ts --append --header "\n" --exports "uploadVariantSetToR2"
```

### Schritt 2.6 — `src/server/scrapeService.ts` (`getDeletedIds`, `saveDeletedIds`, `mergeScrapedData`, `hammingDistance`)
*(Entspricht Original-Zeilen 550–713)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  async function getDeletedIds(): Promise<string[]> {" --to "  const R2_CONFIG = {" --out src/server/scrapeService.ts --header "import fs from 'fs/promises';\nimport path from 'path';\nimport { DATA_DIR } from './serverContext.ts';\nimport { backupState, persistAcceptedState } from './stateManager.ts';\n\n" --exports "getDeletedIds,saveDeletedIds,mergeScrapedData,hammingDistance"
```

### Schritt 2.7 — `src/server/r2StorageService.ts` (Teil 2: Manifest, Reference Scan, Orphan/Duplicate/Redundancy Scan anhängen)
*(Entspricht Original-Zeilen 912–1342)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // Every field that can hold a media reference. MUST stay in sync with" --to "  const normalizeTrashName = (value: string) =>" --out src/server/r2StorageService.ts --append --header "\n" --exports "MEDIA_REFERENCE_FIELDS,NESTED_MEDIA_CONTAINER_KEYS,isVideoR2Key,isImageR2Key,MEDIA_STEM_SUFFIX,toCanonicalMediaStem,loadSyncManifest,saveSyncManifest,updateSyncManifestEntries,normalizePossibleR2Key,localUrlToSyncTarget,collectReferencedSyncTargets,collectReferencedR2Keys,listR2ObjectsForPrefixes,buildR2CleanupReport,buildLegacyUploadDuplicateReport,REDUNDANCY_MANAGED_PREFIXES,REDUNDANCY_LOCAL_ROOTS,MEDIA_HASH_CACHE_PATH,collectRedundancyData,filterRedundantWithSiblings"
```

### Schritt 2.8 — `src/server/r2TrashService.ts` (`TrashItem`, `moveR2ObjectsToTrash`, `listTrashObjects`, `restoreTrashObjects`, `deleteTrashObjects`, `archiveTrashObjectsToBak`, `getRecursiveFiles`)
*(Entspricht Original-Zeilen 1343–1585)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const normalizeTrashName = (value: string) =>" --to "  // API route to start high-res sync" --out src/server/r2TrashService.ts --header "import fs from 'fs/promises';\nimport path from 'path';\nimport { createHash } from 'crypto';\nimport { HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';\nimport { resolveBakArchiveTarget, writeR2BodyToFile, extractFallbackOriginalKey } from './mediaDeletion.ts';\nimport { R2_CONFIG, TRASH_PREFIX, s3Client } from './serverContext.ts';\nimport { localTimestamp } from './stateManager.ts';\nimport { listR2ObjectsForPrefixes, loadSyncManifest, saveSyncManifest } from './r2StorageService.ts';\n\n" --exports "normalizeTrashName,buildTrashKey,TrashItem,moveR2ObjectsToTrash,listTrashObjects,restoreTrashObjects,deleteTrashObjects,archiveTrashObjectsToBak,getRecursiveFiles"
```

### Schritt 2.9 — `src/server/syncRoutes.ts` (`/api/sync/*` & `/api/reset-all`)
*(Entspricht Original-Zeilen 1586–1970)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route to start high-res sync" --to "  const IMAGE_VARIANT_FIELDS = ['image_thumb', 'image_1k', 'image_2k', 'image_3k'] as const;" --out src/server/syncRoutes.ts --header "import type { Express } from 'express';\nimport fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { imageHash } from 'image-hash';\nimport { ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';\nimport { assertStateAcceptable } from './statePublishing.ts';\nimport { BACKUPS_DIR, DATA_DIR, ORIGINALS_DIR, R2_CONFIG, SYNC_DIR, V2_MEDIA_GROUPS, V2_PREFIX, getBufferSha1, getContentTypeForPath, s3Client, syncStorageSize, uploadToR2 } from './serverContext.ts';\nimport { backupState, persistAcceptedState } from './stateManager.ts';\nimport { materializeVariantSet, publishHtmlAndState, toPosix } from './variantMaterializer.ts';\nimport { hammingDistance } from './scrapeService.ts';\nimport { collectReferencedSyncTargets, loadSyncManifest, saveSyncManifest, updateSyncManifestEntries } from './r2StorageService.ts';\nimport { getRecursiveFiles } from './r2TrashService.ts';\n\nexport function registerSyncRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.10 — `src/server/mediaVariantsService.ts` (Audit-, Source-Resolution- & Variant-Generierungs-Service)
*(Entspricht Original-Zeilen 1971–2416)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const IMAGE_VARIANT_FIELDS = ['image_thumb', 'image_1k', 'image_2k', 'image_3k'] as const;" --to "  app.post(\"/api/media-variants/audit\", async (req, res) => {" --out src/server/mediaVariantsService.ts --header "import fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport os from 'os';\nimport sharp from 'sharp';\nimport { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';\nimport { firstExistingLocalMediaPath, resolveMediaAssetLocation } from './mediaAssets.ts';\nimport { assertStateAcceptable } from './statePublishing.ts';\nimport { BUNNY_CONFIG, DATA_DIR, R2_CONFIG, V2_MEDIA_GROUPS, execAsync, normalizeExt, s3Client } from './serverContext.ts';\nimport { backupState, ensureStateVideoDimensions, fetchBunnyVideoMetadata, normalizeStateBunnyMedia, persistAcceptedState } from './stateManager.ts';\nimport { materializeVariantSet } from './variantMaterializer.ts';\nimport { isImageR2Key, normalizePossibleR2Key, updateSyncManifestEntries } from './r2StorageService.ts';\n\n" --exports "IMAGE_VARIANT_FIELDS,IMAGE_SOURCE_FIELDS,VIDEO_SOURCE_FIELDS,VIDEO_THUMB_SOURCE_FIELDS,createMediaVariantsStatus,mediaVariantsStatus,resetMediaVariantsStatus,logMediaVariantStatus,sanitizeVariantBaseName,getUrlPathname,localPathFromMediaUrl,isImageUrlLike,isVideoUrlLike,isYoutubeMedia,isBunnyMedia,isVideoMedia,getMediaMaxSide,getRequiredVariantFields,inferMediaGroup,getVariantBaseName,getPublicBaseUrl,toPublicR2Url,headR2KeyWithCache,hasLikelyGenerationSource,collectMediaVariantEntries,auditMediaVariantsInState,fetchBufferFromUrl,readLocalOrRemoteBuffer,resolveImageSource,resolveBunnyThumbnail,extractVideoThumbnailBuffer,resolveVideoThumbnailSource,bestLargeFromUrls,applyGeneratedVariantUrls,getPrimaryMediaScore,getPrimaryMedia,syncItemFromPrimaryMedia,generateVariantsForEntry,publishStateJsonToR2,verifyPublishedMediaVariants"
```

### Schritt 2.11 — Abgeschattetes Duplikat `GET /api/media-variants/status` entfernen
*(Entfernt das 3-zeilige Dead-Code-Duplikat vor `generate-and-publish`)*

```powershell
node scripts/splice-block.cjs remove --src server.ts --from "  app.get(\"/api/media-variants/status\", (req, res) => {\n    res.json(mediaVariantsStatus);\n  });\n\n" --to "  // One-step endpoint: generate variants, upload to R2, and publish state.json"
```

### Schritt 2.12 — `src/server/mediaVariantsRoutes.ts` (`/api/media-variants/*` & `/api/media-validation/audit`)
*(Entspricht Original-Zeilen 2417–2768)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  app.post(\"/api/media-variants/audit\", async (req, res) => {" --to "  // API route to get saved state" --out src/server/mediaVariantsRoutes.ts --header "import type { Express } from 'express';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { PutObjectCommand } from '@aws-sdk/client-s3';\nimport { validateMediaState } from './mediaValidation.ts';\nimport { BACKUPS_DIR, DATA_DIR, R2_CONFIG, V2_MEDIA_GROUPS, getContentTypeForPath, s3Client, uploadToR2 } from './serverContext.ts';\nimport { backupState } from './stateManager.ts';\nimport { getVariantR2Key, toPosix } from './variantMaterializer.ts';\nimport { IMAGE_VARIANT_FIELDS, auditMediaVariantsInState, collectMediaVariantEntries, generateVariantsForEntry, logMediaVariantStatus, mediaVariantsStatus, publishStateJsonToR2, resetMediaVariantsStatus, syncItemFromPrimaryMedia, verifyPublishedMediaVariants } from './mediaVariantsService.ts';\n\nexport function registerMediaVariantsRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.13 — `src/server/stateRoutes.ts` (`/api/state`, `/api/r2-state`, `/api/media/exists`, `/api/preview`, `/api/item/update`)
*(Entspricht Original-Zeilen 2769–2952)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route to get saved state" --to "  // API route for AI copy optimization (KI-Edit)" --out src/server/stateRoutes.ts --header "import type { Express } from 'express';\nimport fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { PutObjectCommand } from '@aws-sdk/client-s3';\nimport { assertStateAcceptable, stateValidationHttpPayload } from './statePublishing.ts';\nimport { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, s3Client } from './serverContext.ts';\nimport { backupState, ensureStateVideoDimensions, normalizeStateBunnyMedia, persistAcceptedState } from './stateManager.ts';\n\nexport function registerStateRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.14 — `src/server/kiEditRoutes.ts` (`POST /api/ki-edit`)
*(Entspricht Original-Zeilen 2953–3159)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route for AI copy optimization (KI-Edit)" --to "  // ===================== Media deletion: local bak/ + R2 hard delete =====================" --out src/server/kiEditRoutes.ts --header "import type { Express } from 'express';\nimport { GoogleGenerativeAI } from '@google/generative-ai';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR } from './serverContext.ts';\n\nexport function registerKiEditRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.15 — `src/server/mediaDeleteRoutes.ts` (Teil 1: `deleteR2ObjectHard`, `replaceMediaThumbnail`, `deleteMediaResources` & Sync-Helpers)
*(Entspricht Original-Zeilen 3160–3379)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // ===================== Media deletion: local bak/ + R2 hard delete =====================" --to "  // API route to delete a post: removes it from state, moves local files to bak/," --out src/server/mediaDeleteRoutes.ts --header "import type { Express } from 'express';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';\nimport { stateValidationHttpPayload } from './statePublishing.ts';\nimport { resolveMediaAssetLocation } from './mediaAssets.ts';\nimport { moveFileToBak, enumerateLocalFilesForMedia, enumerateR2KeysForMedia, toPossibleR2Key, BAK_DIR_NAME, listBakFiles } from './mediaDeletion.ts';\nimport { BAK_DIR, DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, s3Client } from './serverContext.ts';\nimport { backupState, persistAcceptedState } from './stateManager.ts';\nimport { materializeVariantSet } from './variantMaterializer.ts';\nimport { getDeletedIds, saveDeletedIds } from './scrapeService.ts';\nimport { MEDIA_REFERENCE_FIELDS, loadSyncManifest, saveSyncManifest } from './r2StorageService.ts';\n\n" --exports "deleteR2ObjectHard,replaceMediaThumbnail,collectExactMediaResources,deleteMediaResources,serverMediaPriorityScore,serverGetPrimaryMergedMedia,serverSyncMediaFieldsFromPrimary,POST_MEDIA_CLEAR_FIELDS,serverClearPostMediaFields"
```

### Schritt 2.16 — `src/server/mediaDeleteRoutes.ts` (Teil 2: Delete- & Bak-Routes anhängen)
*(Entspricht Original-Zeilen 3380–3596)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route to delete a post: removes it from state, moves local files to bak/," --to "  // API route to list backups" --out src/server/mediaDeleteRoutes.ts --append --header "\nexport function registerMediaDeleteRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.17 — `src/server/maintenanceRoutes.ts` (`/api/backups/*`, `/api/r2-cleanup/*`, `/api/r2-redundancy/*`, `/api/r2-trash/*`)
*(Entspricht Original-Zeilen 3597–3917)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route to list backups" --to "  const scrapeStatus: Record<string, { running: boolean, logs: string[], done: boolean, error: string | null }> = {" --out src/server/maintenanceRoutes.ts --header "import type { Express } from 'express';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { moveFileToBak, r2KeyToLocalPath } from './mediaDeletion.ts';\nimport { BACKUPS_DIR, DATA_BACKUPS_DIR, DATA_DIR, R2_CONFIG, TRASH_PREFIX, syncStorageSize } from './serverContext.ts';\nimport { backupState, extractPortfolioDataFromHtml, persistAcceptedState } from './stateManager.ts';\nimport { publishHtmlAndState } from './variantMaterializer.ts';\nimport { buildLegacyUploadDuplicateReport, buildR2CleanupReport, collectRedundancyData, filterRedundantWithSiblings } from './r2StorageService.ts';\nimport { archiveTrashObjectsToBak, deleteTrashObjects, listTrashObjects, moveR2ObjectsToTrash, restoreTrashObjects } from './r2TrashService.ts';\n\nexport function registerMaintenanceRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.18 — `src/server/scrapeRoutes.ts` (`/api/scrape/*`, `/api/scraped-data`, `/api/flickr`)
*(Entspricht Original-Zeilen 3918–4289)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  const scrapeStatus: Record<string, { running: boolean, logs: string[], done: boolean, error: string | null }> = {" --to "  // API route to get configuration" --out src/server/scrapeRoutes.ts --header "import type { Express } from 'express';\nimport fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport os from 'os';\nimport { spawn } from 'child_process';\nimport { DATA_DIR, pickBestImage } from './serverContext.ts';\nimport { backupState } from './stateManager.ts';\nimport { getDeletedIds, mergeScrapedData } from './scrapeService.ts';\n\nexport function registerScrapeRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.19 — `src/server/uploadRoutes.ts` (`/api/config`, `/api/publish`, `/api/upload-image`, `/api/upload-video`, `/api/upload-custom-thumb`)
*(Entspricht Original-Zeilen 4290–4603)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // API route to get configuration" --to "  // ── Background task tracker for Bunny uploads ──" --out src/server/uploadRoutes.ts --header "import type { Express } from 'express';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport os from 'os';\nimport { stateValidationHttpPayload } from './statePublishing.ts';\nimport { BACKUPS_DIR, DATA_DIR, R2_CONFIG, execAsync, hasR2UploadCredentials, upload } from './serverContext.ts';\nimport { backupState, localTimestamp, persistAcceptedState } from './stateManager.ts';\nimport { getVariantLocalPath, getVariantLocalUrl, materializeVariantSet, normalizeUploadedImage, publishHtmlAndState, uploadVariantSetToR2 } from './variantMaterializer.ts';\nimport { replaceMediaThumbnail } from './mediaDeleteRoutes.ts';\n\nexport function registerUploadRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.20 — `src/server/bunnyUploadRoutes.ts` (Teil 1: `bunnyTasks`, Recovery-Queue, `sanitizeProjectName`, `getProjectSubPath/Url`)
*(Entspricht Original-Zeilen 4604–4706)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // ── Background task tracker for Bunny uploads ──" --to "  // Hybrid: upload video to local + Bunny Stream, get immediate ffmpeg thumb + better Bunny thumb later" --out src/server/bunnyUploadRoutes.ts --header "import type { Express } from 'express';\nimport fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport os from 'os';\nimport { BUNNY_CONFIG, DATA_DIR, V2_MEDIA_GROUPS, execAsync, upload } from './serverContext.ts';\nimport { fetchBunnyVideoMetadata } from './stateManager.ts';\nimport { getGroupBaseDir, getVariantLocalPath, getVariantLocalUrl, joinUrlPath, materializeVariantSet } from './variantMaterializer.ts';\n\n" --exports "bunnyTasks,BUNNY_TASKS_FILE,loadBunnyTasksFile,saveBunnyTasksFile,mutateBunnyTasksFile,sanitizeProjectName,getProjectSubPath,getProjectSubUrl"
```

### Schritt 2.21 — `src/server/bunnyUploadRoutes.ts` (Teil 2: `POST /api/upload-video-to-bunny` anhängen)
*(Entspricht Original-Zeilen 4707–4948)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // Hybrid: upload video to local + Bunny Stream, get immediate ffmpeg thumb + better Bunny thumb later" --to "  // Poll Bunny background task status" --out src/server/bunnyUploadRoutes.ts --append --header "\nexport function registerBunnyUploadRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.22 — `src/server/bunnyRoutes.ts` (`/api/bunny/*`, `/api/rename-project-folder`, `/api/state/force-publish`, `/api/upload-bunny`)
*(Entspricht Original-Zeilen 4949–5225)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // Poll Bunny background task status" --to "  // ── Instagram video source resolution (custom thumbnail capture) ──" --out src/server/bunnyRoutes.ts --header "import type { Express } from 'express';\nimport fetch from 'node-fetch';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { PutObjectCommand } from '@aws-sdk/client-s3';\nimport { BUNNY_CONFIG, DATA_DIR, R2_CONFIG, s3Client, upload } from './serverContext.ts';\nimport { fetchBunnyVideoMetadata, persistAcceptedState } from './stateManager.ts';\nimport { getGroupBaseDir, materializeVariantSet } from './variantMaterializer.ts';\nimport { bunnyTasks, sanitizeProjectName } from './bunnyUploadRoutes.ts';\n\nexport function registerBunnyRoutes(app: Express) {\n" --footer "\n}\n"
```

### Schritt 2.23 — `src/server/videoResolveRoutes.ts` (Instagram Video Source Resolver, `/api/video/resolve-source`, `/api/cloudflare/usage`, `/api/ping`)
*(Entspricht Original-Zeilen 5226–5410)*

```powershell
node scripts/splice-block.cjs move --src server.ts --from "  // ── Instagram video source resolution (custom thumbnail capture) ──" --to "  // Catch-all for undefined API routes to prevent HTML responses" --out src/server/videoResolveRoutes.ts --header "import type { Express } from 'express';\nimport fs from 'fs/promises';\nimport path from 'path';\nimport { DATA_DIR, usageStats } from './serverContext.ts';\nimport { toPosix } from './variantMaterializer.ts';\n\nexport function registerVideoResolveRoutes(app: Express) {\n" --footer "\n}\n"
```

---

## Phase 3: `server.ts` durch den schlanken Orchestrator ersetzen (~95 Zeilen)

Ersetze nun den gesamten verbleibenden Inhalt von `server.ts` durch folgenden Orchestrator-Code:

```typescript
import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  BACKUPS_DIR,
  DATA_DIR,
  DATA_V2_DIR,
  ORIGINALS_DIR,
  ensureServerDirectories,
  loadUsage,
  syncStorageSize,
} from "./src/server/serverContext.ts";
import { registerSyncRoutes } from "./src/server/syncRoutes.ts";
import { registerMediaVariantsRoutes } from "./src/server/mediaVariantsRoutes.ts";
import { registerStateRoutes } from "./src/server/stateRoutes.ts";
import { registerKiEditRoutes } from "./src/server/kiEditRoutes.ts";
import { registerMediaDeleteRoutes } from "./src/server/mediaDeleteRoutes.ts";
import { registerMaintenanceRoutes } from "./src/server/maintenanceRoutes.ts";
import { registerScrapeRoutes } from "./src/server/scrapeRoutes.ts";
import { registerUploadRoutes } from "./src/server/uploadRoutes.ts";
import { registerBunnyUploadRoutes } from "./src/server/bunnyUploadRoutes.ts";
import { registerBunnyRoutes } from "./src/server/bunnyRoutes.ts";
import { registerVideoResolveRoutes } from "./src/server/videoResolveRoutes.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.use('/data/preview.html', (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://www.youtube.com https://s.ytimg.com; frame-src https://iframe.mediadelivery.net https://www.youtube.com;"
    );
    next();
  });
  app.use('/data', express.static(DATA_DIR));
  app.use('/data_v2', express.static(DATA_V2_DIR));
  app.use('/originals', express.static(ORIGINALS_DIR));
  app.use('/backups', express.static(BACKUPS_DIR));

  await ensureServerDirectories();

  loadUsage().then(() => {
    syncStorageSize();
  });

  registerSyncRoutes(app);
  registerMediaVariantsRoutes(app);
  registerStateRoutes(app);
  registerKiEditRoutes(app);
  registerMediaDeleteRoutes(app);
  registerMaintenanceRoutes(app);
  registerScrapeRoutes(app);
  registerUploadRoutes(app);
  registerBunnyUploadRoutes(app);
  registerBunnyRoutes(app);
  registerVideoResolveRoutes(app);

  // Catch-all for undefined API routes to prevent HTML responses
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Global error handler to ensure JSON responses for all errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global server error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/backups/**']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
```

---

## Phase 4: Pflicht-Dokumentations-Sync (`.agents/rules/app-architecture.md`)

Ergänze am Ende von `.agents/rules/app-architecture.md` folgenden Abschnitt zur Server-Modul-Ownership:

```markdown
## Backend Architecture & Ownership (`server.ts` + `src/server/`)
`server.ts` (~95 lines) is the Express + Vite orchestrator only. Domain services and route clusters live in `src/server/` (< 450 lines per file):
- `serverContext.ts`: Directory constants (`DATA_DIR`, `DATA_V2_DIR`, etc.), `R2_CONFIG`, `BUNNY_CONFIG`, `s3Client`, `upload` (Multer), `usageStats`, `uploadToR2`, `ensureServerDirectories`.
- `stateManager.ts`: Video dimension probing (`probeVideoDimensions`), Bunny metadata & schema normalization, `localTimestamp`, `backupState`, `extractPortfolioDataFromHtml`, `persistAcceptedState`.
- `variantMaterializer.ts`: Image normalization, sharp variant materialization (`materializeVariantSet`), `uploadVariantSetToR2`, atomic revision promotion (`publishHtmlAndState`).
- `scrapeService.ts` + `scrapeRoutes.ts`: Deleted-ID blacklist, smart scrape merging (`mergeScrapedData`), pHash Hamming distance, and `/api/scrape/*` + `/api/flickr` routes.
- `r2StorageService.ts` + `r2TrashService.ts`: R2 reference keep-set, `.sync-manifest.json`, orphan/legacy/redundancy scanners, and R2 trash + `bak/` archive operations.
- `mediaVariantsService.ts` + `mediaVariantsRoutes.ts`: Variant audit, source resolution, generation, and `/api/media-variants/*` + `/api/media-validation/audit` routes.
- `syncRoutes.ts`, `stateRoutes.ts`, `kiEditRoutes.ts`, `mediaDeleteRoutes.ts`, `maintenanceRoutes.ts`, `uploadRoutes.ts`, `bunnyUploadRoutes.ts`, `bunnyRoutes.ts`, `videoResolveRoutes.ts`: Express route registrars (`register*Routes(app)`).
```

---

## Phase 5: Deterministische Validierung & Git-Checkpoint (Single-Action-Protocol)

Führe diese Befehle **einzeln** nacheinander aus (kein `&&`):

1. **Zeilenanzahl aller Server-Dateien prüfen (alle müssen < 500 sein):**
   ```powershell
   Get-ChildItem server.ts, src/server/*.ts | ForEach-Object { [PSCustomObject]@{ File = $_.Name; Lines = (Get-Content $_.FullName).Count } } | Sort-Object Lines -Descending
   ```
2. **Type-Check (`tsc --noEmit`):**
   ```powershell
   npm run lint
   ```
3. **Unit-Tests (`tests/**/*.test.ts`):**
   ```powershell
   npm test
   ```
4. **Production-Build (`vite build`):**
   ```powershell
   npm run build
   ```
5. **Explizites Path-Staging & Checkpoint-Commit (niemals `git add .`, kein `git push`):**
   ```powershell
   git add server.ts scripts/splice-block.cjs .agents/rules/app-architecture.md docs/PLAN-REFACTOR-SERVER.md src/server/serverContext.ts src/server/stateManager.ts src/server/variantMaterializer.ts src/server/scrapeService.ts src/server/r2StorageService.ts src/server/r2TrashService.ts src/server/syncRoutes.ts src/server/mediaVariantsService.ts src/server/mediaVariantsRoutes.ts src/server/stateRoutes.ts src/server/kiEditRoutes.ts src/server/mediaDeleteRoutes.ts src/server/maintenanceRoutes.ts src/server/scrapeRoutes.ts src/server/uploadRoutes.ts src/server/bunnyUploadRoutes.ts src/server/bunnyRoutes.ts src/server/videoResolveRoutes.ts
   ```
   ```powershell
   git commit -m "refactor(server): decompose server.ts into modular src/server services and route registrars (<450 lines each)"
   ```