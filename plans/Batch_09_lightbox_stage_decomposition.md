# Flash Execution Blueprint: LightboxMediaStage Decomposition (Batch 09)

## Execution Metadata
- **Task Complexity:** `3.5 / 10` (Leaf UI-Extraktion, props-basiert, 3 klar getrennte Render-Modi)
- **Target Execution Model:** `flash` (Single-Action Protocol: keine verketteten Shell-Befehle mit `&&` oder `;`)
- **Primary Goal:** Dekomposition von `src/components/modals/lightbox/LightboxMediaStage.tsx` (482 Zeilen) in 3 modulare Leaf-Komponenten unter 150 Zeilen.

---

## 1. Datei-Übersicht & Ziel-Architektur

1. `src/components/modals/lightbox/LightboxEditingReorderList.tsx` (Neu, ~130 Zeilen):
   Rendert die vertikale Liste der Medien im Edit-Modus mit Drag-and-Drop, Grip-Icon und Auflösungs-Chips.
2. `src/components/modals/lightbox/LightboxScrollGallery.tsx` (Neu, ~120 Zeilen):
   Rendert die vertikal scrollbare Galerie im Non-Edit Modus, wenn mehr als 1 Medium vorhanden ist.
3. `src/components/modals/lightbox/LightboxActivePlayer.tsx` (Neu, ~150 Zeilen):
   Rendert den fokussierten Einzelplayer (Bunny/YouTube-Iframe, HTML5 Video mit `activeVideoRef` oder Bild mit Fallback) sowie Next/Prev-Chevrons.
4. `src/components/modals/lightbox/LightboxMediaStage.tsx` (Refaktorisiert, ~65 Zeilen):
   Schlanker Orchestrator, der Props routet.

---

## 2. Schritt-für-Schritt Implementierung

### Schritt 1: `src/components/modals/lightbox/LightboxEditingReorderList.tsx` anlegen

Erstelle die neue Datei `src/components/modals/lightbox/LightboxEditingReorderList.tsx`:

```tsx
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
```

---

### Schritt 2: `src/components/modals/lightbox/LightboxScrollGallery.tsx` anlegen

Erstelle die neue Datei `src/components/modals/lightbox/LightboxScrollGallery.tsx`:

```tsx
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
```

---

### Schritt 3: `src/components/modals/lightbox/LightboxActivePlayer.tsx` anlegen

Erstelle die neue Datei `src/components/modals/lightbox/LightboxActivePlayer.tsx`:

```tsx
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
```

---

### Schritt 4: `src/components/modals/lightbox/LightboxMediaStage.tsx` verschlanken

Ersetze den Inhalt von `src/components/modals/lightbox/LightboxMediaStage.tsx` vollständig durch die folgende orchestrale Fassung (~65 Zeilen):

```tsx
import React from "react";
import { getLightboxMediaPosterSrc } from "../../../utils/postMediaHelpers";
import { LightboxEditingReorderList } from "./LightboxEditingReorderList";
import { LightboxScrollGallery } from "./LightboxScrollGallery";
import { LightboxActivePlayer } from "./LightboxActivePlayer";

export interface LightboxMediaStageProps {
  postId: string;
  postTitle: string;
  mediaList: any[];
  activeMedia: any | null;
  activeMediaIndex: number;
  setActiveMediaIndex: React.Dispatch<React.SetStateAction<number>>;
  shouldPlayActiveMedia: boolean;
  setShouldPlayActiveMedia: React.Dispatch<React.SetStateAction<boolean>>;
  loadedPlayers: Set<number>;
  onActivatePlayer: (index: number) => void;
  activeVideoRef: React.RefObject<HTMLVideoElement | null>;
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

export function LightboxMediaStage(props: LightboxMediaStageProps) {
  const {
    isEditing,
    mediaList,
    activeMedia,
    shouldPlayActiveMedia,
    getImageSrc,
    getDisplayImage,
    isR2Fallback,
    isEmbeddedData,
  } = props;

  const getMediaPosterSrc = (media: any) =>
    getLightboxMediaPosterSrc(
      media,
      getImageSrc,
      getDisplayImage,
      isR2Fallback,
      isEmbeddedData,
    );

  const activeMediaPosterSrc = getMediaPosterSrc(activeMedia);
  const showEmbeddedPreview =
    !activeMedia &&
    !isEditing &&
    (activeMedia?.type === "youtube" || activeMedia?.type === "bunny") &&
    !shouldPlayActiveMedia;

  return (
    <div
      className={`relative flex-1 flex flex-col items-center justify-start min-h-0 w-full max-h-[85vh] ${
        isEditing
          ? "overflow-y-auto gap-4 custom-scrollbar pr-2"
          : "overflow-hidden"
      }`}
    >
      {isEditing ? (
        <LightboxEditingReorderList {...props} />
      ) : mediaList.length > 1 ? (
        <LightboxScrollGallery
          {...props}
          getMediaPosterSrc={getMediaPosterSrc}
        />
      ) : activeMedia ? (
        <LightboxActivePlayer
          {...props}
          activeMedia={activeMedia}
          showEmbeddedPreview={showEmbeddedPreview}
          activeMediaPosterSrc={activeMediaPosterSrc}
        />
      ) : null}
    </div>
  );
}
```

---

## 3. Validierungs-Schritte (Single-Action Protocol)

Nachdem alle Dateien angelegt und modifiziert wurden, führe die Validierung sequenziell aus:

1. `npm run lint` (überprüft Typen via `tsc --noEmit`)
2. `npm test` (überprüft alle 45 Unit-Tests)

---

## 4. Git Checkpoint

Nach erfolgreicher Validierung:
```powershell
git add src/components/modals/lightbox/LightboxEditingReorderList.tsx src/components/modals/lightbox/LightboxScrollGallery.tsx src/components/modals/lightbox/LightboxActivePlayer.tsx src/components/modals/lightbox/LightboxMediaStage.tsx
git commit -m "refactor(lightbox): decompose LightboxMediaStage into edit-list, scroll-gallery, and active-player"
```
