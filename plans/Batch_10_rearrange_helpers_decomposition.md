# Flash Execution Blueprint: RearrangeModal Helpers & Tile Decomposition (Batch 10)

## Execution Metadata
- **Task Complexity:** `2.5 / 10` (Pure Helper & Leaf-Component Extraktion, keine externen Seiteneffekte)
- **Target Execution Model:** `flash` (Single-Action Protocol: keine verketteten Shell-Befehle mit `&&` oder `;`)
- **Primary Goal:** Dekomposition von `src/components/modals/RearrangeModal.tsx` (384 Zeilen) auf ~150 Zeilen durch Extraktion von Thumbnail-Helpers und der Sortable-Tile-Komponente.

---

## 1. Datei-Übersicht & Ziel-Architektur

1. `src/components/modals/rearrange/rearrangeThumbHelpers.ts` (Neu, ~85 Zeilen):
   Reine Thumbnail-Ranking-Logik und URL-Validierung (`ThumbKind`, `ThumbDescriptor`, `ThumbState`, `isVideoUrl`, `isValidThumbCandidate`, `getImageCandidateValue`, `resolveThumbState`).
2. `src/components/modals/rearrange/SortablePostTile.tsx` (Neu, ~140 Zeilen):
   Die DND-Tile-Komponente mit Lazy-Loading via `IntersectionObserver` und Fallback-Bildkette.
3. `src/components/modals/RearrangeModal.tsx` (Refaktorisiert, ~155 Zeilen):
   Schlanker Modal-Container, der `SortablePostTile` einbindet.

---

## 2. Schritt-für-Schritt Implementierung

### Schritt 1: `src/components/modals/rearrange/rearrangeThumbHelpers.ts` anlegen

Erstelle die neue Datei `src/components/modals/rearrange/rearrangeThumbHelpers.ts`:

```typescript
export type ThumbKind = 'image' | 'video';
export type ThumbDescriptor = { kind: ThumbKind; src: string; rank: number };
export type ThumbState = { descriptor: ThumbDescriptor | null; fallbackSources: string[] };

export const isVideoUrl = (url?: string): boolean =>
  !!url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isValidThumbCandidate = (url?: string): boolean => {
  if (!url) return false;
  if (isVideoUrl(url)) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  return !!url.match(/\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i);
};

export const getImageCandidateValue = (media: any, key: string): any => {
  if (key === 'image_large') return media?.image_large || media?.largeUrl;
  return media?.[key];
};

export const resolveThumbState = (
  mediaList: any[],
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined
): ThumbState => {
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

    if (!bestDescriptor && (media.type === 'bunny' || media.videoId) && media.libraryId && media.videoId) {
      const bunnyThumb = `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`;
      addCandidate(bunnyThumb, 30, 'image');
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
```

---

### Schritt 2: `src/components/modals/rearrange/SortablePostTile.tsx` anlegen

Erstelle die neue Datei `src/components/modals/rearrange/SortablePostTile.tsx`:

```tsx
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
```

---

### Schritt 3: `src/components/modals/RearrangeModal.tsx` verschlanken

Ersetze den Inhalt von `src/components/modals/RearrangeModal.tsx` vollständig durch die folgende Version:

```tsx
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
    isMoving, setIsMoving, flickrPosts, past, future,
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white/90 border border-white/10 transition-colors"
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
            title="Rückgängig"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          
          <button 
            onClick={handleRedo} 
            disabled={future.length === 0}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            title="Wiederholen"
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
                  isSelected={selectedThumbnails.includes(post.id)}
                  isMoving={isMoving}
                  index={index}
                  onSelect={(e) => onSelect(post, e)}
                  onMoveToTarget={() => handleMoveToTarget(post.id)}
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
```

---

## 3. Validierungs-Schritte (Single-Action Protocol)

Nachdem alle Dateien angelegt und modifiziert wurden, führe die Validierung sequenziell aus:

1. `npm run lint` (überprüft Typen via `tsc --noEmit`)
2. `npm test` (überprüft alle 45 Unit-Tests)

---

## 4. Git Checkpoint

Nach erfolgreicher Validierung:
```powershell
git add src/components/modals/rearrange/rearrangeThumbHelpers.ts src/components/modals/rearrange/SortablePostTile.tsx src/components/modals/RearrangeModal.tsx
git commit -m "refactor(rearrange): extract rearrangeThumbHelpers and SortablePostTile from RearrangeModal"
```
