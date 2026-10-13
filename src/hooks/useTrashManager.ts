import { useState } from 'react';
import type { UndoHistoryEntry } from '../types';

interface UseTrashManagerParams {
  fetchCloudflareUsage: () => Promise<void>;
  recordHistory: (entry: UndoHistoryEntry) => void;
}

export function useTrashManager({
  fetchCloudflareUsage,
  recordHistory
}: UseTrashManagerParams) {
const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const loadTrashItems = async (openModal = false) => {
    setTrashLoading(true);
    setTrashError(null);
    if (openModal) setShowTrashModal(true);

    try {
      const res = await fetch('/api/r2-trash');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load trash items');
      }

      setTrashItems(data.items || []);
    } catch (error: any) {
      setTrashError(error.message || 'Failed to load trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleOpenTrash = async () => {
    await loadTrashItems(true);
  };

  const handleRestoreTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;
    setTrashLoading(true);
    setTrashError(null);

    try {
      const res = await fetch('/api/r2-trash/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore trash items');
      }

      await loadTrashItems(true);
      if ((data.conflictCount || 0) > 0) {
        setTrashError(`${data.conflictCount} item(s) were skipped because the original file already exists.`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to restore trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleDeleteTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;
    setTrashLoading(true);
    setTrashError(null);

    try {
      // Archive (not hard delete): each object is first streamed into bak/r2-trash/
      // and only removed from R2 after the local write verified, so the last copy
      // always survives. Use the explicit permanent-delete action to skip bak/.
      const res = await fetch('/api/r2-trash/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive trash items');
      }

      if (Array.isArray(data.bakFiles) && data.bakFiles.length > 0) {
        recordHistory({ posts: [], bakFiles: data.bakFiles, action: `Trash archiviert (${data.bakFiles.length} Dateien in bak/)` });
      }

      await loadTrashItems(true);
      if ((data.skippedCount || 0) > 0) {
        setTrashError(`${data.skippedCount} item(s) could not be archived (R2 copy kept).`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to archive trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  // Irreversible: removes the R2 trash copy WITHOUT writing anything to bak/.
  const handlePermanentlyDeleteTrashItems = async (trashKeys: string[]) => {
    if (trashKeys.length === 0) return;

    const confirmed = window.confirm(
      `${trashKeys.length} Datei(en) werden UNWIDERruflich gelöscht.\n\n` +
      `Es wird KEINE Kopie in bak/ abgelegt. Diese Dateien sind danach nicht wiederherstellbar.\n\n` +
      `Trotzdem fortfahren?`
    );
    if (!confirmed) return;

    setTrashLoading(true);
    setTrashError(null);

    try {
      const res = await fetch('/api/r2-trash/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashKeys })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete trash items');
      }

      await loadTrashItems(true);
      if ((data.skippedCount || 0) > 0) {
        setTrashError(`${data.skippedCount} item(s) could not be deleted.`);
      }
      await fetchCloudflareUsage();
    } catch (error: any) {
      setTrashError(error.message || 'Failed to delete trash items');
    } finally {
      setTrashLoading(false);
    }
  };

  return {
    showTrashModal,
    setShowTrashModal,
    trashItems,
    trashLoading,
    trashError,
    loadTrashItems,
    handleOpenTrash,
    handleRestoreTrashItems,
    handleDeleteTrashItems,
    handlePermanentlyDeleteTrashItems
  };
}
