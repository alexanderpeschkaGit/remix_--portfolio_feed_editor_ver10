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
  const [r2CleanupRunning, setR2CleanupRunning] = useState(false);
  const [legacyDupCleanupRunning, setLegacyDupCleanupRunning] = useState(false);
  const [redundancyCleanupRunning, setRedundancyCleanupRunning] = useState(false);
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
  const [isInitialized, setIsInitialized] = useState(false);

  const { localLastUpdated, hasCloudChanges, cloudSyncChanges, cloudSyncState, ignoreCloudChangesRef, setLocalLastUpdated, setHasCloudChanges, setCloudSyncState, setCloudSyncChanges, handleSyncFromCloudflare, handleCancelCloudSync, handleIgnoreCloudSync, handleApplyCloudSync } = useCloudSync({
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
  const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [lastRestoredFilename, setLastRestoredFilename] = useState<string | null>(
    () => localStorage.getItem('portfolioLastRestoredBackup')
  );
    const { scrapeLogs, setScrapeLogs, isScraping, showLogs, setShowLogs, syncStatus, fullR2SyncStatus, uncertainMatches, showUncertain, setShowUncertain, handleFullR2Sync, handleScrape, handleHighResSync, handleConfirmMatch, handleRejectMatch } = useScrapeSync({ flickrPostsRef, updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad), setFlickrPosts, setHasUnsyncedMedia, setIsFlickrFallback: (v: boolean) => setIsFlickrFallback(v) });const statusNoticeTimerRef = useRef<number | null>(null);

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

  const handleResetAll = async () => {
    if (isResettingAll) return;
    const confirm = window.confirm(
      'ACHTUNG: Das leert den kompletten R2-Bucket und baut ihn danach aus den lokalen Daten neu auf.\n\n' +
      'Lokale Dateien und Edits bleiben erhalten.\n\n' +
      'Wirklich fortfahren?'
    );
    if (!confirm) return;

    setIsResettingAll(true);
    setError('');
    try {
      const response = await fetch('/api/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'YES' })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.details || 'R2-Rebuild fehlgeschlagen');
      }
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'R2-Rebuild fehlgeschlagen');
      setIsResettingAll(false);
    }
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
  const [isR2Fallback, setIsR2Fallback] = useState(false);
  const [isEmbeddedData, setIsEmbeddedData] = useState(false);
  const [isFlickrFallback, setIsFlickrFallback] = useState(false);
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('portfolioEditorFallbackEnabled');
      if (raw === null) return true;
      return raw !== 'false';
    } catch {
      return true;
    }
  });
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

  useEffect(() => {
    try {
      localStorage.setItem('portfolioEditorFallbackEnabled', String(fallbackEnabled));
    } catch {
      // ignore storage failures
    }
  }, [fallbackEnabled]);

  // Public media configuration. Credentials and publishing remain server-side.
  const R2_CONFIG = {
    publicDomain: ""
  };

  // Image URL resolver (utils/mediaHelpers) bound to the R2 public domain.
  const getDisplayImage = createGetDisplayImage(R2_CONFIG.publicDomain);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setPublicDomain(data.publicDomain))
      .catch(() => {
        // Fallback to hardcoded public domain if API fails (e.g. on static hosting)
        setPublicDomain(R2_CONFIG.publicDomain);
      });
  }, []);

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
    const loadData = async () => {
      // Check if data is embedded in the HTML (Schritt 3)
      const embeddedDataElement = document.getElementById('portfolio-data');
      if (embeddedDataElement) {
        try {
          const data = JSON.parse(embeddedDataElement.textContent || '{}');
          if (data.posts && data.posts.length > 0) {
            console.log("Loading from embedded data");
            setIsEmbeddedData(true);
            setPortfolioTitle(data.title || "Portfolio Gallery");
            setPortfolioSubtitle(data.subtitle || "My creative works");
            if (data.bio) setPortfolioBio(data.bio);
            setFlickrPosts(data.posts);
            setLoading(false);
            setIsInitialized(true);
            setHasUnpublishedChanges(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing embedded data:", e);
        }
      }

      try {
        const stateRes = await fetch('/api/state');
        if (!stateRes.ok) throw new Error('API not available');
        const stateData = await stateRes.json();
        if (stateData.title) {
          setPortfolioTitle(stateData.title);
        }
        if (stateData.subtitle) {
          setPortfolioSubtitle(stateData.subtitle);
        }
        if (stateData.bio) {
          setPortfolioBio(stateData.bio);
        }
        if (stateData.scrapeConfig) {
          if (stateData.scrapeConfig.igAccount) setIgAccount(stateData.scrapeConfig.igAccount);
          if (stateData.scrapeConfig.flickrUrl) setFlickrUrl(stateData.scrapeConfig.flickrUrl);
        }
        if (stateData.items && stateData.items.length > 0) {
          setFlickrPosts(stateData.items);
          setLocalLastUpdated(stateData.lastUpdated || new Date(0).toISOString());
          setLoading(false);
          setIsInitialized(true);
          setHasUnpublishedChanges(false);
          return;
        } else {
          throw new Error('Local state is empty');
        }
      } catch (e) {
        console.log("No local state found, trying to load from Cloudflare R2...");
        if (!fallbackEnabled) {
          setError('Lokaler Zustand ist leer. Fallback ist deaktiviert.');
          setLoading(false);
          setIsInitialized(true);
          return;
        }
        try {
          // Try to fetch the live state.json from the R2 bucket via our backend proxy to avoid CORS
          const r2Res = await fetch('/api/r2-state');
          if (r2Res.ok) {
            const r2Data = await r2Res.json();
            console.log("Successfully loaded from R2 state.json!");
            setIsR2Fallback(true);
            setIsFlickrFallback(false);
            setPortfolioTitle(r2Data.title || portfolioTitle);
            setPortfolioSubtitle(r2Data.subtitle || portfolioSubtitle);
            if (r2Data.bio) setPortfolioBio(r2Data.bio);
            if (r2Data.scrapeConfig) {
              if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
              if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
            }
            
            const items = r2Data.items || r2Data.posts || [];
            if (r2Data.lastUpdated) setLocalLastUpdated(r2Data.lastUpdated);
            
            if (items.length > 0) {
              const baseUrl = R2_CONFIG.publicDomain.endsWith('/') ? R2_CONFIG.publicDomain.slice(0, -1) : R2_CONFIG.publicDomain;
              const absoluteItems = items.map((item: any) => ({
                ...item,
                image: item.image && !item.image.startsWith('http') ? `${baseUrl}/${item.image.startsWith('/') ? item.image.substring(1) : item.image}` : item.image,
                image_large: item.image_large && !item.image_large.startsWith('http') ? `${baseUrl}/${item.image_large.startsWith('/') ? item.image_large.substring(1) : item.image_large}` : item.image_large,
                largeUrl: item.largeUrl && !item.largeUrl.startsWith('http') ? `${baseUrl}/${item.largeUrl.startsWith('/') ? item.largeUrl.substring(1) : item.largeUrl}` : item.largeUrl,
                url: item.url && !item.url.startsWith('http') ? `${baseUrl}/${item.url.startsWith('/') ? item.url.substring(1) : item.url}` : item.url,
                link: item.link && !item.link.startsWith('http') ? `${baseUrl}/${item.link.startsWith('/') ? item.link.substring(1) : item.link}` : item.link,
                mergedMedia: item.mergedMedia ? item.mergedMedia.map((m: any) => ({
                  ...m,
                  image: m.image && !m.image.startsWith('http') ? `${baseUrl}/${m.image.startsWith('/') ? m.image.substring(1) : m.image}` : m.image,
                  url: m.url && !m.url.startsWith('http') ? `${baseUrl}/${m.url.startsWith('/') ? m.url.substring(1) : m.url}` : m.url,
                  largeUrl: m.largeUrl && !m.largeUrl.startsWith('http') ? `${baseUrl}/${m.largeUrl.startsWith('/') ? m.largeUrl.substring(1) : m.largeUrl}` : m.largeUrl
                })) : item.mergedMedia
              }));
              setFlickrPosts(absoluteItems);
              setLoading(false);
              setIsInitialized(true);
              setHasUnpublishedChanges(false);
              
              // Save this R2 state to our local backend so we can edit it
              try {
                await fetch('/api/state', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(r2Data)
                });
                console.log("Saved R2 state to local backend.");
              } catch (saveErr) {
                console.error("Could not save R2 state locally:", saveErr);
              }
              
              return;
            }
          }
        } catch (r2Err) {
          console.log("Could not load R2 state (maybe CORS or file missing):", r2Err);
        }
        if (!fallbackEnabled) {
          setLoading(false);
          setIsInitialized(true);
          setHasUnpublishedChanges(false);
          return;
        }
        console.log("Loading from Flickr as fallback (Test Data)");
        setIsFlickrFallback(true);
      }

      try {
        const response = await fetch('/api/flickr');
        if (!response.ok) {
          throw new Error('Failed to fetch Flickr data');
        }
        const flickrData = await response.json();

        const posts = (flickrData?.items || []).map((item: any) => {
          const imgUrl = item.media?.m ? item.media.m.replace('_m.jpg', '_b.jpg') : '';
          const imgLargeUrl = item.best_resolution || (imgUrl ? imgUrl.replace('_b.jpg', '_k.jpg') : '');
          
          let desc = item.description || '';
          desc = desc.replace(/^.?posted a photo:\s/i, '');
          
          return {
            id: item.id || `flickr-${Math.random()}`,
            title: item.title || 'Untitled',
            description: desc,
            image: imgUrl,
            image_large: imgLargeUrl,
            url: item.link || '',
            network_name: 'Flickr',
            type: 'image'
          };
        }).filter((post: any) => post.image);

        setFlickrPosts(posts.slice(0, 24));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setIsInitialized(true);
        setHasUnpublishedChanges(false);
      }
    };

    loadData();
  }, []);

  // Auto-save state
  useEffect(() => {
    if (isInitialized && flickrPosts.length > 0 && uploadingCount === 0) {
      // Clean state for server: remove blob URLs and image_preview
      const cleanPosts = cleanPostsForServer(flickrPosts);

      const pushToR2 = shouldPushStateToR2Ref.current;
      if (pushToR2) {
        shouldPushStateToR2Ref.current = false;
      }

      // Guard: warn if any Bunny uploads are still in progress (bunnyTaskId without videoId)
      const stuckBunnyItems = cleanPosts.flatMap((post: any) =>
        (post.mergedMedia || []).filter((m: any) => m.bunnyTaskId && !m.videoId)
      );
      if (stuckBunnyItems.length > 0) {
        console.warn(`[state-guard] Deferring save: ${stuckBunnyItems.length} Bunny upload(s) still pending videoId.`);
        // Don't save yet — the items are still in flight; polling will update them soon
        return;
      }

      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: cleanPosts, 
          title: portfolioTitle, 
          subtitle: portfolioSubtitle,
          bio: portfolioBio,
          projectStates: PROJECT_STATES,
          scrapeConfig: {
            igAccount,
            flickrUrl
          },
          pushToR2
        })
      }).catch(console.error);
    }
  }, [flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, igAccount, flickrUrl, isInitialized, uploadingCount]);

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

  keyHandlersRef.current = { handleUndo, handleRedo, mediaSelection, clearMediaSelection };

  const handleToggleHidden = (postId: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(postId)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        return { ...post, hidden: !post.hidden };
      }
      return post;
    }), `Visibility geändert (${targetTitle})`);
  };

  const handleStateToggle = (postId: string, stateId: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(postId)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        const states = post.states || [];
        const stateIdLower = String(stateId).toLowerCase();
        const hasState = states.some((s: string) => String(s).toLowerCase() === stateIdLower);
        
        const newStates = hasState 
          ? states.filter((s: string) => String(s).toLowerCase() !== stateIdLower)
          : [...states, stateId];
        return { ...post, states: newStates };
      }
      return post;
    }), `Kategorie geändert (${targetTitle})`);
  };

  const handlePostChange = (id: string, field: string, value: string) => {
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(id)));
    updatePosts(posts => posts.map(post => 
      String(post.id) === String(id) ? { ...post, [field]: value } : post
    ), `Textfeld bearbeitet (${targetTitle})`);
  };

  const handleAddNewPost = () => {
    const newPost = {
      id: `custom-${Date.now()}`,
      title: '',
      description: '',
      network_name: 'Custom',
      type: 'image',
      states: []
    };
    updatePosts([newPost, ...flickrPosts], 'Neuen Post hinzugefügt (Custom)');
    setIsEditing(true);
  };

  const handleDeletePost = async (id: string) => {
    const targetPost = flickrPosts.find(p => String(p.id) === String(id));
    if (!targetPost) return;
    const targetTitle = describePost(targetPost);
    const hasMediaFiles = !!(
      targetPost.image || targetPost.image_original || targetPost.url || targetPost.image_thumb ||
      (Array.isArray(targetPost.mergedMedia) && targetPost.mergedMedia.length > 0)
    );
    const confirmMessage = hasMediaFiles
      ? `Post "${targetTitle}" wirklich löschen?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar) und die R2-Dateien werden unwiderruflich gelöscht.`
      : `Post "${targetTitle}" wirklich löschen?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      const res = await fetch('/api/state/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Löschen fehlgeschlagen');

      const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
      const prevPosts = flickrPosts;
      recordHistory({ posts: prevPosts, bakFiles, action: `Post gelöscht (${targetTitle})` });
      setHasUnpublishedChanges(true);
      setFlickrPosts(prev => prev.filter(post => String(post.id) !== String(id)));
      if (bakFiles.length > 0) {
        pushStatusNotice('info', 'Post gelöscht', `${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      }
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten.');
    }
  };

  const handleMergeDown = useCallback((index: number) => {
    const targetTitle = describePost(flickrPosts[index]);
    updatePosts(posts => {
      const newPosts = [...posts];
      const current = newPosts[index];
      const next = newPosts[index + 1];
      
      if (!next) return posts;

      // FIX #2c: Merge-Operation - Strikte Filter-Logik
      const mergedMedia = [
        ...(current.mergedMedia || [{
          type: current.type || 'image',
          image: current.image,
          image_thumb: current.image_thumb,
          image_1k: current.image_1k,
          image_2k: current.image_2k,
          image_large: current.image_large,
          image_preview: current.image_preview,
          image_3k: current.image_3k,
          image_original: current.image_original,
          youtubeId: current.youtubeId,
          youtubeUrl: current.youtubeUrl,
          link: current.url,
          url: current.url
        }]),
        ...(next.mergedMedia || [{
          type: next.type || 'image',
          image: next.image,
          image_thumb: next.image_thumb,
          image_1k: next.image_1k,
          image_2k: next.image_2k,
          image_large: next.image_large,
          image_preview: next.image_preview,
          image_3k: next.image_3k,
          image_original: next.image_original,
          youtubeId: next.youtubeId,
          youtubeUrl: next.youtubeUrl,
          link: next.url,
          url: next.url
        }])
      ].filter(hasRenderableMedia);

      const mergedDescription = [current.description, next.description].filter(Boolean).join('<br/><br/>');
      const primaryMedia = getPrimaryMergedMedia(mergedMedia) || current;

      newPosts[index] = {
        ...current,
        ...syncMediaFieldsFromPrimary({ ...current }, primaryMedia),
        description: mergedDescription,
        mergedMedia,
      };

      newPosts.splice(index + 1, 1);
      return newPosts;
    }, `Posts zusammengeführt (${targetTitle})`);
  }, [flickrPosts, updatePosts]);

  const handleUpdatePostMedia = (id: string, newMediaRaw: any[]) => {
    // FIX #3: Strikte Filter-Logik - Phantom-Elemente entfernen
    // uploadId ist NUR während des Uploads erlaubt, danach müssen finale URLs vorhanden sein
    const newMedia = newMediaRaw.filter(hasRenderableMedia);
    const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(id)));
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        const updatedPost = { ...post, mergedMedia: newMedia };
        const primaryMedia = getPrimaryMergedMedia(newMedia);
        if (primaryMedia) {
          return {
            ...syncMediaFieldsFromPrimary(updatedPost, primaryMedia),
            mergedMedia: newMedia
          };
        }
        return updatedPost;
      }
      return post;
    }), `Post Media aktualisiert (${targetTitle})`);
    shouldPushStateToR2Ref.current = true;
  };

  const handleRemoveMedia = async (postId: string, mediaIndex: number) => {
    const targetPost = flickrPosts.find(p => String(p.id) === String(postId));
    if (!targetPost) return;
    const mergedMedia = Array.isArray(targetPost.mergedMedia) ? targetPost.mergedMedia : [];
    const mediaItems = mergedMedia.length > 0
      ? mergedMedia
      : [{ type: targetPost.type || 'image', image: targetPost.image, image_large: targetPost.image_large, youtubeId: targetPost.youtubeId, youtubeUrl: targetPost.youtubeUrl, link: targetPost.url }];
    const removedItem = mediaItems[mediaIndex];
    if (!removedItem) return;

    const isRealEntry = mergedMedia.includes(removedItem);

    // Synthesized entry (post without mergedMedia) -> keep old local-only removal.
    if (!isRealEntry) {
      handleUpdatePostMedia(postId, mediaItems.filter((_: any, idx: number) => idx !== mediaIndex));
      return;
    }

    const mediaId = removedItem?.id !== undefined && removedItem?.id !== null ? String(removedItem.id) : undefined;
    const mediaUrl =
      (typeof removedItem?.video === 'string' && removedItem.video) ||
      (typeof removedItem?.url === 'string' && removedItem.url) ||
      (typeof removedItem?.image_original === 'string' && removedItem.image_original) ||
      (typeof removedItem?.image_large === 'string' && removedItem.image_large) ||
      (typeof removedItem?.image === 'string' && removedItem.image) ||
      undefined;

    const removedLabel = removedItem.type === 'youtube' ? 'YouTube' : removedItem.type === 'bunny' ? 'Bunny-Video' : removedItem.type === 'video' ? 'Video' : 'Bild';
    if (!window.confirm(`"${removedLabel}" wirklich entfernen?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar) und die R2-Dateien werden unwiderruflich gelöscht.`)) return;

    try {
      const res = await fetch('/api/state/delete-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, mediaId, mediaIndex, mediaUrl })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        // Server could not find the media entry (e.g. state drift) -> safe local-only removal.
        handleUpdatePostMedia(postId, mediaItems.filter((_: any, idx: number) => idx !== mediaIndex));
        return;
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Entfernen fehlgeschlagen');

      const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
      const newMedia = mediaItems.filter((_: any, idx: number) => idx !== mediaIndex).filter(hasRenderableMedia);
      const prevPosts = flickrPosts;
      const newPosts = prevPosts.map(post => {
        if (String(post.id) !== String(postId)) return post;
        const updatedPost = { ...post, mergedMedia: newMedia };
        const primaryMedia = getPrimaryMergedMedia(newMedia);
        if (primaryMedia) {
          return { ...syncMediaFieldsFromPrimary(updatedPost, primaryMedia), mergedMedia: newMedia };
        }
        if (newMedia.length === 0) {
          return clearPostMediaFields({ ...updatedPost, mergedMedia: undefined });
        }
        return updatedPost;
      });
      recordHistory({ posts: prevPosts, bakFiles, action: `Media entfernt (${removedLabel})` });
      setHasUnpublishedChanges(true);
      setFlickrPosts(newPosts);
      shouldPushStateToR2Ref.current = true;
      if (bakFiles.length > 0) {
        pushStatusNotice('info', 'Media entfernt', `${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      }
    } catch (err: any) {
      setError(err.message || 'Ein Fehler ist aufgetreten.');
    }
  };

  const handleMoveToTarget = (targetId: string) => {
    if (selectedThumbnails.includes(String(targetId))) return;

    const selectedPosts = flickrPosts.filter(p => selectedThumbnails.includes(String(p.id)));
    const remainingPosts = flickrPosts.filter(p => !selectedThumbnails.includes(String(p.id)));
    
    const targetIndex = remainingPosts.findIndex(p => String(p.id) === String(targetId));
    const firstTitle = describePost(selectedPosts[0]);
    
    if (targetIndex === -1) {
      // If target not found, just append to the end
      updatePosts([...remainingPosts, ...selectedPosts], `Posts verschoben (${selectedPosts.length}, u.a. ${firstTitle})`);
    } else {
      // Insert selected items AFTER the target item
      const newPosts = [
        ...remainingPosts.slice(0, targetIndex + 1),
        ...selectedPosts,
        ...remainingPosts.slice(targetIndex + 1)
      ];
      updatePosts(newPosts, `Posts verschoben (${selectedPosts.length}, u.a. ${firstTitle})`);
    }
    
    setIsMoving(false);
    setSelectedThumbnails([]);
    setLastSelectedId(null);
  };

  // Bio feature handlers (wrappers around hook functions)
  const handleAddInstagramPost = () => handleGetLatestInstagram(flickrPosts);
  const handleAddFlickrPost = () => handleGetLatestFlickr(flickrPosts);
  const handleConfirmCommitPost = () => handleCommitPostToPortfolio(updatePosts, flickrPosts);

  // Track Bunny upload progress per post
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
  const handleRedundancyCleanup = async () => {
    if (redundancyCleanupRunning) return;

    setRedundancyCleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Hashing R2 and local media (SHA-1)...']);

    try {
      const previewResponse = await fetch('/api/r2-redundancy/preview', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(
          previewData.error ||
          (previewData.warnings || []).join(' ') ||
          'Redundancy preview failed'
        );
      }

      const previewLogs = [
        'Redundancy scan complete.',
        `Files hashed: ${previewData.scannedCount || 0}`,
        `Redundant copies: ${previewData.duplicateCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.duplicateCount) {
        setRedundancyCleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.duplicateCount} byte-identical duplicates found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `R2 copies move to trash/ (undoable), local copies move to bak/redundant/.\n` +
            `Referenced files are always kept as the surviving copy.\n\n` +
            `Continue?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Redundancy cleanup cancelled.']);
            setRedundancyCleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving redundant copies...']);
          const executeResponse = await fetch('/api/r2-redundancy/execute', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Redundancy cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Redundancy cleanup complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'Redundanz rückgängig');
          if (Array.isArray(executeData.bakFiles) && executeData.bakFiles.length > 0) {
            recordHistory({ posts: [], bakFiles: executeData.bakFiles, action: `Redundante lokale Dateien nach bak/ (${executeData.bakFiles.length})` });
          }
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Redundancy cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setRedundancyCleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Redundancy cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setRedundancyCleanupRunning(false);
    }
  };

  // Irreversible: empties the local bak/ archive. bak/ is the last safety net,
  // so this needs an explicit typed confirmation.
  const handlePurgeBak = async () => {
    const typed = window.prompt(
      'bak/ LEEREN?\n\nAlle lokal archivierten Dateien werden unwiderruflich gelöscht.\n' +
      'Dies kann NICHT rückgängig gemacht werden.\n\nZum Bestätigen "LEEREN" eingeben:'
    );
    if (typed?.trim().toUpperCase() !== 'LEEREN') return;

    setError('');
    try {
      const res = await fetch('/api/bak/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'bak/ konnte nicht geleert werden');
      }
      setScrapeLogs(prev => [
        ...prev,
        `bak/ geleert: ${data.deletedCount || 0} Dateien (${formatBytes(data.deletedBytes || 0)}).`
      ]);
      setShowLogs(true);
    } catch (err: any) {
      setError(err.message || 'bak/ konnte nicht geleert werden');
    }
  };


  useEffect(() => {
    if (!isInitialized) return;
    loadTrashItems().catch(() => {});
  }, [isInitialized]);

  const handleR2Cleanup = async () => {
    if (r2CleanupRunning) return;

    setR2CleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Scanning R2 for orphaned files...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Cleanup preview failed');
      }

      const previewLogs = [
        'R2 scan complete.',
        `Files checked: ${previewData.scannedCount || 0}`,
        `Orphaned files: ${previewData.orphanedCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.orphanedCount) {
        setR2CleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.orphanedCount} orphaned R2 files found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Move these files to the trash?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Move to trash cancelled.']);
            setR2CleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving orphaned files to trash...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Move to trash complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'R2-Cleanup rückgängig');
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setR2CleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setR2CleanupRunning(false);
    }
  };

  const handleLegacyDuplicateCleanup = async () => {
    if (legacyDupCleanupRunning) return;

    setLegacyDupCleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Scanning legacy uploads for duplicates...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview-legacy-uploads', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Duplicate preview failed');
      }

      const previewLogs = [
        'Legacy duplicate scan complete.',
        `Legacy files checked: ${previewData.scannedCount || 0}`,
        `Safe duplicates: ${previewData.duplicateCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.duplicateCount) {
        setLegacyDupCleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.duplicateCount} safe legacy duplicates found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Move these legacy uploads to the trash?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Move to trash cancelled.']);
            setLegacyDupCleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving legacy duplicates to trash...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute-legacy-uploads', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Duplicate cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Legacy duplicate move complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'Legacy-Cleanup rückgängig');
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Duplicate cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setLegacyDupCleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Duplicate cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setLegacyDupCleanupRunning(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const targetTitle = describePost(flickrPosts.find(p => String(p.id) === String(active.id)));
      updatePosts((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      }, `Post verschoben (${targetTitle})`);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setBackupsList(data.files || []);
      setShowBackups(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setIsRestoring(filename);
    setRestoreError(null);
    
    try {
      const res = await fetch(`/api/backups/${filename}`);
      if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.statusText}`);
      
      let data: any = null;
      const isJson = filename.endsWith('.json');
      
      if (isJson) {
        data = await res.json();
      } else {
        const html = await res.text();
        // Extract data from script tag (try editor full state first, fallback to public portfolio data)
        const fullStateMatch = html.match(/<script id="editor-state-backup" type="application\/json">([\s\S]*?)<\/script>/);
        const publicMatch = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        const match = fullStateMatch || publicMatch;
        if (match && match[1]) {
          data = JSON.parse(match[1]);
        }
      }
      
      if (data) {
        const items = data.items || data.posts;
        if (items) {
          // Use the functional update to ensure we have the latest state for history
          setFlickrPosts(current => {
            recordHistory({ posts: current, action: `Backup wiederhergestellt (${filename})` });
            return items;
          });
          
          if (data.title) setPortfolioTitle(data.title);
          if (data.subtitle) setPortfolioSubtitle(data.subtitle);
          if (data.bio) setPortfolioBio(data.bio);
          if (data.scrapeConfig) {
            if (data.scrapeConfig.igAccount) setIgAccount(data.scrapeConfig.igAccount);
            if (data.scrapeConfig.flickrUrl) setFlickrUrl(data.scrapeConfig.flickrUrl);
          }
          
          // Track last restored backup for visual indicator
          setLastRestoredFilename(filename);
          localStorage.setItem('portfolioLastRestoredBackup', filename);

          // Close modal after a short delay to show success
          setTimeout(() => {
            setShowBackups(false);
            setIsRestoring(null);
          }, 500);
          
          ignoreCloudChangesRef.current = true;
          setHasCloudChanges(false);
        } else {
          throw new Error("Keine Daten im Backup gefunden.");
        }
      } else {
        throw new Error(isJson ? "JSON-Daten ungültig." : "Backup-Format ungültig (Script-Tag fehlt).");
      }
    } catch (e: any) {
      console.error("Restore failed:", e);
      setRestoreError(e.message || "Unbekannter Fehler");
      setIsRestoring(null);
    }
  };

  const handleLightboxDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setLightboxDraggedIdx(index);
  };

  const handleLightboxDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleLightboxDrop = (e: React.DragEvent, index: number, postId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (lightboxDraggedIdx === null || lightboxDraggedIdx === index) return;
    
    const post = flickrPosts.find(p => String(p.id) === String(postId));
    if (!post) return;
    
    const mediaItems = post.mergedMedia || [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, link: post.url }];
    const newMedia = [...mediaItems];
    const [draggedItem] = newMedia.splice(lightboxDraggedIdx, 1);
    newMedia.splice(index, 0, draggedItem);
    
    handleUpdatePostMedia(postId, newMedia);
    setLightboxDraggedIdx(null);
  };

  const currentLightboxPost = selectedImage ? (flickrPosts.find(p => String(p.id) === String(selectedImage.id)) || selectedImage) : null;

  const handleMerge = async () => {
    if (selectedThumbnails.length < 2) return;
    
    const postsToMerge = flickrPosts.filter(p => selectedThumbnails.includes(String(p.id)));
    // Sort them by their current order in the feed
    postsToMerge.sort((a, b) => {
      return flickrPosts.indexOf(a) - flickrPosts.indexOf(b);
    });

    const mainPost = { ...postsToMerge[0] };
    const otherPosts = postsToMerge.slice(1);

    // Combine text
    let combinedDescription = mainPost.description || "";
    for (const post of otherPosts) {
      if (post.title || post.description) {
        combinedDescription += "\n\nâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n\n";
        if (post.title) combinedDescription += `<strong>${post.title}</strong>\n\n`;
        if (post.description) combinedDescription += post.description;
      }
    }
    mainPost.description = combinedDescription;

    if (!mainPost.mergedMedia) mainPost.mergedMedia = [];
    
    // Add main post's own media to mergedMedia if it's not already there
    const mainMedia = {
      id: mainPost.id,
      type: mainPost.type || 'image',
      image: mainPost.image,
      image_large: mainPost.image_large,
      url: mainPost.url,
      phash: mainPost.phash,
      youtubeId: mainPost.youtubeId
    };
    
    // Check if mainMedia is already in mergedMedia
    const alreadyPresent = mainPost.mergedMedia.some((m: any) => m.id === mainPost.id);
    if (!alreadyPresent) {
      mainPost.mergedMedia = [mainMedia, ...mainPost.mergedMedia];
    }

    // Add other posts' media
    for (const post of otherPosts) {
      if (post.mergedMedia && post.mergedMedia.length > 0) {
        mainPost.mergedMedia = [...mainPost.mergedMedia, ...post.mergedMedia];
      } else {
        mainPost.mergedMedia.push({
          id: post.id,
          type: post.type || 'image',
          image: post.image,
          image_large: post.image_large,
          url: post.url,
          phash: post.phash,
          youtubeId: post.youtubeId
        });
      }
    }

    const primaryMedia = getPrimaryMergedMedia(mainPost.mergedMedia) || mainPost;
    syncMediaFieldsFromPrimary(mainPost, primaryMedia);

    updatePosts(prev => {
      const filtered = prev.filter(p => !selectedThumbnails.includes(String(p.id)) || String(p.id) === String(mainPost.id));
      return filtered.map(p => String(p.id) === String(mainPost.id) ? mainPost : p);
    }, `Posts zusammengeführt (${describePost(mainPost)})`);

    // Stay in rearrange mode and select the newly merged post
    setSelectedThumbnails([String(mainPost.id)]);
  };

  const handleBulkDelete = async () => {
    if (selectedThumbnails.length === 0) return;

    const confirmDelete = window.confirm(`Bist du sicher, dass du ${selectedThumbnails.length} Element(e) löschen möchtest?\n\nLokale Dateien werden nach bak/ verschoben (über Undo wiederherstellbar), R2-Dateien werden unwiderruflich gelöscht.`);
    if (!confirmDelete) return;

    try {
      const idsToDelete = selectedThumbnails.map(id => String(id));
      const prevPosts = flickrPosts;
      const res = await fetch('/api/state/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });

      const data = await res.json();
      if (data.success) {
        const bakFiles = Array.isArray(data.movedToBak) ? data.movedToBak : [];
        recordHistory({ posts: prevPosts, bakFiles, action: `${idsToDelete.length} Posts gelöscht` });
        setHasUnpublishedChanges(true);
        setFlickrPosts(prev => prev.filter(post => !idsToDelete.includes(String(post.id))));
        setSelectedThumbnails([]);
        alert(`${data.deletedCount} Element(e) gelöscht. ${bakFiles.length} Datei(en) nach bak/ verschoben, ${data.r2DeletedCount ?? 0} von R2 gelöscht.`);
      } else {
        alert('Fehler beim Löschen: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Ein Fehler ist aufgetreten.');
    }
  };

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

