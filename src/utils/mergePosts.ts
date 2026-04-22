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
