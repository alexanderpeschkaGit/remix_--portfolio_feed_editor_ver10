import { useEffect, useRef } from 'react';
import { PROJECT_STATES } from '../constants';
import type { MediaSelection } from './useMediaInteraction';

interface UseEditorLifecycleParams {
  setShowResolutions: (updater: any) => void;
  setShowResolutionToast: (v: boolean) => void;
  setIsEditing: (updater: any) => void;
  setIsReorderView: (updater: any) => void;
  setSelectedThumbnails: (v: string[]) => void;
  setSelectedImage: (v: any) => void;
  setIsHoveringLightboxBg: (v: boolean) => void;
  handleUndo: () => void | Promise<void>;
  handleRedo: () => void;
  mediaSelection: MediaSelection;
  clearMediaSelection: () => void;
  flickrPostsRef: { current: any[] };
  portfolioTitleRef: { current: string };
  portfolioSubtitleRef: { current: string };
  portfolioBioRef: { current: string };
  setHasUnpublishedChanges: (v: boolean) => void;
  isInitialized: boolean;
  portfolioTitle: string;
  portfolioSubtitle: string;
  portfolioBio: string;
  logsEndRef: { current: HTMLDivElement | null };
  scrapeLogs: string[];
  activeId: string | null;
  isReorderView: boolean;
  reorderScrollRef: { current: HTMLDivElement | null };
  R2_CONFIG: { publicDomain: string };
  flickrPosts: any[];
}

export function useEditorLifecycle({
  setShowResolutions,
  setShowResolutionToast,
  setIsEditing,
  setIsReorderView,
  setSelectedThumbnails,
  setSelectedImage,
  setIsHoveringLightboxBg,
  handleUndo,
  handleRedo,
  mediaSelection,
  clearMediaSelection,
  flickrPostsRef,
  portfolioTitleRef,
  portfolioSubtitleRef,
  portfolioBioRef,
  setHasUnpublishedChanges,
  isInitialized,
  portfolioTitle,
  portfolioSubtitle,
  portfolioBio,
  logsEndRef,
  scrapeLogs,
  activeId,
  isReorderView,
  reorderScrollRef,
  R2_CONFIG,
  flickrPosts
}: UseEditorLifecycleParams) {
useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setShowResolutions(prev => {
          const next = !prev;
          setShowResolutionToast(true);
          setTimeout(() => setShowResolutionToast(false), 2000);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);useEffect(() => {
    flickrPostsRef.current = flickrPosts;
  }, [flickrPosts]);

  useEffect(() => {
    portfolioTitleRef.current = portfolioTitle;
    if (isInitialized) setHasUnpublishedChanges(true);
  }, [portfolioTitle, isInitialized]);

  useEffect(() => {
    portfolioSubtitleRef.current = portfolioSubtitle;
    if (isInitialized) setHasUnpublishedChanges(true);
  }, [portfolioSubtitle, isInitialized]);

  useEffect(() => {
    portfolioBioRef.current = portfolioBio;
    if (isInitialized) setHasUnpublishedChanges(true);
  }, [portfolioBio, isInitialized]);

  // Hält immer die aktuellen Handler/Auswahl, damit der einmalig registrierte keydown-Listener
  // keine veralteten Closures (leere Undo-History, alte Medien-Auswahl) verwendet.
  const keyHandlersRef = useRef<{
    handleUndo: () => void | Promise<void>;
    handleRedo: () => void;
    mediaSelection: MediaSelection;
    clearMediaSelection: () => void;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const latest = keyHandlersRef.current;
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') {
        setIsEditing(prev => !prev);
      }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
        setIsReorderView(prev => !prev);
        setSelectedThumbnails([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          latest?.handleRedo();
        } else {
          latest?.handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        latest?.handleRedo();
      }
      if (e.key === 'Escape') {
        if (latest?.mediaSelection) {
          latest.clearMediaSelection();
          return;
        }
        setSelectedImage(null);
        setIsHoveringLightboxBg(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrapeLogs]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (activeId && isReorderView && reorderScrollRef.current) {
        reorderScrollRef.current.scrollTop += e.deltaY;
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [activeId, isReorderView]);

  useEffect(() => {
    (window as any).portfolioData = {
      title: portfolioTitle,
      subtitle: portfolioSubtitle,
      projectStates: PROJECT_STATES,
      posts: flickrPosts,
      publicDomain: R2_CONFIG.publicDomain
    };
  }, [flickrPosts, portfolioTitle, portfolioSubtitle]);

  // Beschreibung für Undo/Redo-Tooltips: Post-Titel + Quelle (network_name), falls nicht "Custom"

  keyHandlersRef.current = { handleUndo, handleRedo, mediaSelection, clearMediaSelection };
}
