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
