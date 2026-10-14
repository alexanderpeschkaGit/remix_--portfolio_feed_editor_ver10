import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useKiCaseStudyEdit } from "../../hooks/useKiCaseStudyEdit";
import {
  getAsString,
  isRenderableMediaItem,
} from "../../utils/postMediaHelpers";
import { LightboxMediaStage } from "./lightbox/LightboxMediaStage";
import { LightboxSidebar } from "./lightbox/LightboxSidebar";

interface LightboxModalProps {
  currentLightboxPost: any | null;
  lightboxMousePos: { x: number; y: number };
  isHoveringLightboxBg: boolean;
  lightboxDraggedIdx: number | null;
  imageDimensions: Record<string, string>;

  // State setters
  setLightboxMousePos: (pos: { x: number; y: number }) => void;
  setIsHoveringLightboxBg: (v: boolean) => void;
  setSelectedImage: (post: any) => void;

  // Display flags
  showResolutions: boolean;
  isEditing: boolean;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;

  // Functions
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
  handlePostChange: (id: string, field: string, value: string) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  currentLightboxPost,
  lightboxMousePos,
  isHoveringLightboxBg,
  lightboxDraggedIdx,
  setLightboxMousePos,
  setIsHoveringLightboxBg,
  setSelectedImage,
  showResolutions,
  isEditing,
  isR2Fallback,
  isEmbeddedData,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
  handlePostChange,
}) => {
  if (!currentLightboxPost) return null;

  const rawMediaList =
    currentLightboxPost.mergedMedia &&
    currentLightboxPost.mergedMedia.length > 0
      ? currentLightboxPost.mergedMedia
      : [currentLightboxPost];

  const mediaList = isEditing
    ? rawMediaList
    : rawMediaList.filter((m) => isRenderableMediaItem(m));

  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [shouldPlayActiveMedia, setShouldPlayActiveMedia] = useState(false);
  const [loadedPlayers, setLoadedPlayers] = useState<Set<number>>(new Set());
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  const { isGenerating, undoText, resetKiEditState, handleUndo, handleKiEdit } =
    useKiCaseStudyEdit({
      mediaItems: mediaList,
      getImageSrc,
      getDisplayImage,
      isR2Fallback,
      isEmbeddedData,
      getCurrentTitle: () => getAsString(currentLightboxPost.title),
      getCurrentDescription: () => getAsString(currentLightboxPost.description),
      onApplyDescription: (newDescription) => {
        handlePostChange(currentLightboxPost.id, "description", newDescription);
      },
    });

  useEffect(() => {
    setActiveMediaIndex(0);
    setShouldPlayActiveMedia(false);
    setLoadedPlayers(new Set());
    resetKiEditState();
  }, [currentLightboxPost.id, resetKiEditState]);

  useEffect(() => {
    if (activeMediaIndex >= mediaList.length) {
      setActiveMediaIndex(Math.max(0, mediaList.length - 1));
    }
  }, [activeMediaIndex, mediaList.length]);

  useEffect(() => {
    setShouldPlayActiveMedia(false);
  }, [activeMediaIndex]);

  useEffect(() => {
    const activeVideo = activeVideoRef.current;
    if (!activeVideo || isEditing) return;

    if (shouldPlayActiveMedia) {
      const playPromise = activeVideo.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
      return;
    }

    activeVideo.pause();
  }, [activeMediaIndex, isEditing, shouldPlayActiveMedia]);

  const activeMedia = mediaList[activeMediaIndex] || mediaList[0] || null;

  const handleActivatePlayer = (index: number) => {
    setLoadedPlayers((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm ${
        isHoveringLightboxBg ? "cursor-none" : ""
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedImage(null);
          setIsHoveringLightboxBg(false);
        }
      }}
      onMouseMove={(e) => {
        if (e.target === e.currentTarget) {
          setLightboxMousePos({ x: e.clientX, y: e.clientY });
          setIsHoveringLightboxBg(true);
        } else {
          setIsHoveringLightboxBg(false);
        }
      }}
      onMouseLeave={() => setIsHoveringLightboxBg(false)}
    >
      {isHoveringLightboxBg && (
        <div
          className="fixed pointer-events-none z-50 flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-md rounded-full text-white transition-opacity duration-200"
          style={{
            left: lightboxMousePos.x - 24,
            top: lightboxMousePos.y - 24,
          }}
        >
          <ArrowLeft className="w-6 h-6" />
        </div>
      )}
      <button
        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-10"
        onClick={() => {
          setSelectedImage(null);
          setIsHoveringLightboxBg(false);
        }}
        onMouseEnter={() => setIsHoveringLightboxBg(false)}
      >
        <X className="w-6 h-6" />
      </button>

      <div
        className={`w-full ${
          isEditing ? "max-w-[1500px]" : "max-w-7xl"
        } max-h-full flex flex-col md:flex-row gap-6 items-center justify-center`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsHoveringLightboxBg(false)}
      >
        <LightboxMediaStage
          postId={currentLightboxPost.id}
          postTitle={getAsString(currentLightboxPost.title)}
          mediaList={mediaList}
          activeMedia={activeMedia}
          activeMediaIndex={activeMediaIndex}
          setActiveMediaIndex={setActiveMediaIndex}
          shouldPlayActiveMedia={shouldPlayActiveMedia}
          setShouldPlayActiveMedia={setShouldPlayActiveMedia}
          loadedPlayers={loadedPlayers}
          onActivatePlayer={handleActivatePlayer}
          activeVideoRef={activeVideoRef}
          isEditing={isEditing}
          showResolutions={showResolutions}
          lightboxDraggedIdx={lightboxDraggedIdx}
          isR2Fallback={isR2Fallback}
          isEmbeddedData={isEmbeddedData}
          getImageSrc={getImageSrc}
          getVideoSrc={getVideoSrc}
          getDisplayImage={getDisplayImage}
          handleImageLoad={handleImageLoad}
          handleLightboxDragStart={handleLightboxDragStart}
          handleLightboxDragOver={handleLightboxDragOver}
          handleLightboxDrop={handleLightboxDrop}
        />

        <LightboxSidebar
          currentLightboxPost={currentLightboxPost}
          isEditing={isEditing}
          mediaList={mediaList}
          activeMediaIndex={activeMediaIndex}
          setActiveMediaIndex={setActiveMediaIndex}
          lightboxDraggedIdx={lightboxDraggedIdx}
          isGenerating={isGenerating}
          undoText={undoText}
          handleKiEdit={handleKiEdit}
          handleUndo={handleUndo}
          handlePostChange={handlePostChange}
          handleLightboxDragStart={handleLightboxDragStart}
          handleLightboxDragOver={handleLightboxDragOver}
          handleLightboxDrop={handleLightboxDrop}
          getImageSrc={getImageSrc}
          getVideoSrc={getVideoSrc}
          getDisplayImage={getDisplayImage}
          isR2Fallback={isR2Fallback}
          isEmbeddedData={isEmbeddedData}
        />
      </div>
    </div>
  );
};
