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
  setLocalLastUpdated?: (v: string | null) => void;
  isSavingRef?: { current: boolean };
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
  shouldPushStateToR2Ref,
  setLocalLastUpdated,
  isSavingRef
}: UseStatePersistenceParams) {
  // Auto-save state
  useEffect(() => {
    if (isInitialized && flickrPosts.length > 0 && uploadingCount === 0) {
      // Clean state for server: remove blob URLs and image_preview
      const cleanPosts = cleanPostsForServer(flickrPosts);

      const pushToR2 = true;
      if (shouldPushStateToR2Ref.current) {
        shouldPushStateToR2Ref.current = false;
      }

      // Guard: warn if any Bunny uploads are still in progress (bunnyTaskId without videoId)
      const stuckBunnyItems = cleanPosts.flatMap((post: any) =>
        (post.mergedMedia || []).filter((m: any) => m.bunnyTaskId && !m.videoId)
      );
      if (stuckBunnyItems.length > 0) {
        console.warn(`[state-guard] Deferring save: ${stuckBunnyItems.length} Bunny upload(s) still pending videoId.`);
        return;
      }

      const lastUpdatedIso = new Date().toISOString();
      if (isSavingRef) {
        isSavingRef.current = true;
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
          lastUpdated: lastUpdatedIso,
          pushToR2: pushToR2 ?? true
        })
      })
        .then(res => res.json())
        .then(data => {
          const savedTimestamp = data?.lastUpdated || lastUpdatedIso;
          if (setLocalLastUpdated) {
            setLocalLastUpdated(savedTimestamp);
          }
        })
        .catch(console.error)
        .finally(() => {
          if (isSavingRef) {
            isSavingRef.current = false;
          }
        });
    }
  }, [flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, igAccount, flickrUrl, isInitialized, uploadingCount]);
}
