import React from 'react';
import { Cloud, CheckCircle, X } from 'lucide-react';

interface CloudSyncChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  changes: string[];
}

export function CloudSyncChangesModal({
  isOpen,
  onClose,
  changes,
}: CloudSyncChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-400" />
            Cloud Sync Ergebnisse
          </h2>
          <button 
            className="text-white/50 hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="bg-black/50 border border-white/5 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm custom-scrollbar">
          {changes.map((change, i) => (
            <div key={i} className={`mb-1 ${change.startsWith('+') ? 'text-green-400' : change.startsWith('-') ? 'text-red-400' : change.startsWith('~') ? 'text-yellow-400' : 'text-white/80'}`}>
              {change}
            </div>
          ))}
          {changes.length === 0 && (
            <div className="text-white/50">Keine Änderungen gefunden.</div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 py-2 rounded-lg transition-colors border border-blue-500/30"
        >
          Fertig
        </button>
      </div>
    </div>
  );
}
