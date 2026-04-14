# Refactoring Checkliste - Phase 1: UI Block Extraktion

## Vorbereitung (30 min)
- [ ] Aktuelles App.tsx als Backup sichern (`cp App.tsx App.tsx.backup`)
- [ ] Git Branch erstellen (`git checkout -b refactor/extract-modals`)
- [ ] REFACTORING_STRATEGIE.md und diese Checkliste öffnen
- [ ] TypeScript Compiler im Editor starten (`npm run dev` i.e. keep running)

## Hook: useRearrangeState (45 min)

### Schritt 1: Hook testen (15 min)
- [ ] [src/hooks/useRearrangeState.ts](src/hooks/useRearrangeState.ts) öffnen
- [ ] Prüfen: Alle State-Variablen vorhanden?
- [ ] Prüfen: Alle Callback-Funktionen implementiert?
- [ ] Prüfen: Return-Statement vollständig?

### Schritt 2: In App.tsx importieren (5 min)
```typescript
import { useRearrangeState } from './hooks/useRearrangeState';
```
- [ ] Import hinzugefügt
- [ ] Keine TypeScript Fehler nach Import?

### Schritt 3: State Variablen ersetzen (20 min)
**FIND**: Alle diese State-Deklarationen im App.tsx (ca. Zeilen 100-130)
```typescript
const [isReorderView, setIsReorderView] = useState(false);
const [selectedThumbnails, setSelectedThumbnails] = useState<string[]>([]);
const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
const [isMoving, setIsMoving] = useState(false);
const [activeId, setActiveId] = useState<string | null>(null);
const [moveToPosition, setMoveToPosition] = useState<string | null>(null);
```

**REPLACE** mit:
```typescript
const rearrangeState = useRearrangeState();
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
```

- [ ] Alte State-Deklarationen gelöscht
- [ ] Hook-Destrukturierung hinzugefügt
- [ ] Keine TypeScript Fehler?
- [ ] `npm run dev` zeigt keine Fehler?

### Schritt 4: Funktionsaufrufe anpassen (5 min)
**SEARCH** nach diesen Patterns und prüfe, ob sie noch funktionieren:
- [ ] `setIsReorderView(...)` aufrufe prüfen
- [ ] `toggleSelection(...)` funktioniert? (neue Methode vom Hook)
- [ ] `resetSelection()` funktioniert? (neue Methode vom Hook)
- [ ] keine "X is not defined" Fehler im Browser Console

---

## Hook: useLightboxState (45 min)

### Schritt 1: Hook testen (15 min)
- [ ] [src/hooks/useLightboxState.ts](src/hooks/useLightboxState.ts) öffnen
- [ ] Prüfen: Logik für `openLightbox()` korrekt?
- [ ] Prüfen: `nextMedia()` / `previousMedia()` funktioniert mit currentMediaIndex?
- [ ] Prüfen: `getCurrentMedia()` gibt Array zurück?

### Schritt 2: In App.tsx importieren (5 min)
```typescript
import { useLightboxState } from './hooks/useLightboxState';
```
- [ ] Import hinzugefügt
- [ ] Keine TypeScript Fehler?

### Schritt 3: State Variablen ersetzen (20 min)
**FIND** (ca. Zeilen 130-160):
```typescript
const [currentLightboxPost, setCurrentLightboxPost] = useState<Post | null>(null);
const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);
const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
```

**REPLACE** mit:
```typescript
const lightboxState = useLightboxState();
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
```

- [ ] Alte State-Deklarationen gelöscht
- [ ] Alle Hook-Methoden destrukturiert
- [ ] Browser Console: Keine Fehler?

### Schritt 4: Code-Aufrufe anpassen (5 min)
**SEARCH** -and-replace diese Patterns:
- [ ] `setCurrentLightboxPost(post); setCurrentMediaIndex(0);` → `openLightbox(post);`
- [ ] `currentLightboxPost && setCurrentLightboxPost(null);` → `closeLightbox();`
- [ ] Browser Console: Lightbox öffnet/schließt noch richtig?

---

## Komponente: RearrangeModal (60 min)

### Schritt 1: Komponente vorbereiten (5 min)
- [ ] [src/components/modals/RearrangeModal.tsx](src/components/modals/RearrangeModal.tsx) öffnen
- [ ] Komponente in App.tsx importieren:
```typescript
import { RearrangeModal } from './components/modals/RearrangeModal';
```
- [ ] Import erfolgreich? (TypeScript Fehler?)

### Schritt 2: Großes RearrangeModal aus App.tsx identifizieren (10 min)
**FIND** in App.tsx return statement:
```jsx
{isReorderView && (
  <div ref={reorderScrollRef} className="fixed inset-0 z-50 bg-black p-4...
```

- [ ] Startzeile notieren (ca. Zeile ~2400)
- [ ] Endzeile notieren (ca. Zeile ~2750)
- [ ] Gesamte Zeilen-Anzahl: **350 Zeilen**
- [ ] Kompletten Code markieren und kopieren

### Schritt 3: Props in RearrangeModal vorbereiten (20 min)
Die neue RearrangeModal.tsx braucht diese Props. Prüfe in alt App.tsx:

**UI State Props:**
- [ ] `isReorderView` - verwendet im Modal?
- [ ] `selectedThumbnails` - verwendet im Modal?
- [ ] `isMoving` - verwendet im Modal?
- [ ] `activeId` - verwendet in DndContext?

**Functions Props:**
- [ ] `handleUndo` - Exists in App.tsx?
- [ ] `handleRedo` - Exists in App.tsx?
- [ ] `handleMerge` - Exists in App.tsx?
- [ ] `handleBulkDelete` - Exists in App.tsx?
- [ ] `handleDragEnd` - Exists in App.tsx?

**Wenn Funktionen fehlen:** Sie müssen noch in App.tsx implementiert werden oder aus dem Modal-Code extrahiert werden

### Schritt 4: Modal JSX ersetzen (20 min)
In App.tsx return statement, **REPLACE** das große inline modal mit:

```jsx
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
```

- [ ] Alle Props korrekt übergeben?
- [ ] Keine TypeScript Fehler?
- [ ] Modal funktioniert noch im Browser?
- [ ] Drag & Drop funktioniert?
- [ ] Buttons reagieren auf Klicks?

### Schritt 5: Tests (5 min)
- [ ] Rearrange-Button klicken → Modal öffnet?
- [ ] Items selektieren → Selection funktioniert?
- [ ] Drag & Drop → Items verschieben?
- [ ] Merge-Button → Funktioniert?
- [ ] Exit-Button → Modal schließt?

---

## Komponente: LightboxModal (60 min)

### Schritt 1: Komponente vorbereiten (5 min)
- [ ] [src/components/modals/LightboxModal.tsx](src/components/modals/LightboxModal.tsx) öffnen
- [ ] In App.tsx importieren:
```typescript
import { LightboxModal } from './components/modals/LightboxModal';
```
- [ ] Import erfolgreich?

### Schritt 2: Großes Lightbox-Modal aus App.tsx identifizieren (10 min)
**FIND** in App.tsx return statement:
```jsx
{currentLightboxPost && (
  <div className="fixed inset-0 z-50 bg-black/95...
```

- [ ] Startzeile notieren (ca. Zeile ~2800)
- [ ] Endzeile notieren (ca. Zeile ~3100)
- [ ] Gesamte Zeilen-Anzahl: **300 Zeilen**
- [ ] Kompletten Code kopieren

### Schritt 3: Props vorbereiten (20 min)
**ALL diese Props müssen in LightboxModal vorhanden sein:**

- [ ] `currentLightboxPost` - state
- [ ] `currentMediaIndex` - state
- [ ] `nextMedia()` - Funktion
- [ ] `previousMedia()` - Funktion
- [ ] `closeLightbox()` - Funktion
- [ ] `getImageSrc()` - Utility-Funktion (Exists in App?)
- [ ] `getVideoSrc()` - Utility-Funktion (Exists in App?)
- [ ] `getDisplayImage()` - Utility-Funktion (Exists in App?)

**Wenn diese fehlen:** Sie müssen noch transferiert werden!

### Schritt 4: Modal JSX ersetzen (20 min)
In App.tsx return statement, **REPLACE** das Lightbox-Modal inline code mit:

```jsx
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
```

- [ ] Props korrekt?
- [ ] Keine TypeScript Fehler?
- [ ] Lightbox öffnet noch?
- [ ] Media navigiert (Prev/Next)?
- [ ] Close funktioniert?

### Schritt 5: Tests (5 min)
- [ ] Portfolio-Item klicken → Lightbox öffnet mit Bild?
- [ ] Prev/Next Buttons → Navigation funktioniert?
- [ ] YouTube/Video → Rendert korrekt?
- [ ] Bild-Dimensionen → Zeigen die richtige Größe?
- [ ] Close/Click Outside → Schließt Modal?

---

## Validierung (30 min)

### Browser Tests
- [ ] Alle modale funktionieren?
- [ ] Keine JavaScript Fehler in Console?
- [ ] Keine TypeScript Fehler?
- [ ] Responsive Design funktioniert?

### Code Quality
- [ ] App.tsx ist jetzt ~2800 statt 3650 Zeilen?
- [ ] useRearrangeState.ts existiert und ist ~80 Zeilen?
- [ ] useLightboxState.ts existiert und ist ~120 Zeilen?
- [ ] RearrangeModal.tsx existiert und ist ~180 Zeilen?
- [ ] LightboxModal.tsx existiert und ist ~200 Zeilen?

### Git Commit
- [ ] Changes reviewen: `git diff App.tsx`
- [ ] Alles korrekt?
- [ ] Commit: `git add . && git commit -m "refactor: extract RearrangeModal and LightboxModal components"`
- [ ] Branch pushen: `git push origin refactor/extract-modals`

---

## Troubleshooting

### "ReferenceError: X is not defined"
**Lösung:** Prüfe, dass die Funktion in App.tsx existiert oder pass sie als Prop

### "Props did not match - Missing required prop 'Y'"
**Lösung:** Überprüfe INTEGRATION_GUIDE.md, alle Props müssen übergeben werden

### "Lightbox öffnet sich nicht"
**Lösung:** Prüfe, dass `onClick={() => openLightbox(post)}` im Post-Card existiert

### "TypeScript errors after import"
**Lösung:** Prüfe, dass Types in `types.ts` vollständig sind, oder importiere fehlende Typen

### "DragEnd Events funktionieren nicht"
**Lösung:** Stelle sicher, dass `sensors`, `DndContext`, `SortableContext` noch richtig konfiguriert sind

---

## Erfolgs-Kriterien ✅

Phase 1 ist **ERFOLGREICH**, wenn:

- [ ] App.tsx ist von 3650 auf ~2800-2900 Zeilen reduziert
- [ ] Alle neuen Dateien existieren:
  - [ ] `src/hooks/useRearrangeState.ts`
  - [ ] `src/hooks/useLightboxState.ts`
  - [ ] `src/components/modals/RearrangeModal.tsx`
  - [ ] `src/components/modals/LightboxModal.tsx`
- [ ] Keine TypeScript Fehler in allen Dateien
- [ ] Keine Runtime Fehler im Browser Console
- [ ] Alle Funktionalität funktioniert identisch wie vorher:
  - [ ] Rearrange Modal öffnet/funktioniert
  - [ ] Lightbox öffnet/navigiert/schließt
  - [ ] Drag & Drop funktioniert
  - [ ] Alle Events funktionieren
- [ ] Browser funktioniert smooth ohne Performance-Issues
- [ ] Git Branch mit allen Changes gepusht

---

**Nächster Schritt nach Phase 1:**
Siehe REFACTORING_STRATEGIE.md → Phase 2: Custom Hooks Extraktion

**Geschätzte Zeit:** 4-5 Stunden (20 min pro Fehler kalkuliert)
