import type React from "react";

export const isRenderableFeedMedia = (media: any): boolean => {
  if (!media) return false;
  const hasImage = !!(
    media.image ||
    media.image_thumb ||
    media.image_1k ||
    media.image_2k ||
    media.image_large ||
    media.image_preview ||
    media.image_3k ||
    media.image_original
  );
  const hasUrl = !!(media.url || media.link);
  if (media.type === "youtube")
    return !!(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
  return hasImage || hasUrl || !media.youtubeId;
};

export const isVideoMediaUrl = (url?: string): boolean =>
  !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isDirectVideoFileUrl = (value?: string): boolean =>
  !!value && /\.(mp4|webm|mov)(\?.*)?$/i.test(String(value).split("?")[0]);

export const hasRenderableImageCandidate = (
  m: any,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined,
): boolean => {
  if (!m) return false;
  const src = getImageSrc?.(m) || m?.image || m?.image_thumb || m?.image_1k;
  return !!src && !isDirectVideoFileUrl(src);
};

export const isInstagramVideoCandidate = (
  m: any,
  postSource: string | undefined,
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

export const isBildUrl = (
  url: string | undefined,
  isValidImageCandidate?: (url?: string) => boolean,
): boolean => {
  if (!url) return false;
  return isValidImageCandidate
    ? isValidImageCandidate(url)
    : !!url && !url.includes("mediadelivery.net/embed/");
};

export const getBunnyPosterSrc = (
  media: any,
  getDisplayImage: (
    url: string | undefined,
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
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
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
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

export const hasFileDrag = (e: React.DragEvent): boolean =>
  e.dataTransfer.files.length > 0 ||
  Array.from(e.dataTransfer.types || []).includes("Files");

export const isSupportedImageFile = (file: File): boolean =>
  file.type.startsWith("image/") ||
  /\.(jpe?g|png|tiff?|webp|gif|avif|bmp)$/i.test(file.name);
