// components/modals/RearrangeModal.tsx
import React from 'react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { X, Undo2, Redo2, ArrowLeft, Layers, Trash2 } from 'lucide-react';
import { SortableThumbnail } from '../posts/SortableThumbnail';

interface RearrangeModalProps {
  isReorderView: boolean;
  setIsReorderView: (v: boolean) => void;
  selectedThumbnails: string[];
  setSelectedThumbnails: (v: string[]) => void;
  isMoving: boolean;
  setIsMoving: (v: boolean) => void;
  flickrPosts: any[];
  past: any[][];
  future: any[][];
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
  
  // Display
  onSelect: (post: any, e: React.MouseEvent) => void;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getDisplayImage: (url: string, r2: boolean, embedded: boolean) => string;
  setSelectedImage: (post: any) => void;
}

/**
 * RearrangeModal Component
 * 
 * Große Modal-Komponente für:
 * - Bilder sortieren (Drag & Drop)
 * - Bilder verschieben
 * - Projekte zusammenführen
 * - Projekte löschen
 * - Undo/Redo
 * 
 * Größe: ~350 Zeilen
 */
export const RearrangeModal: React.FC<RearrangeModalProps> = ({
  isReorderView,
  setIsReorderView,
  selectedThumbnails,
  setSelectedThumbnails,
  isMoving,
  setIsMoving,
  flickrPosts,
  past,
  future,
  activeId,
  setActiveId,
  sensors,
  reorderScrollRef,
  lastSelectedId,
  setLastSelectedId,
  handleUndo,
  handleRedo,
  handleMerge,
  handleBulkDelete,
  handleMoveToTarget,
  handleDragEnd,
  onSelect,
  isR2Fallback,
  isEmbeddedData,
  getDisplayImage,
  setSelectedImage
}) => {
  if (!isReorderView) return null;

  return (
    <div 
      ref={reorderScrollRef} 
      className="fixed inset-0 z-50 bg-black p-4 md:p-8 overflow-y-auto custom-scrollbar flex flex-col"
    >
      {/* Header Toolbar */}
      <div className="flex justify-between items-center mb-8 max-w-7xl mx-auto w-full">
        <h2 className="text-2xl font-light tracking-widest uppercase text-white/90">
          {isMoving ? 'Zielposition wählen' : 'Rearrange & Merge'}
        </h2>

        <div className="flex gap-4 items-center">
          {/* Undo/Redo/Clear Controls */}
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

          {/* Action Buttons */}
          {!isMoving && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsMoving(true)}
                disabled={selectedThumbnails.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-green-500"
              >
                <ArrowLeft className="w-4 h-4" /> Verschieben ({selectedThumbnails.length})
              </button>
              <button
                onClick={handleMerge}
                disabled={selectedThumbnails.length < 2}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-blue-500"
              >
                <Layers className="w-4 h-4" /> Merge ({selectedThumbnails.length})
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedThumbnails.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-full text-sm font-medium disabled:opacity-30 transition-all hover:bg-red-500"
              >
                <Trash2 className="w-4 h-4" /> Löschen ({selectedThumbnails.length})
              </button>
            </div>
          )}

          {/* Exit Button */}
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
        </div>
      </div>

      {/* Sortable Grid */}
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
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-w-7xl mx-auto w-full">
            {flickrPosts.map((post: any) => (
              <SortableThumbnail 
                key={post.id} 
                post={post} 
                isSelected={selectedThumbnails.includes(post.id)}
                isMoving={isMoving}
                onMoveToTarget={() => handleMoveToTarget(post.id)}
                onSelect={(e: React.MouseEvent) => onSelect(post, e)}
                index={selectedThumbnails.indexOf(post.id)}
                isR2Fallback={isR2Fallback}
                isEmbeddedData={isEmbeddedData}
                getDisplayImage={getDisplayImage}
                setSelectedImage={setSelectedImage}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
