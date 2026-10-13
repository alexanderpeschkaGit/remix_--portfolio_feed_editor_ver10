import { useState } from 'react';
import { generateHTML } from '../utils/generatePortfolioHtml';
import { PROJECT_STATES } from '../constants';
import { hasRenderableMedia, getMediaDedupeKey, getPrimaryMergedMedia, syncMediaFieldsFromPrimary } from '../utils/mediaHelpers';

interface UsePublishingParams {
  flickrPosts: any[];
  portfolioTitle: string;
  portfolioSubtitle: string;
  portfolioBio: string;
  publicDomain: string | null;
  R2_CONFIG: { publicDomain: string };
  igAccount: string;
  flickrUrl: string;
  setError: (v: string) => void;
  setFlickrPosts: (updater: any) => void;
  flickrPostsRef: { current: any[] };
  recordHistory: (entry: any) => void;
  setLocalLastUpdated: (v: string | null) => void;
  setHasCloudChanges: (v: boolean) => void;
  setCloudSyncState: (v: any) => void;
  setCloudSyncChanges: (v: any) => void;
  setHasUnsyncedMedia: (v: boolean) => void;
  setHasUnpublishedChanges: (v: boolean) => void;
  setIsR2Fallback: (v: boolean) => void;
  setIsFlickrFallback: (v: boolean) => void;
  setPortfolioTitle: (v: string) => void;
  setPortfolioSubtitle: (v: string) => void;
  setPortfolioBio: (v: string) => void;
  setIgAccount: (v: string) => void;
  setFlickrUrl: (v: string) => void;
}

export function usePublishing({
  flickrPosts,
  portfolioTitle,
  portfolioSubtitle,
  portfolioBio,
  publicDomain,
  R2_CONFIG,
  igAccount,
  flickrUrl,
  setError,
  setFlickrPosts,
  flickrPostsRef,
  recordHistory,
  setLocalLastUpdated,
  setHasCloudChanges,
  setCloudSyncState,
  setCloudSyncChanges,
  setHasUnsyncedMedia,
  setHasUnpublishedChanges,
  setIsR2Fallback,
  setIsFlickrFallback,
  setPortfolioTitle,
  setPortfolioSubtitle,
  setPortfolioBio,
  setIgAccount,
  setFlickrUrl
}: UsePublishingParams) {
const [restoringLatestPublish, setRestoringLatestPublish] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{url: string} | null>(null);
  const handlePreview = async () => {
    try {
      const html = generateHTML(flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, true, publicDomain || R2_CONFIG.publicDomain);
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: html })
      });
      
      if (response.ok) {
        const data = await response.json();
        window.open(`${data.url}?t=${Date.now()}`, '_blank');
      } else {
        throw new Error('Failed to generate preview');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setUploadSuccess(null);
    setError('');
    setUploadProgress(0);
    
    // Create a copy to ensure we have the current state, and filter out any empty frames
    let currentPosts = flickrPosts.map(post => {
      const cleanedPost = { ...post };
      
      // 1. Filter mergedMedia for valid items only (FIX #2b: Konsistent mit handleUpdatePostMedia)
      if (cleanedPost.mergedMedia) {
        cleanedPost.mergedMedia = cleanedPost.mergedMedia.filter(hasRenderableMedia);
        
        // If mergedMedia became empty, remove the field
        if (cleanedPost.mergedMedia.length === 0) {
          delete (cleanedPost as any).mergedMedia;
        }
      }
      
      // 2. Synchronize top-level fields with mergedMedia (Source of Truth)
      // Deduplicate mergedMedia by URL to avoid phantom/duplicate entries
      if (cleanedPost.mergedMedia && cleanedPost.mergedMedia.length > 0) {
        const seenUrls = new Set<string>();
        cleanedPost.mergedMedia = cleanedPost.mergedMedia.filter((m: any) => {
          const key = getMediaDedupeKey(m);
          if (!key) return false; // drop items without any usable URL
          if (seenUrls.has(key)) return false; // duplicate
          seenUrls.add(key);
          return true;
        });

        if (cleanedPost.mergedMedia.length === 0) {
          delete (cleanedPost as any).mergedMedia;
        } else {
          const primary = getPrimaryMergedMedia(cleanedPost.mergedMedia) || cleanedPost.mergedMedia.find(Boolean);
          syncMediaFieldsFromPrimary(cleanedPost, primary);
        }
      }
      
      // 3. Final cleanup: Remove empty strings that might be misinterpreted as "empty pictures"
      const fieldsToCleanup = ['image', 'image_thumb', 'image_1k', 'image_2k', 'image_large', 'image_3k', 'image_original', 'image_preview', 'url', 'youtubeId', 'youtubeUrl'];
      fieldsToCleanup.forEach(field => {
        if ((cleanedPost as any)[field] === '') {
          delete (cleanedPost as any)[field];
        }
      });

      return cleanedPost;
    }).filter(post => {
      // Only publish posts that have either a title, a description, or at least one piece of media
      const hasMedia = !!(post.image || post.image_thumb || post.image_1k || post.image_2k || post.image_large || post.image_preview || post.image_3k || post.image_original || (post.mergedMedia && post.mergedMedia.length > 0) || post.youtubeId || post.videoId);
      return hasMedia || post.title.trim() !== '' || post.description.trim() !== '';
    });

    // Deduplicate posts by id in case duplicates slipped in earlier
    const seenIds = new Set<string>();
    const dedupedPosts: any[] = [];
    for (const p of currentPosts) {
      const idStr = String(p.id);
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        dedupedPosts.push(p);
      } else {
        console.warn('handleUpload: duplicate post removed', idStr);
      }
    }
    currentPosts = dedupedPosts;

    console.log('handleUpload: currentPosts count:', currentPosts.length);
    console.log('handleUpload: currentPosts IDs in order:', currentPosts.map(p => p.id));
    
    try {
      const htmlContent = generateHTML(currentPosts, portfolioTitle, portfolioSubtitle, portfolioBio, false, publicDomain || R2_CONFIG.publicDomain);
      console.log('handleUpload: htmlContent generated, length:', htmlContent.length);
      
      const stateData = JSON.stringify({
        items: currentPosts,
        title: portfolioTitle,
        subtitle: portfolioSubtitle,
        bio: portfolioBio,
        projectStates: PROJECT_STATES,
        scrapeConfig: { igAccount, flickrUrl },
        lastUpdated: new Date().toISOString()
      });
      const parsedData = JSON.parse(stateData);
      setLocalLastUpdated(parsedData.lastUpdated);
      flickrPostsRef.current = currentPosts;
      setHasCloudChanges(false);
      setHasUnsyncedMedia(false);
      
      console.log('handleUpload: stateData generated, items count:', currentPosts.length);

      setUploadProgress(20);

      // Try server-side publish first (bypasses CORS)
      try {
        console.log('handleUpload: Attempting POST to /api/publish');
        const response = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            htmlContent,
            stateData,
            title: portfolioTitle,
            subtitle: portfolioSubtitle,
            bio: portfolioBio
          })
        });

        console.log('handleUpload: POST response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('handleUpload: POST response data:', data);
          setUploadProgress(100);
          setUploadSuccess({ url: data.url });
          setHasUnpublishedChanges(false);
          setLocalLastUpdated(parsedData.lastUpdated);
          setTimeout(() => setUploadProgress(null), 2000);
          setUploading(false);
          return;
        } else {
          const errorText = await response.text();
          console.error('handleUpload: POST failed, status:', response.status, 'error:', errorText);
          throw new Error(`Publish failed: ${response.status} ${errorText}`);
        }
      } catch (fetchError: any) {
        // Publishing must remain server-side so state validation cannot be bypassed.
        throw fetchError;
      }
    } catch (err: any) {
      console.error("Publish error:", err);
      setError(err.message || 'Upload fehlgeschlagen. Prüfen Sie die Cloudflare CORS-Einstellungen.');
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRestoreLatestPublish = async () => {
    if (restoringLatestPublish) return;

    const confirmed = window.confirm(
      'Das stellt das letzte veroeffentlichte HTML-Backup wieder live. Lokale Media-Dateien in R2 werden dabei nicht geloescht.\n\nFortfahren?'
    );
    if (!confirmed) return;

    setRestoringLatestPublish(true);
    setError('');
    try {
      const response = await fetch('/api/backups/restore-latest-publish', {
        method: 'POST'
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Restore fehlgeschlagen');
      }

      if (data.url) {
        setUploadSuccess({ url: data.url });
      }

      if (data.state) {
        const restoredState = data.state;
        const items = restoredState.items || [];
        setIsR2Fallback(true);
        setIsFlickrFallback(false);
        setPortfolioTitle(restoredState.title || portfolioTitle);
        setPortfolioSubtitle(restoredState.subtitle || portfolioSubtitle);
        if (restoredState.scrapeConfig) {
          if (restoredState.scrapeConfig.igAccount) setIgAccount(restoredState.scrapeConfig.igAccount);
          if (restoredState.scrapeConfig.flickrUrl) setFlickrUrl(restoredState.scrapeConfig.flickrUrl);
        }
        if (restoredState.bio) setPortfolioBio(restoredState.bio);

        setFlickrPosts(current => {
          recordHistory({ posts: current, action: `Backup wiederhergestellt (${data.restoredBackup || 'Latest Publish'})` });
          return items;
        });

        flickrPostsRef.current = items;
        if (restoredState.lastUpdated) setLocalLastUpdated(restoredState.lastUpdated);
        setCloudSyncState(null);
        setCloudSyncChanges(null);
        setHasCloudChanges(false);
        setHasUnpublishedChanges(false);
        setHasUnsyncedMedia(false);
      }
    } catch (err: any) {
      setError(err.message || 'Restore fehlgeschlagen');
    } finally {
      setRestoringLatestPublish(false);
    }
  };

  return {
    uploading,
    restoringLatestPublish,
    uploadProgress,
    uploadSuccess,
    handlePreview,
    handleUpload,
    handleRestoreLatestPublish
  };
}
