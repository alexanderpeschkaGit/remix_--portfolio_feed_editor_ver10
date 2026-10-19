import React from "react";
import { ChevronLeft, ChevronRight, Play, Youtube } from "lucide-react";
import { isVideoFileMedia } from "../../../utils/postMediaHelpers";

export interface LightboxActivePlayerProps {
  postId: string;
  postTitle: string;
  mediaList: any[];
  activeMedia: any;
  activeMediaIndex: number;
  setActiveMediaIndex: React.Dispatch<React.SetStateAction<number>>;
  shouldPlayActiveMedia: boolean;
  setShouldPlayActiveMedia: React.Dispatch<React.SetStateAction<boolean>>;
  activeVideoRef: React.RefObject<HTMLVideoElement | null>;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  showEmbeddedPreview: boolean;
  activeMediaPosterSrc: string | undefined;
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
}

export const LightboxActivePlayer: React.FC<LightboxActivePlayerProps> = ({
  postId,
  postTitle,
  mediaList,
  activeMedia,
  activeMediaIndex,
  setActiveMediaIndex,
  shouldPlayActiveMedia,
  setShouldPlayActiveMedia,
  activeVideoRef,
  isR2Fallback,
  isEmbeddedData,
  showEmbeddedPreview,
  activeMediaPosterSrc,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
}) => {
  return (
    <div
      className="group relative w-full h-full flex items-center justify-center"
      onMouseEnter={() => setShouldPlayActiveMedia(true)}
      onMouseLeave={() => setShouldPlayActiveMedia(false)}
    >
      {mediaList.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 transition-colors hover:text-white"
            onClick={() =>
              setActiveMediaIndex(
                (prev) => (prev - 1 + mediaList.length) % mediaList.length,
              )
            }
            aria-label="Vorheriges Medium"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 transition-colors hover:text-white"
            onClick={() =>
              setActiveMediaIndex((prev) => (prev + 1) % mediaList.length)
            }
            aria-label="Nächstes Medium"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {showEmbeddedPreview ? (
        <button
          type="button"
          className="relative flex items-center justify-center"
          onClick={() => setShouldPlayActiveMedia(true)}
          aria-label="Video starten"
        >
          {activeMediaPosterSrc ? (
            <img
              src={activeMediaPosterSrc}
              alt={postTitle}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
              referrerPolicy="no-referrer"
              onLoad={(e) =>
                handleImageLoad(`${postId}-${activeMediaIndex}`, e)
              }
              onError={(e) => {
                const target = e.currentTarget as HTMLImageElement;
                if (target.src.includes("maxresdefault.jpg")) {
                  target.src = target.src.replace(
                    "maxresdefault.jpg",
                    "hqdefault.jpg",
                  );
                }
              }}
            />
          ) : (
            <div className="flex aspect-video w-full max-w-5xl items-center justify-center rounded-lg bg-white/5 shadow-2xl">
              <Youtube className="w-12 h-12 text-white/50" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
              <Play className="ml-1 h-7 w-7" />
            </div>
          </div>
        </button>
      ) : activeMedia.type === "bunny" &&
        activeMedia.videoId &&
        activeMedia.libraryId ? (
        <div className="w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0">
          <iframe
            src={`https://iframe.mediadelivery.net/embed/${activeMedia.libraryId}/${activeMedia.videoId}?autoplay=${shouldPlayActiveMedia ? "true" : "false"}&loop=false&muted=false&playsinline=true&preload=true&responsive=true`}
            loading="lazy"
            className="w-full h-full border-0"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        </div>
      ) : activeMedia.type === "youtube" && activeMedia.youtubeId ? (
        <div className="w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0">
          <iframe
            src={`https://www.youtube.com/embed/${activeMedia.youtubeId}?autoplay=${shouldPlayActiveMedia ? 1 : 0}&mute=1`}
            className="w-full h-full border-0"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : isVideoFileMedia(activeMedia, getVideoSrc) ? (
        <div className="relative w-full h-full flex items-center justify-center">
          <video
            ref={activeVideoRef}
            src={getDisplayImage(
              getVideoSrc(activeMedia, true),
              isR2Fallback,
              isEmbeddedData,
            )}
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
            controls
            muted
            playsInline
            preload="metadata"
            poster={activeMediaPosterSrc}
          />
        </div>
      ) : (
        <div className="relative w-full h-full flex items-center justify-center">
          <img
            src={getDisplayImage(
              getImageSrc(activeMedia, true),
              isR2Fallback,
              isEmbeddedData,
            )}
            alt={postTitle}
            className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
            referrerPolicy="no-referrer"
            onLoad={(e) =>
              handleImageLoad(`${postId}-${activeMediaIndex}`, e)
            }
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (target.src.includes("maxresdefault.jpg")) {
                target.src = target.src.replace(
                  "maxresdefault.jpg",
                  "hqdefault.jpg",
                );
              } else if (
                activeMedia.image &&
                target.src !==
                  getDisplayImage(
                    activeMedia.image,
                    isR2Fallback,
                    isEmbeddedData,
                  ) &&
                target.src !== activeMedia.image
              ) {
                target.src =
                  getDisplayImage(
                    activeMedia.image,
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
};
