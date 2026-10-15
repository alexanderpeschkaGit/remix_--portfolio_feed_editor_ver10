import { useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { uploadImageFlow } from './uploadImageFlow';
import { uploadVideoFileFlow, applyVideoLinkChange } from './uploadVideoFlow';

interface UseMediaUploadsParams {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  setError: Dispatch<SetStateAction<string>>;
  pushStatusNotice: (kind: 'success' | 'info' | 'warning', title: string, message: string) => void;
  shouldPushStateToR2Ref: MutableRefObject<boolean>;
  handlePostChange: (id: string, field: string, value: string) => void;
}

export function useMediaUploads({
  flickrPosts,
  updatePosts,
  describePost,
  setError,
  pushStatusNotice,
  shouldPushStateToR2Ref,
  handlePostChange
}: UseMediaUploadsParams) {
  const [activeUploads, setActiveUploads] = useState<Record<string, number>>({});
  const [hasUnsyncedMedia, setHasUnsyncedMedia] = useState(false);
  const [bunnyProgress, setBunnyProgress] = useState<Record<string, { step: string; progress: number; text: string }>>({});

  const handleImageUpload = async (id: string, file: File, mediaIndex?: number, isNew?: boolean) => {
    await uploadImageFlow({ flickrPosts, updatePosts, describePost, setError, pushStatusNotice, shouldPushStateToR2Ref, setActiveUploads, setHasUnsyncedMedia }, id, file, mediaIndex, isNew);
  };

  const handleVideoFileUpload = async (id: string, file: File) => {
    await uploadVideoFileFlow({ flickrPosts, updatePosts, describePost, setError, pushStatusNotice, shouldPushStateToR2Ref, setActiveUploads, setHasUnsyncedMedia, setBunnyProgress }, id, file);
  };

  const handleVideoLinkChange = (id: string, url: string) => {
    applyVideoLinkChange({ flickrPosts, updatePosts, describePost, shouldPushStateToR2Ref, handlePostChange }, id, url);
  };

  return {
    activeUploads,
    hasUnsyncedMedia,
    setHasUnsyncedMedia,
    bunnyProgress,
    handleImageUpload,
    handleVideoFileUpload,
    handleVideoLinkChange
  };
}
