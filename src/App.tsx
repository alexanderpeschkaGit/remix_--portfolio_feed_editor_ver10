import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ExternalLink, CheckCircle } from 'lucide-react';
import { PROJECT_STATES } from './constants';
import { useRearrangeState } from './hooks/useRearrangeState';
import { useLightboxState } from './hooks/useLightboxState';
import { useBioFeature } from './hooks/useBioFeature';
import { useUndoHistory } from './hooks/useUndoHistory';
import { useMediaInteraction, type MediaSelection } from './hooks/useMediaInteraction';
import { useScrapeSync } from './hooks/useScrapeSync';
import { useCloudSync } from './hooks/useCloudSync';
import { useTrashManager } from './hooks/useTrashManager';
import { useMediaUploads } from './hooks/useMediaUploads';
import { usePublishing } from './hooks/usePublishing';
import { useBackups } from './hooks/useBackups';
import { useR2Maintenance } from './hooks/useR2Maintenance';
import { usePortfolioInit } from './hooks/usePortfolioInit';
import { useStatePersistence } from './hooks/useStatePersistence';
import { usePostActions } from './hooks/usePostActions';
import { usePostOrdering } from './hooks/usePostOrdering';
import { useImageDimensions } from './hooks/useImageDimensions';
import { useEditorLifecycle } from './hooks/useEditorLifecycle';
import { useStatusNotice } from './hooks/useStatusNotice';
import { linkifyToHtml } from './utils/linkify';
import { RearrangeModal } from './components/modals/RearrangeModal';
import { MergeConfirmationModal } from './components/modals/MergeConfirmationModal';
import { LightboxModal } from './components/modals/LightboxModal';
import { ConfirmSyncModal } from './components/modals/ConfirmSyncModal';
import { BackupsModal } from './components/modals/BackupsModal';
import { ScrapingLogsModal } from './components/modals/ScrapingLogsModal';
import { UncertainMatchesModal } from './components/modals/UncertainMatchesModal';
import { BioEditorModal } from './components/modals/BioEditorModal';
import { PostCommitModal } from './components/modals/PostCommitModal';
import { CloudSyncChangesModal } from './components/modals/CloudSyncChangesModal';
import { TrashModal } from './components/modals/TrashModal';
import { MediaVariantsModal } from './components/modals/MediaVariantsModal';
import { ThumbnailGalleryGrid } from './components/gallery/ThumbnailGalleryGrid';
import { AdminHeader } from './components/header/AdminHeader';
import { CloudflareUsageDisplay } from './components/header/CloudflareUsageDisplay';
import { FallbackBanner } from './components/FallbackBanner';
import { ResolutionToast } from './components/ResolutionToast';
import { StatusNotice } from './components/StatusNotice';
import { formatDescription, isValidImageCandidate, getImageSrc, getVideoSrc, createGetDisplayImage } from './utils/mediaHelpers';

// SortablePost component moved to src/components/feed/FeedPostCard.tsx

export default function App() {
  const [flickrPosts, setFlickrPosts] = useState<any[]>([]);
  const flickrPostsRef = useRef<any[]>([]);
  const portfolioTitleRef = useRef<string>('');
  const portfolioSubtitleRef = useRef<string>('');
  const portfolioBioRef = useRef<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [showResolutions, setShowResolutions] = useState(false);
  const [showResolutionToast, setShowResolutionToast] = useState(false);
  const shouldPushStateToR2Ref = useRef(false);

  const { activeUploads, hasUnsyncedMedia, setHasUnsyncedMedia, bunnyProgress, handleImageUpload, handleVideoFileUpload, handleVideoLinkChange } = useMediaUploads({
    flickrPosts,
    updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad),
    describePost: (post: any) => describePost(post),
    setError,
    pushStatusNotice: (kind: any, title: string, message: string) => pushStatusNotice(kind, title, message),
    shouldPushStateToR2Ref,
    handlePostChange: (id: string, field: string, value: string) => handlePostChange(id, field, value)
  });

  const { showTrashModal, setShowTrashModal, trashItems, trashLoading, trashError, loadTrashItems, handleOpenTrash, handleRestoreTrashItems, handleDeleteTrashItems, handlePermanentlyDeleteTrashItems } = useTrashManager({
    fetchCloudflareUsage: () => fetchCloudflareUsage(),
    recordHistory: (entry: any) => recordHistory(entry)
  });

  const [showMediaVariantsModal, setShowMediaVariantsModal] = useState(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);

  const uploadingCount = Object.values(activeUploads).reduce((sum: number, count: number) => sum + count, 0);

  // ===== Hook: useRearrangeState für Rearrange/Merge/Delete Funktionalität =====
  const rearrangeState = useRearrangeState();
  const {
    isReorderView,
    setIsReorderView,
    selectedThumbnails,
    setSelectedThumbnails,
    lastSelectedId,
    setLastSelectedId,
    isMoving,
    setIsMoving,
    activeId,
    setActiveId,
    moveToPosition,
    setMoveToPosition,
    resetSelection,
    toggleSelection,
    enterMoveMode,
    exitMoveMode,
  } = rearrangeState;

  // ===== Hook: useLightboxState für Lightbox Modal UI State (Mouse, Hovering, Dragging) =====
  const lightboxState = useLightboxState();
  const {
    lightboxMousePos,
    setLightboxMousePos,
    isHoveringLightboxBg,
    setIsHoveringLightboxBg,
    lightboxDraggedIdx,
    setLightboxDraggedIdx,
    startDragMedia,
    endDragMedia,
  } = lightboxState;

  // ===== Ãœbrige States =====
  const { statusNotice, pushStatusNotice, closeStatusNotice } = useStatusNotice();
  const isSavingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const { isInitialized, isR2Fallback, setIsR2Fallback, isFlickrFallback, setIsFlickrFallback, fallbackEnabled, setFallbackEnabled } = usePortfolioInit({
    setPortfolioTitle: (v: string) => setPortfolioTitle(v), setPortfolioSubtitle: (v: string) => setPortfolioSubtitle(v), setPortfolioBio: (v: string) => setPortfolioBio(v),
    setIgAccount: (v: string) => setIgAccount(v), setFlickrUrl: (v: string) => setFlickrUrl(v), setFlickrPosts, setLoading, setHasUnpublishedChanges, setError,
    setLocalLastUpdated: (v: string | null) => setLocalLastUpdated(v), setPublicDomain: (v: string | null) => setPublicDomain(v), setIsEmbeddedData: (v: boolean) => setIsEmbeddedData(v),
    getPortfolioTitle: () => portfolioTitle, getPortfolioSubtitle: () => portfolioSubtitle,
    getR2Config: () => R2_CONFIG
  });
  const { localLastUpdated, hasCloudChanges, cloudSyncChanges, cloudSyncState, ignoreCloudChangesRef, setLocalLastUpdated, setHasCloudChanges, setCloudSyncState, setCloudSyncChanges, handleSyncFromCloudflare, handleCancelCloudSync, handleIgnoreCloudSync, handleApplyCloudSync } = useCloudSync({
    isInitialized, flickrPosts, flickrPostsRef, portfolioTitleRef, portfolioSubtitleRef, portfolioBioRef,
    getPortfolioTitle: () => portfolioTitle, getPortfolioSubtitle: () => portfolioSubtitle, getPortfolioBio: () => portfolioBio,
    setLoading, setHasUnpublishedChanges,
    setPortfolioTitle: (v: string) => setPortfolioTitle(v), setPortfolioSubtitle: (v: string) => setPortfolioSubtitle(v), setPortfolioBio: (v: string) => setPortfolioBio(v),
    setIgAccount: (v: string) => setIgAccount(v), setFlickrUrl: (v: string) => setFlickrUrl(v),
    setIsR2Fallback: (v: boolean) => setIsR2Fallback(v), setIsFlickrFallback: (v: boolean) => setIsFlickrFallback(v),
    updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad),
    isSavingRef
  });
  const { scrapeLogs, setScrapeLogs, isScraping, showLogs, setShowLogs, syncStatus, fullR2SyncStatus, uncertainMatches, showUncertain, setShowUncertain, handleFullR2Sync, handleScrape, handleHighResSync, handleConfirmMatch, handleRejectMatch } = useScrapeSync({ flickrPostsRef, updatePosts: (np: any, ad: string = 'Aktion durchgeführt') => updatePosts(np, ad), setFlickrPosts, setHasUnsyncedMedia, setIsFlickrFallback: (v: boolean) => setIsFlickrFallback(v) });

  const refreshStateAfterMediaVariants = async () => {
    const response = await fetch(`/api/state?t=${Date.now()}`);
    if (!response.ok) throw new Error('Failed to reload updated state');
    const stateData = await response.json();

    if (stateData.title) setPortfolioTitle(stateData.title);
    if (stateData.subtitle) setPortfolioSubtitle(stateData.subtitle);
    if (stateData.bio) setPortfolioBio(stateData.bio);
    if (stateData.scrapeConfig) {
      if (stateData.scrapeConfig.igAccount) setIgAccount(stateData.scrapeConfig.igAccount);
      if (stateData.scrapeConfig.flickrUrl) setFlickrUrl(stateData.scrapeConfig.flickrUrl);
    }
    if (Array.isArray(stateData.items)) {
      setFlickrPosts(stateData.items);
      flickrPostsRef.current = stateData.items;
    }
    if (stateData.lastUpdated) setLocalLastUpdated(stateData.lastUpdated);
    setHasUnsyncedMedia(false);
    setHasCloudChanges(false);
    setHasUnpublishedChanges(false);
    await fetchCloudflareUsage();
    pushStatusNotice('success', 'Media variants updated', 'Generated thumbnails were published and the editor state was refreshed.');
  };

  const reorderScrollRef = useRef<HTMLDivElement>(null!);
  const [portfolioTitle, setPortfolioTitle] = useState("Portfolio Gallery");
  const [portfolioSubtitle, setPortfolioSubtitle] = useState("My creative works");
  const [igAccount, setIgAccount] = useState("your_instagram_handle");
  const [flickrUrl, setFlickrUrl] = useState("https://www.flickr.com/photos/your_account/albums/your_album_id/");
  const [publicDomain, setPublicDomain] = useState<string | null>(null);
  
  // Bio feature hook
  const {
    portfolioBio,
    setPortfolioBio,
    showBioEditor,
    setShowBioEditor,
    showPostCommitModal,
    setShowPostCommitModal,
    selectedPostForCommit,
    commitPostSource,
    handleGetLatestInstagram,
    handleGetLatestFlickr,
    handleCommitPostToPortfolio,
    resetCommitState
  } = useBioFeature();
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isEmbeddedData, setIsEmbeddedData] = useState(false);
  const [cloudflareUsage, setCloudflareUsage] = useState<any>(null);

  const fetchCloudflareUsage = async () => {
    try {
      const res = await fetch('/api/cloudflare/usage');
      if (res.ok) {
        const data = await res.json();
        setCloudflareUsage(data);
      }
    } catch (e) {
      console.error("Failed to fetch Cloudflare usage:", e);
    }
  };

  useEffect(() => {
    fetchCloudflareUsage();
    const interval = setInterval(fetchCloudflareUsage, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  // Public media configuration. Credentials and publishing remain server-side.
  const R2_CONFIG = {
    publicDomain: ""
  };

  // Image URL resolver (utils/mediaHelpers) bound to the R2 public domain.
  const getDisplayImage = createGetDisplayImage(R2_CONFIG.publicDomain);

  const { imageDimensions, handleImageLoad } = useImageDimensions({ flickrPosts, isR2Fallback, isEmbeddedData, getDisplayImage });

  const describePost = (post: any) => {
    const title = post?.title || 'Unbenannt';
    const network = post?.network_name;
    if (network && network !== 'Custom') return `${title} · ${network}`;
    return title;
  };

  useStatePersistence({ isInitialized, flickrPosts, uploadingCount, portfolioTitle, portfolioSubtitle, portfolioBio, igAccount, flickrUrl, shouldPushStateToR2Ref, setLocalLastUpdated, isSavingRef });

  const { past, future, recordHistory, updatePosts, recordTrashUndo, handleUndo, handleRedo } = useUndoHistory({
    flickrPosts, setFlickrPosts, setHasUnpublishedChanges, setError, pushStatusNotice, fetchCloudflareUsage, loadTrashItems, shouldPushStateToR2Ref
  });

  const { currentMergeGroup, isMergeModalOpen, activeMediaDrag, mediaSelection, clearMediaSelection, handleMediaDragStart, handleMediaDragEnd, handleMediaClick, handleMediaAltClick, confirmMerge, skipMerge, handleMergeSimilar, handleCrossPostMediaDrop } = useMediaInteraction({ flickrPosts, updatePosts, describePost });

  const { restoringLatestPublish, uploadProgress, uploadSuccess, uploading, handlePreview, handleUpload, handleRestoreLatestPublish } = usePublishing({
    flickrPosts, portfolioTitle, portfolioSubtitle, portfolioBio, publicDomain, R2_CONFIG, igAccount, flickrUrl,
    setError, setFlickrPosts, flickrPostsRef, recordHistory, setLocalLastUpdated, setHasCloudChanges, setCloudSyncState, setCloudSyncChanges,
    setHasUnsyncedMedia, setHasUnpublishedChanges, setIsR2Fallback, setIsFlickrFallback,
    setPortfolioTitle, setPortfolioSubtitle, setPortfolioBio, setIgAccount, setFlickrUrl
  });

  const { showBackups, setShowBackups, backupsList, isRestoring, restoreError, lastRestoredFilename, loadBackups, handleRestoreBackup } = useBackups({
    setFlickrPosts, recordHistory, setPortfolioTitle, setPortfolioSubtitle, setPortfolioBio, setIgAccount, setFlickrUrl,
    ignoreCloudChangesRef, setHasCloudChanges
  });

  const { r2CleanupRunning, legacyDupCleanupRunning, redundancyCleanupRunning, isResettingAll, handleResetAll, handleRedundancyCleanup, handlePurgeBak, handleR2Cleanup, handleLegacyDuplicateCleanup } = useR2Maintenance({
    setError, setShowLogs, setScrapeLogs, recordTrashUndo, recordHistory, loadTrashItems, fetchCloudflareUsage
  });

  useEffect(() => {
    if (!isInitialized) return;
    loadTrashItems().catch(() => {});
  }, [isInitialized]);

  const { handleToggleHidden, handleStateToggle, handlePostChange, handleAddNewPost, handleDeletePost, handleMergeDown, handleUpdatePostMedia, handleRemoveMedia, handleMoveToTarget, handleAddInstagramPost, handleAddFlickrPost, handleConfirmCommitPost } = usePostActions({
    flickrPosts, updatePosts, describePost, recordHistory, setHasUnpublishedChanges, setFlickrPosts, setError, pushStatusNotice, shouldPushStateToR2Ref,
    setIsEditing, selectedThumbnails, setSelectedThumbnails, setIsMoving, setLastSelectedId,
    handleGetLatestInstagram, handleGetLatestFlickr, handleCommitPostToPortfolio
  });
  const { sensors, handleDragEnd, handleLightboxDragStart, handleLightboxDragOver, handleLightboxDrop, currentLightboxPost, handleMerge, handleBulkDelete } = usePostOrdering({
    flickrPosts, updatePosts, describePost, selectedThumbnails, setSelectedThumbnails, setActiveId,
    lightboxDraggedIdx, setLightboxDraggedIdx, handleUpdatePostMedia, selectedImage,
    recordHistory, setHasUnpublishedChanges, setFlickrPosts
  });

  useEditorLifecycle({
    setShowResolutions, setShowResolutionToast, setIsEditing, setIsReorderView, setSelectedThumbnails, setSelectedImage, setIsHoveringLightboxBg,
    handleUndo, handleRedo, mediaSelection, clearMediaSelection, flickrPostsRef, portfolioTitleRef, portfolioSubtitleRef, portfolioBioRef,
    setHasUnpublishedChanges, isInitialized, portfolioTitle, portfolioSubtitle, portfolioBio, logsEndRef, scrapeLogs,
    activeId, isReorderView, reorderScrollRef, R2_CONFIG, flickrPosts
  });

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-12 font-sans">
      {/* Fallback Notification */}
      {(isR2Fallback || isEmbeddedData || isFlickrFallback) && (
        <FallbackBanner
          label={isFlickrFallback ? "TESTDATEN (FLICKR) GELADEN - R2 SYNC FEHLGESCHLAGEN" : isEmbeddedData ? "DATEN AUS HTML GELADEN (STATIC)" : "FALLBACK: DATEN AUS CLOUDFLARE R2 GELADEN"}
          isError={isFlickrFallback}
          fallbackEnabled={fallbackEnabled}
          onDismiss={() => { setIsR2Fallback(false); setIsEmbeddedData(false); setIsFlickrFallback(false); }}
          onToggleFallback={() => {
            const next = !fallbackEnabled;
            setFallbackEnabled(next);
            // If the user disables it, hide current fallback data.
            if (!next) {
              setIsR2Fallback(false);
              setIsFlickrFallback(false);
            }
          }}
        />
      )}

      <MergeConfirmationModal isOpen={isMergeModalOpen} group={currentMergeGroup} onConfirm={confirmMerge} onSkip={skipMerge} />

      <ResolutionToast show={showResolutionToast} resolutionsEnabled={showResolutions} />

      <AdminHeader
        isEditing={isEditing} setIsEditing={setIsEditing} portfolioTitle={portfolioTitle} setPortfolioTitle={setPortfolioTitle}
        portfolioSubtitle={portfolioSubtitle} setPortfolioSubtitle={setPortfolioSubtitle} igAccount={igAccount} setIgAccount={setIgAccount}
        flickrUrl={flickrUrl} setFlickrUrl={setFlickrUrl} isScraping={isScraping} syncStatus={syncStatus} fullR2SyncStatus={fullR2SyncStatus}
        isResettingAll={isResettingAll} loading={loading} restoringLatestPublish={restoringLatestPublish} r2CleanupRunning={r2CleanupRunning}
        legacyDupCleanupRunning={legacyDupCleanupRunning} uploading={uploading} uploadProgress={uploadProgress} past={past} future={future}
        uncertainMatches={uncertainMatches} publicDomain={publicDomain} flickrPosts={flickrPosts}
        CloudflareUsageDisplay={() => <CloudflareUsageDisplay usage={cloudflareUsage} />}
        handleScrape={handleScrape} handleHighResSync={handleHighResSync} handleFullR2Sync={handleFullR2Sync}
        handleOpenMediaVariants={() => setShowMediaVariantsModal(true)} handleSyncFromCloudflare={handleSyncFromCloudflare}
        handleResetAll={handleResetAll} handlePreview={handlePreview} handleUpload={handleUpload}
        handleRestoreLatestPublish={handleRestoreLatestPublish} handleR2Cleanup={handleR2Cleanup}
        handleLegacyDuplicateCleanup={handleLegacyDuplicateCleanup} handleRedundancyCleanup={handleRedundancyCleanup} handlePurgeBak={handlePurgeBak}
        redundancyCleanupRunning={redundancyCleanupRunning} handleOpenTrash={handleOpenTrash} handleAddNewPost={handleAddNewPost}
        handleUndo={handleUndo} handleRedo={handleRedo} handleMergeSimilar={handleMergeSimilar} loadBackups={loadBackups}
        setShowUncertain={setShowUncertain} setIsReorderView={setIsReorderView} isReorderView={isReorderView} setShowBioEditor={setShowBioEditor}
        handleGetLatestInstagram={handleAddInstagramPost} handleGetLatestFlickr={handleAddFlickrPost}
        hasCloudChanges={hasCloudChanges} hasUnsyncedMedia={hasUnsyncedMedia} hasUnpublishedChanges={hasUnpublishedChanges} trashCount={trashItems.length}
      />

      <StatusNotice notice={statusNotice} onClose={closeStatusNotice} />

      {uploadSuccess && (
        <div className="max-w-2xl mx-auto mb-8 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-green-500 font-medium">Erfolgreich hochgeladen!</h3>
            <p className="text-green-500/80 text-sm mt-1">
              Die HTML-Datei wurde erfolgreich auf Cloudflare R2 gespeichert.
            </p>
            <a 
              href={uploadSuccess.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-white underline mt-2 hover:text-green-400"
            >
              Datei ansehen <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-white/50 mb-4" />
          <p className="text-white/50 tracking-widest uppercase text-sm">Lade Bilder...</p>
        </div>
      )}

      {error && (
        <div className="text-center text-red-500 bg-red-500/10 p-4 rounded-lg max-w-2xl mx-auto border border-red-500/20 mb-8">
          <p>Fehler: {error}</p>
        </div>
      )}

      {!loading && !error && flickrPosts.length === 0 && (
        <div className="text-center text-white/50">
          <p>Keine Bilder gefunden.</p>
        </div>
      )}

      {!loading && flickrPosts.length > 0 && (
        <ThumbnailGalleryGrid
          flickrPosts={flickrPosts} isEditing={isEditing} activeUploads={activeUploads} showResolutions={showResolutions}
          sensors={sensors} imageDimensions={imageDimensions} isR2Fallback={isR2Fallback} isEmbeddedData={isEmbeddedData}
          handleDragEnd={handleDragEnd} handleImageUpload={handleImageUpload} handleVideoFileUpload={handleVideoFileUpload}
          handlePostChange={handlePostChange} handleVideoLinkChange={handleVideoLinkChange} handleDeletePost={handleDeletePost}
          handleMergeDown={handleMergeDown} handleUpdatePostMedia={handleUpdatePostMedia} handleRemoveMedia={handleRemoveMedia}
          setSelectedImage={setSelectedImage} handleStateToggle={handleStateToggle} handleToggleHidden={handleToggleHidden}
          handleImageLoad={handleImageLoad} getDisplayImage={getDisplayImage} getImageSrc={getImageSrc} getVideoSrc={getVideoSrc}
          formatDescription={formatDescription} isValidImageCandidate={isValidImageCandidate} bunnyProgress={bunnyProgress}
          activeMediaDrag={activeMediaDrag} onMediaDragStart={handleMediaDragStart} onMediaDragEnd={handleMediaDragEnd}
          onCrossPostMediaDrop={handleCrossPostMediaDrop} mediaSelection={mediaSelection} onMediaClick={handleMediaClick}
          onMediaAltClick={handleMediaAltClick} clearMediaSelection={clearMediaSelection}
        />
      )}

      {/* Backups Modal */}
      <BackupsModal
        isOpen={showBackups} onClose={() => setShowBackups(false)} backupsList={backupsList}
        isRestoring={isRestoring} restoreError={restoreError} lastRestoredFilename={lastRestoredFilename} onRestore={handleRestoreBackup}
      />

      {/* Scraping Logs Modal */}
      <ScrapingLogsModal
        isOpen={showLogs} onClose={() => setShowLogs(false)} logs={scrapeLogs}
        isScraping={isScraping} syncStatus={syncStatus} fullR2SyncStatus={fullR2SyncStatus}
        logsEndRef={logsEndRef as React.RefObject<HTMLDivElement>}
      />

      {/* Uncertain Matches Modal */}
      <UncertainMatchesModal
        isOpen={showUncertain} onClose={() => setShowUncertain(false)} matches={uncertainMatches} flickrPosts={flickrPosts}
        getImageSrc={getImageSrc} getDisplayImage={getDisplayImage} isR2Fallback={isR2Fallback} isEmbeddedData={isEmbeddedData}
        onConfirmMatch={handleConfirmMatch} onRejectMatch={handleRejectMatch}
      />

      {/* Bio Editor Modal */}
      <BioEditorModal
        isOpen={showBioEditor} bio={portfolioBio} onClose={() => setShowBioEditor(false)} onSave={setPortfolioBio}
      />

      {/* Post Commit Modal */}
      <PostCommitModal
        isOpen={showPostCommitModal} post={selectedPostForCommit} source={commitPostSource}
        onClose={resetCommitState} onConfirm={handleConfirmCommitPost}
      />

      <ConfirmSyncModal
        isOpen={cloudSyncState !== null} onClose={handleCancelCloudSync} onIgnore={handleIgnoreCloudSync}
        onConfirm={handleApplyCloudSync} changes={cloudSyncState?.changes || []}
      />

      <CloudSyncChangesModal
        isOpen={cloudSyncChanges !== null} onClose={() => setCloudSyncChanges(null)} changes={cloudSyncChanges || []}
      />

      <TrashModal
        isOpen={showTrashModal} onClose={() => setShowTrashModal(false)} items={trashItems}
        loading={trashLoading} error={trashError} onRefresh={() => loadTrashItems()} onRestore={handleRestoreTrashItems}
        onDelete={handleDeleteTrashItems} onDeletePermanently={handlePermanentlyDeleteTrashItems}
      />

      <MediaVariantsModal
        isOpen={showMediaVariantsModal} onClose={() => setShowMediaVariantsModal(false)} onStateUpdated={refreshStateAfterMediaVariants}
      />

      <LightboxModal
        currentLightboxPost={currentLightboxPost} lightboxMousePos={lightboxMousePos} isHoveringLightboxBg={isHoveringLightboxBg}
        lightboxDraggedIdx={lightboxDraggedIdx} imageDimensions={imageDimensions} setLightboxMousePos={setLightboxMousePos}
        setIsHoveringLightboxBg={setIsHoveringLightboxBg} setSelectedImage={setSelectedImage} showResolutions={showResolutions}
        isEditing={isEditing} isR2Fallback={isR2Fallback} isEmbeddedData={isEmbeddedData} getImageSrc={getImageSrc}
        getVideoSrc={getVideoSrc} getDisplayImage={getDisplayImage} handleImageLoad={handleImageLoad}
        handleLightboxDragStart={handleLightboxDragStart} handleLightboxDragOver={handleLightboxDragOver}
        handleLightboxDrop={handleLightboxDrop} handlePostChange={handlePostChange}
      />
      <RearrangeModal
        isReorderView={isReorderView} setIsReorderView={setIsReorderView} selectedThumbnails={selectedThumbnails}
        setSelectedThumbnails={setSelectedThumbnails} isMoving={isMoving} setIsMoving={setIsMoving}
        activeId={activeId} setActiveId={setActiveId} lastSelectedId={lastSelectedId} setLastSelectedId={setLastSelectedId}
        flickrPosts={flickrPosts} past={past} future={future} sensors={sensors} handleUndo={handleUndo} handleRedo={handleRedo}
        handleMerge={handleMerge} handleBulkDelete={handleBulkDelete} handleDragEnd={handleDragEnd} handleMoveToTarget={handleMoveToTarget}
        onSelect={(post: any, e: React.MouseEvent) => {
          toggleSelection(String(post.id), e.shiftKey, e.ctrlKey || e.metaKey, flickrPosts.map(p => String(p.id)));
        }}
        reorderScrollRef={reorderScrollRef} isR2Fallback={isR2Fallback} isEmbeddedData={isEmbeddedData}
        getImageSrc={getImageSrc} getVideoSrc={getVideoSrc} getDisplayImage={getDisplayImage} setSelectedImage={setSelectedImage}
      />
    </div>
  );
}

