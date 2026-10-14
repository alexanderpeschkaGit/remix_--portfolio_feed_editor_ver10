import React from "react";
import {
  CheckCircle,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import { useMediaVariantsAudit } from "../../hooks/useMediaVariantsAudit";
import type { MediaVariantsModalProps } from "../../utils/mediaVariantsHelpers";
import { MediaVariantsIssueList } from "./media-variants/MediaVariantsIssueList";
import { MediaVariantsActionFooter } from "./media-variants/MediaVariantsActionFooter";

export function MediaVariantsModal({
  isOpen,
  onClose,
  onStateUpdated,
}: MediaVariantsModalProps) {
  const {
    visibleAudit,
    issues,
    generatableCount,
    groupedCounts,
    result,
    publishResult,
    loading,
    scanProgress,
    generating,
    generatingAndPublishing,
    publishing,
    error,
    showHelp,
    setShowHelp,
    helpText,
    busy,
    isScanning,
    generatedFiles,
    scan,
    cancelScan,
    generate,
    publishToR2,
    generateAndPublish,
    copyFileList,
    verifyPublished,
    openHelp,
  } = useMediaVariantsAudit({ onStateUpdated });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={() => (!busy || isScanning ? undefined : onClose())}
    >
      <div
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-medium text-white flex items-center gap-2">
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              ) : visibleAudit?.ok ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : (
                <ImageIcon className="w-5 h-5 text-blue-400" />
              )}
              Media Variants
            </h2>
            <p className="text-xs text-white/40 mt-1">
              {visibleAudit
                ? `${visibleAudit.scannedMedia} media checked, ${visibleAudit.issueCount} issues`
                : "Scanning media references"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="text-white/50 hover:text-white/80 transition-colors p-1 disabled:opacity-30"
              onClick={openHelp}
              disabled={busy}
              title="Help / How to use"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              className="text-white hover:text-white/90 transition-colors p-1 disabled:opacity-30"
              onClick={onClose}
              disabled={busy}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {visibleAudit && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <div
              className={`rounded-lg border px-3 py-2 ${
                visibleAudit.ok
                  ? "border-green-400/25 bg-green-500/10"
                  : "border-amber-400/25 bg-amber-500/10"
              }`}
            >
              <div className="text-[10px] text-white/40 uppercase tracking-wider">
                Issues
              </div>
              <div className="text-lg text-white font-semibold">
                {visibleAudit.issueCount}
              </div>
            </div>
            {groupedCounts.map((count) => (
              <div
                key={count.label}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="text-[10px] text-white/40 uppercase tracking-wider">
                  {count.label}
                </div>
                <div className="text-lg text-white font-semibold">
                  {count.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              result.success
                ? "border-green-400/25 bg-green-500/10 text-green-100"
                : "border-amber-400/25 bg-amber-500/10 text-amber-100"
            }`}
          >
            {result.published ? "Generated & published" : "Generated"}{" "}
            {result.generated?.length || 0} media entries (
            {generatedFiles.length} files).
            {result.failed?.length ? ` ${result.failed.length} failed.` : ""}
            {result.published && " State.json published to R2."}
            {!result.dryRun && result.candidatePath && (
              <div className="mt-1 text-[11px] text-white/40 truncate">
                Candidate: {result.candidatePath}
              </div>
            )}
          </div>
        )}

        {publishResult && (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              publishResult.success
                ? "border-green-400/25 bg-green-500/10 text-green-100"
                : "border-amber-400/25 bg-amber-500/10 text-amber-100"
            }`}
          >
            Published {publishResult.uploaded?.length || 0}/
            {publishResult.totalFiles || 0} files to R2.
            {publishResult.uploadErrors?.length
              ? ` ${publishResult.uploadErrors.length} errors.`
              : " State.json published."}
          </div>
        )}

        <MediaVariantsIssueList
          busy={busy}
          isScanning={isScanning}
          publishing={publishing}
          generatingAndPublishing={generatingAndPublishing}
          generating={generating}
          scanProgress={scanProgress}
          visibleAudit={visibleAudit}
          issues={issues}
          generatedFiles={generatedFiles}
          onCancelScan={cancelScan}
          onCopyFileList={copyFileList}
        />

        <MediaVariantsActionFooter
          busy={busy}
          loading={loading}
          generating={generating}
          generatingAndPublishing={generatingAndPublishing}
          publishing={publishing}
          visibleAudit={visibleAudit}
          generatableCount={generatableCount}
          result={result}
          generatedFiles={generatedFiles}
          publishResult={publishResult}
          showHelp={showHelp}
          helpText={helpText}
          onScan={scan}
          onVerifyPublished={verifyPublished}
          onGenerate={generate}
          onGenerateAndPublish={generateAndPublish}
          onPublishToR2={publishToR2}
          onCloseHelp={() => setShowHelp(false)}
        />
      </div>
    </div>
  );
}
