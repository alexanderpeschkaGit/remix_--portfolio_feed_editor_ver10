// components/modals/RearrangeModal.tsx
import React from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Undo2, Redo2, Layers, Trash2, ArrowLeft, GripVertical, Maximize2, Image as ImageIcon } from 'lucide-react';

type ThumbKind = 'image' | 'video';
type ThumbDescriptor = { kind: ThumbKind; src: string; rank: number };
type ThumbState = { descriptor: ThumbDescriptor | null; fallbackSources: string[] };

const isVideoUrl = (url?: string) =>
  !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

const isValidThumbCandidate = (url?: string) => {
  if (!url) return false;
  if (isVideoUrl(url)) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  return !!url.match(/\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i);
};

const getImageCandidateValue = (media: any, key: string) => {
  if (key === 'image_large') return media?.image_large || media?.largeUrl;
  return media?.[key];
};

const resolveThumbState = (mediaList: any[], getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined): ThumbState => {
  const fallbackSources: string[] = [];
  const fallbackSourceSet = new Set<string>();
  let bestDescriptor: ThumbDescriptor | null = null;

  const addCandidate = (src: string | undefined, rank: number, kind: ThumbKind) => {
    if (!isValidThumbCandidate(src)) return;
    const normalized = String(src);
    if (!fallbackSourceSet.has(normalized)) {
      fallbackSourceSet.add(normalized);
      fallbackSources.push(normalized);
    }
    if (!bestDescriptor || rank > bestDescriptor.rank) {
      bestDescriptor = { kind, src: normalized, rank };
    }
  };

  for (const media of mediaList) {
    if (!media) continue;

    addCandidate(getImageCandidateValue(media, 'image_thumb'), 100, 'image');
    addCandidate(getImageCandidateValue(media, 'image_preview'), 95, 'image');
    addCandidate(getImageCandidateValue(media, 'image_1k'), 90, 'image');
    addCandidate(getImageCandidateValue(media, 'image_2k'), 85, 'image');
    addCandidate(getImageCandidateValue(media, 'image_3k'), 80, 'image');
    addCandidate(getImageCandidateValue(media, 'image_large'), 75, 'image');
    addCandidate(getImageCandidateValue(media, 'image_original'), 70, 'image');
    addCandidate(getImageCandidateValue(media, 'image'), 60, 'image');
    addCandidate(getImageCandidateValue(media, 'url'), 40, 'image');
    addCandidate(getImageCandidateValue(media, 'link'), 35, 'image');

    if (!bestDescriptor && media.youtubeId) {
      const youtubeThumb = `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
      addCandidate(youtubeThumb, 30, 'image');
    }
  }

  if (!bestDescriptor) {
    for (const media of mediaList) {
      const videoSrc = getVideoSrc(media, false) || getVideoSrc(media, true);
      if (videoSrc) {
        const normalized = String(videoSrc);
        fallbackSources.push(normalized);
        bestDescriptor = { kind: 'video', src: normalized, rank: 10 };
        break;
      }
    }
  }

  return { descriptor: bestDescriptor, fallbackSources };
};

interface RearrangeModalProps {
  isReorderView: boolean;
  setIsReorderView: (v: boolean) => void;
  selectedThumbnails: string[];
  setSelectedThumbnails: (v: string[]) => void;
  isMoving: boolean;
  setIsMoving: (v: boolean) => void;
  flickrPosts: any[];
  past: { action: string }[];
  future: { posts: any[], action: string }[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  sensors: any;
  reorderScrollRef: React.RefObject<HTMLDivElement>;
  lastSelectedId: string | null;
  setLastSelectedId: (id: string | null) => void;
  
  // Callbacks
  handleUndo: () => void;
  handleRedo: () => void;
  handleMerge: () => void;
  handleBulkDelete: () => void;
  handleMoveToTarget: (id: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  onSelect: (post: any, e: React.MouseEvent) => void;
  
  // Display Props (Wichtig für den Fix!)
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  setSelectedImage: (post: any) => void;
}

const SortableThumbnailInner: React.FC<{
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
}> = ({
  post,
  isSelected,
  isMoving,
  index,
  onSelect,
  onMoveToTarget,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
  setSelectedImage
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
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

export const RearrangeModal: React.FC<RearrangeModalProps> = (props) => {
  const {
    isReorderView, setIsReorderView, selectedThumbnails, setSelectedThumbnails,
    isMoving, setIsMoving, flickrPosts, past, future, activeId, setActiveId,
    sensors, reorderScrollRef, handleUndo, handleRedo, handleMerge,
    handleBulkDelete, handleMoveToTarget, handleDragEnd, onSelect,
    isR2Fallback, isEmbeddedData, getImageSrc, getVideoSrc, getDisplayImage, setSelectedImage
  } = props;

  if (!isReorderView) return null;

  const selectedCount = selectedThumbnails.length;
  const canMove = selectedCount > 0;
  const canMerge = selectedCount >= 2;
  const canDelete = selectedCount > 0;

  return (
    <div 
      ref={reorderScrollRef} 
      className="fixed inset-0 z-50 bg-black p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col"
    >
      <div className="flex justify-between items-center mb-8 max-w-7xl mx-auto w-full">
        <h2 className="text-2xl font-light tracking-widest uppercase text-white/90">
          {isMoving ? 'Zielposition wählen' : 'Rearrange & Merge'}
        </h2>

        <div className="flex gap-4 items-center">
          {!isMoving && (
            <div className="flex gap-2 mr-4 border-r border-white/10 pr-4">
              <button
                onClick={() => setSelectedThumbnails([])}
                className="p-2 bg-white/30 hover:bg-white/40 text-white rounded-lg transition-all"
                title="Auswahl aufheben"
              ><X className="w-4 h-4" /></button>
              <button
                onClick={handleUndo}
                disabled={past.length === 0}
                className="p-2 bg-white/30 hover:bg-white/40 text-white rounded-lg disabled:opacity-30 transition-all relative group"
              >
                <Undo2 className="w-4 h-4" />
                {past.length > 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
                    Undo: {past[past.length - 1].action}
                  </div>
                )}
              </button>
              <button
                onClick={handleRedo}
                disabled={future.length === 0}
                className="p-2 bg-white/30 hover:bg-white/40 text-white rounded-lg disabled:opacity-30 transition-all relative group"
              >
                <Redo2 className="w-4 h-4" />
                {future.length > 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
                    Redo: {future[future.length - 1].action}
                  </div>
                )}
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {!isMoving ? (
              <>
                <button
                  onClick={() => setIsMoving(true)}
                  disabled={!canMove}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-30 ${canMove ? 'bg-sky-400 text-black hover:bg-sky-300 shadow-lg shadow-sky-400/20' : 'bg-white/30 text-white hover:bg-white/40'}`}
                ><ArrowLeft className="w-4 h-4" /> Verschieben ({selectedCount})</button>
                <button
                  onClick={handleMerge}
                  disabled={!canMerge}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-30 ${canMerge ? 'bg-emerald-400 text-black hover:bg-emerald-300 shadow-lg shadow-emerald-400/20' : 'bg-white/30 text-white hover:bg-white/40'}`}
                ><Layers className="w-4 h-4" /> Merge</button>
                <button
                  onClick={handleBulkDelete}
                  disabled={!canDelete}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all disabled:opacity-30 ${canDelete ? 'bg-rose-500 text-white hover:bg-rose-400 shadow-lg shadow-rose-500/20' : 'bg-white/30 text-white hover:bg-white/40'}`}
                ><Trash2 className="w-4 h-4" /> Löschen</button>
              </>
            ) : null}
            <button 
              onClick={() => { setIsReorderView(false); setSelectedThumbnails([]); setIsMoving(false); }} 
              className="px-6 py-2 bg-white/30 hover:bg-white/40 text-white rounded-full text-sm font-medium"
            >
              {isMoving ? 'Abbrechen' : 'Exit Mode'}
            </button>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <SortableContext items={flickrPosts.map(p => p.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-w-7xl mx-auto w-full">
            {flickrPosts.map((post: any, idx: number) => (
              <SortableThumbnailInner
                key={post.id} post={post} index={idx}
                isSelected={selectedThumbnails.includes(String(post.id))}
                isMoving={isMoving}
                onMoveToTarget={() => handleMoveToTarget(String(post.id))}
                onSelect={(e: React.MouseEvent) => onSelect(post, e)}
                getImageSrc={getImageSrc}
                getVideoSrc={getVideoSrc}
                getDisplayImage={getDisplayImage}
                isR2Fallback={isR2Fallback}
                isEmbeddedData={isEmbeddedData}
                setSelectedImage={setSelectedImage}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
