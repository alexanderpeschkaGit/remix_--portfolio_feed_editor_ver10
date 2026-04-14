// hooks/useLightboxState.ts
import { useState } from 'react';
import { Post, MediaItem } from '../types';

/**
 * Hook für Lightbox Modal State-Verwaltung
 * Verwaltet: Media-Navigation, Drag & Drop, Bild-Dimensionen
 */
export const useLightboxState = () => {
  const [currentLightboxPost, setCurrentLightboxPost] = useState<Post | null>(null);
  const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
  const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

  /**
   * Öffnet Lightbox für einen Post
   */
  const openLightbox = (post: Post) => {
    setCurrentLightboxPost(post);
    setCurrentMediaIndex(0);
    setLightboxDraggedIdx(null);
    setImageDimensions({});
  };

  /**
   * Schließt Lightbox vollständig
   */
  const closeLightbox = () => {
    setCurrentLightboxPost(null);
    setIsHoveringLightboxBg(false);
    setLightboxDraggedIdx(null);
    setCurrentMediaIndex(0);
  };

  /**
   * Navigiert zum nächsten Media-Item
   */
  const nextMedia = () => {
    if (!currentLightboxPost) return;
    const media = currentLightboxPost.mergedMedia || [currentLightboxPost];
    setCurrentMediaIndex((prev) => (prev + 1) % media.length);
  };

  /**
   * Navigiert zum vorherigen Media-Item
   */
  const previousMedia = () => {
    if (!currentLightboxPost) return;
    const media = currentLightboxPost.mergedMedia || [currentLightboxPost];
    setCurrentMediaIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  /**
   * Speichert Bild-Dimensionen nach dem Laden
   */
  const handleImageLoad = (mediaId: string, dimensions: { width: number; height: number }) => {
    setImageDimensions(prev => ({
      ...prev,
      [mediaId]: `${dimensions.width} x ${dimensions.height} px`
    }));
  };

  /**
   * Startet Drag für Media-Reordering
   */
  const startDragMedia = (index: number) => {
    setLightboxDraggedIdx(index);
  };

  /**
   * Beendet Drag für Media-Reordering
   */
  const endDragMedia = () => {
    setLightboxDraggedIdx(null);
  };

  /**
   * Gibt alle aktiven Media-Items eines Posts zurück
   */
  const getCurrentMedia = (): MediaItem[] => {
    if (!currentLightboxPost) return [];
    return currentLightboxPost.mergedMedia || [currentLightboxPost];
  };

  /**
   * Gibt das aktuelle Media-Item zurück
   */
  const getCurrentMediaItem = (): MediaItem | null => {
    const media = getCurrentMedia();
    return media[currentMediaIndex] || null;
  };

  return {
    // State
    currentLightboxPost,
    setCurrentLightboxPost,
    lightboxMousePos,
    setLightboxMousePos,
    isHoveringLightboxBg,
    setIsHoveringLightboxBg,
    lightboxDraggedIdx,
    setLightboxDraggedIdx,
    imageDimensions,
    setImageDimensions,
    currentMediaIndex,
    setCurrentMediaIndex,
    
    // Methods
    openLightbox,
    closeLightbox,
    nextMedia,
    previousMedia,
    handleImageLoad,
    startDragMedia,
    endDragMedia,
    getCurrentMedia,
    getCurrentMediaItem
  };
};
