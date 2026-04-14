// hooks/useRearrangeState.ts
import { useState } from 'react';

/**
 * Hook für Rearrange-Modal State-Verwaltung
 * Verwaltet: Selection, Bewegung, Undo/Redo Stack-Status
 */
export const useRearrangeState = () => {
  const [isReorderView, setIsReorderView] = useState(false);
  const [selectedThumbnails, setSelectedThumbnails] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveToPosition, setMoveToPosition] = useState<string | null>(null);

  /**
   * Setzt alle Rearrange-relevanten States zurück
   */
  const resetSelection = () => {
    setSelectedThumbnails([]);
    setIsMoving(false);
    setActiveId(null);
    setMoveToPosition(null);
  };

  /**
   * Selektiert/Deselektiert einzelne Items
   * Unterstützt: Single, Shift+Range, Strg+Multi
   */
  const toggleSelection = (id: string, shiftKey: boolean = false, ctrlKey: boolean = false) => {
    if (ctrlKey) {
      setSelectedThumbnails(prev => 
        prev.includes(id) 
          ? prev.filter(sid => sid !== id) 
          : [...prev, id]
      );
    } else if (shiftKey && lastSelectedId) {
      // Range selection würde hier implementiert werden
      setSelectedThumbnails(prev => [...prev, id]);
    } else {
      setSelectedThumbnails(prev => 
        prev.includes(id) && prev.length === 1
          ? []
          : [id]
      );
    }
    setLastSelectedId(id);
  };

  /**
   * Wechselt in Move-Modus
   */
  const enterMoveMode = () => {
    if (selectedThumbnails.length > 0) {
      setIsMoving(true);
    }
  };

  /**
   * Verlässt Move-Modus
   */
  const exitMoveMode = () => {
    setIsMoving(false);
    setMoveToPosition(null);
  };

  /**
   * Bestätigt Move-Operation
   */
  const confirmMove = (targetId: string) => {
    setMoveToPosition(targetId);
    setIsMoving(false);
  };

  return {
    // State
    isReorderView,
    setIsReorderView,
    selectedThumbnails,
    setSelectedThumbnails,
    lastSelectedId,
    setLastSelectedId,
    isMoving,
    setIsMoving,
    activeId,
    setActiveId,
    moveToPosition,
    setMoveToPosition,
    
    // Methods
    resetSelection,
    toggleSelection,
    enterMoveMode,
    exitMoveMode,
    confirmMove
  };
};
