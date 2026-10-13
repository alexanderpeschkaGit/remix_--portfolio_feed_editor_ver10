import { useState } from 'react';
import { formatBytes } from '../utils/mediaHelpers';

interface UseR2MaintenanceParams {
  setError: (v: string) => void;
  setShowLogs: (v: boolean) => void;
  setScrapeLogs: (updater: any) => void;
  recordTrashUndo: (trashItems: any[], label: string) => void;
  recordHistory: (entry: any) => void;
  loadTrashItems: (openModal?: boolean) => Promise<void>;
  fetchCloudflareUsage: () => Promise<void>;
}

export function useR2Maintenance({
  setError,
  setShowLogs,
  setScrapeLogs,
  recordTrashUndo,
  recordHistory,
  loadTrashItems,
  fetchCloudflareUsage
}: UseR2MaintenanceParams) {
const [r2CleanupRunning, setR2CleanupRunning] = useState(false);
  const [legacyDupCleanupRunning, setLegacyDupCleanupRunning] = useState(false);
  const [redundancyCleanupRunning, setRedundancyCleanupRunning] = useState(false);
  const [isResettingAll, setIsResettingAll] = useState(false);
  const handleResetAll = async () => {
    if (isResettingAll) return;
    const confirm = window.confirm(
      'ACHTUNG: Das leert den kompletten R2-Bucket und baut ihn danach aus den lokalen Daten neu auf.\n\n' +
      'Lokale Dateien und Edits bleiben erhalten.\n\n' +
      'Wirklich fortfahren?'
    );
    if (!confirm) return;

    setIsResettingAll(true);
    setError('');
    try {
      const response = await fetch('/api/reset-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'YES' })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || data.details || 'R2-Rebuild fehlgeschlagen');
      }
      window.location.reload();
    } catch (e: any) {
      setError(e?.message || 'R2-Rebuild fehlgeschlagen');
      setIsResettingAll(false);
    }
  };
  
  const handleRedundancyCleanup = async () => {
    if (redundancyCleanupRunning) return;

    setRedundancyCleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Hashing R2 and local media (SHA-1)...']);

    try {
      const previewResponse = await fetch('/api/r2-redundancy/preview', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(
          previewData.error ||
          (previewData.warnings || []).join(' ') ||
          'Redundancy preview failed'
        );
      }

      const previewLogs = [
        'Redundancy scan complete.',
        `Files hashed: ${previewData.scannedCount || 0}`,
        `Redundant copies: ${previewData.duplicateCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.duplicateCount) {
        setRedundancyCleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.duplicateCount} byte-identical duplicates found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `R2 copies move to trash/ (undoable), local copies move to bak/redundant/.\n` +
            `Referenced files are always kept as the surviving copy.\n\n` +
            `Continue?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Redundancy cleanup cancelled.']);
            setRedundancyCleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving redundant copies...']);
          const executeResponse = await fetch('/api/r2-redundancy/execute', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Redundancy cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Redundancy cleanup complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'Redundanz rückgängig');
          if (Array.isArray(executeData.bakFiles) && executeData.bakFiles.length > 0) {
            recordHistory({ posts: [], bakFiles: executeData.bakFiles, action: `Redundante lokale Dateien nach bak/ (${executeData.bakFiles.length})` });
          }
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Redundancy cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setRedundancyCleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Redundancy cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setRedundancyCleanupRunning(false);
    }
  };

  // Irreversible: empties the local bak/ archive. bak/ is the last safety net,
  // so this needs an explicit typed confirmation.
  const handlePurgeBak = async () => {
    const typed = window.prompt(
      'bak/ LEEREN?\n\nAlle lokal archivierten Dateien werden unwiderruflich gelöscht.\n' +
      'Dies kann NICHT rückgängig gemacht werden.\n\nZum Bestätigen "LEEREN" eingeben:'
    );
    if (typed?.trim().toUpperCase() !== 'LEEREN') return;

    setError('');
    try {
      const res = await fetch('/api/bak/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'bak/ konnte nicht geleert werden');
      }
      setScrapeLogs(prev => [
        ...prev,
        `bak/ geleert: ${data.deletedCount || 0} Dateien (${formatBytes(data.deletedBytes || 0)}).`
      ]);
      setShowLogs(true);
    } catch (err: any) {
      setError(err.message || 'bak/ konnte nicht geleert werden');
    }
  };


  const handleR2Cleanup = async () => {
    if (r2CleanupRunning) return;

    setR2CleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Scanning R2 for orphaned files...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Cleanup preview failed');
      }

      const previewLogs = [
        'R2 scan complete.',
        `Files checked: ${previewData.scannedCount || 0}`,
        `Orphaned files: ${previewData.orphanedCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.orphanedCount) {
        setR2CleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.orphanedCount} orphaned R2 files found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Move these files to the trash?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Move to trash cancelled.']);
            setR2CleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving orphaned files to trash...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Move to trash complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'R2-Cleanup rückgängig');
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setR2CleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setR2CleanupRunning(false);
    }
  };

  const handleLegacyDuplicateCleanup = async () => {
    if (legacyDupCleanupRunning) return;

    setLegacyDupCleanupRunning(true);
    setError('');
    setShowLogs(true);
    setScrapeLogs(['Scanning legacy uploads for duplicates...']);

    try {
      const previewResponse = await fetch('/api/r2-cleanup/preview-legacy-uploads', { method: 'POST' });
      const previewData = await previewResponse.json().catch(() => ({}));

      if (!previewResponse.ok) {
        throw new Error(previewData.error || 'Duplicate preview failed');
      }

      const previewLogs = [
        'Legacy duplicate scan complete.',
        `Legacy files checked: ${previewData.scannedCount || 0}`,
        `Safe duplicates: ${previewData.duplicateCount || 0}`,
        `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}`
      ];

      if (Array.isArray(previewData.sampleKeys) && previewData.sampleKeys.length > 0) {
        previewLogs.push('Examples:');
        previewData.sampleKeys.forEach((key: string) => previewLogs.push(`- ${key}`));
      }

      setScrapeLogs(previewLogs);

      if (!previewData.duplicateCount) {
        setLegacyDupCleanupRunning(false);
        return;
      }

      setTimeout(async () => {
        try {
          const confirmed = window.confirm(
            `${previewData.duplicateCount} safe legacy duplicates found.\n` +
            `Potential bytes affected: ${formatBytes(previewData.totalBytes || 0)}.\n\n` +
            `Move these legacy uploads to the trash?`
          );

          if (!confirmed) {
            setScrapeLogs(prev => [...prev, 'Move to trash cancelled.']);
            setLegacyDupCleanupRunning(false);
            return;
          }

          setScrapeLogs(prev => [...prev, 'Moving legacy duplicates to trash...']);
          const executeResponse = await fetch('/api/r2-cleanup/execute-legacy-uploads', { method: 'POST' });
          const executeData = await executeResponse.json().catch(() => ({}));

          if (!executeResponse.ok) {
            throw new Error(executeData.error || 'Duplicate cleanup failed');
          }

          setScrapeLogs(prev => [
            ...prev,
            'Legacy duplicate move complete.',
            `Moved files: ${executeData.movedCount || 0}`,
            `Bytes affected: ${formatBytes(executeData.movedBytes || 0)}`
          ]);

          recordTrashUndo(executeData.trashItems || [], 'Legacy-Cleanup rückgängig');
          await loadTrashItems(true);
          await fetchCloudflareUsage();
        } catch (err: any) {
          const message = err.message || 'Duplicate cleanup failed';
          setError(message);
          setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
        } finally {
          setLegacyDupCleanupRunning(false);
        }
      }, 100);
    } catch (err: any) {
      const message = err.message || 'Duplicate cleanup failed';
      setError(message);
      setScrapeLogs(prev => [...prev, `ERROR: ${message}`]);
      setLegacyDupCleanupRunning(false);
    }
  };

  return {
    r2CleanupRunning,
    legacyDupCleanupRunning,
    redundancyCleanupRunning,
    isResettingAll,
    handleResetAll,
    handleRedundancyCleanup,
    handlePurgeBak,
    handleR2Cleanup,
    handleLegacyDuplicateCleanup
  };
}
