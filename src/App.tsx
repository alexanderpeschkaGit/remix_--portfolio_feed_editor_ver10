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

const formatDescription = (description: string, title: string) => {
  let text = description;
  
  // Remove emojis
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/gu, '');
  
  // Remove hashtags
  text = text.replace(/#\w+/g, '');
  
  // Remove title if it appears
  if (title) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escapedTitle, 'gi'), '');
  }
  
  return text.replace(/\s+/g, ' ').trim();
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

const getImageSrc = (media: any, preferLarge = false) => {
  const primary = preferLarge
    ? [media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl, media?.image, media?.image_preview]
    : [media?.image, media?.image_preview, media?.image_3k, media?.image_large, media?.imageLarge, media?.largeUrl];
  for (const candidate of primary) {
    if (candidate) return candidate;
  }
  return isDirectMediaFile(media?.url) ? media.url : undefined;
};

const getVideoSrc = (media: any, preferLarge = false) => {
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

function SortablePost({ post, index, totalPosts, isEditing, activeUploads, showResolutions, handleImageUpload, handlePostChange, handleYoutubeChange, handleDeletePost, handleMergeDown, handleUpdatePostMedia, setSelectedImage, handleStateToggle, handleToggleHidden, getDisplayImage, isR2Fallback, isEmbeddedData }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: post.id, disabled: !isEditing });

  const [localTitle, setLocalTitle] = useState(post.title);
  const [localDescription, setLocalDescription] = useState(post.description);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [feedImageDimensions, setFeedImageDimensions] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFeedImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setFeedImageDimensions(`${img.naturalWidth} x ${img.naturalHeight} px`);
  };

  useEffect(() => {
    setLocalTitle(post.title);
  }, [post.title]);

  useEffect(() => {
    setLocalDescription(post.description);
  }, [post.description]);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localDescription, isEditing]);

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const displayMedia = post.mergedMedia && post.mergedMedia.length > 0 ? post.mergedMedia[0] : post;

  const mediaItems = post.mergedMedia || [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, youtubeUrl: post.youtubeUrl, link: post.url }];

  const [draggedMediaIdx, setDraggedMediaIdx] = useState<number | null>(null);

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
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMediaDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedMediaIdx === null || draggedMediaIdx === index) return;
    
    const newMedia = [...mediaItems];
    const [draggedItem] = newMedia.splice(draggedMediaIdx, 1);
    newMedia.splice(index, 0, draggedItem);
    handleUpdatePostMedia(post.id, newMedia);
    setDraggedMediaIdx(null);
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`group bg-[#111] rounded-xl overflow-hidden border ${isDragging ? 'border-blue-500 shadow-xl shadow-black/50' : 'border-white/5 hover:border-white/20'} transition-all duration-300 flex flex-col relative`}
    >
      {isEditing && (
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); handleToggleHidden(post.id); }}
            className={`p-1.5 rounded transition-all shadow-lg backdrop-blur-sm ${post.hidden ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-white'}`}
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
          className="absolute top-2 right-2 z-20 bg-black/50 p-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-black/80 transition-colors shadow-lg backdrop-blur-sm"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-white/70" />
        </div>
      )}
      <div 
        className={`relative ${(!isEditing && post.mergedMedia && post.mergedMedia.length > 1) || isEditing ? 'h-auto min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar' : 'aspect-[4/3] overflow-hidden'} cursor-pointer bg-black/50 shrink-0 ${isEditing && post.hidden ? 'grayscale brightness-50' : ''}`}
        onClick={() => setSelectedImage(post)}
      >
        {(showResolutions || isEditing) && (
          <div className="absolute top-2 left-2 z-20 bg-blue-600/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg backdrop-blur-sm flex flex-col gap-0">
            <span>{getResolutionLabel(displayMedia, feedImageDimensions)}</span>
            {feedImageDimensions && (
              <span className="opacity-80 text-[7px] border-t border-white/10 mt-0.5 pt-0.5">{feedImageDimensions}</span>
            )}
          </div>
        )}
        {isEditing ? (
          <div className="flex flex-col gap-2 p-2">
            <div className="flex gap-2 mb-2">
              <label className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1.5 text-xs cursor-pointer transition-colors">
                <ImageIcon className="w-3 h-3" /> + Bild
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files) {
                      Array.from(e.target.files).forEach(file => {
                        handleImageUpload(post.id, file, undefined, true);
                      });
                    }
                  }}
                />
              </label>
              <button 
                onClick={() => addMedia('youtube')}
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1.5 text-xs transition-colors"
              >
                <Youtube className="w-3 h-3" /> + YouTube
              </button>
            </div>
            {mediaItems.map((media: any, i: number) => (
              <div 
                key={i} 
                className="relative w-full bg-black/30 border border-white/10 rounded p-2"
                draggable
                onDragStart={(e) => handleMediaDragStart(e, i)}
                onDragOver={handleMediaDragOver}
                onDrop={(e) => handleMediaDrop(e, i)}
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); removeMedia(i); }}
                  className="absolute top-1 right-1 z-10 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <GripVertical className="w-4 h-4 text-white/30 cursor-grab" />
                  <span className="text-xs text-white/50">{media.type === 'youtube' ? 'YouTube' : 'Bild'}</span>
                </div>
                {media.type === 'youtube' ? (
                  <input
                    type="text"
                    value={media.youtubeUrl || ''}
                    onChange={(e) => {
                      const url = e.target.value;
                      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                      const match = url.match(regExp);
                      const youtubeId = (match && match[2].length === 11) ? match[2] : null;
                      if (youtubeId) {
                        const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
                        const newMedia = [...mediaItems];
                        newMedia[i] = { ...media, youtubeUrl: url, youtubeId, image: thumbnailUrl, image_large: thumbnailUrl, url: url };
                        handleUpdatePostMedia(post.id, newMedia);
                      } else {
                        updateMediaItem(i, 'youtubeUrl', url);
                      }
                    }}
                    className="w-full bg-black/50 border border-red-500/30 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-red-500/60 mb-2"
                    placeholder="YouTube URL einfügen..."
                  />
                ) : (
                  <label className="block w-full text-center bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1 mb-2 text-xs cursor-pointer transition-colors">
                    Bild ändern
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleImageUpload(post.id, e.target.files[0], i);
                        }
                      }}
                    />
                  </label>
                )}
                {media.image || media.image_preview || media.url ? (
                  media.type === 'video' || (media.image && media.image.endsWith('.mp4')) ? (
                    <video 
                      src={getDisplayImage(getVideoSrc(media), isR2Fallback, isEmbeddedData)} 
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      autoPlay 
                      loop 
                      muted 
                      playsInline
                      onClick={() => setSelectedImage(post)}
                    />
                  ) : (
                    <img 
                      src={getDisplayImage(getImageSrc(media), isR2Fallback, isEmbeddedData)} 
                      alt="" 
                      className="w-full h-24 object-cover rounded cursor-pointer"
                      onClick={() => setSelectedImage(post)}
                      onError={(e) => {
                        if (media.image_preview && e.currentTarget.src !== media.image_preview) {
                          e.currentTarget.src = media.image_preview;
                        }
                      }}
                    />
                  )
                ) : (
                  <div className="w-full h-24 bg-white/5 rounded flex items-center justify-center text-white/20">
                    {media.type === 'youtube' ? <Youtube className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <>
            {displayMedia.image || displayMedia.image_preview || displayMedia.url ? (
              displayMedia.type === 'video' || (displayMedia.image && displayMedia.image.endsWith('.mp4')) ? (
                <video 
                  src={getDisplayImage(getVideoSrc(displayMedia), isR2Fallback, isEmbeddedData)} 
                  className={`w-full h-full object-cover transition-transform duration-700 ${!isEditing ? 'group-hover:scale-110' : ''}`}
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                />
              ) : (
                <img 
                  src={getDisplayImage(getImageSrc(displayMedia), isR2Fallback, isEmbeddedData)} 
                  alt={post.title} 
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className={`w-full h-full object-cover transition-transform duration-700 ${!isEditing ? 'group-hover:scale-110' : ''}`}
                  onLoad={handleFeedImageLoad}
                  onError={(e) => {
                    if (displayMedia.image_preview && e.currentTarget.src !== displayMedia.image_preview) {
                      e.currentTarget.src = displayMedia.image_preview;
                    }
                  }}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                <ImageIcon className="w-12 h-12" />
              </div>
            )}
            
            {displayMedia.type === 'youtube' && !isEditing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                  <Youtube className="w-8 h-8 text-white ml-1" />
                </div>
              </div>
            )}

            {post.mergedMedia && post.mergedMedia.length > 1 && (
              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full z-10">
                +{post.mergedMedia.length - 1}
              </div>
            )}

            {!isEditing && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <Maximize2 className="w-8 h-8 text-white/80" />
              </div>
            )}
          </>
        )}
        
        {isEditing && activeUploads[post.id] > 0 && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
            <span className="text-xs text-white/70">Lädt hoch... ({activeUploads[post.id]})</span>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2 flex-grow">
        {isEditing ? (
          <>
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={() => handlePostChange(post.id, 'title', localTitle)}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-white/30"
              placeholder="Titel..."
            />
            <textarea
              ref={textareaRef}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => handlePostChange(post.id, 'description', localDescription)}
              className="w-full bg-black/50 border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-white/30 min-h-[80px]"
              placeholder="Beschreibung..."
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {PROJECT_STATES.map(s => {
                const isActive = post.states?.includes(s.id);
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
              className="mt-2 flex items-center justify-center gap-2 w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded py-1.5 text-xs transition-colors"
            >
              <Maximize2 className="w-3 h-3" /> Lightbox Editor
            </button>
            <button
              onClick={() => handleDeletePost(post.id)}
              className="mt-2 flex items-center justify-center gap-2 w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded py-1.5 text-xs transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Post löschen
            </button>
            {index < totalPosts - 1 && (
              <button
                onClick={() => handleMergeDown(index)}
                className="mt-2 flex items-center justify-center gap-2 w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded py-1.5 text-xs transition-colors"
                title="Mit dem nächsten Post zusammenlegen"
              >
                <FoldVertical className="w-3 h-3" /> Mit nächstem zusammenlegen
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="font-medium text-sm text-white/90 line-clamp-2" title={post.title}>
              {post.title}
            </h2>
            {post.description && (
              <div 
                className="text-xs text-white/60 line-clamp-3 mt-1"
                dangerouslySetInnerHTML={{ __html: formatDescription(post.description, post.title) }}
              />
            )}
            {post.states && post.states.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {post.states.map((stateId: string) => {
                  const state = PROJECT_STATES.find(s => s.id === stateId);
                  if (!state) return null;
                  return (
                    <span 
                      key={state.id}
                      className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
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

export default function App() {
  const [flickrPosts, setFlickrPosts] = useState<any[]>([]);
  const [past, setPast] = useState<any[][]>([]);
  const [future, setFuture] = useState<any[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
  const [isReorderView, setIsReorderView] = useState(false);
  const [selectedThumbnails, setSelectedThumbnails] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<{url: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<string[]>([]);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [autoUpload, setAutoUpload] = useState(false);
  const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null, progress: 0, total: 0 });
  const [uncertainMatches, setUncertainMatches] = useState<any[]>([]);
  const [showUncertain, setShowUncertain] = useState(false);

  const handleFullR2Sync = async () => {
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
      setFullR2SyncStatus(prev => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleResetAll = async () => {
    if (isResettingAll) return;
    const confirm = window.confirm(
      'ACHTUNG: Das löscht lokal ALLES (data/, originals/, backups/) und löscht auch den kompletten R2-Bucket-Inhalt.\n\n' +
      'Danach ist das Projekt leer und du musst neu scrapen.\n\n' +
      'Wirklich fortfahren?'
    );
    if (!confirm) return;

    setIsResettingAll(true);
    setError('');
    try {
      // Disable fallback so we don't repopulate from R2/test data after wiping.
      setFallbackEnabled(false);
      await fetch('/api/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'YES' })
      });
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'Reset fehlgeschlagen');
      setIsResettingAll(false);
    }
  };
  const [activeId, setActiveId] = useState<string | null>(null);
  const reorderScrollRef = useRef<HTMLDivElement>(null);
  const [portfolioTitle, setPortfolioTitle] = useState("ProjectionArt by Vijay Sikanda");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState("immersive projection experience");
  const [igAccount, setIgAccount] = useState("vijay_sikanda");
  const [flickrUrl, setFlickrUrl] = useState("https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/");
  const [publicDomain, setPublicDomain] = useState<string | null>(null);
  const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
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
                updatePosts(stateData.items);
                setIsFlickrFallback(false);
                
                if (autoUpload) {
                  setScrapeLogs(prev => [...prev, "Starte automatischen Upload..."]);
                  setTimeout(() => {
                    const uploadBtn = document.getElementById('upload-btn');
                    if (uploadBtn) uploadBtn.click();
                  }, 500);
                }
                
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
              updatePosts(stateData.items);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setSyncStatus(prev => ({ ...prev, running: false, error: error.message }));
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
        setFlickrPosts(stateData.items);
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
        if (stateData.scrapeConfig) {
          if (stateData.scrapeConfig.igAccount) setIgAccount(stateData.scrapeConfig.igAccount);
          if (stateData.scrapeConfig.flickrUrl) setFlickrUrl(stateData.scrapeConfig.flickrUrl);
        }
        if (stateData.items && stateData.items.length > 0) {
          setFlickrPosts(stateData.items);
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
            if (r2Data.scrapeConfig) {
              if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
              if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
            }
            
            const items = r2Data.items || r2Data.posts || [];
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
          });
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
          scrapeConfig: {
            igAccount,
            flickrUrl
          }
        })
      }).catch(console.error);
    }
  }, [flickrPosts, portfolioTitle, portfolioSubtitle, igAccount, flickrUrl, isInitialized, uploadingCount]);

  useEffect(() => {
    (window as any).portfolioData = {
      title: portfolioTitle,
      subtitle: portfolioSubtitle,
      projectStates: PROJECT_STATES,
      posts: flickrPosts,
      publicDomain: R2_CONFIG.publicDomain
    };
  }, [flickrPosts, portfolioTitle, portfolioSubtitle]);

  const updatePosts = (newPosts: any[] | ((p: any[]) => any[])) => {
    setFlickrPosts(current => {
      const next = typeof newPosts === 'function' ? newPosts(current) : newPosts;
      setPast(p => [...p, current].slice(-50)); // Keep last 50 states
      setFuture([]); // Clear future on new action
      return next;
    });
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const current = flickrPosts;
    const previous = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [...f, current].slice(-50));
    setFlickrPosts(previous);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const current = flickrPosts;
    const next = future[future.length - 1];
    setFuture(f => f.slice(0, -1));
    setPast(p => [...p, current].slice(-50));
    setFlickrPosts(next);
  };

  const handleToggleHidden = (postId: string) => {
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        return { ...post, hidden: !post.hidden };
      }
      return post;
    }));
  };

  const handleStateToggle = (postId: string, stateId: string) => {
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(postId)) {
        const states = post.states || [];
        const newStates = states.includes(stateId) 
          ? states.filter((s: string) => s !== stateId)
          : [...states, stateId];
        return { ...post, states: newStates };
      }
      return post;
    }));
  };

  const handlePostChange = (id: string, field: string, value: string) => {
    updatePosts(posts => posts.map(post => 
      String(post.id) === String(id) ? { ...post, [field]: value } : post
    ));
  };

  const handleAddNewPost = () => {
    const newPost = {
      id: `custom-${Date.now()}`,
      title: '',
      description: '',
      image: '',
      image_large: '',
      url: '',
      network_name: 'Custom',
      type: 'image'
    };
    updatePosts([newPost, ...flickrPosts]);
    setIsEditing(true);
  };

  const handleDeletePost = (id: string) => {
    const deletedIds = [String(id)];
    updatePosts(posts => sanitizePostsAfterDeletion(posts, deletedIds));
  };

  const handleMergeDown = (index: number) => {
    updatePosts(posts => {
      const newPosts = [...posts];
      const current = newPosts[index];
      const next = newPosts[index + 1];
      
      if (!next) return posts;

      const mergedMedia = [
        ...(current.mergedMedia || [{ type: current.type || 'image', image: current.image, image_large: current.image_large, youtubeId: current.youtubeId, link: current.url }]),
        ...(next.mergedMedia || [{ type: next.type || 'image', image: next.image, image_large: next.image_large, youtubeId: next.youtubeId, link: next.url }])
      ].filter(m => m.image || m.youtubeId);

      const mergedDescription = [current.description, next.description].filter(Boolean).join('<br/><br/>');

      newPosts[index] = {
        ...current,
        description: mergedDescription,
        mergedMedia
      };

      newPosts.splice(index + 1, 1);
      return newPosts;
    });
  };

  const handleUpdatePostMedia = (id: string, newMedia: any[]) => {
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
    }));
  };

  const handleMoveToTarget = (targetId: string) => {
    const selectedPosts = flickrPosts.filter(p => selectedThumbnails.includes(p.id));
    const remainingPosts = flickrPosts.filter(p => !selectedThumbnails.includes(p.id));
    
    const targetIndex = remainingPosts.findIndex(p => String(p.id) === String(targetId));
    
    if (targetIndex === -1) {
      // If target not found, just append to the end
      updatePosts([...remainingPosts, ...selectedPosts]);
    } else {
      // Insert selected items AFTER the target item
      const newPosts = [
        ...remainingPosts.slice(0, targetIndex + 1),
        ...selectedPosts,
        ...remainingPosts.slice(targetIndex + 1)
      ];
      updatePosts(newPosts);
    }
    
    setIsMoving(false);
    setSelectedThumbnails([]);
    setLastSelectedId(null);
  };

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
    
    const localUrl = URL.createObjectURL(file);
    const uploadId = Math.random().toString(36).substring(7); // Unique ID for this specific upload
    
    const cleanOldUrls = (obj: any) => {
      const { largeUrl, url, url_o, url_l, url_q, url_sq, url_m, local_highres, image_3k, ...rest } = obj;
      return rest;
    };
    
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        if (isNew) {
          const newItem: any = { uploadId, type: 'image', image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl };
          const newMedia = post.mergedMedia ? [newItem, ...post.mergedMedia] : [newItem, { type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, link: post.url }];
          return { ...cleanOldUrls(post), image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl, mergedMedia: newMedia };
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
          const newMedia = [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, link: post.url }];
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
        }
        return { ...cleanOldUrls(post), image: localUrl, image_large: localUrl, image_preview: localUrl, image_3k: localUrl, type: 'image' };
      }
      return post;
    }));

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
          if (post.mergedMedia) {
            const newMedia = [...post.mergedMedia];
            const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId);
            
            if (itemIdx !== -1) {
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
            }
          }
          
          // Fallback if not found in mergedMedia or no mergedMedia
          return { 
            ...cleanOldUrls(post), 
            image: thumbUrl, 
            image_large: highResUrl, 
            image_3k: highResUrl,
            image_preview: localUrl, 
            type: 'image' 
          };
        }
        return post;
      }));
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
      ));
    } else {
      handlePostChange(id, 'youtubeUrl', url);
    }
  };

  const generateHTML = (posts: any[], title: string, subtitle: string) => {
    console.log('Generating HTML, posts:', posts);
    const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;

    const getProxiedUrl = (url: string) => {
      if (!url) return '';
      if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
      // Keep root-relative local paths for preview/local runtime (e.g. /data/...)
      if (url.startsWith('/')) return url;
      
      let cleanUrl = url;
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
        // Sort media: videos first
        const sortedMedia = [...post.mergedMedia].sort((a, b) => {
          const aYid = a.youtubeId || getYoutubeId(a.url || a.link);
          const aIsVideo = a.type === 'video' || a.type === 'youtube' || aYid || (a.image && a.image.endsWith('.mp4')) || ((a.url || a.link) && (a.url || a.link).endsWith('.mp4'));
          const bYid = b.youtubeId || getYoutubeId(b.url || b.link);
          const bIsVideo = b.type === 'video' || b.type === 'youtube' || bYid || (b.image && b.image.endsWith('.mp4')) || ((b.url || b.link) && (b.url || b.link).endsWith('.mp4'));
          return (bIsVideo ? 1 : 0) - (aIsVideo ? 1 : 0);
        });

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
            return `<div class="block mb-2"><img src="${imageUrl}" alt="" loading="lazy" /></div>`;
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
                <img src="${imageUrl}" alt="${post.title.replace(/"/g, '&quot;')}" loading="lazy" />
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
            const state = PROJECT_STATES.find(s => String(s.id) === String(stateId));
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
        .lightbox-close { position: absolute; top: 20px; right: 20px; color: white; font-size: 30px; cursor: pointer; background: rgba(0,0,0,0.5); border: none; width: 40px; height: 40px; border-radius: 50%; z-index: 10; display: flex; align-items: center; justify-content: center; line-height: 1; }
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
        projectStates: PROJECT_STATES,
        posts: posts.filter(p => !p.hidden),
        publicDomain: baseUrl
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
              console.log('Portfolio data parsed:', window.portfolioData);
              if (window.portfolioData && window.portfolioData.publicDomain) {
                publicDomain = window.portfolioData.publicDomain;
              }
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
          return !!url && /\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\?.*)?$/i.test(url);
        }

        function getImageSrc(media, preferLarge) {
          if (!media) return undefined;
          const primary = preferLarge
            ? [media.image_3k, media.image_large, media.imageLarge, media.largeUrl, media.image, media.image_preview]
            : [media.image, media.image_preview, media.image_3k, media.image_large, media.imageLarge, media.largeUrl];
          for (const candidate of primary) {
            if (candidate) return candidate;
          }
          const url = media.url || media.link;
          return (url && isDirectMediaFile(url)) ? url : undefined;
        }

        function getVideoSrc(media, preferLarge) {
          if (!media) return undefined;
          const primary = preferLarge
            ? [media.video_large, media.video, media.url, media.link]
            : [media.video, media.video_large, media.url, media.link];
          for (const candidate of primary) {
            if (candidate && isDirectMediaFile(candidate) && /\.(mp4|webm|mov)(\?.*)?$/i.test(candidate)) return candidate;
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
              if (filter === 'all' || (post && post.states && post.states.includes(filter))) {
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
              currentPostMedia = [...currentPost.mergedMedia];
            } else {
              currentPostMedia = [currentPost];
            }
            
            currentMediaIndex = 0;
            lightboxTitle.textContent = currentPost.title || '';
            lightboxDescription.innerHTML = currentPost.description ? currentPost.description.replace(/\\n/g, '<br/>') : '';
            
            // Render tags
            if (currentPost.states && currentPost.states.length > 0 && window.portfolioData.projectStates) {
              lightboxTags.innerHTML = currentPost.states.map(stateId => {
                const state = window.portfolioData.projectStates.find(s => String(s.id) === String(stateId));
                return state ? \`<span class="tag-label" style="background-color: \${state.muted}; border: 1px solid \${state.bright}; color: #fff; margin-right: 4px; margin-bottom: 4px; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">\${state.label}</span>\` : '';
              }).join('');
              lightboxTags.style.display = 'flex';
            } else {
              lightboxTags.innerHTML = '';
              lightboxTags.style.display = 'none';
            }
            
            updateLightbox();
            renderReorderGrid();
            lightbox.classList.add('active');
          });
        });
        
        function updateLightbox() {
          if (currentPostMedia.length === 0) return;
          
          const m = currentPostMedia[currentMediaIndex];
          lightboxCounter.textContent = \`\${currentMediaIndex + 1} / \${currentPostMedia.length}\`;
          
          btnPrev.style.display = currentPostMedia.length > 1 ? 'block' : 'none';
          btnNext.style.display = currentPostMedia.length > 1 ? 'block' : 'none';
          
          let html = '';
          const yid = m.youtubeId || getYoutubeId(m.url || m.link);
          if (yid) {
            html = \`<iframe width="800" height="450" src="https://www.youtube.com/embed/\${yid}?mute=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>\`;
          } else if (m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || ((m.url || m.link) && (m.url || m.link).endsWith('.mp4'))) {
            const videoUrl = getProxiedUrl(getVideoSrc(m, true) || getVideoSrc(m));
            html = \`<video src="\${videoUrl}" controls muted playsinline style="max-width: 100%; max-height: 85vh;"></video>\`;
          } else {
            const largeUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            html = \`<img src="\${largeUrl}" alt="" />\`;
          }
          
          lightboxContent.innerHTML = html;
          
          // Update active thumbnail in grid
          document.querySelectorAll('.reorder-item').forEach((item, i) => {
            if (i === currentMediaIndex) item.classList.add('active');
            else item.classList.remove('active');
          });
        }

        function renderReorderGrid() {
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
        
        document.getElementById('lightbox-close').addEventListener('click', () => {
          lightbox.classList.remove('active');
          lightboxContent.innerHTML = '';
          reorderGrid.innerHTML = '';
        });
        
        btnPrev.addEventListener('click', (e) => {
          e.stopPropagation();
          currentMediaIndex = (currentMediaIndex - 1 + currentPostMedia.length) % currentPostMedia.length;
          updateLightbox();
        });
        
        btnNext.addEventListener('click', (e) => {
          e.stopPropagation();
          currentMediaIndex = (currentMediaIndex + 1) % currentPostMedia.length;
          updateLightbox();
        });
        
        lightbox.addEventListener('click', (e) => {
          if (e.target === lightbox) {
            lightbox.classList.remove('active');
            lightboxContent.innerHTML = '';
            reorderGrid.innerHTML = '';
          }
        });
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
      
      const items = r2Data.items || r2Data.posts || [];
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
        
        // Save this R2 state to our local backend so we can edit it
        try {
          await fetch('/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(r2Data)
          });
        } catch (saveErr) {
          console.error("Could not save R2 state locally:", saveErr);
        }
      }
      alert("Erfolgreich von Cloudflare R2 synchronisiert!");
    } catch (e) {
      console.error(e);
      alert("Fehler beim Laden von Cloudflare R2.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    try {
      const html = generateHTML(flickrPosts, portfolioTitle, portfolioSubtitle);
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
    
    // Create a copy to ensure we have the current state
    const currentPosts = [...flickrPosts];
    console.log('handleUpload: currentPosts count:', currentPosts.length);
    console.log('handleUpload: currentPosts IDs in order:', currentPosts.map(p => p.id));
    
    try {
      const htmlContent = generateHTML(currentPosts, portfolioTitle, portfolioSubtitle);
      console.log('handleUpload: htmlContent generated, length:', htmlContent.length);
      
      const stateData = JSON.stringify({
        items: currentPosts,
        title: portfolioTitle,
        subtitle: portfolioSubtitle,
        lastUpdated: new Date().toISOString()
      });
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
            subtitle: portfolioSubtitle
          })
        });

        console.log('handleUpload: POST response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('handleUpload: POST response data:', data);
          setUploadProgress(100);
          setUploadSuccess({ url: data.url });
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
      setTimeout(() => setUploadProgress(null), 2000);
      setUploading(false);
    } catch (err: any) {
      console.error("Publish error:", err);
      setError(err.message || 'Upload fehlgeschlagen. Prüfen Sie die Cloudflare CORS-Einstellungen.');
      setUploading(false);
      setUploadProgress(null);
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
      updatePosts((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
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
      const html = await res.text();
      
      // Extract data from script tag
      const match = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
      if (match && match[1]) {
        const data = JSON.parse(match[1]);
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
          
          // Close modal after a short delay to show success
          setTimeout(() => {
            setShowBackups(false);
            setIsRestoring(null);
          }, 500);
        } else {
          throw new Error("Keine Daten im Backup gefunden.");
        }
      } else {
        throw new Error("Backup-Format ungültig (Script-Tag fehlt).");
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

  const currentLightboxPost = selectedImage ? flickrPosts.find(p => String(p.id) === String(selectedImage.id)) || selectedImage : null;

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
    });

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
        // Remove from local state and clean dangling merged media refs
        updatePosts(prev => sanitizePostsAfterDeletion(prev, idsToDelete));
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

  const sanitizePostsAfterDeletion = (posts: any[], deletedIds: string[]) => {
    const deletedSet = new Set(deletedIds.map(String));

    return posts
      .filter(post => !deletedSet.has(String(post.id)))
      .map(post => {
        if (!post.mergedMedia || !Array.isArray(post.mergedMedia)) return post;

        const mergedMedia = post.mergedMedia.filter((media: any) => !deletedSet.has(String(media?.id)));
        const primaryMedia = mergedMedia[0];

        // Keep base post fields aligned with first remaining media item
        if (primaryMedia) {
          return {
            ...post,
            mergedMedia,
            type: primaryMedia.type || post.type,
            image: primaryMedia.image || post.image,
            image_large: primaryMedia.image_large || post.image_large,
            url: primaryMedia.url || primaryMedia.link || post.url,
            youtubeId: primaryMedia.youtubeId || post.youtubeId
          };
        }

        return {
          ...post,
          mergedMedia: []
        };
      })
      .filter(post => {
        const hasMedia =
          !!post.image ||
          !!post.image_preview ||
          !!post.url ||
          !!post.youtubeId ||
          (Array.isArray(post.mergedMedia) && post.mergedMedia.length > 0);
        const hasText = !!post.title || !!post.description;
        return hasMedia || hasText;
      });
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
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-500 delay-150 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
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

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`aspect-square relative rounded-lg overflow-hidden group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'} ${isMoving ? 'cursor-crosshair' : 'cursor-pointer'} ${post.hidden ? 'grayscale brightness-50' : ''}`}
        onClick={isMoving ? () => onMoveToTarget(post.id) : onSelect}
      >
        <img 
          src={getDisplayImage(src, isR2Fallback, isEmbeddedData)} 
          alt="" 
          className="w-full h-full object-cover" 
          onError={(e) => {
            // Final fallback: only retry with preview image if we actually have it.
            if (thumbMedia?.image_preview && e.currentTarget.src !== thumbMedia.image_preview) {
              e.currentTarget.src = thumbMedia.image_preview;
            }
          }}
        />
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

      <header className="max-w-7xl mx-auto mb-12 relative">
        {isEditing ? (
          <div className="flex flex-col gap-4 mb-8 relative">
            <button 
              onClick={() => setIsEditing(false)}
              className="absolute -top-4 -right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
              title="Bearbeitungsmodus beenden"
            >
              <X className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={portfolioTitle}
              onChange={(e) => setPortfolioTitle(e.target.value)}
              className="w-full text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90 bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-2"
            />
            <input
              type="text"
              value={portfolioSubtitle}
              onChange={(e) => setPortfolioSubtitle(e.target.value)}
              className="w-full text-center text-white/50 mt-2 tracking-widest text-sm uppercase bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-1"
              placeholder="Subtitle"
            />
            <div className="mt-6 flex flex-col gap-3 max-w-xl mx-auto bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="text-xs text-white/50 uppercase tracking-wider text-left mb-1">Scraping Sources</div>
              <div className="flex items-center gap-3">
                <span className="text-white/40 text-sm w-24 text-right">Instagram:</span>
                <input
                  type="text"
                  value={igAccount}
                  onChange={(e) => setIgAccount(e.target.value)}
                  className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
                  placeholder="Instagram Username"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/40 text-sm w-24 text-right">Flickr URL:</span>
                <input
                  type="text"
                  value={flickrUrl}
                  onChange={(e) => setFlickrUrl(e.target.value)}
                  className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
                  placeholder="Flickr Album URL"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-12">
            <h1 className="text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90">
              {portfolioTitle}
            </h1>
            <p className="text-center text-white/50 mt-4 tracking-widest text-sm uppercase">
              {portfolioSubtitle}
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-5xl mx-auto">
          {/* Cloudflare Usage Display at the top */}
          <div className="col-span-full mb-2">
            <CloudflareUsageDisplay />
          </div>

          {/* Row 1 */}
          <AdminButton onClick={() => handleScrape('flickr')} disabled={isScraping} tooltip="Flickr Album einlesen">
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin' : ''}`} />
            <span className="text-center">Flickr</span>
          </AdminButton>
          
          <AdminButton onClick={() => handleScrape('instagram')} disabled={isScraping} tooltip="Instagram Feed einlesen">
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-pink-500' : ''}`} />
            <span className="text-center">Insta</span>
          </AdminButton>
          
          <AdminButton onClick={() => handleScrape('combined')} disabled={isScraping} tooltip="Flickr & Instagram gleichzeitig einlesen">
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-blue-400' : ''}`} />
            <span className="text-center">Alle</span>
          </AdminButton>

          <AdminButton onClick={() => handleScrape('flickr_html')} disabled={isScraping} tooltip="Flickr HTML Galerie einlesen (flickr-html.pages.dev)">
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-orange-400' : ''}`} />
            <span className="text-center">HTML</span>
          </AdminButton>

          <label className={`relative group w-full h-full cursor-pointer`}>
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl text-[10px] sm:text-xs font-medium border border-white/10 bg-white/5 text-white/80 transition-all duration-300 hover:bg-white/10 w-full h-full">
              <input 
                type="checkbox" 
                checked={autoUpload} 
                onChange={(e) => setAutoUpload(e.target.checked)}
                className="rounded border-white/20 bg-black/50 text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-center">Auto-Up</span>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
              Automatisch veröffentlichen nach Scraping
            </div>
          </label>

          {/* Row 2 */}
          <AdminButton onClick={handleHighResSync} disabled={syncStatus.running} tooltip="Scrape Originals Ordner für bessere Auflösungen (inkl. Unterordner)">
            <Maximize2 className={`w-3 h-3 sm:w-4 sm:h-4 ${syncStatus.running ? 'animate-spin text-yellow-500' : ''}`} />
            <span className="text-center">better Res.</span>
          </AdminButton>

          <AdminButton onClick={loadBackups} disabled={isEditing} tooltip="Vorherige Versionen wiederherstellen">
            <History className="w-3 h-3 sm:w-4 sm:h-4" /> 
            <span className="text-center">Backups</span>
          </AdminButton>

          <AdminButton
            onClick={handleResetAll}
            disabled={isEditing || isResettingAll}
            color={isResettingAll ? "bg-red-600/20 text-red-300 border-red-500/20" : "bg-red-600/10 text-red-300 border-red-500/20"}
            tooltip="Löscht lokal alles und R2 komplett. Danach neu scrapen."
          >
            <Trash2 className={`w-3 h-3 sm:w-4 sm:h-4 ${isResettingAll ? 'animate-spin' : ''}`} />
            <span className="text-center">{isResettingAll ? 'Reset...' : 'Reset All'}</span>
          </AdminButton>

          <AdminButton onClick={handleFullR2Sync} disabled={fullR2SyncStatus.running || isEditing} tooltip="Alle lokalen Bilder (Uploads, Flickr, etc.) zu Cloudflare R2 spiegeln">
            <UploadCloud className={`w-3 h-3 sm:w-4 sm:h-4 ${fullR2SyncStatus.running ? 'animate-spin text-blue-500' : ''}`} />
            <span className="text-center">Cloud Sync</span>
          </AdminButton>

          <AdminButton onClick={handleSyncFromCloudflare} disabled={isEditing || loading} tooltip="Aktuellen Stand von Cloudflare R2 laden (überschreibt lokale Änderungen)">
            <Download className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
            <span className="text-center">Load Cloud</span>
          </AdminButton>

          <AdminButton 
            onClick={() => setShowUncertain(true)} 
            disabled={uncertainMatches.length === 0 || isEditing} 
            color={uncertainMatches.length > 0 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" : "bg-white/5 text-white/30"}
            tooltip="Unsichere High-Res Matches prüfen"
          >
            <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" /> 
            <span className="text-center">Review ({uncertainMatches.length})</span>
          </AdminButton>

          {publicDomain && (
            <a 
              href={isEditing ? undefined : `https://${publicDomain}/index.html`}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full h-full ${isEditing ? 'pointer-events-none' : ''}`}
            >
              <AdminButton disabled={isEditing} tooltip="Live Website in neuem Tab öffnen">
                <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-center">Live</span>
              </AdminButton>
            </a>
          )}

          {/* Row 3 */}
          <AdminButton onClick={handlePreview} tooltip="Voransicht der generierten HTML-Seite">
            <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="text-center">Voransicht</span>
          </AdminButton>

          <AdminButton 
            onClick={() => setIsEditing(!isEditing)} 
            active={isEditing}
            tooltip={isEditing ? "Bearbeitungsmodus beenden" : "Titel und Texte bearbeiten"}
          >
            {isEditing ? <Save className="w-3 h-3 sm:w-4 sm:h-4" /> : <Edit3 className="w-3 h-3 sm:w-4 sm:h-4" />}
            <span className="text-center">{isEditing ? 'Exit Edit' : 'Edit Mode'}</span>
          </AdminButton>

          <AdminButton 
            onClick={() => setIsReorderView(true)} 
            active={isReorderView}
            tooltip="Bilder sortieren und Projekte zusammenführen"
          >
            <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="text-center">Rearrange</span>
          </AdminButton>

          <AdminButton 
            onClick={handleMergeSimilar} 
            disabled={isEditing}
            tooltip="Alle Projekte mit gleichem Titel automatisch zusammenführen"
          >
            <FoldVertical className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="text-center">Merge Similar</span>
          </AdminButton>

          <div className="relative col-span-1">
            <AdminButton 
              id="upload-btn" 
              onClick={handleUpload} 
              disabled={uploading || flickrPosts.length === 0} 
              tooltip="Änderungen auf die Live-Website übertragen"
            >
              {uploading ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <UploadCloud className="w-3 h-3 sm:w-4 sm:h-4" />}
              <span className="text-center font-black tracking-tighter">{uploading ? '...' : 'PUBLISH'}</span>
            </AdminButton>
            {uploadProgress !== null && (
              <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>

          <AdminButton onClick={handleAddNewPost} tooltip="Manuellen Post hinzufügen">
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> 
            <span className="text-center">Neu</span>
          </AdminButton>

          {/* Row 4 */}
          <div className="col-span-1 flex gap-1">
            <button 
              onClick={handleUndo} 
              disabled={past.length === 0} 
              className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-30"
              title="Undo (Strg+Z)"
            >
              <Undo2 className="w-3 h-3" />
              <span>Undo</span>
            </button>
            <button 
              onClick={handleRedo} 
              disabled={future.length === 0} 
              className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-30"
              title="Redo (Strg+Y)"
            >
              <Redo2 className="w-3 h-3" />
              <span>Redo</span>
            </button>
          </div>
        </div>
      </header>

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
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={flickrPosts.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-[1400px] mx-auto">
              {flickrPosts
                .filter(post => isEditing || !post.hidden)
                .map((post, index) => (
                <SortablePost 
                  key={post.id} 
                  index={index}
                  totalPosts={flickrPosts.length}
                  post={post}
                  isEditing={isEditing}
                  activeUploads={activeUploads}
                  showResolutions={showResolutions}
                  handleImageUpload={handleImageUpload}
                  handlePostChange={handlePostChange}
                  handleYoutubeChange={handleYoutubeChange}
                  handleDeletePost={handleDeletePost}
                  handleMergeDown={handleMergeDown}
                  handleUpdatePostMedia={handleUpdatePostMedia}
                  setSelectedImage={setSelectedImage}
                  handleStateToggle={handleStateToggle}
                  handleToggleHidden={handleToggleHidden}
                  getDisplayImage={getDisplayImage}
                  isR2Fallback={isR2Fallback}
                  isEmbeddedData={isEmbeddedData}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Backups Modal */}
      {showBackups && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowBackups(false)}
        >
          <div 
            className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-white flex items-center gap-2">
                <History className="w-5 h-5" /> Letzte Backups
              </h2>
              <button 
                className="text-white/50 hover:text-white transition-colors p-1"
                onClick={() => setShowBackups(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {restoreError && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-xs mb-4">
                  {restoreError}
                </div>
              )}
              
              {backupsList.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-4">Keine Backups vorhanden.</p>
              ) : (
                backupsList.map((filename) => {
                  // Format filename for display: portfolio_2026-03-24T15-29-28-000Z.html
                  const dateMatch = filename.match(/portfolio_(.*)\.html/);
                  let displayDate = filename;
                  if (dateMatch && dateMatch[1]) {
                    try {
                      // Correctly parse the timestamp format: 2026-03-24T15-29-28-000Z
                      const raw = dateMatch[1];
                      const datePart = raw.substring(0, 10);
                      const timePart = raw.substring(11).replace(/-/g, ':');
                      // Fix the last colon to a dot for milliseconds
                      const lastColonIdx = timePart.lastIndexOf(':');
                      const fixedTime = timePart.substring(0, lastColonIdx) + '.' + timePart.substring(lastColonIdx + 1);
                      const dateStr = `${datePart}T${fixedTime}`;
                      
                      const date = new Date(dateStr);
                      if (!isNaN(date.getTime())) {
                        displayDate = date.toLocaleString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        });
                      }
                    } catch (e) {}
                  }

                  const isThisRestoring = isRestoring === filename;

                  return (
                    <div key={filename} className="flex items-center justify-between bg-white/5 p-3 rounded border border-white/5 hover:border-white/20 transition-colors">
                      <div className="flex flex-col min-w-0 mr-4">
                        <span className="text-sm text-white/80 truncate">{displayDate}</span>
                        <span className="text-[10px] text-white/30 truncate">{filename}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={() => handleRestoreBackup(filename)}
                          disabled={!!isRestoring}
                          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded transition-colors ${
                            isThisRestoring 
                              ? 'bg-blue-500/20 text-blue-400' 
                              : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          }`}
                        >
                          {isThisRestoring ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <History className="w-3 h-3" />
                          )}
                          {isThisRestoring ? 'Restoring...' : 'Restore'}
                        </button>
                        <a 
                          href={`/api/backups/${filename}`}
                          download={filename}
                          className="flex items-center gap-1 text-xs bg-white/5 text-white/50 hover:bg-white/10 p-1.5 rounded transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scraping Logs Modal */}
      {showLogs && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => !isScraping && setShowLogs(false)}
        >
          <div 
            className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-medium text-white flex items-center gap-2">
                {(isScraping || syncStatus.running || fullR2SyncStatus.running) ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                )}
                {fullR2SyncStatus.running ? 'Cloudflare Sync' : isScraping ? 'Scraping Verlauf' : syncStatus.running ? 'High-Res Sync' : 'Verlauf'}
              </h2>
              {!(isScraping || syncStatus.running || fullR2SyncStatus.running) && (
                <button 
                  className="text-white/50 hover:text-white transition-colors p-1"
                  onClick={() => setShowLogs(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {fullR2SyncStatus.running && fullR2SyncStatus.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-[10px] text-white/50 mb-1 uppercase tracking-wider">
                  <span>Fortschritt</span>
                  <span>{Math.round((fullR2SyncStatus.progress / fullR2SyncStatus.total) * 100)}%</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(fullR2SyncStatus.progress / fullR2SyncStatus.total) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-white/30 mt-1 text-right">
                  {fullR2SyncStatus.progress} / {fullR2SyncStatus.total} Dateien
                </div>
              </div>
            )}
            
            <div className="bg-black/50 border border-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
              {scrapeLogs.map((log, i) => (
                <div key={i} className="text-white/80 mb-1 flex items-start gap-2">
                  <span className="text-blue-500/50 shrink-0">{'>'}</span>
                  <span>{log}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {!(isScraping || syncStatus.running || fullR2SyncStatus.running) && (
              <button
                onClick={() => setShowLogs(false)}
                className="mt-4 w-full bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg transition-colors"
              >
                Schließen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Uncertain Matches Modal */}
      {showUncertain && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowUncertain(false)}
        >
          <div 
            className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-medium text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-yellow-500" /> Unsichere Treffer prüfen
              </h2>
              <button 
                className="text-white/50 hover:text-white transition-colors p-1"
                onClick={() => setShowUncertain(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {uncertainMatches.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-8">Keine unsicheren Treffer zur Überprüfung.</p>
              ) : (
                uncertainMatches.map((match, i) => {
                  const post = flickrPosts.find(p => p.id === match.postId);
                  return (
                    <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col md:flex-row gap-6">
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-xs text-white/40 uppercase tracking-wider">Feed Bild</span>
                        <img src={getDisplayImage(getImageSrc(post), isR2Fallback, isEmbeddedData)} alt="" className="w-full aspect-square object-cover rounded-lg border border-white/10" />
                        <span className="text-xs text-white/60 mt-2 truncate">{post?.title || 'Unbekannter Post'}</span>
                      </div>
                      
                      <div className="flex items-center justify-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-yellow-500 font-bold">Match?</span>
                          <div className="h-px w-8 bg-white/20" />
                          <span className="text-[10px] text-white/30">Dist: {match.distance}</span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-xs text-white/40 uppercase tracking-wider">Lokales Original (Preview)</span>
                        <img src={getDisplayImage(match.previewUrl, isR2Fallback, isEmbeddedData)} alt="" className="w-full aspect-square object-cover rounded-lg border border-white/10" />
                        <span className="text-xs text-white/60 mt-2 truncate">{match.localFile}</span>
                      </div>

                      <div className="flex flex-col justify-center gap-2">
                        <button 
                          onClick={() => handleConfirmMatch(match)}
                          className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-500 transition-all active:scale-95"
                        >
                          <CheckCircle className="w-4 h-4" /> Bestätigen
                        </button>
                        <button 
                          onClick={() => handleRejectMatch(match)}
                          className="flex items-center justify-center gap-2 bg-white/5 text-white/50 px-6 py-3 rounded-xl font-medium hover:bg-white/10 transition-all"
                        >
                          <Trash2 className="w-4 h-4" /> Ablehnen
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox for large images */}
      {currentLightboxPost && (
        <div 
          className={`fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm ${isHoveringLightboxBg ? 'cursor-none' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedImage(null);
              setIsHoveringLightboxBg(false);
            }
          }}
          onMouseMove={(e) => {
            if (e.target === e.currentTarget) {
              setLightboxMousePos({ x: e.clientX, y: e.clientY });
              setIsHoveringLightboxBg(true);
            } else {
              setIsHoveringLightboxBg(false);
            }
          }}
          onMouseLeave={() => setIsHoveringLightboxBg(false)}
        >
          {isHoveringLightboxBg && (
            <div 
              className="fixed pointer-events-none z-50 flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-md rounded-full text-white transition-opacity duration-200"
              style={{ left: lightboxMousePos.x - 24, top: lightboxMousePos.y - 24 }}
            >
              <ArrowLeft className="w-6 h-6" />
            </div>
          )}
          <button 
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-10"
            onClick={() => {
              setSelectedImage(null);
              setIsHoveringLightboxBg(false);
            }}
            onMouseEnter={() => setIsHoveringLightboxBg(false)}
          >
            <X className="w-6 h-6" />
          </button>
          
          <div 
            className="max-w-7xl w-full max-h-full flex flex-col md:flex-row gap-6 items-center justify-center" 
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsHoveringLightboxBg(false)}
          >
            <div className="relative flex-1 flex flex-col items-center justify-start min-h-0 w-full max-h-[85vh] overflow-y-auto gap-4 custom-scrollbar pr-2">
              {(currentLightboxPost.mergedMedia && currentLightboxPost.mergedMedia.length > 0 ? currentLightboxPost.mergedMedia : [currentLightboxPost]).map((media: any, i: number) => (
                <div 
                  key={i} 
                  className={`w-full flex justify-center relative ${isEditing ? 'cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-white/20 rounded-lg p-2' : ''}`}
                  draggable={isEditing}
                  onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
                  onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
                  onDrop={(e) => isEditing && handleLightboxDrop(e, i, currentLightboxPost.id)}
                >
                  {isEditing && (
                    <div className="absolute top-4 left-4 z-10 bg-black/50 p-2 rounded text-white/50 pointer-events-none">
                      <GripVertical className="w-6 h-6" />
                    </div>
                  )}
                  {(showResolutions || isEditing) && (
                    <div className="absolute top-4 left-4 z-20 bg-blue-600/80 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg backdrop-blur-sm flex flex-col gap-0.5">
                      <span>{getResolutionLabel(media, imageDimensions[`${currentLightboxPost.id}-${i}`])}</span>
                      {imageDimensions[`${currentLightboxPost.id}-${i}`] && (
                        <span className="opacity-80 border-t border-white/20 pt-0.5 mt-0.5">
                          {imageDimensions[`${currentLightboxPost.id}-${i}`]}
                        </span>
                      )}
                    </div>
                  )}
                  {media.type === 'youtube' && media.youtubeId ? (
                    <div className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${isEditing ? 'pointer-events-none' : ''}`}>
                      <iframe 
                        src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=${i === 0 && !isEditing ? 1 : 0}&mute=1`} 
                        className="w-full h-full"
                        frameBorder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                    </div>
                  ) : media.type === 'video' || (media.image && media.image.endsWith('.mp4')) || (media.url && media.url.endsWith('.mp4')) ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <video 
                        src={getDisplayImage(getVideoSrc(media, true), isR2Fallback, isEmbeddedData)} 
                        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                        controls
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <img 
                        src={getDisplayImage(getImageSrc(media, true), isR2Fallback, isEmbeddedData)} 
                        alt={currentLightboxPost.title} 
                        className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                        referrerPolicy="no-referrer"
                        onLoad={(e) => handleImageLoad(`${currentLightboxPost.id}-${i}`, e)}
                        onError={(e) => {
                          const target = e.currentTarget;
                          // If large image fails, try the thumbnail
                          if (media.image && target.src !== media.image) {
                            target.src = getDisplayImage(media.image, isR2Fallback, isEmbeddedData) || '';
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="w-full md:w-80 bg-[#111] p-6 rounded-xl border border-white/10 shrink-0 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <h2 className="text-xl font-medium text-white mb-4">{currentLightboxPost.title}</h2>
              {currentLightboxPost.states && currentLightboxPost.states.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {currentLightboxPost.states.map(stateId => {
                    const state = PROJECT_STATES.find(s => s.id === stateId);
                    return state ? (
                      <span 
                        key={stateId}
                        className="px-3 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: state.muted, border: `1px solid ${state.bright}` }}
                      >
                        {state.label}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              {currentLightboxPost.description && (
                <div 
                  className="text-sm text-white/70 space-y-2 mb-6"
                  dangerouslySetInnerHTML={{ __html: currentLightboxPost.description.replace(/\n/g, '<br/>') }}
                />
              )}
              <div className="flex flex-col gap-2">
                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Medien sortieren (Drag & Drop)</div>
                <div className="grid grid-cols-4 gap-2 mb-6">
                  {(currentLightboxPost.mergedMedia && currentLightboxPost.mergedMedia.length > 0 ? currentLightboxPost.mergedMedia : [currentLightboxPost]).map((media: any, i: number) => (
                    <div 
                      key={i}
                      draggable={isEditing}
                      onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
                      onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
                      onDrop={(e) => isEditing && handleLightboxDrop(e, i, currentLightboxPost.id)}
                      className={`aspect-square rounded bg-white/5 border overflow-hidden cursor-grab active:cursor-grabbing transition-colors ${lightboxDraggedIdx === i ? 'opacity-50 border-blue-500' : 'border-white/10 hover:border-white/30'}`}
                    >
                      {media.type === 'youtube' && media.youtubeId ? (
                        <div className="w-full h-full flex items-center justify-center bg-red-900/20">
                          <Youtube className="w-4 h-4 text-red-500" />
                        </div>
                      ) : media.type === 'video' || (media.image && media.image.endsWith('.mp4')) || (media.url && media.url.endsWith('.mp4')) ? (
                        <video src={getDisplayImage(getVideoSrc(media), isR2Fallback, isEmbeddedData)} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={getDisplayImage(getImageSrc(media), isR2Fallback, isEmbeddedData)} className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Links</div>
                {(currentLightboxPost.mergedMedia && currentLightboxPost.mergedMedia.length > 0 ? currentLightboxPost.mergedMedia : [currentLightboxPost]).map((media: any, i: number) => (
                  media.url || media.link ? (
                    <a 
                      key={i}
                      href={media.url || media.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Link {i + 1} ansehen
                    </a>
                  ) : null
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Rearrange Mode Modal */}
      {isReorderView && (
        <div ref={reorderScrollRef} className="fixed inset-0 z-50 bg-black p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="flex justify-between items-center mb-8 max-w-7xl mx-auto w-full">
            <h2 className="text-2xl font-light tracking-widest uppercase text-white/90">
              {isMoving ? 'Zielposition wählen' : 'Rearrange & Merge'}
            </h2>
            <div className="flex gap-4 items-center">
              {!isMoving && (
                <div className="flex gap-2 mr-4 border-r border-white/10 pr-4">
                  <button
                    onClick={() => setSelectedThumbnails([])}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all"
                    title="Auswahl aufheben"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleUndo}
                    disabled={past.length === 0}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg disabled:opacity-30 transition-all"
                    title="Undo (Strg+Z)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg disabled:opacity-30 transition-all"
                    title="Redo (Strg+Y)"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {!isMoving && (
                <div className="flex gap-2">
                  <div className="relative group">
                    <button
                      onClick={() => setIsMoving(true)}
                      disabled={selectedThumbnails.length === 0}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-green-500"
                    >
                      <ArrowLeft className="w-4 h-4" /> Verschieben ({selectedThumbnails.length})
                    </button>
                  </div>
                  <div className="relative group">
                    <button
                      onClick={handleMerge}
                      disabled={selectedThumbnails.length < 2}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-blue-500"
                    >
                      <Layers className="w-4 h-4" /> Merge ({selectedThumbnails.length})
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-500 delay-150 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
                      Ausgewählte Projekte zusammenführen
                    </div>
                  </div>
                  <div className="relative group">
                    <button
                      onClick={handleBulkDelete}
                      disabled={selectedThumbnails.length === 0}
                      className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-red-500"
                    >
                      <Trash2 className="w-4 h-4" /> Löschen ({selectedThumbnails.length})
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-500 delay-150 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
                      Ausgewählte Projekte löschen
                    </div>
                  </div>
                </div>
              )}
              <div className="relative group">
                <button 
                  onClick={() => {
                    setIsReorderView(false);
                    setSelectedThumbnails([]);
                    setIsMoving(false);
                  }} 
                  className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-sm font-medium transition-all"
                >
                  {isMoving ? 'Abbrechen' : 'Exit Mode'}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-all duration-500 delay-150 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
                  {isMoving ? 'Verschieben abbrechen' : 'Sortiermodus beenden'}
                </div>
              </div>
            </div>
          </div>
          
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={flickrPosts.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-w-7xl mx-auto w-full">
                {flickrPosts.map((post: any) => (
                  <SortableThumbnail 
                    key={post.id} 
                    post={post} 
                    isSelected={selectedThumbnails.includes(post.id)}
                    isMoving={isMoving}
                    onMoveToTarget={() => handleMoveToTarget(post.id)}
                    onSelect={(e: React.MouseEvent) => {
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
                    index={selectedThumbnails.indexOf(post.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
