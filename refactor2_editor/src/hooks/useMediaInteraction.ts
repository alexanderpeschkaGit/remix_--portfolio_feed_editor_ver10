import { useState } from 'react';
import { getPrimaryMergedMedia, syncMediaFieldsFromPrimary } from '../utils/mediaHelpers';

export type MediaSelection = { sourcePostId: string; mediaIndices: number[]; lastClickedIndex: number } | null;

interface UseMediaInteractionParams {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
}

export function useMediaInteraction({
  flickrPosts,
  updatePosts,
  describePost
}: UseMediaInteractionParams) {
  const [mergeQueue, setMergeQueue] = useState<any[][]>([]);
  const [currentMergeGroup, setCurrentMergeGroup] = useState<any[] | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  // Shared drag state for cross-post media movement — uses mediaIndices array (supports batch)
  const [activeMediaDrag, setActiveMediaDrag] = useState<{ sourcePostId: string; mediaIndices: number[]; mediaItem: any } | null>(null);

  const handleMediaDragStart = (sourcePostId: string, mediaIndices: number[], mediaItem: any) => {
    setActiveMediaDrag({ sourcePostId, mediaIndices, mediaItem });
  };

  const handleMediaDragEnd = () => {
    setActiveMediaDrag(null);
  };

  // Multi-selection state for Ctrl+Click / Shift+Click on media items
  const [mediaSelection, setMediaSelection] = useState<MediaSelection>(null);

  const clearMediaSelection = () => setMediaSelection(null);

  const handleMediaClick = (postId: string, mediaIndex: number, ctrlKey: boolean, shiftKey: boolean) => {
    setMediaSelection(prev => {
      if (prev && prev.sourcePostId !== postId && !ctrlKey) {
        return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
      }
      if (prev && prev.sourcePostId !== postId && ctrlKey) {
        return prev;
      }
      if (!prev) {
        return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
      }
      if (shiftKey && prev.lastClickedIndex !== null) {
        const start = Math.min(prev.lastClickedIndex, mediaIndex);
        const end = Math.max(prev.lastClickedIndex, mediaIndex);
        const range: number[] = [];
        for (let i = start; i <= end; i++) range.push(i);
        const merged = Array.from(new Set([...prev.mediaIndices, ...range])).sort((a, b) => a - b);
        return { ...prev, mediaIndices: merged, lastClickedIndex: mediaIndex };
      }
      if (ctrlKey) {
        const exists = prev.mediaIndices.includes(mediaIndex);
        const newIndices = exists
          ? prev.mediaIndices.filter(i => i !== mediaIndex)
          : [...prev.mediaIndices, mediaIndex].sort((a, b) => a - b);
        if (newIndices.length === 0) return null;
        return { ...prev, mediaIndices: newIndices, lastClickedIndex: mediaIndex };
      }
      if (prev.mediaIndices.length === 1 && prev.mediaIndices[0] === mediaIndex) {
        return null;
      }
      return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
    });
  };

  const handleMediaAltClick = (targetPostId: string, targetMediaIndex?: number) => {
    if (!mediaSelection) return;
    if (mediaSelection.sourcePostId === targetPostId) return;
    handleCrossPostMediaDrop(mediaSelection.sourcePostId, mediaSelection.mediaIndices, targetPostId, targetMediaIndex);
    clearMediaSelection();
  };

  const processNextMerge = (queue: any[][]) => {
    if (queue.length === 0) {
      setCurrentMergeGroup(null);
      setIsMergeModalOpen(false);
      return;
    }
    const nextGroup = queue[0];
    setCurrentMergeGroup(nextGroup);
    setMergeQueue(queue.slice(1));
    setIsMergeModalOpen(true);
  };

  const confirmMerge = () => {
    if (!currentMergeGroup) return;

    const group = currentMergeGroup;
    const instagramPost = group.find(p => p.network_name === 'Instagram');
    const newTitle = instagramPost ? instagramPost.title : group[0].title;
    const newDescription = group.map(p => p.description).filter(Boolean).join('\n\n\n');
    const newMedia = group.flatMap(p => p.mergedMedia || [p]);

    const newPost = {
      ...group[0],
      id: Date.now().toString() + Math.random(),
      title: newTitle,
      description: newDescription,
      mergedMedia: newMedia,
      type: 'merged'
    };

    updatePosts((prevPosts: any[]) => {
      const groupIds = new Set(group.map(p => p.id));
      const firstPostIndex = prevPosts.findIndex(p => p.id === group[0].id);

      let newPosts = prevPosts.filter(p => !groupIds.has(p.id));
      newPosts.splice(firstPostIndex, 0, newPost);
      return newPosts;
    }, `Gruppe zusammengeführt (${newTitle})`);

    processNextMerge(mergeQueue);
  };

  const skipMerge = () => {
    processNextMerge(mergeQueue);
  };

  const handleMergeSimilar = () => {
    const grouped: { [title: string]: any[] } = {};
    flickrPosts.forEach(post => {
      if (!grouped[post.title]) grouped[post.title] = [];
      grouped[post.title].push(post);
    });

    const groupsToMerge = Object.values(grouped).filter(group => group.length >= 2);
    // Sort each group by their index in flickrPosts
    groupsToMerge.forEach(group => {
      group.sort((a, b) => flickrPosts.findIndex(p => p.id === a.id) - flickrPosts.findIndex(p => p.id === b.id));
    });
    
    if (groupsToMerge.length > 0) {
      processNextMerge(groupsToMerge);
    }
  };

  const handleCrossPostMediaDrop = (sourcePostId: string, mediaIndices: number[], targetPostId: string, targetMediaIndex?: number) => {
    if (sourcePostId === targetPostId) return;
    if (!mediaIndices || mediaIndices.length === 0) return;

    const sourcePost = flickrPosts.find(p => String(p.id) === String(sourcePostId));
    const targetPost = flickrPosts.find(p => String(p.id) === String(targetPostId));
    if (!sourcePost || !targetPost) return;

    const sourceMedia = sourcePost.mergedMedia || [];
    for (const idx of mediaIndices) {
      if (idx < 0 || idx >= sourceMedia.length) return;
    }

    const sortedIndices = [...mediaIndices].sort((a, b) => a - b);
    const movedMediaItems = sortedIndices.map(i => ({ ...sourceMedia[i] }));
    const typeLabel = movedMediaItems.length === 1
      ? (movedMediaItems[0].type || 'Bild/Video')
      : `${movedMediaItems.length} Medien`;

    updatePosts((posts: any[]) => {
      return posts.map(post => {
        const postId = String(post.id);

        if (postId === String(sourcePostId)) {
          const newSourceMedia = [...(post.mergedMedia || [])];
          const descending = [...sortedIndices].sort((a, b) => b - a);
          for (const idx of descending) {
            newSourceMedia.splice(idx, 1);
          }
          const updatedPost = { ...post, mergedMedia: newSourceMedia };
          const newPrimary = newSourceMedia.length > 0 ? getPrimaryMergedMedia(newSourceMedia) : undefined;
          if (newPrimary) {
            return syncMediaFieldsFromPrimary(updatedPost, newPrimary);
          }
          return {
            ...updatedPost,
            type: 'image', image: '', image_thumb: '', image_1k: '', image_2k: '',
            image_3k: '', image_large: '', image_original: '', image_preview: '',
            url: '', youtubeId: '', youtubeUrl: '', videoId: '', libraryId: '',
            image_width: 0, image_height: 0,
          };
        }

        if (postId === String(targetPostId)) {
          const newTargetMedia = [...(post.mergedMedia || [])];
          if (targetMediaIndex !== undefined && targetMediaIndex >= 0 && targetMediaIndex <= newTargetMedia.length) {
            newTargetMedia.splice(targetMediaIndex, 0, ...movedMediaItems);
          } else {
            newTargetMedia.push(...movedMediaItems);
          }
          const updatedPost = { ...post, mergedMedia: newTargetMedia };
          const newPrimary = getPrimaryMergedMedia(newTargetMedia);
          if (newPrimary) {
            return syncMediaFieldsFromPrimary(updatedPost, newPrimary);
          }
          return updatedPost;
        }

        return post;
      });
    }, `Medienelement(e) verschoben (${typeLabel} → ${describePost(targetPost)})`);

    for (const m of movedMediaItems) {
      if (m.type === 'bunny' && m.videoId) {
        fetch('/api/bunny/update-video-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: m.videoId,
            libraryId: m.libraryId || '',
            title: targetPost.title || '',
            description: targetPost.description || '',
          }),
        }).catch(() => {});
      }
    }

    handleMediaDragEnd();
  };

  return {
    currentMergeGroup,
    isMergeModalOpen,
    activeMediaDrag,
    mediaSelection,
    clearMediaSelection,
    handleMediaDragStart,
    handleMediaDragEnd,
    handleMediaClick,
    handleMediaAltClick,
    confirmMerge,
    skipMerge,
    handleMergeSimilar,
    handleCrossPostMediaDrop
  };
}
