import React from 'react';
import { Loader2, ExternalLink, Maximize2, X, Edit3, Save, UploadCloud, CheckCircle, Plus, Image as ImageIcon, Youtube, Trash2, GripVertical, Undo2, Redo2, FoldVertical, History, Download, RefreshCw, Instagram, ChevronUp, ChevronDown, FileCode, Layers, ArrowLeft, Eye, FileText, Camera } from 'lucide-react';

interface AdminHeaderProps {
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  portfolioTitle: string;
  setPortfolioTitle: (v: string) => void;
  portfolioSubtitle: string;
  setPortfolioSubtitle: (v: string) => void;
  igAccount: string;
  setIgAccount: (v: string) => void;
  flickrUrl: string;
  setFlickrUrl: (v: string) => void;
  isScraping: boolean;
  syncStatus: any;
  fullR2SyncStatus: any;
  isResettingAll: boolean;
  loading: boolean;
  restoringLatestPublish: boolean;
  r2CleanupRunning: boolean;
  legacyDupCleanupRunning: boolean;
  uploading: boolean;
  uploadProgress: number | null;
  past: { action: string }[];
  future: { posts: any[], action: string }[];
  uncertainMatches: any[];
  publicDomain: string | null;
  flickrPosts: any[];
  CloudflareUsageDisplay: React.ComponentType<any>;
  handleScrape: (type: string) => void;
  handleHighResSync: () => void;
  handleFullR2Sync: () => void;
  handleOpenMediaVariants: () => void;
  handleSyncFromCloudflare: () => void;
  handleResetAll: () => void;
  handlePreview: () => void;
  handleUpload: () => void;
  handleRestoreLatestPublish: () => void;
  handleR2Cleanup: () => void;
  handleLegacyDuplicateCleanup: () => void;
  handleOpenTrash: () => void;
  handleAddNewPost: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleMergeSimilar: () => void;
  loadBackups: () => void;
  setShowUncertain: (v: boolean) => void;
  setIsReorderView: (v: boolean) => void;
  isReorderView: boolean;
  setShowBioEditor: (v: boolean) => void;
  handleGetLatestInstagram: () => void;
  handleGetLatestFlickr: () => void;
  hasCloudChanges: boolean;
  hasUnsyncedMedia: boolean;
  hasUnpublishedChanges: boolean;
  trashCount: number;
}

const AdminButton = ({ onClick, disabled, id, children, className = "", tooltip, active }: any) => {
  const style = {
    ['--admin-btn-bg' as any]: active ? '#5a5a5a' : '#4d4d4d',
    ['--admin-btn-bg-hover' as any]: active ? '#6a6a6a' : '#5e5e5e',
    ['--admin-btn-border' as any]: active ? '#7a7a7a' : '#6a6a6a',
  } as React.CSSProperties;

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      style={style}
      className={`
        flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl text-[10px] sm:text-xs font-medium border transition-all duration-300
        bg-[var(--admin-btn-bg)] hover:bg-[var(--admin-btn-bg-hover)] border-[var(--admin-btn-border)] text-white
        ${active ? 'shadow-[0_0_10px_rgba(255,255,255,0.08)]' : ''}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
        relative group
        ${className}
      `}
    >
      {children}
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
          {tooltip}
        </div>
      )}
    </button>
  );
};

export function AdminHeader({
  isEditing,
  setIsEditing,
  portfolioTitle,
  setPortfolioTitle,
  portfolioSubtitle,
  setPortfolioSubtitle,
  igAccount,
  setIgAccount,
  flickrUrl,
  setFlickrUrl,
  isScraping,
  syncStatus,
  fullR2SyncStatus,
  isResettingAll,
  loading,
  restoringLatestPublish,
  r2CleanupRunning,
  legacyDupCleanupRunning,
  uploading,
  uploadProgress,
  past,
  future,
  uncertainMatches,
  publicDomain,
  flickrPosts,
  CloudflareUsageDisplay,
  handleScrape,
  handleHighResSync,
  handleFullR2Sync,
  handleOpenMediaVariants,
  handleSyncFromCloudflare,
  handleResetAll,
  handlePreview,
  handleUpload,
  handleRestoreLatestPublish,
  handleR2Cleanup,
  handleLegacyDuplicateCleanup,
  handleOpenTrash,
  handleAddNewPost,
  handleUndo,
  handleRedo,
  handleMergeSimilar,
  loadBackups,
  setShowUncertain,
  setIsReorderView,
  isReorderView,
  setShowBioEditor,
  handleGetLatestInstagram,
  handleGetLatestFlickr,
  hasCloudChanges = false,
  hasUnsyncedMedia = false,
  hasUnpublishedChanges = false,
  trashCount = 0,
}: AdminHeaderProps) {
  return (
    <header className="max-w-7xl mx-auto mb-12 relative">
      {isEditing ? (
        <div className="flex flex-col gap-4 mb-8 relative">
          <button 
            onClick={() => setIsEditing(false)}
            className="absolute -top-4 -right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
            title="Bearbeitungsmodus beenden"
          >
            <X className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={portfolioTitle}
            onChange={(e) => setPortfolioTitle(e.target.value)}
            className="w-full text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90 bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-2"
          />
          <input
            type="text"
            value={portfolioSubtitle}
            onChange={(e) => setPortfolioSubtitle(e.target.value)}
            className="w-full text-center text-white/50 mt-2 tracking-widest text-sm uppercase bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-1"
            placeholder="Subtitle"
          />
              <div className="mt-6 flex flex-col gap-3 max-w-xl mx-auto bg-white/10 p-4 rounded-xl border border-white/10">
            <div className="text-xs text-white/50 uppercase tracking-wider text-left mb-1">Scraping Sources</div>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-sm w-24 text-right">Instagram:</span>
              <input
                type="text"
                value={igAccount}
                onChange={(e) => setIgAccount(e.target.value)}
                className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
                placeholder="Instagram Username"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-sm w-24 text-right">Flickr URL:</span>
              <input
                type="text"
                value={flickrUrl}
                onChange={(e) => setFlickrUrl(e.target.value)}
                className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
                placeholder="Flickr Album URL"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-12">
          <h1 className="text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90">
            {portfolioTitle}
          </h1>
          <p className="text-center text-white/50 mt-4 tracking-widest text-sm uppercase">
            {portfolioSubtitle}
          </p>
        </div>
      )}
      
      <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-5xl mx-auto">
        {/* Cloudflare Usage Display at the top */}
        <div className="col-span-full mb-2">
          <CloudflareUsageDisplay />
        </div>

        {/* Row 1: Insta & Flickr in one standard-size split button (beginning) */}
        <div
          className="col-span-1 flex rounded-xl border border-[var(--admin-btn-border)] overflow-hidden"
          style={{ ['--admin-btn-bg' as any]: '#4d4d4d', ['--admin-btn-bg-hover' as any]: '#5e5e5e', ['--admin-btn-border' as any]: '#6a6a6a' } as React.CSSProperties}
        >
          <button
            onClick={() => handleScrape('instagram')}
            disabled={isScraping}
            title="Instagram Feed einlesen"
            className={`flex-1 flex flex-col items-center justify-center gap-1 px-1 py-3 text-[10px] sm:text-xs font-medium transition-all duration-300
              bg-[var(--admin-btn-bg)] hover:bg-[var(--admin-btn-bg-hover)] text-white
              ${isScraping ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
              border-r border-[var(--admin-btn-border)]`}
          >
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin' : ''}`} />
            <span className="text-center">Insta</span>
          </button>
          <button
            onClick={() => handleScrape('flickr')}
            disabled={isScraping}
            title="Flickr Album einlesen"
            className={`flex-1 flex flex-col items-center justify-center gap-1 px-1 py-3 text-[10px] sm:text-xs font-medium transition-all duration-300
              bg-[var(--admin-btn-bg)] hover:bg-[var(--admin-btn-bg-hover)] text-white
              ${isScraping ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
          >
            <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin' : ''}`} />
            <span className="text-center">Flickr</span>
          </button>
        </div>


        {/* Row 2 */}
        <AdminButton onClick={handleHighResSync} disabled={syncStatus.running} tooltip="Scrape Originals Ordner für bessere Auflösungen (inkl. Unterordner)">
          <Maximize2 className={`w-3 h-3 sm:w-4 sm:h-4 ${syncStatus.running ? 'animate-spin text-yellow-500' : ''}`} />
          <span className="text-center">better Res.</span>
        </AdminButton>

        <AdminButton onClick={loadBackups} disabled={isEditing} tooltip="Vorherige Versionen wiederherstellen">
          <History className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Backups</span>
        </AdminButton>

        <AdminButton
          onClick={handleResetAll}
          disabled={isEditing || isResettingAll}
          active={isResettingAll}
          tooltip="Leert den kompletten R2-Bucket und baut ihn aus den lokalen Daten neu auf."
        >
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isResettingAll ? 'animate-spin' : ''}`} />
          <span className="text-center">{isResettingAll ? 'Rebuild...' : 'Rebuild R2'}</span>
        </AdminButton>

        <AdminButton 
          onClick={handleFullR2Sync} 
          disabled={fullR2SyncStatus.running} 
          active={hasUnsyncedMedia}
          tooltip="Alle lokalen Bilder (Uploads, Flickr, etc.) zu Cloudflare R2 spiegeln"
        >
          <UploadCloud className={`w-3 h-3 sm:w-4 sm:h-4 ${fullR2SyncStatus.running ? 'animate-spin text-blue-500' : ''}`} />
          <span className="text-center">{fullR2SyncStatus.running ? 'Syncing...' : 'Cloud Sync'}</span>
        </AdminButton>

        <AdminButton
          onClick={handleOpenMediaVariants}
          disabled={fullR2SyncStatus.running}
          tooltip="Generate & verify image thumbnails (400px–3K) and video posters — check local state, verify live R2 integrity, create missing variants, and publish."
        >
          <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-center">Media Variants</span>
        </AdminButton>

        <AdminButton 
          onClick={handleSyncFromCloudflare} 
          disabled={isEditing || loading} 
          tooltip="Aktuellen Stand von Cloudflare R2 laden (überschreibt lokale Änderungen)"
          active={hasCloudChanges}
        >
          <Download className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          <span className="text-center">Load Cloud</span>
        </AdminButton>

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
            onClick={handleOpenTrash}
            className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[9px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 relative group"
          >
            <Trash2 className="w-3 h-3 text-white" />
            <span>Trash{trashCount > 0 ? ` (${trashCount})` : ''}</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
              Browse and restore deleted files from the R2 trash.
            </div>
          </button>
        </div>

        <AdminButton
          onClick={() => setShowUncertain(true)}
          disabled={uncertainMatches.length === 0 || isEditing} 
          tooltip="Unsichere High-Res Matches prüfen"
        >
          <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Review ({uncertainMatches.length})</span>
        </AdminButton>

        {/* Row 3 */}

        <AdminButton 
          onClick={() => setIsEditing(!isEditing)} 
          active={isEditing}
          tooltip={isEditing ? "Bearbeitungsmodus beenden" : "Titel und Texte bearbeiten"}
        >
          {isEditing ? <Save className="w-3 h-3 sm:w-4 sm:h-4" /> : <Edit3 className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span className="text-center">{isEditing ? 'Exit Edit' : 'Edit Mode'}</span>
        </AdminButton>

        <AdminButton 
          onClick={() => setIsReorderView(true)} 
          active={isReorderView}
          tooltip="Bilder sortieren und Projekte zusammenführen"
        >
          <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-center">Rearrange</span>
        </AdminButton>

        <AdminButton 
          onClick={handleMergeSimilar} 
          disabled={isEditing}
          tooltip="Alle Projekte mit gleichem Titel automatisch zusammenführen"
        >
          <FoldVertical className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-center">Merge Similar</span>
        </AdminButton>

        <AdminButton onClick={handleAddNewPost} tooltip="Manuellen Post hinzufügen">
          <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Neu</span>
        </AdminButton>

        <AdminButton onClick={() => setShowBioEditor(true)} tooltip="Portfolio Bio bearbeiten">
          <FileText className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Bio</span>
        </AdminButton>

        <div className="col-span-1 flex gap-1">
          <button 
            onClick={handleGetLatestInstagram} 
            disabled={isScraping}
            className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
          >
            <Instagram className="w-3 h-3 text-white" />
            <span>+ Insta</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
              Fetch the latest Instagram post and add it to the portfolio.
            </div>
          </button>
          <button 
            onClick={handleGetLatestFlickr} 
            disabled={isScraping}
            className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-[#6a6a6a] bg-[#4d4d4d] text-white transition-all hover:bg-[#5e5e5e] active:scale-95 disabled:opacity-30 relative group"
          >
            <Camera className="w-3 h-3 text-blue-400" />
            <span>+ Flickr</span>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[280px] text-center leading-relaxed whitespace-normal">
              Fetch the latest Flickr post and add it to the portfolio.
            </div>
          </button>
        </div>

        {/* Row 4 */}
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
      </div>
    </header>
  );
}
