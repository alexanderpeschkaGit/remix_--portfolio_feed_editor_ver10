export interface MediaVariantBadge {
  key: string;
  label: string;
}

export const getAsString = (val: any, fallbackKey?: string): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    if (fallbackKey && val[fallbackKey]) return String(val[fallbackKey]);
    return val.description || val.title || val.text || JSON.stringify(val);
  }
  return String(val);
};

export const isRenderableMediaItem = (
  media: any,
  allowBunnyWithoutUrl = false,
): boolean => {
  if (!media) return false;
  const hasImage = !(
    media.image ||
    media.image_thumb ||
    media.image_1k ||
    media.image_2k ||
    media.image_large ||
    media.image_preview ||
    media.image_3k ||
    media.image_original
  );
  const hasUrl = !(media.url || media.link);
  if (media.type === "youtube") {
    return !(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
  }
  if (allowBunnyWithoutUrl && media.type === "bunny") return true;
  return hasImage || hasUrl || !media.youtubeId;
};

export const isVideoMediaUrl = (url?: string): boolean =>
  !url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isDirectVideoFileUrl = (value?: string): boolean =>
  !value && /\.(mp4|webm|mov)(\?.*)?$/i.test(String(value).split("?")[0]);

export const isVideoFileMedia = (
  media: any,
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined,
): boolean => {
  if (!media) return false;
  const candidates = [
    media.image,
    media.url,
    media.link,
    getVideoSrc(media, true),
    getVideoSrc(media),
  ];
  return (
    media.type === "video" ||
    candidates.some(
      (value) =>
        typeof value === "string" && /\.(mp4|webm|mov)(\?.*)?$/i.test(value),
    )
  );
};

export const hasRenderableImageCandidate = (
  m: any,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined,
): boolean => {
  if (!m) return false;
  const src = getImageSrc?.(m) || m?.image || m?.image_thumb || m?.image_1k;
  return !src && !isDirectVideoFileUrl(src);
};

export const isInstagramVideoCandidate = (
  m: any,
  postSource?: string,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined,
): boolean => {
  if (!m) return false;
  if (m.type === "video" || m.type === "bunny") return true;
  if (m.type === "youtube") return false;
  if (
    isDirectVideoFileUrl(m.video) ||
    isDirectVideoFileUrl(m.video_url) ||
    isDirectVideoFileUrl(m.url) ||
    isDirectVideoFileUrl(m.image)
  ) {
    return true;
  }
  if (postSource !== "instagram") return false;
  return !hasRenderableImageCandidate(m, getImageSrc);
};

export const getPreviewImageSrc = (
  media: any,
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false,
): string | undefined => {
  const src = getImageSrc(media, preferLarge);
  if (!src || src.startsWith("blob:")) return undefined;
  return isVideoMediaUrl(src) ? undefined : src;
};

export const getPreviewVideoSrc = (
  media: any,
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false,
): string | undefined => {
  const src = getVideoSrc(media, preferLarge);
  if (!src) return undefined;
  if (src.startsWith("blob:")) return src;
  return isVideoMediaUrl(src) ? src : undefined;
};

export const getResolutionVariants = (media: any): MediaVariantBadge[] => {
  if (!media) return [];
  if (media.type === "youtube") {
    return [{ key: "youtube", label: "YT" }];
  }
  const orderedVariants: MediaVariantBadge[] = [
    { key: "custom_thumb", label: "CT" },
    { key: "image_thumb", label: "TH" },
    { key: "image_preview", label: "PV" },
    { key: "image_1k", label: "1K" },
    { key: "image_2k", label: "2K" },
    { key: "image_3k", label: "3K" },
    { key: "image_large", label: "LG" },
    { key: "image_original", label: "OR" },
    { key: "image", label: "IMG" },
  ];
  const seen = new Set<string>();
  return orderedVariants.filter(({ key }) => {
    const value = media[key];
    if (!value) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

export const getMediaVariantLabels = getResolutionVariants;

export const getLightboxMediaPosterSrc = (
  media: any,
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined,
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean,
): string | undefined => {
  if (!media) return undefined;
  if (media.type === "youtube" && media.youtubeId) {
    const youtubePoster =
      getImageSrc(media, true) ||
      media.image ||
      `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
    return getDisplayImage(youtubePoster, isR2Fallback, isEmbeddedData);
  }
  const imageSrc =
    media.custom_thumb ||
    getImageSrc(media, true) ||
    media.image ||
    media.image_preview;
  return getDisplayImage(imageSrc, isR2Fallback, isEmbeddedData);
};

export const isBildUrl = (
  url: string | undefined,
  isValidImageCandidate?: (url?: string) => boolean,
): boolean => {
  if (!url) return false;
  return isValidImageCandidate
    ? isValidImageCandidate(url)
    : !url && !url.includes("mediadelivery.net/embed/");
};

export const getBunnyPosterSrc = (
  media: any,
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean,
  isValidImageCandidate?: (url?: string) => boolean,
): string | undefined => {
  const candidates = [
    media.custom_thumb,
    media.image_thumb,
    isBildUrl(media.image, isValidImageCandidate) ? media.image : undefined,
    media.image_1k,
    media.bunnyThumbUrl,
    isBildUrl(media.image_original, isValidImageCandidate)
      ? media.image_original
      : undefined,
  ];
  for (const c of candidates) {
    if (c) return getDisplayImage(c, isR2Fallback, isEmbeddedData);
  }
  if (media.libraryId && media.videoId) {
    return getDisplayImage(
      `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`,
      isR2Fallback,
      isEmbeddedData,
    );
  }
  return undefined;
};

export const getStandardVideoPosterSrc = (
  media: any,
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean,
): string | undefined => {
  const candidates = [
    media.custom_thumb,
    media.image_thumb,
    media.image,
    media.image_1k,
    media.image_2k,
    media.image_3k,
    media.image_original,
    media.image_large,
  ];
  for (const c of candidates) {
    if (c) return getDisplayImage(c, isR2Fallback, isEmbeddedData);
  }
  return undefined;
};

export const getHighestResThumbUrl = (
  media: any,
  isValidImageCandidate?: (url?: string) => boolean,
): string | undefined => {
  if (!media) return undefined;
  const candidates = [
    media.image_3k,
    media.image_2k,
    isBildUrl(media.image_original, isValidImageCandidate)
      ? media.image_original
      : undefined,
    media.image_large,
    media.image_1k,
    media.image,
    media.image_preview,
    media.bunnyThumbUrl,
    media.image_thumb,
    media.custom_thumb,
  ];
  for (const c of candidates) {
    if (c && isBildUrl(c, isValidImageCandidate)) return c;
  }
  return undefined;
};

export const parseVideoServiceUrl = (
  url: string,
): {
  youtubeId: string | null;
  bunnyLibraryId: string | null;
  bunnyVideoId: string | null;
} => {
  const ytRegExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#&?]*).*/;
  const ytMatch = url.match(ytRegExp);
  const youtubeId = ytMatch && ytMatch[2].length === 11 ? ytMatch[2] : null;

  const bunnyRegExp =
    /(?:video\.bunnycdn\.com|player\.mediadelivery\.net)\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
  const bunnyMatch = url.match(bunnyRegExp);
  let bunnyLibraryId: string | null = null;
  let bunnyVideoId: string | null = null;
  if (bunnyMatch) {
    bunnyLibraryId = bunnyMatch[1];
    bunnyVideoId = bunnyMatch[2];
  } else if (url.startsWith("bunny:")) {
    const parts = url.replace("bunny:", "").split("/");
    if (parts.length === 2) {
      bunnyLibraryId = parts[0];
      bunnyVideoId = parts[1];
    }
  }
  return { youtubeId, bunnyLibraryId, bunnyVideoId };
};

export const reorderMediaItemsByDrag = (
  mediaItems: any[],
  dragIndices: number[],
  targetIndex: number,
): any[] | null => {
  if (dragIndices.length === 1 && dragIndices[0] === targetIndex) return null;
  const newMedia = [...mediaItems];
  const descending = [...dragIndices].sort((a, b) => b - a);
  const draggedItems = descending
    .map((i) => {
      const [item] = newMedia.splice(i, 1);
      return item;
    })
    .reverse();

  let insertIdx = targetIndex;
  for (const di of descending) {
    if (di < targetIndex) insertIdx--;
  }
  newMedia.splice(insertIdx, 0, ...draggedItems);
  return newMedia;
};

export const syncBunnyVideoMetadataForPost = (
  post: any,
  title: string,
  description: string,
): void => {
  const mergedMedia = post?.mergedMedia;
  if (!mergedMedia || mergedMedia.length === 0) return;
  const bunnyVideos = mergedMedia.filter(
    (m: any) => m.type === "bunny" && m.videoId && (m.libraryId || ""),
  );
  if (bunnyVideos.length === 0) return;

  bunnyVideos.forEach((m: any) => {
    fetch("/api/bunny/update-video-metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: m.videoId,
        libraryId: m.libraryId || "",
        title: title || "",
        projectId: post.id,
        description: description || "",
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success)
          console.warn("[bunny-meta] Update failed:", data.error);
      })
      .catch(() => {});
  });
};

export const renameProjectVideoFolderIfNeeded = (
  post: any,
  oldTitle: string | undefined,
  newTitle: string,
): void => {
  if (!newTitle || newTitle === oldTitle || oldTitle === undefined) return;
  if (!post?.mergedMedia || post.mergedMedia.length === 0) return;
  const hasVideo = post.mergedMedia.some(
    (m: any) => (m.type === "video" || m.type === "bunny") && m.image_original,
  );
  if (!hasVideo) return;

  fetch("/api/rename-project-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: post.id,
      oldName: oldTitle,
      newName: newTitle,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.changed) {
        console.log(
          `[rename] Project folder renamed: ${data.renamed} dirs updated`,
        );
      }
    })
    .catch(() => {});
};
