import React from 'react';
import { Trash2, History, Copy } from 'lucide-react';

export interface AdminHeaderMaintenanceBlockProps {
  handleR2Cleanup: () => void;
  r2CleanupRunning: boolean;
  handleLegacyDuplicateCleanup: () => void;
  legacyDupCleanupRunning: boolean;
  handleRedundancyCleanup: () => void;
  redundancyCleanupRunning: boolean;
  handleOpenTrash: () => void;
  trashCount: number;
  handlePurgeBak: () => void;
}

export const AdminHeaderMaintenanceBlock: React.FC<AdminHeaderMaintenanceBlockProps> = ({
  handleR2Cleanup,
  r2CleanupRunning,
  handleLegacyDuplicateCleanup,
  legacyDupCleanupRunning,
  handleRedundancyCleanup,
  redundancyCleanupRunning,
  handleOpenTrash,
  trashCount,
  handlePurgeBak,
}) => {
  return (
    <div className="col-span-1 flex gap-1">
      <button
        onClick={handleR2Cleanup}
        disabled={r2CleanupRunning}
        className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
      >
        <Trash2 className={`w-3 h-3 ${r2CleanupRunning ? 'animate-pulse text-white' : 'text-white'}`} />
        <span>R2</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          Scan R2 bucket for orphaned files and move them to trash.
        </div>
      </button>

      <button
        onClick={handleLegacyDuplicateCleanup}
        disabled={legacyDupCleanupRunning}
        className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
      >
        <History className={`w-3 h-3 ${legacyDupCleanupRunning ? 'animate-pulse text-white' : 'text-white'}`} />
        <span>Dupes</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          Find legacy duplicate uploads and move redundant copies to trash.
        </div>
      </button>

      <button
        onClick={handleRedundancyCleanup}
        disabled={redundancyCleanupRunning}
        className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
      >
        <Copy className={`w-3 h-3 ${redundancyCleanupRunning ? 'animate-pulse text-white' : 'text-white'}`} />
        <span>Redundant</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          Hash R2 + local media (SHA-1) and remove byte-identical copies. Referenced files are always kept.
        </div>
      </button>

      <button
        onClick={handleOpenTrash}
        className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
      >
        <Trash2 className="w-3 h-3 text-white" />
        <span>Trash{trashCount > 0 ? ` (${trashCount})` : ''}</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          Browse and restore deleted files from the R2 trash. Emptying archives to bak/.
        </div>
      </button>

      <button
        onClick={handlePurgeBak}
        className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-red-900 bg-[#4d2020] text-white transition-all hover:bg-[#5e2828] active:scale-95 disabled:opacity-30 relative group"
      >
        <Trash2 className="w-3 h-3 text-white" />
        <span>Purge bak/</span>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          Irreversibly delete the local bak/ archive (the last local safety net).
        </div>
      </button>
    </div>
  );
};
