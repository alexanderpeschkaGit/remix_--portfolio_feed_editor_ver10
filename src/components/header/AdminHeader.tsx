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
  past: any[];
  future: any[];
  autoUpload: boolean;
  setAutoUpload: (v: boolean) => void;
  uncertainMatches: any[];
  publicDomain: string | null;
  flickrPosts: any[];
  CloudflareUsageDisplay: React.ComponentType<any>;
  handleScrape: (type: string) => void;
  handleHighResSync: () => void;
  handleFullR2Sync: () => void;
  handleSyncFromCloudflare: () => void;
  handleResetAll: () => void;
  handlePreview: () => void;
  handleUpload: () => void;
  handleRestoreLatestPublish: () => void;
  handleR2Cleanup: () => void;
  handleLegacyDuplicateCleanup: () => void;
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
  hasCloudChanges?: boolean;
}

const AdminButton = ({ onClick, disabled, id, children, className = "", color = "bg-white/5 text-white/80 hover:bg-white/10 border-white/10", tooltip, active }: any) => (
  <button
    id={id}
    onClick={onClick}
    disabled={disabled}
    title={tooltip}
    className={`
      flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl text-[10px] sm:text-xs font-medium border transition-all duration-300
      ${active ? 'bg-blue-600/30 text-blue-300 border-blue-500/30' : color}
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
      relative group
      ${className}
    `}
  >
    {children}
    {tooltip && (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
        {tooltip}
      </div>
    )}
  </button>
);

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
  autoUpload,
  setAutoUpload,
  uncertainMatches,
  publicDomain,
  flickrPosts,
  CloudflareUsageDisplay,
  handleScrape,
  handleHighResSync,
  handleFullR2Sync,
  handleSyncFromCloudflare,
  handleResetAll,
  handlePreview,
  handleUpload,
  handleRestoreLatestPublish,
  handleR2Cleanup,
  handleLegacyDuplicateCleanup,
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
          <div className="mt-6 flex flex-col gap-3 max-w-xl mx-auto bg-white/5 p-4 rounded-xl border border-white/10">
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

        {/* Row 1 */}
        <AdminButton onClick={() => handleScrape('flickr')} disabled={isScraping} tooltip="Flickr Album einlesen">
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin' : ''}`} />
          <span className="text-center">Flickr</span>
        </AdminButton>
        
        <AdminButton onClick={() => handleScrape('instagram')} disabled={isScraping} tooltip="Instagram Feed einlesen">
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-pink-500' : ''}`} />
          <span className="text-center">Insta</span>
        </AdminButton>
        
        <AdminButton onClick={() => handleScrape('combined')} disabled={isScraping} tooltip="Flickr & Instagram gleichzeitig einlesen">
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-blue-400' : ''}`} />
          <span className="text-center">Alle</span>
        </AdminButton>

        <AdminButton onClick={() => handleScrape('flickr_html')} disabled={isScraping} tooltip="Flickr HTML Galerie einlesen (flickr-html.pages.dev)">
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isScraping ? 'animate-spin text-orange-400' : ''}`} />
          <span className="text-center">HTML</span>
        </AdminButton>

        <label className={`relative group w-full h-full cursor-pointer`}>
          <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 rounded-xl text-[10px] sm:text-xs font-medium border border-white/10 bg-white/5 text-white/80 transition-all duration-300 hover:bg-white/10 w-full h-full">
            <input 
              type="checkbox" 
              checked={autoUpload} 
              onChange={(e) => setAutoUpload(e.target.checked)}
              className="rounded border-white/20 bg-black/50 text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-center">Auto-Up</span>
          </div>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-[60] shadow-xl">
            Automatisch veröffentlichen nach Scraping
          </div>
        </label>

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
          color={isResettingAll ? "bg-red-600/20 text-red-300 border-red-500/20" : "bg-red-600/10 text-red-300 border-red-500/20"}
          tooltip="Leert den kompletten R2-Bucket und baut ihn aus den lokalen Daten neu auf."
        >
          <RefreshCw className={`w-3 h-3 sm:w-4 sm:h-4 ${isResettingAll ? 'animate-spin' : ''}`} />
          <span className="text-center">{isResettingAll ? 'Rebuild...' : 'Rebuild R2'}</span>
        </AdminButton>

        <AdminButton onClick={handleFullR2Sync} disabled={fullR2SyncStatus.running} tooltip="Alle lokalen Bilder (Uploads, Flickr, etc.) zu Cloudflare R2 spiegeln">
          <UploadCloud className={`w-3 h-3 sm:w-4 sm:h-4 ${fullR2SyncStatus.running ? 'animate-spin text-blue-500' : ''}`} />
          <span className="text-center">Cloud Sync</span>
        </AdminButton>

        <AdminButton 
          onClick={handleSyncFromCloudflare} 
          disabled={isEditing || loading} 
          tooltip="Aktuellen Stand von Cloudflare R2 laden (überschreibt lokale Änderungen)"
          color={hasCloudChanges ? "bg-green-600/30 text-green-300 border-green-500/50 shadow-[0_0_10px_rgba(74,222,128,0.3)] animate-pulse" : "bg-white/5 text-white/80 hover:bg-white/10 border-white/10"}
        >
          <Download className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          <span className="text-center">Load Cloud</span>
        </AdminButton>

        <AdminButton
          onClick={handleR2Cleanup}
          disabled={r2CleanupRunning}
          color="bg-red-500/10 text-red-300 border-red-500/20"
          tooltip="Verwaiste R2-Dateien analysieren und optional loeschen"
        >
          <Trash2 className={`w-3 h-3 sm:w-4 sm:h-4 ${r2CleanupRunning ? 'animate-pulse' : ''}`} />
          <span className="text-center">{r2CleanupRunning ? 'Cleanup...' : 'Clean R2'}</span>
        </AdminButton>

        <AdminButton
          onClick={handleLegacyDuplicateCleanup}
          disabled={legacyDupCleanupRunning}
          color="bg-orange-500/10 text-orange-300 border-orange-500/20"
          tooltip="Nur alte uploads/... Duplikate loeschen, wenn data/uploads/... bereits existiert"
        >
          <Trash2 className={`w-3 h-3 sm:w-4 sm:h-4 ${legacyDupCleanupRunning ? 'animate-pulse' : ''}`} />
          <span className="text-center">{legacyDupCleanupRunning ? 'Dupes...' : 'Clean Dupes'}</span>
        </AdminButton>

        <AdminButton 
          onClick={() => setShowUncertain(true)} 
          disabled={uncertainMatches.length === 0 || isEditing} 
          color={uncertainMatches.length > 0 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" : "bg-white/5 text-white/30"}
          tooltip="Unsichere High-Res Matches prüfen"
        >
          <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Review ({uncertainMatches.length})</span>
        </AdminButton>

        {/* Row 3 */}
        <AdminButton onClick={handlePreview} tooltip="Voransicht der generierten HTML-Seite">
          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-center">Voransicht</span>
        </AdminButton>

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

        <AdminButton onClick={handleGetLatestInstagram} disabled={isScraping} tooltip="Letzten Instagram Post hinzufügen">
          <Instagram className="w-3 h-3 sm:w-4 sm:h-4 text-pink-500" /> 
          <span className="text-center">+ Insta</span>
        </AdminButton>

        <AdminButton onClick={handleGetLatestFlickr} disabled={isScraping} tooltip="Letzten Flickr Post hinzufügen">
          <Camera className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" /> 
          <span className="text-center">+ Flickr</span>
        </AdminButton>

        <AdminButton
          onClick={handleRestoreLatestPublish}
          disabled={restoringLatestPublish}
          color="bg-amber-500/10 text-amber-300 border-amber-500/20"
          tooltip="Letztes veroeffentlichtes HTML-Backup direkt wieder live schalten"
        >
          {restoringLatestPublish ? <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" /> : <History className="w-3 h-3 sm:w-4 sm:h-4" />}
          <span className="text-center">{restoringLatestPublish ? 'Restore...' : 'Undo Publish'}</span>
        </AdminButton>

        {/* Row 4 */}
        <div className="col-span-1 flex gap-1">
          <button 
            onClick={handleUndo} 
            disabled={past.length === 0} 
            className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-30"
            title="Undo (Strg+Z)"
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo</span>
          </button>
          <button 
            onClick={handleRedo} 
            disabled={future.length === 0} 
            className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg text-[10px] font-medium border border-white/10 bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-30"
            title="Redo (Strg+Y)"
          >
            <Redo2 className="w-3 h-3" />
            <span>Redo</span>
          </button>
        </div>

        {publicDomain && (
          <a 
            href={isEditing ? undefined : `https://${publicDomain}/index.html`}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full h-full flex ${isEditing ? 'pointer-events-none' : ''}`}
          >
            <AdminButton className="w-full" disabled={isEditing} tooltip="Live Website in neuem Tab öffnen">
              <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-center">Live</span>
            </AdminButton>
          </a>
        )}

        <div className="relative col-span-1">
          <AdminButton 
            id="upload-btn" 
            onClick={handleUpload} 
            disabled={uploading || flickrPosts.length === 0} 
            tooltip="Änderungen auf die Live-Website übertragen"
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
    </header>
  );
}
