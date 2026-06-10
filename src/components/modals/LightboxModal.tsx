// components/modals/LightboxModal.tsx
/**
 * LightboxModal Component
 * Eingekapselte Lightbox-Logik für große Bilder und Medien
 * Funktionalität von App.tsx extrahiert
 */
import React from 'react';
import { X, ArrowLeft, GripVertical, Youtube, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { PROJECT_STATES } from '../../constants';

interface Media {
  type?: string;
  youtubeId?: string;
  image?: string;
  url?: string;
  link?: string;
  image_large?: string;
  image_3k?: string;
  [key: string]: any;
}

interface LightboxModalProps {
  currentLightboxPost: any | null;
  lightboxMousePos: { x: number; y: number };
  isHoveringLightboxBg: boolean;
  lightboxDraggedIdx: number | null;
  imageDimensions: Record<string, string>;
  
  // State setters
  setLightboxMousePos: (pos: { x: number; y: number }) => void;
  setIsHoveringLightboxBg: (v: boolean) => void;
  setSelectedImage: (post: any) => void;
  
  // Display flags
  showResolutions: boolean;
  isEditing: boolean;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  
  // Functions
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (e: React.DragEvent, index: number, postId: string) => void;
  handlePostChange: (id: string, field: string, value: string) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  currentLightboxPost,
  lightboxMousePos,
  isHoveringLightboxBg,
  lightboxDraggedIdx,
  imageDimensions,
  setLightboxMousePos,
  setIsHoveringLightboxBg,
  setSelectedImage,
  showResolutions,
  isEditing,
  isR2Fallback,
  isEmbeddedData,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
  handlePostChange,
}) => {
  if (!currentLightboxPost) return null;

  const getAsString = (val: any) => {
    if (!val) return "";
    if (typeof val === 'string') return val;
    if (typeof val === 'object') return val.description || val.title || JSON.stringify(val);
    return String(val);
  };

  const isRenderableMedia = (media: any) => {
    if (!media) return false;
    const hasImage = !!(media.image || media.image_thumb || media.image_1k || media.image_2k || media.image_large || media.image_preview || media.image_3k || media.image_original);
    const hasUrl = !!(media.url || media.link);
    if (media.type === 'youtube') return !!(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
    if (media.type === 'bunny') return true;
    return hasImage || hasUrl || !!media.youtubeId;
  };

  const rawMediaList = (currentLightboxPost.mergedMedia && currentLightboxPost.mergedMedia.length > 0)
    ? currentLightboxPost.mergedMedia
    : [currentLightboxPost];

  const mediaList = isEditing ? rawMediaList : rawMediaList.filter(isRenderableMedia);
  const getResolutionVariants = (media: any) => {
    if (!media) return [];

    if (media.type === 'youtube') {
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
      const value = media[key];
      if (!value) return false;
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  };

  return (
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
          {mediaList.map((media: Media, i: number) => (
            <div 
              key={i} 
              className={`group w-full flex justify-center relative ${isEditing ? 'cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-white/20 rounded-lg p-2' : ''}`}
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
              {isEditing && showResolutions && getResolutionVariants(media).length > 0 && (
                <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
                    {getResolutionVariants(media).map(({ key, label }) => (
                      <span
                        key={`${currentLightboxPost.id}-${i}-${key}`}
                        className="inline-flex items-center gap-1 rounded-full bg-black/70 border border-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-md shadow-lg"
                      >
                        <ImageIcon className="w-2.5 h-2.5" />
                        <span>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {media.type === 'bunny' && media.videoId && media.libraryId ? (
                <div className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${isEditing ? 'pointer-events-none' : ''}`}>
                  <iframe 
                    src={`https://video.bunnycdn.com/embed/${media.libraryId}/${media.videoId}?autoplay=${i === 0 && !isEditing ? 'true' : 'false'}&loop=false&muted=true&preload=true&responsive=true`}
                    loading="lazy"
                    className="w-full h-full border-0"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen
                  ></iframe>
                </div>
              ) : media.type === 'youtube' && media.youtubeId ? (
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
                      const target = e.currentTarget as HTMLImageElement;
                      if (target.src.includes('maxresdefault.jpg')) {
                        target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                      } else if (media.image && target.src !== getDisplayImage(media.image, isR2Fallback, isEmbeddedData) && target.src !== media.image) {
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
          {isEditing ? (
            <input 
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-lg font-medium text-white mb-4 focus:border-blue-500 focus:outline-none"
              value={getAsString(currentLightboxPost.title)}
              onChange={(e) => handlePostChange(currentLightboxPost.id, 'title', e.target.value)}
              placeholder="Titel..."
            />
          ) : (
            <h2 className="text-xl font-medium text-white mb-4">{getAsString(currentLightboxPost.title)}</h2>
          )}
          
          {currentLightboxPost.states && currentLightboxPost.states.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {currentLightboxPost.states.map((stateId: string, idx: number) => {
                const state = PROJECT_STATES.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                return state ? (
                  <span 
                    key={`${stateId}-${idx}`}
                    className="px-3 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: state.muted, border: `1px solid ${state.bright}` }}
                  >
                    {state.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
          
          {isEditing ? (
            <textarea 
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white/70 mb-6 focus:border-blue-500 focus:outline-none min-h-[120px] custom-scrollbar resize-none"
              value={getAsString(currentLightboxPost.description)}
              onChange={(e) => handlePostChange(currentLightboxPost.id, 'description', e.target.value)}
              placeholder="Beschreibung..."
            />
          ) : currentLightboxPost.description && (
            <div 
              className="text-sm text-white/70 space-y-2 mb-6"
              dangerouslySetInnerHTML={{ __html: getAsString(currentLightboxPost.description).replace(/\n/g, '<br/>') }}
            />
          )}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Medien sortieren (Drag & Drop)</div>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {mediaList.map((media: Media, i: number) => (
                <div 
                  key={i}
                  draggable={isEditing}
                  onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
                  onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
                  onDrop={(e) => isEditing && handleLightboxDrop(e, i, currentLightboxPost.id)}
                  className={`aspect-square rounded bg-white/5 border overflow-hidden cursor-grab active:cursor-grabbing transition-colors ${lightboxDraggedIdx === i ? 'opacity-50 border-blue-500' : 'border-white/10 hover:border-white/30'}`}
                >
                  {media.type === 'bunny' && media.videoId ? (
                    <div className="w-full h-full relative">
                      <img src={getDisplayImage(getImageSrc(media), isR2Fallback, isEmbeddedData) || ''} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Youtube className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : media.type === 'youtube' && media.youtubeId ? (
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
            {mediaList.map((media: Media, i: number) => (
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
  );
};
