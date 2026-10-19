import React from 'react';
import { Undo2, Redo2, Eye, History, UploadCloud, Loader2, ExternalLink } from 'lucide-react';
import { AdminButton } from './AdminButton.tsx';

export interface AdminHeaderPublishSectionProps {
  handleUndo: () => void;
  past: { action: string }[];
  handleRedo: () => void;
  future: { posts: any[]; action: string }[];
  handlePreview: () => void;
  handleRestoreLatestPublish: () => void;
  restoringLatestPublish: boolean;
  handleUpload: () => void;
  uploading: boolean;
  flickrPosts: any[];
  hasUnpublishedChanges: boolean;
  uploadProgress: number | null;
  publicDomain: string | null;
  isEditing: boolean;
}

export const AdminHeaderPublishSection: React.FC<AdminHeaderPublishSectionProps> = ({
  handleUndo,
  past,
  handleRedo,
  future,
  handlePreview,
  handleRestoreLatestPublish,
  restoringLatestPublish,
  handleUpload,
  uploading,
  flickrPosts,
  hasUnpublishedChanges,
  uploadProgress,
  publicDomain,
  isEditing,
}) => {
  return (
    <>
      {/* Undo / Redo */}
      <div className="col-span-1 flex gap-1">
        <button 
          onClick={handleUndo} 
          disabled={past.length === 0} 
          className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] hover:border-[#7a7a7a] active:scale-95 disabled:opacity-30 relative group"
        >
          <Undo2 className="w-3 h-3" />
          <span>Undo</span>
          {past.length > 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out pointer-events-none whitespace-normal text-center max-w-[280px] z-[60] shadow-xl after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-white">
              Undo: {past[past.length - 1].action}
            </div>
          )}
        </button>
        <button 
          onClick={handleRedo} 
          disabled={future.length === 0} 
          className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] hover:border-[#7a7a7a] active:scale-95 disabled:opacity-30 relative group"
        >
          <Redo2 className="w-3 h-3" />
          <span>Redo</span>
          {future.length > 0 && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out pointer-events-none whitespace-normal text-center max-w-[280px] z-[60] shadow-xl after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-white">
              Redo: {future[future.length - 1].action}
            </div>
          )}
        </button>
      </div>

      {/* Preview / Restore Publish / Publish */}
      <div className="col-span-3 grid grid-cols-3 gap-1 h-full">
        <AdminButton 
          onClick={handlePreview} 
          tooltip="Preview der generierten HTML-Seite"
          className="flex-1"
        >
          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-center">Preview</span>
        </AdminButton>

        <AdminButton
          onClick={handleRestoreLatestPublish}
          disabled={restoringLatestPublish}
          tooltip="Letztes veroeffentlichtes HTML-Backup direkt wieder live schalten"
        >
          {restoringLatestPublish ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <History className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span className="text-center">{restoringLatestPublish ? 'Restore...' : 'Undo Publish'}</span>
        </AdminButton>

        <div className="relative w-full h-full">
          <AdminButton 
            id="upload-btn" 
            onClick={handleUpload} 
            disabled={uploading || flickrPosts.length === 0} 
            tooltip="Änderungen auf die Live-Website übertragen"
            active={hasUnpublishedChanges}
            className="w-full"
          >
            {uploading ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <UploadCloud className="w-3 h-3 sm:w-4 sm:h-4" />}
            <span className="text-center font-black tracking-tighter">{uploading ? '...' : 'PUBLISH'}</span>
          </AdminButton>
          {uploadProgress !== null && (
            <div className="absolute -bottom-1 left-0 w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Live Button (wenn publicDomain vorhanden) */}
      {publicDomain && (
        <div className="col-span-1 flex gap-1 h-full">
          <a 
            href={isEditing ? undefined : `https://${publicDomain}/index.html?t=${Date.now()}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 flex ${isEditing ? 'pointer-events-none' : ''}`}
          >
            <AdminButton className="w-full" disabled={isEditing} tooltip="Live Website in neuem Tab öffnen">
              <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-center">Live</span>
            </AdminButton>
          </a>
        </div>
      )}
    </>
  );
};
