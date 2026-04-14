# Refactoring-Strategie für App.tsx (3650+ Zeilen)

## 📊 Analyse der aktuellen Struktur

### Größe der Komponente
- **Aktuelle Größe**: 3650+ Zeilen
- **Komponenten**: 1 Mega-Komponente (App)
- **Unterkomponenten**: 2 (SortablePost, SortableThumbnail)
- **Modals**: 5 große Modal-Komponenten
- **Hooks/Funktionen**: 50+ Funktionsaufrufe

---

## 🎯 REFACTORING-PLAN

### **Phase 1: Zwei große UI-Blöcke extrahieren (300+ Zeilen)**

#### **BLOCK 1: RearrangeModal Component (~350 Zeilen)**
**Standort aktuell**: Zeilen ~3515 - 3650+ im Return-Statement
**Inhalte**:
- Header mit Toolbar (Undo/Redo, Move, Merge, Delete, Exit)
- Sortable Grid mit Thumbnails
- Selection-Logik
- DndContext für Drag & Drop

**Props zu übergeben**:
```typescript
interface RearrangeModalProps {
  isReorderView: boolean;
  setIsReorderView: (v: boolean) => void;
  selectedThumbnails: string[];
  setSelectedThumbnails: (v: string[]) => void;
  isMoving: boolean;
  setIsMoving: (v: boolean) => void;
  flickrPosts: Post[];
  past: Post[][];
  future: Post[][];
  activeId: string | null;
  sensors: any;
  
  // Callbacks
  handleUndo: () => void;
  handleRedo: () => void;
  handleMerge: () => void;
  handleBulkDelete: () => void;
  handleMoveToTarget: (id: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  
  // Props für SortableThumbnail
  onSelect: (post: Post, e: React.MouseEvent) => void;
  lastSelectedId: string | null;
  setLastSelectedId: (id: string) => void;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getDisplayImage: (url: string, r2: boolean, embedded: boolean) => string;
  setSelectedImage: (post: Post) => void;
}
```

**Custom Hook**: `useRearrangeState()`
```typescript
export const useRearrangeState = () => {
  const [isReorderView, setIsReorderView] = useState(false);
  const [selectedThumbnails, setSelectedThumbnails] = useState<string[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const resetSelection = () => {
    setSelectedThumbnails([]);
    setIsMoving(false);
    setIsReorderView(false);
  };
  
  return {
    isReorderView, setIsReorderView,
    selectedThumbnails, setSelectedThumbnails,
    lastSelectedId, setLastSelectedId,
    isMoving, setIsMoving,
    activeId, setActiveId,
    resetSelection
  };
};
```

---

#### **BLOCK 2: LightboxModal Component (~300 Zeilen)**
**Standort aktuell**: Zeilen ~3330 - ~3515 im Return-Statement
**Inhalte**:
- Lightbox mit Media-Ansicht (Bilder, Videos, YouTube)
- Sidebar mit Titel, Tags, Beschreibung
- Media-Grid zum Reordern mit Drag & Drop
- Navigation (Previous/Next)

**Props zu übergeben**:
```typescript
interface LightboxModalProps {
  currentLightboxPost: Post | null;
  setSelectedImage: (post: Post | null) => void;
  isHoveringLightboxBg: boolean;
  setIsHoveringLightboxBg: (v: boolean) => void;
  lightboxMousePos: { x: number; y: number };
  setLightboxMousePos: (v: { x: number; y: number }) => void;
  lightboxDraggedIdx: number | null;
  setLightboxDraggedIdx: (idx: number | null) => void;
  imageDimensions: Record<string, string>;
  showResolutions: boolean;
  isEditing: boolean;
  
  // Media-Funktionen
  currentMediaIndex: number;
  setCurrentMediaIndex: (idx: number) => void;
  currentMedia: any[];
  
  // Callbacks
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (e: React.DragEvent, i: number, postId: string) => void;
  
  // Display-Funktionen
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
}
```

**Custom Hook**: `useLightboxState()`
```typescript
export const useLightboxState = () => {
  const [currentLightboxPost, setCurrentLightboxPost] = useState<any | null>(null);
  const [lightboxMousePos, setLightboxMousePos] = useState({ x: 0, y: 0 });
  const [isHoveringLightboxBg, setIsHoveringLightboxBg] = useState(false);
  const [lightboxDraggedIdx, setLightboxDraggedIdx] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState<Record<string, string>>({});
  
  const handleImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions(prev => ({
      ...prev,
      [id]: `${img.naturalWidth} x ${img.naturalHeight} px`
    }));
  };
  
  const closeLightbox = () => {
    setCurrentLightboxPost(null);
    setIsHoveringLightboxBg(false);
    setLightboxDraggedIdx(null);
  };
  
  return {
    currentLightboxPost, setCurrentLightboxPost,
    lightboxMousePos, setLightboxMousePos,
    isHoveringLightboxBg, setIsHoveringLightboxBg,
    lightboxDraggedIdx, setLightboxDraggedIdx,
    imageDimensions, setImageDimensions,
    handleImageLoad,
    closeLightbox
  };
};
```

---

### **Phase 2: Custom Hooks für State-Logik auslagern**

#### **Hook 1: `usePortfolioSync()` - Alle Sync/Scrape-Funktionen (~200 Zeilen)**
```typescript
export const usePortfolioSync = (posts: any[], setPosts: any) => {
  const [isScraping, setIsScraping] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ 
    running: false, logs: [], done: false, error: null, progress: 0, total: 0 
  });
  const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);

  const handleScrape = async (source: 'flickr' | 'instagram' | 'combined' | 'flickr_html') => {
    // Alle Scraping-Logik
  };

  const handleHighResSync = async () => {
    // Highres Sync Logik
  };

  const handleFullR2Sync = async () => {
    // R2 Full Sync Logik
  };

  return {
    isScraping, setIsScraping,
    syncStatus, setSyncStatus,
    fullR2SyncStatus, setFullR2SyncStatus,
    scrapeLogs, setScrapeLogs,
    handleScrape,
    handleHighResSync,
    handleFullR2Sync
  };
};
```

**Eingebundene Funktionen**:
- `handleScrape()` (~180 Zeilen)
- `handleHighResSync()` (~120 Zeilen)
- `handleFullR2Sync()` (~80 Zeilen)
- `handleSyncFromCloudflare()` (~80 Zeilen)

---

#### **Hook 2: `usePostEditing()` - Alle Post-Mutations-Funktionen (~250 Zeilen)**
```typescript
export const usePostEditing = (
  posts: any[], 
  setPosts: any,
  updatePosts: any
) => {
  const handlePostChange = (id: string, field: string, value: any) => { };
  const handleYoutubeChange = (id: string, value: string) => { };
  const handleDeletePost = (id: string) => { };
  const handleMergeDown = (index: number) => { };
  const handleUpdatePostMedia = (id: string, newMedia: any[]) => { };
  const handleStateToggle = (id: string, stateId: string) => { };
  const handleToggleHidden = (id: string) => { };
  
  return {
    handlePostChange,
    handleYoutubeChange,
    handleDeletePost,
    handleMergeDown,
    handleUpdatePostMedia,
    handleStateToggle,
    handleToggleHidden
  };
};
```

**Eingebundene Funktionen**:
- `handlePostChange()` (~15 Zeilen)
- `handleYoutubeChange()` (~20 Zeilen)
- `handleDeletePost()` (~20 Zeilen)
- `handleMergeDown()` (~40 Zeilen)
- `handleUpdatePostMedia()` (~30 Zeilen)
- `handleStateToggle()` (~15 Zeilen)
- `handleToggleHidden()` (~10 Zeilen)

---

#### **Hook 3: `useUndoRedo()` - Undo/Redo State-Verwaltung (~80 Zeilen)**
```typescript
export const useUndoRedo = (initialState: any[]) => {
  const [state, setState] = useState(initialState);
  const [past, setPast] = useState<any[][]>([]);
  const [future, setFuture] = useState<any[][]>([]);

  const updateState = (newState: any[]) => {
    setPast(p => [...p, state].slice(-50));
    setFuture([]);
    setState(newState);
  };

  const handleUndo = () => {
    if (past.length === 0) return;
    const newPast = [...past];
    const previousState = newPast.pop()!;
    setFuture(f => [state, ...f].slice(0, 50));
    setState(previousState);
    setPast(newPast);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const newFuture = [...future];
    const nextState = newFuture.shift()!;
    setPast(p => [...p, state].slice(-50));
    setState(nextState);
    setFuture(newFuture);
  };

  return { state, setState: updateState, past, future, handleUndo, handleRedo };
};
```

---

#### **Hook 4: `useBackups()` - Backup-Verwaltung (~120 Zeilen)**
```typescript
export const useBackups = (posts: any[], setPosts: any) => {
  const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<string[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadBackups = async () => { };
  const handleRestoreBackup = async (filename: string) => { };

  return {
    showBackups, setShowBackups,
    backupsList, setBackupsList,
    isRestoring, setIsRestoring,
    restoreError, setRestoreError,
    loadBackups,
    handleRestoreBackup
  };
};
```

---

### **Phase 3: Weitere Modal-Komponenten extrahieren**

#### **Zu extrahierende Components**:
1. `BackupsModal.tsx` (~80 Zeilen)
2. `ScrapingLogsModal.tsx` (~100 Zeilen)
3. `UncertainMatchesModal.tsx` (~150 Zeilen)
4. `MergeConfirmationModal.tsx` - schon separat (~30 Zeilen)

---

## 📁 Neue Verzeichnis-Struktur

```
src/
├── App.tsx (gekürzt auf ~800-1000 Zeilen)
├── components/
│   ├── modals/
│   │   ├── RearrangeModal.tsx
│   │   ├── LightboxModal.tsx
│   │   ├── BackupsModal.tsx
│   │   ├── ScrapingLogsModal.tsx
│   │   ├── UncertainMatchesModal.tsx
│   │   └── MergeConfirmationModal.tsx
│   ├── posts/
│   │   ├── SortablePost.tsx
│   │   ├── SortableThumbnail.tsx
│   │   └── PostCard.tsx
│   ├── header/
│   │   ├── AdminButtonBar.tsx
│   │   └── PortfolioHeader.tsx
│   └── common/
│       ├── CloudflareUsageDisplay.tsx
│       └── AdminButton.tsx
├── hooks/
│   ├── usePortfolioSync.ts
│   ├── usePostEditing.ts
│   ├── useUndoRedo.ts
│   ├── useBackups.ts
│   ├── useLightboxState.ts
│   └── useRearrangeState.ts
├── utils/
│   ├── mediaHelpers.ts
│   ├── htmlGeneration.ts
│   └── mediaProcessing.ts
└── types/
    ├── post.ts
    └── index.ts
```

---

## ✅ Vorteile dieser Aufteilung

| Vorteil | Beschreibung |
|---------|-------------|
| **Wartbarkeit** | ↓ 70% weniger Code pro Datei |
| **Reusability** | Hooks können in anderen Komponenten genutzt werden |
| **Testing** | Custom Hooks einfach unit-testbar |
| **Performance** | Bessere Code-Splitting möglich |
| **Collaboration** | Mehrere Dev können parallel arbeiten |
| **Navigation** | Einfacher durch Codebase zu navigieren |

---

## 🚀 Implementierungs-Reihenfolge

1. **Schritt 1**: Hooks extrahieren (1-2 Stunden)
   - `useUndoRedo.ts` (einfach, unabhängig)
   - `useRearrangeState.ts` (einfach, unabhängig)
   - `useLightboxState.ts` (einfach, unabhängig)

2. **Schritt 2**: Modal-Komponenten extrahieren (2-3 Stunden)
   - `RearrangeModal.tsx` (groß, aber unabhängig)
   - `LightboxModal.tsx` (groß, aber unabhängig)
   - `BackupsModal.tsx` (klein, schnell)

3. **Schritt 3**: Komplexe Hooks (3-4 Stunden)
   - `usePortfolioSync.ts` (viele API-Calls)
   - `usePostEditing.ts` (viele State-Updates)
   - `useBackups.ts` (mit API-Integration)

4. **Schritt 4**: Header-Komponenten (1-2 Stunden)
   - `AdminButtonBar.tsx`
   - `PortfolioHeader.tsx`

5. **Schritt 5**: Utility-Funktionen (1 Stunde)
   - `mediaHelpers.ts`
   - `htmlGeneration.ts` (ganz raus aus App.tsx)

---

## ⚠️ Wichtige Hinweise

- **Keine Logik-Änderungen**: Alle Funktionen werden 1:1 extrahiert
- **Props-Passing**: Komplette Props-Typisierung
- **Backward-Compatibility**: App.tsx importiert alle Komponenten/Hooks
- **Testing**: Nach jedem Schritt testen
- **Git-Strategy**: Kleine, atomare Commits pro Komponente

