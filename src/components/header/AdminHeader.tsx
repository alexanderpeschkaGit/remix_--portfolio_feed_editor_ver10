import React from 'react';
import {
  Maximize2,
  Edit3,
  Save,
  UploadCloud,
  Plus,
  Image as ImageIcon,
  FoldVertical,
  History,
  Download,
  RefreshCw,
  Instagram,
  Layers,
  FileText,
  Camera,
} from 'lucide-react';

import { AdminButton } from './AdminButton.tsx';
import { AdminHeaderMetadataSection } from './AdminHeaderMetadataSection.tsx';
import { AdminHeaderMaintenanceBlock } from './AdminHeaderMaintenanceBlock.tsx';
import { AdminHeaderPublishSection } from './AdminHeaderPublishSection.tsx';

export interface AdminHeaderProps {
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
  future: { posts: any[]; action: string }[];
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
  handleRedundancyCleanup: () => void;
  handlePurgeBak: () => void;
  redundancyCleanupRunning: boolean;
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
  hasCloudChanges?: boolean;
  hasUnsyncedMedia?: boolean;
  hasUnpublishedChanges?: boolean;
  trashCount?: number;
}

export function AdminHeader(props: AdminHeaderProps) {
  const {
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
    uncertainMatches,
    CloudflareUsageDisplay,
    handleScrape,
    handleHighResSync,
    handleFullR2Sync,
    handleOpenMediaVariants,
    handleSyncFromCloudflare,
    handleResetAll,
    handleAddNewPost,
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
  } = props;

  return (
    <header className="max-w-7xl mx-auto mb-12 relative">
      <AdminHeaderMetadataSection
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        portfolioTitle={portfolioTitle}
        setPortfolioTitle={setPortfolioTitle}
        portfolioSubtitle={portfolioSubtitle}
        setPortfolioSubtitle={setPortfolioSubtitle}
        igAccount={igAccount}
        setIgAccount={setIgAccount}
        flickrUrl={flickrUrl}
        setFlickrUrl={setFlickrUrl}
      />

      <div className="grid grid-cols-4 gap-2 sm:gap-4 max-w-5xl mx-auto">
        {/* Cloudflare Usage Display */}
        <div className="col-span-full mb-2">
          <CloudflareUsageDisplay />
        </div>

        {/* Row 1: Insta / Flickr Scrape split button & Better Res & Backups & Rebuild R2 */}
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

        {/* Row 2: Cloud Sync & Media Variants & Merge Cloud & Maintenance Block & Review */}
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
          tooltip="Cloud-Änderungen übernehmen (Merge: Cloud-Texte/Kategorien, lokale Medien bleiben erhalten)"
          active={hasCloudChanges}
        >
          <Download className={`w-3 h-3 sm:w-4 sm:h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          <span className="text-center">Merge Cloud</span>
        </AdminButton>

        <AdminHeaderMaintenanceBlock
          handleR2Cleanup={props.handleR2Cleanup}
          r2CleanupRunning={props.r2CleanupRunning}
          handleLegacyDuplicateCleanup={props.handleLegacyDuplicateCleanup}
          legacyDupCleanupRunning={props.legacyDupCleanupRunning}
          handleRedundancyCleanup={props.handleRedundancyCleanup}
          redundancyCleanupRunning={props.redundancyCleanupRunning}
          handleOpenTrash={props.handleOpenTrash}
          trashCount={props.trashCount || 0}
          handlePurgeBak={props.handlePurgeBak}
        />

        <AdminButton
          onClick={() => setShowUncertain(true)}
          disabled={uncertainMatches.length === 0 || isEditing} 
          tooltip="Unsichere High-Res Matches prüfen"
        >
          <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" /> 
          <span className="text-center">Review ({uncertainMatches.length})</span>
        </AdminButton>

        {/* Row 3: Edit Mode & Rearrange & Merge Similar & Neu & Bio & +Insta/+Flickr */}
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

        {/* Row 4: Publish Section (Undo/Redo, Preview, Live) */}
        <AdminHeaderPublishSection
          handleUndo={props.handleUndo}
          past={props.past}
          handleRedo={props.handleRedo}
          future={props.future}
          handlePreview={props.handlePreview}
          handleRestoreLatestPublish={props.handleRestoreLatestPublish}
          restoringLatestPublish={props.restoringLatestPublish}
          handleUpload={props.handleUpload}
          uploading={props.uploading}
          flickrPosts={props.flickrPosts}
          hasUnpublishedChanges={props.hasUnpublishedChanges || false}
          uploadProgress={props.uploadProgress}
          publicDomain={props.publicDomain}
          isEditing={isEditing}
        />
      </div>
    </header>
  );
}
