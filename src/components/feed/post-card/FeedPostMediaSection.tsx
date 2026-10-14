import React from "react";
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
} from "lucide-react";
import type { CardUploadStatus } from "../../../hooks/useFeedCardFileDrop";
import {
  getHighestResThumbUrl,
  getPreviewImageSrc,
  getPreviewVideoSrc,
  isInstagramVideoCandidate,
} from "./feedPostMediaHelpers";

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
  getDisplayImage: (
    url: string | undefined,
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
  ) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleFeedImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  setSelectedImage: (post: any) => void;
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
  localUrlInputs: Record<number, string>;
  setLocalUrlInputs: React.Dispatch<
    React.SetStateAction<Record<number, string>>
  >;
  applyLoading: Record<number, boolean>;
  thumbFileState: Record<number, "idle" | "uploading" | "done" | "error">;
  customThumbnailLoading: boolean;
  handleImportInputChange: (
    e: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: string,
    options: { kind: "image" | "video"; mediaIndex?: number; isNew?: boolean },
  ) => void;
  addMedia: (type: "image" | "youtube" | "bunny") => void;
  removeMedia: (i: number) => void;
  applyUrlToMedia: (i: number, urlString: string) => void;
  handleThumbFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    mediaIndex: number,
  ) => void;
  openCustomThumbnailModal: (
    media: any,
    index: number,
    e: React.MouseEvent,
  ) => void;
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
          ? "h-auto min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar"
          : renderedMediaCount > 1
            ? "h-auto min-h-[300px] max-h-[600px] overflow-hidden"
            : "aspect-[4/3] overflow-hidden"
      } cursor-pointer bg-black/50 shrink-0 ${isEditing && post.hidden ? "grayscale brightness-50" : ""} ${
        isDragging ? "pointer-events-none" : ""
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
        <div
          className={`flex flex-col gap-2 p-2 ${isDragging ? "pointer-events-none" : ""}`}
        >
          <div
            className="flex gap-2 mb-2 flex-wrap"
            onClick={(e) => e.stopPropagation()}
          >
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
                onChange={(e) =>
                  handleImportInputChange(e, "+ Bild", {
                    kind: "image",
                    isNew: true,
                  })
                }
              />
            </label>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addMedia("youtube");
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
                onChange={(e) =>
                  handleImportInputChange(e, "+ Video (Datei)", {
                    kind: "video",
                  })
                }
              />
            </label>
          </div>

          {mediaItems.map((media: any, i: number) => {
            const isSelected = !!(
              mediaSelection &&
              mediaSelection.sourcePostId === post.id &&
              mediaSelection.mediaIndices.includes(i)
            );
            const isVideoCand = isInstagramVideoCandidate(
              media,
              post.source,
              getImageSrc,
            );
            const highResThumb =
              media.type !== "youtube"
                ? getHighestResThumbUrl(media, isValidImageCandidate)
                : undefined;
            const previewImgSrc = getPreviewImageSrc(media, getImageSrc);
            const previewVidSrc = getPreviewVideoSrc(media, getVideoSrc);

            return (
              <div
                key={i}
                className={`relative w-full bg-black/30 rounded p-2 border ${
                  isSelected ? "border-sky-400" : "border-white/10"
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
                    {media.type === "youtube"
                      ? "YouTube"
                      : media.type === "bunny"
                        ? "Bunny"
                        : media.type === "video"
                          ? "Video"
                          : "Bild"}
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
                        onMouseEnter={(e) =>
                          handleHoverPreviewEnter(media, i, e)
                        }
                        onMouseLeave={handleHoverPreviewLeave}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20"
                        title="Vorschau & Auflösungen"
                      >
                        <Eye className="w-2.5 h-2.5" />
                      </button>
                      <label
                        className={`w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20 cursor-pointer ${
                          thumbFileState[i] === "uploading"
                            ? "opacity-60 pointer-events-none"
                            : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                        title="Eigenes Thumbnail (JPG/PNG) hochladen"
                      >
                        {thumbFileState[i] === "uploading" ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : thumbFileState[i] === "done" ? (
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

                {media.type === "youtube" || media.type === "bunny" ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={
                          localUrlInputs[i] ??
                          (media.youtubeUrl || media.url || "")
                        }
                        onChange={(e) =>
                          setLocalUrlInputs((prev) => ({
                            ...prev,
                            [i]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const url =
                              localUrlInputs[i] ??
                              (media.youtubeUrl || media.url || "");
                            applyUrlToMedia(i, url);
                          }
                        }}
                        className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/40"
                        placeholder="YouTube oder Bunny URL einfügen..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = (
                            localUrlInputs[i] ??
                            (media.youtubeUrl || media.url || "")
                          ).trim();
                          applyUrlToMedia(i, url);
                        }}
                        disabled={applyLoading[i]}
                        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="URL anwenden"
                      >
                        {applyLoading[i] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>
                          {media.type === "bunny" ? "ThumbDL" : "Anwenden"}
                        </span>
                      </button>
                    </div>
                    {applyLoading[i] && (
                      <div className="flex items-center gap-1 text-white/50 text-[10px]">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Bunny Metadaten werden geladen…</span>
                      </div>
                    )}
                  </div>
                ) : media.type === "video" ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1 text-xs text-white/60 flex-1">
                        <Film className="w-3 h-3 text-white/40" />
                        <span className="truncate">
                          {media.url
                            ? media.url.split("/").pop()
                            : "Video-Datei"}
                        </span>
                        {!media.image_thumb && !media.image && (
                          <span className="text-yellow-400/60 ml-1">
                            (kein Thumbnail)
                          </span>
                        )}
                      </div>
                      <label className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white cursor-pointer transition-colors">
                        <ImageIcon className="w-3 h-3" /> Ändern
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) =>
                            handleImportInputChange(e, "Video ersetzen", {
                              kind: "video",
                            })
                          }
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
                      onChange={(e) =>
                        handleImportInputChange(e, "Bild ersetzen", {
                          kind: "image",
                          mediaIndex: i,
                        })
                      }
                    />
                  </label>
                )}

                {media.image || media.image_preview || media.url ? (
                  media.type === "video" ? (
                    previewImgSrc ? (
                      <img
                        src={getDisplayImage(
                          previewImgSrc,
                          isR2Fallback,
                          isEmbeddedData,
                        )}
                        alt=""
                        className="w-full h-24 object-cover rounded cursor-pointer"
                        onClick={(e) => {
                          if (e.ctrlKey || e.shiftKey || e.altKey) return;
                          e.stopPropagation();
                          setSelectedImage(post);
                        }}
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const next =
                            img.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = "flex";
                        }}
                      />
                    ) : previewVidSrc ? (
                      <video
                        src={getDisplayImage(
                          previewVidSrc,
                          isR2Fallback,
                          isEmbeddedData,
                        )}
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
                      src={getDisplayImage(
                        getVideoSrc(media) ?? undefined,
                        isR2Fallback,
                        isEmbeddedData,
                      )}
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
                      src={getDisplayImage(
                        getImageSrc(media) ?? undefined,
                        isR2Fallback,
                        isEmbeddedData,
                      )}
                      alt=""
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      onClick={(e) => {
                        if (e.ctrlKey || e.shiftKey || e.altKey) return;
                        e.stopPropagation();
                        setSelectedImage(post);
                      }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes("maxresdefault.jpg")) {
                          target.src = target.src.replace(
                            "maxresdefault.jpg",
                            "hqdefault.jpg",
                          );
                        } else if (
                          media.image_preview &&
                          target.src !==
                            getDisplayImage(
                              media.image_preview,
                              isR2Fallback,
                              isEmbeddedData,
                            )
                        ) {
                          target.src =
                            getDisplayImage(
                              media.image_preview,
                              isR2Fallback,
                              isEmbeddedData,
                            ) || "";
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="w-full h-24 bg-white/10 rounded flex items-center justify-center text-white/40">
                    {media.type === "youtube" || media.type === "bunny" ? (
                      <Youtube className="w-6 h-6" />
                    ) : media.type === "video" ? (
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
          {displayMedia.image ||
          displayMedia.image_preview ||
          displayMedia.url ? (
            displayMedia.type === "video" ? (
              getPreviewImageSrc(displayMedia, getImageSrc) ? (
                <img
                  src={getDisplayImage(
                    getPreviewImageSrc(displayMedia, getImageSrc),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  alt={post.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                    !isEditing ? "group-hover:scale-[1.03]" : ""
                  }`}
                  onLoad={handleFeedImageLoad}
                  onClick={() => setSelectedImage(post)}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (
                      displayMedia.image_preview &&
                      target.src !==
                        getDisplayImage(
                          displayMedia.image_preview,
                          isR2Fallback,
                          isEmbeddedData,
                        )
                    ) {
                      target.src =
                        getDisplayImage(
                          displayMedia.image_preview,
                          isR2Fallback,
                          isEmbeddedData,
                        ) || "";
                    }
                  }}
                />
              ) : getPreviewVideoSrc(displayMedia, getVideoSrc) ? (
                <video
                  src={getDisplayImage(
                    getPreviewVideoSrc(displayMedia, getVideoSrc),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                    !isEditing ? "group-hover:scale-[1.03]" : ""
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
                src={getDisplayImage(
                  getVideoSrc(displayMedia) ?? undefined,
                  isR2Fallback,
                  isEmbeddedData,
                )}
                className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                  !isEditing ? "group-hover:scale-[1.03]" : ""
                }`}
                autoPlay
                loop
                muted
                playsInline
                onClick={() => setSelectedImage(post)}
              />
            ) : (
              <img
                src={getDisplayImage(
                  getImageSrc(displayMedia) ?? undefined,
                  isR2Fallback,
                  isEmbeddedData,
                )}
                alt={post.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${
                  !isEditing ? "group-hover:scale-[1.03]" : ""
                }`}
                onLoad={handleFeedImageLoad}
                onClick={() => setSelectedImage(post)}
                onError={(e) => {
                  const target = e.currentTarget;
                  if (target.src.includes("maxresdefault.jpg")) {
                    target.src = target.src.replace(
                      "maxresdefault.jpg",
                      "hqdefault.jpg",
                    );
                  } else if (
                    displayMedia.image_preview &&
                    target.src !==
                      getDisplayImage(
                        displayMedia.image_preview,
                        isR2Fallback,
                        isEmbeddedData,
                      )
                  ) {
                    target.src =
                      getDisplayImage(
                        displayMedia.image_preview,
                        isR2Fallback,
                        isEmbeddedData,
                      ) || "";
                  }
                }}
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              {displayMedia.type === "video" ? (
                <Film className="w-12 h-12" />
              ) : (
                <ImageIcon className="w-12 h-12" />
              )}
            </div>
          )}
          {(displayMedia.type === "youtube" ||
            displayMedia.type === "bunny" ||
            displayMedia.type === "video") &&
            !isEditing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="w-16 h-16 bg-white/30 hover:bg-white/40 rounded-full flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImage(post);
                  }}
                >
                  {displayMedia.type === "video" ? (
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

      {isEditing &&
        (activeUploads[post.id] > 0 ||
          (cardUploadStatus && cardUploadStatus.phase !== "hover")) && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 px-4 text-center">
            {cardUploadStatus?.phase === "done" ? (
              <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
            ) : cardUploadStatus?.phase === "error" ? (
              <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
            )}
            <span
              className={`text-xs sm:text-sm ${
                cardUploadStatus?.phase === "done"
                  ? "text-green-300"
                  : cardUploadStatus?.phase === "error"
                    ? "text-red-300"
                    : "text-white/70"
              }`}
            >
              {cardUploadStatus?.message ||
                `Lädt hoch... (${activeUploads[post.id]})`}
            </span>
          </div>
        )}
    </div>
  );
};
