import React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ExternalLink,
  FoldVertical,
  Loader2,
  Maximize2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { PROJECT_STATES } from "../../../constants";
import { getResolutionVariants } from "../../../utils/kiEditClient";
import {
  getBunnyPosterSrc,
  getStandardVideoPosterSrc,
} from "./feedPostMediaHelpers";

interface FeedPostBodySectionProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  isDragging: boolean;
  bunnyProgress?: Record<
    string,
    { step: string; progress: number; text: string }
  >;
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
  mergeChoice: "y" | "n";
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
            {progress.step !== "done" && progress.step !== "error" ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            ) : progress.step === "done" ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <span className="text-red-400 text-xs">⚠</span>
            )}
            <span
              className={`text-xs ${
                progress.step === "done"
                  ? "text-green-400"
                  : progress.step === "error"
                    ? "text-red-400"
                    : "text-blue-400"
              }`}
            >
              {progress.text}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress.step === "error"
                  ? "bg-red-500"
                  : progress.step === "done"
                    ? "bg-green-500"
                    : "bg-blue-500"
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      <div
        className={`p-4 flex flex-col gap-2 flex-grow ${isDragging ? "pointer-events-none" : ""}`}
      >
        {isEditing ? (
          <>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                const oldTitle =
                  typeof post.title === "string"
                    ? post.title
                    : post.title?.title || "";
                const newTitle = localTitle.trim();
                handlePostChange(post.id, "title", localTitle);
                if (
                  newTitle !== oldTitle &&
                  oldTitle !== undefined &&
                  post.mergedMedia?.length > 0
                ) {
                  const hasVideo = post.mergedMedia.some(
                    (m: any) =>
                      (m.type === "video" || m.type === "bunny") &&
                      m.image_original,
                  );
                  if (hasVideo) {
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
                        if (data.changed)
                          console.log(
                            `[rename] Project folder renamed: ${data.renamed} dirs updated`,
                          );
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
                  typeof post.description === "string"
                    ? post.description
                    : post.description?.description || "";
                handlePostChange(post.id, "description", localDescription);
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
                      backgroundColor: isActive
                        ? s.bright
                        : isHovered
                          ? s.muted
                          : "#1f2937",
                      color: isActive || isHovered ? "white" : "#9ca3af",
                      boxShadow: isActive
                        ? `0 0 10px ${s.bright}`
                        : isHovered
                          ? `0 0 5px ${s.muted}`
                          : "none",
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
                    mergeChoice === "y"
                      ? "bg-green-600 border-green-400 text-white ring-1 ring-green-300"
                      : "bg-transparent border-white/20 text-white/60 hover:bg-white/10"
                  }`}
                >
                  y
                </button>
                <button
                  onClick={() => setConfirmingMerge(false)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    mergeChoice === "n"
                      ? "bg-red-600 border-red-400 text-white ring-1 ring-red-300"
                      : "bg-transparent border-white/20 text-white/60 hover:bg-white/10"
                  }`}
                >
                  n
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <h2
              className="font-medium text-sm text-white/90 line-clamp-2"
              title={localTitle}
            >
              {localTitle}
            </h2>
            {localDescription && (
              <div
                className="text-xs text-white/60 line-clamp-3 mt-1"
                dangerouslySetInnerHTML={{
                  __html: formatDescription(localDescription, localTitle),
                }}
              />
            )}
            {post.states && post.states.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.states.map((stateId: string, idx: number) => {
                  const state = PROJECT_STATES.find(
                    (s) =>
                      String(s.id).toLowerCase() ===
                      String(stateId).toLowerCase(),
                  );
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
          <span className="text-xs text-white/40 uppercase tracking-wider">
            {post.network_name}
          </span>
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
  getDisplayImage: (
    url: string | undefined,
    isR2Fallback: boolean,
    isEmbeddedData: boolean,
  ) => string | undefined;
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
  const cacheKey = isBunny
    ? `${hoverMedia.libraryId}/${hoverMedia.videoId}`
    : null;
  const resolCache = cacheKey ? bunnyResolutions[cacheKey] : null;
  const posterSrc = isBunny
    ? getBunnyPosterSrc(
        hoverMedia,
        getDisplayImage,
        isR2Fallback,
        isEmbeddedData,
        isValidImageCandidate,
      )
    : getStandardVideoPosterSrc(
        hoverMedia,
        getDisplayImage,
        isR2Fallback,
        isEmbeddedData,
      );
  const variantChips = getResolutionVariants(hoverMedia);
  const width =
    isBunny && resolCache ? resolCache.width : hoverMedia.image_width || 0;
  const height =
    isBunny && resolCache ? resolCache.height : hoverMedia.image_height || 0;
  const length = isBunny && resolCache ? resolCache.length : 0;

  return createPortal(
    <div
      ref={hoverPreviewRef}
      style={{
        position: "fixed",
        top: popoverPos.top,
        left: popoverPos.left,
        zIndex: 1000,
      }}
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
          {width > 0 && height > 0 ? `${width} × ${height}` : ""}
          {isBunny && resolCache && length > 0 ? ` · Dauer: ${length}s` : ""}
        </div>
      )}
      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
        Bildvarianten
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {variantChips.length > 0 ? (
          variantChips.map(({ key, label }) => (
            <span
              key={key}
              className="bg-white/20 rounded px-1.5 text-[10px] text-white"
            >
              {label}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-white/40">–</span>
        )}
      </div>
      {isBunny && (
        <>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
            Video-Auflösungen
          </div>
          <div className="flex flex-wrap gap-1">
            {hoverPreviewLoading && !resolCache ? (
              <Loader2 className="w-3 h-3 animate-spin text-white/50" />
            ) : resolCache && resolCache.availableResolutions ? (
              String(resolCache.availableResolutions)
                .split(",")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((r) => (
                  <span
                    key={r}
                    className="bg-white/20 rounded px-1.5 text-[10px] text-white"
                  >
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
    document.body,
  );
};
