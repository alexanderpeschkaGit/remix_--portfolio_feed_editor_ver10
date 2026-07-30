// File: ./scripts/migrate-instagram-video-thumbs.ts
import fs from 'fs/promises';
import path from 'path';
import { normalizeState } from '../src/server/mediaNormalization.ts';

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const inputPath = arg('--input', 'data/state.json');
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');

  console.log(`=== Instagram Video Thumbnail Migration ===`);
  console.log(`Input state file: ${inputPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no files modified)' : 'APPLY (changes will be saved)'}`);

  const raw = await fs.readFile(inputPath, 'utf-8');
  const initialState = JSON.parse(raw);

  const { state: normalizedState, stats } = normalizeState(initialState, {
    rootDir: process.cwd(),
    checkDiskAssets: true,
  });

  console.log(`\n--- Migration Summary ---`);
  console.log(`Total Posts Scanned:                 ${stats.totalPosts}`);
  console.log(`Consolidated Single Video Posts:     ${stats.consolidatedSingleVideos}`);
  console.log(`Stripped mp4 from Image Fields:      ${stats.strippedVideoFromImageFields}`);
  console.log(`Resolved Video Thumbs from Disk:     ${stats.resolvedVideoThumbnailsOnDisk}`);
  console.log(`Inherited Post Thumbs for Clips:     ${stats.inheritedPostThumbnails}`);
  console.log(`Updated Post Types (video/carousel): ${stats.updatedPostTypes}`);

  if (apply) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join('backups', 'data');
    await fs.mkdir(backupDir, { recursive: true });

    const backupFilename = `state_pre_instagram_video_migration_${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFilename);

    await fs.writeFile(backupPath, raw, 'utf-8');
    console.log(`\n[BACKUP] Original state backed up to: ${backupPath}`);

    const formattedOutput = JSON.stringify(normalizedState, null, 2);
    await fs.writeFile(inputPath, formattedOutput, 'utf-8');
    console.log(`[SAVED] Migration changes applied successfully to: ${inputPath}`);
  } else {
    console.log(`\n[DRY RUN COMPLETE] To apply these changes, run with --apply flag:`);
    console.log(`npx tsx scripts/migrate-instagram-video-thumbs.ts --input ${inputPath} --apply`);
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
