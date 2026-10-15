import { useEffect, useState } from 'react';
import { getImageSrc } from '../utils/mediaHelpers';

interface UseImageDimensionsParams {
  flickrPosts: any[];
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
}

export function useImageDimensions({
  flickrPosts,
  isR2Fallback,
  isEmbeddedData,
  getDisplayImage
}: UseImageDimensionsParams) {
const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});

  const getMediaDimensionsKey = (postId: string, mediaIndex: number) => `${postId}-${mediaIndex}`;

  const setImageDimensionForKey = (key: string, width: number, height: number) => {
    setImageDimensions(prev => {
      const value = `${width} x ${height} px`;
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensionForKey(id, img.naturalWidth, img.naturalHeight);
  };
// Track Bunny upload progress per post
  useEffect(() => {
    if (!flickrPosts || flickrPosts.length === 0) return;
    const cancel = { value: false };

    flickrPosts.forEach((post) => {
      if (!post || post.id == null) return;
      const rawMedia = (post.mergedMedia && post.mergedMedia.length > 0)
        ? post.mergedMedia
        : [{ ...post, type: post.type || 'image' }];

      rawMedia.forEach((media: any, index: number) => {
        const dimensionKey = getMediaDimensionsKey(post.id, index);
        if (imageDimensions[dimensionKey]) return;

        const src = getImageSrc(media, true) || getImageSrc(media);
        if (!src) return;

        const displaySrc = getDisplayImage(src, isR2Fallback, isEmbeddedData) || src;
        const img = new Image();

        img.onload = () => {
          if (cancel.value) return;
          setImageDimensionForKey(dimensionKey, img.naturalWidth, img.naturalHeight);
        };

        img.onerror = () => {
          const fallbackSrc = getImageSrc(media) || src;
          const displayFallback = getDisplayImage(fallbackSrc, isR2Fallback, isEmbeddedData);
          if (displayFallback && displayFallback !== displaySrc) {
            img.src = displayFallback;
          }
        };

        img.src = displaySrc;
      });
    });

    return () => { cancel.value = true; };
  }, [flickrPosts, imageDimensions, isR2Fallback, isEmbeddedData]);

  return {
    imageDimensions,
    handleImageLoad,
    getMediaDimensionsKey,
    setImageDimensionForKey
  };
}
