import React from "react";
import { Play, Youtube } from "lucide-react";
import { isVideoFileMedia } from "../../../utils/postMediaHelpers";

export interface LightboxScrollGalleryProps {
  postId: string;
  postTitle: string;
  mediaList: any[];
  loadedPlayers: Set<number>;
  onActivatePlayer: (index: number) => void;
  setActiveMediaIndex: React.Dispatch<React.SetStateAction<number>>;
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
  getMediaPosterSrc: (media: any) => string | undefined;
}

export const LightboxScrollGallery: React.FC<LightboxScrollGalleryProps> = ({
  postId,
  postTitle,
  mediaList,
  loadedPlayers,
  onActivatePlayer,
  setActiveMediaIndex,
  isR2Fallback,
  isEmbeddedData,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
  getMediaPosterSrc,
}) => {
  return (
    <div className="w-full max-h-[85vh] overflow-y-auto custom-scrollbar pr-2 space-y-4">
      {mediaList.map((media: any, i: number) => (
        <article
          key={`${postId}-${i}`}
          className="group relative min-h-[min(72vh,720px)] w-full"
          onClick={() => setActiveMediaIndex(i)}
        >
          <div className="flex min-h-[calc(min(72vh,720px)-1.5rem)] w-full items-center justify-center">
            {(media.type === "bunny" && media.videoId && media.libraryId) ||
            (media.type === "youtube" && media.youtubeId) ? (
              loadedPlayers.has(i) ? (
                <div
                  className="w-full max-w-5xl aspect-video overflow-hidden rounded-lg shadow-2xl shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  {media.type === "bunny" ? (
                    <iframe
                      src={`https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}?autoplay=1&loop=false&muted=false&playsinline=true&preload=true&responsive=true`}
                      loading="lazy"
                      className="w-full h-full border-0"
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                      allowFullScreen
                      title={`${postTitle} – Bunny video ${i + 1}`}
                    />
                  ) : (
                    <iframe
                      src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=1&mute=0&playsinline=1`}
                      className="w-full h-full border-0"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={`${postTitle} – YouTube video ${i + 1}`}
                    />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="relative block w-full max-w-5xl aspect-video overflow-hidden rounded-lg shadow-2xl shrink-0"
                  onClick={(event) => {
                    event.stopPropagation();
                    onActivatePlayer(i);
                  }}
                  aria-label="Video abspielen"
                >
                  {getMediaPosterSrc(media) ? (
                    <img
                      src={getMediaPosterSrc(media)}
                      alt={postTitle}
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        const target = event.currentTarget;
                        if (target.src.includes("maxresdefault.jpg")) {
                          target.src = target.src.replace(
                            "maxresdefault.jpg",
                            "hqdefault.jpg",
                          );
                        }
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-white/5">
                      <Youtube className="h-12 w-12 text-white/50" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                      <Play className="ml-1 h-7 w-7" />
                    </div>
                  </div>
                </button>
              )
            ) : isVideoFileMedia(media, getVideoSrc) ? (
              <video
                src={getDisplayImage(
                  getVideoSrc(media, true),
                  isR2Fallback,
                  isEmbeddedData,
                )}
                className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl shrink-0"
                controls
                playsInline
                preload="metadata"
                poster={getMediaPosterSrc(media)}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <img
                src={getDisplayImage(
                  getImageSrc(media, true),
                  isR2Fallback,
                  isEmbeddedData,
                )}
                alt={postTitle}
                className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl shrink-0"
                referrerPolicy="no-referrer"
                onLoad={(event) => handleImageLoad(`${postId}-${i}`, event)}
                onError={(event) => {
                  const target = event.currentTarget;
                  if (target.src.includes("maxresdefault.jpg")) {
                    target.src = target.src.replace(
                      "maxresdefault.jpg",
                      "hqdefault.jpg",
                    );
                  }
                }}
              />
            )}
          </div>
        </article>
      ))}
    </div>
  );
};
