import React from "react";
import {
  ExternalLink,
  Film,
  Loader2,
  Play,
  Sparkles,
  Undo2,
  Youtube,
} from "lucide-react";
import { PROJECT_STATES } from "../../../constants";
import { getAsString, isVideoFileMedia } from "../../../utils/postMediaHelpers";

interface LightboxSidebarProps {
  currentLightboxPost: any;
  isEditing: boolean;
  mediaList: any[];
  activeMediaIndex: number;
  setActiveMediaIndex: (index: number) => void;
  lightboxDraggedIdx: number | null;
  isGenerating: boolean;
  undoText: string | null;
  handleKiEdit: () => void;
  handleUndo: () => void;
  handlePostChange: (id: string, field: string, value: string) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (
    e: React.DragEvent,
    index: number,
    postId: string,
  ) => void;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
}

export function LightboxSidebar({
  currentLightboxPost,
  isEditing,
  mediaList,
  activeMediaIndex,
  setActiveMediaIndex,
  lightboxDraggedIdx,
  isGenerating,
  undoText,
  handleKiEdit,
  handleUndo,
  handlePostChange,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
}: LightboxSidebarProps) {
  return (
    <div
      className={`w-full ${
        isEditing ? "md:w-[600px]" : "md:w-80"
      } bg-[#111] p-6 rounded-xl border border-white/10 shrink-0 max-h-[80vh] overflow-y-auto custom-scrollbar transition-all duration-200`}
    >
      {isEditing ? (
        <input
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-lg font-medium text-white mb-4 focus:border-blue-500 focus:outline-none"
          value={getAsString(currentLightboxPost.title)}
          onChange={(e) =>
            handlePostChange(currentLightboxPost.id, "title", e.target.value)
          }
          placeholder="Titel..."
        />
      ) : (
        <h2 className="text-xl font-medium text-white mb-4">
          {getAsString(currentLightboxPost.title)}
        </h2>
      )}

      {currentLightboxPost.states && currentLightboxPost.states.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {currentLightboxPost.states.map((stateId: string, idx: number) => {
            const state = PROJECT_STATES.find(
              (s) =>
                String(s.id).toLowerCase() === String(stateId).toLowerCase(),
            );
            return state ? (
              <span
                key={`${stateId}-${idx}`}
                className="px-3 py-1 rounded-full text-xs font-medium text-white"
                style={{
                  backgroundColor: state.muted,
                  border: `1px solid ${state.bright}`,
                }}
              >
                {state.label}
              </span>
            ) : null;
          })}
        </div>
      )}

      {isEditing ? (
        <>
          <textarea
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white/80 mb-3 focus:border-blue-500 focus:outline-none min-h-[360px] custom-scrollbar resize-y leading-relaxed"
            value={getAsString(currentLightboxPost.description)}
            onChange={(e) =>
              handlePostChange(
                currentLightboxPost.id,
                "description",
                e.target.value,
              )
            }
            placeholder="Beschreibung..."
          />
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={handleKiEdit}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Generiert eine strukturierte, SEO-optimierte Case Study mit KI"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>KI generiert...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>✨ KI-Edit</span>
                </>
              )}
            </button>
            {undoText !== null && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white/90 border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
                title="Originaltext wiederherstellen"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>↩️ Undo</span>
              </button>
            )}
          </div>
        </>
      ) : (
        currentLightboxPost.description && (
          <div
            className="text-sm text-white/70 space-y-2 mb-6"
            dangerouslySetInnerHTML={{
              __html: getAsString(currentLightboxPost.description).replace(
                /\n/g,
                "<br/>",
              ),
            }}
          />
        )
      )}
      <div className="flex flex-col gap-2">
        <div className="text-xs text-white/40 uppercase tracking-wider mb-2">
          {isEditing ? "Medien sortieren (Drag & Drop)" : "Medien"}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {mediaList.map((media: any, i: number) => (
            <div
              key={i}
              draggable={isEditing}
              onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
              onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
              onDrop={(e) =>
                isEditing && handleLightboxDrop(e, i, currentLightboxPost.id)
              }
              onClick={() => {
                if (!isEditing) {
                  setActiveMediaIndex(i);
                }
              }}
              className={`aspect-square rounded bg-white/5 border overflow-hidden transition-colors ${
                isEditing
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-pointer"
              } ${
                activeMediaIndex === i
                  ? "border-blue-500 ring-1 ring-blue-400/60"
                  : lightboxDraggedIdx === i
                    ? "opacity-50 border-blue-500"
                    : "border-white/10 hover:border-white/30"
              }`}
            >
              {media.type === "bunny" ? (
                <div className="w-full h-full relative">
                  {(() => {
                    const src = getDisplayImage(
                      getImageSrc(media),
                      isR2Fallback,
                      isEmbeddedData,
                    );
                    return src ? (
                      <>
                        <img
                          src={src}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-3.5 h-3.5 text-white fill-white" />
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-900/20">
                        <Film className="w-4 h-4 text-blue-400" />
                      </div>
                    );
                  })()}
                </div>
              ) : media.type === "youtube" && media.youtubeId ? (
                <div className="w-full h-full flex items-center justify-center bg-red-900/20">
                  <Youtube className="w-4 h-4 text-red-500" />
                </div>
              ) : isVideoFileMedia(media, getVideoSrc) ? (
                <video
                  src={getDisplayImage(
                    getVideoSrc(media),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  className="w-full h-full object-cover"
                  muted
                />
              ) : (
                <img
                  src={getDisplayImage(
                    getImageSrc(media),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  className="w-full h-full object-cover"
                  alt=""
                />
              )}
            </div>
          ))}
        </div>

        <div className="text-xs text-white/40 uppercase tracking-wider mb-2">
          Links
        </div>
        {mediaList.map((media: any, i: number) =>
          media.url || media.link ? (
            <a
              key={i}
              href={media.url || media.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Link {i + 1} ansehen
            </a>
          ) : null,
        )}
      </div>
    </div>
  );
}
