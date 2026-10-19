import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getPostSignature } from '../utils/cloudCompare';
import { mergeCloudIntoLocal } from '../utils/mergePosts';

interface UseCloudSyncParams {
  isInitialized: boolean;
  flickrPosts: any[];
  flickrPostsRef: MutableRefObject<any[]>;
  portfolioTitleRef: MutableRefObject<string>;
  portfolioSubtitleRef: MutableRefObject<string>;
  portfolioBioRef: MutableRefObject<string>;
  getPortfolioTitle: () => string;
  getPortfolioSubtitle: () => string;
  getPortfolioBio: () => string;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setHasUnpublishedChanges: Dispatch<SetStateAction<boolean>>;
  setPortfolioTitle: (v: string) => void;
  setPortfolioSubtitle: (v: string) => void;
  setPortfolioBio: (v: string) => void;
  setIgAccount: (v: string) => void;
  setFlickrUrl: (v: string) => void;
  setIsR2Fallback: (v: boolean) => void;
  setIsFlickrFallback: (v: boolean) => void;
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  isSavingRef?: MutableRefObject<boolean>;
}

export function useCloudSync({
  isInitialized,
  flickrPosts,
  flickrPostsRef,
  portfolioTitleRef,
  portfolioSubtitleRef,
  portfolioBioRef,
  getPortfolioTitle,
  getPortfolioSubtitle,
  getPortfolioBio,
  setLoading,
  setHasUnpublishedChanges,
  setPortfolioTitle,
  setPortfolioSubtitle,
  setPortfolioBio,
  setIgAccount,
  setFlickrUrl,
  setIsR2Fallback,
  setIsFlickrFallback,
  updatePosts,
  isSavingRef
}: UseCloudSyncParams) {
const [localLastUpdated, setLocalLastUpdated] = useState<string | null>(null);
  const [hasCloudChanges, setHasCloudChanges] = useState(false);
  const ignoreCloudChangesRef = useRef(false);
  const [cloudSyncChanges, setCloudSyncChanges] = useState<string[] | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<{ changes: string[]; items: any[]; r2Data: any } | null>(null);
  // Poll for cloud changes from representation AI
  useEffect(() => {
    if (!isInitialized) return; // Wait for initialization, but poll even if localLastUpdated is missing
    
    const checkCloudChanges = async () => {
      try {
        if (isSavingRef?.current) return;
        const res = await fetch(`/api/r2-state?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const cloudData = await res.json();
          // Trigger flash if cloud has a timestamp and it differs from local, no save in progress, and cloud is newer
          const cloudLastUpdated = typeof cloudData.lastUpdated === 'string' ? cloudData.lastUpdated : null;
          const isSaveInProgress = isSavingRef?.current || false;
          const isCloudNewer = Boolean(cloudLastUpdated && (!localLastUpdated || cloudLastUpdated > localLastUpdated));
          if (cloudLastUpdated && cloudLastUpdated !== localLastUpdated && !isSaveInProgress && isCloudNewer) {
            // Validate that actual content has changed, not just the timestamp
            const cloudItems = cloudData.items || cloudData.posts || [];
            
            const headerChanged = 
              (cloudData.title && cloudData.title !== portfolioTitleRef.current) ||
              (cloudData.subtitle && cloudData.subtitle !== portfolioSubtitleRef.current) ||
              (cloudData.bio && cloudData.bio !== portfolioBioRef.current);

            const newItems = cloudItems.filter((item: any) => !flickrPostsRef.current.find((p: any) => String(p.id) === String(item.id)));
            const deletedItems = flickrPostsRef.current.filter((p: any) => !cloudItems.find((item: any) => String(item.id) === String(p.id)));
            const updatedItems = cloudItems.filter((item: any) => {
              const old = flickrPostsRef.current.find((p: any) => String(p.id) === String(item.id));
              if (!old) return false;
              return getPostSignature(old) !== getPostSignature(item);
            });

            if (headerChanged || newItems.length > 0 || deletedItems.length > 0 || updatedItems.length > 0) {
              if (!ignoreCloudChangesRef.current) {
                setHasCloudChanges(true);
              }
            } else {
              // Automatically sync the timestamp locally if content matches to avoid further polling checks
              setLocalLastUpdated(cloudLastUpdated);
            }
          }
        }
      } catch (e) {
        // ignore errors during background polling
      }
    };

    checkCloudChanges(); // Call immediately on init
    const interval = setInterval(checkCloudChanges, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [isInitialized, localLastUpdated]);

  const handleSyncFromCloudflare = async () => {
    setLoading(true);
    try {
      const r2Res = await fetch('/api/r2-state');
      if (!r2Res.ok) throw new Error('Failed to fetch from R2');
      
      const r2Data = await r2Res.json();
      
      const items = r2Data.items || r2Data.posts || [];
      if (items.length > 0) {
        const changes: string[] = [];
        
        changes.push("Merge mode: cloud edits apply to curated fields (title/description/categories/visibility); local media and local-only posts are kept.");
        if (r2Data.title && getPortfolioTitle() !== r2Data.title) changes.push(`~ Portfolio title [changed]`);
        if (r2Data.subtitle && getPortfolioSubtitle() !== r2Data.subtitle) changes.push(`~ Portfolio subtitle [changed]`);
        if (r2Data.bio && getPortfolioBio() !== r2Data.bio) changes.push(`~ Portfolio bio [changed]`);

        const newItems = items.filter((item: any) => !flickrPosts.find((p: any) => String(p.id) === String(item.id)));
        if (newItems.length > 0) {
          changes.push(`Added (${newItems.length}):`);
          newItems.forEach((item: any) => changes.push(`+ ${item.title || 'Untitled'}`));
        }
        
        const deletedItems = flickrPosts.filter((p: any) => !items.find((item: any) => String(item.id) === String(p.id)));
        if (deletedItems.length > 0) {
          changes.push(`Deleted in cloud - NOT applied (kept locally) (${deletedItems.length}):`);
          deletedItems.forEach((item: any) => changes.push(`- ${item.title || 'Untitled'}`));
        }

        const updatedItems = items.filter((item: any) => {
          const old = flickrPosts.find((p: any) => String(p.id) === String(item.id));
          if (!old) return false;
          // Simple compare omitting fields that are locally generated
          const a = { ...old, image_preview: undefined, uploadId: undefined };
          const b = { ...item, image_preview: undefined, uploadId: undefined };
          return JSON.stringify(a) !== JSON.stringify(b);
        });
        
        if (updatedItems.length > 0) {
          changes.push(`Changed (${updatedItems.length}):`);
          updatedItems.forEach((item: any) => {
            const old = flickrPosts.find((p: any) => String(p.id) === String(item.id));
            const changedFields = [];
            if (old.title !== item.title) changedFields.push('Title');
            if (old.description !== item.description) changedFields.push('Description');
            if (JSON.stringify(old.states || []) !== JSON.stringify(item.states || [])) changedFields.push('Categories');
            if (old.hidden !== item.hidden) changedFields.push('Visibility');
            
            // For media, just do a basic length check or stringify
            const oldMedia = old.mergedMedia ? old.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            const newMedia = item.mergedMedia ? item.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            if (JSON.stringify(oldMedia) !== JSON.stringify(newMedia)) changedFields.push('Media');
            
            if (changedFields.length === 0) changedFields.push('Other');
            
            changes.push(`~ ${item.title || 'Untitled'} [${changedFields.join(', ')}]`);
          });
        }

        if (changes.length === 0) {
          changes.push("No structural changes detected in posts.");
        }
        

        // Instead of applying immediately, store in pending state for confirmation
        setCloudSyncState({ 
          changes: changes.length > 0 ? changes : ["No structural changes detected in posts."], 
          items, 
          r2Data 
        });
        
        ignoreCloudChangesRef.current = false;
      }
    } catch (e) {
      console.error(e);
      alert("Failed to load from Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCloudSync = () => {
    setHasCloudChanges(false);
    setCloudSyncState(null);
    setCloudSyncChanges(null);
  };

  const handleIgnoreCloudSync = () => {
    if (cloudSyncState?.r2Data?.lastUpdated) {
      setLocalLastUpdated(cloudSyncState.r2Data.lastUpdated);
    }
    setHasCloudChanges(false);
    setCloudSyncState(null);
    setCloudSyncChanges(null);
  };

  const handleApplyCloudSync = async () => {
    if (!cloudSyncState) return;
    const { items, r2Data } = cloudSyncState;

    console.log('[Sync] User confirmed. Merging cloud data into state:', items.length, 'items');
    setIsR2Fallback(true);
    setIsFlickrFallback(false);
    setPortfolioTitle(r2Data.title || getPortfolioTitle());
    setPortfolioSubtitle(r2Data.subtitle || getPortfolioSubtitle());
    if (r2Data.scrapeConfig) {
      if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
      if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
    }
    if (r2Data.bio) setPortfolioBio(r2Data.bio);

    // Capture old posts for comparison BEFORE applying changes
    const oldPosts = flickrPostsRef.current;
    const oldPostMap = new Map(oldPosts.map((p: any) => [String(p.id), p]));

    // Merge: cloud wins on curated fields (title/description/states/hidden),
    // local wins on media/local fields and local-only posts.
    const { posts: mergedPosts, stats } = mergeCloudIntoLocal(oldPosts, items);
    updatePosts(mergedPosts, `Cloud gemerged (+${stats.added} neu, ~${stats.merged} geändert)`);

    // Absorb the cloud timestamp so polling doesn't re-flag the same change.
    if (r2Data.lastUpdated) setLocalLastUpdated(r2Data.lastUpdated);
    setHasCloudChanges(false);
    setHasUnpublishedChanges(false);

    // Sync Bunny video metadata ONLY for posts whose title or description changed
    setTimeout(() => {
      const updatedPosts = flickrPostsRef.current;
      let synced = 0;
      for (const newPost of updatedPosts) {
        const oldPost = oldPostMap.get(String(newPost.id));
        const newTitle = typeof newPost.title === 'string' ? newPost.title : (newPost.title?.title || '');
        const newDesc = typeof newPost.description === 'string' ? newPost.description : (newPost.description?.description || '');
        const oldTitle = oldPost
          ? (typeof oldPost.title === 'string' ? oldPost.title : (oldPost.title?.title || ''))
          : '';
        const oldDesc = oldPost
          ? (typeof oldPost.description === 'string' ? oldPost.description : (oldPost.description?.description || ''))
          : '';

        if (!oldPost || newTitle !== oldTitle || newDesc !== oldDesc) {
          const mergedMedia = newPost.mergedMedia;
          if (!mergedMedia || mergedMedia.length === 0) continue;
          const bunnyVideos = mergedMedia.filter((m: any) =>
            m.type === 'bunny' && m.videoId
          );
          if (bunnyVideos.length === 0) continue;

          bunnyVideos.forEach((m: any) => {
            fetch('/api/bunny/update-video-metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId: m.videoId,
                libraryId: m.libraryId || '',
                title: newTitle || '',
                projectId: newPost.id,
                description: newDesc || '',
              })
            }).then(r => r.json()).then(data => {
              if (!data.success) console.warn('[bunny-meta-cloud] Update failed for', m.videoId, data.error);
            }).catch(() => {});
          });
          synced++;
        }
      }
      console.log(`[bunny-meta-cloud] Metadata updated for ${synced} changed projects`);
    }, 500);

    try {
      // Persist the merged result locally (NOT the raw R2 payload)
      const mergedState = {
        ...r2Data,
        items: mergedPosts,
        lastUpdated: r2Data.lastUpdated || new Date().toISOString(),
      };
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedState)
      });
    } catch (saveErr) {
      console.error("Could not save merged state locally:", saveErr);
    }

    setCloudSyncState(null);
  };

  return {
    localLastUpdated,
    hasCloudChanges,
    cloudSyncChanges,
    cloudSyncState,
    ignoreCloudChangesRef,
    setLocalLastUpdated,
    setHasCloudChanges,
    setCloudSyncState,
    setCloudSyncChanges,
    handleSyncFromCloudflare,
    handleCancelCloudSync,
    handleIgnoreCloudSync,
    handleApplyCloudSync
  };
}
