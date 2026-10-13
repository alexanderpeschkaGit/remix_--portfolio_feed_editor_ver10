import { useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { mergeIncomingPostsPreservingExisting } from '../utils/mergePosts';

interface UseScrapeSyncParams {
  flickrPostsRef: MutableRefObject<any[]>;
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  setFlickrPosts: Dispatch<SetStateAction<any[]>>;
  setHasUnsyncedMedia: Dispatch<SetStateAction<boolean>>;
  setIsFlickrFallback: Dispatch<SetStateAction<boolean>>;
}

export function useScrapeSync({
  flickrPostsRef,
  updatePosts,
  setFlickrPosts,
  setHasUnsyncedMedia,
  setIsFlickrFallback
}: UseScrapeSyncParams) {
const [scrapeLogs, setScrapeLogs] = useState<string[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null });
  const [fullR2SyncStatus, setFullR2SyncStatus] = useState<any>({ running: false, logs: [], done: false, error: null, progress: 0, total: 0 });
  const [uncertainMatches, setUncertainMatches] = useState<any[]>([]);
  const [showUncertain, setShowUncertain] = useState(false);
  const handleFullR2Sync = async () => {
    setHasUnsyncedMedia(false);
    setFullR2SyncStatus({ running: true, logs: ["Starte Cloudflare R2 Full Sync..."], done: false, error: null, progress: 0, total: 0 });
    setShowLogs(true);
    
    try {
      const startRes = await fetch('/api/sync/r2-full', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start full sync');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/r2-full/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setFullR2SyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setFullR2SyncStatus((prev: typeof fullR2SyncStatus) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleScrape = async (source: string) => {
    setIsScraping(true);
    setShowLogs(true);
    setScrapeLogs([`Starte Scraping für ${source}...`]);
    
    try {
      // 1. Start the scrape
      const startRes = await fetch('/api/scrape/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      }).catch(err => {
        console.error("Fetch error:", err);
        throw new Error(`Netzwerkfehler: ${err.message}. Läuft der Server?`);
      });
      
      if (!startRes.ok) {
        const errorData = await startRes.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || `Serverfehler: ${startRes.status}`);
      }

      // 2. Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/scrape/status/${source}`);
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          
          // Update logs
          if (status.logs && status.logs.length > 0) {
            setScrapeLogs(status.logs);
          }
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
            setIsScraping(false);
            
            if (status.error) {
              setScrapeLogs(prev => [...prev, `FEHLER: ${status.error}`]);
            } else {
              setScrapeLogs(prev => [...prev, "Fertig! Lade neue Daten..."]);
              
              try {
                const stateRes = await fetch('/api/state');
                const stateData = await stateRes.json();
                const newCount = (stateData.items || []).filter((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id))).length;
                updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), `Scraping beendet (${newCount} neue Posts)`);
                setIsFlickrFallback(false);
                
                
                setScrapeLogs(prev => [...prev, "Log-Fenster bleibt offen. Bitte manuell schließen."]);
              } catch (e) {
                console.error("Failed to load new state", e);
                setScrapeLogs(prev => [...prev, "Fehler beim Laden der neuen Daten. Lade Seite neu..."]);
                setTimeout(() => window.location.reload(), 2000);
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
    
    try {
      const startRes = await fetch('/api/sync/highres', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start sync');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/sync/status');
          if (!statusRes.ok) return;
          
          const status = await statusRes.json();
          setSyncStatus(status);
          setScrapeLogs(status.logs);
          
          if (status.done || status.error) {
            clearInterval(pollInterval);
            if (!status.error) {
              // Fetch uncertain matches
              const uncertainRes = await fetch('/api/sync/uncertain');
              const uncertain = await uncertainRes.json();
              setUncertainMatches(uncertain);
              if (uncertain.length > 0) {
                setShowUncertain(true);
              }
              // Refresh state
              const stateRes = await fetch('/api/state');
              const stateData = await stateRes.json();
              const newCount = (stateData.items || []).filter((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id))).length;
              updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), `High-Res Sync beendet (${newCount} neue Posts)`);
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 2000);
    } catch (error: any) {
      setSyncStatus((prev: typeof syncStatus) => ({ ...prev, running: false, error: error.message }));
      setScrapeLogs(prev => [...prev, `Fehler: ${error.message}`]);
    }
  };

  const handleConfirmMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          postId: match.postId, 
          originalPath: match.originalPath,
          baseName: match.baseName
        })
      });
      if (res.ok) {
        setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
        // Refresh state
        const stateRes = await fetch('/api/state');
        const stateData = await stateRes.json();
        const hasNew = (stateData.items || []).some((i: any) => !flickrPostsRef.current.some((p: any) => String(p.id) === String(i.id)));
        if (hasNew) {
          updatePosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items), 'High-Res Match bestätigt');
        } else {
          setFlickrPosts(current => mergeIncomingPostsPreservingExisting(current, stateData.items));
        }
      }
    } catch (e) {
      console.error("Confirm match error:", e);
    }
  };

  const handleRejectMatch = async (match: any) => {
    try {
      const res = await fetch('/api/sync/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: match.postId })
      });
      if (res.ok) {
        setUncertainMatches(prev => prev.filter(m => m.postId !== match.postId));
      }
    } catch (e) {
      console.error("Reject match error:", e);
    }
  };

  return {
    scrapeLogs,
    setScrapeLogs,
    isScraping,
    showLogs,
    setShowLogs,
    syncStatus,
    fullR2SyncStatus,
    uncertainMatches,
    showUncertain,
    setShowUncertain,
    handleFullR2Sync,
    handleScrape,
    handleHighResSync,
    handleConfirmMatch,
    handleRejectMatch
  };
}
