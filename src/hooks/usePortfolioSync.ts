import { useState, useRef, useEffect } from 'react';

import { mergeIncomingPostsPreservingExisting } from '../utils/mergePosts';

interface SyncProps {
  updatePosts: (newPosts: any[] | ((p: any[]) => any[])) => void;
  setFallbackEnabled: (enabled: boolean) => void;
  setError: (error: string) => void;
}

export function usePortfolioSync({ updatePosts, setFallbackEnabled, setError }: SyncProps) {
  const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null, progress: 0, total: 0 });
  const [uncertainMatches, setUncertainMatches] = useState<any[]>([]);
  const [showUncertain, setShowUncertain] = useState(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPolling();
  }, []);

  const handleScrape = async (source: string, autoUpload?: boolean) => {
    setIsScraping(true);
    setShowLogs(true);
    setScrapeLogs([`Starte Scraping für ${source}...`]);
    clearPolling();
    
    try {
      const startRes = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Serverfehler: ${startRes.status}`);
      }

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/scrape/status/${source}`);
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          if (status.logs) setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearPolling();
            setIsScraping(false);
            
            if (status.error) {
              setScrapeLogs(prev => [...prev, `FEHLER: ${status.error}`]);
            } else {
              setScrapeLogs(prev => [...prev, "Fertig! Lade neue Daten..."]);
              const stateRes = await fetch('/api/state');
              const stateData = await stateRes.json();
              updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
              
              if (autoUpload) {
                setTimeout(() => document.getElementById('upload-btn')?.click(), 500);
              }
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setScrapeLogs(prev => [...prev, `Fehler beim Starten: ${error.message}`]);
      setIsScraping(false);
    }
  };

  const handleHighResSync = async () => {
    setSyncStatus({ running: true, logs: ["Starte High-Res Sync..."], done: false, error: null });
    setShowLogs(true);
    clearPolling();
    
    try {
      const startRes = await fetch('/api/sync/highres', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start sync');

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setSyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearPolling();
            if (!status.error) {
              const uncertainRes = await fetch('/api/sync/uncertain');
              const uncertain = await uncertainRes.json();
              setUncertainMatches(uncertain);
              if (uncertain.length > 0) setShowUncertain(true);
              
              const stateRes = await fetch('/api/state');
              const stateData = await stateRes.json();
              updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
            }
          }
        } catch (e) { console.error("Polling error:", e); }
      }, 2000);
    } catch (error: any) {
      setSyncStatus((prev: any) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleFullR2Sync = async () => {
    setFullR2SyncStatus({ running: true, logs: ["Starte Cloudflare R2 Full Sync..."], done: false, error: null, progress: 0, total: 0 });
    setShowLogs(true);
    clearPolling();
    
    try {
      const startRes = await fetch('/api/sync/r2-full', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start full sync');

      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/r2-full/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setFullR2SyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) clearPolling();
        } catch (e) { console.error("Polling error:", e); }
      }, 2000);
    } catch (error: any) {
      setFullR2SyncStatus((prev: any) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleConfirmMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: match.postId, originalPath: match.originalPath, baseName: match.baseName })
      });
      if (res.ok) {
        setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
        const stateRes = await fetch('/api/state');
        const stateData = await stateRes.json();
        updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
      }
    } catch (e) { console.error("Confirm match error:", e); }
  };

  const handleRejectMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: match.postId })
      });
      if (res.ok) setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
    } catch (e) { console.error("Reject match error:", e); }
  };

  const handleResetAll = async () => {
    const confirm = window.confirm('ACHTUNG: Das leert den kompletten R2-Bucket und baut ihn danach aus den lokalen Daten neu auf. Lokale Dateien und Edits bleiben erhalten. Wirklich fortfahren?');
    if (!confirm) return;

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
    }
  };

  return {
    scrapeLogs, isScraping, showLogs, setShowLogs,
    syncStatus, fullR2SyncStatus, uncertainMatches, showUncertain, setShowUncertain,
    handleScrape, handleHighResSync, handleFullR2Sync, handleConfirmMatch, handleRejectMatch, handleResetAll
  };
}