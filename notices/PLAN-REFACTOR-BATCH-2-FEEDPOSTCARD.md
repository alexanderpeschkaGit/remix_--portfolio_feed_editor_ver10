# PLAN — Refactor Batch 2: FeedPostCard.tsx & Architektur-Doku

## Kontext & Ziel

Aufbrechen des größten verbleibenden Frontend-Monolithen src/components/feed/FeedPostCard.tsx (~1.080 Zeilen) in 6 fokussierte, strikt typisierte Module (jedes unter 260 Zeilen) sowie Synchronisation von .agents/rules/app-architecture.md.

**Voraussetzung:** Batch 1 (PLAN-REFACTOR-BATCH-1-MODALS.md, insbesondere src/utils/kiEditClient.ts) wurde bereits angewendet. Die öffentliche Export-Signatur export function FeedPostCard und alle Props bleiben **100 % unverändert** (ThumbnailGalleryGrid.tsx benötigt keinerlei Anpassung).

## Ausführung in Antigravity (#delegate + #flash)

1. Schreibe alle unten aufgeführten Dateien **exakt 1:1 (ohne Auslassungen)** mit write_to_file an ihre jeweiligen Zielpfade.
2. Aktualisiere .agents/rules/app-architecture.md wie in Abschnitt 7 angegeben.
3. Führe danach im **Single-Action-Protokoll** (jeweils einzeln, auf Output warten) folgende Verifikations-Befehle aus:
   - npm run lint
   - npm test
   - npm run build

-----

## 1. Neue Datei: src/components/feed/post-card/feedPostMediaHelpers.ts (~120 Zeilen)

Reine (React-freie) Hilfsfunktionen für Media-Erkennung, Poster-Auflösung und Drag-Checks innerhalb einer FeedPostCard.

// src/components/feed/post-card/feedPostMediaHelpers.ts

import type React from 'react';

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
  if (media.type === 'youtube') return !!(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
  return hasImage || hasUrl || !media.youtubeId;
};

export const isVideoMediaUrl = (url?: string): boolean =>
  !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isDirectVideoFileUrl = (value?: string): boolean =>
  !!value && /\.(mp4|webm|mov)(\?.*)?$/i.test(String(value).split('?')[0]);

export const hasRenderableImageCandidate = (
  m: any,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined
): boolean => {
  if (!m) return false;
  const src = getImageSrc?.(m) || m?.image || m?.image_thumb || m?.image_1k;
  return !!src && !isDirectVideoFileUrl(src);
};

export const isInstagramVideoCandidate = (
  m: any,
  postSource: string | undefined,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined
): boolean => {
  if (!m) return false;
  if (m.type === 'video' || m.type === 'bunny') return true;
  if (m.type === 'youtube') return false;
  if (
    isDirectVideoFileUrl(m.video) ||
    isDirectVideoFileUrl(m.video_url) ||
    isDirectVideoFileUrl(m.url) ||
    isDirectVideoFileUrl(m.image)
  ) {
    return true;
  }
  if (postSource !== 'instagram') return false;
  return !hasRenderableImageCandidate(m, getImageSrc);
};

export const getPreviewImageSrc = (
  media: any,
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false
): string | undefined => {
  const src = getImageSrc(media, preferLarge);
  if (!src || src.startsWith('blob:')) return undefined;
  return isVideoMediaUrl(src) ? undefined : src;
};

export const getPreviewVideoSrc = (
  media: any,
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false
): string | undefined => {
  const src = getVideoSrc(media, preferLarge);
  if (!src) return undefined;
  if (src.startsWith('blob:')) return src;
  return isVideoMediaUrl(src) ? src : undefined;
};

export const isBildUrl = (
  url: string | undefined,
  isValidImageCandidate?: (url?: string) => boolean
): boolean => {
  if (!url) return false;
  return isValidImageCandidate
    ? isValidImageCandidate(url)
    : !!url && !url.includes('mediadelivery.net/embed/');
};

export const getBunnyPosterSrc = (
  media: any,
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean,
  isValidImageCandidate?: (url?: string) => boolean
): string | undefined => {
  const candidates = [
    media.custom_thumb,
    media.image_thumb,
    isBildUrl(media.image, isValidImageCandidate) ? media.image : undefined,
    media.image_1k,
    media.bunnyThumbUrl,
    isBildUrl(media.image_original, isValidImageCandidate) ? media.image_original : undefined,
  ];
  for (const c of candidates) {
    if (c) return getDisplayImage(c, isR2Fallback, isEmbeddedData);
  }
  if (media.libraryId && media.videoId) {
    return getDisplayImage(
      `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`,
      isR2Fallback,
      isEmbeddedData
    );
  }
  return undefined;
};

export const getStandardVideoPosterSrc = (
  media: any,
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean
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
  isValidImageCandidate?: (url?: string) => boolean
): string | undefined => {
  if (!media) return undefined;
  const candidates = [
    media.image_3k,
    media.image_2k,
    isBildUrl(media.image_original, isValidImageCandidate) ? media.image_original : undefined,
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
  e.dataTransfer.files.length > 0 || Array.from(e.dataTransfer.types || []).includes('Files');

export const isSupportedImageFile = (file: File): boolean =>
  file.type.startsWith('image/') || /\.(jpe?g|png|tiff?|webp|gif|avif|bmp)$/i.test(file.name);

-----

## 2. Neue Datei: src/hooks/useFeedCardFileDrop.ts (~175 Zeilen)

Kapselt Datei-Drag-&-Drop auf Karten-Ebene, Datei-Input-Importe und die Phasen-Übergänge des Upload-Banners (hover -> preparing -> uploading -> done).

// src/hooks/useFeedCardFileDrop.ts

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasFileDrag, isSupportedImageFile } from '../components/feed/post-card/feedPostMediaHelpers';

export interface CardUploadStatus {
  phase: 'hover' | 'preparing' | 'uploading' | 'done' | 'error';
  message: string;
  count?: number;
}

interface UseFeedCardFileDropParams {
  postId: string;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  activeMediaDrag: { sourcePostId: string; mediaIndices: number[]; mediaItem: any } | null;
  handleImageUpload: (postId: string, file: File, mediaIndex?: number, isNew?: boolean) => void;
  handleVideoFileUpload: (postId: string, file: File) => void;
  onCrossPostMediaDrop: (
    sourcePostId: string,
    mediaIndices: number[],
    targetPostId: string,
    targetMediaIndex?: number
  ) => void;
}

export function useFeedCardFileDrop({
  postId,
  isEditing,
  activeUploads,
  activeMediaDrag,
  handleImageUpload,
  handleVideoFileUpload,
  onCrossPostMediaDrop,
}: UseFeedCardFileDropParams) {
  const [isMediaDragOvered, setIsMediaDragOvered] = useState(false);
  const [isFileDragOverCard, setIsFileDragOverCard] = useState(false);
  const cardDragDepthRef = useRef(0);
  const uploadStatusTimerRef = useRef<number | null>(null);
  const [cardUploadStatus, setCardUploadStatus] = useState<CardUploadStatus | null>(null);

  useEffect(() => {
    if (!isEditing) {
      cardDragDepthRef.current = 0;
      setIsFileDragOverCard(false);
      setCardUploadStatus(null);
    }
  }, [isEditing]);

  const showCardFileDropTarget = () => {
    setIsFileDragOverCard(true);
    setCardUploadStatus((prev) => {
      if (prev?.phase === 'preparing' || prev?.phase === 'uploading' || prev?.phase === 'hover') {
        return prev;
      }
      return {
        phase: 'hover',
        message: 'Dateien hier ablegen, um in dieses Projekt hochzuladen.',
      };
    });
  };

  const clearCardDragState = useCallback(() => {
    cardDragDepthRef.current = 0;
    setIsFileDragOverCard(false);
    setCardUploadStatus((prev) => (prev?.phase === 'hover' ? null : prev));
  }, []);

  const clearUploadStatusLater = useCallback((delay = 2200) => {
    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
    }
    uploadStatusTimerRef.current = window.setTimeout(() => {
      setCardUploadStatus(null);
      uploadStatusTimerRef.current = null;
    }, delay);
  }, []);

  useEffect(() => {
    const handleWindowDragEnd = () => clearCardDragState();
    const handleWindowDrop = () => clearCardDragState();
    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [clearCardDragState]);

  useEffect(() => {
    return () => {
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
      }
    };
  }, []);

  const queueDroppedFiles = (files: File[], sourceLabel: string) => {
    if (!isEditing) return;
    const filteredFiles = files.filter((file) => isSupportedImageFile(file) || file.type.startsWith('video/'));
    if (filteredFiles.length === 0) return;
    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
      uploadStatusTimerRef.current = null;
    }
    setCardUploadStatus({
      phase: 'preparing',
      message: `${filteredFiles.length} Datei${
        filteredFiles.length === 1 ? '' : 'en'
      } werden vorbereitet (${sourceLabel})…`,
      count: filteredFiles.length,
    });
    filteredFiles.forEach((file, index) => {
      window.setTimeout(() => {
        if (file.type.startsWith('video/')) {
          handleVideoFileUpload(postId, file);
        } else {
          handleImageUpload(postId, file, undefined, true);
        }
      }, index * 100);
    });
  };

  const handleCardDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current += 1;
    showCardFileDropTarget();
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setIsMediaDragOvered(true);
      return;
    }
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    showCardFileDropTarget();
  };

  const handleCardDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    setIsMediaDragOvered(false);
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current = Math.max(0, cardDragDepthRef.current - 1);
    if (cardDragDepthRef.current === 0) {
      setIsFileDragOverCard(false);
    }
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      setIsMediaDragOvered(false);
      onCrossPostMediaDrop(activeMediaDrag.sourcePostId, activeMediaDrag.mediaIndices, postId, undefined);
      return;
    }
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    clearCardDragState();
    queueDroppedFiles(Array.from(e.dataTransfer.files), 'Drag & Drop');
  };

  useEffect(() => {
    const uploadingCount = activeUploads[postId] || 0;
    if (!cardUploadStatus) return;
    if (cardUploadStatus.phase === 'preparing' && uploadingCount > 0) {
      setCardUploadStatus((prev) =>
        prev
          ? {
              ...prev,
              phase: 'uploading',
              message: `${uploadingCount} Datei${uploadingCount === 1 ? '' : 'en'} werden hochgeladen…`,
            }
          : prev
      );
      return;
    }
    if (cardUploadStatus.phase === 'uploading') {
      if (uploadingCount > 0) {
        setCardUploadStatus((prev) =>
          prev
            ? {
                ...prev,
                message: `${uploadingCount} Datei${uploadingCount === 1 ? '' : 'en'} werden hochgeladen…`,
              }
            : prev
        );
        return;
      }
      setCardUploadStatus({
        phase: 'done',
        message: 'Gespeichert und für R2 synchronisiert.',
        count: cardUploadStatus.count,
      });
      clearUploadStatusLater();
    }
  }, [activeUploads, cardUploadStatus, clearUploadStatusLater, postId]);

  const handleImportInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: string,
    options: { kind: 'image' | 'video'; mediaIndex?: number; isNew?: boolean }
  ) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (options.kind === 'video') {
      queueDroppedFiles(files, sourceLabel);
    } else {
      if (!isEditing) return;
      const filteredFiles = files.filter(isSupportedImageFile);
      if (filteredFiles.length === 0) return;
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
        uploadStatusTimerRef.current = null;
      }
      setCardUploadStatus({
        phase: 'preparing',
        message: `${filteredFiles.length} Datei${
          filteredFiles.length === 1 ? '' : 'en'
        } werden vorbereitet (${sourceLabel})…`,
        count: filteredFiles.length,
      });
      filteredFiles.forEach((file, index) => {
        window.setTimeout(() => {
          handleImageUpload(postId, file, options.mediaIndex, options.isNew);
        }, index * 100);
      });
    }
    e.target.value = '';
  };

  return {
    isMediaDragOvered,
    setIsMediaDragOvered,
    isFileDragOverCard,
    cardUploadStatus,
    handleCardDragEnter,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
    handleImportInputChange,
  };
}

-----

## 3. Neue Datei: src/hooks/useFeedCardMediaActions.ts (~250 Zeilen)

Verwaltet Media-Mutationen (addMedia, removeMedia, applyUrlToMedia), Custom-Thumbnail-Upload & Modal-Auflösung, Hover-Preview-Popover (inkl. Bunny-Auflösungs-Cache) sowie Intra-/Cross-Post-Media-Drag.

// src/hooks/useFeedCardMediaActions.ts

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { hasFileDrag } from '../components/feed/post-card/feedPostMediaHelpers';

interface UseFeedCardMediaActionsParams {
  postId: string;
  mediaItems: any[];
  mediaItemsRef: React.MutableRefObject<any[]>;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  handleRemoveMedia: (postId: string, mediaIndex: number) => void;
  activeMediaDrag: { sourcePostId: string; mediaIndices: number[]; mediaItem: any } | null;
  onMediaDragStart: (sourcePostId: string, mediaIndices: number[], mediaItem: any) => void;
  onMediaDragEnd: () => void;
  onCrossPostMediaDrop: (
    sourcePostId: string,
    mediaIndices: number[],
    targetPostId: string,
    targetMediaIndex?: number
  ) => void;
  mediaSelection: { sourcePostId: string; mediaIndices: number[]; lastClickedIndex: number } | null;
  setIsMediaDragOvered: (v: boolean) => void;
}

export function useFeedCardMediaActions({
  postId,
  mediaItems,
  mediaItemsRef,
  isR2Fallback,
  isEmbeddedData,
  getDisplayImage,
  getVideoSrc,
  handleUpdatePostMedia,
  handleRemoveMedia,
  activeMediaDrag,
  onMediaDragStart,
  onMediaDragEnd,
  onCrossPostMediaDrop,
  mediaSelection,
  setIsMediaDragOvered,
}: UseFeedCardMediaActionsParams) {
  const [applyLoading, setApplyLoading] = useState<Record<number, boolean>>({});
  const [customThumbnailMedia, setCustomThumbnailMedia] = useState<{ media: any; index: number } | null>(null);
  const [customThumbnailVideoUrl, setCustomThumbnailVideoUrl] = useState<string>('');
  const [customThumbnailLoading, setCustomThumbnailLoading] = useState(false);
  const [thumbFileState, setThumbFileState] = useState<Record<number, 'idle' | 'uploading' | 'done' | 'error'>>({});
  const [hoverPreview, setHoverPreview] = useState<{ media: any; index: number } | null>(null);
  const [hoverPreviewLoading, setHoverPreviewLoading] = useState(false);
  const [bunnyResolutions, setBunnyResolutions] = useState<Record<string, any | null>>({});
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const hoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const [localUrlInputs, setLocalUrlInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    return () => {
      if (hoverPreviewTimerRef.current) window.clearTimeout(hoverPreviewTimerRef.current);
      if (hoverPreviewCloseTimerRef.current) window.clearTimeout(hoverPreviewCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hoverPreview || !popoverPos) {
      hoverPreviewRef.current = null;
      return;
    }
    const el = hoverPreviewRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = popoverPos.left;
    let top = popoverPos.top;
    if (left + rect.width > vw - margin) left = Math.max(margin, vw - rect.width - margin);
    if (top + rect.height > vh - margin) top = Math.max(margin, vh - rect.height - margin);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [hoverPreview, popoverPos, bunnyResolutions, hoverPreviewLoading]);

  const cancelHoverPreviewCloseTimer = () => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  };

  const handleHoverPreviewEnter = (media: any, i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 6, left: rect.left });
    setHoverPreview({ media, index: i });
    cancelHoverPreviewCloseTimer();
    if (media.libraryId && media.videoId) {
      const cacheKey = `${media.libraryId}/${media.videoId}`;
      if (!(cacheKey in bunnyResolutions)) {
        setHoverPreviewLoading(true);
        fetch('/api/bunny/video-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: media.libraryId, videoId: media.videoId }),
        })
          .then((res) => res.json())
          .then((data) => {
            setBunnyResolutions((prev) => ({
              ...prev,
              [cacheKey]: data?.success
                ? {
                    availableResolutions: data.availableResolutions ?? null,
                    width: data.width ?? 0,
                    height: data.height ?? 0,
                    length: data.length ?? 0,
                  }
                : null,
            }));
          })
          .catch((err) => {
            console.error('Failed to fetch bunny resolutions:', err);
            setBunnyResolutions((prev) => ({ ...prev, [cacheKey]: null }));
          })
          .finally(() => setHoverPreviewLoading(false));
      }
    }
  };

  const handleHoverPreviewLeave = () => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
    }
    hoverPreviewCloseTimerRef.current = window.setTimeout(() => {
      setHoverPreview(null);
      setPopoverPos(null);
      hoverPreviewCloseTimerRef.current = null;
    }, 150);
  };

  const handleThumbFileUpload = (e: React.ChangeEvent<HTMLInputElement>, mediaIndex: number) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isJpgPng = /\.(jpe?g|png)$/i.test(file.name) || file.type === 'image/jpeg' || file.type === 'image/png';
    if (!isJpgPng) {
      alert('Bitte eine JPG- oder PNG-Datei als Thumbnail auswählen.');
      return;
    }
    setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'uploading' }));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch('/api/upload-custom-thumb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: reader.result, postId, mediaIndex }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Upload fehlgeschlagen');
        const newMedia = [...mediaItems];
        const current = newMedia[mediaIndex] || {};
        const isBunny = current.type === 'bunny' || (!!current.videoId && !!current.libraryId);
        newMedia[mediaIndex] = {
          ...current,
          custom_thumb: data.image_thumb,
          image_thumb: data.image_thumb,
          image_1k: data.image_1k,
          image_2k: data.image_2k,
          image_3k: data.image_3k,
          image_original: isBunny
            ? `https://iframe.mediadelivery.net/embed/${current.libraryId}/${current.videoId}`
            : data.image_original,
          image_width: data.image_width,
          image_height: data.image_height,
        };
        handleUpdatePostMedia(postId, newMedia);
        setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'done' }));
        window.setTimeout(() => {
          setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'idle' }));
        }, 1500);
      } catch (err: any) {
        console.error('Custom-Thumbnail-Upload fehlgeschlagen:', err);
        alert(err.message || 'Custom-Thumbnail-Upload fehlgeschlagen.');
        setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'error' }));
        window.setTimeout(() => {
          setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'idle' }));
        }, 2500);
      }
    };
    reader.onerror = () => {
      alert('Die Datei konnte nicht gelesen werden.');
      setThumbFileState((prev) => ({ ...prev, [mediaIndex]: 'idle' }));
    };
    reader.readAsDataURL(file);
  };

  const openCustomThumbnailModal = async (media: any, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomThumbnailLoading(true);
    try {
      if (media.libraryId && media.videoId) {
        const res = await fetch('/api/bunny/video-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ libraryId: media.libraryId, videoId: media.videoId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to get Bunny video URL');
        setCustomThumbnailVideoUrl(data.videoUrl);
      } else {
        const res = await fetch('/api/video/resolve-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId, index, media }),
        });
        const data = await res.json();
        let videoSrc = '';
        if (data.success && data.videoUrl) {
          videoSrc = data.videoUrl;
        } else {
          videoSrc = getVideoSrc(media, true) || getVideoSrc(media) || media.url || '';
        }
        if (!videoSrc) {
          throw new Error(data.error || 'No playable video source found for this item.');
        }
        setCustomThumbnailVideoUrl(videoSrc);
      }
      setCustomThumbnailMedia({ media, index });
    } catch (err: any) {
      console.error('Failed to open custom thumbnail modal:', err);
      alert(err.message || 'Could not open video for custom thumbnail.');
    } finally {
      setCustomThumbnailLoading(false);
    }
  };

  const handleCustomThumbnailSave = (variantUrls: {
    image_thumb: string;
    image_1k: string;
    image_2k: string;
    image_3k: string;
    image_original: string;
    image_width: number;
    image_height: number;
  }) => {
    if (!customThumbnailMedia) return;
    const newMedia = [...mediaItems];
    const idx = customThumbnailMedia.index;
    const current = newMedia[idx] || {};
    const isBunny = current.type === 'bunny' || (!!current.videoId && !!current.libraryId);
    newMedia[idx] = {
      ...current,
      custom_thumb: variantUrls.image_thumb,
      image_thumb: variantUrls.image_thumb,
      image_1k: variantUrls.image_1k,
      image_2k: variantUrls.image_2k,
      image_3k: variantUrls.image_3k,
      image_original: isBunny
        ? `https://iframe.mediadelivery.net/embed/${current.libraryId}/${current.videoId}`
        : variantUrls.image_original,
      image_width: variantUrls.image_width,
      image_height: variantUrls.image_height,
    };
    handleUpdatePostMedia(postId, newMedia);
  };

  const removeMedia = (i: number) => {
    handleRemoveMedia(postId, i);
  };

  const addMedia = (type: 'image' | 'youtube' | 'bunny') => {
    const newMedia = [{ type, image: '', image_large: '', link: '', youtubeId: '', youtubeUrl: '' }, ...mediaItems];
    handleUpdatePostMedia(postId, newMedia);
  };

  const applyUrlToMedia = (i: number, urlString: string) => {
    const url = urlString.trim();
    if (!url) return;
    const media = mediaItems[i];
    if (!media) return;
    setApplyLoading((prev) => ({ ...prev, [i]: true }));

    if (media.type === 'bunny' && media.videoId && media.libraryId) {
      const existingVidId = media.videoId;
      const existingLibId = media.libraryId;
      fetch('/api/bunny/sync-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: existingLibId, videoId: existingVidId }),
      })
        .then((res) => res.json())
        .then((data) => {
          setApplyLoading((prev) => ({ ...prev, [i]: false }));
          if (data.success) {
            const syncedMedia = [...mediaItemsRef.current];
            const targetIdx = syncedMedia.findIndex((m) => m && m.videoId === existingVidId);
            const idx = targetIdx !== -1 ? targetIdx : i;
            syncedMedia[idx] = {
              ...syncedMedia[idx],
              type: 'bunny',
              videoId: existingVidId,
              libraryId: existingLibId,
              url: `https://iframe.mediadelivery.net/embed/${existingLibId}/${existingVidId}`,
              image_original: `https://iframe.mediadelivery.net/embed/${existingLibId}/${existingVidId}`,
              image: data.image_2k || data.image_3k || data.image_1k || data.image_thumb || data.image || '',
              image_thumb: data.image_thumb || data.image || '',
              image_1k: data.image_1k || '',
              image_2k: data.image_2k || '',
              image_3k: data.image_3k || '',
              bunnyThumbUrl:
                data.bunnyThumbUrl || `https://iframe.mediadelivery.net/${existingLibId}/${existingVidId}/thumbnail.jpg`,
              duration: data.duration || media.duration || 0,
              image_width: data.image_width || media.image_width || 0,
              image_height: data.image_height || media.image_height || 0,
            };
            handleUpdatePostMedia(postId, syncedMedia);
          }
        })
        .catch(() => setApplyLoading((prev) => ({ ...prev, [i]: false })));
      return;
    }

    const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#&?]*).*/;
    const ytMatch = url.match(ytRegExp);
    const youtubeId = ytMatch && ytMatch[2].length === 11 ? ytMatch[2] : null;

    const bunnyRegExp = /(?:video\.bunnycdn\.com|player\.mediadelivery\.net)\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
    const bunnyMatch = url.match(bunnyRegExp);
    let bunnyLibraryId: string | null = null;
    let bunnyVideoId: string | null = null;
    if (bunnyMatch) {
      bunnyLibraryId = bunnyMatch[1];
      bunnyVideoId = bunnyMatch[2];
    } else if (url.startsWith('bunny:')) {
      const parts = url.replace('bunny:', '').split('/');
      if (parts.length === 2) {
        bunnyLibraryId = parts[0];
        bunnyVideoId = parts[1];
      }
    }

    if (bunnyLibraryId && bunnyVideoId) {
      const embedUrl = `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`;
      const bunnyThumbUrl = `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`;
      const newMedia = [...mediaItemsRef.current];
      newMedia[i] = {
        ...media,
        type: 'bunny',
        libraryId: bunnyLibraryId,
        videoId: bunnyVideoId,
        url: embedUrl,
        image_original: embedUrl,
        bunnyThumbUrl,
      };
      handleUpdatePostMedia(postId, newMedia);
      fetch('/api/bunny/sync-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: bunnyLibraryId, videoId: bunnyVideoId }),
      })
        .then((res) => res.json())
        .then((data) => {
          setApplyLoading((prev) => ({ ...prev, [i]: false }));
          if (data.success) {
            const syncedMedia = [...mediaItemsRef.current];
            const targetIdx = syncedMedia.findIndex((m) => m && m.videoId === bunnyVideoId);
            const idx = targetIdx !== -1 ? targetIdx : i;
            syncedMedia[idx] = {
              ...syncedMedia[idx],
              type: 'bunny',
              videoId: bunnyVideoId,
              libraryId: bunnyLibraryId,
              url: embedUrl,
              image_original: embedUrl,
              image: data.image_2k || data.image_3k || data.image_1k || data.image_thumb || data.image || data.url,
              image_thumb: data.image_thumb || data.url,
              image_1k: data.image_1k || '',
              image_2k: data.image_2k || '',
              image_3k: data.image_3k || '',
              bunnyThumbUrl:
                data.bunnyThumbUrl ||
                `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`,
              duration: data.duration || 0,
              image_width: data.image_width || 0,
              image_height: data.image_height || 0,
            };
            handleUpdatePostMedia(postId, syncedMedia);
          }
        })
        .catch(() => setApplyLoading((prev) => ({ ...prev, [i]: false })));
    } else if (youtubeId) {
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
      const newMedia = [...mediaItems];
      newMedia[i] = {
        ...media,
        type: 'youtube',
        youtubeUrl: url,
        youtubeId,
        image: thumbnailUrl,
        image_large: thumbnailUrl,
        url,
      };
      handleUpdatePostMedia(postId, newMedia);
      setApplyLoading((prev) => ({ ...prev, [i]: false }));
    } else {
      const newMedia = [...mediaItems];
      newMedia[i] = { ...newMedia[i], url };
      handleUpdatePostMedia(postId, newMedia);
      setApplyLoading((prev) => ({ ...prev, [i]: false }));
    }
  };

  const handleMediaDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    const media = mediaItems[index];
    if (!media) return;
    if (mediaSelection && mediaSelection.sourcePostId === postId && mediaSelection.mediaIndices.includes(index)) {
      onMediaDragStart(postId, mediaSelection.mediaIndices, media);
    } else {
      onMediaDragStart(postId, [index], media);
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleMediaDragOver = (e: React.DragEvent) => {
    if (hasFileDrag(e)) return;
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      setIsMediaDragOvered(true);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMediaDrop = (e: React.DragEvent, index: number) => {
    if (hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsMediaDragOvered(false);
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      onCrossPostMediaDrop(activeMediaDrag.sourcePostId, activeMediaDrag.mediaIndices, postId, index);
      return;
    }
    if (!activeMediaDrag || activeMediaDrag.sourcePostId !== postId) return;
    const dragIndices = activeMediaDrag.mediaIndices;
    if (dragIndices.length === 1 && dragIndices[0] === index) return;
    const newMedia = [...mediaItems];
    const descending = [...dragIndices].sort((a, b) => b - a);
    const draggedItems = descending
      .map((i) => {
        const [item] = newMedia.splice(i, 1);
        return item;
      })
      .reverse();
    let insertIdx = index;
    for (const di of descending) {
      if (di < index) insertIdx--;
    }
    newMedia.splice(insertIdx, 0, ...draggedItems);
    handleUpdatePostMedia(postId, newMedia);
    onMediaDragEnd();
  };

  const openThumb = (thumbUrl?: string) => {
    if (!thumbUrl) return;
    const finalUrl = getDisplayImage(thumbUrl, isR2Fallback, isEmbeddedData) || thumbUrl;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  return {
    applyLoading,
    localUrlInputs,
    setLocalUrlInputs,
    customThumbnailMedia,
    setCustomThumbnailMedia,
    customThumbnailVideoUrl,
    setCustomThumbnailVideoUrl,
    customThumbnailLoading,
    thumbFileState,
    hoverPreview,
    hoverPreviewLoading,
    bunnyResolutions,
    popoverPos,
    hoverPreviewRef,
    cancelHoverPreviewCloseTimer,
    handleHoverPreviewEnter,
    handleHoverPreviewLeave,
    handleThumbFileUpload,
    openCustomThumbnailModal,
    handleCustomThumbnailSave,
    removeMedia,
    addMedia,
    applyUrlToMedia,
    handleMediaDragStart,
    handleMediaDragOver,
    handleMediaDrop,
    openThumb,
  };
}

-----

## 4. Neue Datei: src/components/feed/post-card/FeedPostMediaSection.tsx (~255 Zeilen)

Rendert den oberen Medienbereich der FeedPostCard (Auflösungs-Chips, Edit-Media-Liste mit Upload/URL-Steuerung, View-Cover-Media und aktiven Upload-Overlay).

// src/components/feed/post-card/FeedPostMediaSection.tsx

import React from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  Film,
  GripVertical,
  ImageIcon,
  ImageUp,
  Loader2,
  X,
  Youtube,
} from 'lucide-react';
import type { CardUploadStatus } from '../../../hooks/useFeedCardFileDrop';
import {
  getHighestResThumbUrl,
  getPreviewImageSrc,
  getPreviewVideoSrc,
  isInstagramVideoCandidate,
} from './feedPostMediaHelpers';

interface FeedPostMediaSectionProps {
  post: any;
  isEditing: boolean;
  isDragging: boolean;
  showResolutions: boolean;
  resolutionVariants: { key: string; label: string }[];
  renderedMediaCount: number;
  mediaItems: any[];
  displayMedia: any;
  activeUploads: Record<string, number>;
  cardUploadStatus: CardUploadStatus | null;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleFeedImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  setSelectedImage: (post: any) => void;
  mediaSelection: { sourcePostId: string; mediaIndices: number[]; lastClickedIndex: number } | null;
  onMediaClick: (postId: string, mediaIndex: number, ctrlKey: boolean, shiftKey: boolean) => void;
  onMediaAltClick: (targetPostId: string, targetMediaIndex?: number) => void;
  localUrlInputs: Record<number, string>;
  setLocalUrlInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  applyLoading: Record<number, boolean>;
  thumbFileState: Record<number, 'idle' | 'uploading' | 'done' | 'error'>;
  customThumbnailLoading: boolean;
  handleImportInputChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: string,
    options: { kind: 'image' | 'video'; mediaIndex?: number; isNew?: boolean }
  ) => void;
  addMedia: (type: 'image' | 'youtube' | 'bunny') => void;
  removeMedia: (i: number) => void;
  applyUrlToMedia: (i: number, urlString: string) => void;
  handleThumbFileUpload: (e: React.ChangeEvent<HTMLInputElement>, mediaIndex: number) => void;
  openCustomThumbnailModal: (media: any, index: number, e: React.MouseEvent) => void;
  openThumb: (thumbUrl?: string) => void;
  handleHoverPreviewEnter: (media: any, i: number, e: React.MouseEvent) => void;
  handleHoverPreviewLeave: () => void;
  handleMediaDragStart: (e: React.DragEvent, index: number) => void;
  handleMediaDragOver: (e: React.DragEvent) => void;
  handleMediaDrop: (e: React.DragEvent, index: number) => void;
  onMediaDragEnd: () => void;
}

export const FeedPostMediaSection: React.FC<FeedPostMediaSectionProps> = ({
  post,
  isEditing,
  isDragging,
  showResolutions,
  resolutionVariants,
  renderedMediaCount,
  mediaItems,
  displayMedia,
  activeUploads,
  cardUploadStatus,
  isR2Fallback,
  isEmbeddedData,
  isValidImageCandidate,
  getDisplayImage,
  getImageSrc,
  getVideoSrc,
  handleFeedImageLoad,
  setSelectedImage,
  mediaSelection,
  onMediaClick,
  onMediaAltClick,
  localUrlInputs,
  setLocalUrlInputs,
  applyLoading,
  thumbFileState,
  customThumbnailLoading,
  handleImportInputChange,
  addMedia,
  removeMedia,
  applyUrlToMedia,
  handleThumbFileUpload,
  openCustomThumbnailModal,
  openThumb,
  handleHoverPreviewEnter,
  handleHoverPreviewLeave,
  handleMediaDragStart,
  handleMediaDragOver,
  handleMediaDrop,
  onMediaDragEnd,
}) => {
  return (
    <div
      className={`relative ${
        isEditing
          ? 'h-auto min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar'
          : renderedMediaCount > 1
          ? 'h-auto min-h-[300px] max-h-[600px] overflow-hidden'
          : 'aspect-[4/3] overflow-hidden'
      } cursor-pointer bg-black/50 shrink-0 ${isEditing && post.hidden ? 'grayscale brightness-50' : ''} ${
        isDragging ? 'pointer-events-none' : ''
      }`}
      onClick={() => {
        if (!isEditing) setSelectedImage(post);
      }}
    >
      {isEditing && showResolutions && resolutionVariants.length > 0 && (
        <div className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
            {resolutionVariants.map(({ key, label }) => (
              <span
                key={`${post.id}-${key}`}
                className="inline-flex items-center gap-1 rounded-full bg-black/70 border border-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-md shadow-lg"
              >
                <ImageIcon className="w-2.5 h-2.5" />
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {isEditing ? (
        <div className={`flex flex-col gap-2 p-2 ${isDragging ? 'pointer-events-none' : ''}`}>
          <div className="flex gap-2 mb-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
            <label
              className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs cursor-pointer transition-colors min-w-[100px]"
              onClick={(e) => e.stopPropagation()}
            >
              <ImageIcon className="w-3 h-3" /> + Bild
              <input
                type="file"
                accept="image/*,.png,.tif,.tiff"
                multiple
                className="hidden"
                onChange={(e) => handleImportInputChange(e, '+ Bild', { kind: 'image', isNew: true })}
              />
            </label>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addMedia('youtube');
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs transition-colors min-w-[100px]"
            >
              <Youtube className="w-3 h-3" /> + Video (URL)
            </button>
            <label
              className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs cursor-pointer transition-colors min-w-[100px]"
              onClick={(e) => e.stopPropagation()}
            >
              <Film className="w-3 h-3" /> + Video (Datei)
              <input
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => handleImportInputChange(e, '+ Video (Datei)', { kind: 'video' })}
              />
            </label>
          </div>

          {mediaItems.map((media: any, i: number) => {
            const isSelected = !!(
              mediaSelection &&
              mediaSelection.sourcePostId === post.id &&
              mediaSelection.mediaIndices.includes(i)
            );
            const isVideoCand = isInstagramVideoCandidate(media, post.source, getImageSrc);
            const highResThumb = media.type !== 'youtube' ? getHighestResThumbUrl(media, isValidImageCandidate) : undefined;
            const previewImgSrc = getPreviewImageSrc(media, getImageSrc);
            const previewVidSrc = getPreviewVideoSrc(media, getVideoSrc);

            return (
              <div
                key={i}
                className={`relative w-full bg-black/30 rounded p-2 border ${
                  isSelected ? 'border-sky-400' : 'border-white/10'
                }`}
                draggable
                onDragStart={(e) => handleMediaDragStart(e, i)}
                onDragOver={handleMediaDragOver}
                onDrop={(e) => handleMediaDrop(e, i)}
                onDragEnd={() => onMediaDragEnd()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.altKey && mediaSelection) {
                    onMediaAltClick(post.id, i);
                    return;
                  }
                  onMediaClick(post.id, i, e.ctrlKey, e.shiftKey);
                }}
              >
                {isSelected && (
                  <div className="absolute inset-0 rounded border-4 border-sky-400 animate-glow-pulse pointer-events-none z-10" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMedia(i);
                  }}
                  className="absolute top-1 right-1 z-10 bg-white/30 hover:bg-white/40 text-white p-1 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center gap-2 mb-2 pr-8">
                  <GripVertical className="w-4 h-4 text-white/30 cursor-grab" />
                  <span className="text-xs text-white/50">
                    {media.type === 'youtube'
                      ? 'YouTube'
                      : media.type === 'bunny'
                      ? 'Bunny'
                      : media.type === 'video'
                      ? 'Video'
                      : 'Bild'}
                  </span>
                  {highResThumb && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openThumb(highResThumb);
                      }}
                      className="w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20"
                      title="Thumbnail in höchster Auflösung öffnen"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {isVideoCand && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => openCustomThumbnailModal(media, i, e)}
                        disabled={customThumbnailLoading}
                        className="w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20 disabled:opacity-50"
                        title="Custom Thumbnail"
                      >
                        {customThumbnailLoading ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Camera className="w-2.5 h-2.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onMouseEnter={(e) => handleHoverPreviewEnter(media, i, e)}
                        onMouseLeave={handleHoverPreviewLeave}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20"
                        title="Vorschau & Auflösungen"
                      >
                        <Eye className="w-2.5 h-2.5" />
                      </button>
                      <label
                        className={`w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20 cursor-pointer ${
                          thumbFileState[i] === 'uploading' ? 'opacity-60 pointer-events-none' : ''
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        title="Eigenes Thumbnail (JPG/PNG) hochladen"
                      >
                        {thumbFileState[i] === 'uploading' ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : thumbFileState[i] === 'done' ? (
                          <Check className="w-2.5 h-2.5 text-green-400" />
                        ) : (
                          <ImageUp className="w-2.5 h-2.5" />
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handleThumbFileUpload(e, i)}
                        />
                      </label>
                    </>
                  )}
                </div>

                {media.type === 'youtube' || media.type === 'bunny' ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={localUrlInputs[i] ?? (media.youtubeUrl || media.url || '')}
                        onChange={(e) => setLocalUrlInputs((prev) => ({ ...prev, [i]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const url = localUrlInputs[i] ?? (media.youtubeUrl || media.url || '');
                            applyUrlToMedia(i, url);
                          }
                        }}
                        className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/40"
                        placeholder="YouTube oder Bunny URL einfügen..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = (localUrlInputs[i] ?? (media.youtubeUrl || media.url || '')).trim();
                          applyUrlToMedia(i, url);
                        }}
                        disabled={applyLoading[i]}
                        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="URL anwenden"
                      >
                        {applyLoading[i] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>{media.type === 'bunny' ? 'ThumbDL' : 'Anwenden'}</span>
                      </button>
                    </div>
                    {applyLoading[i] && (
                      <div className="flex items-center gap-1 text-white/50 text-[10px]">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Bunny Metadaten werden geladen…</span>
                      </div>
                    )}
                  </div>
                ) : media.type === 'video' ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1 text-xs text-white/60 flex-1">
                        <Film className="w-3 h-3 text-white/40" />
                        <span className="truncate">{media.url ? media.url.split('/').pop() : 'Video-Datei'}</span>
                        {!media.image_thumb && !media.image && (
                          <span className="text-yellow-400/60 ml-1">(kein Thumbnail)</span>
                        )}
                      </div>
                      <label className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white cursor-pointer transition-colors">
                        <ImageIcon className="w-3 h-3" /> Ändern
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => handleImportInputChange(e, 'Video ersetzen', { kind: 'video' })}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="block w-full text-center bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1 mb-2 text-xs cursor-pointer transition-colors">
                    Bild ändern
                    <input
                      type="file"
                      accept="image/*,.png,.tif,.tiff"
                      className="hidden"
                      onChange={(e) => handleImportInputChange(e, 'Bild ersetzen', { kind: 'image', mediaIndex: i })}
                    />
                  </label>
                )}

                {media.image || media.image_preview || media.url ? (
                  media.type === 'video' ? (
                    previewImgSrc ? (
                      <img
                        src={getDisplayImage(previewImgSrc, isR2Fallback, isEmbeddedData)}
                        alt=""
                        className="w-full h-24 object-cover rounded cursor-pointer"
                        onClick={(e) => {
                          if (e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.stopPropagation();
                          setSelectedImage(post);
                        }}
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = 'none';
                          const next = img.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'flex';
                        }}
                      />
                    ) : previewVidSrc ? (
                      <video
                        src={getDisplayImage(previewVidSrc, isR2Fallback, isEmbeddedData)}
                        className="w-full h-24 object-cover rounded cursor-pointer"
                        autoPlay
                        loop
                        muted
                        playsInline
                        onClick={(e) => {
                          if (e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.stopPropagation();
                          setSelectedImage(post);
                        }}
                      />
                    ) : (
                      <div className="w-full h-24 bg-white/10 rounded flex items-center justify-center text-white/40">
                        <Film className="w-6 h-6" />
                      </div>
                    )
                  ) : getVideoSrc(media) ? (
                    <video
                      src={getDisplayImage(getVideoSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)}
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      autoPlay
                      loop
                      muted
                      playsInline
                      onClick={(e) => {
                        if (e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.stopPropagation();
                        setSelectedImage(post);
                      }}
                    />
                  ) : (
                    <img
                      src={getDisplayImage(getImageSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)}
                      alt=""
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      onClick={(e) => {
                        if (e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.stopPropagation();
                        setSelectedImage(post);
                      }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes('maxresdefault.jpg')) {
                          target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                        } else if (
                          media.image_preview &&
                          target.src !== getDisplayImage(media.image_preview, isR2Fallback, isEmbeddedData)
                        ) {
                          target.src = getDisplayImage(media.image_preview, isR2Fallback, isEmbeddedData) || '';
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="w-full h-24 bg-white/10 rounded flex items-center justify-center text-white/40">
                    {media.type === 'youtube' || media.type === 'bunny' ? (
                      <Youtube className="w-6 h-6" />
                    ) : media.type === 'video' ? (
                      <Film className="w-6 h-6" />
                    ) : (
                      <ImageIcon className="w-6 h-6" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {displayMedia.image || displayMedia.image_preview || displayMedia.url ? (
            displayMedia.type === 'video' ? (
              getPreviewImageSrc(displayMedia, getImageSrc) ? (
                <img
                  src={getDisplayImage(getPreviewImageSrc(displayMedia, getImageSrc), isR2Fallback, isEmbeddedData)}
                  alt={post.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                    !isEditing ? 'group-hover:scale-[1.03]' : ''
                  }`}
                  onLoad={handleFeedImageLoad}
                  onClick={() => setSelectedImage(post)}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (
                      displayMedia.image_preview &&
                      target.src !== getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData)
                    ) {
                      target.src = getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData) || '';
                    }
                  }}
                />
              ) : getPreviewVideoSrc(displayMedia, getVideoSrc) ? (
                <video
                  src={getDisplayImage(getPreviewVideoSrc(displayMedia, getVideoSrc), isR2Fallback, isEmbeddedData)}
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                    !isEditing ? 'group-hover:scale-[1.03]' : ''
                  }`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onClick={() => setSelectedImage(post)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <Film className="w-12 h-12" />
                </div>
              )
            ) : getVideoSrc(displayMedia) ? (
              <video
                src={getDisplayImage(getVideoSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)}
                className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                  !isEditing ? 'group-hover:scale-[1.03]' : ''
                }`}
                autoPlay
                loop
                muted
                playsInline
                onClick={() => setSelectedImage(post)}
              />
            ) : (
              <img
                src={getDisplayImage(getImageSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)}
                alt={post.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                  !isEditing ? 'group-hover:scale-[1.03]' : ''
                }`}
                onLoad={handleFeedImageLoad}
                onClick={() => setSelectedImage(post)}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes('maxresdefault.jpg')) {
                    target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                  } else if (
                    displayMedia.image_preview &&
                    target.src !== getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData)
                  ) {
                    target.src = getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData) || '';
                  }
                }}
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              {displayMedia.type === 'video' ? <Film className="w-12 h-12" /> : <ImageIcon className="w-12 h-12" />}
            </div>
          )}
          {(displayMedia.type === 'youtube' || displayMedia.type === 'bunny' || displayMedia.type === 'video') &&
            !isEditing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-16 h-16 bg-white/30 hover:bg-white/40 rounded-full flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImage(post);
                  }}
                >
                  {displayMedia.type === 'video' ? (
                    <Film className="w-8 h-8 text-white" />
                  ) : (
                    <Youtube className="w-8 h-8 text-white ml-1" />
                  )}
                </div>
              </div>
            )}
          {!isEditing && renderedMediaCount > 1 && (
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full z-10">
              +{renderedMediaCount - 1}
            </div>
          )}
        </>
      )}

      {isEditing && (activeUploads[post.id] > 0 || (cardUploadStatus && cardUploadStatus.phase !== 'hover')) && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 px-4 text-center">
          {cardUploadStatus?.phase === 'done' ? (
            <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
          ) : cardUploadStatus?.phase === 'error' ? (
            <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
          ) : (
            <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
          )}
          <span
            className={`text-xs sm:text-sm ${
              cardUploadStatus?.phase === 'done'
                ? 'text-green-300'
                : cardUploadStatus?.phase === 'error'
                ? 'text-red-300'
                : 'text-white/70'
            }`}
          >
            {cardUploadStatus?.message || `Lädt hoch... (${activeUploads[post.id]})`}
          </span>
        </div>
      )}
    </div>
  );
};

-----

## 5. Neue Datei: src/components/feed/post-card/FeedPostBodyAndPopover.tsx (~240 Zeilen)

Rendert den unteren Text-/Button-Bereich (FeedPostBodySection) sowie das Portal-Popover für die Medien-Vorschau (FeedPostHoverPopover).

// src/components/feed/post-card/FeedPostBodyAndPopover.tsx

import React from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ExternalLink,
  FoldVertical,
  Loader2,
  Maximize2,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import { PROJECT_STATES } from '../../../constants';
import { getResolutionVariants } from '../../../utils/kiEditClient';
import { getBunnyPosterSrc, getStandardVideoPosterSrc } from './feedPostMediaHelpers';

interface FeedPostBodySectionProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  isDragging: boolean;
  bunnyProgress?: Record<string, { step: string; progress: number; text: string }>;
  localTitle: string;
  setLocalTitle: (v: string) => void;
  localDescription: string;
  setLocalDescription: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  hoveredState: string | null;
  setHoveredState: (v: string | null) => void;
  isGeneratingKi: boolean;
  undoDescription: string | null;
  handleKiEditCard: () => void;
  handleCardUndo: () => void;
  confirmingMerge: boolean;
  setConfirmingMerge: (v: boolean) => void;
  mergeChoice: 'y' | 'n';
  mergeYesRef: React.RefObject<HTMLButtonElement | null>;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  setSelectedImage: (post: any) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  formatDescription: (description: string, title: string) => string;
  syncBunnyMetadata: (newTitle?: string, newDescription?: string) => void;
}

export const FeedPostBodySection: React.FC<FeedPostBodySectionProps> = ({
  post,
  index,
  totalPosts,
  isEditing,
  isDragging,
  bunnyProgress,
  localTitle,
  setLocalTitle,
  localDescription,
  setLocalDescription,
  textareaRef,
  hoveredState,
  setHoveredState,
  isGeneratingKi,
  undoDescription,
  handleKiEditCard,
  handleCardUndo,
  confirmingMerge,
  setConfirmingMerge,
  mergeChoice,
  mergeYesRef,
  handlePostChange,
  handleStateToggle,
  setSelectedImage,
  handleDeletePost,
  handleMergeDown,
  formatDescription,
  syncBunnyMetadata,
}) => {
  const progress = bunnyProgress?.[post.id];

  return (
    <>
      {progress && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 mb-1">
            {progress.step !== 'done' && progress.step !== 'error' ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            ) : progress.step === 'done' ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <span className="text-red-400 text-xs">⚠</span>
            )}
            <span
              className={`text-xs ${
                progress.step === 'done'
                  ? 'text-green-400'
                  : progress.step === 'error'
                  ? 'text-red-400'
                  : 'text-blue-400'
              }`}
            >
              {progress.text}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress.step === 'error'
                  ? 'bg-red-500'
                  : progress.step === 'done'
                  ? 'bg-green-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className={`p-4 flex flex-col gap-2 flex-grow ${isDragging ? 'pointer-events-none' : ''}`}>
        {isEditing ? (
          <>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                const oldTitle = typeof post.title === 'string' ? post.title : post.title?.title || '';
                const newTitle = localTitle.trim();
                handlePostChange(post.id, 'title', localTitle);
                if (newTitle !== oldTitle && oldTitle !== undefined && post.mergedMedia?.length > 0) {
                  const hasVideo = post.mergedMedia.some(
                    (m: any) => (m.type === 'video' || m.type === 'bunny') && m.image_original
                  );
                  if (hasVideo) {
                    fetch('/api/rename-project-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId: post.id, oldName: oldTitle, newName: newTitle }),
                    })
                      .then((r) => r.json())
                      .then((data) => {
                        if (data.changed) console.log(`[rename] Project folder renamed: ${data.renamed} dirs updated`);
                      })
                      .catch(() => {});
                  }
                }
                if (newTitle !== oldTitle) syncBunnyMetadata(newTitle);
              }}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-white/30"
              placeholder="Titel..."
            />
            <textarea
              ref={textareaRef}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => {
                const oldDesc =
                  typeof post.description === 'string' ? post.description : post.description?.description || '';
                handlePostChange(post.id, 'description', localDescription);
                const newDesc = localDescription.trim();
                if (newDesc !== oldDesc) syncBunnyMetadata(undefined, newDesc);
              }}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/30 min-h-[80px]"
              placeholder="Beschreibung..."
            />
            <div className="flex items-center gap-2 mt-1.5 mb-1">
              <button
                type="button"
                onClick={handleKiEditCard}
                disabled={isGeneratingKi}
                className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="Generiert eine strukturierte Case Study mit KI"
              >
                {isGeneratingKi ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>KI generiert...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>✨ KI-Edit</span>
                  </>
                )}
              </button>
              {undoDescription !== null && (
                <button
                  type="button"
                  onClick={handleCardUndo}
                  disabled={isGeneratingKi}
                  className="flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors cursor-pointer"
                  title="Originaltext wiederherstellen"
                >
                  <Undo2 className="w-3 h-3" />
                  <span>↩️ Undo</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {PROJECT_STATES.map((s) => {
                const isActive = (post.states || [])
                  .map((state: string) => String(state).toLowerCase())
                  .includes(String(s.id).toLowerCase());
                const isHovered = hoveredState === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStateToggle(post.id, s.id);
                    }}
                    onMouseEnter={() => setHoveredState(s.id)}
                    onMouseLeave={() => setHoveredState(null)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium transition-all duration-300"
                    title={s.tooltip}
                    style={{
                      backgroundColor: isActive ? s.bright : isHovered ? s.muted : '#1f2937',
                      color: isActive || isHovered ? 'white' : '#9ca3af',
                      boxShadow: isActive ? `0 0 10px ${s.bright}` : isHovered ? `0 0 5px ${s.muted}` : 'none',
                      opacity: isHovered && !isActive ? 0.8 : 1,
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setSelectedImage(post)}
              className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
            >
              <Maximize2 className="w-3 h-3" /> Lightbox Editor
            </button>
            <button
              onClick={() => handleDeletePost(post.id)}
              className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Post löschen
            </button>

            {index < totalPosts - 1 && !confirmingMerge && (
              <button
                onClick={() => setConfirmingMerge(true)}
                className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
                title="Mit dem nächsten Post zusammenlegen"
              >
                <FoldVertical className="w-3 h-3" /> Mit nächstem zusammenlegen
              </button>
            )}

            {index < totalPosts - 1 && confirmingMerge && (
              <div className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 text-white border border-white/20 rounded py-1.5 text-xs">
                <span className="text-white/80 select-none">Sure?</span>
                <button
                  ref={mergeYesRef}
                  onClick={() => {
                    handleMergeDown(index);
                    setConfirmingMerge(false);
                  }}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    mergeChoice === 'y'
                      ? 'bg-green-600 border-green-400 text-white ring-1 ring-green-300'
                      : 'bg-transparent border-white/20 text-white/60 hover:bg-white/10'
                  }`}
                >
                  y
                </button>
                <button
                  onClick={() => setConfirmingMerge(false)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    mergeChoice === 'n'
                      ? 'bg-red-600 border-red-400 text-white ring-1 ring-red-300'
                      : 'bg-transparent border-white/20 text-white/60 hover:bg-white/10'
                  }`}
                >
                  n
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="font-medium text-sm text-white/90 line-clamp-2" title={localTitle}>
              {localTitle}
            </h2>
            {localDescription && (
              <div
                className="text-xs text-white/60 line-clamp-3 mt-1"
                dangerouslySetInnerHTML={{ __html: formatDescription(localDescription, localTitle) }}
              />
            )}
            {post.states && post.states.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.states.map((stateId: string, idx: number) => {
                  const state = PROJECT_STATES.find((s) => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                  if (!state) return null;
                  return (
                    <span
                      key={`${stateId}-${idx}`}
                      className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
                      title={state.tooltip}
                      style={{ backgroundColor: state.bright }}
                    >
                      {state.label}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between mt-auto pt-4">
          <span className="text-xs text-white/40 uppercase tracking-wider">{post.network_name}</span>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white transition-colors"
            title="Auf Flickr ansehen"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </>
  );
};

interface FeedPostHoverPopoverProps {
  hoverPreview: { media: any; index: number } | null;
  popoverPos: { top: number; left: number } | null;
  hoverPreviewRef: React.RefObject<HTMLDivElement | null>;
  hoverPreviewLoading: boolean;
  bunnyResolutions: Record<string, any | null>;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  cancelHoverPreviewCloseTimer: () => void;
  handleHoverPreviewLeave: () => void;
}

export const FeedPostHoverPopover: React.FC<FeedPostHoverPopoverProps> = ({
  hoverPreview,
  popoverPos,
  hoverPreviewRef,
  hoverPreviewLoading,
  bunnyResolutions,
  isR2Fallback,
  isEmbeddedData,
  isValidImageCandidate,
  getDisplayImage,
  cancelHoverPreviewCloseTimer,
  handleHoverPreviewLeave,
}) => {
  if (!hoverPreview || !popoverPos) return null;
  const hoverMedia = hoverPreview.media;
  const isBunny = !!hoverMedia.libraryId && !!hoverMedia.videoId;
  const cacheKey = isBunny ? `${hoverMedia.libraryId}/${hoverMedia.videoId}` : null;
  const resolCache = cacheKey ? bunnyResolutions[cacheKey] : null;
  const posterSrc = isBunny
    ? getBunnyPosterSrc(hoverMedia, getDisplayImage, isR2Fallback, isEmbeddedData, isValidImageCandidate)
    : getStandardVideoPosterSrc(hoverMedia, getDisplayImage, isR2Fallback, isEmbeddedData);
  const variantChips = getResolutionVariants(hoverMedia);
  const width = isBunny && resolCache ? resolCache.width : hoverMedia.image_width || 0;
  const height = isBunny && resolCache ? resolCache.height : hoverMedia.image_height || 0;
  const length = isBunny && resolCache ? resolCache.length : 0;

  return createPortal(
    <div
      ref={hoverPreviewRef}
      style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 1000 }}
      className="pointer-events-auto bg-[#1a1a1a] border border-white/20 rounded-lg shadow-xl p-3 w-[22rem] max-w-[calc(100vw-16px)]"
      onMouseEnter={(e) => {
        e.stopPropagation();
        cancelHoverPreviewCloseTimer();
      }}
      onMouseLeave={handleHoverPreviewLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {posterSrc ? (
        <img
          src={posterSrc}
          alt="Vorschau"
          className="w-full h-auto max-h-[55vh] object-contain rounded mb-2"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="w-full h-20 rounded bg-black/40 flex items-center justify-center mb-2">
          <span className="text-[10px] text-white/40">Kein Poster</span>
        </div>
      )}
      {(width > 0 || (isBunny && resolCache)) && (
        <div className="mb-2 text-[10px] text-white/50">
          {width > 0 && height > 0 ? `${width} × ${height}` : ''}
          {isBunny && resolCache && length > 0 ? ` · Dauer: ${length}s` : ''}
        </div>
      )}
      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Bildvarianten</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {variantChips.length > 0 ? (
          variantChips.map(({ key, label }) => (
            <span key={key} className="bg-white/20 rounded px-1.5 text-[10px] text-white">
              {label}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-white/40">–</span>
        )}
      </div>
      {isBunny && (
        <>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Video-Auflösungen</div>
          <div className="flex flex-wrap gap-1">
            {hoverPreviewLoading && !resolCache ? (
              <Loader2 className="w-3 h-3 animate-spin text-white/50" />
            ) : resolCache && resolCache.availableResolutions ? (
              String(resolCache.availableResolutions)
                .split(',')
                .map((r) => r.trim())
                .filter(Boolean)
                .map((r) => (
                  <span key={r} className="bg-white/20 rounded px-1.5 text-[10px] text-white">
                    {r}
                  </span>
                ))
            ) : (
              <span className="text-[10px] text-white/40">–</span>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
};

-----

## 6. Refaktorierter Orchestrator: src/components/feed/FeedPostCard.tsx (~225 Zeilen)

// src/components/feed/FeedPostCard.tsx

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { Eye, GripVertical, Upload } from 'lucide-react';
import { useFeedCardFileDrop } from '../../hooks/useFeedCardFileDrop';
import { useFeedCardMediaActions } from '../../hooks/useFeedCardMediaActions';
import { getAsString, getResolutionVariants, requestKiCaseStudyEdit } from '../../utils/kiEditClient';
import { CustomThumbnailModal } from '../modals/CustomThumbnailModal';
import { FeedPostBodySection, FeedPostHoverPopover } from './post-card/FeedPostBodyAndPopover';
import { FeedPostMediaSection } from './post-card/FeedPostMediaSection';
import { isRenderableFeedMedia } from './post-card/feedPostMediaHelpers';

interface FeedPostCardProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  showResolutions: boolean;
  imageDimensions: Record<string, string>;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  formatDescription: (description: string, title: string) => string;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  handleImageUpload: (postId: string, file: File, mediaIndex?: number, isNew?: boolean) => void;
  handleVideoFileUpload: (postId: string, file: File) => void;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleVideoLinkChange: (postId: string, url: string) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  handleRemoveMedia: (postId: string, mediaIndex: number) => void;
  setSelectedImage: (post: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  handleToggleHidden: (postId: string) => void;
  bunnyProgress?: Record<string, { step: string; progress: number; text: string }>;
  activeMediaDrag: { sourcePostId: string; mediaIndices: number[]; mediaItem: any } | null;
  onMediaDragStart: (sourcePostId: string, mediaIndices: number[], mediaItem: any) => void;
  onMediaDragEnd: () => void;
  onCrossPostMediaDrop: (
    sourcePostId: string,
    mediaIndices: number[],
    targetPostId: string,
    targetMediaIndex?: number
  ) => void;
  mediaSelection: { sourcePostId: string; mediaIndices: number[]; lastClickedIndex: number } | null;
  onMediaClick: (postId: string, mediaIndex: number, ctrlKey: boolean, shiftKey: boolean) => void;
  onMediaAltClick: (targetPostId: string, targetMediaIndex?: number) => void;
  clearMediaSelection: () => void;
}

export function FeedPostCard({
  post,
  index,
  totalPosts,
  isEditing,
  activeUploads,
  showResolutions,
  getDisplayImage,
  getImageSrc,
  getVideoSrc,
  handleImageLoad,
  formatDescription,
  isR2Fallback,
  isEmbeddedData,
  isValidImageCandidate,
  handleImageUpload,
  handleVideoFileUpload,
  handlePostChange,
  handleDeletePost,
  handleMergeDown,
  handleUpdatePostMedia,
  handleRemoveMedia,
  setSelectedImage,
  handleStateToggle,
  handleToggleHidden,
  bunnyProgress,
  activeMediaDrag,
  onMediaDragStart,
  onMediaDragEnd,
  onCrossPostMediaDrop,
  mediaSelection,
  onMediaClick,
  onMediaAltClick,
}: FeedPostCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: post.id,
    disabled: !isEditing,
  });

  const [localTitle, setLocalTitle] = useState(() => getAsString(post.title, 'title'));
  const [localDescription, setLocalDescription] = useState(() => getAsString(post.description, 'description'));
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [mergeChoice, setMergeChoice] = useState<'y' | 'n'>('y');
  const [isGeneratingKi, setIsGeneratingKi] = useState(false);
  const [undoDescription, setUndoDescription] = useState<string | null>(null);
  const mergeYesRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCardUndo = () => {
    if (undoDescription !== null) {
      setLocalDescription(undoDescription);
      handlePostChange(post.id, 'description', undoDescription);
      setUndoDescription(null);
    }
  };

  const handleKiEditCard = async () => {
    if (isGeneratingKi) return;
    setIsGeneratingKi(true);
    try {
      if (undoDescription === null) {
        setUndoDescription(localDescription);
      }
      const itemsForKi = post.mergedMedia && post.mergedMedia.length > 0 ? post.mergedMedia : [post];
      const generatedText = await requestKiCaseStudyEdit({
        title: localTitle,
        description: localDescription,
        mediaList: itemsForKi,
        getImageSrc,
        getDisplayImage,
        isR2Fallback,
        isEmbeddedData,
      });
      if (generatedText) {
        setLocalDescription(generatedText);
        handlePostChange(post.id, 'description', generatedText);
      }
    } catch (error: any) {
      console.error('KI-Edit fehlgeschlagen:', error);
      alert(`KI-Edit fehlgeschlagen: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsGeneratingKi(false);
    }
  };

  const rawMediaItems = useMemo(() => {
    return post.mergedMedia && post.mergedMedia.length > 0
      ? post.mergedMedia
      : [
          {
            type: post.type || 'image',
            image: post.image,
            image_large: post.image_large,
            youtubeId: post.youtubeId,
            youtubeUrl: post.youtubeUrl,
            link: post.url,
          },
        ];
  }, [post.mergedMedia, post.type, post.image, post.image_large, post.youtubeId, post.youtubeUrl, post.url]);

  useEffect(() => {
    setLocalTitle(getAsString(post.title, 'title'));
  }, [post.title]);

  useEffect(() => {
    setLocalDescription(getAsString(post.description, 'description'));
  }, [post.description]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localDescription, isEditing]);

  useEffect(() => {
    if (!confirmingMerge) return;
    const handleMergeKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setMergeChoice((prev) => (prev === 'y' ? 'n' : 'y'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mergeChoice === 'y') {
          handleMergeDown(index);
        }
        setConfirmingMerge(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmingMerge(false);
      }
    };
    window.addEventListener('keydown', handleMergeKeyDown);
    return () => window.removeEventListener('keydown', handleMergeKeyDown);
  }, [confirmingMerge, mergeChoice, index, handleMergeDown]);

  useEffect(() => {
    if (confirmingMerge && mergeYesRef.current) {
      mergeYesRef.current.focus();
    }
  }, [confirmingMerge]);

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const mediaItems = isEditing ? rawMediaItems : rawMediaItems.filter(isRenderableFeedMedia);
  const mediaItemsRef = useRef(mediaItems);
  mediaItemsRef.current = mediaItems;
  const renderedMediaCount = mediaItems.length;
  const displayMedia = mediaItems[0] || post;
  const feedDimensionsKey = post.id ? `${post.id}-0` : '';
  const resolutionVariants = useMemo(() => getResolutionVariants(displayMedia), [displayMedia]);

  const handleFeedImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (feedDimensionsKey) {
      handleImageLoad(feedDimensionsKey, e);
    }
  };

  const {
    isMediaDragOvered,
    setIsMediaDragOvered,
    isFileDragOverCard,
    cardUploadStatus,
    handleCardDragEnter,
    handleCardDragOver,
    handleCardDragLeave,
    handleCardDrop,
    handleImportInputChange,
  } = useFeedCardFileDrop({
    postId: post.id,
    isEditing,
    activeUploads,
    activeMediaDrag,
    handleImageUpload,
    handleVideoFileUpload,
    onCrossPostMediaDrop,
  });

  const {
    applyLoading,
    localUrlInputs,
    setLocalUrlInputs,
    customThumbnailMedia,
    setCustomThumbnailMedia,
    customThumbnailVideoUrl,
    setCustomThumbnailVideoUrl,
    customThumbnailLoading,
    thumbFileState,
    hoverPreview,
    hoverPreviewLoading,
    bunnyResolutions,
    popoverPos,
    hoverPreviewRef,
    cancelHoverPreviewCloseTimer,
    handleHoverPreviewEnter,
    handleHoverPreviewLeave,
    handleThumbFileUpload,
    openCustomThumbnailModal,
    handleCustomThumbnailSave,
    removeMedia,
    addMedia,
    applyUrlToMedia,
    handleMediaDragStart,
    handleMediaDragOver,
    handleMediaDrop,
    openThumb,
  } = useFeedCardMediaActions({
    postId: post.id,
    mediaItems,
    mediaItemsRef,
    isR2Fallback,
    isEmbeddedData,
    getDisplayImage,
    getVideoSrc,
    handleUpdatePostMedia,
    handleRemoveMedia,
    activeMediaDrag,
    onMediaDragStart,
    onMediaDragEnd,
    onCrossPostMediaDrop,
    mediaSelection,
    setIsMediaDragOvered,
  });

  const syncBunnyMetadata = (newTitle?: string, newDescription?: string) => {
    const mergedMedia = post.mergedMedia;
    if (!mergedMedia || mergedMedia.length === 0) return;
    const bunnyVideos = mergedMedia.filter((m: any) => m.type === 'bunny' && m.videoId && (m.libraryId || ''));
    if (bunnyVideos.length === 0) return;
    const title = newTitle !== undefined ? newTitle : localTitle;
    const desc = newDescription !== undefined ? newDescription : localDescription;
    bunnyVideos.forEach((m: any) => {
      fetch('/api/bunny/update-video-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: m.videoId,
          libraryId: m.libraryId || '',
          title: title || '',
          projectId: post.id,
          description: desc || '',
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.success) console.warn('[bunny-meta] Update failed:', data.error);
        })
        .catch(() => {});
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-[#111] rounded-xl overflow-hidden border ${
        isDragging ? 'border-blue-500 shadow-xl shadow-black/50' : 'border-white/5 hover:border-white/20'
      } transition-all duration-300 flex flex-col relative ${
        isFileDragOverCard ? 'ring-2 ring-blue-400/50 ring-offset-0' : ''
      } ${isMediaDragOvered ? 'ring-2 ring-cyan-400/70 border-cyan-400/60 shadow-lg shadow-cyan-400/10 scale-[1.02]' : ''}`}
      onDragEnter={handleCardDragEnter}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      {isEditing && isFileDragOverCard && cardUploadStatus?.phase === 'hover' && (
        <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none">
          <div className="rounded-2xl border border-blue-400/40 bg-black/55 backdrop-blur-md px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-blue-300 animate-bounce shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-100">Files can be dropped here</div>
                <div className="text-[11px] sm:text-xs text-blue-100/70 truncate">{cardUploadStatus.message}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleHidden(post.id);
            }}
            className={`p-1.5 rounded transition-all shadow-lg backdrop-blur-sm bg-white/30 hover:bg-white/40 text-white ${
              isDragging ? 'pointer-events-none' : ''
            }`}
            title={post.hidden ? 'Anzeigen' : 'Verstecken'}
          >
            <Eye className={`w-4 h-4 ${post.hidden ? 'opacity-100' : 'opacity-70'}`} />
          </button>
        </div>
      )}

      {isEditing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 right-2 z-20 bg-white/30 p-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-white/40 transition-colors shadow-lg backdrop-blur-sm"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-white/70" />
        </div>
      )}

      <FeedPostMediaSection
        post={post}
        isEditing={isEditing}
        isDragging={isDragging}
        showResolutions={showResolutions}
        resolutionVariants={resolutionVariants}
        renderedMediaCount={renderedMediaCount}
        mediaItems={mediaItems}
        displayMedia={displayMedia}
        activeUploads={activeUploads}
        cardUploadStatus={cardUploadStatus}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        isValidImageCandidate={isValidImageCandidate}
        getDisplayImage={getDisplayImage}
        getImageSrc={getImageSrc}
        getVideoSrc={getVideoSrc}
        handleFeedImageLoad={handleFeedImageLoad}
        setSelectedImage={setSelectedImage}
        mediaSelection={mediaSelection}
        onMediaClick={onMediaClick}
        onMediaAltClick={onMediaAltClick}
        localUrlInputs={localUrlInputs}
        setLocalUrlInputs={setLocalUrlInputs}
        applyLoading={applyLoading}
        thumbFileState={thumbFileState}
        customThumbnailLoading={customThumbnailLoading}
        handleImportInputChange={handleImportInputChange}
        addMedia={addMedia}
        removeMedia={removeMedia}
        applyUrlToMedia={applyUrlToMedia}
        handleThumbFileUpload={handleThumbFileUpload}
        openCustomThumbnailModal={openCustomThumbnailModal}
        openThumb={openThumb}
        handleHoverPreviewEnter={handleHoverPreviewEnter}
        handleHoverPreviewLeave={handleHoverPreviewLeave}
        handleMediaDragStart={handleMediaDragStart}
        handleMediaDragOver={handleMediaDragOver}
        handleMediaDrop={handleMediaDrop}
        onMediaDragEnd={onMediaDragEnd}
      />

      <FeedPostBodySection
        post={post}
        index={index}
        totalPosts={totalPosts}
        isEditing={isEditing}
        isDragging={isDragging}
        bunnyProgress={bunnyProgress}
        localTitle={localTitle}
        setLocalTitle={setLocalTitle}
        localDescription={localDescription}
        setLocalDescription={setLocalDescription}
        textareaRef={textareaRef}
        hoveredState={hoveredState}
        setHoveredState={setHoveredState}
        isGeneratingKi={isGeneratingKi}
        undoDescription={undoDescription}
        handleKiEditCard={handleKiEditCard}
        handleCardUndo={handleCardUndo}
        confirmingMerge={confirmingMerge}
        setConfirmingMerge={setConfirmingMerge}
        mergeChoice={mergeChoice}
        mergeYesRef={mergeYesRef}
        handlePostChange={handlePostChange}
        handleStateToggle={handleStateToggle}
        setSelectedImage={setSelectedImage}
        handleDeletePost={handleDeletePost}
        handleMergeDown={handleMergeDown}
        formatDescription={formatDescription}
        syncBunnyMetadata={syncBunnyMetadata}
      />

      <FeedPostHoverPopover
        hoverPreview={hoverPreview}
        popoverPos={popoverPos}
        hoverPreviewRef={hoverPreviewRef}
        hoverPreviewLoading={hoverPreviewLoading}
        bunnyResolutions={bunnyResolutions}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        isValidImageCandidate={isValidImageCandidate}
        getDisplayImage={getDisplayImage}
        cancelHoverPreviewCloseTimer={cancelHoverPreviewCloseTimer}
        handleHoverPreviewLeave={handleHoverPreviewLeave}
      />

      {customThumbnailMedia && customThumbnailVideoUrl && (
        <CustomThumbnailModal
          videoUrl={customThumbnailVideoUrl}
          media={customThumbnailMedia.media}
          mediaIndex={customThumbnailMedia.index}
          postTitle={localTitle || post.title || 'Untitled'}
          postId={post.id}
          getDisplayImage={getDisplayImage}
          isR2Fallback={isR2Fallback}
          isEmbeddedData={isEmbeddedData}
          onSave={handleCustomThumbnailSave}
          onClose={() => {
            setCustomThumbnailMedia(null);
            setCustomThumbnailVideoUrl('');
          }}
        />
      )}
    </div>
  );
}

-----

## 7. Architektur-Dokumentation aktualisieren: .agents/rules/app-architecture.md

Ergänze in .agents/rules/app-architecture.md in den jeweiligen Sektionen die neu extrahierten Module:

1. Unter **src/utils/**:
   - kiEditClient.ts — Shared string/resolution helpers (getAsString, getResolutionVariants) and Base64 thumbnail serialization + /api/ki-edit client (requestKiCaseStudyEdit).

2. Unter **src/hooks/**:
   - useMediaVariantsAudit.ts — Audit polling, local variant generation, live verification, and R2 publish state for MediaVariantsModal.
   - useFeedCardFileDrop.ts — Card-level file drag-and-drop, file input queueing, and upload status banner lifecycle for FeedPostCard.
   - useFeedCardMediaActions.ts — Per-media mutations, YouTube/Bunny URL resolution, custom thumbnail upload/capture