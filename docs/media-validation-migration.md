# Media state validation and migration

The editor now treats generated variant fields as an inventory of files that really exist. Display fallback remains allowed through legacy fields such as `image` and `image_large`; a missing `image_1k`, `image_2k`, or `image_3k` stays empty.

## Validation

Run a local-only audit first:

```powershell
cmd /c npm run media:audit -- --input data/state.json --no-network --report-json backups/migrations/portfolio-audit.json --report-text backups/migrations/portfolio-audit.txt
```

Omit `--no-network` for the pre-publish audit so declared remote assets are fetched, MIME-checked, and decoded. Exit code `2` means structural errors were found. Missing optional generated sizes are warnings and do not fail validation.

The server uses the same validator for state saves, single-item updates, restored publications, and normal publication. A structural failure returns HTTP 422 with `STATE_MEDIA_VALIDATION_FAILED` and a structured report. The browser no longer falls back to direct R2 publication after a server rejection.

## CID-Day dry run

```powershell
cmd /c npm run media:migrate -- --project-id 17746219833230.29183560407802445 --input data/state.json --backup-state backups/data/state_bak_20260427_162355 --output-state backups/migrations/cid-day-state.dry-run.json --project-output backups/migrations/cid-day-project.dry-run.json --diff-json backups/migrations/cid-day-diff.json --diff-text backups/migrations/cid-day-diff.txt
```

The migration verifies the backup order `_1`, `_3`, `_4`, `_5`, `_6`, then confirms each retained thumbnail against the canonical original using visual distance. Ambiguous identity aborts the migration. A second pass must produce an empty diff.

The default is dry-run. `data/state.json` is not changed and nothing is published. After human review, `--apply` makes a timestamped `backups/data/state_pre_media_migration_*.json` copy and replaces only the local JSON. It still does not publish.

## Complete portfolio migration

Use the deterministic portfolio migration after CID-Day has been verified:

```powershell
cmd /c npm run media:migrate-portfolio -- --input data/state.json --summary-only --output-state backups/migrations/portfolio-repair-state.dry-run.json --report-json backups/migrations/portfolio-repair-report.json --report-text backups/migrations/portfolio-repair-report.txt --manual-review backups/migrations/portfolio-manual-review.json
```

The migration only changes media URL fields and per-media width/height fields. It clears proven aliases, nominal variants below their size contract, and redundant invalid references. Dimensions are changed only when the best decoded asset has the same aspect ratio and visual identity as the display image. Ambiguous cases are left unchanged in `portfolio-manual-review.json`.

Run the candidate a second time before applying it. The idempotency run must report zero changes. `--apply` creates `backups/data/state_pre_portfolio_media_migration_*.json`, changes the local state only, and never publishes.

## Safe publication

1. Review the machine-readable and human-readable CID-Day diffs.
2. Run the candidate audit with network access.
3. If a corrected Flickr original is needed, upload it under a new `.png` R2 key; never overwrite the existing mislabeled object.
4. Apply the JSON migration locally. Confirm the automatic timestamped backup exists.
5. Publish through the editor server only. Media must be uploaded and verified before state/index references become live.
6. Download the published `state.json` and run the validator again.
7. Keep old media objects until the rollback window expires.

## Rollback

Restore the matching pre-migration JSON backup locally, validate it, and republish `state.json` and `index.html` from the same revision. New media keys can remain unreferenced during the rollback window. Do not delete or overwrite legacy media as part of rollback.

## Compatibility

- Legacy projects without v2 fields remain readable.
- Optional missing variants are warnings.
- Populated nominal variants below their promised size are errors.
- Non-image extensions, non-image MIME types, undecodable payloads, thumbnail aliases, inconsistent variant ratios, and false dimensions are errors.
- Video and YouTube records are excluded from image decoding and continue through their existing validation paths.
