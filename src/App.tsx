import React, { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, ExternalLink, Maximize2, X, Edit3, Save, UploadCloud, CheckCircle, Plus, Image as ImageIcon, Youtube, Trash2, GripVertical, Undo2, Redo2, FoldVertical, History, Download, RefreshCw, Instagram, ChevronUp, ChevronDown, FileCode, Layers, ArrowLeft, Eye } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { PROJECT_STATES } from './constants';
import { useRearrangeState } from './hooks/useRearrangeState';
import { useLightboxState } from './hooks/useLightboxState';
import { useBioFeature } from './hooks/useBioFeature';
import { useUndoHistory } from './hooks/useUndoHistory';
import { useMediaInteraction, type MediaSelection } from './hooks/useMediaInteraction';
import { useScrapeSync } from './hooks/useScrapeSync';
import { useCloudSync } from './hooks/useCloudSync';
import { useTrashManager } from './hooks/useTrashManager';
import { useMediaUploads } from './hooks/useMediaUploads';
import { usePublishing } from './hooks/usePublishing';
import { useBackups } from './hooks/useBackups';
import { useR2Maintenance } from './hooks/useR2Maintenance';
import { usePortfolioInit } from './hooks/usePortfolioInit';
import { useStatePersistence } from './hooks/useStatePersistence';
import { usePostActions } from './hooks/usePostActions';
import { usePostOrdering } from './hooks/usePostOrdering';
import { linkifyToHtml } from './utils/linkify';
import { RearrangeModal } from './components/modals/RearrangeModal';
import { MergeConfirmationModal } from './components/modals/MergeConfirmationModal';
import { LightboxModal } from './components/modals/LightboxModal';
import { ConfirmSyncModal } from './components/modals/ConfirmSyncModal';
import { BackupsModal } from './components/modals/BackupsModal';
import { ScrapingLogsModal } from './components/modals/ScrapingLogsModal';
import { UncertainMatchesModal } from './components/modals/UncertainMatchesModal';
import { BioEditorModal } from './components/modals/BioEditorModal';
import { PostCommitModal } from './components/modals/PostCommitModal';
import { CloudSyncChangesModal } from './components/modals/CloudSyncChangesModal';
import { TrashModal } from './components/modals/TrashModal';
import { MediaVariantsModal } from './components/modals/MediaVariantsModal';
import { ThumbnailGalleryGrid } from './components/gallery/ThumbnailGalleryGrid';
import { AdminHeader } from './components/header/AdminHeader';
import { CloudflareUsageDisplay } from './components/header/CloudflareUsageDisplay';
import { mergeIncomingPostsPreservingExisting, mergeCloudIntoLocal } from './utils/mergePosts';
import { formatDescription, isDirectMediaFile, isValidImageCandidate, getImageSrc, getVideoSrc, hasRenderableMedia, getMediaDedupeKey, getMediaPriorityScore, getPrimaryMergedMedia, syncMediaFieldsFromPrimary, clearPostMediaFields, formatBytes, createGetDisplayImage } from './utils/mediaHelpers';
import { generateHTML } from './utils/generatePortfolioHtml';
import { getPostSignature } from './utils/cloudCompare';
import { cleanPostsForServer } from './utils/cleanPosts';
import type { PostHistoryEntry, TrashHistoryEntry, MediaDeleteHistoryEntry, UndoHistoryEntry } from './types';

// SortablePost component moved to src/components/feed/FeedPostCard.tsx

export default function App() {
  const [flickrPosts, setFlickrPosts] = useState<any[]>([]);
  const flickrPostsRef = useRef<any[]>([]);
  const portfolioTitleRef = useRef<string>('');
  const portfolioSubtitleRef = useRef<string>('');
  const portfolioBioRef = useRef<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});

  const getMediaDimensionsKey = (postId: string, mediaIndex: number) => `${postId}-${mediaIndex}`;

  const setImageDimensionForKey = (key: string, width: number, height: number) => {
    setImageDimensions(prev => {
      const value = `${width} x ${height} px`;
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensionForKey(id, img.naturalWidth, img.naturalHeight);
  };
  const [isEditing, setIsEditing] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showResolutions, setShowResolutions] = useState(false);
  const [showResolutionToast, setShowResolutionToast] = useState(false);
  const shouldPushStateToR2Ref = useRef(false);

  const { activeUploads, hasUnsyncedMedia, setHasUnsyncedMedia, bunnyProgress, handleImageUpload, handleVideoFileUpload, handleVideoLinkChange } = useMediaUploads({
    flickrPosts,
    updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad),
    describePost: (post: any) => describePost(post),
    setError,
    pushStatusNotice: (kind: any, title: string, message: string) => pushStatusNotice(kind, title, message),
    shouldPushStateToR2Ref,
    handlePostChange: (id: string, field: string, value: string) => handlePostChange(id, field, value)
  });

  const { showTrashModal, setShowTrashModal, trashItems, trashLoading, trashError, loadTrashItems, handleOpenTrash, handleRestoreTrashItems, handleDeleteTrashItems, handlePermanentlyDeleteTrashItems } = useTrashManager({
    fetchCloudflareUsage: () => fetchCloudflareUsage(),
    recordHistory: (entry: any) => recordHistory(entry)
  });

  const [showMediaVariantsModal, setShowMediaVariantsModal] = useState(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);

    const uploadingCount = Object.values(activeUploads).reduce((sum: number, count: number) => sum + count, 0);

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
  }, []);// ===== Hook: useRearrangeState für Rearrange/Merge/Delete Funktionalität =====
  const rearrangeState = useRearrangeState();
  const {
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
    resetSelection,
    toggleSelection,
    enterMoveMode,
    exitMoveMode,
  } = rearrangeState;

  // ===== Hook: useLightboxState für Lightbox Modal UI State (Mouse, Hovering, Dragging) =====
  const lightboxState = useLightboxState();
  const {
    lightboxMousePos,
    setLightboxMousePos,
    isHoveringLightboxBg,
    setIsHoveringLightboxBg,
    lightboxDraggedIdx,
    setLightboxDraggedIdx,
    startDragMedia,
    endDragMedia,
  } = lightboxState;

  // ===== Ãœbrige States =====
  const [statusNotice, setStatusNotice] = useState<{ kind: 'success' | 'info' | 'warning'; title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
    const { isInitialized, isR2Fallback, setIsR2Fallback, isFlickrFallback, setIsFlickrFallback, fallbackEnabled, setFallbackEnabled } = usePortfolioInit({
    setPortfolioTitle: (v: string) => setPortfolioTitle(v),
    setPortfolioSubtitle: (v: string) => setPortfolioSubtitle(v),
    setPortfolioBio: (v: string) => setPortfolioBio(v),
    setIgAccount: (v: string) => setIgAccount(v),
    setFlickrUrl: (v: string) => setFlickrUrl(v),
    setFlickrPosts,
    setLoading,
    setHasUnpublishedChanges,
    setError,
    setLocalLastUpdated: (v: string | null) => setLocalLastUpdated(v),
    setPublicDomain: (v: string | null) => setPublicDomain(v),
    setIsEmbeddedData: (v: boolean) => setIsEmbeddedData(v),
    getPortfolioTitle: () => portfolioTitle,
    getPortfolioSubtitle: () => portfolioSubtitle,
    getR2Config: () => R2_CONFIG
  });const { localLastUpdated, hasCloudChanges, cloudSyncChanges, cloudSyncState, ignoreCloudChangesRef, setLocalLastUpdated, setHasCloudChanges, setCloudSyncState, setCloudSyncChanges, handleSyncFromCloudflare, handleCancelCloudSync, handleIgnoreCloudSync, handleApplyCloudSync } = useCloudSync({
    isInitialized,
    flickrPosts,
    flickrPostsRef,
    portfolioTitleRef,
    portfolioSubtitleRef,
    portfolioBioRef,
    getPortfolioTitle: () => portfolioTitle,
    getPortfolioSubtitle: () => portfolioSubtitle,
    getPortfolioBio: () => portfolioBio,
    setLoading,
    setHasUnpublishedChanges,
    setPortfolioTitle: (v: string) => setPortfolioTitle(v),
    setPortfolioSubtitle: (v: string) => setPortfolioSubtitle(v),
    setPortfolioBio: (v: string) => setPortfolioBio(v),
    setIgAccount: (v: string) => setIgAccount(v),
    setFlickrUrl: (v: string) => setFlickrUrl(v),
    setIsR2Fallback: (v: boolean) => setIsR2Fallback(v),
    setIsFlickrFallback: (v: boolean) => setIsFlickrFallback(v),
    updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad)
  });
  const { scrapeLogs, setScrapeLogs, isScraping, showLogs, setShowLogs, syncStatus, fullR2SyncStatus, uncertainMatches, showUncertain, setShowUncertain, handleFullR2Sync, handleScrape, handleHighResSync, handleConfirmMatch, handleRejectMatch } = useScrapeSync({ flickrPostsRef, updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad), setFlickrPosts, setHasUnsyncedMedia, setIsFlickrFallback: (v: boolean) => setIsFlickrFallback(v) });

  const statusNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (statusNoticeTimerRef.current) {
        window.clearTimeout(statusNoticeTimerRef.current);
      }
    };
  }, []);

  const pushStatusNotice = (
    kind: 'success' | 'info' | 'warning',
    title: string,
    message: string,
    timeoutMs = 3500
  ) => {
    if (statusNoticeTimerRef.current) {
      window.clearTimeout(statusNoticeTimerRef.current);
    }
    setStatusNotice({ kind, title, message });
    statusNoticeTimerRef.current = window.setTimeout(() => {
      setStatusNotice(null);
      statusNoticeTimerRef.current = null;
    }, timeoutMs);
  };

  const refreshStateAfterMediaVariants = async () => {
    const response = await fetch(`/api/state?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to reload updated state');
    const stateData = await response.json();

    if (stateData.title) setPortfolioTitle(stateData.title);
    if (stateData.subtitle) setPortfolioSubtitle(stateData.subtitle);
    if (stateData.bio) setPortfolioBio(stateData.bio);
    if (stateData.scrapeConfig) {
      if (stateData.scrapeConfig.igAccount) setIgAccount(stateData.scrapeConfig.igAccount);
      if (stateData.scrapeConfig.flickrUrl) setFlickrUrl(stateData.scrapeConfig.flickrUrl);
    }
    if (Array.isArray(stateData.items)) {
      setFlickrPosts(stateData.items);
      flickrPostsRef.current = stateData.items;
    }
    if (stateData.lastUpdated) setLocalLastUpdated(stateData.lastUpdated);
    setHasUnsyncedMedia(false);
    setHasCloudChanges(false);
    setHasUnpublishedChanges(false);
    await fetchCloudflareUsage();
    pushStatusNotice('success', 'Media variants updated', 'Generated thumbnails were published and the editor state was refreshed.');
  };

  const reorderScrollRef = useRef<HTMLDivElement>(null!);
  const [portfolioTitle, setPortfolioTitle] = useState("Portfolio Gallery");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState("My creative works");
  const [igAccount, setIgAccount] = useState("your_instagram_handle");
  const [flickrUrl, setFlickrUrl] = useState("https://www.flickr.com/photos/your_account/albums/your_album_id/");
  const [publicDomain, setPublicDomain] = useState<string | null>(null);
  
  // Bio feature hook
  const {
    portfolioBio,
    setPortfolioBio,
    showBioEditor,
    setShowBioEditor,
    showPostCommitModal,
    setShowPostCommitModal,
    selectedPostForCommit,
    commitPostSource,
    handleGetLatestInstagram,
    handleGetLatestFlickr,
    handleCommitPostToPortfolio,
    resetCommitState
  } = useBioFeature();
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isEmbeddedData, setIsEmbeddedData] = useState(false);
  const [cloudflareUsage, setCloudflareUsage] = useState<any>(null);

  const fetchCloudflareUsage = async () => {
    try {
      const res = await fetch('/api/cloudflare/usage');
      if (res.ok) {
        const data = await res.json();
        setCloudflareUsage(data);
      }
    } catch (e) {
      console.error("Failed to fetch Cloudflare usage:", e);
    }
  };

  useEffect(() => {
    fetchCloudflareUsage();
    const interval = setInterval(fetchCloudflareUsage, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
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

  // Public media configuration. Credentials and publishing remain server-side.
  const R2_CONFIG = {
    publicDomain: ""
  };

  // Image URL resolver (utils/mediaHelpers) bound to the R2 public domain.
  const getDisplayImage = createGetDisplayImage(R2_CONFIG.publicDomain);

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
  const describePost = (post: any) => {
    const title = post?.title || 'Unbenannt';
    const network = post?.network_name;
    if (network && network !== 'Custom') return `${title} · ${network}`;
    return title;
  };

  useStatePersistence({
    isInitialized,
    flickrPosts,
    uploadingCount,
    portfolioTitle,
    portfolioSubtitle,
    portfolioBio,
    igAccount,
    flickrUrl,
    shouldPushStateToR2Ref
  });

    const { past, future, recordHistory, updatePosts, recordTrashUndo, handleUndo, handleRedo } = useUndoHistory({
    flickrPosts,
    setFlickrPosts,
    setHasUnpublishedChanges,
    setError,
    pushStatusNotice,
    fetchCloudflareUsage,
    loadTrashItems,
    shouldPushStateToR2Ref
  });

  const { currentMergeGroup, isMergeModalOpen, activeMediaDrag, mediaSelection, clearMediaSelection, handleMediaDragStart, handleMediaDragEnd, handleMediaClick, handleMediaAltClick, confirmMerge, skipMerge, handleMergeSimilar, handleCrossPostMediaDrop } = useMediaInteraction({ flickrPosts, updatePosts, describePost });

  const { restoringLatestPublish, uploadProgress, uploadSuccess, uploading, handlePreview, handleUpload, handleRestoreLatestPublish } = usePublishing({
    flickrPosts,
    portfolioTitle,
    portfolioSubtitle,
    portfolioBio,
    publicDomain,
    R2_CONFIG,
    igAccount,
    flickrUrl,
    setError,
    setFlickrPosts,
    flickrPostsRef,
    recordHistory,
    setLocalLastUpdated,
    setHasCloudChanges,
    setCloudSyncState,
    setCloudSyncChanges,
    setHasUnsyncedMedia,
    setHasUnpublishedChanges,
    setIsR2Fallback,
    setIsFlickrFallback,
    setPortfolioTitle,
    setPortfolioSubtitle,
    setPortfolioBio,
    setIgAccount,
    setFlickrUrl
  });

  const { showBackups, setShowBackups, backupsList, isRestoring, restoreError, lastRestoredFilename, loadBackups, handleRestoreBackup } = useBackups({
    setFlickrPosts,
    recordHistory,
    setPortfolioTitle,
    setPortfolioSubtitle,
    setPortfolioBio,
    setIgAccount,
    setFlickrUrl,
    ignoreCloudChangesRef,
    setHasCloudChanges
  });

  const { r2CleanupRunning, legacyDupCleanupRunning, redundancyCleanupRunning, isResettingAll, handleResetAll, handleRedundancyCleanup, handlePurgeBak, handleR2Cleanup, handleLegacyDuplicateCleanup } = useR2Maintenance({
    setError,
    setShowLogs,
    setScrapeLogs,
    recordTrashUndo,
    recordHistory,
    loadTrashItems,
    fetchCloudflareUsage
  });

  useEffect(() => {
    if (!isInitialized) return;
    loadTrashItems().catch(() => {});
  }, [isInitialized]);

  keyHandlersRef.current = { handleUndo, handleRedo, mediaSelection, clearMediaSelection };

    const { handleToggleHidden, handleStateToggle, handlePostChange, handleAddNewPost, handleDeletePost, handleMergeDown, handleUpdatePostMedia, handleRemoveMedia, handleMoveToTarget, handleAddInstagramPost, handleAddFlickrPost, handleConfirmCommitPost } = usePostActions({
    flickrPosts,
    updatePosts,
    describePost,
    recordHistory,
    setHasUnpublishedChanges,
    setFlickrPosts,
    setError,
    pushStatusNotice,
    shouldPushStateToR2Ref,
    setIsEditing,
    selectedThumbnails,
    setSelectedThumbnails,
    setIsMoving,
    setLastSelectedId,
    handleGetLatestInstagram,
    handleGetLatestFlickr,
    handleCommitPostToPortfolio
  });// Track Bunny upload progress per post
  useEffect(() => {
    if (!flickrPosts || flickrPosts.length === 0) return;
    const cancel = { value: false };

    flickrPosts.forEach((post) => {
      if (!post || post.id == null) return;
      const rawMedia = (post.mergedMedia && post.mergedMedia.length > 0)
        ? post.mergedMedia
        : [{ ...post, type: post.type || 'image' }];

      rawMedia.forEach((media: any, index: number) => {
        const dimensionKey = getMediaDimensionsKey(post.id, index);
        if (imageDimensions[dimensionKey]) return;

        const src = getImageSrc(media, true) || getImageSrc(media);
        if (!src) return;

        const displaySrc = getDisplayImage(src, isR2Fallback, isEmbeddedData) || src;
        const img = new Image();

        img.onload = () => {
          if (cancel.value) return;
          setImageDimensionForKey(dimensionKey, img.naturalWidth, img.naturalHeight);
        };

        img.onerror = () => {
          const fallbackSrc = getImageSrc(media) || src;
          const displayFallback = getDisplayImage(fallbackSrc, isR2Fallback, isEmbeddedData);
          if (displayFallback && displayFallback !== displaySrc) {
            img.src = displayFallback;
          }
        };

        img.src = displaySrc;
      });
    });

    return () => { cancel.value = true; };
  }, [flickrPosts, imageDimensions, isR2Fallback, isEmbeddedData]);

  // Content-hash (SHA-1) duplicate scan across R2 and local media. Moves R2
  // duplicates to trash/ and archives local duplicates into bak/redundant/.
  const { sensors, handleDragEnd, handleLightboxDragStart, handleLightboxDragOver, handleLightboxDrop, currentLightboxPost, handleMerge, handleBulkDelete } = usePostOrdering({
    flickrPosts,
    updatePosts,
    describePost,
    selectedThumbnails,
    setSelectedThumbnails,
    setActiveId,
    lightboxDraggedIdx,
    setLightboxDraggedIdx,
    handleUpdatePostMedia,
    selectedImage,
    recordHistory,
    setHasUnpublishedChanges,
    setFlickrPosts
  });

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-12 font-sans">
      {/* Fallback Notification */}
      {(isR2Fallback || isEmbeddedData || isFlickrFallback) && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 ${isFlickrFallback ? 'bg-red-500/90 text-white' : 'bg-amber-500/90 text-black'} backdrop-blur-md text-[10px] sm:text-xs font-bold rounded-full shadow-lg border ${isFlickrFallback ? 'border-red-400' : 'border-amber-400'} animate-pulse`}>
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>
            {isFlickrFallback ? "TESTDATEN (FLICKR) GELADEN - R2 SYNC FEHLGESCHLAGEN" : 
             isEmbeddedData ? "DATEN AUS HTML GELADEN (STATIC)" : 
             "FALLBACK: DATEN AUS CLOUDFLARE R2 GELADEN"}
          </span>
          <button 
            onClick={() => { setIsR2Fallback(false); setIsEmbeddedData(false); setIsFlickrFallback(false); }}
            className="ml-2 hover:opacity-70"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              const next = !fallbackEnabled;
              setFallbackEnabled(next);
              // If the user disables it, hide current fallback data.
              if (!next) {
                setIsR2Fallback(false);
                setIsFlickrFallback(false);
              }
            }}
            className="ml-1 inline-flex items-center gap-1 px-2 py-1 bg-white/30 hover:bg-white/40 border border-white/20 rounded text-[10px] font-bold text-white"
            title="Persistently disable R2/Flickr fallback loading"
          >
            {fallbackEnabled ? 'Fallback aus' : 'Fallback an'}
          </button>
        </div>
      )}

      <MergeConfirmationModal isOpen={isMergeModalOpen} group={currentMergeGroup} onConfirm={confirmMerge} onSkip={skipMerge} />

      <AnimatePresence>
        {showResolutionToast && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-10 left-1/2 z-[100] bg-white/30 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-3 border border-white/20 backdrop-blur-md"
          >
            <ImageIcon className="w-5 h-5" />
            <span>Auflösungs-Overlay: {showResolutions ? 'AN' : 'AUS'} (Strg+Alt+Y)</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AdminHeader
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        portfolioTitle={portfolioTitle}
        setPortfolioTitle={setPortfolioTitle}
        portfolioSubtitle={portfolioSubtitle}
        setPortfolioSubtitle={setPortfolioSubtitle}
        igAccount={igAccount}
        setIgAccount={setIgAccount}
        flickrUrl={flickrUrl}
        setFlickrUrl={setFlickrUrl}
        isScraping={isScraping}
        syncStatus={syncStatus}
        fullR2SyncStatus={fullR2SyncStatus}
        isResettingAll={isResettingAll}
        loading={loading}
        restoringLatestPublish={restoringLatestPublish}
        r2CleanupRunning={r2CleanupRunning}
        legacyDupCleanupRunning={legacyDupCleanupRunning}
        uploading={uploading}
        uploadProgress={uploadProgress}
        past={past}
        future={future}
        uncertainMatches={uncertainMatches}
        publicDomain={publicDomain}
        flickrPosts={flickrPosts}
        CloudflareUsageDisplay={() => <CloudflareUsageDisplay usage={cloudflareUsage} />}
        handleScrape={handleScrape}
        handleHighResSync={handleHighResSync}
        handleFullR2Sync={handleFullR2Sync}
        handleOpenMediaVariants={() => setShowMediaVariantsModal(true)}
        handleSyncFromCloudflare={handleSyncFromCloudflare}
        handleResetAll={handleResetAll}
        handlePreview={handlePreview}
        handleUpload={handleUpload}
        handleRestoreLatestPublish={handleRestoreLatestPublish}
        handleR2Cleanup={handleR2Cleanup}
        handleLegacyDuplicateCleanup={handleLegacyDuplicateCleanup}
        handleRedundancyCleanup={handleRedundancyCleanup}
        handlePurgeBak={handlePurgeBak}
        redundancyCleanupRunning={redundancyCleanupRunning}
        handleOpenTrash={handleOpenTrash}
        handleAddNewPost={handleAddNewPost}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleMergeSimilar={handleMergeSimilar}
        loadBackups={loadBackups}
        setShowUncertain={setShowUncertain}
        setIsReorderView={setIsReorderView}
        isReorderView={isReorderView}
        setShowBioEditor={setShowBioEditor}
        handleGetLatestInstagram={handleAddInstagramPost}
        handleGetLatestFlickr={handleAddFlickrPost}
        hasCloudChanges={hasCloudChanges}
        hasUnsyncedMedia={hasUnsyncedMedia}
        hasUnpublishedChanges={hasUnpublishedChanges}
        trashCount={trashItems.length}
      /> 

      {statusNotice && (
        <div
          className={`fixed top-4 right-4 z-[120] w-[min(92vw,420px)] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
            statusNotice.kind === 'success'
              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-50'
              : statusNotice.kind === 'warning'
                ? 'border-amber-400/30 bg-amber-500/15 text-amber-50'
                : 'border-sky-400/30 bg-sky-500/15 text-sky-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 w-5 h-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold tracking-tight">{statusNotice.title}</div>
              <div className="text-sm opacity-90 mt-0.5">{statusNotice.message}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (statusNoticeTimerRef.current) {
                  window.clearTimeout(statusNoticeTimerRef.current);
                  statusNoticeTimerRef.current = null;
                }
                setStatusNotice(null);
              }}
              className="shrink-0 text-current/70 hover:text-current transition-colors"
              aria-label="Hinweis schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {uploadSuccess && (
        <div className="max-w-2xl mx-auto mb-8 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-green-500 font-medium">Erfolgreich hochgeladen!</h3>
            <p className="text-green-500/80 text-sm mt-1">
              Die HTML-Datei wurde erfolgreich auf Cloudflare R2 gespeichert.
            </p>
            <a 
              href={uploadSuccess.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-white underline mt-2 hover:text-green-400"
            >
              Datei ansehen <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-white/50 mb-4" />
          <p className="text-white/50 tracking-widest uppercase text-sm">Lade Bilder...</p>
        </div>
      )}

      {error && (
        <div className="text-center text-red-500 bg-red-500/10 p-4 rounded-lg max-w-2xl mx-auto border border-red-500/20 mb-8">
          <p>Fehler: {error}</p>
        </div>
      )}

      {!loading && !error && flickrPosts.length === 0 && (
        <div className="text-center text-white/50">
          <p>Keine Bilder gefunden.</p>
        </div>
      )}

      {!loading && flickrPosts.length > 0 && (
        <ThumbnailGalleryGrid
          flickrPosts={flickrPosts}
          isEditing={isEditing}
          activeUploads={activeUploads}
          showResolutions={showResolutions}
          sensors={sensors}
          imageDimensions={imageDimensions}
          isR2Fallback={isR2Fallback}
          isEmbeddedData={isEmbeddedData}
          handleDragEnd={handleDragEnd}
          handleImageUpload={handleImageUpload}
          handleVideoFileUpload={handleVideoFileUpload}
          handlePostChange={handlePostChange}
          handleVideoLinkChange={handleVideoLinkChange}
          handleDeletePost={handleDeletePost}
          handleMergeDown={handleMergeDown}
          handleUpdatePostMedia={handleUpdatePostMedia}
          handleRemoveMedia={handleRemoveMedia}
          setSelectedImage={setSelectedImage}
          handleStateToggle={handleStateToggle}
          handleToggleHidden={handleToggleHidden}
          handleImageLoad={handleImageLoad}
          getDisplayImage={getDisplayImage}
          getImageSrc={getImageSrc}
          getVideoSrc={getVideoSrc}
          formatDescription={formatDescription}
          isValidImageCandidate={isValidImageCandidate}
          bunnyProgress={bunnyProgress}
          // Cross-post media drag props
          activeMediaDrag={activeMediaDrag}
          onMediaDragStart={handleMediaDragStart}
          onMediaDragEnd={handleMediaDragEnd}
          onCrossPostMediaDrop={handleCrossPostMediaDrop}
          // Multi-select click handlers
          mediaSelection={mediaSelection}
          onMediaClick={handleMediaClick}
          onMediaAltClick={handleMediaAltClick}
          clearMediaSelection={clearMediaSelection}
        />
      )}

      {/* Backups Modal */}
      <BackupsModal
        isOpen={showBackups}
        onClose={() => setShowBackups(false)}
        backupsList={backupsList}
        isRestoring={isRestoring}
        restoreError={restoreError}
        lastRestoredFilename={lastRestoredFilename}
        onRestore={handleRestoreBackup}
      />

      {/* Scraping Logs Modal */}
      <ScrapingLogsModal
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
        logs={scrapeLogs}
        isScraping={isScraping}
        syncStatus={syncStatus}
        fullR2SyncStatus={fullR2SyncStatus}
        logsEndRef={logsEndRef as React.RefObject<HTMLDivElement>}
      />

      {/* Uncertain Matches Modal */}
      <UncertainMatchesModal
        isOpen={showUncertain}
        onClose={() => setShowUncertain(false)}
        matches={uncertainMatches}
        flickrPosts={flickrPosts}
        getImageSrc={getImageSrc}
        getDisplayImage={getDisplayImage}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        onConfirmMatch={handleConfirmMatch}
        onRejectMatch={handleRejectMatch}
      />

      {/* Bio Editor Modal */}
      <BioEditorModal
        isOpen={showBioEditor}
        bio={portfolioBio}
        onClose={() => setShowBioEditor(false)}
        onSave={setPortfolioBio}
      />

      {/* Post Commit Modal */}
      <PostCommitModal
        isOpen={showPostCommitModal}
        post={selectedPostForCommit}
        source={commitPostSource}
        onClose={resetCommitState}
        onConfirm={handleConfirmCommitPost}
      />

      <ConfirmSyncModal
        isOpen={cloudSyncState !== null}
        onClose={handleCancelCloudSync}
        onIgnore={handleIgnoreCloudSync}
        onConfirm={handleApplyCloudSync}
        changes={cloudSyncState?.changes || []}
      />

      <CloudSyncChangesModal
        isOpen={cloudSyncChanges !== null}
        onClose={() => setCloudSyncChanges(null)}
        changes={cloudSyncChanges || []}
      />

      <TrashModal
        isOpen={showTrashModal}
        onClose={() => setShowTrashModal(false)}
        items={trashItems}
        loading={trashLoading}
        error={trashError}
        onRefresh={() => loadTrashItems()}
        onRestore={handleRestoreTrashItems}
        onDelete={handleDeleteTrashItems}
        onDeletePermanently={handlePermanentlyDeleteTrashItems}
      />

      <MediaVariantsModal
        isOpen={showMediaVariantsModal}
        onClose={() => setShowMediaVariantsModal(false)}
        onStateUpdated={refreshStateAfterMediaVariants}
      />

      <LightboxModal
        currentLightboxPost={currentLightboxPost}
        lightboxMousePos={lightboxMousePos}
        isHoveringLightboxBg={isHoveringLightboxBg}
        lightboxDraggedIdx={lightboxDraggedIdx}
        imageDimensions={imageDimensions}
        setLightboxMousePos={setLightboxMousePos}
        setIsHoveringLightboxBg={setIsHoveringLightboxBg}
        setSelectedImage={setSelectedImage}
        showResolutions={showResolutions}
        isEditing={isEditing}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        getImageSrc={getImageSrc}
        getVideoSrc={getVideoSrc}
        getDisplayImage={getDisplayImage}
        handleImageLoad={handleImageLoad}
        handleLightboxDragStart={handleLightboxDragStart}
        handleLightboxDragOver={handleLightboxDragOver}
        handleLightboxDrop={handleLightboxDrop}
        handlePostChange={handlePostChange}
      />
      <RearrangeModal
        isReorderView={isReorderView}
        setIsReorderView={setIsReorderView}
        selectedThumbnails={selectedThumbnails}
        setSelectedThumbnails={setSelectedThumbnails}
        isMoving={isMoving}
        setIsMoving={setIsMoving}
        activeId={activeId}
        setActiveId={setActiveId}
        lastSelectedId={lastSelectedId}
        setLastSelectedId={setLastSelectedId}
        flickrPosts={flickrPosts}
        past={past}
        future={future}
        sensors={sensors}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleMerge={handleMerge}
        handleBulkDelete={handleBulkDelete}
        handleDragEnd={handleDragEnd}
        handleMoveToTarget={handleMoveToTarget}
        onSelect={(post: any, e: React.MouseEvent) => {
          toggleSelection(String(post.id), e.shiftKey, e.ctrlKey || e.metaKey, flickrPosts.map(p => String(p.id)));
        }}
        reorderScrollRef={reorderScrollRef}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        getImageSrc={getImageSrc}
        getVideoSrc={getVideoSrc}
        getDisplayImage={getDisplayImage}
        setSelectedImage={setSelectedImage}
      />
    </div>
  );
}

