// src/components/feed/FeedPostCard.tsx
import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, Eye, GripVertical, ImageIcon, Youtube, X, Maximize2, FoldVertical, Trash2, ExternalLink } from 'lucide-react';
import { PROJECT_STATES } from '../../constants';

interface FeedPostCardProps {
  post: any;
  index: number;
  totalPosts: number;
  isEditing: boolean;
  activeUploads: Record<string, number>;
  showResolutions: boolean;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  getImageSrc: (media: any) => string | null;
  getVideoSrc: (media: any) => string | null;
  getResolutionLabel: (media: any, dimensions?: string) => string;
  formatDescription: (description: string, title: string) => string;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  isValidImageCandidate?: (url?: string) => boolean;
  handleImageUpload: (postId: string, file: File, mediaIndex?: number, isNew?: boolean) => void;
  handlePostChange: (postId: string, field: string, value: any) => void;
  handleYoutubeChange: (postId: string, url: string) => void;
  handleDeletePost: (postId: string) => void;
  handleMergeDown: (index: number) => void;
  handleUpdatePostMedia: (postId: string, media: any[]) => void;
  setSelectedImage: (post: any) => void;
  handleStateToggle: (postId: string, stateId: string) => void;
  handleToggleHidden: (postId: string) => void;
}

export function FeedPostCard({
  post, index, totalPosts, isEditing, activeUploads, showResolutions,
  getDisplayImage, getImageSrc, getVideoSrc, getResolutionLabel, formatDescription,
  isR2Fallback, isEmbeddedData, isValidImageCandidate,
  handleImageUpload, handlePostChange, handleYoutubeChange, handleDeletePost,
  handleMergeDown, handleUpdatePostMedia, setSelectedImage, handleStateToggle, handleToggleHidden
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFeedImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setFeedImageDimensions(`${img.naturalWidth} x ${img.naturalHeight} px`);
  };

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

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const isRenderableMedia = (media: any) => {
    if (!media) return false;
    const hasImage = !!(media.image || media.image_large || media.image_preview || media.image_3k);
    const hasUrl = !!(media.url || media.link);
    if (media.type === 'youtube') return !!(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
    return hasImage || hasUrl || !!media.youtubeId;
  };

  const rawMediaItems = (post.mergedMedia && post.mergedMedia.length > 0)
    ? post.mergedMedia
    : [{ type: post.type || 'image', image: post.image, image_large: post.image_large, youtubeId: post.youtubeId, youtubeUrl: post.youtubeUrl, link: post.url }];

  const mediaItems = isEditing ? rawMediaItems : rawMediaItems.filter(isRenderableMedia);
  const renderedMediaCount = mediaItems.length;
  const displayMedia = mediaItems[0] || post;
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
        className={`relative ${(!isEditing && renderedMediaCount > 1) || isEditing ? 'h-auto min-h-[300px] max-h-[600px] overflow-y-auto custom-scrollbar' : 'aspect-[4/3] overflow-hidden'} cursor-pointer bg-black/50 shrink-0 ${isEditing && post.hidden ? 'grayscale brightness-50' : ''}`}
        onClick={() => {
          if (!isEditing) setSelectedImage(post);
        }}
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
            <div className="flex gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
              <label
                className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded py-1.5 text-xs cursor-pointer transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
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
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  addMedia('youtube');
                }}
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
                onClick={(e) => e.stopPropagation()}
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
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                )}
                {media.image || media.image_preview || media.url ? (
                  getVideoSrc(media) ? (
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
              getVideoSrc(displayMedia) ? (
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
                <ImageIcon className="w-12 h-12" />
              </div>
            )}
            
            {displayMedia.type === 'youtube' && !isEditing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedImage(post); }}>
                  <Youtube className="w-8 h-8 text-white ml-1" />
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
