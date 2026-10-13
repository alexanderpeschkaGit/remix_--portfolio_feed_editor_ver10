import { useSensors, useSensor, PointerSensor, KeyboardSensor, type DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { getPrimaryMergedMedia, syncMediaFieldsFromPrimary } from '../utils/mediaHelpers';

interface UsePostOrderingParams {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  selectedThumbnails: string[];
  setSelectedThumbnails: (updater: any) => void;
  setActiveId: (v: any) => void;
  lightboxDraggedIdx: number | null;
  setLightboxDraggedIdx: (v: number | null) => void;
  handleUpdatePostMedia: (id: string, newMediaRaw: any[]) => void;
  selectedImage: any;
  recordHistory: (entry: any) => void;
  setHasUnpublishedChanges: (v: boolean) => void;
  setFlickrPosts: (updater: any) => void;
}

export function usePostOrdering({
  flickrPosts,
  updatePosts,
  describePost,
  selectedThumbnails,
  setSelectedThumbnails,
  setActiveId,
  lightboxDraggedIdx,
  setLightboxDraggedIdx,
  handleUpdatePostMedia,
  selectedImage,
  recordHistory,
  setHasUnpublishedChanges,
  setFlickrPosts
}: UsePostOrderingParams) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(active.id)));
      updatePosts((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      }, `Post verschoben (${targetTitle})`);
    }
  };

    const handleLightboxDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setLightboxDraggedIdx(index);
  };

  const handleLightboxDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleLightboxDrop = (e: React.DragEvent, index: number, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (lightboxDraggedIdx === null || lightboxDraggedIdx === index) return;
    
    const post = flickrPosts.find(p => String(p.id) === String(postId));
    if (!post) return;
    
    const mediaItems = post.mergedMedia || [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, link: post.url }];
    const newMedia = [...mediaItems];
    const [draggedItem] = newMedia.splice(lightboxDraggedIdx, 1);
    newMedia.splice(index, 0, draggedItem);
    
    handleUpdatePostMedia(postId, newMedia);
    setLightboxDraggedIdx(null);
  };

  const currentLightboxPost = selectedImage ? (flickrPosts.find(p => String(p.id) === String(selectedImage.id)) || selectedImage) : null;

  const handleMerge = async () => {
    if (selectedThumbnails.length < 2) return;
    
    const postsToMerge = flickrPosts.filter(p => selectedThumbnails.includes(String(p.id)));
    // Sort them by their current order in the feed
    postsToMerge.sort((a, b) => {
      return flickrPosts.indexOf(a) - flickrPosts.indexOf(b);
    });

    const mainPost = { ...postsToMerge[0] };
    const otherPosts = postsToMerge.slice(1);

    // Combine text
    let combinedDescription = mainPost.description || "";
    for (const post of otherPosts) {
      if (post.title || post.description) {
        combinedDescription += "\n\n──────────────────────────────\n\n";
        if (post.title) combinedDescription += `<strong>${post.title}</strong>\n\n`;
        if (post.description) combinedDescription += post.description;
      }
    }
    mainPost.description = combinedDescription;

    if (!mainPost.mergedMedia) mainPost.mergedMedia = [];
    
    // Add main post's own media to mergedMedia if it's not already there
    const mainMedia = {
      id: mainPost.id,
      type: mainPost.type || 'image',
      image: mainPost.image,
      image_large: mainPost.image_large,
      url: mainPost.url,
      phash: mainPost.phash,
      youtubeId: mainPost.youtubeId
    };
    
    // Check if mainMedia is already in mergedMedia
    const alreadyPresent = mainPost.mergedMedia.some((m: any) => m.id === mainPost.id);
    if (!alreadyPresent) {
      mainPost.mergedMedia = [mainMedia, ...mainPost.mergedMedia];
    }

    // Add other posts' media
    for (const post of otherPosts) {
      if (post.mergedMedia && post.mergedMedia.length > 0) {
        mainPost.mergedMedia = [...mainPost.mergedMedia, ...post.mergedMedia];
      } else {
        mainPost.mergedMedia.push({
          id: post.id,
          type: post.type || 'image',
          image: post.image,
          image_large: post.image_large,
          url: post.url,
          phash: post.phash,
          youtubeId: post.youtubeId
        });
      }
    }

    const primaryMedia = getPrimaryMergedMedia(mainPost.mergedMedia) || mainPost;
    syncMediaFieldsFromPrimary(mainPost, primaryMedia);

    updatePosts(prev => {
      const filtered = prev.filter(p => !selectedThumbnails.includes(String(p.id)) || String(p.id) === String(mainPost.id));
      return filtered.map(p => String(p.id) === String(mainPost.id) ? mainPost : p);
    }, `Posts zusammengeführt (${describePost(mainPost)})`);

    // Stay in rearrange mode and select the newly merged post
    setSelectedThumbnails([String(mainPost.id)]);
  };

  const handleBulkDelete = async () => {
    if (selectedThumbnails.length === 0) return;

    const confirmDelete = window.confirm(`Bist du sicher, dass du ${selectedThumbnails.length} Element(e) löschen möchtest?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar), R2-Dateien werden unwiderruflich gelöscht.`);
    if (!confirmDelete) return;

    try {
      const idsToDelete = selectedThumbnails.map(id => String(id));
      const prevPosts = flickrPosts;
      const res = await fetch('/api/state/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });

      const data = await res.json();
      if (data.success) {
        const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
        recordHistory({ posts: prevPosts, bakFiles, action: `${idsToDelete.length} Posts gelöscht` });
        setHasUnpublishedChanges(true);
        setFlickrPosts(prev => prev.filter(post => !idsToDelete.includes(String(post.id))));
        setSelectedThumbnails([]);
        alert(`${data.deletedCount} Element(e) gelöscht. ${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      } else {
        alert('Fehler beim Löschen: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Ein Fehler ist aufgetreten.');
    }
  };

  return {
    sensors,
    handleDragEnd,
    handleLightboxDragStart,
    handleLightboxDragOver,
    handleLightboxDrop,
    currentLightboxPost,
    handleMerge,
    handleBulkDelete
  };
}
