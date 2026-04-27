import React from 'react';
import { CheckCircle, X } from 'lucide-react';

interface ConfirmSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  changes: string[];
}

export function ConfirmSyncModal({ isOpen, onClose, onConfirm, changes }: ConfirmSyncModalProps) {
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
            <CheckCircle className="w-5 h-5 text-blue-400" />
            Cloud Sync Änderungen bestätigen
          </h2>
          <button className="text-white/50 hover:text-white transition-colors p-1" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-black/50 border border-white/5 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm custom-scrollbar">
          {changes.map((c, i) => (
            <div key={i} className={`mb-1 ${c.startsWith('+') ? 'text-green-400' : c.startsWith('-') ? 'text-red-400' : c.startsWith('~') ? 'text-yellow-400' : 'text-white/80'}`}>
              {c}
            </div>
          ))}
          {changes.length === 0 && (
            <div className="text-white/50">Keine Änderungen gefunden.</div>
          )}
        </div>
        <div className="flex gap-4 mt-4">
          <button
            onClick={onConfirm}
            className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 py-2 rounded-lg transition-colors border border-green-500/30"
          >
            Ja – Änderungen übernehmen
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 py-2 rounded-lg transition-colors border border-red-500/30"
          >
            Nein – Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
