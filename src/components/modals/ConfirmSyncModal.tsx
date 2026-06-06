import React from 'react';
import { CheckCircle, X } from 'lucide-react';

interface ConfirmSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onIgnore: () => void;
  changes: string[];
}

export function ConfirmSyncModal({ isOpen, onClose, onConfirm, onIgnore, changes }: ConfirmSyncModalProps) {
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
            Confirm Cloud Sync Changes
          </h2>
          <button className="text-white hover:text-white/90 transition-colors p-1" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-black/50 border border-white/5 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm custom-scrollbar">
          {changes.map((c, i) => (
            <div
              key={i}
              className={`mb-1 ${c.startsWith('+') ? 'text-green-400' : c.startsWith('-') ? 'text-red-400' : c.startsWith('~') ? 'text-yellow-400' : 'text-white/80'}`}
            >
              {c}
            </div>
          ))}
          {changes.length === 0 && (
            <div className="text-white/50">No changes found.</div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <button
            onClick={onIgnore}
            className="flex-1 bg-white/15 hover:bg-white/25 text-white py-2 rounded-lg transition-colors border border-white/10"
          >
            Ignore changes
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-500/30 hover:bg-blue-500/40 text-white py-2 rounded-lg transition-colors border border-blue-400/30"
          >
            Sync actual version
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg transition-colors border border-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
