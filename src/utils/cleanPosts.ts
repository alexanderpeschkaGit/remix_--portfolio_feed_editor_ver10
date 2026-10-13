import { hasRenderableMedia } from './mediaHelpers';

// Server-state cleaning helpers extracted from App.tsx (deep-refactor batch 3).
export const stripBlobUrls = (obj: any, fields: string[]) => {
  for (const field of fields) {
    if (typeof obj?.[field] === 'string' && obj[field].startsWith('blob:')) {
      delete obj[field];
    }
  }
};

export const cleanPostsForServer = (flickrPosts: any[]) => {
  const cleanPosts = flickrPosts.map(post => {
    const cleanPost = { ...post };
    // Remove temporary fields before saving
    if (cleanPost.image_preview) delete cleanPost.image_preview;
    stripBlobUrls(cleanPost, [
      'image',
      'image_thumb',
      'image_1k',
      'image_2k',
      'image_3k',
      'image_large',
      'image_original',
      'url',
    ]);
    
    if (cleanPost.mergedMedia) {
      cleanPost.mergedMedia = cleanPost.mergedMedia.map((m: any) => {
        const cleanM = { ...m };
        if (cleanM.image_preview) delete cleanM.image_preview;
        stripBlobUrls(cleanM, [
          'image',
          'image_thumb',
          'image_1k',
          'image_2k',
          'image_3k',
          'image_large',
          'image_original',
          'url',
        ]);
        if (cleanM.uploadId) delete cleanM.uploadId;
        return cleanM;
      }).filter(hasRenderableMedia);
      if (cleanPost.mergedMedia.length === 0) {
        delete cleanPost.mergedMedia;
      }
    }
    return cleanPost;
  });
  return cleanPosts;
};