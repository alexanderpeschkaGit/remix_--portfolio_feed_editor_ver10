// components/modals/RearrangeModal.tsx
import React from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { X, Undo2, Redo2, Layers, Trash2, ArrowLeft } from 'lucide-react';
import { SortablePostTile } from './rearrange/SortablePostTile';

export { resolveThumbState, isValidThumbCandidate, isVideoUrl } from './rearrange/rearrangeThumbHelpers';
export type { ThumbKind, ThumbDescriptor, ThumbState } from './rearrange/rearrangeThumbHelpers';

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
  
  // Display helpers
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  setSelectedImage: (post: any) => void;
}

export const RearrangeModal: React.FC<RearrangeModalProps> = (props) => {
  const {
    isReorderView, setIsReorderView, selectedThumbnails, setSelectedThumbnails,
    isMoving, setIsMoving, flickrPosts, past, future, activeId: _activeId, setActiveId,
    sensors, reorderScrollRef, handleUndo, handleRedo, handleMerge,
    handleBulkDelete, handleMoveToTarget, handleDragEnd, onSelect,
    isR2Fallback, isEmbeddedData, getImageSrc, getVideoSrc, getDisplayImage, setSelectedImage
  } = props;

  if (!isReorderView) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1a1a] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#242424]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setIsReorderView(false);
              setSelectedThumbnails([]);
              setIsMoving(false);
            }}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Zurück zur Übersicht</span>
          </button>
          
          <div className="h-4 w-px bg-white/20" />
          
          <span className="text-sm font-medium text-white/50">
            {flickrPosts.length} Medien gesamt
          </span>

          {selectedThumbnails.length > 0 && (
            <span className="text-xs bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-medium">
              {selectedThumbnails.length} ausgewählt
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {selectedThumbnails.length > 0 && (
            <>
              <button
                onClick={() => setIsMoving(!isMoving)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  isMoving 
                    ? 'bg-sky-500 text-white border-sky-400 shadow-lg shadow-sky-500/20' 
                    : 'bg-white/10 hover:bg-white/15 text-white/90 border-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isMoving ? 'Klick auf Ziel zum Verschieben' : 'Verschieben'}</span>
              </button>

              <button
                onClick={handleMerge}
                disabled={selectedThumbnails.length < 2}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/90 border border-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-white/10"
                title="Ausgewählte Posts zu einem Projekt zusammenführen"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Zusammenführen</span>
              </button>

              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Löschen ({selectedThumbnails.length})</span>
              </button>
              
              <div className="h-4 w-px bg-white/20 mx-1" />
            </>
          )}

          <button 
            onClick={handleUndo} 
            disabled={past.length === 0}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            title={past.length > 0 ? `Undo: ${past[past.length - 1].action}` : 'Rückgängig'}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          
          <button 
            onClick={handleRedo} 
            disabled={future.length === 0}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            title={future.length > 0 ? `Redo: ${future[future.length - 1].action}` : 'Wiederholen'}
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button 
            onClick={() => {
              setIsReorderView(false);
              setSelectedThumbnails([]);
              setIsMoving(false);
            }}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Grid Container */}
      <div 
        ref={reorderScrollRef} 
        className="flex-1 overflow-y-auto p-6"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={flickrPosts.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {flickrPosts.map((post, index) => (
                <SortablePostTile
                  key={post.id}
                  post={post}
                  isSelected={selectedThumbnails.includes(String(post.id))}
                  isMoving={isMoving}
                  index={index}
                  onSelect={(e) => onSelect(post, e)}
                  onMoveToTarget={() => handleMoveToTarget(String(post.id))}
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
    </div>
  );
};
