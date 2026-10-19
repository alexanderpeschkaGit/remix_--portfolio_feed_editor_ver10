# Flash Remediation Plan: Post-Audit Hardening (Batch 07)

## Execution Metadata
- **Task Complexity:** `4 / 10` (Localized, deterministic edits across 5 files with exact search/replace targets)
- **Recommended Execution Model:** `flash` (Single-Action Protocol from `flash/SKILL.md`: NO `&&` or `;` command chaining)
- **Affected Files:**
  1. `src/server/stateManager.ts`
  2. `src/server/r2StorageService.ts`
  3. `src/server/stateRoutes.ts`
  4. `src/hooks/useStatePersistence.ts`
  5. `src/hooks/useCloudSync.ts`

---

## Step 1: Fix Circular Dependency, Cold-Start Protection & Write-Queue in `src/server/stateManager.ts`

1. Open `src/server/stateManager.ts`.
2. **Replace** the top section (from `import { liftLegacyDataV2UrlsInState } from './r2StorageService.ts';` through the end of `loadState`) with the following self-contained implementation:

```typescript
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { normalizeState } from './mediaNormalization.ts';
import { assertStateAcceptable } from './statePublishing.ts';
import {
  BUNNY_CONFIG,
  DATA_BACKUPS_DIR,
  DATA_DIR,
  DATA_V2_DIR,
  execAsync,
  getContentTypeForPath,
  isR2Configured,
  R2_CONFIG,
  R2_STORAGE_KEYS,
  s3Client,
} from './serverContext.ts';

let inMemoryState: any = null;
let lastR2FetchMs = 0;
let lastCloudBackupMs = 0;
let r2StateVerified = false;
let activeWritePromise: Promise<void> = Promise.resolve();

const R2_READ_TTL_MS = 2_000;
const CLOUD_BACKUP_MIN_INTERVAL_MS = 60_000;

export async function liftLegacyDataV2UrlsInState(stateObj: any): Promise<void> {
  if (!stateObj || typeof stateObj !== 'object') return;
  const baseUrl = (R2_CONFIG.publicUrl || R2_CONFIG.publicDomain || '').replace(/\/+$/, '');

  async function walk(target: any) {
    if (!target || typeof target !== 'object') return;

    for (const key of Object.keys(target)) {
      const val = target[key];
      if (typeof val === 'string') {
        const clean = val.trim().replace(/\\/g, '/');
        if (clean.startsWith('/data_v2/') || clean.startsWith('data_v2/')) {
          const relativeSubpath = clean.replace(/^\/?data_v2\//, '');
          const localPath = path.join(DATA_V2_DIR, relativeSubpath);
          const r2Key = `v2/data/${relativeSubpath}`;

          if (isR2Configured() && s3Client) {
            try {
              const buf = await fs.readFile(localPath);
              const contentType = getContentTypeForPath(localPath);
              await s3Client.send(
                new PutObjectCommand({
                  Bucket: R2_CONFIG.bucketName,
                  Key: r2Key,
                  Body: buf,
                  ContentType: contentType,
                  CacheControl: 'public, max-age=31536000, immutable',
                })
              );
            } catch {
              // Local file might not exist or already be on R2
            }
          }

          if (baseUrl) {
            target[key] = `${baseUrl}/${r2Key}`;
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        await walk(val);
      }
    }
  }

  await walk(stateObj);
}

export async function loadState(options?: { forceRefresh?: boolean }): Promise<any> {
  const now = Date.now();
  const shouldQueryR2 =
    isR2Configured() &&
    s3Client &&
    (options?.forceRefresh || !inMemoryState || now - lastR2FetchMs > R2_READ_TTL_MS);

  if (shouldQueryR2 && s3Client) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: R2_STORAGE_KEYS.STATE_FILE,
        })
      );
      const rawJson = await response.Body?.transformToString('utf-8');
      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        if (!parsed.lastUpdated || typeof parsed.lastUpdated !== 'string') {
          parsed.lastUpdated = new Date().toISOString();
        }
        inMemoryState = parsed;
        lastR2FetchMs = now;
        r2StateVerified = true;
        return inMemoryState;
      }
    } catch (err: any) {
      const isNotFound = err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
      if (isNotFound) {
        r2StateVerified = true;
      } else {
        console.warn('[stateManager] R2 GetObject Warnung, nutze Fallback:', err?.message || err);
      }
    }
  }

  if (inMemoryState) {
    return inMemoryState;
  }

  try {
    const localStatePath = path.join(DATA_DIR, 'state.json');
    const localRaw = await fs.readFile(localStatePath, 'utf-8');
    const localParsed = JSON.parse(localRaw);
    if (!localParsed.lastUpdated || typeof localParsed.lastUpdated !== 'string') {
      localParsed.lastUpdated = new Date().toISOString();
    }
    inMemoryState = localParsed;
    if (Array.isArray(localParsed.items) && localParsed.items.length > 0) {
      r2StateVerified = true;
    }
    return inMemoryState;
  } catch {
    // Lokale Datei existiert nicht -> nutze In-Memory-Default
  }

  inMemoryState = {
    items: [],
    settings: {},
    lastUpdated: new Date().toISOString(),
  };
  return inMemoryState;
}
```

3. In `src/server/stateManager.ts`, **replace** the end of `persistAcceptedState` (from `state = normalized;` to `return stateString;`) with:

```typescript
    state = normalized;
    await ensureStateVideoDimensions(state);
    normalizeStateBunnyMedia(state);
    await liftLegacyDataV2UrlsInState(state);
    await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });

    state.lastUpdated = new Date().toISOString();
    inMemoryState = state;
    lastR2FetchMs = Date.now();

    const stateString = JSON.stringify(state, null, 2);
    const itemsList = Array.isArray(state.items) ? state.items : Array.isArray(state.posts) ? state.posts : [];
    const canSafelyWriteR2 = r2StateVerified || itemsList.length > 0;

    const writeTask = async () => {
      if (createBackup && canSafelyWriteR2) {
        await backupState(state);
      }

      if (isR2Configured() && s3Client && canSafelyWriteR2) {
        try {
          await s3Client.send(
            new PutObjectCommand({
              Bucket: R2_CONFIG.bucketName,
              Key: R2_STORAGE_KEYS.STATE_FILE,
              Body: Buffer.from(stateString, 'utf-8'),
              CacheControl: 'no-cache, no-store, must-revalidate',
              ContentType: 'application/json; charset=utf-8',
            })
          );
          r2StateVerified = true;
        } catch (err: any) {
          console.warn('[stateManager] Failed to put state.json to R2:', err?.message || err);
        }

        const now = Date.now();
        if (now - lastCloudBackupMs >= CLOUD_BACKUP_MIN_INTERVAL_MS) {
          lastCloudBackupMs = now;
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          s3Client
            .send(
              new PutObjectCommand({
                Bucket: R2_CONFIG.bucketName,
                Key: `${R2_STORAGE_KEYS.BACKUP_PREFIX}state-${timestamp}.json`,
                Body: Buffer.from(stateString, 'utf-8'),
                ContentType: 'application/json; charset=utf-8',
              })
            )
            .catch((err: any) => console.warn('[stateManager] Cloud backup throttled save failed:', err?.message || err));
        }
      } else if (!canSafelyWriteR2) {
        console.warn('[stateManager] Blocked R2 overwrite: Cold-start fallback state is empty and R2 state was not verified.');
      }

      try {
        await fs.writeFile(statePath, stateString, 'utf-8');
      } catch (err: any) {
        console.warn(`[stateManager] Local state write failed to ${statePath}:`, err?.message || err);
      }
    };

    activeWritePromise = activeWritePromise.then(writeTask, writeTask);
    await activeWritePromise;

    return stateString;
```

---

## Step 2: Re-export `liftLegacyDataV2UrlsInState` & Fix Variant Regex in `src/server/r2StorageService.ts`

1. Open `src/server/r2StorageService.ts`.
2. Update the import from `./stateManager.ts` to re-export `liftLegacyDataV2UrlsInState`, and remove the duplicate body of `liftLegacyDataV2UrlsInState` from `r2StorageService.ts`:
   ```typescript
   import { extractPortfolioDataFromHtml, liftLegacyDataV2UrlsInState, loadState } from './stateManager.ts';
   export { liftLegacyDataV2UrlsInState };
   ```
3. In `src/server/r2StorageService.ts`, fix the variant stem regex so filenames containing underscores (e.g. `img_2026_1k.jpg`) are matched up to the final variant suffix rather than stopping at the first underscore:
   - **Search:**
     ```typescript
     const v2Match = key.match(/^v2\/data\/([^\/]+)\/([^\/]+)\/([^_]+)(?:_[^\.]+)?\.(.+)$/);
     ```
   - **Replace:**
     ```typescript
     const v2Match = key.match(/^v2\/data\/([^\/]+)\/([^\/]+)\/(.+?)(?:_(?:thumb|1k|2k|3k|original))?\.([^.]+)$/);
     ```

---

## Step 3: Add `Cache-Control: no-store` in `src/server/stateRoutes.ts`

1. Open `src/server/stateRoutes.ts`.
2. In `app.get("/api/state", ...)`, set `res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');` before `res.json(state);`.

---

## Step 4: Fix `pushToR2` Boolean Evaluation in `src/hooks/useStatePersistence.ts` & Poll Guard in `src/hooks/useCloudSync.ts`

1. Open `src/hooks/useStatePersistence.ts`.
2. **Search:**
   ```typescript
   const pushToR2 = shouldPushStateToR2Ref.current !== undefined ? shouldPushStateToR2Ref.current : true;
   if (shouldPushStateToR2Ref.current) {
     shouldPushStateToR2Ref.current = false;
   }
   ```
   **Replace:**
   ```typescript
   const pushToR2 = true;
   if (shouldPushStateToR2Ref.current) {
     shouldPushStateToR2Ref.current = false;
   }
   ```
3. Open `src/hooks/useCloudSync.ts`.
4. **Search:**
   ```typescript
   const res = await fetch(`/api/r2-state?t=${Date.now()}`);
   ```
   **Replace:**
   ```typescript
   if (isSavingRef?.current) return;
   const res = await fetch(`/api/r2-state?t=${Date.now()}`, { cache: 'no-store' });
   ```

---

## Step 5: Sequential Verification (Single-Action Protocol — Do NOT chain with `&&`)
1. Run `npm run lint` as a single command.
2. Run `npm run build` as a single command.
