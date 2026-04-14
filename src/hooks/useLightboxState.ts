// hooks/useLightboxState.ts
import { useState } from 'react';

/**
 * Hook für Lightbox Modal State-Verwaltung 
 * Verwaltet NUR Lightbox UI State: Mouse, Hovering, Dragging
 * 
 * Hinweis: selectedImage und imageDimensions werden in App.tsx verwaltet
 * und werden aus dem Hook NICHT manipuliert
 */
export const useLightboxState = () => {
  const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
  const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);

  /**
   * Startet Drag für Media-Reordering (in Lightbox)
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

  return {
    // State
    lightboxMousePos,
    setLightboxMousePos,
    isHoveringLightboxBg,
    setIsHoveringLightboxBg,
    lightboxDraggedIdx,
    setLightboxDraggedIdx,
    
    // Methods
    startDragMedia,
    endDragMedia
  };
};
