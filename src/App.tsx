import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
import { FeedPostCard } from './components/feed/FeedPostCard';
import { ThumbnailGalleryGrid } from './components/gallery/ThumbnailGalleryGrid';
import { AdminHeader } from './components/header/AdminHeader';
import { mergeIncomingPostsPreservingExisting } from './utils/mergePosts';

const formatDescription = (description: any, title: string) => {
  if (!description) return "";
  
  let text = "";
  if (typeof description === 'string') {
    text = description;
  } else if (typeof description === 'object') {
    // Handle corrupted data where description is an object (possibly the whole post)
    text = description.description || description.text || JSON.stringify(description);
    if (typeof text !== 'string') text = String(text);
  } else {
    text = String(description);
  }
  
  // Remove emojis
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
  
  // Remove hashtags
  text = text.replace(/#\w+/g, '');
  
  // Remove title if it appears
  if (title && typeof text === 'string') {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escapedTitle, 'gi'), '');
  }
  
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : "";
};

const MergeConfirmationModal = ({ isOpen, group, onConfirm, onSkip }: any) => {
  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-xl font-bold text-white mb-4">Projekte zusammenführen?</h2>
        <p className="text-white/70 mb-4">
          Möchtest du die folgenden {group.length} Projekte mit dem Titel "{group[0].title}" zusammenführen?
        </p>
        <div className="space-y-2 mb-6 max-h-60 overflow-y-auto custom-scrollbar">
          {group.map((post: any) => (
            <div key={post.id} className="text-sm text-white/50 bg-white/5 p-2 rounded">
              {post.title} ({post.network_name})
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={onSkip} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded">Nein</button>
          <button onClick={onConfirm} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded">Ja, zusammenführen</button>
        </div>
      </div>
    </div>
  );
};

const parseDimensions = (dimensions?: string) => {
  if (!dimensions) return null;
  const match = dimensions.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height, maxSide: Math.max(width, height) };
};

const getResolutionLabel = (m: any, dimensions?: string) => {
  if (m.type === 'youtube') return 'YouTube';
  
  const url = m.image_3k || m.image_large || m.largeUrl || m.image || m.url || '';
  const parsed = parseDimensions(dimensions);
  const maxSide = parsed?.maxSide || 0;
  
  if (url.includes('-3k.jpg') || url.includes('_3k.jpg') || url.includes('flickr_3k')) {
    return maxSide >= 3000 ? '3K (3072px)' : 'Large file (source < 3K)';
  }
  if (url.includes('_4k.jpg')) return '4K (4096px)';
  if (url.includes('_o.jpg')) return 'Original';
  if (url.includes('_k.jpg')) return '2K (2048px)';
  if (url.includes('-thumb.jpg') || url.includes('_q.jpg') || url.includes('_t.jpg') || url.includes('flickr_1024')) return 'THUMB (1024px)';
  
  if (m.network_name === 'Flickr' || m.image_large) return 'HD / Large';
  return 'Original';
};

const isDirectMediaFile = (url?: string) =>
  !!url && /\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\?.*)?$/i.test(url);

const isValidImageCandidate = (url?: string) => {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  return isDirectMediaFile(url);
};

const getImageSrc = (media: any, preferLarge = false) => {
  // If it's a YouTube post, we can often generate the thumb even if image field is messy
  if (media?.type === 'youtube' || media?.youtubeId) {
    const id = media.youtubeId;
    if (id) {
      // Return the stored image if valid, otherwise fallback to generated thumb
      const stored = preferLarge ? (media?.image_3k || media?.image_large || media?.image) : (media?.image || media?.image_preview);
      if (isValidImageCandidate(stored)) return stored;
      return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
    }
  }

  const primary = preferLarge
    ? [media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl, media?.image, media?.image_preview]
    : [media?.image, media?.image_preview, media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl];
    
  for (const candidate of primary) {
    if (isValidImageCandidate(candidate)) return candidate;
  }
  
  return undefined;
};

const getVideoSrc = (media: any, preferLarge = false) => {
  // YouTube is NOT a direct video file we can play in a <video> tag
  if (media?.type === 'youtube' || media?.youtubeId) return undefined;

  const primary = preferLarge
    ? [media?.image_large, media?.imageLarge, media?.largeUrl, media?.image]
    : [media?.image, media?.image_preview, media?.image_large, media?.imageLarge];
  for (const candidate of primary) {
    if (isDirectMediaFile(candidate) && /\.(mp4|webm|mov)(\?.*)?$/i.test(candidate)) return candidate;
  }
  return isDirectMediaFile(media?.url) && /\.(mp4|webm|mov)(\?.*)?$/i.test(media.url) ? media.url : undefined;
};

const EDITOR_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)"/>
  <rect x="7" y="7" width="50" height="50" rx="12" fill="none" stroke="url(#ring)" stroke-width="2"/>
  <text x="32" y="40" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">PE</text>
</svg>`;
const EDITOR_FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(EDITOR_FAVICON_SVG)}`;

// SortablePost component moved to src/components/feed/FeedPostCard.tsx

export default function App() {
  const [flickrPosts, setFlickrPosts] = useState<any[]>([]);
  const flickrPostsRef = useRef<any[]>([]);
  const portfolioTitleRef = useRef<string>('');
  const portfolioSubtitleRef = useRef<string>('');
  const portfolioBioRef = useRef<string>('');
  const [past, setPast] = useState<{posts: any[], action: string}[]>([]);
  const [future, setFuture] = useState<{posts: any[], action: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringLatestPublish, setRestoringLatestPublish] = useState(false);
  const [r2CleanupRunning, setR2CleanupRunning] = useState(false);
  const [legacyDupCleanupRunning, setLegacyDupCleanupRunning] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});

  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions(prev => ({
      ...prev,
      [id]: `${img.naturalWidth} x ${img.naturalHeight} px`
    }));
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
  const [cloudSyncChanges, setCloudSyncChanges] = useState<string[] | null>(null);
  const [cloudSyncState, setCloudSyncState] = useState<{ changes: string[]; items: any[]; r2Data: any } | null>(null);
  const [hasUnsyncedMedia, setHasUnsyncedMedia] = useState(false);
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
    });

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

  // ===== Übrige States =====
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{url: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null, progress: 0, total: 0 });
  const [uncertainMatches, setUncertainMatches] = useState<any[]>([]);
  const [showUncertain, setShowUncertain] = useState(false);

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
  const [portfolioTitle, setPortfolioTitle] = useState("ProjectionArt by Vijay Sikanda");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState("immersive projection experience");
  const [igAccount, setIgAccount] = useState("vijay_sikanda");
  const [flickrUrl, setFlickrUrl] = useState("https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/");
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
              const a = { ...old, image_preview: undefined, uploadId: undefined };
              const b = { ...item, image_preview: undefined, uploadId: undefined };
              return JSON.stringify(a) !== JSON.stringify(b);
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

  // Cloudflare R2 Configuration for direct browser upload
  const R2_CONFIG = {
    accountId: "9b109aa9587252172ccb60f664f603f0",
    accessKeyId: "0e11678f19a97c193c9a5647f7c4b37b",
    secretAccessKey: "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d",
    bucketName: "portfoliodata",
    publicDomain: "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev"
  };

  const getS3Client = () => new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setPublicDomain(data.publicDomain))
      .catch(() => {
        // Fallback to hardcoded public domain if API fails (e.g. on static hosting)
        setPublicDomain(R2_CONFIG.publicDomain);
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') {
        setIsEditing(prev => !prev);
      }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
        setIsReorderView(prev => !prev);
        setSelectedThumbnails([]);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
      }
      if (e.key === 'Escape') {
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
                updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
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
              updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
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
        setFlickrPosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
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
            setPortfolioTitle(data.title || "ProjectionArt by Vijay Sikanda");
            setPortfolioSubtitle(data.subtitle || "immersive projection experience");
            if (data.bio) setPortfolioBio(data.bio);
            setFlickrPosts(data.posts);
            setLoading(false);
            setIsInitialized(true);
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
            title: item.title || 'Ohne Titel',
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
      }
    };

    loadData();
  }, []);

  // Auto-save state
  useEffect(() => {
    if (isInitialized && flickrPosts.length > 0 && uploadingCount === 0) {
      // Clean state for server: remove blob URLs and image_preview
      const cleanPosts = flickrPosts.map(post => {
        const cleanPost = { ...post };
        // Remove temporary fields before saving
        if (cleanPost.image_preview) delete cleanPost.image_preview;
        if (cleanPost.image?.startsWith('blob:')) cleanPost.image = '';
        if (cleanPost.image_large?.startsWith('blob:')) cleanPost.image_large = '';
        
        if (cleanPost.mergedMedia) {
          cleanPost.mergedMedia = cleanPost.mergedMedia.map((m: any) => {
            const cleanM = { ...m };
            if (cleanM.image_preview) delete cleanM.image_preview;
            if (cleanM.image?.startsWith('blob:')) cleanM.image = '';
            if (cleanM.image_large?.startsWith('blob:')) cleanM.image_large = '';
            if (cleanM.image_3k?.startsWith('blob:')) cleanM.image_3k = '';
            if (cleanM.uploadId) delete cleanM.uploadId;
            return cleanM;
          }).filter((m: any) => m.type === 'youtube' || !!(m.image || m.image_large || m.image_3k || m.youtubeId || m.youtubeUrl || m.link || m.url));
          if (cleanPost.mergedMedia.length === 0) {
            delete cleanPost.mergedMedia;
          }
        }
        return cleanPost;
      });

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
          }
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

  const updatePosts = (newPosts: any[] | ((p: any[]) => any[]), actionDescription: string = 'Aktion durchgeführt') => {
    setFlickrPosts(current => {
      const next = typeof newPosts === 'function' ? newPosts(current) : newPosts;
      setPast(p => [...p, { posts: current, action: actionDescription }].slice(-50)); // Keep last 50 states
      setFuture([]); // Clear future on new action
      setHasUnpublishedChanges(true);
      return next;
    });
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const current = flickrPosts;
    const previousState = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [...f, { posts: current, action: previousState.action }].slice(-50));
    setFlickrPosts(previousState.posts);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const current = flickrPosts;
    const nextState = future[future.length - 1];
    setFuture(f => f.slice(0, -1));
    setPast(p => [...p, { posts: current, action: nextState.action }].slice(-50));
    setFlickrPosts(nextState.posts);
  };

  const handleToggleHidden = (postId: string) => {
    const targetTitle = flickrPosts.find(p => String(p.id) === String(postId))?.title || 'Unbenannt';
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        return { ...post, hidden: !post.hidden };
      }
      return post;
    }), `Sichtbarkeit geändert (${targetTitle})`);
  };

  const handleStateToggle = (postId: string, stateId: string) => {
    const targetTitle = flickrPosts.find(p => String(p.id) === String(postId))?.title || 'Unbenannt';
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
    const targetTitle = flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt';
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
      states: ['-all']
    };
    updatePosts([newPost, ...flickrPosts], 'Neuen Post hinzugefügt');
    setIsEditing(true);
  };

  const handleDeletePost = (id: string) => {
    const targetTitle = flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt';
    updatePosts(
      posts => posts.filter(post => String(post.id) !== String(id)),
      `Post gelöscht (${targetTitle})`
    );
  };

  const handleMergeDown = (index: number) => {
    const targetTitle = flickrPosts[index]?.title || 'Unbenannt';
    updatePosts(posts => {
      const newPosts = [...posts];
      const current = newPosts[index];
      const next = newPosts[index + 1];
      
      if (!next) return posts;

      // FIX #2c: Merge-Operation - Strikte Filter-Logik
      const mergedMedia = [
        ...(current.mergedMedia || [{ type: current.type || 'image', image: current.image, image_large: current.image_large, youtubeId: current.youtubeId, link: current.url }]),
        ...(next.mergedMedia || [{ type: next.type || 'image', image: next.image, image_large: next.image_large, youtubeId: next.youtubeId, link: next.url }])
      ].filter((m: any) => {
        if (m.type === 'youtube') return true;
        if (m.uploadId) {
          return !!(m.image || m.image_large || m.image_3k);
        }
        return !!(m.image || m.youtubeId);
      });

      const mergedDescription = [current.description, next.description].filter(Boolean).join('<br/><br/>');

      newPosts[index] = {
        ...current,
        description: mergedDescription,
        mergedMedia
      };

      newPosts.splice(index + 1, 1);
      return newPosts;
    }, `Posts zusammengeführt (${targetTitle})`);
  };

  const handleUpdatePostMedia = (id: string, newMediaRaw: any[]) => {
    // FIX #3: Strikte Filter-Logik - Phantom-Elemente entfernen
    // uploadId ist NUR während des Uploads erlaubt, danach müssen finale URLs vorhanden sein
    const newMedia = newMediaRaw.filter(m => {
      if (m.type === 'youtube') return true;
      // Elemente mit uploadId MÜSSEN finale URLs haben (sonst: Phantom-Upload)
      if (m.uploadId) {
        return !!(m.image || m.image_large || m.image_3k || m.image_preview);
      }
      // Normale Elemente
      return !!(m.image || m.image_large || m.image_preview || m.image_3k || m.youtubeId);
    });
    const targetTitle = flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt';
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        const updatedPost = { ...post, mergedMedia: newMedia };
        const primaryMedia = newMedia[0];
        if (primaryMedia) {
          return {
            ...updatedPost,
            type: primaryMedia.type || post.type,
            image: primaryMedia.image || post.image,
            image_large: primaryMedia.image_large || post.image_large,
            url: primaryMedia.url || primaryMedia.link || post.url,
            youtubeId: primaryMedia.youtubeId || post.youtubeId
          };
        }
        return updatedPost;
      }
      return post;
    }), `Post Medien aktualisiert (${targetTitle})`);
  };

  const handleMoveToTarget = (targetId: string) => {
    const selectedPosts = flickrPosts.filter(p => selectedThumbnails.includes(p.id));
    const remainingPosts = flickrPosts.filter(p => !selectedThumbnails.includes(p.id));
    
    const targetIndex = remainingPosts.findIndex(p => String(p.id) === String(targetId));
    
    if (targetIndex === -1) {
      // If target not found, just append to the end
      updatePosts([...remainingPosts, ...selectedPosts], `Posts verschoben (${selectedPosts.length} Elemente)`);
    } else {
      // Insert selected items AFTER the target item
      const newPosts = [
        ...remainingPosts.slice(0, targetIndex + 1),
        ...selectedPosts,
        ...remainingPosts.slice(targetIndex + 1)
      ];
      updatePosts(newPosts, `Posts verschoben (${selectedPosts.length} Elemente)`);
    }
    
    setIsMoving(false);
    setSelectedThumbnails([]);
    setLastSelectedId(null);
  };

  // Bio feature handlers (wrappers around hook functions)
  const handleAddInstagramPost = () => handleGetLatestInstagram(flickrPosts);
  const handleAddFlickrPost = () => handleGetLatestFlickr(flickrPosts);
  const handleConfirmCommitPost = () => handleCommitPostToPortfolio(updatePosts, flickrPosts);

  const resizeImage = (file: File, maxSide: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSide) {
            height *= maxSide / width;
            width = maxSide;
          }
        } else {
          if (height > maxSide) {
            width *= maxSide / height;
            height = maxSide;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failed'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
      img.src = objectUrl;
    });
  };

  const handleImageUpload = async (id: string, file: File, mediaIndex?: number, isNew?: boolean) => {
    if (!file) return;
    setActiveUploads(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setHasUnsyncedMedia(true);
    
    const localUrl = URL.createObjectURL(file);
    const uploadId = Math.random().toString(36).substring(7); // Unique ID for this specific upload
    
    const cleanOldUrls = (obj: any) => {
      const { largeUrl, url, url_o, url_l, url_q, url_sq, url_m, local_highres, image_3k, ...rest } = obj;
      return rest;
    };

    const postToMediaItem = (post: any) => ({
      type: post.type || 'image',
      image: post.image,
      image_large: post.image_large,
      image_preview: post.image_preview,
      image_3k: post.image_3k,
      youtubeId: post.youtubeId,
      youtubeUrl: post.youtubeUrl,
      url: post.url,
      link: post.url
    });

    const hasPrimaryMedia = (post: any) =>
      !!(post.image || post.image_large || post.image_preview || post.image_3k || post.youtubeId || post.youtubeUrl || post.url);
    
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        // If isNew is true or if we don't have a specific mediaIndex, we treat it as adding a new item to the gallery
        if (isNew || mediaIndex === undefined) {
          const newItem: any = { uploadId, type: 'image', image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl };
          
          // FIX #1: Explizites Array-Clearing beim Hinzufügen neuer Bilder
          // Nur bereits fertiggestellte Bilder mit finalen URLs behalten, keine uploadId-Only oder Phantom-Elemente
          let validatedMedia: any[] = [];
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            // Strikte Validierung: Nur Elemente mit echten finalen URLs beibehalten
            validatedMedia = post.mergedMedia.filter((m: any) => {
              if (m.type === 'youtube') return true;
              // uploadId-Elemente MÜSSEN finale URLs haben
              if (m.uploadId) {
                return !!(m.image || m.image_large || m.image_3k);
              }
              // Normale Elemente
              return !!(m.image || m.image_large || m.image_preview || m.image_3k || m.youtubeId);
            });
          } else if (hasPrimaryMedia(post)) {
            // Falls keine mergedMedia aber primäre Post-Daten vorhanden: Diese als Basis verwenden
            validatedMedia = [postToMediaItem(post)];
          }
          
          // Neues Array: Nur validierte alte Elemente + neues Item
          const newMedia = [...validatedMedia, newItem];
          const primaryMedia = newMedia[0] || newItem;

          return {
            ...cleanOldUrls(post),
            type: primaryMedia.type || 'image',
            image: primaryMedia.image || '',
            image_large: primaryMedia.image_large || primaryMedia.image || '',
            image_preview: primaryMedia.image_preview,
            image_3k: primaryMedia.image_3k || primaryMedia.image_large || primaryMedia.image || '',
            url: primaryMedia.url || primaryMedia.link || post.url || '',
            youtubeId: primaryMedia.youtubeId || '',
            youtubeUrl: primaryMedia.youtubeUrl || '',
            mergedMedia: newMedia
          };
        }
        if (mediaIndex !== undefined && post.mergedMedia) {
          const newMedia = [...post.mergedMedia];
          newMedia[mediaIndex] = { ...cleanOldUrls(newMedia[mediaIndex]), uploadId, image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl, type: 'image' } as any;
          const updateBase = mediaIndex === 0;
          return updateBase ? { 
            ...cleanOldUrls(post), 
            image: localUrl, 
            image_large: localUrl, 
            image_preview: localUrl,
            image_3k: localUrl,
            mergedMedia: newMedia 
          } : { ...post, mergedMedia: newMedia };
        } else if (mediaIndex !== undefined && !post.mergedMedia) {
          const newMediaRaw = [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, link: post.url }];
          newMediaRaw[mediaIndex] = { ...cleanOldUrls(newMediaRaw[mediaIndex]), uploadId, image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl, type: 'image' } as any;
          const newMedia = newMediaRaw.filter((m: any) => m.type === 'youtube' || !!(m.image || m.image_large || m.image_preview || m.image_3k || m.uploadId || m.youtubeId));
          const updateBase = mediaIndex === 0;
          return updateBase ? { 
            ...cleanOldUrls(post), 
            image: localUrl, 
            image_large: localUrl, 
            image_preview: localUrl,
            image_3k: localUrl,
            mergedMedia: newMedia 
          } : { ...post, mergedMedia: newMedia };
        }
        return { ...cleanOldUrls(post), image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl, type: 'image' };
      }
      return post;
    }), `Lokales Bild hinzugefügt (${flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt'})`);

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
      const thumbUrl = uploadData.url;
      const highResUrl = uploadData.url_large;
      
      console.log('Upload successful, thumb:', thumbUrl, 'large:', highResUrl, 'variant:', uploadData.local_large_variant);
      
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
                image: thumbUrl, 
                image_large: highResUrl, 
                image_3k: highResUrl,
                image_preview: localUrl, 
                type: 'image' 
              } as any;
              delete newMedia[itemIdx].uploadId;
              
              const updateBase = itemIdx === 0;
              return updateBase ? { 
                ...cleanOldUrls(post), 
                image: thumbUrl, 
                image_large: highResUrl, 
                image_3k: highResUrl,
                image_preview: localUrl,
                mergedMedia: newMedia 
              } : { ...post, mergedMedia: newMedia };
            } else {
              // CLEANUP: uploadId nicht gefunden oder Index-Problem
              // Entferne alle uploadId-Elemente ohne finale URLs (Phantom-Uploads)
              const cleanedMedia = newMedia.filter(m => {
                if (m.uploadId && !m.image && !m.image_large && !m.image_3k) {
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
                  image_large: highResUrl, 
                  image_3k: highResUrl,
                  image_preview: localUrl 
                };
                cleanedMedia.push(uploadedItem);
              }
              
              return { ...post, mergedMedia: cleanedMedia };
            }
          } else {
            // Keine mergedMedia - erstelle neue
            return { 
              ...cleanOldUrls(post), 
              image: thumbUrl, 
              image_large: highResUrl, 
              image_3k: highResUrl,
              image_preview: localUrl,
              mergedMedia: [{
                type: 'image',
                image: thumbUrl,
                image_large: highResUrl,
                image_3k: highResUrl,
                image_preview: localUrl
              }],
              type: 'image' 
            };
          }
        }
        return post;
      }), `Bild hochgeladen (${flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt'})`);
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

  const handleYoutubeChange = (id: string, url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    const youtubeId = (match && match[2].length === 11) ? match[2] : null;
    
    if (youtubeId) {
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
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
      ), `YouTube Link hinzugefügt (${flickrPosts.find(p => String(p.id) === String(id))?.title || 'Unbenannt'})`);
    } else {
      handlePostChange(id, 'youtubeUrl', url);
    }
  };

  const generateHTML = (posts: any[], title: string, subtitle: string, bio: string = '', forPreview = false) => {
    console.log('Generating HTML, posts:', posts);
    const domainFromState = publicDomain || R2_CONFIG.publicDomain;
    const baseUrl = domainFromState.startsWith('http') ? domainFromState : `https://${domainFromState}`;

    const getProxiedUrl = (url: string) => {
      if (!url) return '';
      if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
      
      // If we are in preview mode and the path is a local root-relative path, keep it as is
      // so the local dev server can serve it.
      if (forPreview && url.startsWith('/')) return url;
      
      let cleanUrl = url;
      // Strip leading slash if it exists so we can safely join with baseUrl
      if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
      if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);
      
      const domain = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      return `${domain}/${cleanUrl}`;
    };

    const getYoutubeId = (url: string) => {
      if (!url) return null;
      if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].substring(0, 11);
      if (url.includes('v=')) return url.split('v=')[1].substring(0, 11);
      if (url.includes('embed/')) return url.split('embed/')[1].substring(0, 11);
      return null;
    };

    const cards = posts.filter(p => !p.hidden).map(post => {
      let mediaHtml = '';
      
      if (post.mergedMedia && post.mergedMedia.length > 0) {
        const sortedMedia = [...post.mergedMedia];
        mediaHtml = `<div class="media-stack">` + sortedMedia.map((m: any) => {
          const yid = m.youtubeId || getYoutubeId(m.url || m.link);
          if (yid) {
            return `<div class="video-container mb-2"><iframe src="https://www.youtube.com/embed/${yid}?mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
          } else if (m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || ((m.url || m.link) && (m.url || m.link).endsWith('.mp4'))) {
            const videoUrl = getProxiedUrl(getVideoSrc(m, true) || getVideoSrc(m));
            if (!videoUrl) return '';
            return `<video src="${videoUrl}" class="block mb-2" controls muted playsinline style="width: 100%; max-height: 400px; background: #000;"></video>`;
          } else {
            const imageUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            if (!imageUrl) return '';
            return `<div class="block mb-2"><img src="${imageUrl}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" /></div>`;
          }
        }).join('') + `</div>`;
      } else {
        const yid = post.youtubeId || getYoutubeId(post.url || post.link);
        if (yid) {
          mediaHtml = `
            <div class="video-container">
              <iframe src="https://www.youtube.com/embed/${yid}?mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
          `;
        } else if (post.type === 'video' || (post.image && post.image.endsWith('.mp4')) || ((post.url || post.link) && (post.url || post.link).endsWith('.mp4'))) {
          const videoUrl = getProxiedUrl(getVideoSrc(post, true) || getVideoSrc(post));
          if (videoUrl) {
            mediaHtml = `
              <video src="${videoUrl}" controls muted playsinline style="width: 100%; max-height: 400px; background: #000;"></video>
            `;
          }
        } else {
          const imageUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
          if (imageUrl) {
            mediaHtml = `
              <div>
                <img src="${imageUrl}" alt="${post.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" />
              </div>
            `;
          }
        }
      }

      return `
      <div class="card" data-post-id="${post.id}">
        ${mediaHtml}
        <div class="content">
          <h2>${post.title}</h2>
          ${post.description ? `<p>${post.description}</p>` : ''}
          ${post.states && post.states.length > 0 ? `<div class="tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">${post.states.map((stateId: string) => {
            const state = PROJECT_STATES.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
            return state ? `<span class="tag-label" style="background-color: ${state.bright}; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">${state.label}</span>` : '';
          }).join('')}</div>` : ''}
          ${post.mergedMedia ? `<div class="links">` + post.mergedMedia.map((m: any, i: number) => (m.url || m.link) ? `<a href="${m.url || m.link}" target="_blank">Link ${i + 1}</a>` : '').join(' ') + `</div>` : ''}
        </div>
      </div>
    `}).join('');

    const filterBar = `<div class="filter-bar">
      <button class="filter-btn active" data-filter="all">Alle</button>
      ${PROJECT_STATES.map(s => `<button class="filter-btn" data-filter="${s.id}" style="--active-bg: ${s.bright}; --active-muted: ${s.muted}">${s.label}</button>`).join('')}
    </div>`;

    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/svg+xml" href="${EDITOR_FAVICON_DATA_URI}">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #000; color: #fff; margin: 0; padding: 2rem; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; max-width: 1400px; margin: 0 auto; }
        .card { background: #111; border: 1px solid #333; border-radius: 8px; overflow: hidden; transition: transform 0.2s; }
        .card:hover { transform: translateY(-4px); border-color: #555; }
        .card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; cursor: pointer; }
        .media-stack { display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer; }
        .media-stack img { aspect-ratio: auto; max-height: 400px; }
        .video-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; background: #000; }
        .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .mb-2 { margin-bottom: 0.5rem; }
        .block { display: block; }
        .content { padding: 1rem; }
        h2 { margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 500; color: #eee; }
        p { margin: 0; color: #aaa; font-size: 0.9rem; line-height: 1.4; }
        .tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
        .tag-label { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
        .links { margin-top: 0.5rem; font-size: 0.8rem; }
        .links a { color: #4285F4; text-decoration: none; margin-right: 0.5rem; }
        .links a:hover { text-decoration: underline; }
        header { text-align: center; margin-bottom: 3rem; }
        h1 { font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin: 0; }
        .subtitle { color: #666; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.8rem; margin-top: 0.5rem; }
        .bio { color: #999; font-size: 0.95rem; line-height: 1.6; max-width: 900px; margin: 2rem auto; padding: 1rem; border-top: 1px solid #333; border-bottom: 1px solid #333; white-space: pre-wrap; word-wrap: break-word; }
        
        /* Filter Bar */
        .filter-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 2rem; }
        .filter-btn { background: #222; border: 1px solid #333; color: #888; padding: 6px 16px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: all 0.3s; }
        .filter-btn:hover { border-color: #555; color: #ccc; }
        .filter-btn.active { background: var(--active-bg, #4285F4); color: #fff; border-color: var(--active-bg, #4285F4); box-shadow: 0 0 15px var(--active-muted, rgba(66, 133, 244, 0.3)); }
        
        /* Lightbox CSS */
        .lightbox { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 1000; flex-direction: row; }
        .lightbox.active { display: flex; }
        .lightbox-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 20px; min-width: 0; }
        .lightbox-sidebar { width: 320px; background: #111; border-left: 1px solid #333; display: flex; flex-direction: column; padding: 24px; overflow-y: auto; flex-shrink: 0; }
        .lightbox-close { position: fixed; top: 20px; right: 20px; color: white; font-size: 30px; cursor: pointer; background: rgba(0,0,0,0.5); border: none; width: 40px; height: 40px; border-radius: 50%; z-index: 10; display: flex; align-items: center; justify-content: center; line-height: 1; }
        .lightbox-content { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        .lightbox-content img, .lightbox-content video, .lightbox-content iframe { max-width: 100%; max-height: 85vh; object-fit: contain; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border-radius: 4px; }
        .lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); color: white; border: none; padding: 15px; cursor: pointer; font-size: 20px; border-radius: 50%; transition: all 0.3s; z-index: 5; }
        .lightbox-nav:hover { background: rgba(255,255,255,0.3); }
        .lightbox-prev { left: 20px; }
        .lightbox-next { right: 20px; }
        .lightbox-info { margin-top: 20px; text-align: center; }
        .lightbox-title-text { color: white; font-size: 1.2rem; font-weight: 500; margin: 0 0 10px 0; }
        .lightbox-counter { color: #aaa; font-size: 0.8rem; }
        
        /* Sidebar CSS */
        .sidebar-section { margin-bottom: 24px; }
        .sidebar-label { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; display: block; }
        .reorder-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .reorder-item { aspect-ratio: 1; background: #222; border-radius: 4px; overflow: hidden; cursor: pointer; position: relative; border: 2px solid transparent; transition: all 0.2s; }
        .reorder-item:hover { border-color: #444; }
        .reorder-item.active { border-color: #4285F4; }
        .reorder-item.dragging { opacity: 0.5; }
        .reorder-item img, .reorder-item video { width: 100%; height: 100%; object-fit: cover; }
        .reorder-item .type-icon { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); padding: 1px 3px; border-radius: 2px; font-size: 8px; color: #fff; }
        .save-order-btn { background: #16a34a; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%; margin-top: 20px; transition: background 0.2s; }
        .save-order-btn:hover { background: #15803d; }
        .sidebar-description { font-size: 0.85rem; color: #aaa; line-height: 1.5; margin-bottom: 20px; }
        @media (max-width: 768px) {
          .lightbox { flex-direction: column; }
          .lightbox-sidebar { width: 100%; border-left: none; border-top: 1px solid #333; height: 300px; }
        }
    </style>
    <script id="portfolio-data" type="application/json">
      ${JSON.stringify({
        title,
        subtitle,
        bio,
        projectStates: PROJECT_STATES,
        posts: posts.filter(p => !p.hidden),
        publicDomain: baseUrl,
        lastUpdated: new Date().toISOString()
      }).replace(new RegExp('<', 'g'), '\\u003c')}
    </script>
    <script>
      console.log('Script running');
      function init() {
        let publicDomain = "https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev";
        try {
          console.log('Init starting...');
          const portfolioDataEl = document.getElementById('portfolio-data');
          if (!portfolioDataEl) {
            console.error('portfolio-data element not found');
            // Continue anyway, maybe some things still work
          } else {
            console.log('portfolioDataEl found');
            try {
              window.portfolioData = JSON.parse(portfolioDataEl.textContent);
              if (window.portfolioData.items && !window.portfolioData.posts) {
                window.portfolioData.posts = window.portfolioData.items.filter(p => !p.hidden);
              }
              console.log('Portfolio data parsed:', window.portfolioData);
              if (window.portfolioData && window.portfolioData.publicDomain) {
                publicDomain = window.portfolioData.publicDomain;
              }
              
              // Live Update Check
              fetch('state.json')
                .then(res => res.json())
                .then(newData => {
                  if (newData && newData.lastUpdated && window.portfolioData.lastUpdated) {
                    if (new Date(newData.lastUpdated) > new Date(window.portfolioData.lastUpdated)) {
                      console.log('Newer state found! Updating live view...', newData.lastUpdated);
                      
                      // 1. Update Title and Bio if changed
                      if (newData.title) document.title = newData.title;
                      const h1 = document.querySelector('header h1');
                      const subtitle = document.querySelector('header .subtitle');
                      const bio = document.querySelector('header .bio');
                      if (h1 && newData.title) h1.textContent = newData.title;
                      if (subtitle && newData.subtitle) subtitle.textContent = newData.subtitle;
                      if (bio && newData.bio) bio.innerHTML = newData.bio.replace(/\\n/g, '<br/>');
                      
                      // 2. Update existing cards
                      newData.items.forEach(item => {
                        const card = document.querySelector(\`[data-post-id="\${item.id}"]\`);
                        if (card) {
                          const h2 = card.querySelector('.content h2');
                          if (h2) h2.textContent = item.title || '';
                          
                          let p = card.querySelector('.content p');
                          if (item.description) {
                            if (!p) {
                              p = document.createElement('p');
                              if (h2 && h2.nextSibling) {
                                h2.parentNode.insertBefore(p, h2.nextSibling);
                              } else {
                                card.querySelector('.content').appendChild(p);
                              }
                            }
                            p.textContent = item.description;
                          } else if (p) {
                            p.remove();
                          }
                          
                          // States/Tags
                          if (item.states && item.states.length > 0 && newData.projectStates) {
                            let tagsDiv = card.querySelector('.tags');
                            if (!tagsDiv) {
                              tagsDiv = document.createElement('div');
                              tagsDiv.className = 'tags';
                              tagsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;';
                              card.querySelector('.content').appendChild(tagsDiv);
                            }
                            tagsDiv.innerHTML = item.states.map(stateId => {
                              const state = newData.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                              return state ? \`<span class="tag-label" style="background-color: \${state.bright}; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">\${state.label}</span>\` : '';
                            }).join('');
                          } else {
                            const tagsDiv = card.querySelector('.tags');
                            if (tagsDiv) tagsDiv.remove();
                          }
                        }
                      });
                      
                      // 3. Update global window object for Lightbox sync
                      newData.posts = newData.items.filter(p => !p.hidden); // Map items back to posts property for Lightbox
                      window.portfolioData = newData;
                    }
                  }
                })
                .catch(err => console.log('Live update check failed or no state.json available yet.', err));
                
            } catch (jsonErr) {
              console.error('JSON parse failed:', jsonErr);
              console.log('Raw data length:', portfolioDataEl.textContent.length);
            }
          }
        } catch (e) {
          console.error('Error in init setup:', e);
        }
        const isLocalFile = window.location.protocol === 'file:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('.run.app');
        
        function getYoutubeId(url) {
          if (!url) return null;
          if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].substring(0, 11);
          if (url.includes('v=')) return url.split('v=')[1].substring(0, 11);
          if (url.includes('embed/')) return url.split('embed/')[1].substring(0, 11);
          return null;
        }

        function isDirectMediaFile(url) {
          return !!url && /\\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\\?.*)?$/i.test(url);
        }

        function isValidImageCandidate(url) {
          if (!url) return false;
          if (url.startsWith('data:') || url.startsWith('blob:')) return true;
          if (url.startsWith('/data/') || url.startsWith('/originals/')) return true;
          return isDirectMediaFile(url);
        }

        function getImageSrc(media, preferLarge) {
          if (!media) return undefined;
          const primary = preferLarge
            ? [media.image_3k, media.image_large, media.imageLarge, media.largeUrl, media.image, media.image_preview]
            : [media.image, media.image_preview, media.image_3k, media.image_large, media.imageLarge, media.largeUrl];
          for (const candidate of primary) {
            if (isValidImageCandidate(candidate)) return candidate;
          }
          return undefined;
        }

        function getVideoSrc(media, preferLarge) {
          if (!media) return undefined;
          const primary = preferLarge
            ? [media.image_large, media.imageLarge, media.largeUrl, media.image, media.video_large, media.video, media.url, media.link]
            : [media.image, media.image_preview, media.image_large, media.imageLarge, media.video, media.video_large, media.url, media.link];
          for (const candidate of primary) {
            if (candidate && isDirectMediaFile(candidate) && /\\.(mp4|webm|mov)(\\?.*)?$/i.test(candidate)) {
              return candidate;
            }
          }
          return undefined;
        }

        function getProxiedUrl(url) {
          if (!url) return '';
          if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
          
          // Normalize path
          let cleanUrl = url;
          if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);
          if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
          
          // Fallback domain if window.portfolioData.publicDomain is not available
          const domain = (window.portfolioData && window.portfolioData.publicDomain) ? window.portfolioData.publicDomain : publicDomain;
          const safeDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;

          if (isLocalFile) {
            const pathParts = window.location.pathname.split('/');
            const isInBackups = pathParts[pathParts.length - 2] === 'backups';
            return (isInBackups ? '../' : './') + cleanUrl;
          } else if (!isLocalhost) {
            const domainToUse = safeDomain.endsWith('/') ? safeDomain.slice(0, -1) : safeDomain;
            return domainToUse + '/' + cleanUrl;
          }
          
          return '/' + cleanUrl;
        }

        // Filter logic
        const filterBtns = document.querySelectorAll('.filter-btn');
        const cards = document.querySelectorAll('.card');
        console.log('Cards found in DOM:', cards.length);
        
        filterBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            cards.forEach(card => {
              const postId = card.getAttribute('data-post-id');
              const post = window.portfolioData.posts.find(p => String(p.id) === String(postId));
              const postStatesLower = post && post.states ? post.states.map(s => String(s).toLowerCase()) : [];
              
              if (filter === 'all') {
                if (postStatesLower.includes('-all')) {
                  card.style.display = 'none';
                } else {
                  card.style.display = 'block';
                }
              } else if (postStatesLower.includes(String(filter).toLowerCase())) {
                card.style.display = 'block';
              } else {
                card.style.display = 'none';
              }
            });
          });
        });

        document.querySelectorAll('img, a, video, iframe').forEach(el => {
          const attr = (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME') ? 'src' : 'href';
          let url = el.getAttribute(attr);
          if (url) el.setAttribute(attr, getProxiedUrl(url));
        });

        // Lightbox logic
        const lightbox = document.getElementById('lightbox');
        console.log('Lightbox found:', lightbox);
        const lightboxContent = document.getElementById('lightbox-content');
        const lightboxTitle = document.getElementById('lightbox-title');
        const lightboxTags = document.getElementById('lightbox-tags');
        const lightboxDescription = document.getElementById('lightbox-description');
        const lightboxCounter = document.getElementById('lightbox-counter');
        const btnPrev = document.getElementById('lightbox-prev');
        const btnNext = document.getElementById('lightbox-next');
        const btnSaveOrder = document.getElementById('save-order-btn');
        const reorderGrid = document.getElementById('reorder-grid');
        
        // Verify all critical elements exist
        if (!lightbox || !lightboxContent || !lightboxTitle || !lightboxDescription || !lightboxCounter) {
          console.error('CRITICAL: Missing lightbox DOM elements!', { 
            lightbox, lightboxContent, lightboxTitle, 
            lightboxDescription, lightboxCounter 
          });
          return; // Abort init if critical elements are missing
        }
        
        let currentPost = null;
        let currentPostMedia = [];
        let currentMediaIndex = 0;
        
        console.log('Cards found:', cards.length);
        cards.forEach(card => {
          card.style.cursor = 'pointer';
          console.log('Attaching click listener to card:', card.getAttribute('data-post-id'));
          card.addEventListener('click', (e) => {
            console.log('Card clicked!', e.target);
            if (e.target.tagName === 'A' || e.target.closest('a')) {
              console.log('Link click detected, ignoring lightbox');
              return;
            }
            
            const postId = card.getAttribute('data-post-id');
            console.log('PostId from attribute:', postId);
            if (!postId) {
              console.warn('No data-post-id found on card');
              return;
            }
            
            if (!window.portfolioData || !window.portfolioData.posts) {
              console.error('window.portfolioData.posts is missing!');
              return;
            }
            
            currentPost = window.portfolioData.posts.find(p => String(p.id) === String(postId));
            if (!currentPost) {
              console.error('Post not found in data for ID:', postId);
              return;
            }
            
            console.log('Opening Lightbox for:', currentPost.title);
            
            currentPostMedia = [];
            if (currentPost.mergedMedia && currentPost.mergedMedia.length > 0) {
              currentPostMedia = currentPost.mergedMedia.filter(m => getImageSrc(m, true) || getImageSrc(m) || getVideoSrc(m, true) || getVideoSrc(m) || m.youtubeId || getYoutubeId(m.url || m.link));
            } else {
              currentPostMedia = [currentPost].filter(m => getImageSrc(m, true) || getImageSrc(m) || getVideoSrc(m, true) || getVideoSrc(m) || m.youtubeId || getYoutubeId(m.url || m.link));
            }
            
            currentMediaIndex = 0;
            lightboxTitle.textContent = currentPost.title || '';
            lightboxDescription.innerHTML = currentPost.description ? currentPost.description.replace(/\\n/g, '<br/>') : '';
            
            // Render tags
            if (currentPost.states && currentPost.states.length > 0 && window.portfolioData.projectStates) {
              lightboxTags.innerHTML = currentPost.states.map(stateId => {
                const state = window.portfolioData.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                return state ? \`<span class="tag-label" style="background-color: \${state.muted}; border: 1px solid \${state.bright}; color: #fff; margin-right: 4px; margin-bottom: 4px; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">\${state.label}</span>\` : '';
              }).join('');
              lightboxTags.style.display = 'flex';
            } else {
              if (lightboxTags) {
                lightboxTags.innerHTML = '';
                lightboxTags.style.display = 'none';
              }
            }
            
            updateLightbox();
            renderReorderGrid();
            lightbox.classList.add('active');
          });
        });
        
        function updateLightbox() {
          if (currentPostMedia.length === 0 || !lightboxContent) return;
          
          const m = currentPostMedia[currentMediaIndex];
          if (lightboxCounter) {
            lightboxCounter.textContent = \`\${currentMediaIndex + 1} / \${currentPostMedia.length}\`;
          }
          
          if (btnPrev) btnPrev.style.display = currentPostMedia.length > 1 ? 'block' : 'none';
          if (btnNext) btnNext.style.display = currentPostMedia.length > 1 ? 'block' : 'none';
          
          let html = '';
          const yid = m.youtubeId || getYoutubeId(m.url || m.link);
          if (yid) {
            html = \`<iframe width="800" height="450" src="https://www.youtube.com/embed/\${yid}?mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\`;
          } else if (m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || ((m.url || m.link) && (m.url || m.link).endsWith('.mp4'))) {
            const videoUrl = getProxiedUrl(getVideoSrc(m, true) || getVideoSrc(m));
            if (videoUrl) {
              html = \`<video src="\${videoUrl}" controls muted playsinline style="max-width: 100%; max-height: 85vh;"></video>\`;
            } else {
              html = '<div style="color: #aaa; padding: 40px; text-align: center;">Video konnte nicht geladen werden</div>';
            }
          } else {
            const largeUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            if (largeUrl) {
              html = \`<img src="\${largeUrl}" alt="" style="max-width: 100%; max-height: 85vh; object-fit: contain;" />\`;
            } else {
              html = '<div style="color: #aaa; padding: 40px; text-align: center;">Bild konnte nicht geladen werden</div>';
            }
          }
          
          lightboxContent.innerHTML = html;
          
          // Update active thumbnail in grid
          document.querySelectorAll('.reorder-item').forEach((item, i) => {
            if (i === currentMediaIndex) item.classList.add('active');
            else item.classList.remove('active');
          });
        }

        function renderReorderGrid() {
          if (!reorderGrid) {
            console.warn('reorderGrid element not found, skipping grid render');
            return;
          }
          reorderGrid.innerHTML = '';
          currentPostMedia.forEach((m, i) => {
            const item = document.createElement('div');
            item.className = 'reorder-item' + (i === currentMediaIndex ? ' active' : '');
            item.draggable = true;
            item.dataset.index = i;
            
            const isVideoFile = m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || (m.url && m.url.endsWith('.mp4'));
            const isYoutube = m.type === 'youtube' || !!getYoutubeId(m.url || m.link);
            const thumbUrl = getProxiedUrl(getImageSrc(m) || getImageSrc(m, true));
            
            item.innerHTML = \`
              \${isVideoFile ? \`<video src="\${thumbUrl}" muted></video>\` : \`<img src="\${thumbUrl}" />\`}
              <div class="type-icon">\${isYoutube ? 'VIDEO' : isVideoFile ? 'VIDEO' : 'IMG'}</div>
            \`;
            
            item.addEventListener('click', () => {
              currentMediaIndex = i;
              updateLightbox();
            });
            
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            
            reorderGrid.appendChild(item);
          });
        }

        let draggedItemIdx = null;

        function handleDragStart(e) {
          draggedItemIdx = parseInt(this.dataset.index);
          this.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragOver(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }

        function handleDrop(e) {
          e.preventDefault();
          const targetIdx = parseInt(this.dataset.index);
          if (draggedItemIdx !== null && draggedItemIdx !== targetIdx) {
            const items = [...currentPostMedia];
            const [dragged] = items.splice(draggedItemIdx, 1);
            items.splice(targetIdx, 0, dragged);
            
            // Update currentMediaIndex to follow the dragged item
            if (currentMediaIndex === draggedItemIdx) {
              currentMediaIndex = targetIdx;
            } else if (draggedItemIdx < currentMediaIndex && targetIdx >= currentMediaIndex) {
              currentMediaIndex--;
            } else if (draggedItemIdx > currentMediaIndex && targetIdx <= currentMediaIndex) {
              currentMediaIndex++;
            }
            
            currentPostMedia = items;
            
            // Update the post in window.portfolioData
            const postIdx = window.portfolioData.posts.findIndex(p => String(p.id) === String(currentPost.id));
            if (postIdx !== -1) {
              const updatedPost = { ...window.portfolioData.posts[postIdx], mergedMedia: currentPostMedia };
              const primaryMedia = currentPostMedia[0];
              if (primaryMedia) {
                updatedPost.type = primaryMedia.type || updatedPost.type;
                updatedPost.image = primaryMedia.image || updatedPost.image;
                updatedPost.image_large = primaryMedia.image_large || updatedPost.image_large;
                updatedPost.url = primaryMedia.url || primaryMedia.link || updatedPost.url;
                updatedPost.youtubeId = primaryMedia.youtubeId || updatedPost.youtubeId;
              }
              window.portfolioData.posts[postIdx] = updatedPost;
            }
            
            renderReorderGrid();
            updateLightbox();
          }
        }

        function handleDragEnd() {
          this.classList.remove('dragging');
          draggedItemIdx = null;
        }

        btnSaveOrder.addEventListener('click', () => {
          // Update the script tag content
          const scriptTag = document.getElementById('portfolio-data');
          scriptTag.textContent = JSON.stringify(window.portfolioData);
          
          // Generate new HTML content
          const html = document.documentElement.outerHTML;
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'index.html';
          a.click();
          URL.revokeObjectURL(url);
          
          alert('Reihenfolge gespeichert! Die aktualisierte index.html wurde heruntergeladen.');
        });
        
        if (document.getElementById('lightbox-close')) {
          document.getElementById('lightbox-close').addEventListener('click', () => {
            lightbox.classList.remove('active');
            lightboxContent.innerHTML = '';
            reorderGrid.innerHTML = '';
          });
        }
        
        if (btnPrev) {
          btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMediaIndex = (currentMediaIndex - 1 + currentPostMedia.length) % currentPostMedia.length;
            updateLightbox();
          });
        }
        
        if (btnNext) {
          btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMediaIndex = (currentMediaIndex + 1) % currentPostMedia.length;
            updateLightbox();
          });
        }
        
        if (lightbox) {
          lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
              lightbox.classList.remove('active');
              lightboxContent.innerHTML = '';
              if (reorderGrid) reorderGrid.innerHTML = '';
            }
          });
        }
        
        const activeBtn = document.querySelector('.filter-btn.active');
        if (activeBtn) activeBtn.click();
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
      } else {
        document.addEventListener('DOMContentLoaded', init);
      }
    </script>
</head>
<body>
    <header>
        <h1>${title}</h1>
        <div class="subtitle">${subtitle}</div>
        ${bio ? `<div class="bio">${linkifyToHtml(bio)}</div>` : ''}
    </header>
    ${filterBar}
    <div class="gallery">
        ${cards}
    </div>
    
    <div id="lightbox" class="lightbox">
        <div class="lightbox-main">
            <button id="lightbox-close" class="lightbox-close">&times;</button>
            <button id="lightbox-prev" class="lightbox-nav lightbox-prev">&#10094;</button>
            <div id="lightbox-content" class="lightbox-content"></div>
            <button id="lightbox-next" class="lightbox-nav lightbox-next">&#10095;</button>
            <div class="lightbox-info">
                <div id="lightbox-counter" class="lightbox-counter"></div>
            </div>
        </div>
        <div class="lightbox-sidebar">
            <h2 id="lightbox-title" class="lightbox-title-text"></h2>
            <div id="lightbox-tags" class="tags" style="margin-bottom: 16px;"></div>
            <div id="lightbox-description" class="sidebar-description"></div>
            
            <div class="sidebar-section">
                <span class="sidebar-label">Medien sortieren (Drag & Drop)</span>
                <div id="reorder-grid" class="reorder-grid"></div>
            </div>
            
            <button id="save-order-btn" class="save-order-btn">Download Updated HTML</button>
        </div>
    </div>
</body>
</html>`;
  };

  const getDisplayImage = (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    // Always keep root-relative local asset paths working in the editor runtime.
    // This is important for scraped/local files served via `app.use('/data', ...)`.
    if (url.startsWith('/data/') || url.startsWith('/originals/')) return url;
    
    // If we are in R2 fallback mode or if the local server is not available,
    // we should prefix local paths with the Cloudflare domain.
    if (isR2Fallback || isEmbeddedData) {
      const baseUrl = R2_CONFIG.publicDomain.endsWith('/') ? R2_CONFIG.publicDomain.slice(0, -1) : R2_CONFIG.publicDomain;
      const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
      return `${baseUrl}/${cleanUrl}`;
    }
    
    return url;
  };

  const handleSyncFromCloudflare = async () => {
    setLoading(true);
    try {
      const r2Res = await fetch('/api/r2-state');
      if (!r2Res.ok) throw new Error('Failed to fetch from R2');
      
      const r2Data = await r2Res.json();
      setIsR2Fallback(true);
      setIsFlickrFallback(false);
      setPortfolioTitle(r2Data.title || portfolioTitle);
      setPortfolioSubtitle(r2Data.subtitle || portfolioSubtitle);
      if (r2Data.scrapeConfig) {
        if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
        if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
      }
      if (r2Data.bio) setPortfolioBio(r2Data.bio);
      
      const items = r2Data.items || r2Data.posts || [];
      if (items.length > 0) {
        const changes: string[] = [];
        
        if (r2Data.title && portfolioTitle !== r2Data.title) changes.push(`~ Portfolio Titel [geändert]`);
        if (r2Data.subtitle && portfolioSubtitle !== r2Data.subtitle) changes.push(`~ Portfolio Untertitel [geändert]`);
        if (r2Data.bio && portfolioBio !== r2Data.bio) changes.push(`~ Portfolio Bio [geändert]`);

        const newItems = items.filter((item: any) => !flickrPosts.find((p: any) => String(p.id) === String(item.id)));
        if (newItems.length > 0) {
          changes.push(`Neu hinzugefügt (${newItems.length}):`);
          newItems.forEach((item: any) => changes.push(`+ ${item.title || 'Ohne Titel'}`));
        }
        
        const deletedItems = flickrPosts.filter((p: any) => !items.find((item: any) => String(item.id) === String(p.id)));
        if (deletedItems.length > 0) {
          changes.push(`Gelöscht (${deletedItems.length}):`);
          deletedItems.forEach((item: any) => changes.push(`- ${item.title || 'Ohne Titel'}`));
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
          changes.push(`Geändert (${updatedItems.length}):`);
          updatedItems.forEach((item: any) => {
            const old = flickrPosts.find((p: any) => String(p.id) === String(item.id));
            const changedFields = [];
            if (old.title !== item.title) changedFields.push('Titel');
            if (old.description !== item.description) changedFields.push('Beschreibung');
            if (JSON.stringify(old.states || []) !== JSON.stringify(item.states || [])) changedFields.push('Kategorien');
            if (old.hidden !== item.hidden) changedFields.push('Sichtbarkeit');
            
            // For media, just do a basic length check or stringify
            const oldMedia = old.mergedMedia ? old.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            const newMedia = item.mergedMedia ? item.mergedMedia.map((m: any) => ({...m, uploadId: undefined, image_preview: undefined})) : [];
            if (JSON.stringify(oldMedia) !== JSON.stringify(newMedia)) changedFields.push('Medien');
            
            if (changedFields.length === 0) changedFields.push('Sonstiges');
            
            changes.push(`~ ${item.title || 'Ohne Titel'} [${changedFields.join(', ')}]`);
          });
        }

        if (changes.length === 0) {
          changes.push("Keine Änderungen an den Posts festgestellt.");
        }
        

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
        
        // Instead of applying immediately, store in pending state for confirmation
        setCloudSyncState({ 
          changes: changes.length > 0 ? changes : ["Keine strukturellen Änderungen an den Posts festgestellt."], 
          items: absoluteItems, 
          r2Data 
        });
        
        ignoreCloudChangesRef.current = false;
      }
    } catch (e) {
      console.error(e);
      alert("Fehler beim Laden von Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      const html = generateHTML(flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, true);
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: html })
      });
      
      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
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
        cleanedPost.mergedMedia = cleanedPost.mergedMedia.filter((m: any) => {
          if (m.type === 'youtube') return true;
          // uploadId-Elemente MÜSSEN finale URLs haben (keine Phantom-Uploads)
          if (m.uploadId) {
            return !!(m.image || m.image_large || m.image_3k || m.image_preview);
          }
          // Normale Elemente
          return !!(m.image || m.image_large || m.image_preview || m.image_3k || m.youtubeId || m.youtubeUrl || m.link || m.url);
        });
        
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
          // YouTube entries are valid even without an image
          if (m.type === 'youtube' && m.youtubeId) return true;
          const key = m.image || m.image_large || m.image_3k || m.url || '';
          if (!key) return false; // drop items without any usable URL
          if (seenUrls.has(key)) return false; // duplicate
          seenUrls.add(key);
          return true;
        });

        if (cleanedPost.mergedMedia.length === 0) {
          delete (cleanedPost as any).mergedMedia;
        } else {
          const primary = cleanedPost.mergedMedia[0];
          cleanedPost.type = primary.type || cleanedPost.type || 'image';
          cleanedPost.image = primary.image || cleanedPost.image;
          cleanedPost.image_large = primary.image_large || primary.image || cleanedPost.image_large;
          cleanedPost.image_3k = primary.image_3k || primary.image_large || primary.image || cleanedPost.image_3k;
          cleanedPost.youtubeId = primary.youtubeId || cleanedPost.youtubeId;
        }
      }
      
      // 3. Final cleanup: Remove empty strings that might be misinterpreted as "empty pictures"
      const fieldsToCleanup = ['image', 'image_large', 'image_3k', 'url', 'youtubeId', 'youtubeUrl'];
      fieldsToCleanup.forEach(field => {
        if ((cleanedPost as any)[field] === '') {
          delete (cleanedPost as any)[field];
        }
      });

      return cleanedPost;
    }).filter(post => {
      // Only publish posts that have either a title, a description, or at least one piece of media
      const hasMedia = !!(post.image || (post.mergedMedia && post.mergedMedia.length > 0) || post.youtubeId);
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
      const htmlContent = generateHTML(currentPosts, portfolioTitle, portfolioSubtitle, portfolioBio, false);
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
          setTimeout(() => setUploadProgress(null), 2000);
          setUploading(false);
          return;
        } else {
          const errorText = await response.text();
          console.error('handleUpload: POST failed, status:', response.status, 'error:', errorText);
          throw new Error(`Publish failed: ${response.status} ${errorText}`);
        }
      } catch (fetchError: any) {
        console.log("Server-side publish failed, falling back to direct R2 upload", fetchError);
      }
      
      // Fallback: Direct R2 upload (requires CORS configured on bucket)
      const s3Client = getS3Client();
      
      setUploadProgress(40);
      
      // 1. Upload index.html
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'index.html',
        Body: htmlContent,
        ContentType: 'text/html',
      }));
      
      setUploadProgress(70);

      // 2. Upload state.json
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'state.json',
        Body: stateData,
        ContentType: 'application/json',
      }));
      
      setUploadProgress(100);
      setUploadSuccess({ url: `${R2_CONFIG.publicDomain}/index.html` });
      setHasUnpublishedChanges(false);
      setTimeout(() => setUploadProgress(null), 2000);
      setUploading(false);
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

    setHasUnsyncedMedia(false);
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

      await handleSyncFromCloudflare();
    } catch (err: any) {
      setError(err.message || 'Restore fehlgeschlagen');
    } finally {
      setRestoringLatestPublish(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
  };

  const handleR2Cleanup = async () => {
    if (r2CleanupRunning) return;

    setR2CleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Analysiere R2 auf verwaiste Dateien...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Cleanup-Vorschau fehlgeschlagen');
      }

      const previewLogs = [
        `R2-Analyse abgeschlossen.`,
        `Gepruefte Dateien: ${previewData.scannedCount || 0}`,
        `Verwaiste Dateien: ${previewData.orphanedCount || 0}`,
        `Moeglich frei werdender Speicher: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Beispiele:');
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
            `${previewData.orphanedCount} verwaiste R2-Dateien gefunden.\n` +
            `Geschätzte Freigabe: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Jetzt wirklich löschen?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Löschen abgebrochen.']);
            setR2CleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Starte Löschen der verwaisten Dateien...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Cleanup fehlgeschlagen');
          }

          setScrapeLogs(prev => [
            ...prev,
            `Cleanup abgeschlossen.`,
            `Gelöschte Dateien: ${executeData.deletedCount || 0}`,
            `Freigegebener Speicher: ${formatBytes(executeData.deletedBytes || 0)}`
          ]);

          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Cleanup fehlgeschlagen';
          setError(message);
          setScrapeLogs(prev => [...prev, `FEHLER: ${message}`]);
        } finally {
          setR2CleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Cleanup fehlgeschlagen';
      setError(message);
      setScrapeLogs(prev => [...prev, `FEHLER: ${message}`]);
      setR2CleanupRunning(false);
    }
  };

  const handleLegacyDuplicateCleanup = async () => {
    if (legacyDupCleanupRunning) return;

    setLegacyDupCleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Analysiere alte uploads/... Duplikate in R2...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview-legacy-uploads', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Duplikat-Vorschau fehlgeschlagen');
      }

      const previewLogs = [
        `Legacy-Duplikat-Analyse abgeschlossen.`,
        `Gepruefte Legacy-Dateien: ${previewData.scannedCount || 0}`,
        `Sichere Duplikate: ${previewData.duplicateCount || 0}`,
        `Moeglich frei werdender Speicher: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Beispiele:');
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
            `${previewData.duplicateCount} sichere Legacy-Duplikate gefunden.\n` +
            `Geschätzte Freigabe: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Nur diese alten uploads/... Duplikate jetzt löschen?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Löschen abgebrochen.']);
            setLegacyDupCleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Starte Löschen der sicheren Legacy-Duplikate...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute-legacy-uploads', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Duplikat-Cleanup fehlgeschlagen');
          }

          setScrapeLogs(prev => [
            ...prev,
            `Legacy-Duplikat-Cleanup abgeschlossen.`,
            `Gelöschte Dateien: ${executeData.deletedCount || 0}`,
            `Freigegebener Speicher: ${formatBytes(executeData.deletedBytes || 0)}`
          ]);

          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Duplikat-Cleanup fehlgeschlagen';
          setError(message);
          setScrapeLogs(prev => [...prev, `FEHLER: ${message}`]);
        } finally {
          setLegacyDupCleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Duplikat-Cleanup fehlgeschlagen';
      setError(message);
      setScrapeLogs(prev => [...prev, `FEHLER: ${message}`]);
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
      const targetTitle = flickrPosts.find(p => String(p.id) === String(active.id))?.title || 'Unbenannt';
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
            setPast(p => [...p, current].slice(-50));
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
    
    const postsToMerge = flickrPosts.filter(p => selectedThumbnails.includes(p.id));
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
        combinedDescription += "\n\n──────────────────────────────\n\n";
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

    updatePosts(prev => {
      const filtered = prev.filter(p => !selectedThumbnails.includes(p.id) || p.id === mainPost.id);
      return filtered.map(p => p.id === mainPost.id ? mainPost : p);
    }, `Posts zusammengeführt (${mainPost.title || 'Unbenannt'})`);

    // Stay in rearrange mode and select the newly merged post
    setSelectedThumbnails([mainPost.id]);
  };

  const handleBulkDelete = async () => {
    if (selectedThumbnails.length === 0) return;
    
    const confirmDelete = window.confirm(`Bist du sicher, dass du ${selectedThumbnails.length} Element(e) löschen möchtest?\n\nDies löscht die Daten vom Server und die Dateien von der Festplatte unwiderruflich!`);
    if (!confirmDelete) return;

    try {
      const idsToDelete = selectedThumbnails.map(id => String(id));
      const res = await fetch('/api/state/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      
      const data = await res.json();
      if (data.success) {
        // Remove from local state - filter out deleted posts by id
        updatePosts(
          prev => prev.filter(post => !idsToDelete.includes(String(post.id))),
          'Mehrere Posts gelöscht'
        );
        setSelectedThumbnails([]);
        alert(`${data.deletedCount} Element(e) und ${data.filesDeleted} Datei(en) erfolgreich gelöscht.`);
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
          <span className={`px-1.5 py-0.5 rounded font-bold ${parseFloat(estimatedCost) > 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
            ${estimatedCost}
          </span>
        </div>
      </div>
    );
  };

  const AdminButton = ({ onClick, disabled, id, children, className = "", color = "bg-white/5 text-white/80 hover:bg-white/10 border-white/10", tooltip, active }: any) => (
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
      ? post.mergedMedia[0]
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
                title="Lightbox öffnen"
              >
                <Maximize2 className="w-3 h-3 text-white/70" />
              </button>
            )}
          </>
        )}

        {isSelected && (
          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
            <span className="bg-blue-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
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
            className="ml-1 inline-flex items-center gap-1 px-2 py-1 bg-black/30 hover:bg-black/40 border border-white/10 rounded text-[10px] font-bold text-white/90"
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
            className="fixed bottom-10 left-1/2 z-[100] bg-blue-600 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-3 border border-white/20 backdrop-blur-md"
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
        handleSyncFromCloudflare={handleSyncFromCloudflare}
        handleResetAll={handleResetAll}
        handlePreview={handlePreview}
        handleUpload={handleUpload}
        handleRestoreLatestPublish={handleRestoreLatestPublish}
        handleR2Cleanup={handleR2Cleanup}
        handleLegacyDuplicateCleanup={handleLegacyDuplicateCleanup}
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
      />

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
          handlePostChange={handlePostChange}
          handleYoutubeChange={handleYoutubeChange}
          handleDeletePost={handleDeletePost}
          handleMergeDown={handleMergeDown}
          handleUpdatePostMedia={handleUpdatePostMedia}
          setSelectedImage={setSelectedImage}
          handleStateToggle={handleStateToggle}
          handleToggleHidden={handleToggleHidden}
          handleImageLoad={handleImageLoad}
          getDisplayImage={getDisplayImage}
          getImageSrc={getImageSrc}
          getVideoSrc={getVideoSrc}
          getResolutionLabel={getResolutionLabel}
          formatDescription={formatDescription}
          isValidImageCandidate={isValidImageCandidate}
        />
      )}

      {/* Backups Modal */}
      <BackupsModal
        isOpen={showBackups}
        onClose={() => setShowBackups(false)}
        backupsList={backupsList}
        isRestoring={isRestoring}
        restoreError={restoreError}
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
        onClose={() => setCloudSyncState(null)}
        onConfirm={async () => {
          if (!cloudSyncState) return;
          const { items, r2Data } = cloudSyncState;
          
          console.log('[Sync] User confirmed. Applying cloud data to state:', items.length, 'items');
          updatePosts(items, 'Aus Cloud geladen');
          
          if (r2Data.lastUpdated) setLocalLastUpdated(r2Data.lastUpdated);
          setHasCloudChanges(false);
          setHasUnpublishedChanges(false);
          
          try {
            await fetch('/api/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(r2Data)
            });
          } catch (saveErr) {
            console.error("Could not save R2 state locally:", saveErr);
          }
          
          setCloudSyncState(null);
        }}
        changes={cloudSyncState?.changes || []}
      />

      <CloudSyncChangesModal
        isOpen={cloudSyncChanges !== null}
        onClose={() => setCloudSyncChanges(null)}
        changes={cloudSyncChanges || []}
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
        getResolutionLabel={getResolutionLabel}
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
          if (e.shiftKey && lastSelectedId) {
            const startIndex = flickrPosts.findIndex(p => p.id === lastSelectedId);
            const endIndex = flickrPosts.findIndex(p => p.id === post.id);
            if (startIndex !== -1 && endIndex !== -1) {
              const start = Math.min(startIndex, endIndex);
              const end = Math.max(startIndex, endIndex);
              const range = flickrPosts.slice(start, end + 1).map(p => p.id);
              setSelectedThumbnails(prev => Array.from(new Set([...prev, ...range])));
            }
          } else {
            setSelectedThumbnails(prev => 
              prev.includes(post.id) ? prev.filter(id => id !== post.id) : [...prev, post.id]
            );
          }
          setLastSelectedId(post.id);
        }}
        reorderScrollRef={reorderScrollRef}
        isR2Fallback={isR2Fallback}
        isEmbeddedData={isEmbeddedData}
        getImageSrc={getImageSrc}
        getDisplayImage={getDisplayImage}
        setSelectedImage={setSelectedImage}
      />
    </div>
  );
}

