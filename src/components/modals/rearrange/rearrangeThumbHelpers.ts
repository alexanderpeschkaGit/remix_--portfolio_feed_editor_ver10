export type ThumbKind = 'image' | 'video';
export type ThumbDescriptor = { kind: ThumbKind; src: string; rank: number };
export type ThumbState = { descriptor: ThumbDescriptor | null; fallbackSources: string[] };

export const isVideoUrl = (url?: string): boolean =>
  !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isValidThumbCandidate = (url?: string): boolean => {
  if (!url) return false;
  if (isVideoUrl(url)) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  return !!url.match(/\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i);
};

export const getImageCandidateValue = (media: any, key: string): any => {
  if (key === 'image_large') return media?.image_large || media?.largeUrl;
  return media?.[key];
};

export const resolveThumbState = (
  mediaList: any[],
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined
): ThumbState => {
  const fallbackSources: string[] = [];
  const fallbackSourceSet = new Set<string>();
  let bestDescriptor: ThumbDescriptor | null = null;

  const addCandidate = (src: string | undefined, rank: number, kind: ThumbKind) => {
    if (!isValidThumbCandidate(src)) return;
    const normalized = String(src);
    if (!fallbackSourceSet.has(normalized)) {
      fallbackSourceSet.add(normalized);
      fallbackSources.push(normalized);
    }
    if (!bestDescriptor || rank > bestDescriptor.rank) {
      bestDescriptor = { kind, src: normalized, rank };
    }
  };

  for (const media of mediaList) {
    if (!media) continue;

    addCandidate(getImageCandidateValue(media, 'image_thumb'), 100, 'image');
    addCandidate(getImageCandidateValue(media, 'image_preview'), 95, 'image');
    addCandidate(getImageCandidateValue(media, 'image_1k'), 90, 'image');
    addCandidate(getImageCandidateValue(media, 'image_2k'), 85, 'image');
    addCandidate(getImageCandidateValue(media, 'image_3k'), 80, 'image');
    addCandidate(getImageCandidateValue(media, 'image_large'), 75, 'image');
    addCandidate(getImageCandidateValue(media, 'image_original'), 70, 'image');
    addCandidate(getImageCandidateValue(media, 'image'), 60, 'image');
    addCandidate(getImageCandidateValue(media, 'url'), 40, 'image');
    addCandidate(getImageCandidateValue(media, 'link'), 35, 'image');

    if (!bestDescriptor && media.youtubeId) {
      const youtubeThumb = `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
      addCandidate(youtubeThumb, 30, 'image');
    }

    if (!bestDescriptor && (media.type === 'bunny' || media.videoId) && media.libraryId && media.videoId) {
      const bunnyThumb = `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`;
      addCandidate(bunnyThumb, 30, 'image');
    }
  }

  if (!bestDescriptor) {
    for (const media of mediaList) {
      const videoSrc = getVideoSrc(media, false) || getVideoSrc(media, true);
      if (videoSrc) {
        const normalized = String(videoSrc);
        fallbackSources.push(normalized);
        bestDescriptor = { kind: 'video', src: normalized, rank: 10 };
        break;
      }
    }
  }

  return { descriptor: bestDescriptor, fallbackSources };
};
