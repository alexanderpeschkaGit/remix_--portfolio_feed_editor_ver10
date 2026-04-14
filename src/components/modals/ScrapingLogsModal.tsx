// src/components/modals/ScrapingLogsModal.tsx
import React from 'react';
import { RefreshCw, CheckCircle, X } from 'lucide-react';

interface ScrapingLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  isScraping: boolean;
  syncStatus: { running: boolean };
  fullR2SyncStatus: { running: boolean; progress: number; total: number };
  logsEndRef: React.RefObject<HTMLDivElement>;
}

export function ScrapingLogsModal({
  isOpen,
  onClose,
  logs,
  isScraping,
  syncStatus,
  fullR2SyncStatus,
  logsEndRef
}: ScrapingLogsModalProps) {
  if (!isOpen) return null;

  const isRunning = isScraping || syncStatus.running || fullR2SyncStatus.running;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={() => !isRunning && onClose()}
    >
      <div 
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            {isRunning ? (
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-400" />
            )}
            {fullR2SyncStatus.running 
              ? 'Cloudflare Sync' 
              : isScraping 
              ? 'Scraping Verlauf' 
              : syncStatus.running 
              ? 'High-Res Sync' 
              : 'Verlauf'
            }
          </h2>
          {!isRunning && (
            <button 
              className="text-white/50 hover:text-white transition-colors p-1"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {fullR2SyncStatus.running && fullR2SyncStatus.total > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-white/50 mb-1 uppercase tracking-wider">
              <span>Fortschritt</span>
              <span>{Math.round((fullR2SyncStatus.progress / fullR2SyncStatus.total) * 100)}%</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(fullR2SyncStatus.progress / fullR2SyncStatus.total) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-white/30 mt-1 text-right">
              {fullR2SyncStatus.progress} / {fullR2SyncStatus.total} Dateien
            </div>
          </div>
        )}
        
        <div className="bg-black/50 border border-white/5 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs.map((log, i) => (
            <div key={i} className="text-white/80 mb-1 flex items-start gap-2">
              <span className="text-blue-500/50 shrink-0">{'>'}</span>
              <span>{log}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {!isRunning && (
          <button
            onClick={onClose}
            className="mt-4 w-full bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg transition-colors"
          >
            Schließen
          </button>
        )}
      </div>
    </div>
  );
}
