import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { UndoHistoryEntry, PostHistoryEntry } from '../types';

interface UseUndoHistoryParams {
  flickrPosts: any[];
  setFlickrPosts: Dispatch<SetStateAction<any[]>>;
  setHasUnpublishedChanges: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  pushStatusNotice: (kind: 'success' | 'info' | 'warning', title: string, message: string, timeoutMs?: number) => void;
  fetchCloudflareUsage: () => Promise<void>;
  loadTrashItems: (openModal?: boolean) => Promise<void>;
  shouldPushStateToR2Ref: MutableRefObject<boolean>;
}

export function useUndoHistory({
  flickrPosts,
  setFlickrPosts,
  setHasUnpublishedChanges,
  setError,
  pushStatusNotice,
  fetchCloudflareUsage,
  loadTrashItems,
  shouldPushStateToR2Ref
}: UseUndoHistoryParams) {
  const [past, setPast] = useState<UndoHistoryEntry[]>([]);
  const [future, setFuture] = useState<PostHistoryEntry[]>([]);
  const undoingR2TrashRef = useRef(false);

  const recordHistory = (entry: UndoHistoryEntry) => {
    setPast(previous => [...previous, entry].slice(-50));
    setFuture([]);
  };
const updatePosts = useCallback((newPosts: any[] | ((p: any[]) => any[]), actionDescription: string = 'Aktion durchgeführt') => {
    setFlickrPosts(current => {
      const next = typeof newPosts === 'function' ? newPosts(current) : newPosts;
      setPast((p): typeof p => [...p, { posts: current, action: actionDescription }].slice(-50)); // Keep last 50 states
      setFuture([]); // Clear future on new action
      setHasUnpublishedChanges(true);
      return next;
    });
  }, []);

  const recordTrashUndo = (trashItems: any[], label: string) => {
    const trashKeys = trashItems
      .map(item => item?.trashKey)
      .filter((key): key is string => typeof key === 'string' && key.startsWith('trash/'));
    if (trashKeys.length === 0) return;

    setPast(previous => [
      ...previous,
      { trashKeys, action: `${label} (${trashKeys.length} Dateien)` }
    ].slice(-50));
    setFuture([]);
  };

  const handleUndo = async () => {
    if (past.length === 0) return;
    const current = flickrPosts;
    const previousState = past[past.length - 1];

    if ('trashKeys' in previousState) {
      if (undoingR2TrashRef.current) return;
      undoingR2TrashRef.current = true;

      try {
        const response = await fetch('/api/r2-trash/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashKeys: previousState.trashKeys })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'R2-Trash konnte nicht rückgängig gemacht werden.');
        }

        const restoredKeys = new Set<string>(
          (Array.isArray(data.restoredItems) ? data.restoredItems : [])
            .map((item: any) => item?.trashKey)
            .filter((key: any): key is string => typeof key === 'string')
        );
        const remainingKeys = previousState.trashKeys.filter(key => !restoredKeys.has(key));

        setPast(history => {
          if (history[history.length - 1] !== previousState) return history;
          if (remainingKeys.length === 0) return history.slice(0, -1);
          return [
            ...history.slice(0, -1),
            { ...previousState, trashKeys: remainingKeys, action: `R2-Trash wiederherstellen (${remainingKeys.length} offen)` }
          ];
        });

        await loadTrashItems(false);
        await fetchCloudflareUsage();

        if (remainingKeys.length > 0) {
          pushStatusNotice(
            'warning',
            'R2-Undo teilweise ausgeführt',
            `${restoredKeys.size} Datei(en) wiederhergestellt, ${remainingKeys.length} wegen Konflikten oder Fehlern noch im Trash.`
          );
        } else {
          pushStatusNotice(
            'success',
            'R2-Undo abgeschlossen',
            `${restoredKeys.size} Datei(en) wurden an ihren ursprünglichen Pfad zurückverschoben.`
          );
        }
      } catch (undoError: any) {
        const message = undoError.message || 'R2-Trash konnte nicht rückgängig gemacht werden.';
        setError(message);
        pushStatusNotice('warning', 'R2-Undo fehlgeschlagen', message);
      } finally {
        undoingR2TrashRef.current = false;
      }
      return;
    }

    if ('bakFiles' in previousState) {
      const bakFiles = previousState.bakFiles;
      if (bakFiles.length > 0) {
        try {
          const resp = await fetch('/api/bak/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bakFiles })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Bak-Wiederherstellung fehlgeschlagen.');
          if (data.failedCount > 0) {
            pushStatusNotice('warning', 'Undo teilweise ausgeführt', `${data.restoredCount ?? 0} Datei(en) aus bak/ zurückgeholt, ${data.failedCount} fehlgeschlagen.`);
          } else {
            pushStatusNotice('success', 'Undo abgeschlossen', `${data.restoredCount ?? 0} Datei(en) aus bak/ wiederhergestellt. R2-Objekte werden beim nächsten Cloud Sync neu hochgeladen.`);
          }
        } catch (undoError: any) {
          setError(undoError.message || 'Bak-Wiederherstellung fehlgeschlagen.');
          pushStatusNotice('warning', 'Undo fehlgeschlagen', undoError.message || 'Bak-Wiederherstellung fehlgeschlagen.');
        }
      }
      shouldPushStateToR2Ref.current = true;
      setPast(p => p.slice(0, -1));
      setFuture([]);
      setFlickrPosts(previousState.posts);
      return;
    }

    setPast(p => p.slice(0, -1));
    setFuture((f): typeof f => [...f, { posts: current, action: previousState.action }].slice(-50));
    setFlickrPosts(previousState.posts);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const current = flickrPosts;
    const nextState = future[future.length - 1];
    setFuture(f => f.slice(0, -1));
    setPast((p): typeof p => [...p, { posts: current, action: nextState.action }].slice(-50));
    setFlickrPosts(nextState.posts);
  };

  return { past, future, recordHistory, updatePosts, recordTrashUndo, handleUndo, handleRedo };
}
