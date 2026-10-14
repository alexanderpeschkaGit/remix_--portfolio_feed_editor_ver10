import React from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clipboard,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";
import {
  issueClass,
  reasonLabel,
  type MediaVariantAudit,
  type MediaVariantIssue,
} from "../../../utils/mediaVariantsHelpers";

interface MediaVariantsIssueListProps {
  busy: boolean;
  isScanning: boolean;
  publishing: boolean;
  generatingAndPublishing: boolean;
  generating: boolean;
  scanProgress: { progress: number; total: number } | null;
  visibleAudit: MediaVariantAudit | null;
  issues: MediaVariantIssue[];
  generatedFiles: string[];
  onCancelScan: () => void;
  onCopyFileList: () => void;
}

export function MediaVariantsIssueList({
  busy,
  isScanning,
  publishing,
  generatingAndPublishing,
  generating,
  scanProgress,
  visibleAudit,
  issues,
  generatedFiles,
  onCancelScan,
  onCopyFileList,
}: MediaVariantsIssueListProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-white/5 rounded-lg bg-black/35">
      {busy && !isScanning && (
        <div className="h-64 flex flex-col items-center justify-center text-white/50 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>
            {publishing
              ? "Uploading files to R2..."
              : generatingAndPublishing
                ? "Generating & publishing..."
                : generating
                  ? "Generating local variants..."
                  : "Scanning media variants..."}
          </span>
        </div>
      )}

      {isScanning && scanProgress && (
        <div className="p-6 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <span className="text-white/60 text-sm">
            Scanning...{" "}
            {scanProgress.total > 0
              ? `${scanProgress.progress}/${scanProgress.total} entries`
              : ""}
          </span>
          <div className="w-full max-w-md h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 rounded-full"
              style={{
                width: `${
                  scanProgress.total > 0
                    ? Math.round(
                        (scanProgress.progress / scanProgress.total) * 100,
                      )
                    : 0
                }%`,
              }}
            />
          </div>
          <button
            onClick={onCancelScan}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-400/30 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-sm transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel Scan
          </button>
        </div>
      )}

      {!busy && !isScanning && visibleAudit?.ok && (
        <div className="h-64 flex flex-col items-center justify-center text-green-300 gap-3">
          <CheckCircle className="w-10 h-10" />
          <span>All media variant references are verified.</span>
        </div>
      )}

      {!busy && !isScanning && !visibleAudit && (
        <div className="h-64 flex flex-col items-center justify-center text-white/50 gap-3">
          <ImageIcon className="w-10 h-10" />
          <span>
            Press &quot;Scan Local&quot; to check for missing variants.
          </span>
        </div>
      )}

      {!busy && !isScanning && issues.length > 0 && (
        <div className="divide-y divide-white/5">
          {issues.map((issue, index) => (
            <div
              key={`${issue.itemId}-${issue.mediaIndex}-${issue.field}-${issue.reason}-${index}`}
              className={`p-3 border-l-2 ${issueClass(issue)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                    <span className="truncate">
                      {issue.label || issue.title || issue.itemId}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {issue.mediaIndex >= 0
                      ? `Media #${issue.mediaIndex + 1}`
                      : "Top level"}{" "}
                    · {issue.mediaType || "media"} · {issue.field}
                  </div>
                  {(issue.r2Key || issue.url || issue.error) && (
                    <div
                      className="mt-1 font-mono text-[11px] text-white/35 break-all truncate max-w-[320px]"
                      title={issue.r2Key || issue.url || issue.error}
                    >
                      {issue.r2Key || issue.url || issue.error}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/60">
                    {reasonLabel(issue.reason)}
                  </div>
                  <div
                    className={`mt-1 text-[10px] ${
                      issue.canGenerate ? "text-green-300" : "text-white/35"
                    }`}
                  >
                    {issue.canGenerate ? "Generatable" : "Manual"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!busy && !isScanning && generatedFiles.length > 0 && (
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-medium text-white/60 uppercase tracking-wider">
              Generated Files ({generatedFiles.length})
            </h3>
            <button
              onClick={onCopyFileList}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
              title="Copy file list to clipboard"
            >
              <Clipboard className="w-3 h-3" />
              Copy
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto custom-scrollbar bg-black/25 rounded-lg border border-white/5">
            {generatedFiles.map((file: string, i: number) => (
              <div
                key={i}
                className="px-2 py-1 text-[11px] font-mono text-white/40 border-b border-white/5 last:border-0 truncate hover:text-white/60"
              >
                {file}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
