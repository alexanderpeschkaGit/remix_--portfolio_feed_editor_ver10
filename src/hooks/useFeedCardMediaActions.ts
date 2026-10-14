import type React from "react";
import { useEffect, useRef, useState } from "react";
import { hasFileDrag } from "../components/feed/post-card/feedPostMediaHelpers";

interface UseFeedCardMediaActionsParams {
  postId: string;
  mediaItems: any[];
  mediaItemsRef: React.MutableRefObject<any[]>;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getDisplayImage: (
    url: string | undefined,
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
  ) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  handleRemoveMedia: (postId: string, mediaIndex: number) => void;
  activeMediaDrag: {
    sourcePostId: string;
    mediaIndices: number[];
    mediaItem: any;
  } | null;
  onMediaDragStart: (
    sourcePostId: string,
    mediaIndices: number[],
    mediaItem: any,
  ) => void;
  onMediaDragEnd: () => void;
  onCrossPostMediaDrop: (
    sourcePostId: string,
    mediaIndices: number[],
    targetPostId: string,
    targetMediaIndex?: number,
  ) => void;
  mediaSelection: {
    sourcePostId: string;
    mediaIndices: number[];
    lastClickedIndex: number;
  } | null;
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
  const [customThumbnailMedia, setCustomThumbnailMedia] = useState<{
    media: any;
    index: number;
  } | null>(null);
  const [customThumbnailVideoUrl, setCustomThumbnailVideoUrl] =
    useState<string>("");
  const [customThumbnailLoading, setCustomThumbnailLoading] = useState(false);
  const [thumbFileState, setThumbFileState] = useState<
    Record<number, "idle" | "uploading" | "done" | "error">
  >({});
  const [hoverPreview, setHoverPreview] = useState<{
    media: any;
    index: number;
  } | null>(null);
  const [hoverPreviewLoading, setHoverPreviewLoading] = useState(false);
  const [bunnyResolutions, setBunnyResolutions] = useState<
    Record<string, any | null>
  >({});
  const [popoverPos, setPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const hoverPreviewCloseTimerRef = useRef<number | null>(null);
  const hoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const [localUrlInputs, setLocalUrlInputs] = useState<Record<number, string>>(
    {},
  );

  useEffect(() => {
    return () => {
      if (hoverPreviewTimerRef.current)
        window.clearTimeout(hoverPreviewTimerRef.current);
      if (hoverPreviewCloseTimerRef.current)
        window.clearTimeout(hoverPreviewCloseTimerRef.current);
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
    if (left + rect.width > vw - margin)
      left = Math.max(margin, vw - rect.width - margin);
    if (top + rect.height > vh - margin)
      top = Math.max(margin, vh - rect.height - margin);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [hoverPreview, popoverPos, bunnyResolutions, hoverPreviewLoading]);

  const cancelHoverPreviewCloseTimer = () => {
    if (hoverPreviewCloseTimerRef.current) {
      window.clearTimeout(hoverPreviewCloseTimerRef.current);
      hoverPreviewCloseTimerRef.current = null;
    }
  };

  const handleHoverPreviewEnter = (
    media: any,
    i: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 6, left: rect.left });
    setHoverPreview({ media, index: i });
    cancelHoverPreviewCloseTimer();
    if (media.libraryId && media.videoId) {
      const cacheKey = `${media.libraryId}/${media.videoId}`;
      if (!(cacheKey in bunnyResolutions)) {
        setHoverPreviewLoading(true);
        fetch("/api/bunny/video-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryId: media.libraryId,
            videoId: media.videoId,
          }),
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
            console.error("Failed to fetch bunny resolutions:", err);
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

  const handleThumbFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    mediaIndex: number,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isJpgPng =
      /\.(jpe?g|png)$/i.test(file.name) ||
      file.type === "image/jpeg" ||
      file.type === "image/png";
    if (!isJpgPng) {
      alert("Bitte eine JPG- oder PNG-Datei als Thumbnail auswählen.");
      return;
    }
    setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "uploading" }));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/upload-custom-thumb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageData: reader.result,
            postId,
            mediaIndex,
          }),
        });
        const data = await res.json();
        if (!data.success)
          throw new Error(data.error || "Upload fehlgeschlagen");
        const newMedia = [...mediaItems];
        const current = newMedia[mediaIndex] || {};
        const isBunny =
          current.type === "bunny" ||
          (!!current.videoId && !!current.libraryId);
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
        setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "done" }));
        window.setTimeout(() => {
          setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "idle" }));
        }, 1500);
      } catch (err: any) {
        console.error("Custom-Thumbnail-Upload fehlgeschlagen:", err);
        alert(err.message || "Custom-Thumbnail-Upload fehlgeschlagen.");
        setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "error" }));
        window.setTimeout(() => {
          setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "idle" }));
        }, 2500);
      }
    };
    reader.onerror = () => {
      alert("Die Datei konnte nicht gelesen werden.");
      setThumbFileState((prev) => ({ ...prev, [mediaIndex]: "idle" }));
    };
    reader.readAsDataURL(file);
  };

  const openCustomThumbnailModal = async (
    media: any,
    index: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setCustomThumbnailLoading(true);
    try {
      if (media.libraryId && media.videoId) {
        const res = await fetch("/api/bunny/video-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryId: media.libraryId,
            videoId: media.videoId,
          }),
        });
        const data = await res.json();
        if (!data.success)
          throw new Error(data.error || "Failed to get Bunny video URL");
        setCustomThumbnailVideoUrl(data.videoUrl);
      } else {
        const res = await fetch("/api/video/resolve-source", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, index, media }),
        });
        const data = await res.json();
        let videoSrc = "";
        if (data.success && data.videoUrl) {
          videoSrc = data.videoUrl;
        } else {
          videoSrc =
            getVideoSrc(media, true) || getVideoSrc(media) || media.url || "";
        }
        if (!videoSrc) {
          throw new Error(
            data.error || "No playable video source found for this item.",
          );
        }
        setCustomThumbnailVideoUrl(videoSrc);
      }
      setCustomThumbnailMedia({ media, index });
    } catch (err: any) {
      console.error("Failed to open custom thumbnail modal:", err);
      alert(err.message || "Could not open video for custom thumbnail.");
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
    const isBunny =
      current.type === "bunny" || (!!current.videoId && !!current.libraryId);
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

  const addMedia = (type: "image" | "youtube" | "bunny") => {
    const newMedia = [
      {
        type,
        image: "",
        image_large: "",
        link: "",
        youtubeId: "",
        youtubeUrl: "",
      },
      ...mediaItems,
    ];
    handleUpdatePostMedia(postId, newMedia);
  };

  const applyUrlToMedia = (i: number, urlString: string) => {
    const url = urlString.trim();
    if (!url) return;
    const media = mediaItems[i];
    if (!media) return;
    setApplyLoading((prev) => ({ ...prev, [i]: true }));

    if (media.type === "bunny" && media.videoId && media.libraryId) {
      const existingVidId = media.videoId;
      const existingLibId = media.libraryId;
      fetch("/api/bunny/sync-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libraryId: existingLibId,
          videoId: existingVidId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          setApplyLoading((prev) => ({ ...prev, [i]: false }));
          if (data.success) {
            const syncedMedia = [...mediaItemsRef.current];
            const targetIdx = syncedMedia.findIndex(
              (m) => m && m.videoId === existingVidId,
            );
            const idx = targetIdx !== -1 ? targetIdx : i;
            syncedMedia[idx] = {
              ...syncedMedia[idx],
              type: "bunny",
              videoId: existingVidId,
              libraryId: existingLibId,
              url: `https://iframe.mediadelivery.net/embed/${existingLibId}/${existingVidId}`,
              image_original: `https://iframe.mediadelivery.net/embed/${existingLibId}/${existingVidId}`,
              image:
                data.image_2k ||
                data.image_3k ||
                data.image_1k ||
                data.image_thumb ||
                data.image ||
                "",
              image_thumb: data.image_thumb || data.image || "",
              image_1k: data.image_1k || "",
              image_2k: data.image_2k || "",
              image_3k: data.image_3k || "",
              bunnyThumbUrl:
                data.bunnyThumbUrl ||
                `https://iframe.mediadelivery.net/${existingLibId}/${existingVidId}/thumbnail.jpg`,
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

    if (bunnyLibraryId && bunnyVideoId) {
      const embedUrl = `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`;
      const bunnyThumbUrl = `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`;
      const newMedia = [...mediaItemsRef.current];
      newMedia[i] = {
        ...media,
        type: "bunny",
        libraryId: bunnyLibraryId,
        videoId: bunnyVideoId,
        url: embedUrl,
        image_original: embedUrl,
        bunnyThumbUrl,
      };
      handleUpdatePostMedia(postId, newMedia);
      fetch("/api/bunny/sync-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          libraryId: bunnyLibraryId,
          videoId: bunnyVideoId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          setApplyLoading((prev) => ({ ...prev, [i]: false }));
          if (data.success) {
            const syncedMedia = [...mediaItemsRef.current];
            const targetIdx = syncedMedia.findIndex(
              (m) => m && m.videoId === bunnyVideoId,
            );
            const idx = targetIdx !== -1 ? targetIdx : i;
            syncedMedia[idx] = {
              ...syncedMedia[idx],
              type: "bunny",
              videoId: bunnyVideoId,
              libraryId: bunnyLibraryId,
              url: embedUrl,
              image_original: embedUrl,
              image:
                data.image_2k ||
                data.image_3k ||
                data.image_1k ||
                data.image_thumb ||
                data.image ||
                data.url,
              image_thumb: data.image_thumb || data.url,
              image_1k: data.image_1k || "",
              image_2k: data.image_2k || "",
              image_3k: data.image_3k || "",
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
        type: "youtube",
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
    if (
      mediaSelection &&
      mediaSelection.sourcePostId === postId &&
      mediaSelection.mediaIndices.includes(index)
    ) {
      onMediaDragStart(postId, mediaSelection.mediaIndices, media);
    } else {
      onMediaDragStart(postId, [index], media);
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const handleMediaDragOver = (e: React.DragEvent) => {
    if (hasFileDrag(e)) return;
    if (activeMediaDrag && activeMediaDrag.sourcePostId !== postId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
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
      onCrossPostMediaDrop(
        activeMediaDrag.sourcePostId,
        activeMediaDrag.mediaIndices,
        postId,
        index,
      );
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
    const finalUrl =
      getDisplayImage(thumbUrl, isR2Fallback, isEmbeddedData) || thumbUrl;
    window.open(finalUrl, "_blank", "noopener,noreferrer");
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
