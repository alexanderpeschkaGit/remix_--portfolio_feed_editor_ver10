# Deep-Refactor Execution State — src/App.tsx  (UPDATED 2026-10-13 ~16:50)

SOURCE OF TRUTH: docs/PLAN-REFACTOR-APP.md (user-approved plan, decisions D1-D5).
Scratch file — do NOT commit.

## Progress: batches 1-15a DONE (commits 07ee9a5..a783401 + 6f161f2 splice tool fix)
1 mediaHelpers+types DONE  07ee9a5 | 2 generatePortfolioHtml 776c049 | 3 cloudCompare+cleanPosts 320a4d5
4 leaf components fd9b179 | 4b dead code 859ea38 | 5 useUndoHistory 79a9366 | 6 useMediaInteraction 7961c06
7 useScrapeSync a1ceb22 | 8 useCloudSync f0c371f | 9 useTrashManager f8f41fa | 10 useMediaUploads 2fe9e78
11 usePublishing 4060e1a | 12 useBackups+useR2Maintenance 4019340 | 13 usePortfolioInit+useStatePersistence 999b644
14 usePostActions+usePostOrdering 7986e80 | 15a useImageDimensions+useEditorLifecycle+import cleanup a783401
Every batch: npm run lint (tsc) + npm run build green; byte-parity verified for pure moves.
D1 mojibake repairs done: em dash, arrows, ellipsis, box-drawing divider, Bunny texts, Vorschau.
Red-team review (code-review agent, diff 3a6f390..a783401): SAFE to finalize, no blocking findings.

## BATCH 15b — IMPLEMENTED (uncommitted as of 2026-10-13 ~16:50, waiting on red-team review)
1. BASELINE: npm run test = 42/42 pass (server-side only), lint + build green (pre-existing 500 kB chunk warning).
2. FORMAT-COMPACTION: App.tsx hook-call params + JSX props densified (pure formatting). 780 -> 636 lines.
3. JSX-LEAVES: FallbackBanner.tsx, ResolutionToast.tsx extracted (props: label/isError/fallbackEnabled/onDismiss/onToggleFallback; show/resolutionsEnabled). Dead lucide imports removed (Instagram pre-existing, ImageIcon/RefreshCw/motion/AnimatePresence/X after extraction).
4. useMediaUploads.ts 637 -> 51 lines: flows moved VERBATIM (parity-checked in-script) into
   src/hooks/uploadImageFlow.ts (271) + src/hooks/uploadVideoFlow.ts (382, incl. bunnyStepLabels + link-change flow).
   Gates: lint + build + 42/42 tests green.
5. generatePortfolioHtml.ts 1095 -> 38 lines: sections moved VERBATIM into
   src/utils/portfolioHtmlParts.ts (286: favicons, post-cards builder, head, styles, data-script, body),
   src/utils/portfolioHtmlRuntimeCore.ts (438), src/utils/portfolioHtmlRuntimeLightbox.ts (381; split at renderGallery).
   BYTE-PARITY PROVEN: scripts/html-parity-fixture.ts (mocked Date) — pre/post SHA-256 identical for
   preview/publish/empty fixtures. Gates: lint + build + 42/42 tests green.
6. App.tsx FINAL SIZE: 447 lines (target <= ~480). Status-notice cluster extracted into
   src/hooks/useStatusNotice.ts + src/components/StatusNotice.tsx (pushStatusNotice signature unchanged).
7. FINAL GATE: lint + build + 42/42 tests green. Red-team review (code-review agent) running on full diff.
8. PENDING: user-led §1.7 parity checklist (17 items, browser reload), then final commit.

## Tooling notes
- scripts/splice-block.cjs: verbatim block splice (still used by earlier batches).
- scripts/html-parity-fixture.ts: deterministic byte-parity fixture for generatePortfolioHtml (keep).
- One-off decompose-*.cjs scripts were deleted after use (anchors no longer exist).
- EOL: all touched files verified uniform CRLF, UTF-8 no BOM.
- PRESERVE (user changes, do not touch): .agents/skills/deep-refactor/SKILL.md (MM), AGENTS.md (M),
  docs/PLAN-REFACTOR-APP.md (staged by user). tmp/refactor-plan-app-progress.md is scratch.