// src/components/modals/BackupsModal.tsx
import React from 'react';
import { History, X, RefreshCw, Download } from 'lucide-react';

interface BackupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  backupsList: string[];
  isRestoring: string | null;
  restoreError: string | null;
  onRestore: (filename: string) => Promise<void>;
}

const formatBackupDate = (filename: string): string => {
  const dateMatch = filename.match(/portfolio_(.*)\.html/);
  let displayDate = filename;
  
  if (dateMatch && dateMatch[1]) {
    try {
      const raw = dateMatch[1];
      const datePart = raw.substring(0, 10);
      const timePart = raw.substring(11).replace(/-/g, ':');
      const lastColonIdx = timePart.lastIndexOf(':');
      const fixedTime = timePart.substring(0, lastColonIdx) + '.' + timePart.substring(lastColonIdx + 1);
      const dateStr = `${datePart}T${fixedTime}`;
      
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        displayDate = date.toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
    } catch (e) {
      // Keep original filename on parse error
    }
  }
  
  return displayDate;
};

export function BackupsModal({
  isOpen,
  onClose,
  backupsList,
  isRestoring,
  restoreError,
  onRestore
}: BackupsModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            <History className="w-5 h-5" /> Letzte Backups
          </h2>
          <button 
            className="text-white/50 hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-2">
          {restoreError && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-xs mb-4">
              {restoreError}
            </div>
          )}
          
          {backupsList.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-4">Keine Backups vorhanden.</p>
          ) : (
            backupsList.map((filename) => {
              const displayDate = formatBackupDate(filename);
              const isThisRestoring = isRestoring === filename;

              return (
                <div key={filename} className="flex items-center justify-between bg-white/5 p-3 rounded border border-white/5 hover:border-white/20 transition-colors">
                  <div className="flex flex-col min-w-0 mr-4">
                    <span className="text-sm text-white/80 truncate">{displayDate}</span>
                    <span className="text-[10px] text-white/30 truncate">{filename}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={() => onRestore(filename)}
                      disabled={!!isRestoring}
                      className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded transition-colors ${
                        isThisRestoring 
                          ? 'bg-blue-500/20 text-blue-400' 
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      }`}
                    >
                      {isThisRestoring ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <History className="w-3 h-3" />
                      )}
                      {isThisRestoring ? 'Restoring...' : 'Restore'}
                    </button>
                    <a 
                      href={`/api/backups/${filename}`}
                      download={filename}
                      className="flex items-center gap-1 text-xs bg-white/5 text-white/50 hover:bg-white/10 p-1.5 rounded transition-colors"
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
