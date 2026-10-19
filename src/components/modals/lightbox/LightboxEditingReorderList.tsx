import React from "react";
import { GripVertical, Image as ImageIcon } from "lucide-react";
import { getResolutionVariants, isVideoFileMedia } from "../../../utils/postMediaHelpers";

export interface LightboxEditingReorderListProps {
  postId: string;
  postTitle: string;
  mediaList: any[];
  isEditing: boolean;
  showResolutions: boolean;
  lightboxDraggedIdx: number | null;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined;
  handleImageLoad: (
    id: string,
    e: React.SyntheticEvent<HTMLImageElement>,
  ) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (
    e: React.DragEvent,
    index: number,
    postId: string,
  ) => void;
}

export const LightboxEditingReorderList: React.FC<LightboxEditingReorderListProps> = ({
  postId,
  postTitle,
  mediaList,
  isEditing,
  showResolutions,
  lightboxDraggedIdx,
  isR2Fallback,
  isEmbeddedData,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
}) => {
  return (
    <>
      {mediaList.map((media: any, i: number) => {
        const variants = getResolutionVariants(media);
        return (
          <div
            key={i}
            className="group w-full flex justify-center relative cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-white/20 rounded-lg p-2"
            draggable={isEditing}
            onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
            onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
            onDrop={(e) => isEditing && handleLightboxDrop(e, i, postId)}
          >
            <div className="absolute top-4 left-4 z-10 bg-black/50 p-2 rounded text-white/50 pointer-events-none">
              <GripVertical className="w-6 h-6" />
            </div>

            {showResolutions && variants.length > 0 && (
              <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
                  {variants.map(({ key, label }) => (
                    <span
                      key={`${postId}-${i}-${key}`}
                      className="inline-flex items-center gap-1 rounded-full bg-black/70 border border-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-md shadow-lg"
                    >
                      <ImageIcon className="w-2.5 h-2.5" />
                      <span>{label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {media.type === "bunny" && media.videoId && media.libraryId ? (
              <div
                className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${
                  lightboxDraggedIdx !== null ? "pointer-events-none" : ""
                }`}
              >
                <iframe
                  src={`https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}?autoplay=false&loop=false&muted=false&playsinline=true&preload=true&responsive=true`}
                  loading="lazy"
                  className="w-full h-full border-0"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                />
              </div>
            ) : media.type === "youtube" && media.youtubeId ? (
              <div
                className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${
                  lightboxDraggedIdx !== null ? "pointer-events-none" : ""
                }`}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=0&mute=0`}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : isVideoFileMedia(media, getVideoSrc) ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  src={getDisplayImage(
                    getVideoSrc(media, true),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={getDisplayImage(
                    getImageSrc(media, true),
                    isR2Fallback,
                    isEmbeddedData,
                  )}
                  alt={postTitle}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => handleImageLoad(`${postId}-${i}`, e)}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src.includes("maxresdefault.jpg")) {
                      target.src = target.src.replace(
                        "maxresdefault.jpg",
                        "hqdefault.jpg",
                      );
                    } else if (
                      media.image &&
                      target.src !==
                        getDisplayImage(
                          media.image,
                          isR2Fallback,
                          isEmbeddedData,
                        ) &&
                      target.src !== media.image
                    ) {
                      target.src =
                        getDisplayImage(
                          media.image,
                          isR2Fallback,
                          isEmbeddedData,
                        ) || "";
                    }
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
