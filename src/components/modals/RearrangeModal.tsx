// components/modals/RearrangeModal.tsx
import React from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Undo2, Redo2, Layers, Trash2, ArrowLeft, GripVertical, Maximize2, Image as ImageIcon } from 'lucide-react';

interface RearrangeModalProps {
  isReorderView: boolean;
  setIsReorderView: (v: boolean) => void;
  selectedThumbnails: string[];
  setSelectedThumbnails: (v: string[]) => void;
  isMoving: boolean;
  setIsMoving: (v: boolean) => void;
  flickrPosts: any[];
  past: { posts: any[], action: string }[];
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
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  setSelectedImage: (post: any) => void;
}> = ({
  post,
  isSelected,
  isMoving,
  onSelect,
  onMoveToTarget,
  getImageSrc,
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const thumbMedia = (post.mergedMedia && post.mergedMedia.length > 0)
    ? post.mergedMedia[0]
    : post;

  const src = getImageSrc(thumbMedia, false);
  const displaySrc = src ? getDisplayImage(src, isR2Fallback, isEmbeddedData) : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`aspect-square relative rounded-lg overflow-hidden group ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'} ${isMoving ? 'cursor-crosshair' : 'cursor-pointer'} ${post.hidden ? 'grayscale brightness-50' : ''}`}
      onClick={isMoving ? () => onMoveToTarget() : onSelect}
    >
      {displaySrc ? (
        <img 
          src={displaySrc} 
          alt="" 
          className="w-full h-full object-cover" 
          onError={(e) => {
            if (thumbMedia?.image_preview && e.currentTarget.src !== thumbMedia.image_preview) {
              e.currentTarget.src = thumbMedia.image_preview;
            }
          }}
        />
      ) : (
        <div className="w-full h-full bg-[#111] flex items-center justify-center text-white/40">
          <ImageIcon className="w-6 h-6" />
        </div>
      )}
      <div 
        {...attributes} 
        {...listeners}
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
    isR2Fallback, isEmbeddedData, getImageSrc, getDisplayImage, setSelectedImage
  } = props;

  if (!isReorderView) return null;

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
                  disabled={selectedThumbnails.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-white/30 text-white rounded-full text-sm font-medium disabled:opacity-30 hover:bg-white/40"
                ><ArrowLeft className="w-4 h-4" /> Verschieben ({selectedThumbnails.length})</button>
                <button
                  onClick={handleMerge}
                  disabled={selectedThumbnails.length < 2}
                className="flex items-center gap-2 px-6 py-2 bg-white/30 text-white rounded-full text-sm font-medium disabled:opacity-30 hover:bg-white/40"
                ><Layers className="w-4 h-4" /> Merge</button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedThumbnails.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-white/30 text-white rounded-full text-sm font-medium disabled:opacity-30 hover:bg-white/40"
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
                isSelected={selectedThumbnails.includes(post.id)}
                isMoving={isMoving}
                onMoveToTarget={() => handleMoveToTarget(post.id)}
                onSelect={(e: React.MouseEvent) => onSelect(post, e)}
                getImageSrc={getImageSrc}
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
