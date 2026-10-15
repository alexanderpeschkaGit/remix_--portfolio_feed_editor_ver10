import { useCallback } from 'react';
import { hasRenderableMedia, getPrimaryMergedMedia, syncMediaFieldsFromPrimary, clearPostMediaFields } from '../utils/mediaHelpers';

interface UsePostActionsParams {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  recordHistory: (entry: any) => void;
  setHasUnpublishedChanges: (v: boolean) => void;
  setFlickrPosts: (updater: any) => void;
  setError: (v: string) => void;
  pushStatusNotice: (kind: 'success' | 'info' | 'warning', title: string, message: string) => void;
  shouldPushStateToR2Ref: { current: boolean };
  setIsEditing: (v: boolean) => void;
  selectedThumbnails: string[];
  setSelectedThumbnails: (updater: any) => void;
  setIsMoving: (v: boolean) => void;
  setLastSelectedId: (v: string | null) => void;
  handleGetLatestInstagram: (posts: any[]) => void;
  handleGetLatestFlickr: (posts: any[]) => void;
  handleCommitPostToPortfolio: (updatePosts: any, posts: any[]) => void;
}

export function usePostActions({
  flickrPosts,
  updatePosts,
  describePost,
  recordHistory,
  setHasUnpublishedChanges,
  setFlickrPosts,
  setError,
  pushStatusNotice,
  shouldPushStateToR2Ref,
  setIsEditing,
  selectedThumbnails,
  setSelectedThumbnails,
  setIsMoving,
  setLastSelectedId,
  handleGetLatestInstagram,
  handleGetLatestFlickr,
  handleCommitPostToPortfolio
}: UsePostActionsParams) {
const handleToggleHidden = (postId: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(postId)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        return { ...post, hidden: !post.hidden };
      }
      return post;
    }), `Visibility geändert (${targetTitle})`);
  };

  const handleStateToggle = (postId: string, stateId: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(postId)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        const states = post.states || [];
        const stateIdLower = String(stateId).toLowerCase();
        const hasState = states.some((s: string) => String(s).toLowerCase() === stateIdLower);
        
        const newStates = hasState 
          ? states.filter((s: string) => String(s).toLowerCase() !== stateIdLower)
          : [...states, stateId];
        return { ...post, states: newStates };
      }
      return post;
    }), `Kategorie geändert (${targetTitle})`);
  };

  const handlePostChange = (id: string, field: string, value: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(id)));
    updatePosts(posts => posts.map(post => 
      String(post.id) === String(id) ? { ...post, [field]: value } : post
    ), `Textfeld bearbeitet (${targetTitle})`);
  };

  const handleAddNewPost = () => {
    const newPost = {
      id: `custom-${Date.now()}`,
      title: '',
      description: '',
      network_name: 'Custom',
      type: 'image',
      states: []
    };
    updatePosts([newPost, ...flickrPosts], 'Neuen Post hinzugefügt (Custom)');
    setIsEditing(true);
  };

  const handleDeletePost = async (id: string) => {
    const targetPost = flickrPosts.find(p => String(p.id) === String(id));
    if (!targetPost) return;
    const targetTitle = describePost(targetPost);
    const hasMediaFiles = !!(
      targetPost.image || targetPost.image_original || targetPost.url || targetPost.image_thumb ||
      (Array.isArray(targetPost.mergedMedia) && targetPost.mergedMedia.length > 0)
    );
    const confirmMessage = hasMediaFiles
      ? `Post "${targetTitle}" wirklich löschen?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar) und die R2-Dateien werden unwiderruflich gelöscht.`
      : `Post "${targetTitle}" wirklich löschen?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch('/api/state/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Löschen fehlgeschlagen');

      const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
      const prevPosts = flickrPosts;
      recordHistory({ posts: prevPosts, bakFiles, action: `Post gelöscht (${targetTitle})` });
      setHasUnpublishedChanges(true);
      setFlickrPosts(prev => prev.filter(post => String(post.id) !== String(id)));
      if (bakFiles.length > 0) {
        pushStatusNotice('info', 'Post gelöscht', `${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      }
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten.');
    }
  };

  const handleMergeDown = useCallback((index: number) => {
    const targetTitle = describePost(flickrPosts[index]);
    updatePosts(posts => {
      const newPosts = [...posts];
      const current = newPosts[index];
      const next = newPosts[index + 1];
      
      if (!next) return posts;

      // FIX #2c: Merge-Operation - Strikte Filter-Logik
      const mergedMedia = [
        ...(current.mergedMedia || [{
          type: current.type || 'image',
          image: current.image,
          image_thumb: current.image_thumb,
          image_1k: current.image_1k,
          image_2k: current.image_2k,
          image_large: current.image_large,
          image_preview: current.image_preview,
          image_3k: current.image_3k,
          image_original: current.image_original,
          youtubeId: current.youtubeId,
          youtubeUrl: current.youtubeUrl,
          link: current.url,
          url: current.url
        }]),
        ...(next.mergedMedia || [{
          type: next.type || 'image',
          image: next.image,
          image_thumb: next.image_thumb,
          image_1k: next.image_1k,
          image_2k: next.image_2k,
          image_large: next.image_large,
          image_preview: next.image_preview,
          image_3k: next.image_3k,
          image_original: next.image_original,
          youtubeId: next.youtubeId,
          youtubeUrl: next.youtubeUrl,
          link: next.url,
          url: next.url
        }])
      ].filter(hasRenderableMedia);

      const mergedDescription = [current.description, next.description].filter(Boolean).join('<br/><br/>');
      const primaryMedia = getPrimaryMergedMedia(mergedMedia) || current;

      newPosts[index] = {
        ...current,
        ...syncMediaFieldsFromPrimary({ ...current }, primaryMedia),
        description: mergedDescription,
        mergedMedia,
      };

      newPosts.splice(index + 1, 1);
      return newPosts;
    }, `Posts zusammengeführt (${targetTitle})`);
  }, [flickrPosts, updatePosts]);

  const handleUpdatePostMedia = (id: string, newMediaRaw: any[]) => {
    // FIX #3: Strikte Filter-Logik - Phantom-Elemente entfernen
    // uploadId ist NUR während des Uploads erlaubt, danach müssen finale URLs vorhanden sein
    const newMedia = newMediaRaw.filter(hasRenderableMedia);
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(id)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        const updatedPost = { ...post, mergedMedia: newMedia };
        const primaryMedia = getPrimaryMergedMedia(newMedia);
        if (primaryMedia) {
          return {
            ...syncMediaFieldsFromPrimary(updatedPost, primaryMedia),
            mergedMedia: newMedia
          };
        }
        return updatedPost;
      }
      return post;
    }), `Post Media aktualisiert (${targetTitle})`);
    shouldPushStateToR2Ref.current = true;
  };

  const handleRemoveMedia = async (postId: string, mediaIndex: number) => {
    const targetPost = flickrPosts.find(p => String(p.id) === String(postId));
    if (!targetPost) return;
    const mergedMedia = Array.isArray(targetPost.mergedMedia) ? targetPost.mergedMedia : [];
    const mediaItems = mergedMedia.length > 0
      ? mergedMedia
      : [{ type: targetPost.type || 'image', image: targetPost.image, image_large: targetPost.image_large, youtubeId: targetPost.youtubeId, youtubeUrl: targetPost.youtubeUrl, link: targetPost.url }];
    const removedItem = mediaItems[mediaIndex];
    if (!removedItem) return;

    const isRealEntry = mergedMedia.includes(removedItem);

    // Synthesized entry (post without mergedMedia) -> keep old local-only removal.
    if (!isRealEntry) {
      handleUpdatePostMedia(postId, mediaItems.filter((_: any, idx: number) => idx !== mediaIndex));
      return;
    }

    const mediaId = removedItem?.id !== undefined && removedItem?.id !== null ? String(removedItem.id) : undefined;
    const mediaUrl =
      (typeof removedItem?.video === 'string' && removedItem.video) ||
      (typeof removedItem?.url === 'string' && removedItem.url) ||
      (typeof removedItem?.image_original === 'string' && removedItem.image_original) ||
      (typeof removedItem?.image_large === 'string' && removedItem.image_large) ||
      (typeof removedItem?.image === 'string' && removedItem.image) ||
      undefined;

    const removedLabel = removedItem.type === 'youtube' ? 'YouTube' : removedItem.type === 'bunny' ? 'Bunny-Video' : removedItem.type === 'video' ? 'Video' : 'Bild';
    if (!window.confirm(`"${removedLabel}" wirklich entfernen?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar) und die R2-Dateien werden unwiderruflich gelöscht.`)) return;

    try {
      const res = await fetch('/api/state/delete-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, mediaId, mediaIndex, mediaUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        // Server could not find the media entry (e.g. state drift) -> safe local-only removal.
        handleUpdatePostMedia(postId, mediaItems.filter((_: any, idx: number) => idx !== mediaIndex));
        return;
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Entfernen fehlgeschlagen');

      const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
      const newMedia = mediaItems.filter((_: any, idx: number) => idx !== mediaIndex).filter(hasRenderableMedia);
      const prevPosts = flickrPosts;
      const newPosts = prevPosts.map(post => {
        if (String(post.id) !== String(postId)) return post;
        const updatedPost = { ...post, mergedMedia: newMedia };
        const primaryMedia = getPrimaryMergedMedia(newMedia);
        if (primaryMedia) {
          return { ...syncMediaFieldsFromPrimary(updatedPost, primaryMedia), mergedMedia: newMedia };
        }
        if (newMedia.length === 0) {
          return clearPostMediaFields({ ...updatedPost, mergedMedia: undefined });
        }
        return updatedPost;
      });
      recordHistory({ posts: prevPosts, bakFiles, action: `Media entfernt (${removedLabel})` });
      setHasUnpublishedChanges(true);
      setFlickrPosts(newPosts);
      shouldPushStateToR2Ref.current = true;
      if (bakFiles.length > 0) {
        pushStatusNotice('info', 'Media entfernt', `${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      }
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten.');
    }
  };

  const handleMoveToTarget = (targetId: string) => {
    if (selectedThumbnails.includes(String(targetId))) return;

    const selectedPosts = flickrPosts.filter(p => selectedThumbnails.includes(String(p.id)));
    const remainingPosts = flickrPosts.filter(p => !selectedThumbnails.includes(String(p.id)));
    
    const targetIndex = remainingPosts.findIndex(p => String(p.id) === String(targetId));
    const firstTitle = describePost(selectedPosts[0]);
    
    if (targetIndex === -1) {
      // If target not found, just append to the end
      updatePosts([...remainingPosts, ...selectedPosts], `Posts verschoben (${selectedPosts.length}, u.a. ${firstTitle})`);
    } else {
      // Insert selected items AFTER the target item
      const newPosts = [
        ...remainingPosts.slice(0, targetIndex + 1),
        ...selectedPosts,
        ...remainingPosts.slice(targetIndex + 1)
      ];
      updatePosts(newPosts, `Posts verschoben (${selectedPosts.length}, u.a. ${firstTitle})`);
    }
    
    setIsMoving(false);
    setSelectedThumbnails([]);
    setLastSelectedId(null);
  };

  // Bio feature handlers (wrappers around hook functions)
  const handleAddInstagramPost = () => handleGetLatestInstagram(flickrPosts);
  const handleAddFlickrPost = () => handleGetLatestFlickr(flickrPosts);
  const handleConfirmCommitPost = () => handleCommitPostToPortfolio(updatePosts, flickrPosts);

  return {
    handleToggleHidden,
    handleStateToggle,
    handlePostChange,
    handleAddNewPost,
    handleDeletePost,
    handleMergeDown,
    handleUpdatePostMedia,
    handleRemoveMedia,
    handleMoveToTarget,
    handleAddInstagramPost,
    handleAddFlickrPost,
    handleConfirmCommitPost
  };
}
