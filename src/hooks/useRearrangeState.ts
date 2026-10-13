// hooks/useRearrangeState.ts
import { useState } from 'react';

/**
 * Hook fÃ¼r Rearrange-Modal State-Verwaltung
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
   * Setzt alle Rearrange-relevanten States zurÃ¼ck
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
  const toggleSelection = (id: string, shiftKey: boolean = false, ctrlKey: boolean = false, allIds: string[] = []) => {
    if (ctrlKey) {
      setSelectedThumbnails(prev => 
        prev.includes(id) 
          ? prev.filter(sid => sid !== id) 
          : [...prev, id]
      );
    } else if (shiftKey && lastSelectedId) {
      const startIndex = allIds.findIndex(pid => String(pid) === String(lastSelectedId));
      const endIndex = allIds.findIndex(pid => String(pid) === String(id));
      if (startIndex !== -1 && endIndex !== -1) {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        const range = allIds.slice(start, end + 1).map(String);
        setSelectedThumbnails(prev => Array.from(new Set([...prev, ...range])));
      } else {
        setSelectedThumbnails(prev => [...prev, id]);
      }
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
   * VerlÃ¤sst Move-Modus
   */
  const exitMoveMode = () => {
    setIsMoving(false);
    setMoveToPosition(null);
  };

  /**
   * BestÃ¤tigt Move-Operation
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
