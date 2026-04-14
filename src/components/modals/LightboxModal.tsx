// components/modals/LightboxModal.tsx
import React from 'react';
import { X, ArrowLeft, Youtube } from 'lucide-react';
import { Post, MediaItem } from '../../types';

interface LightboxModalProps {
  currentLightboxPost: Post | null;
  currentMediaIndex: number;
  setCurrentMediaIndex: (idx: number) => void;
  currentMedia: MediaItem[];
  
  // UI State
  isHoveringLightboxBg: boolean;
  setIsHoveringLightboxBg: (v: boolean) => void;
  lightboxMousePos: { x: number; y: number };
  setLightboxMousePos: (v: { x: number; y: number }) => void;
  lightboxDraggedIdx: number | null;
  setLightboxDraggedIdx: (idx: number | null) => void;
  imageDimensions: Record<string, string>;
  
  // Display Options
  showResolutions: boolean;
  isEditing: boolean;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  
  // Callbacks
  onClose: () => void;
  onNextMedia: () => void;
  onPreviousMedia: () => void;
  handleImageLoad: (mediaId: string, dims: { width: number; height: number }) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (e: React.DragEvent, i: number, postId: string) => void;
  
  // Display Functions
  getImageSrc: (media: MediaItem, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: MediaItem, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
}

/**
 * LightboxModal Component
 * 
 * Große Modal-Komponente für:
 * - Vollbild Media-Ansicht (Bilder, Videos, YouTube)
 * - Media-Navigation (Prev/Next)
 * - Sidebar mit Metadaten (Titel, Tags, Beschreibung)
 * - Media-Grid zum Reordern (Drag & Drop)
 * - Links zu Original-Posts
 * 
 * Größe: ~300 Zeilen
 */
export const LightboxModal: React.FC<LightboxModalProps> = ({
  currentLightboxPost,
  currentMediaIndex,
  setCurrentMediaIndex,
  currentMedia,
  isHoveringLightboxBg,
  setIsHoveringLightboxBg,
  lightboxMousePos,
  setLightboxMousePos,
  lightboxDraggedIdx,
  setLightboxDraggedIdx,
  imageDimensions,
  showResolutions,
  isEditing,
  isR2Fallback,
  isEmbeddedData,
  onClose,
  onNextMedia,
  onPreviousMedia,
  handleImageLoad,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
  getImageSrc,
  getVideoSrc,
  getDisplayImage
}) => {
  if (!currentLightboxPost) return null;

  const renderMediaContent = () => {
    const media = currentMedia[currentMediaIndex];
    if (!media) return null;

    // YouTube
    if (media.youtubeId) {
      return (
        <div className="w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl">
          <iframe 
            src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=1&mute=1`}
            className="w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    // Video
    const videoSrc = getVideoSrc(media, true);
    if (videoSrc) {
      return (
        <video 
          src={getDisplayImage(videoSrc, isR2Fallback, isEmbeddedData)}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          controls
          autoPlay
          muted
          loop
          playsInline
        />
      );
    }

    // Image
    const imageSrc = getImageSrc(media, true);
    if (imageSrc) {
      return (
        <img 
          src={getDisplayImage(imageSrc, isR2Fallback, isEmbeddedData)}
          alt={currentLightboxPost.title}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const img = e.currentTarget;
            handleImageLoad(
              `${currentLightboxPost.id}-${currentMediaIndex}`,
              { width: img.naturalWidth, height: img.naturalHeight }
            );
          }}
        />
      );
    }

    return <div className="text-white/50">Media nicht verfügbar</div>;
  };

  return (
    <div 
      className={`fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm ${
        isHoveringLightboxBg ? 'cursor-none' : ''
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onMouseMove={(e) => {
        if ((e.target as HTMLElement) === e.currentTarget) {
          setLightboxMousePos({ x: e.clientX, y: e.clientY });
          setIsHoveringLightboxBg(true);
        }
      }}
      onMouseLeave={() => setIsHoveringLightboxBg(false)}
    >
      {/* Close Cursor Indicator */}
      {isHoveringLightboxBg && (
        <div 
          className="fixed pointer-events-none z-50 flex items-center justify-center w-12 h-12 bg-white/10 backdrop-blur-md rounded-full text-white"
          style={{ left: lightboxMousePos.x - 24, top: lightboxMousePos.y - 24 }}
        >
          <ArrowLeft className="w-6 h-6" />
        </div>
      )}

      {/* Close Button */}
      <button 
        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-10"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Main Content */}
      <div 
        className="max-w-7xl w-full max-h-full flex flex-col md:flex-row gap-6 items-start md:items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsHoveringLightboxBg(false)}
      >
        {/* Media Viewer */}
        <div className="relative flex-1 flex flex-col items-center justify-center min-h-0 w-full max-h-[85vh] gap-4">
          {/* Previous Button */}
          {currentMedia.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); onPreviousMedia(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/30 text-white p-3 rounded-full z-5"
            >
              ◀
            </button>
          )}

          {/* Media Content */}
          <div className="flex justify-center items-center">
            {renderMediaContent()}
          </div>

          {/* Next Button */}
          {currentMedia.length > 1 && (
            <button 
              onClick={(e) => { e.stopPropagation(); onNextMedia(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/30 text-white p-3 rounded-full z-5"
            >
              ▶
            </button>
          )}

          {/* Counter */}
          {currentMedia.length > 1 && (
            <div className="absolute bottom-4 text-white/50 text-sm">
              {currentMediaIndex + 1} / {currentMedia.length}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-80 bg-[#111] p-6 rounded-xl border border-white/10 shrink-0 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <h2 className="text-xl font-medium text-white mb-4">
            {currentLightboxPost.title}
          </h2>

          {/* Tags */}
          {currentLightboxPost.states && currentLightboxPost.states.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {currentLightboxPost.states.map((stateId: string) => (
                <span 
                  key={stateId}
                  className="px-2 py-1 rounded text-xs font-medium text-white bg-blue-600/50"
                >
                  {stateId}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {currentLightboxPost.description && (
            <div 
              className="text-sm text-white/70 space-y-2 mb-6"
              dangerouslySetInnerHTML={{ 
                __html: currentLightboxPost.description.replace(/\n/g, '<br/>') 
              }}
            />
          )}

          {/* Media Grid for Reordering */}
          {currentMedia.length > 1 && (
            <>
              <div className="text-xs text-white/40 uppercase tracking-wider mb-2">
                Medien sortieren (Drag & Drop)
              </div>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {currentMedia.map((media: MediaItem, i: number) => (
                  <div 
                    key={i}
                    draggable={isEditing}
                    onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
                    onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
                    onDrop={(e) => isEditing && handleLightboxDrop(e, i, currentLightboxPost.id)}
                    className={`aspect-square rounded bg-white/5 border overflow-hidden cursor-grab transition-colors ${
                      lightboxDraggedIdx === i 
                        ? 'opacity-50 border-blue-500' 
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    {media.youtubeId ? (
                      <div className="w-full h-full flex items-center justify-center bg-red-900/20">
                        <Youtube className="w-4 h-4 text-red-500" />
                      </div>
                    ) : getVideoSrc(media) ? (
                      <video 
                        src={getDisplayImage(getVideoSrc(media), isR2Fallback, isEmbeddedData)}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : (
                      <img 
                        src={getDisplayImage(getImageSrc(media), isR2Fallback, isEmbeddedData)}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* External Links */}
          <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Links</div>
          {currentMedia.map((media: MediaItem, i: number) => (
            (media.url || media.link) && (
              <a 
                key={i}
                href={media.url || media.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-white/50 hover:text-white transition-colors mb-2"
              >
                Link {i + 1} →
              </a>
            )
          ))}
        </div>
      </div>
    </div>
  );
};
