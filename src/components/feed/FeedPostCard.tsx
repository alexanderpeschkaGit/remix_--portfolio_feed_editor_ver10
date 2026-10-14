import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Eye, GripVertical, Upload } from "lucide-react";
import { useFeedCardFileDrop } from "../../hooks/useFeedCardFileDrop";
import { useFeedCardMediaActions } from "../../hooks/useFeedCardMediaActions";
import {
  getAsString,
  getResolutionVariants,
  requestKiCaseStudyEdit,
} from "../../utils/kiEditClient";
import { CustomThumbnailModal } from "../modals/CustomThumbnailModal";
import {
  FeedPostBodySection,
  FeedPostHoverPopover,
} from "./post-card/FeedPostBodyAndPopover";
import { FeedPostMediaSection } from "./post-card/FeedPostMediaSection";
import { isRenderableFeedMedia } from "./post-card/feedPostMediaHelpers";

interface FeedPostCardProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  showResolutions: boolean;
  imageDimensions: Record<string, string>;
  getDisplayImage: (
    url: string | undefined,
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
  ) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleImageLoad: (
    id: string,
    e: React.SyntheticEvent<HTMLImageElement>,
  ) => void;
  formatDescription: (description: string, title: string) => string;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  handleImageUpload: (
    postId: string,
    file: File,
    mediaIndex?: number,
    isNew?: boolean,
  ) => void;
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
  bunnyProgress?: Record<
    string,
    { step: string; progress: number; text: string }
  >;
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
  onMediaClick: (
    postId: string,
    mediaIndex: number,
    ctrlKey: boolean,
    shiftKey: boolean,
  ) => void;
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: post.id,
    disabled: !isEditing,
  });

  const [localTitle, setLocalTitle] = useState(() =>
    getAsString(post.title, "title"),
  );
  const [localDescription, setLocalDescription] = useState(() =>
    getAsString(post.description, "description"),
  );
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [mergeChoice, setMergeChoice] = useState<"y" | "n">("y");
  const [isGeneratingKi, setIsGeneratingKi] = useState(false);
  const [undoDescription, setUndoDescription] = useState<string | null>(null);
  const mergeYesRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCardUndo = () => {
    if (undoDescription !== null) {
      setLocalDescription(undoDescription);
      handlePostChange(post.id, "description", undoDescription);
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
      const itemsForKi =
        post.mergedMedia && post.mergedMedia.length > 0
          ? post.mergedMedia
          : [post];
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
        handlePostChange(post.id, "description", generatedText);
      }
    } catch (error: any) {
      console.error("KI-Edit fehlgeschlagen:", error);
      alert(`KI-Edit fehlgeschlagen: ${error.message || "Unbekannter Fehler"}`);
    } finally {
      setIsGeneratingKi(false);
    }
  };

  const rawMediaItems = useMemo(() => {
    return post.mergedMedia && post.mergedMedia.length > 0
      ? post.mergedMedia
      : [
          {
            type: post.type || "image",
            image: post.image,
            image_large: post.image_large,
            youtubeId: post.youtubeId,
            youtubeUrl: post.youtubeUrl,
            link: post.url,
          },
        ];
  }, [
    post.mergedMedia,
    post.type,
    post.image,
    post.image_large,
    post.youtubeId,
    post.youtubeUrl,
    post.url,
  ]);

  useEffect(() => {
    setLocalTitle(getAsString(post.title, "title"));
  }, [post.title]);

  useEffect(() => {
    setLocalDescription(getAsString(post.description, "description"));
  }, [post.description]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [localDescription, isEditing]);

  useEffect(() => {
    if (!confirmingMerge) return;
    const handleMergeKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setMergeChoice((prev) => (prev === "y" ? "n" : "y"));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (mergeChoice === "y") {
          handleMergeDown(index);
        }
        setConfirmingMerge(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setConfirmingMerge(false);
      }
    };
    window.addEventListener("keydown", handleMergeKeyDown);
    return () => window.removeEventListener("keydown", handleMergeKeyDown);
  }, [confirmingMerge, mergeChoice, index, handleMergeDown]);

  useEffect(() => {
    if (confirmingMerge && mergeYesRef.current) {
      mergeYesRef.current.focus();
    }
  }, [confirmingMerge]);

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const mediaItems = isEditing
    ? rawMediaItems
    : rawMediaItems.filter(isRenderableFeedMedia);
  const mediaItemsRef = useRef(mediaItems);
  mediaItemsRef.current = mediaItems;
  const renderedMediaCount = mediaItems.length;
  const displayMedia = mediaItems[0] || post;
  const feedDimensionsKey = post.id ? `${post.id}-0` : "";
  const resolutionVariants = useMemo(
    () => getResolutionVariants(displayMedia),
    [displayMedia],
  );

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
    const bunnyVideos = mergedMedia.filter(
      (m: any) => m.type === "bunny" && m.videoId && (m.libraryId || ""),
    );
    if (bunnyVideos.length === 0) return;
    const title = newTitle !== undefined ? newTitle : localTitle;
    const desc =
      newDescription !== undefined ? newDescription : localDescription;
    bunnyVideos.forEach((m: any) => {
      fetch("/api/bunny/update-video-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: m.videoId,
          libraryId: m.libraryId || "",
          title: title || "",
          projectId: post.id,
          description: desc || "",
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-[#111] rounded-xl overflow-hidden border ${
        isDragging
          ? "border-blue-500 shadow-xl shadow-black/50"
          : "border-white/5 hover:border-white/20"
      } transition-all duration-300 flex flex-col relative ${
        isFileDragOverCard ? "ring-2 ring-blue-400/50 ring-offset-0" : ""
      } ${isMediaDragOvered ? "ring-2 ring-cyan-400/70 border-cyan-400/60 shadow-lg shadow-cyan-400/10 scale-[1.02]" : ""}`}
      onDragEnter={handleCardDragEnter}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      {isEditing &&
        isFileDragOverCard &&
        cardUploadStatus?.phase === "hover" && (
          <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none">
            <div className="rounded-2xl border border-blue-400/40 bg-black/55 backdrop-blur-md px-4 py-3 shadow-2xl">
              <div className="flex items-center gap-3">
                <Upload className="w-5 h-5 text-blue-300 animate-bounce shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-blue-100">
                    Files can be dropped here
                  </div>
                  <div className="text-[11px] sm:text-xs text-blue-100/70 truncate">
                    {cardUploadStatus.message}
                  </div>
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
              isDragging ? "pointer-events-none" : ""
            }`}
            title={post.hidden ? "Anzeigen" : "Verstecken"}
          >
            <Eye
              className={`w-4 h-4 ${post.hidden ? "opacity-100" : "opacity-70"}`}
            />
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
          postTitle={localTitle || post.title || "Untitled"}
          postId={post.id}
          getDisplayImage={getDisplayImage}
          isR2Fallback={isR2Fallback}
          isEmbeddedData={isEmbeddedData}
          onSave={handleCustomThumbnailSave}
          onClose={() => {
            setCustomThumbnailMedia(null);
            setCustomThumbnailVideoUrl("");
          }}
        />
      )}
    </div>
  );
}
