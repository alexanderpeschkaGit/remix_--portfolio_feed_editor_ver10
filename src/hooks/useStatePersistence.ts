import { useEffect } from 'react';
import { cleanPostsForServer } from '../utils/cleanPosts';
import { PROJECT_STATES } from '../constants';

interface UseStatePersistenceParams {
  isInitialized: boolean;
  flickrPosts: any[];
  uploadingCount: number;
  portfolioTitle: string;
  portfolioSubtitle: string;
  portfolioBio: string;
  igAccount: string;
  flickrUrl: string;
  shouldPushStateToR2Ref: { current: boolean };
}

export function useStatePersistence({
  isInitialized,
  flickrPosts,
  uploadingCount,
  portfolioTitle,
  portfolioSubtitle,
  portfolioBio,
  igAccount,
  flickrUrl,
  shouldPushStateToR2Ref
}: UseStatePersistenceParams) {
  // Auto-save state
  useEffect(() => {
    if (isInitialized && flickrPosts.length > 0 && uploadingCount === 0) {
      // Clean state for server: remove blob URLs and image_preview
      const cleanPosts = cleanPostsForServer(flickrPosts);

      const pushToR2 = shouldPushStateToR2Ref.current;
      if (pushToR2) {
        shouldPushStateToR2Ref.current = false;
      }

      // Guard: warn if any Bunny uploads are still in progress (bunnyTaskId without videoId)
      const stuckBunnyItems = cleanPosts.flatMap((post: any) =>
        (post.mergedMedia || []).filter((m: any) => m.bunnyTaskId && !m.videoId)
      );
      if (stuckBunnyItems.length > 0) {
        console.warn(`[state-guard] Deferring save: ${stuckBunnyItems.length} Bunny upload(s) still pending videoId.`);
        // Don't save yet — the items are still in flight; polling will update them soon
        return;
      }

      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: cleanPosts, 
          title: portfolioTitle, 
          subtitle: portfolioSubtitle,
          bio: portfolioBio,
          projectStates: PROJECT_STATES,
          scrapeConfig: {
            igAccount,
            flickrUrl
          },
          pushToR2
        })
      }).catch(console.error);
    }
  }, [flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, igAccount, flickrUrl, isInitialized, uploadingCount]);
}
