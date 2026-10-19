import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Maximize2, Image as ImageIcon } from 'lucide-react';
import { resolveThumbState } from './rearrangeThumbHelpers';

export interface SortablePostTileProps {
  post: any;
  isSelected: boolean;
  isMoving: boolean;
  index: number;
  onSelect: (e: React.MouseEvent) => void;
  onMoveToTarget: () => void;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  setSelectedImage: (post: any) => void;
}

export const SortablePostTile: React.FC<SortablePostTileProps> = ({
  post,
  isSelected,
  isMoving,
  index,
  onSelect,
  onMoveToTarget,
  getVideoSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
  setSelectedImage,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: post.id });
  const tileRef = React.useRef<HTMLDivElement | null>(null);
  const [shouldLoadMedia, setShouldLoadMedia] = React.useState(index < 60);

  React.useEffect(() => {
    if (shouldLoadMedia || !tileRef.current || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadMedia(true);
          observer.disconnect();
        }
      },
      { rootMargin: '900px 0px' }
    );

    observer.observe(tileRef.current);
    return () => observer.disconnect();
  }, [shouldLoadMedia]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
    border: isSelected ? '3px solid #38bdf8' : '1px solid rgba(255,255,255,0.12)',
    boxShadow: isSelected ? '0 0 0 2px rgba(56,189,248,0.45), 0 0 14px rgba(56,189,248,0.25)' : undefined,
  };

  const thumbMediaList = React.useMemo(
    () => ((post.mergedMedia && post.mergedMedia.length > 0) ? post.mergedMedia : [post]),
    [post, post.mergedMedia]
  );
  const { descriptor: thumbDescriptor, fallbackSources: thumbFallbackSources } = React.useMemo(
    () => resolveThumbState(thumbMediaList, getVideoSrc),
    [thumbMediaList, getVideoSrc]
  );
  const displaySrc = thumbDescriptor?.src ? getDisplayImage(thumbDescriptor.src, isR2Fallback, isEmbeddedData) : undefined;

  return (
    <div
      ref={(node) => {
        tileRef.current = node;
        setNodeRef(node);
      }}
      style={style}
      className={`aspect-square relative rounded-lg overflow-hidden group ${isMoving ? (isSelected ? 'cursor-not-allowed' : 'cursor-crosshair') : 'cursor-pointer'} ${post.hidden ? 'grayscale brightness-50' : ''}`}
      onClick={isMoving ? (isSelected ? undefined : () => onMoveToTarget()) : onSelect}
      title={isMoving && isSelected ? 'Bereits ausgewählt' : undefined}
    >
      {shouldLoadMedia && displaySrc && thumbDescriptor?.kind === 'image' ? (
        <img 
          src={displaySrc} 
          alt="" 
          className="w-full h-full object-cover" 
          loading={index < 30 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          data-thumb-fallback-index="0"
          onError={(e) => {
            const currentIndex = Number(e.currentTarget.dataset.thumbFallbackIndex || '0');
            const nextSource = thumbFallbackSources[currentIndex + 1];
            if (nextSource) {
              e.currentTarget.dataset.thumbFallbackIndex = String(currentIndex + 1);
              e.currentTarget.src = getDisplayImage(nextSource, isR2Fallback, isEmbeddedData) || nextSource;
            }
          }}
        />
      ) : shouldLoadMedia && displaySrc && thumbDescriptor?.kind === 'video' ? (
        <video
          src={displaySrc}
          className="w-full h-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="w-full h-full bg-[#111] flex items-center justify-center text-white/40">
          <ImageIcon className="w-6 h-6" />
        </div>
      )}

      {isMoving && !isSelected && (
        <div className="absolute inset-x-1 bottom-1 rounded bg-sky-400/90 text-black text-[10px] font-semibold text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          nach hier
        </div>
      )}

      <div 
        {...attributes} 
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 p-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
      >
        <GripVertical className="w-3 h-3 text-white/50" />
      </div>
      
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
    </div>
  );
};
