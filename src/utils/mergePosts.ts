export function mergeIncomingPostsPreservingExisting(currentPosts: any[], incomingPosts: any[]) {
  const currentById = new Map(currentPosts.map((post) => [String(post.id), post]));
  const nextPosts: any[] = [];
  const seenIncomingIds = new Set<string>();

  for (const post of incomingPosts || []) {
    const postId = String(post?.id);
    if (seenIncomingIds.has(postId)) continue;
    seenIncomingIds.add(postId);

    const existing = currentById.get(postId);
    if (existing) {
      nextPosts.push(existing);
    } else {
      nextPosts.push(post);
    }
  }

  const preservedCurrent = currentPosts.filter((post) => !seenIncomingIds.has(String(post.id)));

  return [...nextPosts, ...preservedCurrent];
}

// Field-level merge for "Load/Merge Cloud": R2 (cloud) wins on curated text fields,
// local wins on media/local fields, and local-only posts are preserved (not deleted).
export function mergeCloudIntoLocal(localPosts: any[], cloudPosts: any[]) {
  const CLOUD_WINS_FIELDS = ['title', 'description', 'states', 'hidden'];
  const LOCAL_ONLY_KEYS = new Set([
    'mergedMedia', 'uploadId', 'image_preview', 'largeUrl',
    'url_o', 'url_l', 'url_q', 'url_sq', 'url_m',
    'local_highres', 'localUrl', 'local_large_variant',
  ]);

  const cloudById = new Map(cloudPosts.map((p: any) => [String(p?.id), p]));
  const result: any[] = [];
  const stats = { added: 0, merged: 0, keptLocal: 0, deletedInCloud: 0 };

  // Iterate local posts to preserve the human's current ordering.
  for (const local of localPosts) {
    if (local == null) {
      result.push(local);
      continue;
    }
    const cloud = cloudById.get(String(local.id));
    if (!cloud) {
      // Post exists locally but not in cloud - keep it (do NOT auto-delete).
      result.push(local);
      stats.deletedInCloud++;
      continue;
    }

    const curatedChanged = CLOUD_WINS_FIELDS.some(
      (f) => JSON.stringify(cloud[f]) !== JSON.stringify(local[f])
    );

    // Start from local (keeps media + local fields), then overlay cloud fields.
    const merged: any = { ...local };
    for (const key of Object.keys(cloud)) {
      if (LOCAL_ONLY_KEYS.has(key)) continue; // local media/local fields win
      if (cloud[key] === undefined || cloud[key] === null) continue;
      if (CLOUD_WINS_FIELDS.includes(key)) {
        merged[key] = cloud[key]; // R2 wins on curated fields
      } else if (merged[key] === undefined || merged[key] === null) {
        merged[key] = cloud[key]; // fill gaps from R2
      }
    }

    result.push(merged);
    if (curatedChanged) stats.merged++;
    else stats.keptLocal++;
  }

  // Append genuinely new cloud posts (keep cloud order for these).
  const localIds = new Set(localPosts.map((p: any) => String(p?.id)));
  for (const cloud of cloudPosts) {
    if (cloud == null || localIds.has(String(cloud.id))) continue;
    result.push(cloud);
    stats.added++;
  }

  return { posts: result, stats };
}
