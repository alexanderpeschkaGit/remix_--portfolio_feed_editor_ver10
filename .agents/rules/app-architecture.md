# App Architecture & Module Ownership (Post-Deep-Refactor)

Load this rule when modifying anything under `src/hooks/`, `src/utils/`, `src/components/`, or the published-HTML generation / upload flows.

## Canonical Paths & Ownership (deep-refactor 2026-10-13)

`App.tsx` is the orchestrator only; `src/hooks/` owns one state/effect/handler cluster per file (custom hooks may own state + effects + lifecycle); `src/utils/` holds pure logic; `src/components/` holds leaf UI. `updatePosts` (in `src/hooks/useUndoHistory.ts`) is the single central mutation point, returned to `App.tsx` and passed to consumers. Hooks receive dependencies declared later in `App.tsx` via closure adapters (`(v) => setX(v)`) or getters (`() => value`).

## Ownership Map — Batches 1–15a (2026-10-13)

Module-scope helpers, cloud-compare/cleaning logic and every state/effect/handler cluster were pulled out of `App.tsx`. Do not move a cluster back into `App.tsx` and do not duplicate it in a second hook — extend the owning file instead.

Pure logic (`src/utils/`, React-free):

| File                       | Owns                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mediaHelpers.ts`          | All media helpers (`formatDescription`, `parseDimensions`, `getResolutionLabel`, `isDirectMediaFile`, `isValidImageCandidate`, `getImageSrc`, `getVideoSrc`, `getRenderableMediaSource`, `hasRenderableMedia`, `getMediaDedupeKey`, `getMediaPriorityScore`, `getPrimaryMergedMedia`, `syncMediaFieldsFromPrimary`, `clearPostMediaFields`) + `resizeImage`. |
| `mediaVariantsHelpers.ts`  | Pure issue classifiers, reason labels, and grouped variant count helpers for media variant auditing.                                                                                                                                                                                                                                                         |
| `postMediaHelpers.ts`      | Pure media renderability checks, poster resolution, resolution variant badges, video service parsing, and drag reordering.                                                                                                                                                                                                                                   |
| `cloudCompare.ts`          | `toStableJson`, `normalizeMediaForCloudCompare`, `normalizePostForCloudCompare`, `getPostSignature` — the 15s cloud-change polling comparison.                                                                                                                                                                                                               |
| `cleanPosts.ts`            | `stripBlobUrls`, `cleanPostsForServer` — server payload cleaning (blob URLs, `image_preview`).                                                                                                                                                                                                                                                               |
| `generatePortfolioHtml.ts` | `generateHTML` entry only; composes the `portfolioHtmlParts` + `portfolioHtmlRuntime*` builders (see Published-HTML Generation below).                                                                                                                                                                                                                       |
| `kiEditClient.ts`          | Shared string/resolution helpers (`getAsString`, `getResolutionVariants`) and Base64 thumbnail serialization + `/api/ki-edit` client (`requestKiCaseStudyEdit`).                                                                                                                                                                                             |

Leaf UI (`src/components/`, props only, no state):

| File                                                  | Props                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `modals/MergeConfirmationModal.tsx`                   | `isOpen`, `group`, `onConfirm`, `onSkip` (was module scope in `App.tsx`).                                            |
| `modals/media-variants/MediaVariantsIssueList.tsx`    | Issues list, loading state, progress bar, generated files list.                                                      |
| `modals/media-variants/MediaVariantsActionFooter.tsx` | Scan, verify, generate, publish action buttons and help modal.                                                       |
| `modals/lightbox/LightboxMediaStage.tsx`              | Orchestrator for lightbox media stage routing between edit-list, scroll gallery, and active player.                   |
| `modals/lightbox/LightboxEditingReorderList.tsx`      | Drag-and-drop reorder list with grip handles and resolution chips for edit mode.                                     |
| `modals/lightbox/LightboxScrollGallery.tsx`           | Scrollable vertical gallery with lazy/deferred player activation for non-edit multi-media.                           |
| `modals/lightbox/LightboxActivePlayer.tsx`            | Single active media player (Bunny/YouTube iframe, HTML5 video, image fallback) and chevron navigation.               |
| `modals/lightbox/LightboxSidebar.tsx`                 | Lightbox title, states, description, AI-edit, thumbnail sorting, links.                                              |
| `header/CloudflareUsageDisplay.tsx`                   | `usage`; passed to `AdminHeader` as a render prop.                                                                   |
| `header/AdminButton.tsx`                              | Reusable styled action button with tooltip (`onClick`, `disabled`, `tooltip`, `active`).                             |
| `header/AdminHeaderMetadataSection.tsx`               | Title/subtitle display & edit mode inputs with scraping source fields (`portfolioTitle`, `igAccount`, etc.).         |
| `header/AdminHeaderMaintenanceBlock.tsx`              | 5-button maintenance cluster: R2 cleanup, dupes, redundancy, trash & purge bak.                                      |
| `header/AdminHeaderPublishSection.tsx`                | Undo, Redo, Preview, Undo Publish, Publish and Live link button row.                                                |
| `StatusNotice.tsx`                                    | `notice`, `onClose`; `StatusNoticeData` is owned by `useStatusNotice`.                                               |
| `FallbackBanner.tsx`                                  | `label`, `isError`, `fallbackEnabled`, `onDismiss`, `onToggleFallback`.                                              |
| `ResolutionToast.tsx`                                 | `show`, `resolutionsEnabled`.                                                                                        |
| `feed/post-card/FeedPostMediaSection.tsx`             | Top media rendering (resolution chips, media item list with upload/URL controls, single cover view, upload overlay). |
| `feed/post-card/FeedPostBodyAndPopover.tsx`           | `FeedPostBodySection` (body, AI-edit, states, merge/delete) and `FeedPostHoverPopover` (portal preview popover).     |
| `feed/post-card/feedPostMediaHelpers.ts`              | Pure feed media renderability, poster resolution, video candidate checks, and drag detection helpers.                |

Hooks (`src/hooks/`, one cluster per file):

| Hook                         | Owns                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMediaVariantsAudit.ts`   | Media variants audit polling, variant generation, R2 publishing, and help dialog state.                                                                                                                                                                                          |
| `useKiCaseStudyEdit.ts`      | AI case study generation, thumbnail conversion, and undo state.                                                                                                                                                                                                                  |
| `useUndoHistory.ts`          | History stack (`past`/`future`), **`updatePosts`**, `recordHistory`, `recordTrashUndo`, `handleUndo`, `handleRedo`.                                                                                                                                                              |
| `useMediaInteraction.ts`     | `mediaSelection` (+ `MediaSelection` type), `activeMediaDrag`, merge queue (`currentMergeGroup`, `isMergeModalOpen`, confirm/skip/similar), cross-post media drop.                                                                                                               |
| `useScrapeSync.ts`           | Scrape/sync state (`scrapeLogs`, `isScraping`, `syncStatus`, `fullR2SyncStatus`, `uncertainMatches`, `showLogs`, `showUncertain`) + `handleScrape`, `handleHighResSync`, `handleFullR2Sync`, `handleConfirmMatch`, `handleRejectMatch`. Replaces the deleted `usePortfolioSync`. |
| `useCloudSync.ts`            | 15s cloud-change polling, `hasCloudChanges`, `cloudSyncChanges`, `cloudSyncState`, `localLastUpdated`/`ignoreCloudChangesRef`, sync/cancel/ignore/apply handlers.                                                                                                                |
| `useTrashManager.ts`         | Trash modal state + open/load/restore/delete/permanent-delete.                                                                                                                                                                                                                   |
| `useMediaUploads.ts`         | Thin orchestrator: `activeUploads`, `hasUnsyncedMedia`, `bunnyProgress`, delegating to `uploadImageFlow` / `uploadVideoFlow`.                                                                                                                                                    |
| `usePublishing.ts`           | Preview / publish / restore-latest-publish + upload progress state.                                                                                                                                                                                                              |
| `useBackups.ts`              | Backup list, restore state and errors.                                                                                                                                                                                                                                           |
| `useR2Maintenance.ts`        | R2 / legacy-duplicate / redundancy cleanup flags + handlers, `handlePurgeBak`, `handleResetAll`.                                                                                                                                                                                 |
| `usePortfolioInit.ts`        | Boot chain (embedded data → `/api/state` → fallback), `isInitialized`, `isR2Fallback`, `isFlickrFallback`, `fallbackEnabled`.                                                                                                                                                    |
| `useStatePersistence.ts`     | The auto-save `useEffect` POSTing `/api/state` (clean posts, `projectStates`, `scrapeConfig`, `pushToR2`) incl. the in-flight-Bunny guard. Returns nothing.                                                                                                                      |
| `usePostActions.ts`          | Post CRUD: add/delete/change, media update/remove, hidden + state toggle, merge-down, post-commit sources.                                                                                                                                                                       |
| `usePostOrdering.ts`         | dnd `sensors`, `handleDragEnd`, move-to-target, lightbox drag/drop, `handleMerge`, `handleBulkDelete`.                                                                                                                                                                           |
| `useImageDimensions.ts`      | `imageDimensions`, `handleImageLoad`, `getMediaDimensionsKey`, `setImageDimensionForKey`.                                                                                                                                                                                        |
| `useEditorLifecycle.ts`      | Global keyboard shortcuts, header-ref sync + unpublished-changes flag, log auto-scroll, reorder wheel scroll, `window.portfolioData` embed.                                                                                                                                      |
| `useStatusNotice.ts`         | Notice state/timer + `pushStatusNotice` / `closeStatusNotice`, `StatusNoticeData`.                                                                                                                                                                                               |
| `useFeedCardFileDrop.ts`     | Card-level file drag-and-drop, file input queueing, and upload status banner lifecycle for `FeedPostCard`.                                                                                                                                                                       |
| `useFeedCardMediaActions.ts` | Per-media mutations, YouTube/Bunny URL resolution, custom thumbnail upload/capture, and hover-preview popover state for `FeedPostCard`.                                                                                                                                          |

Unchanged by the refactor (pre-existing): `useRearrangeState.ts`, `useLightboxState.ts`, `useBioFeature.ts`, `utils/linkify.ts`, `utils/mergePosts.ts`.

## Wiring Conventions

- `App.tsx` injects dependencies declared later in the same component in three shapes: closure adapters (`(v) => setX(v)`), getters (`() => value`) and refs (`flickrPostsRef`, `shouldPushStateToR2Ref`, `keyHandlersRef`).
- Non-hook flows take one `deps` object (`uploadImageFlow(deps, id, file)`, `uploadVideoFileFlow(deps, id, file)`, `applyVideoLinkChange(deps, id, url)`) instead of nesting hooks; the flow modules import no React.
- `useEditorLifecycle` keeps its handlers in `keyHandlersRef` so the once-registered `keydown` listener never closes over stale state.
- `src/utils/portfolioHtml*`, `cloudCompare`, `cleanPosts` and `mediaHelpers` must stay React-free and side-effect-free.

## Published-HTML Generation (batch 15b)

The portfolio page template is split into section builders — `src/utils/portfolioHtmlParts.ts` (favicons, post-cards builder, head, styles, data script, body) plus `src/utils/portfolioHtmlRuntimeCore.ts` and `src/utils/portfolioHtmlRuntimeLightbox.ts` (the two runtime `<script>` halves, split at `renderGallery`). Published output MUST stay byte-identical when editing these files; verify with `npx tsx scripts/html-parity-fixture.ts <dir>` and compare hashes.

## Upload Flows (batch 15b)

`src/hooks/useMediaUploads.ts` is a thin orchestrator; the real pipelines live in `src/hooks/uploadImageFlow.ts` (image) and `src/hooks/uploadVideoFlow.ts` (Bunny video + link change), injected with deps from the hook.

## Status Notices (batch 15b)

`src/hooks/useStatusNotice.ts` owns the notice state/timer; `src/components/StatusNotice.tsx` is the leaf. Leaf components `FallbackBanner`/`ResolutionToast` in `src/components/` render their visibility from props passed by `App.tsx`.

## Removed in the Refactor (D2, 2026-10-13)

- `src/hooks/usePortfolioSync.ts` and `src/hooks/index.ts` deleted (stale partial extraction, never imported, duplicated the scrape/sync cluster). **No barrel files** — import hooks by their path.
- In `App.tsx`: dead `FeedPostCard` import, inner `AdminButton` and `SortableThumbnail` components deleted.

## File-Size Watch List (post-refactor)

`App.tsx` is orchestrator-only now (~446 lines, was 5,213) ✓; the mandatory `useMediaUploads` and `generatePortfolioHtml` decompositions are done ✓. The AGENTS.md thresholds (300–499 warn, 500+ mandatory) apply to everything the refactor created:

- 300–499 band: `portfolioHtmlRuntimeCore.ts` (~437), `uploadVideoFlow.ts` (~381), `portfolioHtmlRuntimeLightbox.ts` (~380), `useR2Maintenance.ts` (~355), `usePostActions.ts` (~322), `mediaHelpers.ts` (~309), `useCloudSync.ts` (~304). Split at a function boundary when they grow; the two runtime halves must keep the byte-parity rule above.
- Pre-existing >500 files: `components/modals/LightboxModal.tsx` (and `LightboxMediaStage.tsx`), `components/modals/MediaVariantsModal.tsx`, `components/feed/FeedPostCard.tsx`, and `components/header/AdminHeader.tsx` decomposed into modular hooks and leaf components (<280 lines each) ✓.

## Verifying References

- Every path named in `AGENTS.md` and in this file must resolve in the working tree (the two deletions listed under "Removed in the Refactor" are the only exceptions); keep both files in sync when a module is renamed or split.
- Published-HTML parity command: `npx tsx scripts/html-parity-fixture.ts <dir>` — compare hashes before/after editing the template files.
- Refactor tooling: `scripts/html-parity-fixture.ts` is kept (parity gate); `scripts/splice-block.cjs` was the one-off verbatim block splicer.

## Backend Architecture & Ownership (`server.ts` + `src/server/`)

`server.ts` (~105 lines) is the Express + Vite orchestrator only, with static mounts and R2 fallback 302 redirects (`resolveR2PublicUrl`). Domain services and route clusters live in `src/server/` (< 450 lines per file):

- `serverContext.ts`: Directory constants (`DATA_DIR`, `DATA_V2_DIR`, etc.), `R2_CONFIG`, `R2_STORAGE_KEYS`, `isR2Configured`, `resolveR2PublicUrl`, `BUNNY_CONFIG`, `s3Client`, `upload` (Multer), `usageStats`, `uploadToR2`, `ensureServerDirectories`.
- `stateManager.ts`: Bunny schema normalization, `localTimestamp`, `loadState` (in-memory cache + R2/disk fallback), `backupState`, `extractPortfolioDataFromHtml`, `persistAcceptedState` (~372 lines). Re-exports video dimension routines from `videoDimensionsService.ts`.
- `videoDimensionsService.ts`: Probe local & HTTP video dimensions (`ffprobe` via `execAsync`), fetch Bunny metadata (`fetchBunnyVideoMetadata`), and auto-correct fallback dimensions (`ensureStateVideoDimensions`) (~150 lines).
- `variantMaterializer.ts`: Image normalization, sharp variant materialization (`materializeVariantSet`), `uploadVariantSetToR2`, atomic revision promotion (`publishHtmlAndState`).
- `scrapeService.ts` + `scrapeRoutes.ts`: Deleted-ID blacklist, smart scrape merging (`mergeScrapedData`), pHash Hamming distance, and `/api/scrape/*` + `/api/flickr` routes.
- `r2StorageService.ts` + `r2TrashService.ts`: R2 reference keep-set, `liftLegacyDataV2UrlsInState`, `.sync-manifest.json`, orphan/legacy/redundancy scanners, and R2 trash + `bak/` archive operations.
- `mediaVariantsService.ts` + `mediaVariantsRoutes.ts`: Variant audit, source resolution (with R2 GetObject fallback), generation, and `/api/media-variants/*` + `/api/media-validation/audit` routes.
- `syncRoutes.ts`, `stateRoutes.ts`, `kiEditRoutes.ts`, `mediaDeleteRoutes.ts`, `maintenanceRoutes.ts`, `uploadRoutes.ts`, `bunnyUploadRoutes.ts`, `bunnyRoutes.ts`, `videoResolveRoutes.ts`: Express route registrars (`register*Routes(app)`).
