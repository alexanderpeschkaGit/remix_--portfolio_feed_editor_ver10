import { useState } from 'react';
import type { MutableRefObject } from 'react';

interface UseBackupsParams {
  setFlickrPosts: (updater: any) => void;
  recordHistory: (entry: any) => void;
  setPortfolioTitle: (v: string) => void;
  setPortfolioSubtitle: (v: string) => void;
  setPortfolioBio: (v: string) => void;
  setIgAccount: (v: string) => void;
  setFlickrUrl: (v: string) => void;
  ignoreCloudChangesRef: MutableRefObject<boolean>;
  setHasCloudChanges: (v: boolean) => void;
}

export function useBackups({
  setFlickrPosts,
  recordHistory,
  setPortfolioTitle,
  setPortfolioSubtitle,
  setPortfolioBio,
  setIgAccount,
  setFlickrUrl,
  ignoreCloudChangesRef,
  setHasCloudChanges
}: UseBackupsParams) {
const [showBackups, setShowBackups] = useState(false);
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [lastRestoredFilename, setLastRestoredFilename] = useState<string | null>(
    () => localStorage.getItem('portfolioLastRestoredBackup')
  );
    const loadBackups = async () => {
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      setBackupsList(data.files || []);
      setShowBackups(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setIsRestoring(filename);
    setRestoreError(null);
    
    try {
      const res = await fetch(`/api/backups/${filename}`);
      if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.statusText}`);
      
      let data: any = null;
      const isJson = filename.endsWith('.json');
      
      if (isJson) {
        data = await res.json();
      } else {
        const html = await res.text();
        // Extract data from script tag (try editor full state first, fallback to public portfolio data)
        const fullStateMatch = html.match(/<script id="editor-state-backup" type="application\/json">([\s\S]*?)<\/script>/);
        const publicMatch = html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
        
        const match = fullStateMatch || publicMatch;
        if (match && match[1]) {
          data = JSON.parse(match[1]);
        }
      }
      
      if (data) {
        const items = data.items || data.posts;
        if (items) {
          // Use the functional update to ensure we have the latest state for history
          setFlickrPosts(current => {
            recordHistory({ posts: current, action: `Backup wiederhergestellt (${filename})` });
            return items;
          });
          
          if (data.title) setPortfolioTitle(data.title);
          if (data.subtitle) setPortfolioSubtitle(data.subtitle);
          if (data.bio) setPortfolioBio(data.bio);
          if (data.scrapeConfig) {
            if (data.scrapeConfig.igAccount) setIgAccount(data.scrapeConfig.igAccount);
            if (data.scrapeConfig.flickrUrl) setFlickrUrl(data.scrapeConfig.flickrUrl);
          }
          
          // Track last restored backup for visual indicator
          setLastRestoredFilename(filename);
          localStorage.setItem('portfolioLastRestoredBackup', filename);

          // Close modal after a short delay to show success
          setTimeout(() => {
            setShowBackups(false);
            setIsRestoring(null);
          }, 500);
          
          ignoreCloudChangesRef.current = true;
          setHasCloudChanges(false);
        } else {
          throw new Error("Keine Daten im Backup gefunden.");
        }
      } else {
        throw new Error(isJson ? "JSON-Daten ungültig." : "Backup-Format ungültig (Script-Tag fehlt).");
      }
    } catch (e: any) {
      console.error("Restore failed:", e);
      setRestoreError(e.message || "Unbekannter Fehler");
      setIsRestoring(null);
    }
  };

  return {
    showBackups,
    setShowBackups,
    backupsList,
    isRestoring,
    restoreError,
    lastRestoredFilename,
    loadBackups,
    handleRestoreBackup
  };
}
