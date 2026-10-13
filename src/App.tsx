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
import { linkifyToHtml } from './utils/linkify';
import { RearrangeModal } from './components/modals/RearrangeModal';
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
import { FeedPostCard } from './components/feed/FeedPostCard';
import { ThumbnailGalleryGrid } from './components/gallery/ThumbnailGalleryGrid';
import { AdminHeader } from './components/header/AdminHeader';
import { mergeIncomingPostsPreservingExisting, mergeCloudIntoLocal } from './utils/mergePosts';
import { formatDescription, isDirectMediaFile, isValidImageCandidate, getImageSrc, getVideoSrc, hasRenderableMedia, getMediaDedupeKey, getMediaPriorityScore, getPrimaryMergedMedia, syncMediaFieldsFromPrimary, clearPostMediaFields, formatBytes, createGetDisplayImage } from './utils/mediaHelpers';
import { generateHTML } from './utils/generatePortfolioHtml';
import type { PostHistoryEntry, TrashHistoryEntry, MediaDeleteHistoryEntry, UndoHistoryEntry } from './types';

const MergeConfirmationModal = ({ isOpen, group, onConfirm, onSkip }: any) => {
  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold text-white mb-4">Projekte zusammenführen?</h2>
        <p className="text-white/70 mb-4">
          Möchtest du die folgenden {group.length} Projekte mit dem Title "{group[0].title}" zusammenführen?
        </p>
        <div className="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
          {group.map((post: any) => (
            <div key={post.id} className="text-sm text-white/50 bg-white/10 p-2 rounded">
              {post.title} ({post.network_name})
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={onSkip} className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded">Nein</button>
          <button onClick={onConfirm} className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded">Ja, zusammenführen</button>
        </div>
      </div>
    </div>
  );
};

// SortablePost component moved to src/components/feed/FeedPostCard.tsx

export default function App() {
  const [flickrPosts, setFlickrPosts] = useState<any[]>([]);
  const flickrPostsRef = useRef<any[]>([]);
  const portfolioTitleRef = useRef<string>('');
  const portfolioSubtitleRef = useRef<string>('');
  const portfolioBioRef = useRef<string>('');
  const [past, setPast] = useState<UndoHistoryEntry[]>([]);
  const [future, setFuture] = useState<PostHistoryEntry[]>([]);
  const undoingR2TrashRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringLatestPublish, setRestoringLatestPublish] = useState(false);
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
  const [mergeQueue, setMergeQueue] = useState<any[][]>([]);
  const [currentMergeGroup, setCurrentMergeGroup] = useState<any[] | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [activeUploads, setActiveUploads] = useState<Record<string, number>>({});
  const [showResolutions, setShowResolutions] = useState(false);
  const [showResolutionToast, setShowResolutionToast] = useState(false);
  const [localLastUpdated, setLocalLastUpdated] = useState<string | null>(null);
  const [hasCloudChanges, setHasCloudChanges] = useState(false);
  const ignoreCloudChangesRef = useRef(false);
  const shouldPushStateToR2Ref = useRef(false);
  const [cloudSyncChanges, setCloudSyncChanges] = useState<string[] | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<{ changes: string[]; items: any[]; r2Data: any } | null>(null);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showMediaVariantsModal, setShowMediaVariantsModal] = useState(false);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [hasUnsyncedMedia, setHasUnsyncedMedia] = useState(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);

  // Shared drag state for cross-post media movement â€” uses mediaIndices array (supports batch)
  const [activeMediaDrag, setActiveMediaDrag] = useState<{ sourcePostId: string; mediaIndices: number[]; mediaItem: any } | null>(null);

  const handleMediaDragStart = (sourcePostId: string, mediaIndices: number[], mediaItem: any) => {
    setActiveMediaDrag({ sourcePostId, mediaIndices, mediaItem });
  };

  const handleMediaDragEnd = () => {
    setActiveMediaDrag(null);
  };

  // Multi-selection state for Ctrl+Click / Shift+Click on media items
  type MediaSelection = { sourcePostId: string; mediaIndices: number[]; lastClickedIndex: number } | null;
  const [mediaSelection, setMediaSelection] = useState<MediaSelection>(null);

  const clearMediaSelection = () => setMediaSelection(null);

  const handleMediaClick = (postId: string, mediaIndex: number, ctrlKey: boolean, shiftKey: boolean) => {
    setMediaSelection(prev => {
      if (prev && prev.sourcePostId !== postId && !ctrlKey) {
        return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
      }
      if (prev && prev.sourcePostId !== postId && ctrlKey) {
        return prev;
      }
      if (!prev) {
        return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
      }
      if (shiftKey && prev.lastClickedIndex !== null) {
        const start = Math.min(prev.lastClickedIndex, mediaIndex);
        const end = Math.max(prev.lastClickedIndex, mediaIndex);
        const range: number[] = [];
        for (let i = start; i <= end; i++) range.push(i);
        const merged = Array.from(new Set([...prev.mediaIndices, ...range])).sort((a, b) => a - b);
        return { ...prev, mediaIndices: merged, lastClickedIndex: mediaIndex };
      }
      if (ctrlKey) {
        const exists = prev.mediaIndices.includes(mediaIndex);
        const newIndices = exists
          ? prev.mediaIndices.filter(i => i !== mediaIndex)
          : [...prev.mediaIndices, mediaIndex].sort((a, b) => a - b);
        if (newIndices.length === 0) return null;
        return { ...prev, mediaIndices: newIndices, lastClickedIndex: mediaIndex };
      }
      if (prev.mediaIndices.length === 1 && prev.mediaIndices[0] === mediaIndex) {
        return null;
      }
      return { sourcePostId: postId, mediaIndices: [mediaIndex], lastClickedIndex: mediaIndex };
    });
  };

  const handleMediaAltClick = (targetPostId: string, targetMediaIndex?: number) => {
    if (!mediaSelection) return;
    if (mediaSelection.sourcePostId === targetPostId) return;
    handleCrossPostMediaDrop(mediaSelection.sourcePostId, mediaSelection.mediaIndices, targetPostId, targetMediaIndex);
    clearMediaSelection();
  };

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
  }, []);

  const processNextMerge = (queue: any[][]) => {
    if (queue.length === 0) {
      setCurrentMergeGroup(null);
      setIsMergeModalOpen(false);
      return;
    }
    const nextGroup = queue[0];
    setCurrentMergeGroup(nextGroup);
    setMergeQueue(queue.slice(1));
    setIsMergeModalOpen(true);
  };

  const confirmMerge = () => {
    if (!currentMergeGroup) return;

    const group = currentMergeGroup;
    const instagramPost = group.find(p => p.network_name === 'Instagram');
    const newTitle = instagramPost ? instagramPost.title : group[0].title;
    const newDescription = group.map(p => p.description).filter(Boolean).join('\n\n\n');
    const newMedia = group.flatMap(p => p.mergedMedia || [p]);

    const newPost = {
      ...group[0],
      id: Date.now().toString() + Math.random(),
      title: newTitle,
      description: newDescription,
      mergedMedia: newMedia,
      type: 'merged'
    };

    updatePosts((prevPosts: any[]) => {
      const groupIds = new Set(group.map(p => p.id));
      const firstPostIndex = prevPosts.findIndex(p => p.id === group[0].id);

      let newPosts = prevPosts.filter(p => !groupIds.has(p.id));
      newPosts.splice(firstPostIndex, 0, newPost);
      return newPosts;
    }, `Gruppe zusammengeführt (${newTitle})`);

    processNextMerge(mergeQueue);
  };

  const skipMerge = () => {
    processNextMerge(mergeQueue);
  };

  const handleMergeSimilar = () => {
    const grouped: { [title: string]: any[] } = {};
    flickrPosts.forEach(post => {
      if (!grouped[post.title]) grouped[post.title] = [];
      grouped[post.title].push(post);
    });

    const groupsToMerge = Object.values(grouped).filter(group => group.length >= 2);
    // Sort each group by their index in flickrPosts
    groupsToMerge.forEach(group => {
      group.sort((a, b) => flickrPosts.findIndex(p => p.id === a.id) - flickrPosts.findIndex(p => p.id === b.id));
    });
    
    if (groupsToMerge.length > 0) {
      processNextMerge(groupsToMerge);
    }
  };

  // ===== Hook: useRearrangeState für Rearrange/Merge/Delete Funktionalität =====
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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{url: string} | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ kind: 'success' | 'info' | 'warning'; title: string; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [lastRestoredFilename, setLastRestoredFilename] = useState<string | null>(
    () => localStorage.getItem('portfolioLastRestoredBackup')
  );
  const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null, progress: 0, total: 0 });
  const [uncertainMatches, setUncertainMatches] = useState<any[]>([]);
  const [showUncertain, setShowUncertain] = useState(false);
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

  const handleFullR2Sync = async () => {
    setHasUnsyncedMedia(false);
    setFullR2SyncStatus({ running: true, logs: ["Starte Cloudflare R2 Full Sync..."], done: false, error: null, progress: 0, total: 0 });
    setShowLogs(true);
    
    try {
      const startRes = await fetch('/api/sync/r2-full', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start full sync');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/r2-full/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setFullR2SyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setFullR2SyncStatus((prev: typeof fullR2SyncStatus) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
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

  // Poll for cloud changes from representation AI
  useEffect(() => {
    if (!isInitialized) return; // Wait for initialization, but poll even if localLastUpdated is missing
    
    const toStableJson = (value: any): string => {
      const normalize = (v: any): any => {
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.map(normalize);
        if (typeof v !== 'object') return v;
        const out: Record<string, any> = {};
        for (const key of Object.keys(v).sort()) {
          const next = normalize(v[key]);
          if (next !== undefined) out[key] = next;
        }
        return out;
      };
      return JSON.stringify(normalize(value));
    };

    const normalizeMediaForCloudCompare = (media: any) => {
      if (!media || typeof media !== 'object') return media;
      const m: any = { ...media };
      delete m.image_preview;
      delete m.uploadId;
      delete m.largeUrl;
      delete m.url_o;
      delete m.url_l;
      delete m.url_q;
      delete m.url_sq;
      delete m.url_m;
      delete m.local_highres;
      delete m.localUrl;
      delete m.local_large_variant;
      if (m.link && !m.url) m.url = m.link;
      delete m.link;
      for (const k of Object.keys(m)) {
        if (m[k] === '') delete m[k];
      }
      return m;
    };

    const normalizePostForCloudCompare = (post: any) => {
      if (!post || typeof post !== 'object') return post;
      const p: any = { ...post };
      delete p.image_preview;
      delete p.uploadId;
      delete p.largeUrl;
      delete p.url_o;
      delete p.url_l;
      delete p.url_q;
      delete p.url_sq;
      delete p.url_m;
      delete p.local_highres;
      delete p.localUrl;
      delete p.local_large_variant;
      if (p.link && !p.url) p.url = p.link;
      delete p.link;
      for (const k of Object.keys(p)) {
        if (p[k] === '') delete p[k];
      }
      if (Array.isArray(p.mergedMedia)) {
        p.mergedMedia = p.mergedMedia.map(normalizeMediaForCloudCompare);
      }
      return p;
    };

    const getPostSignature = (post: any) => toStableJson(normalizePostForCloudCompare(post));

    const checkCloudChanges = async () => {
      try {
        const res = await fetch(`/api/r2-state?t=${Date.now()}`);
        if (res.ok) {
          const cloudData = await res.json();
          // Trigger flash if cloud has a timestamp and it differs from local (or local has none)
          if (cloudData.lastUpdated && cloudData.lastUpdated !== localLastUpdated) {
            // Validate that actual content has changed, not just the timestamp
            const cloudItems = cloudData.items || cloudData.posts || [];
            
            const headerChanged = 
              (cloudData.title && cloudData.title !== portfolioTitleRef.current) ||
              (cloudData.subtitle && cloudData.subtitle !== portfolioSubtitleRef.current) ||
              (cloudData.bio && cloudData.bio !== portfolioBioRef.current);

            const newItems = cloudItems.filter((item: any) => !flickrPostsRef.current.find((p: any) => String(p.id) === String(item.id)));
            const deletedItems = flickrPostsRef.current.filter((p: any) => !cloudItems.find((item: any) => String(item.id) === String(p.id)));
            const updatedItems = cloudItems.filter((item: any) => {
              const old = flickrPostsRef.current.find((p: any) => String(p.id) === String(item.id));
              if (!old) return false;
              return getPostSignature(old) !== getPostSignature(item);
            });

            if (headerChanged || newItems.length > 0 || deletedItems.length > 0 || updatedItems.length > 0) {
              if (!ignoreCloudChangesRef.current) {
                setHasCloudChanges(true);
              }
            } else {
              // Automatically sync the timestamp locally if content matches to avoid further polling checks
              setLocalLastUpdated(cloudData.lastUpdated);
            }
          }
        }
      } catch (e) {
        // ignore errors during background polling
      }
    };

    checkCloudChanges(); // Call immediately on init
    const interval = setInterval(checkCloudChanges, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [isInitialized, localLastUpdated]);

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

  const handleScrape = async (source: string) => {
    setIsScraping(true);
    setShowLogs(true);
    setScrapeLogs([`Starte Scraping für ${source}...`]);
    
    try {
      // 1. Start the scrape
      const startRes = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      }).catch(err => {
        console.error("Fetch error:", err);
        throw new Error(`Netzwerkfehler: ${err.message}. Läuft der Server?`);
      });
      
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Serverfehler: ${startRes.status}`);
      }

      // 2. Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/scrape/status/${source}`);
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          
          // Update logs
          if (status.logs && status.logs.length > 0) {
            setScrapeLogs(status.logs);
          }
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
            setIsScraping(false);
            
            if (status.error) {
              setScrapeLogs(prev => [...prev, `FEHLER: ${status.error}`]);
            } else {
              setScrapeLogs(prev => [...prev, "Fertig! Lade neue Daten..."]);
              
              try {
                const stateRes = await fetch('/api/state');
                const stateData = await stateRes.json();
                const newCount = (stateData.items || []).filter((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id))).length;
                updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), `Scraping beendet (${newCount} neue Posts)`);
                setIsFlickrFallback(false);
                
                
                setScrapeLogs(prev => [...prev, "Log-Fenster bleibt offen. Bitte manuell schließen."]);
              } catch (e) {
                console.error("Failed to load new state", e);
                setScrapeLogs(prev => [...prev, "Fehler beim Laden der neuen Daten. Lade Seite neu..."]);
                setTimeout(() => window.location.reload(), 2000);
              }
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);

    } catch (error: any) {
      setScrapeLogs(prev => [...prev, `Fehler beim Starten: ${error.message}`]);
      setIsScraping(false);
    }
  };

  const handleHighResSync = async () => {
    setSyncStatus({ running: true, logs: ["Starte High-Res Sync..."], done: false, error: null });
    setShowLogs(true);
    
    try {
      const startRes = await fetch('/api/sync/highres', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start sync');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setSyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
            if (!status.error) {
              // Fetch uncertain matches
              const uncertainRes = await fetch('/api/sync/uncertain');
              const uncertain = await uncertainRes.json();
              setUncertainMatches(uncertain);
              if (uncertain.length > 0) {
                setShowUncertain(true);
              }
              // Refresh state
              const stateRes = await fetch('/api/state');
              const stateData = await stateRes.json();
              const newCount = (stateData.items || []).filter((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id))).length;
              updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), `High-Res Sync beendet (${newCount} neue Posts)`);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setSyncStatus((prev: typeof syncStatus) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleConfirmMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId: match.postId, 
          originalPath: match.originalPath,
          baseName: match.baseName
        })
      });
      if (res.ok) {
        setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
        // Refresh state
        const stateRes = await fetch('/api/state');
        const stateData = await stateRes.json();
        const hasNew = (stateData.items || []).some((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id)));
        if (hasNew) {
          updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), 'High-Res Match bestätigt');
        } else {
          setFlickrPosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
        }
      }
    } catch (e) {
      console.error("Confirm match error:", e);
    }
  };

  const handleRejectMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: match.postId })
      });
      if (res.ok) {
        setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
      }
    } catch (e) {
      console.error("Reject match error:", e);
    }
  };

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
      const stripBlobUrls = (obj: any, fields: string[]) => {
        for (const field of fields) {
          if (typeof obj?.[field] === 'string' && obj[field].startsWith('blob:')) {
            delete obj[field];
          }
        }
      };
      const cleanPosts = flickrPosts.map(post => {
        const cleanPost = { ...post };
        // Remove temporary fields before saving
        if (cleanPost.image_preview) delete cleanPost.image_preview;
        stripBlobUrls(cleanPost, [
          'image',
          'image_thumb',
          'image_1k',
          'image_2k',
          'image_3k',
          'image_large',
          'image_original',
          'url',
        ]);
        
        if (cleanPost.mergedMedia) {
          cleanPost.mergedMedia = cleanPost.mergedMedia.map((m: any) => {
            const cleanM = { ...m };
            if (cleanM.image_preview) delete cleanM.image_preview;
            stripBlobUrls(cleanM, [
              'image',
              'image_thumb',
              'image_1k',
              'image_2k',
              'image_3k',
              'image_large',
              'image_original',
              'url',
            ]);
            if (cleanM.uploadId) delete cleanM.uploadId;
            return cleanM;
          }).filter(hasRenderableMedia);
          if (cleanPost.mergedMedia.length === 0) {
            delete cleanPost.mergedMedia;
          }
        }
        return cleanPost;
      });

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

  const updatePosts = useCallback((newPosts: any[] | ((p: any[]) => any[]), actionDescription: string = 'Aktion durchgeführt') => {
    setFlickrPosts(current => {
      const next = typeof newPosts === 'function' ? newPosts(current) : newPosts;
      setPast((p): typeof p => [...p, { posts: current, action: actionDescription }].slice(-50)); // Keep last 50 states
      setFuture([]); // Clear future on new action
      setHasUnpublishedChanges(true);
      return next;
    });
  }, []);

  const recordTrashUndo = (trashItems: any[], label: string) => {
    const trashKeys = trashItems
      .map(item => item?.trashKey)
      .filter((key): key is string => typeof key === 'string' && key.startsWith('trash/'));
    if (trashKeys.length === 0) return;

    setPast(previous => [
      ...previous,
      { trashKeys, action: `${label} (${trashKeys.length} Dateien)` }
    ].slice(-50));
    setFuture([]);
  };

  const handleUndo = async () => {
    if (past.length === 0) return;
    const current = flickrPosts;
    const previousState = past[past.length - 1];

    if ('trashKeys' in previousState) {
      if (undoingR2TrashRef.current) return;
      undoingR2TrashRef.current = true;

      try {
        const response = await fetch('/api/r2-trash/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashKeys: previousState.trashKeys })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'R2-Trash konnte nicht rückgängig gemacht werden.');
        }

        const restoredKeys = new Set<string>(
          (Array.isArray(data.restoredItems) ? data.restoredItems : [])
            .map((item: any) => item?.trashKey)
            .filter((key: any): key is string => typeof key === 'string')
        );
        const remainingKeys = previousState.trashKeys.filter(key => !restoredKeys.has(key));

        setPast(history => {
          if (history[history.length - 1] !== previousState) return history;
          if (remainingKeys.length === 0) return history.slice(0, -1);
          return [
            ...history.slice(0, -1),
            { ...previousState, trashKeys: remainingKeys, action: `R2-Trash wiederherstellen (${remainingKeys.length} offen)` }
          ];
        });

        await loadTrashItems(false);
        await fetchCloudflareUsage();

        if (remainingKeys.length > 0) {
          pushStatusNotice(
            'warning',
            'R2-Undo teilweise ausgeführt',
            `${restoredKeys.size} Datei(en) wiederhergestellt, ${remainingKeys.length} wegen Konflikten oder Fehlern noch im Trash.`
          );
        } else {
          pushStatusNotice(
            'success',
            'R2-Undo abgeschlossen',
            `${restoredKeys.size} Datei(en) wurden an ihren ursprünglichen Pfad zurückverschoben.`
          );
        }
      } catch (undoError: any) {
        const message = undoError.message || 'R2-Trash konnte nicht rückgängig gemacht werden.';
        setError(message);
        pushStatusNotice('warning', 'R2-Undo fehlgeschlagen', message);
      } finally {
        undoingR2TrashRef.current = false;
      }
      return;
    }

    if ('bakFiles' in previousState) {
      const bakFiles = previousState.bakFiles;
      if (bakFiles.length > 0) {
        try {
          const resp = await fetch('/api/bak/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bakFiles })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Bak-Wiederherstellung fehlgeschlagen.');
          if (data.failedCount > 0) {
            pushStatusNotice('warning', 'Undo teilweise ausgeführt', `${data.restoredCount ?? 0} Datei(en) aus bak/ zurückgeholt, ${data.failedCount} fehlgeschlagen.`);
          } else {
            pushStatusNotice('success', 'Undo abgeschlossen', `${data.restoredCount ?? 0} Datei(en) aus bak/ wiederhergestellt. R2-Objekte werden beim nächsten Cloud Sync neu hochgeladen.`);
          }
        } catch (undoError: any) {
          setError(undoError.message || 'Bak-Wiederherstellung fehlgeschlagen.');
          pushStatusNotice('warning', 'Undo fehlgeschlagen', undoError.message || 'Bak-Wiederherstellung fehlgeschlagen.');
        }
      }
      shouldPushStateToR2Ref.current = true;
      setPast(p => p.slice(0, -1));
      setFuture([]);
      setFlickrPosts(previousState.posts);
      return;
    }

    setPast(p => p.slice(0, -1));
    setFuture((f): typeof f => [...f, { posts: current, action: previousState.action }].slice(-50));
    setFlickrPosts(previousState.posts);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const current = flickrPosts;
    const nextState = future[future.length - 1];
    setFuture(f => f.slice(0, -1));
    setPast((p): typeof p => [...p, { posts: current, action: nextState.action }].slice(-50));
    setFlickrPosts(nextState.posts);
  };

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
      setPast(p => [...p, { posts: prevPosts, bakFiles, action: `Post gelöscht (${targetTitle})` }].slice(-50));
      setFuture([]);
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
      setPast(p => [...p, { posts: prevPosts, bakFiles, action: `Media entfernt (${removedLabel})` }].slice(-50));
      setFuture([]);
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

  const handleImageUpload = async (id: string, file: File, mediaIndex?: number, isNew?: boolean) => {
    if (!file) return;
    setActiveUploads(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setHasUnsyncedMedia(true);
    
    const localUrl = URL.createObjectURL(file);
    const uploadId = Math.random().toString(36).substring(7); // Unique ID for this specific upload
    
    const cleanOldUrls = (obj: any) => {
      const { largeUrl, url, url_o, url_l, url_q, url_sq, url_m, local_highres, image, image_thumb, image_1k, image_2k, image_large, image_preview, image_3k, image_original, ...rest } = obj;
      return rest;
    };

    const postToMediaItem = (post: any) => ({
      type: post.type || 'image',
      image: post.image,
      image_thumb: post.image_thumb,
      image_1k: post.image_1k,
      image_2k: post.image_2k,
      image_large: post.image_large,
      image_preview: post.image_preview,
      image_3k: post.image_3k,
      image_original: post.image_original,
      image_width: post.image_width,
      image_height: post.image_height,
      youtubeId: post.youtubeId,
      youtubeUrl: post.youtubeUrl,
      url: post.url,
      link: post.url
    });

    const hasPrimaryMedia = (post: any) =>
      !!(post.image || post.image_thumb || post.image_1k || post.image_2k || post.image_large || post.image_preview || post.image_3k || post.image_original || post.youtubeId || post.youtubeUrl || post.url);
    
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        // If isNew is true or if we don't have a specific mediaIndex, we treat it as adding a new item to the gallery
        if (isNew || mediaIndex === undefined) {
          const newItem: any = { uploadId, type: 'image', image_preview: localUrl };
          
          // FIX #1: Explizites Array-Clearing beim Hinzufügen neuer Bilder
          // Nur bereits fertiggestellte Bilder mit finalen URLs behalten, keine uploadId-Only oder Phantom-Elemente
          let validatedMedia: any[] = [];
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            // Strikte Validierung: Nur Elemente mit echten finalen URLs beibehalten
            validatedMedia = post.mergedMedia.filter(hasRenderableMedia);
          } else if (hasPrimaryMedia(post)) {
            // Falls keine mergedMedia aber primäre Post-Daten vorhanden: Diese als Basis verwenden
            validatedMedia = [postToMediaItem(post)];
          }
          
          // Neues Array: Nur validierte alte Elemente + neues Item
          const newMedia = [...validatedMedia, newItem];
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newItem;
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);

          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        }
        if (mediaIndex !== undefined && post.mergedMedia) {
          const newMedia = [...post.mergedMedia];
          newMedia[mediaIndex] = { ...cleanOldUrls(newMedia[mediaIndex]), uploadId, image_preview: localUrl, type: 'image' } as any;
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newMedia.find(Boolean);
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);
          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        } else if (mediaIndex !== undefined && !post.mergedMedia) {
          const newMediaRaw = [{ type: post.type || 'image', image: post.image, image_thumb: post.image_thumb, image_1k: post.image_1k, image_2k: post.image_2k, image_large: post.image_large, image_3k: post.image_3k, image_original: post.image_original, youtubeId: post.youtubeId, link: post.url }];
          newMediaRaw[mediaIndex] = { ...cleanOldUrls(newMediaRaw[mediaIndex]), uploadId, image_preview: localUrl, type: 'image' } as any;
          const newMedia = newMediaRaw.filter(hasRenderableMedia);
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newMedia.find(Boolean);
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);
          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        }
        return { ...cleanOldUrls(post), uploadId, image_preview: localUrl, type: 'image' };
      }
      return post;
    }), `Lokales Bild hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      const thumbUrl = uploadData.image_thumb || uploadData.url;
      const url1k = uploadData.image_1k || uploadData.url_1k || '';
      const url2k = uploadData.image_2k || uploadData.url_2k || '';
      const url3k = uploadData.image_3k || uploadData.url_3k || '';
      const originalUrl = uploadData.image_original || uploadData.url_original || '';
      const highResUrl = uploadData.url_large || url2k || url3k || url1k || thumbUrl;
      const imageWidth = uploadData.image_width ?? uploadData.width;
      const imageHeight = uploadData.image_height ?? uploadData.height;
      const cloudUploaded = !!uploadData.cloudUploaded;
      
      console.log('Upload successful, thumb:', thumbUrl, 'large:', highResUrl, 'variant:', uploadData.local_large_variant, 'dims:', imageWidth, 'x', imageHeight);
      if (cloudUploaded) {
        pushStatusNotice(
          'success',
          'Direkt nach R2 hochgeladen',
          'Die neuen Bildvarianten sind sofort in Cloudflare R2 verfügbar.'
        );
      } else if (Array.isArray(uploadData.cloudUploadErrors) && uploadData.cloudUploadErrors.length > 0) {
        pushStatusNotice(
          'warning',
          'Lokal gespeichert',
          'Mindestens eine R2-Variante hat den Direkt-Upload nicht geschafft und wird später synchronisiert.'
        );
      }
      
      shouldPushStateToR2Ref.current = true;
      updatePosts(posts => posts.map(post => {
        if (String(post.id) === String(id)) {
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            const newMedia = [...post.mergedMedia];
            const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId);
            
            // FIX #2: Strikte Index-Validierung und Cleanup nach Upload
            if (itemIdx !== -1 && itemIdx < newMedia.length) {
              // Element mit matching uploadId gefunden: aktualisieren mit finalen URLs
              newMedia[itemIdx] = { 
                ...cleanOldUrls(newMedia[itemIdx]), 
                url: uploadData.url || newMedia[itemIdx].url,
                image: thumbUrl, 
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl, 
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl, 
                image_width: imageWidth,
                image_height: imageHeight,
                type: 'image' 
              } as any;
              delete newMedia[itemIdx].uploadId;
              
              const updateBase = itemIdx === 0;
              return updateBase ? { 
                ...cleanOldUrls(post), 
                url: post.url,
                image: thumbUrl, 
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl, 
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl,
                image_width: imageWidth,
                image_height: imageHeight,
                mergedMedia: newMedia 
              } : { ...post, mergedMedia: newMedia };
            } else {
              // CLEANUP: uploadId nicht gefunden oder Index-Problem
              // Entferne alle uploadId-Elemente ohne finale URLs (Phantom-Uploads)
              const cleanedMedia = newMedia.filter(m => {
                if (m.uploadId && !hasRenderableMedia(m)) {
                  // Phantom-Element: uploadId aber keine finale URL - entfernen
                  return false;
                }
                return true;
              });
              
              // Wenn das neue Upload nicht eingefügt wurde, versuche es noch einmal
              if (cleanedMedia.length === newMedia.length) {
                // Element mit uploadId wurde nicht aktualisiert - füge direkt hinzu
                const uploadedItem = { 
                  type: 'image', 
                  image: thumbUrl, 
                  image_thumb: thumbUrl,
                  image_1k: url1k,
                  image_2k: url2k,
                  image_large: highResUrl, 
                  image_3k: url3k,
                  image_original: originalUrl,
                  image_preview: localUrl,
                  image_width: imageWidth,
                  image_height: imageHeight
                };
                cleanedMedia.push(uploadedItem);
              }
              
              return { ...post, mergedMedia: cleanedMedia };
            }
          } else {
            // Keine mergedMedia - erstelle neue
            return { 
              ...cleanOldUrls(post), 
              url: uploadData.url || post.url,
              image: thumbUrl, 
              image_thumb: thumbUrl,
              image_1k: url1k,
              image_2k: url2k,
              image_large: highResUrl, 
              image_3k: url3k,
              image_original: originalUrl,
              image_preview: localUrl,
              image_width: imageWidth,
              image_height: imageHeight,
              mergedMedia: [{
                type: 'image',
                image: thumbUrl,
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl,
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl,
                image_width: imageWidth,
                image_height: imageHeight
              }],
              type: 'image' 
            };
          }
        }
        return post;
      }), `Bild hochgeladen (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActiveUploads(prev => {
        const next = { ...prev };
        if (next[id] > 1) {
          next[id]--;
        } else {
          delete next[id];
        }
        return next;
      });
    }
  };

  // Track Bunny upload progress per post
  const [bunnyProgress, setBunnyProgress] = useState<Record<string, { step: string; progress: number; text: string }>>({});

  const bunnyStepLabels: Record<string, string> = {
    starting: 'Starte Bunny-Upload…',
    uploading: 'Lade Video zu Bunny hoch…',
    encoding: 'Bunny verarbeitet das Video…',
    variants: 'Generiere Thumbnail-Varianten…',
    done: 'Bunny-Upload abgeschlossen ✓',
    error: 'Bunny-Fehler – lokal gespeichert',
  };

  const handleVideoFileUpload = async (id: string, file: File) => {
    if (!file) return;
    setActiveUploads(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setHasUnsyncedMedia(true);

    const uploadId = Math.random().toString(36).substring(7);
    const localUrl = URL.createObjectURL(file);

    // Get project name for folder organization
    const post = flickrPosts.find(p => String(p.id) === String(id));
    const projectName = post?.title || '';
    const projectDescription = typeof post?.description === 'string'
      ? post.description
      : (post?.description?.description || post?.description?.text || '');

    // Optimistic update: add video item to mergedMedia
    updatePosts(posts => posts.map(post => {
      if (String(post.id) !== String(id)) return post;
      // `video` holds the local blob so the card can play the dropped file immediately;
      // `image`/`image_thumb` keep the blob only for drop-compat (never rendered as <img>).
      const newItem: any = { uploadId, type: 'video', video: localUrl, image: localUrl, image_thumb: localUrl, url: localUrl };
      const existingMedia = post.mergedMedia && post.mergedMedia.length > 0
        ? post.mergedMedia.filter(hasRenderableMedia)
        : [];
      return { ...post, mergedMedia: [...existingMedia, newItem] };
    }), `Video-Upload gestartet (${describePost(post)})`);

    // Show initial progress
    setBunnyProgress(prev => ({ ...prev, [id]: { step: 'local', progress: 10, text: 'Speichere lokal & extrahiere Vorschauâ€¦' } }));

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('projectId', id);
      formData.append('projectName', projectName);
      formData.append('projectDescription', projectDescription);

      // Try Bunny hybrid first, fall back to local-only if anything goes wrong
      let uploadRes = await fetch('/api/upload-video-to-bunny', {
        method: 'POST',
        body: formData
      });

      // If hybrid fails for ANY reason, fall back to local upload silently
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        console.warn('Bunny hybrid failed, falling back to local:', errBody.error || uploadRes.status);
        // Retry with local-only endpoint
        uploadRes = await fetch('/api/upload-video', {
          method: 'POST',
          body: formData
        });
      }

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || `Upload fehlgeschlagen (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      const hasThumb = !!(uploadData.image_thumb || uploadData.image || uploadData.bunnyThumbUrl);
      const thumbUrl = hasThumb ? (uploadData.image_thumb || uploadData.image || uploadData.bunnyThumbUrl) : '';
      const url1k = uploadData.image_1k || thumbUrl;
      const url2k = uploadData.image_2k || '';
      const url3k = uploadData.image_3k || '';
      // Use Bunny embed URL if videoId is available from Phase 1, otherwise fall back to local path
      const bunnyTaskId: string | null = uploadData.bunnyTaskId || null;
      const phase1VideoId: string | null = uploadData.videoId || null;
      const phase1LibraryId: string | null = uploadData.libraryId || null;
      const videoUrl = (phase1VideoId && phase1LibraryId)
        ? `https://iframe.mediadelivery.net/embed/${phase1LibraryId}/${phase1VideoId}`
        : (uploadData.url || uploadData.image_original || '');
      const previewCloudUploaded = !!uploadData.previewCloudUploaded;

      if (previewCloudUploaded) {
        pushStatusNotice(
          'success',
          'Bunny-Preview nach R2',
          'Das ffmpeg-Vorschaubild der Video-Datei wurde direkt nach R2 gespiegelt.'
        );
      }

      shouldPushStateToR2Ref.current = true;
      // Update local state immediately
      updatePosts(posts => posts.map(post => {
        if (String(post.id) !== String(id)) return post;
        const newMedia = post.mergedMedia && post.mergedMedia.length > 0
          ? [...post.mergedMedia]
          : [];
        const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId);

        const updatedItem: any = {
          type: 'video', // stays 'video' until bg task confirms encoding; but videoId is already set
          uploadId,
          videoId: phase1VideoId || uploadData.videoId,
          libraryId: phase1LibraryId || uploadData.libraryId,
          duration: uploadData.duration || 0,
          image: thumbUrl,
          image_thumb: thumbUrl,
          image_1k: url1k,
          image_2k: url2k,
          image_3k: url3k,
          image_original: videoUrl,
          url: videoUrl,
          image_width: uploadData.image_width,
          image_height: uploadData.image_height,
          bunnyTaskId,
        };

        if (itemIdx !== -1) {
          const previous = newMedia[itemIdx] || {};
          const updatedItemFinal: any = {
            ...updatedItem,
            // If phase-1 produced no thumbnail yet, keep the optimistic blob so the card
            // keeps showing the live video until the background task provides real variants.
            video: updatedItem.image && updatedItem.image.startsWith('/') ? (previous.video || updatedItem.video) : (previous.video || updatedItem.video || localUrl),
            image: updatedItem.image || previous.image || previous.image_thumb || '',
            image_thumb: updatedItem.image_thumb || previous.image_thumb || previous.image || '',
          };
          newMedia[itemIdx] = updatedItemFinal;
        } else {
          newMedia.push(updatedItem);
        }

        return { ...post, mergedMedia: newMedia };
      }), `Video lokal gespeichert (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);

      // â”€â”€ Poll Bunny background task if available â”€â”€
      if (bunnyTaskId) {
        setBunnyProgress(prev => ({ ...prev, [id]: { step: 'starting', progress: 5, text: bunnyStepLabels.starting } }));

        const pollInterval = 2500;
        const maxPolls = 60; // max 2.5 minutes
        let pollCount = 0;

        const pollBunnyTask = async () => {
          try {
            const statusRes = await fetch(`/api/bunny/task/${bunnyTaskId}/status`);
            const statusData = await statusRes.json();

            if (!statusData.found) {
              // Task not found (maybe cleaned up), stop polling
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
              return;
            }

            setBunnyProgress(prev => ({
              ...prev,
              [id]: {
                step: statusData.step,
                progress: statusData.progress,
                text: bunnyStepLabels[statusData.step] || statusData.step,
              }
            }));

            if (statusData.step === 'done' && statusData.result) {
              shouldPushStateToR2Ref.current = true;
              // Update media entry with Bunny results
              const result = statusData.result;
              if (result.previewCloudUploaded) {
                pushStatusNotice(
                  'info',
                  'Bunny-Preview online',
                  'Der Vorschau-Thumbnail wurde via R2 gespeichert.'
                );
              }
              updatePosts(posts => posts.map(post => {
                if (String(post.id) !== String(id)) return post;
                const newMedia = post.mergedMedia && post.mergedMedia.length > 0
                  ? [...post.mergedMedia]
                  : [];
                const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId || m.bunnyTaskId === bunnyTaskId);
                if (itemIdx !== -1) {
                  newMedia[itemIdx] = {
                    ...newMedia[itemIdx],
                    type: 'bunny',
                    videoId: result.videoId,
                    libraryId: result.libraryId,
                    duration: result.duration || 0,
                    url: result.url || newMedia[itemIdx].url,
                    image: result.image || newMedia[itemIdx].image,
                    image_thumb: result.image_thumb || newMedia[itemIdx].image_thumb,
                    image_1k: result.image_1k || '',
                    image_2k: result.image_2k || '',
                    image_3k: result.image_3k || '',
                    image_original: result.image_original || '',
                    bunnyThumbUrl: result.bunnyThumbUrl,
                  };
                }
                return { ...post, mergedMedia: newMedia };
              }), `Bunny-Upload abgeschlossen (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
              // Clear progress after short delay; ping only when all uploads complete
              setTimeout(() => setBunnyProgress(prev => {
                const next = { ...prev };
                delete next[id];
                const hasPending = Object.values(next).some((v: any) =>
                  v.step !== "done" && v.step !== "error"
                );
                if (!hasPending) {
                  try { new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/gH9/f4CAf39/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/gH9/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAgIA==").play().catch(() => {}); } catch {}
                }
                return next;
              }), 3000);
              return;
            }

            if (statusData.step === 'error') {
              console.warn('Bunny background task failed:', statusData.error);
              setBunnyProgress(prev => ({
                ...prev,
                [id]: { step: 'error', progress: 0, text: `Bunny: ${statusData.error || 'Fehler'} â€“ Video lokal gespeichert` }
              }));
              setTimeout(() => setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; }), 8000);
              return;
            }

            // Continue polling
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollBunnyTask, pollInterval);
            } else {
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
          } catch {
            // Network error during poll, try again
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollBunnyTask, pollInterval);
            } else {
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
          }
        };

        // Start polling after a short delay (let Bunny start processing)
        setTimeout(pollBunnyTask, 2000);
      } else {
        setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
      }

    } catch (err: any) {
      setError(err.message);
      setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setActiveUploads(prev => {
        const next = { ...prev };
        if (next[id] > 1) next[id]--;
        else delete next[id];
        return next;
      });
    }
  };

  const handleVideoLinkChange = (id: string, url: string) => {
    // Check YouTube
    const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const ytMatch = url.match(ytRegExp);
    const youtubeId = (ytMatch && ytMatch[2].length === 11) ? ytMatch[2] : null;
    
    // Check Bunny (video.bunnycdn.com, player.mediadelivery.net, or bunny: scheme)
    const bunnyRegExp = /(?:video\.bunnycdn\.com|player\.mediadelivery\.net)\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
    const bunnyMatch = url.match(bunnyRegExp);
    let bunnyLibraryId = null;
    let bunnyVideoId = null;
    
    if (bunnyMatch) {
      bunnyLibraryId = bunnyMatch[1];
      bunnyVideoId = bunnyMatch[2];
    } else if (url.startsWith('bunny:')) {
      const parts = url.replace('bunny:', '').split('/');
      if (parts.length === 2) {
        bunnyLibraryId = parts[0];
        bunnyVideoId = parts[1];
      }
    }

    if (bunnyLibraryId && bunnyVideoId) {
      // It's a Bunny video!
      // Trigger the sync API in the background.
      fetch('/api/bunny/sync-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: bunnyLibraryId, videoId: bunnyVideoId })
      }).then(res => res.json()).then(data => {
        if (data.success) {
           shouldPushStateToR2Ref.current = true;
           updatePosts(posts => posts.map(post => 
             String(post.id) === String(id) ? {
               ...post,
               type: 'bunny',
               videoId: bunnyVideoId,
               libraryId: bunnyLibraryId,
               url: `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`,
               image_original: `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`,
               image: data.image_2k || data.image_3k || data.image_1k || data.image_thumb || data.image || data.url,
               image_thumb: data.image_thumb || data.url,
               image_1k: data.image_1k,
               image_2k: data.image_2k,
               image_3k: data.image_3k,
               bunnyThumbUrl: data.bunnyThumbUrl || `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`,
               duration: data.duration,
               image_width: data.image_width || 0,
               image_height: data.image_height || 0
             } : post
           ), `Bunny Video hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
        } else {
           console.error("Failed to sync Bunny video", data.error);
           alert("Fehler beim Abrufen der Bunny.net Metadaten: " + data.error);
        }
      });
      
      // Update immediately to show loading or set base data
      updatePosts(posts => posts.map(post => 
        String(post.id) === String(id) ? { 
          ...post, 
          type: 'bunny',
          videoId: bunnyVideoId,
          libraryId: bunnyLibraryId,
          bunnyThumbUrl: `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`,
          url: url
        } : post
      ), 'Bunny Video wird verarbeitetâ€¦');
    } else if (youtubeId) {
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
      shouldPushStateToR2Ref.current = true;
      updatePosts(posts => posts.map(post => 
        String(post.id) === String(id) ? { 
          ...post, 
          youtubeUrl: url, 
          youtubeId, 
          image: thumbnailUrl, 
          image_large: thumbnailUrl, 
          type: 'youtube',
          url: url
        } : post
      ), `YouTube Link hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
    } else {
      handlePostChange(id, 'url', url); // fallback
    }
  };

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

  const handleSyncFromCloudflare = async () => {
    setLoading(true);
    try {
      const r2Res = await fetch('/api/r2-state');
      if (!r2Res.ok) throw new Error('Failed to fetch from R2');
      
      const r2Data = await r2Res.json();
      
      const items = r2Data.items || r2Data.posts || [];
      if (items.length > 0) {
        const changes: string[] = [];
        
        changes.push("Merge mode: cloud edits apply to curated fields (title/description/categories/visibility); local media and local-only posts are kept.");
        if (r2Data.title && portfolioTitle !== r2Data.title) changes.push(`~ Portfolio title [changed]`);
        if (r2Data.subtitle && portfolioSubtitle !== r2Data.subtitle) changes.push(`~ Portfolio subtitle [changed]`);
        if (r2Data.bio && portfolioBio !== r2Data.bio) changes.push(`~ Portfolio bio [changed]`);

        const newItems = items.filter((item: any) => !flickrPosts.find((p: any) => String(p.id) === String(item.id)));
        if (newItems.length > 0) {
          changes.push(`Added (${newItems.length}):`);
          newItems.forEach((item: any) => changes.push(`+ ${item.title || 'Untitled'}`));
        }
        
        const deletedItems = flickrPosts.filter((p: any) => !items.find((item: any) => String(item.id) === String(p.id)));
        if (deletedItems.length > 0) {
          changes.push(`Deleted in cloud - NOT applied (kept locally) (${deletedItems.length}):`);
          deletedItems.forEach((item: any) => changes.push(`- ${item.title || 'Untitled'}`));
        }

        const updatedItems = items.filter((item: any) => {
          const old = flickrPosts.find((p: any) => String(p.id) === String(item.id));
          if (!old) return false;
          // Simple compare omitting fields that are locally generated
          const a = { ...old, image_preview: undefined, uploadId: undefined };
          const b = { ...item, image_preview: undefined, uploadId: undefined };
          return JSON.stringify(a) !== JSON.stringify(b);
        });
        
        if (updatedItems.length > 0) {
          changes.push(`Changed (${updatedItems.length}):`);
          updatedItems.forEach((item: any) => {
            const old = flickrPosts.find((p: any) => String(p.id) === String(item.id));
            const changedFields = [];
            if (old.title !== item.title) changedFields.push('Title');
            if (old.description !== item.description) changedFields.push('Description');
            if (JSON.stringify(old.states || []) !== JSON.stringify(item.states || [])) changedFields.push('Categories');
            if (old.hidden !== item.hidden) changedFields.push('Visibility');
            
            // For media, just do a basic length check or stringify
            const oldMedia = old.mergedMedia ? old.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            const newMedia = item.mergedMedia ? item.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            if (JSON.stringify(oldMedia) !== JSON.stringify(newMedia)) changedFields.push('Media');
            
            if (changedFields.length === 0) changedFields.push('Other');
            
            changes.push(`~ ${item.title || 'Untitled'} [${changedFields.join(', ')}]`);
          });
        }

        if (changes.length === 0) {
          changes.push("No structural changes detected in posts.");
        }
        

        // Instead of applying immediately, store in pending state for confirmation
        setCloudSyncState({ 
          changes: changes.length > 0 ? changes : ["No structural changes detected in posts."], 
          items, 
          r2Data 
        });
        
        ignoreCloudChangesRef.current = false;
      }
    } catch (e) {
      console.error(e);
      alert("Failed to load from Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCloudSync = () => {
    setHasCloudChanges(false);
    setCloudSyncState(null);
    setCloudSyncChanges(null);
  };

  const handleIgnoreCloudSync = () => {
    if (cloudSyncState?.r2Data?.lastUpdated) {
      setLocalLastUpdated(cloudSyncState.r2Data.lastUpdated);
    }
    setHasCloudChanges(false);
    setCloudSyncState(null);
    setCloudSyncChanges(null);
  };

  const handleApplyCloudSync = async () => {
    if (!cloudSyncState) return;
    const { items, r2Data } = cloudSyncState;

    console.log('[Sync] User confirmed. Merging cloud data into state:', items.length, 'items');
    setIsR2Fallback(true);
    setIsFlickrFallback(false);
    setPortfolioTitle(r2Data.title || portfolioTitle);
    setPortfolioSubtitle(r2Data.subtitle || portfolioSubtitle);
    if (r2Data.scrapeConfig) {
      if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
      if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
    }
    if (r2Data.bio) setPortfolioBio(r2Data.bio);

    // Capture old posts for comparison BEFORE applying changes
    const oldPosts = flickrPostsRef.current;
    const oldPostMap = new Map(oldPosts.map((p: any) => [String(p.id), p]));

    // Merge: cloud wins on curated fields (title/description/states/hidden),
    // local wins on media/local fields and local-only posts.
    const { posts: mergedPosts, stats } = mergeCloudIntoLocal(oldPosts, items);
    updatePosts(mergedPosts, `Cloud gemerged (+${stats.added} neu, ~${stats.merged} geändert)`);

    // Absorb the cloud timestamp so polling doesn't re-flag the same change.
    if (r2Data.lastUpdated) setLocalLastUpdated(r2Data.lastUpdated);
    setHasCloudChanges(false);
    setHasUnpublishedChanges(false);

    // Sync Bunny video metadata ONLY for posts whose title or description changed
    setTimeout(() => {
      const updatedPosts = flickrPostsRef.current;
      let synced = 0;
      for (const newPost of updatedPosts) {
        const oldPost = oldPostMap.get(String(newPost.id));
        const newTitle = typeof newPost.title === 'string' ? newPost.title : (newPost.title?.title || '');
        const newDesc = typeof newPost.description === 'string' ? newPost.description : (newPost.description?.description || '');
        const oldTitle = oldPost
          ? (typeof oldPost.title === 'string' ? oldPost.title : (oldPost.title?.title || ''))
          : '';
        const oldDesc = oldPost
          ? (typeof oldPost.description === 'string' ? oldPost.description : (oldPost.description?.description || ''))
          : '';

        if (!oldPost || newTitle !== oldTitle || newDesc !== oldDesc) {
          const mergedMedia = newPost.mergedMedia;
          if (!mergedMedia || mergedMedia.length === 0) continue;
          const bunnyVideos = mergedMedia.filter((m: any) =>
            m.type === 'bunny' && m.videoId
          );
          if (bunnyVideos.length === 0) continue;

          bunnyVideos.forEach((m: any) => {
            fetch('/api/bunny/update-video-metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId: m.videoId,
                libraryId: m.libraryId || '',
                title: newTitle || '',
                projectId: newPost.id,
                description: newDesc || '',
              })
            }).then(r => r.json()).then(data => {
              if (!data.success) console.warn('[bunny-meta-cloud] Update failed for', m.videoId, data.error);
            }).catch(() => {});
          });
          synced++;
        }
      }
      console.log(`[bunny-meta-cloud] Metadata updated for ${synced} changed projects`);
    }, 500);

    try {
      // Persist the merged result locally (NOT the raw R2 payload)
      const mergedState = {
        ...r2Data,
        items: mergedPosts,
        lastUpdated: r2Data.lastUpdated || new Date().toISOString(),
      };
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedState)
      });
    } catch (saveErr) {
      console.error("Could not save merged state locally:", saveErr);
    }

    setCloudSyncState(null);
  };

  const loadTrashItems = async (openModal = false) => {
    setTrashLoading(true);
    setTrashError(null);
    if (openModal) setShowTrashModal(true);

    try {
      const res = await fetch('/api/r2-trash');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load trash items');
      }

      setTrashItems(data.items || []);
    } catch (error: any) {
      setTrashError(error.message || 'Failed to load trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleOpenTrash = async () => {
    await loadTrashItems(true);
  };

  const handleRestoreTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;
    setTrashLoading(true);
    setTrashError(null);

    try {
      const res = await fetch('/api/r2-trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore trash items');
      }

      await loadTrashItems(true);
      if ((data.conflictCount || 0) > 0) {
        setTrashError(`${data.conflictCount} item(s) were skipped because the original file already exists.`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to restore trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleDeleteTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;
    setTrashLoading(true);
    setTrashError(null);

    try {
      // Archive (not hard delete): each object is first streamed into bak/r2-trash/
      // and only removed from R2 after the local write verified, so the last copy
      // always survives. Use the explicit permanent-delete action to skip bak/.
      const res = await fetch('/api/r2-trash/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive trash items');
      }

      if (Array.isArray(data.bakFiles) && data.bakFiles.length > 0) {
        setPast(previous => [
          ...previous,
          { posts: [], bakFiles: data.bakFiles, action: `Trash archiviert (${data.bakFiles.length} Dateien in bak/)` }
        ].slice(-50));
        setFuture([]);
      }

      await loadTrashItems(true);
      if ((data.skippedCount || 0) > 0) {
        setTrashError(`${data.skippedCount} item(s) could not be archived (R2 copy kept).`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to archive trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  // Irreversible: removes the R2 trash copy WITHOUT writing anything to bak/.
  const handlePermanentlyDeleteTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;

    const confirmed = window.confirm(
      `${trashKeys.length} Datei(en) werden UNWIDERruflich gelöscht.\n\n` +
      `Es wird KEINE Kopie in bak/ abgelegt. Diese Dateien sind danach nicht wiederherstellbar.\n\n` +
      `Trotzdem fortfahren?`
    );
    if (!confirmed) return;

    setTrashLoading(true);
    setTrashError(null);

    try {
      const res = await fetch('/api/r2-trash/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete trash items');
      }

      await loadTrashItems(true);
      if ((data.skippedCount || 0) > 0) {
        setTrashError(`${data.skippedCount} item(s) could not be deleted.`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to delete trash items');
    } finally {
      setTrashLoading(false);
    }
  };

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
            setPast(previous => [
              ...previous,
              { posts: [], bakFiles: executeData.bakFiles, action: `Redundante lokale Dateien nach bak/ (${executeData.bakFiles.length})` }
            ].slice(-50));
            setFuture([]);
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

  const handlePreview = async () => {
    try {
      const html = generateHTML(flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, true, publicDomain || R2_CONFIG.publicDomain);
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: html })
      });
      
      if (response.ok) {
        const data = await response.json();
        window.open(`${data.url}?t=${Date.now()}`, '_blank');
      } else {
        throw new Error('Failed to generate preview');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    setUploadSuccess(null);
    setError('');
    setUploadProgress(0);
    
    // Create a copy to ensure we have the current state, and filter out any empty frames
    let currentPosts = flickrPosts.map(post => {
      const cleanedPost = { ...post };
      
      // 1. Filter mergedMedia for valid items only (FIX #2b: Konsistent mit handleUpdatePostMedia)
      if (cleanedPost.mergedMedia) {
        cleanedPost.mergedMedia = cleanedPost.mergedMedia.filter(hasRenderableMedia);
        
        // If mergedMedia became empty, remove the field
        if (cleanedPost.mergedMedia.length === 0) {
          delete (cleanedPost as any).mergedMedia;
        }
      }
      
      // 2. Synchronize top-level fields with mergedMedia (Source of Truth)
      // Deduplicate mergedMedia by URL to avoid phantom/duplicate entries
      if (cleanedPost.mergedMedia && cleanedPost.mergedMedia.length > 0) {
        const seenUrls = new Set<string>();
        cleanedPost.mergedMedia = cleanedPost.mergedMedia.filter((m: any) => {
          const key = getMediaDedupeKey(m);
          if (!key) return false; // drop items without any usable URL
          if (seenUrls.has(key)) return false; // duplicate
          seenUrls.add(key);
          return true;
        });

        if (cleanedPost.mergedMedia.length === 0) {
          delete (cleanedPost as any).mergedMedia;
        } else {
          const primary = getPrimaryMergedMedia(cleanedPost.mergedMedia) || cleanedPost.mergedMedia.find(Boolean);
          syncMediaFieldsFromPrimary(cleanedPost, primary);
        }
      }
      
      // 3. Final cleanup: Remove empty strings that might be misinterpreted as "empty pictures"
      const fieldsToCleanup = ['image', 'image_thumb', 'image_1k', 'image_2k', 'image_large', 'image_3k', 'image_original', 'image_preview', 'url', 'youtubeId', 'youtubeUrl'];
      fieldsToCleanup.forEach(field => {
        if ((cleanedPost as any)[field] === '') {
          delete (cleanedPost as any)[field];
        }
      });

      return cleanedPost;
    }).filter(post => {
      // Only publish posts that have either a title, a description, or at least one piece of media
      const hasMedia = !!(post.image || post.image_thumb || post.image_1k || post.image_2k || post.image_large || post.image_preview || post.image_3k || post.image_original || (post.mergedMedia && post.mergedMedia.length > 0) || post.youtubeId || post.videoId);
      return hasMedia || post.title.trim() !== '' || post.description.trim() !== '';
    });

    // Deduplicate posts by id in case duplicates slipped in earlier
    const seenIds = new Set<string>();
    const dedupedPosts: any[] = [];
    for (const p of currentPosts) {
      const idStr = String(p.id);
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        dedupedPosts.push(p);
      } else {
        console.warn('handleUpload: duplicate post removed', idStr);
      }
    }
    currentPosts = dedupedPosts;

    console.log('handleUpload: currentPosts count:', currentPosts.length);
    console.log('handleUpload: currentPosts IDs in order:', currentPosts.map(p => p.id));
    
    try {
      const htmlContent = generateHTML(currentPosts, portfolioTitle, portfolioSubtitle, portfolioBio, false, publicDomain || R2_CONFIG.publicDomain);
      console.log('handleUpload: htmlContent generated, length:', htmlContent.length);
      
      const stateData = JSON.stringify({
        items: currentPosts,
        title: portfolioTitle,
        subtitle: portfolioSubtitle,
        bio: portfolioBio,
        projectStates: PROJECT_STATES,
        scrapeConfig: { igAccount, flickrUrl },
        lastUpdated: new Date().toISOString()
      });
      const parsedData = JSON.parse(stateData);
      setLocalLastUpdated(parsedData.lastUpdated);
      flickrPostsRef.current = currentPosts;
      setHasCloudChanges(false);
      setHasUnsyncedMedia(false);
      
      console.log('handleUpload: stateData generated, items count:', currentPosts.length);

      setUploadProgress(20);

      // Try server-side publish first (bypasses CORS)
      try {
        console.log('handleUpload: Attempting POST to /api/publish');
        const response = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            htmlContent,
            stateData,
            title: portfolioTitle,
            subtitle: portfolioSubtitle,
            bio: portfolioBio
          })
        });

        console.log('handleUpload: POST response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('handleUpload: POST response data:', data);
          setUploadProgress(100);
          setUploadSuccess({ url: data.url });
          setHasUnpublishedChanges(false);
          setLocalLastUpdated(parsedData.lastUpdated);
          setTimeout(() => setUploadProgress(null), 2000);
          setUploading(false);
          return;
        } else {
          const errorText = await response.text();
          console.error('handleUpload: POST failed, status:', response.status, 'error:', errorText);
          throw new Error(`Publish failed: ${response.status} ${errorText}`);
        }
      } catch (fetchError: any) {
        // Publishing must remain server-side so state validation cannot be bypassed.
        throw fetchError;
      }
    } catch (err: any) {
      console.error("Publish error:", err);
      setError(err.message || 'Upload fehlgeschlagen. Prüfen Sie die Cloudflare CORS-Einstellungen.');
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleRestoreLatestPublish = async () => {
    if (restoringLatestPublish) return;

    const confirmed = window.confirm(
      'Das stellt das letzte veroeffentlichte HTML-Backup wieder live. Lokale Media-Dateien in R2 werden dabei nicht geloescht.\n\nFortfahren?'
    );
    if (!confirmed) return;

    setRestoringLatestPublish(true);
    setError('');
    try {
      const response = await fetch('/api/backups/restore-latest-publish', {
        method: 'POST'
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Restore fehlgeschlagen');
      }

      if (data.url) {
        setUploadSuccess({ url: data.url });
      }

      if (data.state) {
        const restoredState = data.state;
        const items = restoredState.items || [];
        setIsR2Fallback(true);
        setIsFlickrFallback(false);
        setPortfolioTitle(restoredState.title || portfolioTitle);
        setPortfolioSubtitle(restoredState.subtitle || portfolioSubtitle);
        if (restoredState.scrapeConfig) {
          if (restoredState.scrapeConfig.igAccount) setIgAccount(restoredState.scrapeConfig.igAccount);
          if (restoredState.scrapeConfig.flickrUrl) setFlickrUrl(restoredState.scrapeConfig.flickrUrl);
        }
        if (restoredState.bio) setPortfolioBio(restoredState.bio);

        setFlickrPosts(current => {
          setPast((p): typeof p => [...p, { posts: current, action: `Backup wiederhergestellt (${data.restoredBackup || 'Latest Publish'})` }].slice(-50));
          setFuture([]);
          return items;
        });

        flickrPostsRef.current = items;
        if (restoredState.lastUpdated) setLocalLastUpdated(restoredState.lastUpdated);
        setCloudSyncState(null);
        setCloudSyncChanges(null);
        setHasCloudChanges(false);
        setHasUnpublishedChanges(false);
        setHasUnsyncedMedia(false);
      }
    } catch (err: any) {
      setError(err.message || 'Restore fehlgeschlagen');
    } finally {
      setRestoringLatestPublish(false);
    }
  };

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
            setPast(p => [...p, { posts: current, action: `Backup wiederhergestellt (${filename})` }].slice(-50));
            setFuture([]);
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

  const handleCrossPostMediaDrop = (sourcePostId: string, mediaIndices: number[], targetPostId: string, targetMediaIndex?: number) => {
    if (sourcePostId === targetPostId) return;
    if (!mediaIndices || mediaIndices.length === 0) return;

    const sourcePost = flickrPosts.find(p => String(p.id) === String(sourcePostId));
    const targetPost = flickrPosts.find(p => String(p.id) === String(targetPostId));
    if (!sourcePost || !targetPost) return;

    const sourceMedia = sourcePost.mergedMedia || [];
    for (const idx of mediaIndices) {
      if (idx < 0 || idx >= sourceMedia.length) return;
    }

    const sortedIndices = [...mediaIndices].sort((a, b) => a - b);
    const movedMediaItems = sortedIndices.map(i => ({ ...sourceMedia[i] }));
    const typeLabel = movedMediaItems.length === 1
      ? (movedMediaItems[0].type || 'Bild/Video')
      : `${movedMediaItems.length} Medien`;

    updatePosts((posts: any[]) => {
      return posts.map(post => {
        const postId = String(post.id);

        if (postId === String(sourcePostId)) {
          const newSourceMedia = [...(post.mergedMedia || [])];
          const descending = [...sortedIndices].sort((a, b) => b - a);
          for (const idx of descending) {
            newSourceMedia.splice(idx, 1);
          }
          const updatedPost = { ...post, mergedMedia: newSourceMedia };
          const newPrimary = newSourceMedia.length > 0 ? getPrimaryMergedMedia(newSourceMedia) : undefined;
          if (newPrimary) {
            return syncMediaFieldsFromPrimary(updatedPost, newPrimary);
          }
          return {
            ...updatedPost,
            type: 'image', image: '', image_thumb: '', image_1k: '', image_2k: '',
            image_3k: '', image_large: '', image_original: '', image_preview: '',
            url: '', youtubeId: '', youtubeUrl: '', videoId: '', libraryId: '',
            image_width: 0, image_height: 0,
          };
        }

        if (postId === String(targetPostId)) {
          const newTargetMedia = [...(post.mergedMedia || [])];
          if (targetMediaIndex !== undefined && targetMediaIndex >= 0 && targetMediaIndex <= newTargetMedia.length) {
            newTargetMedia.splice(targetMediaIndex, 0, ...movedMediaItems);
          } else {
            newTargetMedia.push(...movedMediaItems);
          }
          const updatedPost = { ...post, mergedMedia: newTargetMedia };
          const newPrimary = getPrimaryMergedMedia(newTargetMedia);
          if (newPrimary) {
            return syncMediaFieldsFromPrimary(updatedPost, newPrimary);
          }
          return updatedPost;
        }

        return post;
      });
    }, `Medienelement(e) verschoben (${typeLabel} â†’ ${describePost(targetPost)})`);

    for (const m of movedMediaItems) {
      if (m.type === 'bunny' && m.videoId) {
        fetch('/api/bunny/update-video-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: m.videoId,
            libraryId: m.libraryId || '',
            title: targetPost.title || '',
            description: targetPost.description || '',
          }),
        }).catch(() => {});
      }
    }

    handleMediaDragEnd();
  };

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
        setPast(p => [...p, { posts: prevPosts, bakFiles, action: `${idsToDelete.length} Posts gelöscht` }].slice(-50));
        setFuture([]);
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

  const CloudflareUsageDisplay = () => {
    if (!cloudflareUsage) return null;
    const { local, estimatedCost } = cloudflareUsage;
    
    return (
      <div className="flex items-center justify-between gap-4 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white/90">Cloudflare R2:</span>
          <span className="text-white/60">A: <span className="text-white font-mono">{local.classA}</span></span>
          <span className="text-white/60">B: <span className="text-white font-mono">{local.classB}</span></span>
          <span className="text-white/60">Storage: <span className="text-white font-mono">{(local.storageBytes / (1024 * 1024)).toFixed(1)}MB</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/10 text-white/90">
            ${estimatedCost}
          </span>
        </div>
      </div>
    );
  };

  const AdminButton = ({ onClick, disabled, id, children, className = "", color = "bg-white/30 text-white hover:bg-white/40 border-white/20", tooltip, active }: any) => (
    <div className="relative group w-full h-full">
      <button
        id={id}
        onClick={onClick}
        disabled={disabled}
        className={`flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg text-[10px] sm:text-xs font-medium border transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:grayscale w-full h-full ${active ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : color} ${className}`}
      >
        {children}
      </button>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-[8px] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  );

  const SortableThumbnail = ({ post, isSelected, onSelect, index, isMoving, onMoveToTarget }: any) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: post.id });

    const style = {
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      transition,
      zIndex: isDragging ? 100 : 1,
      opacity: isDragging ? 0.5 : 1,
    };

    const thumbMedia = (post.mergedMedia && post.mergedMedia.length > 0)
      ? (getPrimaryMergedMedia(post.mergedMedia) || post.mergedMedia.find(Boolean))
      : post;

    // IMPORTANT: Do not fall back to post.url/link as an image source.
    // Some scraped entries contain normal page URLs in `url`, which causes broken/brown thumbs.
    const src = getImageSrc(thumbMedia, false);
    const displaySrc = src ? getDisplayImage(src, isR2Fallback, isEmbeddedData) : undefined;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`aspect-square relative rounded-lg overflow-hidden group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'} ${isMoving ? 'cursor-crosshair' : 'cursor-pointer'} ${post.hidden ? 'grayscale brightness-50' : ''}`}
        onClick={isMoving ? () => onMoveToTarget(post.id) : onSelect}
      >
        {displaySrc ? (
          <img 
            src={displaySrc} 
            alt="" 
            className="w-full h-full object-cover" 
            onError={(e) => {
              // Final fallback: only retry with preview image if we actually have it.
              if (thumbMedia?.image_preview && e.currentTarget.src !== getDisplayImage(thumbMedia.image_preview, isR2Fallback, isEmbeddedData)) {
                e.currentTarget.src = getDisplayImage(thumbMedia.image_preview, isR2Fallback, isEmbeddedData) || '';
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-[#111] flex items-center justify-center text-white/40">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        {displaySrc && (
          <>
            <div 
              {...attributes} 
              {...listeners}
              className="absolute top-1 right-1 p-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
            >
              <GripVertical className="w-3 h-3 text-white/50" />
            </div>
            
            {/* Lightbox Trigger in Rearrange View */}
            {!isMoving && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(post);
                }}
                className="absolute top-1 left-1 p-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 z-10"
                title="Lightbox ööffnen"
              >
                <Maximize2 className="w-3 h-3 text-white/70" />
              </button>
            )}
          </>
        )}

        {isSelected && (
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
            <span className="bg-white/30 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
              {index + 1}
            </span>
          </div>
        )}
        {post.mergedMedia && post.mergedMedia.length > 1 && (
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full z-10">
            +{post.mergedMedia.length - 1}
          </div>
        )}
      </div>
    );
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
        CloudflareUsageDisplay={CloudflareUsageDisplay}
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

