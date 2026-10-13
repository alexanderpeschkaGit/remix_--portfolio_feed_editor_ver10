## Execution Metadata
- **Recommended Execution Model:** PRO
- **Complexity Assessment:** Massive 5,214-line component; extraction of ~15 ownership clusters across ~20 files with high blast radius (undo/R2-trash, init/fallback chain, publish pipeline). Requires strict behavior parity and per-batch validation. Executor must act as Implementer and spawn a `pro` Reviewer subagent (Red-Teaming) before finalizing.

---

# Deep-Refactor Plan: `src/App.tsx`

> Workflow: `#deep-refactor` skill (`.agents/skills/deep-refactor/SKILL.md`) + `#plan` skill (`.agents/skills/plan.md`).
> Trigger: AGENTS.md mandates decomposition at 500+ lines. `src/App.tsx` has **5,214 lines**.

---

## 1. Architecture & Logic (Architecture & Logic)

### 1.1 Baseline findings (source of truth: current repository state)

| Check | Result |
|---|---|
| `git status` | One pre-existing user change: `M .agents/skills/deep-refactor/SKILL.md` — **preserve, do not touch** |
| `npm run lint` (`tsc --noEmit`) | ✅ passes clean |
| `npm run build` (`vite build`) | ✅ passes; pre-existing warning: 667.8 kB main chunk > 500 kB |
| `npm test` | Covers only server-side modules (`tests/*.test.ts`); **no tests exist for App.tsx** |
| Encoding (AGENTS.md UTF-8 rule) | ⚠️ 5 pre-existing mojibake lines in App.tsx: L382, L556 (comments), L2106, L2288, L2399 (user-visible strings: `…`, `–`) |
| Dead code in App.tsx | Unused import `FeedPostCard` (L36), unused inner components `AdminButton` (L4736), `SortableThumbnail` (L4754) |
| Dead code in src/hooks | `usePortfolioSync.ts` + `hooks/index.ts`: stale partial extraction from an earlier refactor, **never imported**, duplicates App.tsx scrape/sync logic and contains its own mojibake (`fÃ¼r`) |
| Existing decomposition | `components/` (feed, gallery, header, 14 modals), `hooks/` (useRearrangeState, useLightboxState, useBioFeature), `utils/` (linkify, mergePosts), `server/`, `services/` — App.tsx already composes these |

### 1.2 Current structure of App.tsx

- **Module scope (L1–327):** imports; ~260 lines of pure media helpers (`formatDescription`, `parseDimensions`, `getResolutionLabel`, `isDirectMediaFile`, `isValidImageCandidate`, `getImageSrc`, `getVideoSrc`, `getRenderableMediaSource`, `hasRenderableMedia`, `getMediaDedupeKey`, `getMediaPriorityScore`, `getPrimaryMergedMedia`, `syncMediaFieldsFromPrimary`, `clearPostMediaFields`); favicon constants (L304–319, used only by `generateHTML`); history types (L321–324); inline `MergeConfirmationModal` (L70–95).
- **App component (L328–5214):**
  - ~70 `useState` hooks; refs (`flickrPostsRef`, `portfolioTitleRef`, etc.)
  - Hooks in use: `useRearrangeState`, `useLightboxState`, `useBioFeature`
  - **`generateHTML` (L2419–3492, ~1,070 lines)** — pure HTML-template generator, the single biggest block
  - `handleImageUpload` (L1816–2078), `handleVideoFileUpload` (L2078–2331, Bunny upload)
  - Init/fallback effect (L1112–1279), server-persistence effect (L1279–1362), cloud-change polling effect (L764–873, with inline normalization helpers)
  - Scrape/sync handlers (L955–1112), cloud-sync handlers (L3555–3743), trash manager (L3743–3874), R2 maintenance (L3874–4397), backups (L4423–4502), publishing (L4006–4231), undo/redo (L1380–1508), post actions (L1509–1776), dnd/ordering (L4397–4531), cross-post media drop + merge + bulk delete (L4531–4715)
  - JSX return: only ~370 lines (most UI already in components); inner components `CloudflareUsageDisplay` (passed to `AdminHeader` as render prop), dead `AdminButton`, dead `SortableThumbnail`

### 1.3 Target architecture (ownership-based, no thin wrappers, no parameter bags)

```
src/
  App.tsx                                  → orchestrator only (~400–480 lines, < 500 AGENTS.md limit)
  types.ts                                 → + history entry types
  constants.ts                             → (unchanged; PROJECT_STATES)
  utils/
    mediaHelpers.ts                        → all module-scope media helpers + resizeImage + formatBytes + getDisplayImage (pure, params for flags)
    generatePortfolioHtml.ts               → generateHTML + favicon constants (pure; publicDomain passed as param)
    cloudCompare.ts                        → toStableJson, normalizeMediaForCloudCompare, normalizePostForCloudCompare, getPostSignature (pure)
    cleanPosts.ts                          → stripBlobUrls + cleanPostsForServer (pure, from persistence effect)
  components/
    modals/MergeConfirmationModal.tsx      → moved from App.tsx module scope
    header/CloudflareUsageDisplay.tsx      → moved inner component (render prop for AdminHeader)
  hooks/                                   → each hook OWNS its state + effects + handlers
    useUndoHistory.ts                      → past, future, updatePosts, recordTrashUndo, handleUndo, handleRedo, undoingR2TrashRef
    useMediaInteraction.ts                 → mediaSelection, activeMediaDrag, merge queue + confirm/skip/similar, cross-post media drop
    useScrapeSync.ts                       → scrape/sync states + handleScrape, handleHighResSync, handleConfirmMatch, handleRejectMatch, handleFullR2Sync (FRESH extraction — replaces stale usePortfolioSync)
    useCloudSync.ts                        → hasCloudChanges, cloudSyncChanges, cloudSyncState, 15s polling, sync-from-cloudflare handlers
    useTrashManager.ts                     → trash modal state + all trash handlers
    useMediaUploads.ts                     → activeUploads, bunnyProgress, hasUnsyncedMedia, handleImageUpload, handleVideoFileUpload, handleVideoLinkChange
    usePublishing.ts                       → handlePreview, handleUpload, handleRestoreLatestPublish, restoringLatestPublish, uploadProgress/uploadSuccess
    useBackups.ts                          → backups state + loadBackups, handleRestoreBackup
    useR2Maintenance.ts                    → r2/legacy/redundancy cleanup flags + handlers, handlePurgeBak, handleResetAll
    usePortfolioInit.ts                    → init effect (embedded data → /api/state → fallback), fallback flags, config fetch
    useStatePersistence.ts                 → persist-to-server effect, hasUnpublishedChanges, localLastUpdated
    usePostActions.ts                      → handlePostChange, handleAddNewPost, handleDeletePost, handleUpdatePostMedia, handleRemoveMedia, handleToggleHidden, handleStateToggle, bio wrappers
    usePostOrdering.ts                     → sensors, handleDragEnd, handleMoveToTarget, handleMergeDown, lightbox drag handlers
  → Deleted (user decision, see §1.6): dead FeedPostCard import, AdminButton, SortableThumbnail, usePortfolioSync.ts, hooks/index.ts
```

Ownership rules (deep-refactor skill):
- `updatePosts` stays the single central mutation point, owned by `useUndoHistory`, returned to App and passed to consumers — no duplicated state.
- State moves into a hook only if the hook is its sole consumer cluster; App keeps only shared/orchestration state.
- Pure logic → utils; UI → leaf components; lifecycle + state clusters → custom hooks.

### 1.4 Batch pipeline (max 3 implementation files per batch)

Order follows the mega-file pipeline: pure logic first (lowest risk), then presentation, then ownership hooks, then orchestrator cutover.

| # | Batch (files touched) | Validation |
|---|---|---|
| 1 | `types.ts` (+ history types), **new** `utils/mediaHelpers.ts`, `App.tsx` (import from utils) | lint + build + manual smoke |
| 2 | **new** `utils/generatePortfolioHtml.ts` (incl. favicon constants), `App.tsx` | lint + build + preview/publish smoke |
| 3 | **new** `utils/cloudCompare.ts`, **new** `utils/cleanPosts.ts`, `App.tsx` | lint + build |
| 4 | **new** `components/modals/MergeConfirmationModal.tsx`, **new** `components/header/CloudflareUsageDisplay.tsx`, `App.tsx` | lint + build + merge-modal smoke |
| 4b | Dead-code cleanup (D2): remove `FeedPostCard` import, `AdminButton`, `SortableThumbnail` from `App.tsx`; delete `usePortfolioSync.ts` + `hooks/index.ts`. Pairs with batch 4; joint complexity ≈ 3 | lint + build |
| 5 | **new** `hooks/useUndoHistory.ts`, `App.tsx` | lint + build + undo/redo/trash-undo smoke |
| 6 | **new** `hooks/useMediaInteraction.ts`, `App.tsx` | lint + build + select/drag/merge smoke |
| 7 | **new** `hooks/useScrapeSync.ts`, `App.tsx` | lint + build + scrape/sync smoke |
| 8 | **new** `hooks/useCloudSync.ts`, `App.tsx` | lint + build + cloud-sync smoke |
| 9 | **new** `hooks/useTrashManager.ts`, `App.tsx` | lint + build + trash smoke |
| 10 | **new** `hooks/useMediaUploads.ts`, `App.tsx` | lint + build + upload/video smoke |
| 11 | **new** `hooks/usePublishing.ts`, `App.tsx` | lint + build + publish/restore smoke |
| 12 | **new** `hooks/useBackups.ts`, **new** `hooks/useR2Maintenance.ts`, `App.tsx` | lint + build + backups/maintenance smoke |
| 13 | **new** `hooks/usePortfolioInit.ts`, **new** `hooks/useStatePersistence.ts`, `App.tsx` (highest blast radius — last) | lint + build + full boot/fallback/persist smoke |
| 14 | **new** `hooks/usePostActions.ts`, **new** `hooks/usePostOrdering.ts`, `App.tsx` | lint + build + CRUD/reorder smoke |
| 15 | Final cutover: keyboard-shortcuts effect, leftover cleanup, size check (< 500), move any legacy leftovers to `backup_unused/` | lint + build + full manual parity checklist |

Checkpoints:
- **Auto-Pilot is not enabled** → halt after EVERY batch; wait for explicit user confirmation before the next batch.
- **> 3 batches** → after batch 3, offer a long-refactor handoff checkpoint (summary + suggested checkpoint commit + optional session restart).

### 1.5 Assumptions, fallbacks, exit conditions

- Validation gate per batch: `npm run lint` (tsc --noEmit) and `npm run build` (vite) must pass with **no new errors vs. baseline**; manual smoke via browser reload (frontend-only changes; AGENTS.md). `run_fast.bat` only if backend-affecting behavior seems broken — **never run batch files autonomously**; command is handed to the user for manual confirmation.
- Max 3 targeted repair iterations per batch. If a batch still fails → STOP, report exact failure, ask user (skill Phase 5). No resets/checkouts ever.
- Failure exit condition: any regression in the parity checklist (§1.7) that cannot be fixed within the repair budget halts the pipeline.
- Encoding: all new files written UTF-8 (buffer-safe); verify moved German strings byte-for-byte via a grep diff (see D1).
- Behavior requirements only; no reimplementation from memory — moves are verbatim copies with only the mechanical adjustments (scope changes, param injection) the extraction requires.

### 1.6 Confirmed decisions (approved by user on 2026-10-13)

- **D1 – Mojibake repair:** ✅ Repair all 5 pre-existing corrupted lines (L382, L556, L2106, L2288, L2399) when their containing code is moved; each fix is recorded in the batch changelog. AGENTS.md mandates UTF-8 discipline and 3 of them are user-visible strings.
- **D2 – Dead code:** ✅ Delete dead `FeedPostCard` import, `AdminButton`, `SortableThumbnail`, `usePortfolioSync.ts`, `hooks/index.ts`. (Not archived to `backup_unused/`.)
- **D3 – Stale usePortfolioSync:** ✅ Do NOT reuse it (outdated, duplicated, corrupted). Fresh `useScrapeSync` extraction from current App.tsx (batch 7).
- **D4 – generateHTML destination:** ✅ `src/utils/generatePortfolioHtml.ts` (with the favicon constants it uses).
- **D5 – Target size:** ✅ Land App.tsx ≤ ~480 lines (below the AGENTS.md 500-line mandatory threshold) after batch 15; stretch goal < 300 is out of scope for this run.

### 1.7 Behavior-parity checklist (Phase 4)

| # | Observable behavior | Status |
|---|---|---|
| 1 | Boot chain: embedded data → `/api/state` → Flickr test-data/R2 fallback banner + fallback toggle persisted | tested (fallback path N/A: normal boot, no fallback triggered) |
| 2 | Header meta edits (title/subtitle/bio/IG/Flickr) + unpublished-changes flag | tested (edit survives reload; flag visual = PUBLISH button shade, subtle) |
| 3 | Post CRUD: add/edit/delete/toggle hidden/state toggle | tested |
| 4 | Undo/redo (Ctrl+Z/Y, Ctrl+Shift+Z) incl. trash-key and media-delete undo via R2 trash API | tested (pre-existing quirk: first button click swallowed by blur-commit) |
| 5 | Media: image upload w/ progress, video upload (Bunny pipeline + progress text), YouTube link, remove media | unverified (real uploads skipped in this pass) |
| 6 | Multi-select (click/ctrl/shift/alt) + cross-post media drag | tested |
| 7 | Merge flow: merge similar → confirmation modal → confirm/skip | tested |
| 8 | Rearrange view: drag order, move mode, merge, bulk delete | tested |
| 9 | Scraping: IG/Flickr scrape + polling logs, uncertain-match confirm/reject, high-res sync, full R2 sync | N/A (network ops skipped by user decision) |
| 10 | Cloud sync: 15s change polling, flash, sync/ignore/cancel/apply modal flow | N/A (requires external cloud change) |
| 11 | Trash modal: open/refresh/restore/delete/permanent delete | tested (open + list + refresh; restore/delete N/A) |
| 12 | Publishing: preview, upload/publish, restore latest publish | preview tested; live publish N/A (user decision) |
| 13 | Maintenance: R2 cleanup, legacy dup cleanup, redundancy cleanup, purge bak, reset all | N/A (destructive, skipped by user decision) |
| 14 | Backups: list + restore | tested (list; restore N/A) |
| 15 | Keyboard: Ctrl+Alt+A, Ctrl+Alt+R, Escape, Ctrl+Alt+Y overlay toast | tested |
| 16 | German UI strings render correctly (no new mojibake); D1 repairs verified | tested |
| 17 | Media variants modal refresh + Cloudflare usage display | tested |

---

## 2. File Inventory (File Inventory)

| File | Action |
|---|---|
| `src/App.tsx` | Modified progressively (15 batches) → orchestrator |
| `src/types.ts` | Modified (add history types) |
| `src/utils/mediaHelpers.ts` | **New** |
| `src/utils/generatePortfolioHtml.ts` | **New** |
| `src/utils/cloudCompare.ts` | **New** |
| `src/utils/cleanPosts.ts` | **New** |
| `src/components/modals/MergeConfirmationModal.tsx` | **New** |
| `src/components/header/CloudflareUsageDisplay.tsx` | **New** |
| `src/hooks/useUndoHistory.ts` | **New** |
| `src/hooks/useMediaInteraction.ts` | **New** |
| `src/hooks/useScrapeSync.ts` | **New** |
| `src/hooks/useCloudSync.ts` | **New** |
| `src/hooks/useTrashManager.ts` | **New** |
| `src/hooks/useMediaUploads.ts` | **New** |
| `src/hooks/usePublishing.ts` | **New** |
| `src/hooks/useBackups.ts` | **New** |
| `src/hooks/useR2Maintenance.ts` | **New** |
| `src/hooks/usePortfolioInit.ts` | **New** |
| `src/hooks/useStatePersistence.ts` | **New** |
| `src/hooks/usePostActions.ts` | **New** |
| `src/hooks/usePostOrdering.ts` | **New** |
| `src/hooks/usePortfolioSync.ts`, `src/hooks/index.ts` | **Delete** (D2) |
| `docs/PLAN-REFACTOR-APP.md` | This plan |

Explicitly untouched: `src/components/*` (existing extracted UI), `src/server/*`, `src/services/*`, `src/utils/linkify.ts`, `src/utils/mergePosts.ts`, `server.ts`, all root scripts, `backups/`, `backups_app/`, `.agents/skills/deep-refactor/SKILL.md` (user's uncommitted change).

---

## 3. Risk & Complexity Check (Risk & Complexity Check)

Scale 1–10:

| Task | Complexity | Rationale |
|---|---|---|
| B1 mediaHelpers | 4 | Mechanical pure-fn moves; many call sites |
| B2 generatePortfolioHtml | 6 | ~1,070 lines of template strings; published-HTML regression surface |
| B3 cloudCompare + cleanPosts | 4 | Pure helpers inside effects |
| B4 two leaf components | 3 | Small UI moves |
| B5 useUndoHistory | 8 | Undo spans posts/trash/media-delete + R2 APIs + refs |
| B6 useMediaInteraction | 7 | Selection + merge queue + cross-post drop |
| B7 useScrapeSync | 5 | Polling handlers, clear cluster |
| B8 useCloudSync | 6 | Polling + modal flow + merge semantics |
| B9 useTrashManager | 5 | Self-contained R2 trash cluster |
| B10 useMediaUploads | 7 | Image/video/Bunny upload pipelines |
| B11 usePublishing | 6 | Preview/publish/restore-latest |
| B12 useBackups + useR2Maintenance | 5 | Self-contained clusters |
| B13 usePortfolioInit + useStatePersistence | 8 | Boot chain + persistence gating; highest blast radius |
| B14 usePostActions + usePostOrdering | 6 | Core domain handlers + dnd |
| B15 final cutover | 5 | Orchestrator assembly + parity sweep |
| **Combined execution** | **9** | Sequential dependency chains, manual-only UI coverage |

**Any task > 6 and total > 6 → PRO model required for execution.** Per `#plan` skill: the `#exec` agent acts as Implementer and MUST spawn a `pro` Reviewer subagent (Red-Teaming) before finalizing.

---

## 4. Optimization/Combination Hint (Optimization Hint)

- Batches 12 and 15 are already combined (2 new hooks / final sweep) and stay within the 3-file limit.
- **Do not combine** batches 5, 6, 13 with anything — their individual complexity is ≥ 7; combination would exceed manageable risk.
- If the user wants fewer pauses: batches 3+4 (pure utils + leaf components, joint complexity ≈ 5) and batches 7+9 (scrape + trash, joint ≈ 6) are safe to merge, but each merge exceeds the 3-file default and needs an explicitly approved exception (4 files each).
- Batch order is dependency-aware: utils/leaf components before the hooks that consume them; the two init/persistence hooks go last because they gate everything.
