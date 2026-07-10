// src/components/feed/FeedPostCard.tsx
import React, { useState, useRef, useLayoutEffect, useEffect, useMemo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, Eye, GripVertical, ImageIcon, Youtube, Film, X, Maximize2, FoldVertical, Trash2, ExternalLink, Check, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { PROJECT_STATES } from '../../constants';

interface FeedPostCardProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  showResolutions: boolean;
  imageDimensions: Record<string, string>;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  formatDescription: (description: string, title: string) => string;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  handleImageUpload: (postId: string, file: File, mediaIndex?: number, isNew?: boolean) => void;
  handleVideoFileUpload: (postId: string, file: File) => void;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleVideoLinkChange: (postId: string, url: string) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  setSelectedImage: (post: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  handleToggleHidden: (postId: string) => void;
  bunnyProgress?: Record<string, { step: string; progress: number; text: string }>;
}

export function FeedPostCard({
  post, index, totalPosts, isEditing, activeUploads, showResolutions,
  imageDimensions, getDisplayImage, getImageSrc, getVideoSrc, handleImageLoad, formatDescription,
  isR2Fallback, isEmbeddedData, isValidImageCandidate,
  handleImageUpload, handleVideoFileUpload, handlePostChange, handleVideoLinkChange, handleDeletePost,
  handleMergeDown, handleUpdatePostMedia, setSelectedImage, handleStateToggle, handleToggleHidden,
  bunnyProgress
}: FeedPostCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging
  } = useSortable({ id: post.id, disabled: !isEditing });

  const getAsString = (val: any, fallbackKey?: string) => {
    if (!val) return "";
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val[fallbackKey || ''] || val.description || val.title || val.text || JSON.stringify(val);
    return String(val);
  };

  const [localTitle, setLocalTitle] = useState(() => getAsString(post.title, 'title'));
  const [localDescription, setLocalDescription] = useState(() => getAsString(post.description, 'description'));
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [feedImageDimensions, setFeedImageDimensions] = useState<string>('');
  const [thumbAvailability, setThumbAvailability] = useState<Record<number, boolean>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const rawMediaItems = useMemo(() => {
    return (post.mergedMedia && post.mergedMedia.length > 0)
      ? post.mergedMedia
      : [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, youtubeUrl: post.youtubeUrl, link: post.url }];
  }, [post.mergedMedia, post.type, post.image, post.image_large, post.youtubeId, post.youtubeUrl, post.url]);

  useEffect(() => {
    console.log(`[FeedPostCard] Syncing title for ${post.id}`);
    setLocalTitle(getAsString(post.title, 'title'));
  }, [post.title]);

  useEffect(() => {
    console.log(`[FeedPostCard] Syncing description for ${post.id}`);
    setLocalDescription(getAsString(post.description, 'description'));
  }, [post.description]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localDescription, isEditing]);

  useEffect(() => {
    let cancelled = false;

    const checkThumbs = async () => {
      const entries = await Promise.all(rawMediaItems.map(async (media: any, index: number) => {
        const thumbUrl = media?.image_thumb;
        if (!thumbUrl || media?.type === 'youtube') return [index, false] as const;
        try {
          const response = await fetch(`/api/media/exists?url=${encodeURIComponent(thumbUrl)}`);
          const data = await response.json();
          return [index, !!data.exists] as const;
        } catch {
          return [index, false] as const;
        }
      }));

      if (!cancelled) {
        setThumbAvailability(Object.fromEntries(entries));
      }
    };

    checkThumbs();
    return () => {
      cancelled = true;
    };
  }, [rawMediaItems]);

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const isRenderableMedia = (media: any) => {
    if (!media) return false;
    const hasImage = !!(media.image || media.image_thumb || media.image_1k || media.image_2k || media.image_large || media.image_preview || media.image_3k || media.image_original);
    const hasUrl = !!(media.url || media.link);
    if (media.type === 'youtube') return !!(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
    return hasImage || hasUrl || !!media.youtubeId;
  };

  const mediaItems = isEditing ? rawMediaItems : rawMediaItems.filter(isRenderableMedia);
  const renderedMediaCount = mediaItems.length;
  const displayMedia = mediaItems[0] || post;
  const feedDimensionsKey = post.id ? `${post.id}-0` : '';
  const cachedFeedDimensions = feedDimensionsKey ? (imageDimensions[feedDimensionsKey] || '') : '';
  const resolutionVariants = useMemo(() => {
    if (!displayMedia) return [];

    if (displayMedia.type === 'youtube') {
      return [{ key: 'youtube', label: 'YT' }];
    }

    const orderedVariants = [
      { key: 'image_thumb', label: 'TH' },
      { key: 'image_preview', label: 'PV' },
      { key: 'image_1k', label: '1K' },
      { key: 'image_2k', label: '2K' },
      { key: 'image_3k', label: '3K' },
      { key: 'image_large', label: 'LG' },
      { key: 'image_original', label: 'OR' },
      { key: 'image', label: 'IMG' },
    ];

    const seen = new Set<string>();
    return orderedVariants.filter(({ key }) => {
      const value = displayMedia[key];
      if (!value) return false;
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }, [displayMedia]);

  const handleFeedImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const value = `${img.naturalWidth} x ${img.naturalHeight} px`;
    setFeedImageDimensions(value);
    if (feedDimensionsKey) {
      handleImageLoad(feedDimensionsKey, e);
    }
  };

  const isVideoMediaUrl = (url?: string) =>
    !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

  const getPreviewImageSrc = (media: any, preferLarge = false) => {
    const src = getImageSrc(media, preferLarge);
    return src && !isVideoMediaUrl(src) ? src : undefined;
  };

  const getPreviewVideoSrc = (media: any, preferLarge = false) => {
    const src = getVideoSrc(media, preferLarge);
    return src && isVideoMediaUrl(src) ? src : undefined;
  };

  const [draggedMediaIdx, setDraggedMediaIdx] = useState<number | null>(null);
  const [applyLoading, setApplyLoading] = useState<Record<number, boolean>>({});
  const [localUrlInputs, setLocalUrlInputs] = useState<Record<number, string>>({});
  const [isFileDragOverCard, setIsFileDragOverCard] = useState(false);
  const cardDragDepthRef = useRef(0);
  const uploadStatusTimerRef = useRef<number | null>(null);
  const [cardUploadStatus, setCardUploadStatus] = useState<{
    phase: 'hover' | 'preparing' | 'uploading' | 'done' | 'error';
    message: string;
    count?: number;
  } | null>(null);

  useEffect(() => {
    if (!isEditing) {
      cardDragDepthRef.current = 0;
      setIsFileDragOverCard(false);
      setCardUploadStatus(null);
    }
  }, [isEditing]);

  const hasFileDrag = (e: React.DragEvent) =>
    e.dataTransfer.files.length > 0 || Array.from(e.dataTransfer.types || []).includes('Files');

  const isSupportedImageFile = (file: File) =>
    file.type.startsWith('image/') || /\.(jpe?g|png|tiff?|webp|gif|avif|bmp)$/i.test(file.name);

  const showCardFileDropTarget = () => {
    setIsFileDragOverCard(true);
    setCardUploadStatus(prev => {
      if (prev?.phase === 'preparing' || prev?.phase === 'uploading' || prev?.phase === 'hover') {
        return prev;
      }
      return {
        phase: 'hover',
        message: 'Dateien hier ablegen, um in dieses Projekt hochzuladen.'
      };
    });
  };

  const clearCardDragState = useCallback(() => {
    cardDragDepthRef.current = 0;
    setIsFileDragOverCard(false);
    setCardUploadStatus(prev => prev?.phase === 'hover' ? null : prev);
  }, []);

  const clearUploadStatusLater = useCallback((delay = 2200) => {
    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
    }
    uploadStatusTimerRef.current = window.setTimeout(() => {
      setCardUploadStatus(null);
      uploadStatusTimerRef.current = null;
    }, delay);
  }, []);

  useEffect(() => {
    const handleWindowDragEnd = () => clearCardDragState();
    const handleWindowDrop = () => clearCardDragState();

    window.addEventListener('dragend', handleWindowDragEnd);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragend', handleWindowDragEnd);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [clearCardDragState]);

  useEffect(() => {
    return () => {
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
      }
    };
  }, []);

  const queueDroppedFiles = (files: File[], sourceLabel: string) => {
    if (!isEditing) return;

    const filteredFiles = files.filter(file =>
      isSupportedImageFile(file) || file.type.startsWith('video/')
    );
    if (filteredFiles.length === 0) return;

    if (uploadStatusTimerRef.current) {
      window.clearTimeout(uploadStatusTimerRef.current);
      uploadStatusTimerRef.current = null;
    }

    setCardUploadStatus({
      phase: 'preparing',
      message: `${filteredFiles.length} Datei${filteredFiles.length === 1 ? '' : 'en'} werden vorbereitet (${sourceLabel})…`,
      count: filteredFiles.length
    });

    filteredFiles.forEach((file, index) => {
      window.setTimeout(() => {
        if (file.type.startsWith('video/')) {
          handleVideoFileUpload(post.id, file);
        } else {
          handleImageUpload(post.id, file, undefined, true);
        }
      }, index * 100);
    });
  };

  const handleCardDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current += 1;
    showCardFileDropTarget();
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    showCardFileDropTarget();
  };

  const handleCardDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    cardDragDepthRef.current = Math.max(0, cardDragDepthRef.current - 1);
    if (cardDragDepthRef.current === 0) {
      setIsFileDragOverCard(false);
    }
  };

  const handleCardDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isEditing || !hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    clearCardDragState();
    queueDroppedFiles(Array.from(e.dataTransfer.files), 'Drag & Drop');
  };

  useEffect(() => {
    const uploadingCount = activeUploads[post.id] || 0;
    if (!cardUploadStatus) return;

    if (cardUploadStatus.phase === 'preparing' && uploadingCount > 0) {
      setCardUploadStatus(prev => prev ? {
        ...prev,
        phase: 'uploading',
        message: `${uploadingCount} Datei${uploadingCount === 1 ? '' : 'en'} werden hochgeladen…`
      } : prev);
      return;
    }

    if (cardUploadStatus.phase === 'uploading') {
      if (uploadingCount > 0) {
        setCardUploadStatus(prev => prev ? {
          ...prev,
          message: `${uploadingCount} Datei${uploadingCount === 1 ? '' : 'en'} werden hochgeladen…`
        } : prev);
        return;
      }

      setCardUploadStatus({
        phase: 'done',
        message: 'Gespeichert und für R2 synchronisiert.',
        count: cardUploadStatus.count
      });
      clearUploadStatusLater();
    }
  }, [activeUploads, cardUploadStatus, clearUploadStatusLater, post.id]);

  const handleImportInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sourceLabel: string,
    options: { kind: 'image' | 'video'; mediaIndex?: number; isNew?: boolean }
  ) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    if (options.kind === 'video') {
      queueDroppedFiles(files, sourceLabel);
    } else {
      if (!isEditing) return;
      const filteredFiles = files.filter(isSupportedImageFile);
      if (filteredFiles.length === 0) return;
      if (uploadStatusTimerRef.current) {
        window.clearTimeout(uploadStatusTimerRef.current);
        uploadStatusTimerRef.current = null;
      }
      setCardUploadStatus({
        phase: 'preparing',
        message: `${filteredFiles.length} Datei${filteredFiles.length === 1 ? '' : 'en'} werden vorbereitet (${sourceLabel})…`,
        count: filteredFiles.length
      });
      filteredFiles.forEach((file, index) => {
        window.setTimeout(() => {
          handleImageUpload(post.id, file, options.mediaIndex, options.isNew);
        }, index * 100);
      });
    }
    e.target.value = '';
  };

  const updateMediaItem = (i: number, field: string, value: any) => {
    const newMedia = [...mediaItems];
    newMedia[i] = { ...newMedia[i], [field]: value };
    handleUpdatePostMedia(post.id, newMedia);
  };

  const removeMedia = (i: number) => {
    const newMedia = mediaItems.filter((_: any, idx: number) => idx !== i);
    handleUpdatePostMedia(post.id, newMedia);
  };

  const addMedia = (type: 'image' | 'youtube') => {
    const newMedia = [{ type, image: '', image_large: '', link: '', youtubeId: '', youtubeUrl: '' }, ...mediaItems];
    handleUpdatePostMedia(post.id, newMedia);
  };

  const handleMediaDragStart = (e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedMediaIdx(index);
  };

  const handleMediaDragOver = (e: React.DragEvent) => {
    // External files belong to the card upload target. Let the event bubble to
    // handleCardDragOver instead of treating it as an internal media reorder.
    if (hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMediaDrop = (e: React.DragEvent, index: number) => {
    // The card owns file uploads. Previously this handler swallowed the first
    // external drop because no internal media item was being dragged.
    if (hasFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedMediaIdx === null || draggedMediaIdx === index) return;
    
    const newMedia = [...mediaItems];
    const [draggedItem] = newMedia.splice(draggedMediaIdx, 1);
    newMedia.splice(index, 0, draggedItem);
    handleUpdatePostMedia(post.id, newMedia);
    setDraggedMediaIdx(null);
  };

  const openThumb = (thumbUrl?: string) => {
    if (!thumbUrl) return;
    const finalUrl = getDisplayImage(thumbUrl, isR2Fallback, isEmbeddedData) || thumbUrl;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  // Sync Bunny video metadata when project title/description changes
  const syncBunnyMetadata = (newTitle?: string, newDescription?: string) => {
    const mergedMedia = post.mergedMedia;
    if (!mergedMedia || mergedMedia.length === 0) return;
    const bunnyVideos = mergedMedia.filter((m: any) =>
      (m.type === 'bunny') && (m.videoId) && (m.libraryId || '')
    );
    if (bunnyVideos.length === 0) return;
    const title = newTitle !== undefined ? newTitle : localTitle;
    const desc = newDescription !== undefined ? newDescription : localDescription;
    bunnyVideos.forEach((m: any) => {
      fetch('/api/bunny/update-video-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: m.videoId,
          libraryId: m.libraryId || '',
          title: title || '',
          projectId: post.id,
          description: desc || '',
        })
      }).then(r => r.json()).then(data => {
        if (!data.success) console.warn('[bunny-meta] Update failed:', data.error);
      }).catch(() => {});
    });
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`group bg-[#111] rounded-xl overflow-hidden border ${isDragging ? 'border-blue-500 shadow-xl shadow-black/50' : 'border-white/5 hover:border-white/20'} transition-all duration-300 flex flex-col relative ${isFileDragOverCard ? 'ring-2 ring-blue-400/50 ring-offset-0' : ''}`}
      onDragEnter={handleCardDragEnter}
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
    >
      {isEditing && isFileDragOverCard && cardUploadStatus?.phase === 'hover' && (
        <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none">
          <div className="rounded-2xl border border-blue-400/40 bg-black/55 backdrop-blur-md px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-3">
              <Upload className="w-5 h-5 text-blue-300 animate-bounce shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-100">Files can be dropped here</div>
                <div className="text-[11px] sm:text-xs text-blue-100/70 truncate">
                  {cardUploadStatus.message}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {isEditing && (
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); handleToggleHidden(post.id); }}
            className={`p-1.5 rounded transition-all shadow-lg backdrop-blur-sm bg-white/30 hover:bg-white/40 text-white ${isDragging ? 'pointer-events-none' : ''}`}
            title={post.hidden ? "Anzeigen" : "Verstecken"}
          >
            <Eye className={`w-4 h-4 ${post.hidden ? 'opacity-100' : 'opacity-70'}`} />
          </button>
        </div>
      )}
      {isEditing && (
        <div 
          {...attributes} 
          {...listeners}
          className="absolute top-2 right-2 z-20 bg-white/30 p-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-white/40 transition-colors shadow-lg backdrop-blur-sm"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-white/70" />
        </div>
      )}
      <div 
        className={`relative ${(!isEditing && renderedMediaCount > 1) || isEditing ? 'h-auto min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar' : 'aspect-[4/3] overflow-hidden'} cursor-pointer bg-black/50 shrink-0 ${isEditing && post.hidden ? 'grayscale brightness-50' : ''} ${isDragging ? 'pointer-events-none' : ''}`}
        onClick={() => {
          if (!isEditing) setSelectedImage(post);
        }}
      >
        {isEditing && showResolutions && resolutionVariants.length > 0 && (
          <div className="absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
              {resolutionVariants.map(({ key, label }) => (
                <span
                  key={`${post.id}-${key}`}
                  className="inline-flex items-center gap-1 rounded-full bg-black/70 border border-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-md shadow-lg"
                >
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {isEditing ? (
          <div className={`flex flex-col gap-2 p-2 ${isDragging ? 'pointer-events-none' : ''}`}>
            <div className="flex gap-2 mb-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
              <label
                className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs cursor-pointer transition-colors min-w-[100px]"
                onClick={(e) => e.stopPropagation()}
              >
                <ImageIcon className="w-3 h-3" /> + Bild
                <input 
                  type="file" 
                  accept="image/*,.png,.tif,.tiff"
                  multiple
                  className="hidden" 
                  onChange={(e) => {
                    handleImportInputChange(e, '+ Bild', { kind: 'image', isNew: true });
                  }}
                />
              </label>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  addMedia('youtube');
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs transition-colors min-w-[100px]"
              >
                <Youtube className="w-3 h-3" /> + Video (URL)
              </button>
              <label
                className="flex-1 flex items-center justify-center gap-2 bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1.5 text-xs cursor-pointer transition-colors min-w-[100px]"
                onClick={(e) => e.stopPropagation()}
              >
                <Film className="w-3 h-3" /> + Video (Datei)
                <input 
                  type="file" 
                  accept="video/*" 
                  multiple
                  className="hidden" 
                  onChange={(e) => {
                    handleImportInputChange(e, '+ Video (Datei)', { kind: 'video' });
                  }}
                />
              </label>
            </div>
            {mediaItems.map((media: any, i: number) => (
              <div 
                key={i} 
                className="relative w-full bg-black/30 border border-white/10 rounded p-2"
                draggable
                onDragStart={(e) => handleMediaDragStart(e, i)}
                onDragOver={handleMediaDragOver}
                onDrop={(e) => handleMediaDrop(e, i)}
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); removeMedia(i); }}
                  className="absolute top-1 right-1 z-10 bg-white/30 hover:bg-white/40 text-white p-1 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center gap-2 mb-2 pr-8">
                  <GripVertical className="w-4 h-4 text-white/30 cursor-grab" />
                  <span className="text-xs text-white/50">{media.type === 'youtube' ? 'YouTube' : media.type === 'bunny' ? 'Bunny' : media.type === 'video' ? 'Video' : 'Bild'}</span>
                  {media.type !== 'youtube' && media.image_thumb && thumbAvailability[i] && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openThumb(media.image_thumb);
                      }}
                      className="w-5 h-5 rounded-md bg-white/30 hover:bg-white/40 text-white flex items-center justify-center transition-colors border border-white/20"
                      title="Thumbnail öffnen"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                {media.type === 'youtube' || media.type === 'bunny' ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex gap-1">
                      <input
                        type="text"
                          value={localUrlInputs[i] ?? (media.youtubeUrl || media.url || '')}
                          onChange={(e) => {
                            setLocalUrlInputs(prev => ({ ...prev, [i]: e.target.value }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const url = localUrlInputs[i] ?? (media.youtubeUrl || media.url || '');
                            if (url.trim()) {
                              handleVideoLinkChange(post.id, url);
                              // Also update the media item's displayed URL immediately
                              updateMediaItem(i, 'url', url);
                            }
                          }
                        }}
                        className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/40"
                        placeholder="YouTube oder Bunny URL einfügen..."
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                            const url = (localUrlInputs[i] ?? (media.youtubeUrl || media.url || '')).trim();
                          if (!url) return;
                          setApplyLoading(prev => ({ ...prev, [i]: true }));

                          // Detect YouTube
                          const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                          const ytMatch = url.match(ytRegExp);
                          const youtubeId = (ytMatch && ytMatch[2].length === 11) ? ytMatch[2] : null;

                          // Detect Bunny
                          const bunnyRegExp = /video\.bunnycdn\.com\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
                          const bunnyMatch = url.match(bunnyRegExp);
                          let bunnyLibraryId: string | null = null;
                          let bunnyVideoId: string | null = null;
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
                            // Bunny video: optimistic update + background sync
                            const newMedia = [...mediaItems];
                            newMedia[i] = { ...media, type: 'bunny', libraryId: bunnyLibraryId, videoId: bunnyVideoId, url };
                            handleUpdatePostMedia(post.id, newMedia);

                            fetch('/api/bunny/sync-video', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ libraryId: bunnyLibraryId, videoId: bunnyVideoId })
                            }).then(res => res.json()).then(data => {
                              setApplyLoading(prev => ({ ...prev, [i]: false }));
                              if (data.success) {
                                const syncedMedia = [...mediaItems];
                                syncedMedia[i] = {
                                  ...syncedMedia[i],
                                  image: data.url,
                                  image_thumb: data.image_thumb || data.url,
                                  image_1k: data.image_1k,
                                  image_2k: data.image_2k,
                                  image_3k: data.image_3k,
                                  duration: data.duration
                                };
                                handleUpdatePostMedia(post.id, syncedMedia);
                              }
                            }).catch(() => setApplyLoading(prev => ({ ...prev, [i]: false })));
                          } else if (youtubeId) {
                            // YouTube: apply immediately
                            const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
                            const newMedia = [...mediaItems];
                            newMedia[i] = { ...media, type: 'youtube', youtubeUrl: url, youtubeId, image: thumbnailUrl, image_large: thumbnailUrl, url };
                            handleUpdatePostMedia(post.id, newMedia);
                            setApplyLoading(prev => ({ ...prev, [i]: false }));
                          } else {
                            // Unknown: just store URL
                            updateMediaItem(i, 'url', url);
                            setApplyLoading(prev => ({ ...prev, [i]: false }));
                          }
                        }}
                        disabled={applyLoading[i]}
                        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="URL anwenden"
                      >
                        {applyLoading[i] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        <span>Anwenden</span>
                      </button>
                    </div>
                    {applyLoading[i] && (
                      <div className="flex items-center gap-1 text-white/50 text-[10px]">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>Bunny Metadaten werden geladen…</span>
                      </div>
                    )}
                  </div>
                ) : media.type === 'video' ? (
                  <div className="flex flex-col gap-1 mb-2">
                    <div className="flex items-center gap-1 mb-1">
                      <div className="flex items-center gap-1 bg-white/10 rounded px-2 py-1 text-xs text-white/60 flex-1">
                        <Film className="w-3 h-3 text-white/40" />
                        <span className="truncate">{media.url ? media.url.split('/').pop() : 'Video-Datei'}</span>
                        {!media.image_thumb && !media.image && (
                          <span className="text-yellow-400/60 ml-1">(kein Thumbnail)</span>
                        )}
                      </div>
                      <label className="flex items-center gap-1 bg-white/20 hover:bg-white/30 border border-white/20 rounded px-2 py-1 text-xs text-white cursor-pointer transition-colors">
                        <ImageIcon className="w-3 h-3" /> Ändern
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            handleImportInputChange(e, 'Video ersetzen', { kind: 'video' });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="block w-full text-center bg-white/30 hover:bg-white/40 border border-white/20 rounded py-1 mb-2 text-xs cursor-pointer transition-colors">
                    Bild ändern
                    <input 
                      type="file" 
                      accept="image/*,.png,.tif,.tiff"
                      className="hidden" 
                      onChange={(e) => {
                        handleImportInputChange(e, 'Bild ersetzen', { kind: 'image', mediaIndex: i });
                      }}
                    />
                  </label>
                )}
                {media.image || media.image_preview || media.url ? (
                  media.type === 'video' ? (
                    getPreviewImageSrc(media) ? (
                      <img
                        src={getDisplayImage(getPreviewImageSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)}
                        alt=""
                        className="w-full h-24 object-cover rounded cursor-pointer"
                        onClick={() => setSelectedImage(post)}
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = 'none';
                          const next = img.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'flex';
                        }}
                      />
                    ) : getPreviewVideoSrc(media) ? (
                      <video
                        src={getDisplayImage(getPreviewVideoSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)}
                        className="w-full h-24 object-cover rounded cursor-pointer"
                        autoPlay
                        loop
                        muted
                        playsInline
                        onClick={() => setSelectedImage(post)}
                      />
                    ) : (
                      <>
                        <div className="w-full h-24 bg-white/10 rounded flex items-center justify-center text-white/40">
                          <Film className="w-6 h-6" />
                        </div>
                      </>
                    )
                  ) : getVideoSrc(media) ? (
                    <video 
                      src={getDisplayImage(getVideoSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)} 
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      autoPlay loop muted playsInline
                      onClick={() => setSelectedImage(post)}
                    />
                  ) : (
                    <img 
                      src={getDisplayImage(getImageSrc(media) ?? undefined, isR2Fallback, isEmbeddedData)} 
                      alt="" 
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      onClick={() => setSelectedImage(post)}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.includes('maxresdefault.jpg')) {
                          target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                        } else if (media.image_preview && target.src !== getDisplayImage(media.image_preview, isR2Fallback, isEmbeddedData)) {
                          target.src = getDisplayImage(media.image_preview, isR2Fallback, isEmbeddedData) || '';
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="w-full h-24 bg-white/10 rounded flex items-center justify-center text-white/40">
                    {media.type === 'youtube' ? <Youtube className="w-6 h-6" /> : media.type === 'video' ? <Film className="w-6 h-6" /> : media.type === 'bunny' ? <Youtube className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            {displayMedia.image || displayMedia.image_preview || displayMedia.url ? (
              displayMedia.type === 'video' ? (
                getPreviewImageSrc(displayMedia) ? (
                  <img
                    src={getDisplayImage(getPreviewImageSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)}
                    alt={post.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${!isEditing ? 'group-hover:scale-[1.03]' : ''}`}
                    onLoad={handleFeedImageLoad}
                    onClick={() => setSelectedImage(post)}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (displayMedia.image_preview && target.src !== getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData)) {
                        target.src = getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData) || '';
                      }
                    }}
                  />
                ) : getPreviewVideoSrc(displayMedia) ? (
                  <video
                    src={getDisplayImage(getPreviewVideoSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)}
                    className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${!isEditing ? 'group-hover:scale-[1.03]' : ''}`}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onClick={() => setSelectedImage(post)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <Film className="w-12 h-12" />
                  </div>
                )
              ) : getVideoSrc(displayMedia) ? (
                <video 
                  src={getDisplayImage(getVideoSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)} 
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${!isEditing ? 'group-hover:scale-[1.03]' : ''}`}
                  autoPlay loop muted playsInline
                  onClick={() => setSelectedImage(post)}
                />
              ) : (
                <img 
                  src={getDisplayImage(getImageSrc(displayMedia) ?? undefined, isR2Fallback, isEmbeddedData)} 
                  alt={post.title} 
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-500 ease-out cursor-pointer ${!isEditing ? 'group-hover:scale-[1.03]' : ''}`}
                  onLoad={handleFeedImageLoad}
                  onClick={() => setSelectedImage(post)}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.includes('maxresdefault.jpg')) {
                      target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                    } else if (displayMedia.image_preview && target.src !== getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData)) {
                      target.src = getDisplayImage(displayMedia.image_preview, isR2Fallback, isEmbeddedData) || '';
                    }
                  }}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                {displayMedia.type === 'video' ? <Film className="w-12 h-12" /> : <ImageIcon className="w-12 h-12" />}
              </div>
            )}
            
            {(displayMedia.type === 'youtube' || displayMedia.type === 'bunny' || displayMedia.type === 'video') && !isEditing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 bg-white/30 hover:bg-white/40 rounded-full flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedImage(post); }}>
                  {displayMedia.type === 'video' ? <Film className="w-8 h-8 text-white" /> : <Youtube className="w-8 h-8 text-white ml-1" />}
                </div>
              </div>
            )}

            {!isEditing && renderedMediaCount > 1 && (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full z-10">
                +{renderedMediaCount - 1}
              </div>
            )}
          </>
        )}
        
        {isEditing && (activeUploads[post.id] > 0 || (cardUploadStatus && cardUploadStatus.phase !== 'hover')) && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 px-4 text-center">
            {cardUploadStatus?.phase === 'done' ? (
              <CheckCircle2 className="w-8 h-8 text-green-400 mb-2" />
            ) : cardUploadStatus?.phase === 'error' ? (
              <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
            )}
            <span className={`text-xs sm:text-sm ${cardUploadStatus?.phase === 'done' ? 'text-green-300' : cardUploadStatus?.phase === 'error' ? 'text-red-300' : 'text-white/70'}`}>
              {cardUploadStatus?.message || `Lädt hoch... (${activeUploads[post.id]})`}
            </span>
          </div>
        )}
      </div>
      {/* Bunny Upload Progress Bar */}
      {bunnyProgress?.[post.id] && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 mb-1">
            {bunnyProgress[post.id].step !== 'done' && bunnyProgress[post.id].step !== 'error' ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            ) : bunnyProgress[post.id].step === 'done' ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <span className="text-red-400 text-xs">⚠</span>
            )}
            <span className={`text-xs ${bunnyProgress[post.id].step === 'done' ? 'text-green-400' : bunnyProgress[post.id].step === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
              {bunnyProgress[post.id].text}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                bunnyProgress[post.id].step === 'error' ? 'bg-red-500' :
                bunnyProgress[post.id].step === 'done' ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${bunnyProgress[post.id].progress}%` }}
            />
          </div>
        </div>
      )}
      <div className={`p-4 flex flex-col gap-2 flex-grow ${isDragging ? 'pointer-events-none' : ''}`}>
        {isEditing ? (
          <>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => {
                const oldTitle = (typeof post.title === 'string' ? post.title : (post.title?.title || ''));
                const newTitle = localTitle.trim();
                handlePostChange(post.id, 'title', localTitle);
                // Trigger project folder rename if title changed
                if (newTitle !== oldTitle && oldTitle !== undefined && post.mergedMedia?.length > 0) {
                  const hasVideo = post.mergedMedia.some((m: any) => 
                    (m.type === 'video' || m.type === 'bunny') && m.image_original
                  );
                  if (hasVideo) {
                    fetch('/api/rename-project-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId: post.id, oldName: oldTitle, newName: newTitle })
                    }).then(r => r.json()).then(data => {
                      if (data.changed) console.log(`[rename] Project folder renamed: ${data.renamed} dirs updated`);
                    }).catch(() => {});
                  }
                }
                // Sync Bunny video metadata with new title
                if (newTitle !== oldTitle) syncBunnyMetadata(newTitle);
              }}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-white/30"
              placeholder="Titel..."
            />
            <textarea
              ref={textareaRef}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => {
                const oldDesc = (typeof post.description === 'string' ? post.description : (post.description?.description || ''));
                handlePostChange(post.id, 'description', localDescription);
                // Sync Bunny video metadata with new description
                const newDesc = localDescription.trim();
                if (newDesc !== oldDesc) syncBunnyMetadata(undefined, newDesc);
              }}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/30 min-h-[80px]"
              placeholder="Beschreibung..."
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {PROJECT_STATES.map(s => {
                const isActive = (post.states || []).map((state: string) => String(state).toLowerCase()).includes(String(s.id).toLowerCase());
                const isHovered = hoveredState === s.id;
                const isBright = isActive || isHovered;
                return (
                  <button
                    key={s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStateToggle(post.id, s.id);
                    }}
                    onMouseEnter={() => setHoveredState(s.id)}
                    onMouseLeave={() => setHoveredState(null)}
                    className="px-2 py-0.5 rounded text-[10px] font-medium transition-all duration-300"
                    title={s.tooltip}
                    style={{
                      backgroundColor: isActive ? s.bright : (isHovered ? s.muted : '#1f2937'),
                      color: (isActive || isHovered) ? 'white' : '#9ca3af',
                      boxShadow: isActive ? `0 0 10px ${s.bright}` : (isHovered ? `0 0 5px ${s.muted}` : 'none'),
                      opacity: isHovered && !isActive ? 0.8 : 1
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSelectedImage(post)}
              className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
            >
              <Maximize2 className="w-3 h-3" /> Lightbox Editor
            </button>
            <button
              onClick={() => handleDeletePost(post.id)}
              className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Post löschen
            </button>
            {index < totalPosts - 1 && (
              <button
                onClick={() => handleMergeDown(index)}
                className="mt-2 flex items-center justify-center gap-2 w-full bg-white/30 hover:bg-white/40 text-white border border-white/20 rounded py-1.5 text-xs transition-colors"
                title="Mit dem nächsten Post zusammenlegen"
              >
                <FoldVertical className="w-3 h-3" /> Mit nächstem zusammenlegen
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="font-medium text-sm text-white/90 line-clamp-2" title={localTitle}>
              {localTitle}
            </h2>
            {localDescription && (
              <div 
                className="text-xs text-white/60 line-clamp-3 mt-1"
                dangerouslySetInnerHTML={{ __html: formatDescription(localDescription, localTitle) }}
              />
            )}
            {post.states && post.states.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.states.map((stateId: string, idx: number) => {
                  const state = PROJECT_STATES.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                  if (!state) return null;
                  return (
                    <span 
                      key={`${stateId}-${idx}`}
                      className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
                      title={state.tooltip}
                      style={{ backgroundColor: state.bright }}
                    >
                      {state.label}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
        
        <div className="flex items-center justify-between mt-auto pt-4">
          <span className="text-xs text-white/40 uppercase tracking-wider">{post.network_name}</span>
          <a 
            href={post.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white transition-colors"
            title="Auf Flickr ansehen"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
