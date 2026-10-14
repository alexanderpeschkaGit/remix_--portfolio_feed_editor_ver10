import React from "react";
import {
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import type { MediaVariantAudit } from "../../../utils/mediaVariantsHelpers";

interface MediaVariantsActionFooterProps {
  busy: boolean;
  loading: boolean;
  generating: boolean;
  generatingAndPublishing: boolean;
  publishing: boolean;
  visibleAudit: MediaVariantAudit | null;
  generatableCount: number;
  result: any;
  generatedFiles: string[];
  publishResult: any;
  showHelp: boolean;
  helpText: string | null;
  onScan: () => void;
  onVerifyPublished: () => void;
  onGenerate: () => void;
  onGenerateAndPublish: () => void;
  onPublishToR2: () => void;
  onCloseHelp: () => void;
}

export function MediaVariantsActionFooter({
  busy,
  loading,
  generating,
  generatingAndPublishing,
  publishing,
  visibleAudit,
  generatableCount,
  result,
  generatedFiles,
  publishResult,
  showHelp,
  helpText,
  onScan,
  onVerifyPublished,
  onGenerate,
  onGenerateAndPublish,
  onPublishToR2,
  onCloseHelp,
}: MediaVariantsActionFooterProps) {
  const canGenerate =
    !busy &&
    !!visibleAudit &&
    visibleAudit.issueCount > 0 &&
    generatableCount > 0;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        <div className="relative group">
          <button
            onClick={onScan}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Scan Local
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Checks your local editor state for missing or broken variant
            references. Does NOT touch R2 or the live site.
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={onVerifyPublished}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-40"
          >
            <CheckCircle className="w-4 h-4" />
            Verify Live
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Downloads live state.json from Cloudflare R2 and checks all
            published variant references.
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300/30 bg-blue-500/30 hover:bg-blue-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImageIcon className="w-4 h-4" />
            )}
            {generating ? "Generating..." : "Generate"}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Creates missing variant files on your local machine only. Nothing is
            uploaded. Use Publish afterwards.
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={onGenerateAndPublish}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300/30 bg-purple-500/30 hover:bg-purple-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {generatingAndPublishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {generatingAndPublishing ? "Generating..." : "Gen + Publish"}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Generates missing variants, uploads to R2, and publishes state.json
            — all in one click.
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={onPublishToR2}
            disabled={
              busy ||
              !result ||
              generatedFiles.length === 0 ||
              publishResult?.success
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300/30 bg-green-500/30 hover:bg-green-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            {publishing
              ? "Publishing..."
              : publishResult?.success
                ? "Published ✓"
                : "Publish"}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Uploads previously generated files to R2 and publishes state.json.
            Only available after Generate.
          </div>
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={onCloseHelp}
        >
          <div
            className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">
                Media Variants — Help
              </h2>
              <button
                className="text-white hover:text-white/90 transition-colors p-1"
                onClick={onCloseHelp}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <pre className="text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                {helpText || "Loading..."}
              </pre>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={onCloseHelp}
                className="px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
