// Integration Guide: How to integrate extracted hooks and components

/**
 * STEP 1: Import new Hooks in App.tsx (at the top)
 */
import { useRearrangeState } from './hooks/useRearrangeState';
import { useLightboxState } from './hooks/useLightboxState';

/**
 * STEP 2: Import new Components (at the top)
 */
import { RearrangeModal } from './components/modals/RearrangeModal';
import { LightboxModal } from './components/modals/LightboxModal';


/**
 * STEP 3: In App component, replace state declarations with hooks
 */
// DELETE these state declarations:
// const [isReorderView, setIsReorderView] = useState(false);
// const [selectedThumbnails, setSelectedThumbnails] = useState<string[]>([]);
// const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
// const [isMoving, setIsMoving] = useState(false);
// const [activeId, setActiveId] = useState<string | null>(null);
// const [moveToPosition, setMoveToPosition] = useState<string | null>(null);

// REPLACE with hook call (around line 100):
const rearrangeState = useRearrangeState();

// Destructure for easier access throughout component:
const {
  isReorderView,
  setIsReorderView,
  selectedThumbnails,
  setSelectedThumbnails,
  lastSelectedId,
  setLastSelectedId,
  isMoving,
  setIsMoving,
  activeId,
  setActiveId,
  resetSelection,
  toggleSelection,
  enterMoveMode,
  exitMoveMode,
  confirmMove
} = rearrangeState;


/**
 * STEP 4: Replace lightbox-related state declarations
 */
// DELETE these:
// const [currentLightboxPost, setCurrentLightboxPost] = useState<Post | null>(null);
// const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
// const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
// const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);
// const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});

// REPLACE with (around line 150):
const lightboxState = useLightboxState();

// Destructure:
const {
  currentLightboxPost,
  setCurrentLightboxPost,
  lightboxMousePos,
  setLightboxMousePos,
  isHoveringLightboxBg,
  setIsHoveringLightboxBg,
  lightboxDraggedIdx,
  setLightboxDraggedIdx,
  imageDimensions,
  setImageDimensions,
  currentMediaIndex,
  setCurrentMediaIndex,
  openLightbox,
  closeLightbox,
  nextMedia,
  previousMedia,
  handleImageLoad,
  startDragMedia,
  endDragMedia,
  getCurrentMedia,
  getCurrentMediaItem
} = lightboxState;


/**
 * STEP 5: Replace card click handler
 * 
 * BEFORE (currently inline in post card onClick):
 * onClick={() => {
 *   setCurrentLightboxPost(post);
 *   setCurrentMediaIndex(0);
 *   setLightboxDraggedIdx(null);
 *   setImageDimensions({});
 * }}
 * 
 * AFTER:
 * onClick={() => openLightbox(post)}
 */


/**
 * STEP 6: Replace lightbox next/previous handlers
 * 
 * BEFORE:
 * const handleNextMedia = () => {
 *   const media = currentLightboxPost?.mergedMedia || [currentLightboxPost];
 *   setCurrentMediaIndex((prev) => (prev + 1) % media.length);
 * };
 * 
 * AFTER (use hook methods):
 * <button onClick={nextMedia}>Next</button>
 * <button onClick={previousMedia}>Previous</button>
 */


/**
 * STEP 7: Replace RearrangeModal inline JSX
 * 
 * BEFORE (find in return statement, ~350 lines):
 * {isReorderView && (
 *   <div ref={reorderScrollRef} className="fixed inset-0 z-50 bg-black p-4...">
 *     {/* entire modal code */}
 *   </div>
 * )}
 * 
 * AFTER (replace with single line):
 */
// In App's return JSX, replace the large rearrange modal section with:
<RearrangeModal
  isReorderView={isReorderView}
  setIsReorderView={setIsReorderView}
  selectedThumbnails={selectedThumbnails}
  setSelectedThumbnails={setSelectedThumbnails}
  isMoving={isMoving}
  setIsMoving={setIsMoving}
  flickrPosts={flickrPosts}
  past={past}
  future={future}
  activeId={activeId}
  setActiveId={setActiveId}
  sensors={sensors}
  reorderScrollRef={reorderScrollRef}
  lastSelectedId={lastSelectedId}
  setLastSelectedId={setLastSelectedId}
  handleUndo={handleUndo}
  handleRedo={handleRedo}
  handleMerge={handleMerge}
  handleBulkDelete={handleBulkDelete}
  handleMoveToTarget={handleMoveToTarget}
  handleDragEnd={handleDragEnd}
  onSelect={onSelect}
  isR2Fallback={isR2Fallback}
  isEmbeddedData={isEmbeddedData}
  getDisplayImage={getDisplayImage}
  setSelectedImage={setSelectedImage}
/>


/**
 * STEP 8: Replace LightboxModal inline JSX
 * 
 * BEFORE (find in return statement, ~300 lines):
 * {currentLightboxPost && (
 *   <div className="fixed inset-0 z-50 bg-black/95...">
 *     {/* entire lightbox modal code */}
 *   </div>
 * )}
 * 
 * AFTER (replace with component):
 */
<LightboxModal
  currentLightboxPost={currentLightboxPost}
  currentMediaIndex={currentMediaIndex}
  setCurrentMediaIndex={setCurrentMediaIndex}
  currentMedia={getCurrentMedia()}
  isHoveringLightboxBg={isHoveringLightboxBg}
  setIsHoveringLightboxBg={setIsHoveringLightboxBg}
  lightboxMousePos={lightboxMousePos}
  setLightboxMousePos={setLightboxMousePos}
  lightboxDraggedIdx={lightboxDraggedIdx}
  setLightboxDraggedIdx={setLightboxDraggedIdx}
  imageDimensions={imageDimensions}
  showResolutions={showResolutions}
  isEditing={isEditing}
  isR2Fallback={isR2Fallback}
  isEmbeddedData={isEmbeddedData}
  onClose={closeLightbox}
  onNextMedia={nextMedia}
  onPreviousMedia={previousMedia}
  handleImageLoad={handleImageLoad}
  handleLightboxDragStart={handleLightboxDragStart}
  handleLightboxDragOver={handleLightboxDragOver}
  handleLightboxDrop={handleLightboxDrop}
  getImageSrc={getImageSrc}
  getVideoSrc={getVideoSrc}
  getDisplayImage={getDisplayImage}
/>


/**
 * STEP 9: Summary of App.tsx size reduction
 * 
 * BEFORE:
 * - App.tsx: 3650 lines (all logic, state, UI)
 * - No modular hooks
 * - No extracted components
 * 
 * AFTER:
 * - App.tsx: ~2800 lines (remaining core logic + post grid)
 * - 2 custom hooks: useRearrangeState.ts (~80 lines), useLightboxState.ts (~120 lines)
 * - 2 components: RearrangeModal.tsx (~180 lines), LightboxModal.tsx (~200 lines)
 * - Total code: ~3380 lines BUT much better organized
 * 
 * Benefits:
 * ✓ Easier to test (each component has clearly defined props)
 * ✓ Easier to maintain (state logic separated from rendering)
 * ✓ Easier to reuse (hooks can be used by other components)
 * ✓ Better TypeScript support (explicit Props interfaces)
 * ✓ Smaller bundle (dead code easier to detect)
 */


/**
 * TROUBLESHOOTING
 * 
 * Q: "toggleSelection is not defined"
 * A: Make sure to destructure rearrangeState.toggleSelection, not call it directly
 * 
 * Q: "Props don't match expected interface"
 * A: Check that you're passing all required props to components. Use TypeScript errors as guide.
 * 
 * Q: "getCurrentMedia() returns wrong data"
 * A: Make sure currentLightboxPost is not null before calling (component handles this)
 * 
 * Q: "Drag and drop not working"
 * A: Verify sensors, DndContext, and SortableContext are still properly configured
 */
