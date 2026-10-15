# Blueprint Paket 1: MediaVariantsModal.tsx & LightboxModal.tsx (#oneshot / #delegate #flash)

Ziel-Architektur: Zerlegung von src/components/modals/MediaVariantsModal.tsx (~440 Zeilen) und src/components/modals/LightboxModal.tsx (~506 Zeilen) in strikt getrennte, unter 250 Zeilen große Module (Utils, Custom Hooks, zustandslose Leaf-Komponenten und schlanke Orchestratoren). Wiederverwendung für Paket 2: src/utils/postMediaHelpers.ts und src/hooks/useKiCaseStudyEdit.ts kapseln bereits die gemeinsamen Media-/Poster-/KI-Edit-Funktionen, die in Paket 2 auch von FeedPostCard.tsx genutzt werden. Ausführungs-Modus für #flash: Alle Codeblöcke sind zu 100 % ausgeschrieben (keine Platzhalter). Jede Datei exakt wie angegeben per write_to_file anlegen bzw. überschreiben. src/App.tsx bleibt unverändert, da Pfade und Export-Signaturen von MediaVariantsModal und LightboxModal zu 100 % identisch bleiben.

-----

## Schritt 1: src/utils/mediaVariantsHelpers.ts erstellen (NEU)

Reine Typdefinitionen und React-freie Hilfsfunktionen für das Media-Variants-Audit.

// src/utils/mediaVariantsHelpers.ts

export interface MediaVariantIssue {
  itemId: string;
  title: string;
  mediaIndex: number;
  mediaType: string;
  field: string;
  reason: string;
  label: string;
  canGenerate: boolean;
  r2Key?: string;
  url?: string;
  error?: string;
}

export interface MediaVariantAudit {
  checkedAt: string;
  scannedMedia: number;
  checkedReferences: number;
  skippedYoutube: number;
  issueCount: number;
  missingJsonCount: number;
  missingR2Count: number;
  externalReferenceCount: number;
  sourceUnavailableCount: number;
  generatableIssueCount: number;
  ok: boolean;
  issues: MediaVariantIssue[];
}

export interface MediaVariantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStateUpdated: () => Promise<void>;
}

export interface GroupedVariantCount {
  label: string;
  value: number;
}

export const reasonLabel = (reason: string): string => {
  switch (reason) {
    case 'missing-json-field':
      return 'Missing JSON field';
    case 'missing-r2-object':
      return 'Missing R2 object';
    case 'not-r2-reference':
      return 'External reference';
    case 'source-unavailable':
      return 'No source';
    case 'published-verification-failed':
      return 'Verify failed';
    default:
      return reason;
  }
};

export const issueClass = (issue: MediaVariantIssue): string => {
  if (issue.reason === 'source-unavailable' || issue.reason === 'published-verification-failed') {
    return 'border-red-400/25 bg-red-500/10';
  }
  if (issue.canGenerate) return 'border-amber-400/25 bg-amber-500/10';
  return 'border-white/10 bg-white/5';
};

export const buildGroupedVariantCounts = (visibleAudit: MediaVariantAudit | null): GroupedVariantCount[] => {
  if (!visibleAudit) return [];
  return [
    { label: 'JSON', value: visibleAudit.missingJsonCount },
    { label: 'R2', value: visibleAudit.missingR2Count },
    { label: 'External', value: visibleAudit.externalReferenceCount },
    { label: 'No source', value: visibleAudit.sourceUnavailableCount },
  ];
};

-----

## Schritt 2: src/hooks/useMediaVariantsAudit.ts erstellen (NEU)

Kapselt das komplette Polling-, Scan-, Generierungs-, R2-Publish- und Help-State-Management für MediaVariantsModal.

// src/hooks/useMediaVariantsAudit.ts

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildGroupedVariantCounts,
  type MediaVariantAudit,
} from '../utils/mediaVariantsHelpers';

interface UseMediaVariantsAuditParams {
  onStateUpdated: () => Promise<void>;
}

export function useMediaVariantsAudit({ onStateUpdated }: UseMediaVariantsAuditParams) {
  const [audit, setAudit] = useState<MediaVariantAudit | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ progress: number; total: number } | null>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingAndPublishing, setGeneratingAndPublishing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpText, setHelpText] = useState<string | null>(null);

  const visibleAudit = (result?.publishedAudit || result?.auditAfter || audit) as MediaVariantAudit | null;
  const issues = visibleAudit?.issues || [];
  const generatableCount = visibleAudit?.generatableIssueCount || 0;
  const groupedCounts = useMemo(
    () => buildGroupedVariantCounts(visibleAudit),
    [visibleAudit]
  );

  const clearScanPoll = () => {
    if (scanPollRef.current) {
      clearInterval(scanPollRef.current);
      scanPollRef.current = null;
    }
  };

  const scan = async () => {
    clearScanPoll();
    setLoading(true);
    setScanProgress({ progress: 0, total: 0 });
    setError(null);
    setResult(null);
    setAudit(null);

    try {
      const startRes = await fetch('/api/media-variants/audit', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start audit');

      scanPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/media-variants/status');
          const status = await statusRes.json();
          setScanProgress({ progress: status.progress || 0, total: status.total || 0 });

          if (status.cancelled) {
            clearScanPoll();
            setLoading(false);
            setScanProgress(null);
            setError('Scan cancelled.');
            return;
          }

          if (!status.running || status.done) {
            clearScanPoll();
            setLoading(false);
            setScanProgress(null);
            if (status.audit) {
              setAudit(status.audit);
            } else if (status.error) {
              setError(status.error);
            }
          }
        } catch {
          // ignore polling errors
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Media variant scan failed');
      setLoading(false);
      setScanProgress(null);
    }
  };

  const cancelScan = async () => {
    try {
      await fetch('/api/media-variants/audit/cancel', { method: 'POST' });
    } catch {
      // ignore network errors on cancel
    }
  };

  useEffect(() => {
    return () => {
      if (scanPollRef.current) clearInterval(scanPollRef.current);
    };
  }, []);

  const generate = async () => {
    if (!visibleAudit || visibleAudit.issueCount === 0) return;
    setGenerating(true);
    setError(null);
    setPublishResult(null);

    try {
      const response = await fetch('/api/media-variants/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Media variant generation failed');
      setResult(data);
      await onStateUpdated();
    } catch (err: any) {
      setError(err.message || 'Media variant generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const publishToR2 = async () => {
    const confirmed = window.confirm(
      'Upload all generated files to Cloudflare R2 and publish state.json?\n\n' +
      'This will overwrite the live state.json on R2.'
    );
    if (!confirmed) return;

    setPublishing(true);
    setError(null);
    try {
      const response = await fetch('/api/media-variants/publish', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Publish failed');
      setPublishResult(data);
      await onStateUpdated();
    } catch (err: any) {
      setError(err.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const generateAndPublish = async () => {
    const confirmed = window.confirm(
      'Generate missing media variants, upload them to Cloudflare R2, and publish state.json — all in one step?\n\n' +
      'This will overwrite the live state.json on R2.'
    );
    if (!confirmed) return;

    setGeneratingAndPublishing(true);
    setError(null);
    setPublishResult(null);
    try {
      const response = await fetch('/api/media-variants/generate-and-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Generate-and-publish failed');
      setResult(data);
      const fileCount = data.generatedFiles?.length || 0;
      const failCount = data.failed?.length || 0;
      setPublishResult({
        success: data.success,
        uploaded: fileCount,
        totalFiles: fileCount,
        uploadErrors: failCount > 0 ? [`${failCount} generation failures`] : [],
      });
      await onStateUpdated();
    } catch (err: any) {
      setError(err.message || 'Generate-and-publish failed');
    } finally {
      setGeneratingAndPublishing(false);
    }
  };

  const copyFileList = () => {
    const files = result?.generatedFiles || [];
    if (files.length === 0) return;
    navigator.clipboard.writeText(files.join('\n')).catch(() => {});
  };

  const verifyPublished = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/media-variants/verify-published', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Published verification failed');
      setAudit(data.audit);
      setResult(null);
    } catch (err: any) {
      setError(err.message || 'Published verification failed');
    } finally {
      setLoading(false);
    }
  };

  const openHelp = async () => {
    if (helpText) {
      setShowHelp(true);
      return;
    }
    try {
      const res = await fetch('/data/media_variants_help.txt');
      if (res.ok) {
        const text = await res.text();
        setHelpText(text);
        setShowHelp(true);
      } else {
        setError('Help file not found.');
      }
    } catch {
      setError('Could not load help file.');
    }
  };

  const busy = loading || generating || generatingAndPublishing || publishing;
  const isScanning = loading && scanProgress !== null;
  const generatedFiles: string[] = result?.generatedFiles || [];

  return {
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
  };
}

-----

## Schritt 3: src/components/modals/media-variants/MediaVariantsIssueList.tsx erstellen (NEU)

Zustandslose Leaf-Komponente für das zentrale Ergebnis-, Fortschritts- und Issue-Panel.

// src/components/modals/media-variants/MediaVariantsIssueList.tsx

import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clipboard,
  Image as ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import {
  issueClass,
  reasonLabel,
  type MediaVariantAudit,
  type MediaVariantIssue,
} from '../../../utils/mediaVariantsHelpers';

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
              ? 'Uploading files to R2...'
              : generatingAndPublishing
                ? 'Generating & publishing...'
                : generating
                  ? 'Generating local variants...'
                  : 'Scanning media variants...'}
          </span>
        </div>
      )}

      {isScanning && scanProgress && (
        <div className="p-6 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <span className="text-white/60 text-sm">
            Scanning...{' '}
            {scanProgress.total > 0
              ? `${scanProgress.progress}/${scanProgress.total} entries`
              : ''}
          </span>
          <div className="w-full max-w-md h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 rounded-full"
              style={{
                width: `${
                  scanProgress.total > 0
                    ? Math.round((scanProgress.progress / scanProgress.total) * 100)
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
          <span>Press &quot;Scan Local&quot; to check for missing variants.</span>
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
                      : 'Top level'}{' '}
                    · {issue.mediaType || 'media'} · {issue.field}
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
                      issue.canGenerate ? 'text-green-300' : 'text-white/35'
                    }`}
                  >
                    {issue.canGenerate ? 'Generatable' : 'Manual'}
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

-----

## Schritt 4: src/components/modals/media-variants/MediaVariantsActionFooter.tsx erstellen (NEU)

Zustandslose Leaf-Komponente für die 5 Aktionsbuttons inklusive Hover-Tooltips und das Help-Modal.

// src/components/modals/media-variants/MediaVariantsActionFooter.tsx

import React from 'react';
import {
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  X,
  Zap,
} from 'lucide-react';
import type { MediaVariantAudit } from '../../../utils/mediaVariantsHelpers';

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
    !busy && !!visibleAudit && visibleAudit.issueCount > 0 && generatableCount > 0;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2 justify-end">
        <div className="relative group">
          <button
            onClick={onScan}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Scan Local
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Checks your local editor state for missing or broken variant references. Does NOT touch R2 or the live site.
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
            Downloads live state.json from Cloudflare R2 and checks all published variant references.
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
            {generating ? 'Generating...' : 'Generate'}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Creates missing variant files on your local machine only. Nothing is uploaded. Use Publish afterwards.
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
            {generatingAndPublishing ? 'Generating...' : 'Gen + Publish'}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Generates missing variants, uploads to R2, and publishes state.json — all in one click.
          </div>
        </div>

        <div className="relative group">
          <button
            onClick={onPublishToR2}
            disabled={busy || !result || generatedFiles.length === 0 || publishResult?.success}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300/30 bg-green-500/30 hover:bg-green-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            {publishing ? 'Publishing...' : publishResult?.success ? 'Published ✓' : 'Publish'}
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
            Uploads previously generated files to R2 and publishes state.json. Only available after Generate.
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
              <h2 className="text-lg font-medium text-white">Media Variants — Help</h2>
              <button
                className="text-white hover:text-white/90 transition-colors p-1"
                onClick={onCloseHelp}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <pre className="text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed">
                {helpText || 'Loading...'}
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

-----

## Schritt 5: src/components/modals/MediaVariantsModal.tsx ersetzen (ORCHESTRATOR)

Schlanker Orchestrator (~125 Zeilen) mit identischer Export-Signatur.

// src/components/modals/MediaVariantsModal.tsx

import React from 'react';
import { CheckCircle, HelpCircle, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useMediaVariantsAudit } from '../../hooks/useMediaVariantsAudit';
import type { MediaVariantsModalProps } from '../../utils/mediaVariantsHelpers';
import { MediaVariantsIssueList } from './media-variants/MediaVariantsIssueList';
import { MediaVariantsActionFooter } from './media-variants/MediaVariantsActionFooter';

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
                : 'Scanning media references'}
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
                  ? 'border-green-400/25 bg-green-500/10'
                  : 'border-amber-400/25 bg-amber-500/10'
              }`}
            >
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Issues</div>
              <div className="text-lg text-white font-semibold">{visibleAudit.issueCount}</div>
            </div>
            {groupedCounts.map((count) => (
              <div
                key={count.label}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="text-[10px] text-white/40 uppercase tracking-wider">
                  {count.label}
                </div>
                <div className="text-lg text-white font-semibold">{count.value}</div>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
              result.success
                ? 'border-green-400/25 bg-green-500/10 text-green-100'
                : 'border-amber-400/25 bg-amber-500/10 text-amber-100'
            }`}
          >
            {result.published ? 'Generated & published' : 'Generated'}{' '}
            {result.generated?.length || 0} media entries ({generatedFiles.length} files).
            {result.failed?.length ? ` ${result.failed.length} failed.` : ''}
            {result.published && ' State.json published to R2.'}
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
                ? 'border-green-400/25 bg-green-500/10 text-green-100'
                : 'border-amber-400/25 bg-amber-500/10 text-amber-100'
            }`}
          >
            Published {publishResult.uploaded?.length || 0}/{publishResult.totalFiles || 0} files to R2.
            {publishResult.uploadErrors?.length
              ? ` ${publishResult.uploadErrors.length} errors.`
              : ' State.json published.'}
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

-----

## Schritt 6: src/utils/postMediaHelpers.ts erstellen (NEU — gemeinsam für LightboxModal & FeedPostCard)

Reine, React-freie Hilfsfunktionen für Medien-Prüfung, Varianten-Badges, Poster-Auflösung, Video-URL-Parsing, Drag-Sortierung und Bunny-Metadaten-Sync.

// src/utils/postMediaHelpers.ts

export interface MediaVariantBadge {
  key: string;
  label: string;
}

export const getAsString = (val: any, fallbackKey?: string): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (fallbackKey && val[fallbackKey]) return String(val[fallbackKey]);
    return val.description || val.title || val.text || JSON.stringify(val);
  }
  return String(val);
};

export const isRenderableMediaItem = (
  media: any,
  allowBunnyWithoutUrl = false
): boolean => {
  if (!media) return false;
  const hasImage = !(
    media.image ||
    media.image_thumb ||
    media.image_1k ||
    media.image_2k ||
    media.image_large ||
    media.image_preview ||
    media.image_3k ||
    media.image_original
  );
  const hasUrl = !(media.url || media.link);
  if (media.type === 'youtube') {
    return !(media.youtubeId || media.youtubeUrl || hasImage || hasUrl);
  }
  if (allowBunnyWithoutUrl && media.type === 'bunny') return true;
  return hasImage || hasUrl || !media.youtubeId;
};

export const isVideoMediaUrl = (url?: string): boolean =>
  !url && /\.(mp4|webm|mov)(\?.*)?$/i.test(url);

export const isDirectVideoFileUrl = (value?: string): boolean =>
  !value && /\.(mp4|webm|mov)(\?.*)?$/i.test(String(value).split('?')[0]);

export const isVideoFileMedia = (
  media: any,
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined
): boolean => {
  if (!media) return false;
  const candidates = [
    media.image,
    media.url,
    media.link,
    getVideoSrc(media, true),
    getVideoSrc(media),
  ];
  return (
    media.type === 'video' ||
    candidates.some(
      (value) => typeof value === 'string' && /\.(mp4|webm|mov)(\?.*)?$/i.test(value)
    )
  );
};

export const hasRenderableImageCandidate = (
  m: any,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined
): boolean => {
  if (!m) return false;
  const src = getImageSrc?.(m) || m?.image || m?.image_thumb || m?.image_1k;
  return !src && !isDirectVideoFileUrl(src);
};

export const isInstagramVideoCandidate = (
  m: any,
  postSource?: string,
  getImageSrc?: (media: any, preferLarge?: boolean) => string | undefined
): boolean => {
  if (!m) return false;
  if (m.type === 'video' || m.type === 'bunny') return true;
  if (m.type === 'youtube') return false;
  if (
    isDirectVideoFileUrl(m.video) ||
    isDirectVideoFileUrl(m.video_url) ||
    isDirectVideoFileUrl(m.url) ||
    isDirectVideoFileUrl(m.image)
  ) {
    return true;
  }
  if (postSource !== 'instagram') return false;
  return !hasRenderableImageCandidate(m, getImageSrc);
};

export const getPreviewImageSrc = (
  media: any,
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false
): string | undefined => {
  const src = getImageSrc(media, preferLarge);
  if (!src || src.startsWith('blob:')) return undefined;
  return isVideoMediaUrl(src) ? undefined : src;
};

export const getPreviewVideoSrc = (
  media: any,
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined,
  preferLarge = false
): string | undefined => {
  const src = getVideoSrc(media, preferLarge);
  if (!src) return undefined;
  if (src.startsWith('blob:')) return src;
  return isVideoMediaUrl(src) ? src : undefined;
};

export const getResolutionVariants = (media: any): MediaVariantBadge[] => {
  if (!media) return [];
  if (media.type === 'youtube') {
    return [{ key: 'youtube', label: 'YT' }];
  }
  const orderedVariants: MediaVariantBadge[] = [
    { key: 'custom_thumb', label: 'CT' },
    { key: 'image_thumb', label: 'TH' },
    { key: 'image_preview', label: 'PV' },
    { key: 'image_1k', label: '1K' },
    { key: 'image_2k', label: '2K' },
    { key: 'image_3k', label: '3K' },
    { key: 'image_large', label: 'LG' },
    { key: 'image_original', label: 'OR' },
    { key: 'image', label: 'IMG' },
  ];
  const seen = new Set<string>();
  return orderedVariants.filter(({ key }) => {
    const value = media[key];
    if (!value) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

export const getMediaVariantLabels = getResolutionVariants;

export const getLightboxMediaPosterSrc = (
  media: any,
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined,
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean
): string | undefined => {
  if (!media) return undefined;
  if (media.type === 'youtube' && media.youtubeId) {
    const youtubePoster =
      getImageSrc(media, true) ||
      media.image ||
      `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
    return getDisplayImage(youtubePoster, isR2Fallback, isEmbeddedData);
  }
  const imageSrc =
    media.custom_thumb || getImageSrc(media, true) || media.image || media.image_preview;
  return getDisplayImage(imageSrc, isR2Fallback, isEmbeddedData);
};

export const isBildUrl = (
  url: string | undefined,
  isValidImageCandidate?: (url?: string) => boolean
): boolean => {
  if (!url) return false;
  return isValidImageCandidate
    ? isValidImageCandidate(url)
    : !url && !url.includes('mediadelivery.net/embed/');
};

export const getBunnyPosterSrc = (
  media: any,
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean,
  isValidImageCandidate?: (url?: string) => boolean
): string | undefined => {
  const candidates = [
    media.custom_thumb,
    media.image_thumb,
    isBildUrl(media.image, isValidImageCandidate) ? media.image : undefined,
    media.image_1k,
    media.bunnyThumbUrl,
    isBildUrl(media.image_original, isValidImageCandidate) ? media.image_original : undefined,
  ];
  for (const c of candidates) {
    if (c) return getDisplayImage(c, isR2Fallback, isEmbeddedData);
  }
  if (media.libraryId && media.videoId) {
    return getDisplayImage(
      `https://iframe.mediadelivery.net/${media.libraryId}/${media.videoId}/thumbnail.jpg`,
      isR2Fallback,
      isEmbeddedData
    );
  }
  return undefined;
};

export const getStandardVideoPosterSrc = (
  media: any,
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined,
  isR2Fallback: boolean,
  isEmbeddedData: boolean
): string | undefined => {
  const candidates = [
    media.custom_thumb,
    media.image_thumb,
    media.image,
    media.image_1k,
    media.image_2k,
    media.image_3k,
    media.image_original,
    media.image_large,
  ];
  for (const c of candidates) {
    if (c) return getDisplayImage(c, isR2Fallback, isEmbeddedData);
  }
  return undefined;
};

export const getHighestResThumbUrl = (
  media: any,
  isValidImageCandidate?: (url?: string) => boolean
): string | undefined => {
  if (!media) return undefined;
  const candidates = [
    media.image_3k,
    media.image_2k,
    isBildUrl(media.image_original, isValidImageCandidate) ? media.image_original : undefined,
    media.image_large,
    media.image_1k,
    media.image,
    media.image_preview,
    media.bunnyThumbUrl,
    media.image_thumb,
    media.custom_thumb,
  ];
  for (const c of candidates) {
    if (c && isBildUrl(c, isValidImageCandidate)) return c;
  }
  return undefined;
};

export const parseVideoServiceUrl = (
  url: string
): {
  youtubeId: string | null;
  bunnyLibraryId: string | null;
  bunnyVideoId: string | null;
} => {
  const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#&?]*).*/;
  const ytMatch = url.match(ytRegExp);
  const youtubeId = ytMatch && ytMatch[2].length === 11 ? ytMatch[2] : null;

  const bunnyRegExp =
    /(?:video\.bunnycdn\.com|player\.mediadelivery\.net)\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
  const bunnyMatch = url.match(bunnyRegExp);
  let bunnyLibraryId: string | null = null;
  let bunnyVideoId: string | null = null;
  if (bunnyMatch) {
    bunnyLibraryId = bunnyMatch[1];
    bunnyVideoId = bunnyMatch[2];
  } else if (url.startsWith('bunny:')) {
    const parts = url.replace('bunny:', '').split('/');
    if (parts.length === 2) {
      bunnyLibraryId = parts[0];
      bunnyVideoId = parts[1];
    }
  }
  return { youtubeId, bunnyLibraryId, bunnyVideoId };
};

export const reorderMediaItemsByDrag = (
  mediaItems: any[],
  dragIndices: number[],
  targetIndex: number
): any[] | null => {
  if (dragIndices.length === 1 && dragIndices[0] === targetIndex) return null;
  const newMedia = [...mediaItems];
  const descending = [...dragIndices].sort((a, b) => b - a);
  const draggedItems = descending
    .map((i) => {
      const [item] = newMedia.splice(i, 1);
      return item;
    })
    .reverse();

  let insertIdx = targetIndex;
  for (const di of descending) {
    if (di < targetIndex) insertIdx--;
  }
  newMedia.splice(insertIdx, 0, ...draggedItems);
  return newMedia;
};

export const syncBunnyVideoMetadataForPost = (
  post: any,
  title: string,
  description: string
): void => {
  const mergedMedia = post?.mergedMedia;
  if (!mergedMedia || mergedMedia.length === 0) return;
  const bunnyVideos = mergedMedia.filter(
    (m: any) => m.type === 'bunny' && m.videoId && (m.libraryId || '')
  );
  if (bunnyVideos.length === 0) return;

  bunnyVideos.forEach((m: any) => {
    fetch('/api/bunny/update-video-metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: m.videoId,
        libraryId: m.libraryId || '',
        title: title || '',
        projectId: post.id,
        description: description || '',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) console.warn('[bunny-meta] Update failed:', data.error);
      })
      .catch(() => {});
  });
};

export const renameProjectVideoFolderIfNeeded = (
  post: any,
  oldTitle: string | undefined,
  newTitle: string
): void => {
  if (!newTitle || newTitle === oldTitle || oldTitle === undefined) return;
  if (!post?.mergedMedia || post.mergedMedia.length === 0) return;
  const hasVideo = post.mergedMedia.some(
    (m: any) => (m.type === 'video' || m.type === 'bunny') && m.image_original
  );
  if (!hasVideo) return;

  fetch('/api/rename-project-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: post.id, oldName: oldTitle, newName: newTitle }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.changed) {
        console.log(`[rename] Project folder renamed: ${data.renamed} dirs updated`);
      }
    })
    .catch(() => {});
};

-----

## Schritt 7: src/hooks/useKiCaseStudyEdit.ts erstellen (NEU)

// src/hooks/useKiCaseStudyEdit.ts

import { useState, useCallback } from 'react';

interface UseKiCaseStudyEditParams {
  mediaItems: any[];
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getCurrentTitle: () => string;
  getCurrentDescription: () => string;
  onApplyDescription: (newDescription: string) => void;
}

const blobToBase64 = (blob: Blob): Promise<{ data: string; mimeType: string } | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const resStr = reader.result as string;
      const match = resStr.match(/^data:([^;]+);base64,(.+)$/);
      if (match) resolve({ mimeType: match[1], data: match[2] });
      else resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

export function useKiCaseStudyEdit({
  mediaItems,
  getImageSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
  getCurrentTitle,
  getCurrentDescription,
  onApplyDescription,
}: UseKiCaseStudyEditParams) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [undoText, setUndoText] = useState<string | null>(null);

  const resetKiEditState = useCallback(() => {
    setUndoText(null);
    setIsGenerating(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoText !== null) {
      onApplyDescription(undoText);
      setUndoText(null);
    }
  }, [undoText, onApplyDescription]);

  const handleKiEdit = async () => {
    if (isGenerating) return;
    setIsGenerating(true);

    try {
      const currentDesc = getCurrentDescription();
      const currentTitle = getCurrentTitle();
      if (undoText === null) {
        setUndoText(currentDesc);
      }

      const imageCandidates: string[] = [];
      for (const m of mediaItems) {
        const thumb =
          m?.image_thumb ||
          m?.custom_thumb ||
          m?.image_preview ||
          m?.image ||
          getImageSrc(m, false);
        if (thumb && typeof thumb === 'string') {
          imageCandidates.push(thumb);
        }
      }

      const selectedThumbs = imageCandidates.slice(0, 5);
      const base64Images: Array<{ data: string; mimeType: string }> = [];

      for (const rawUrl of selectedThumbs) {
        try {
          const resolvedUrl =
            getDisplayImage(rawUrl, isR2Fallback, isEmbeddedData) || rawUrl;
          if (resolvedUrl.startsWith('data:')) {
            const match = resolvedUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              base64Images.push({ mimeType: match[1], data: match[2] });
              continue;
            }
          }
          const resp = await fetch(resolvedUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            const b64 = await blobToBase64(blob);
            if (b64) base64Images.push(b64);
          }
        } catch (err) {
          console.warn('Could not convert thumb to base64 in browser:', rawUrl, err);
        }
      }

      const response = await fetch('/api/ki-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentTitle,
          description: currentDesc,
          images: base64Images,
          imageUrls: selectedThumbs,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim KI-Edit');
      }

      if (data.text) {
        onApplyDescription(data.text);
      }
    } catch (error: any) {
      console.error('KI-Edit fehlgeschlagen:', error);
      alert(`KI-Edit fehlgeschlagen: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    isGenerating,
    undoText,
    resetKiEditState,
    handleUndo,
    handleKiEdit,
  };
}

-----

## Schritt 8: src/components/modals/lightbox/LightboxMediaStage.tsx erstellen (NEU)

// src/components/modals/lightbox/LightboxMediaStage.tsx

import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Image as ImageIcon,
  Play,
  Youtube,
} from 'lucide-react';
import {
  getLightboxMediaPosterSrc,
  getResolutionVariants,
  isVideoFileMedia,
} from '../../../utils/postMediaHelpers';

interface LightboxMediaStageProps {
  postId: string;
  postTitle: string;
  mediaList: any[];
  activeMedia: any | null;
  activeMediaIndex: number;
  setActiveMediaIndex: React.Dispatch<React.SetStateAction<number>>;
  shouldPlayActiveMedia: boolean;
  setShouldPlayActiveMedia: React.Dispatch<React.SetStateAction<boolean>>;
  loadedPlayers: Set<number>;
  onActivatePlayer: (index: number) => void;
  activeVideoRef: React.RefObject<HTMLVideoElement | null>;
  isEditing: boolean;
  showResolutions: boolean;
  lightboxDraggedIdx: number | null;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getVideoSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  handleImageLoad: (id: string, e: React.SyntheticEvent<HTMLImageElement>) => void;
  handleLightboxDragStart: (e: React.DragEvent, i: number) => void;
  handleLightboxDragOver: (e: React.DragEvent) => void;
  handleLightboxDrop: (e: React.DragEvent, index: number, postId: string) => void;
}

export function LightboxMediaStage({
  postId,
  postTitle,
  mediaList,
  activeMedia,
  activeMediaIndex,
  setActiveMediaIndex,
  shouldPlayActiveMedia,
  setShouldPlayActiveMedia,
  loadedPlayers,
  onActivatePlayer,
  activeVideoRef,
  isEditing,
  showResolutions,
  lightboxDraggedIdx,
  isR2Fallback,
  isEmbeddedData,
  getImageSrc,
  getVideoSrc,
  getDisplayImage,
  handleImageLoad,
  handleLightboxDragStart,
  handleLightboxDragOver,
  handleLightboxDrop,
}: LightboxMediaStageProps) {
  const getMediaPosterSrc = (media: any) =>
    getLightboxMediaPosterSrc(
      media,
      getImageSrc,
      getDisplayImage,
      isR2Fallback,
      isEmbeddedData
    );

  const activeMediaPosterSrc = getMediaPosterSrc(activeMedia);
  const showEmbeddedPreview =
    !activeMedia &&
    !isEditing &&
    (activeMedia.type === 'youtube' || activeMedia.type === 'bunny') &&
    !shouldPlayActiveMedia;

  return (
    <div
      className={`relative flex-1 flex flex-col items-center justify-start min-h-0 w-full max-h-[85vh] ${
        isEditing ? 'overflow-y-auto gap-4 custom-scrollbar pr-2' : 'overflow-hidden'
      }`}
    >
      {isEditing ? (
        mediaList.map((media: any, i: number) => {
          const variants = getResolutionVariants(media);
          return (
            <div
              key={i}
              className="group w-full flex justify-center relative cursor-grab active:cursor-grabbing border-2 border-transparent hover:border-white/20 rounded-lg p-2"
              draggable={isEditing}
              onDragStart={(e) => isEditing && handleLightboxDragStart(e, i)}
              onDragOver={(e) => isEditing && handleLightboxDragOver(e)}
              onDrop={(e) => isEditing && handleLightboxDrop(e, i, postId)}
            >
              <div className="absolute top-4 left-4 z-10 bg-black/50 p-2 rounded text-white/50 pointer-events-none">
                <GripVertical className="w-6 h-6" />
              </div>

              {showResolutions && variants.length > 0 && (
                <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
                    {variants.map(({ key, label }) => (
                      <span
                        key={`${postId}-${i}-${key}`}
                        className="inline-flex items-center gap-1 rounded-full bg-black/70 border border-white/15 px-2 py-0.5 text-[8px] font-bold tracking-wide text-white/90 backdrop-blur-md shadow-lg"
                      >
                        <ImageIcon className="w-2.5 h-2.5" />
                        <span>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {media.type === 'bunny' && media.videoId && media.libraryId ? (
                <div
                  className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${
                    lightboxDraggedIdx !== null ? 'pointer-events-none' : ''
                  }`}
                >
                  <iframe
                    src={`https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}?autoplay=false&loop=false&muted=false&playsinline=true&preload=true&responsive=true`}
                    loading="lazy"
                    className="w-full h-full border-0"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen
                  />
                </div>
              ) : media.type === 'youtube' && media.youtubeId ? (
                <div
                  className={`w-full max-w-5xl aspect-video rounded-lg overflow-hidden shadow-2xl shrink-0 ${
                    lightboxDraggedIdx !== null ? 'pointer-events-none' : ''
                  }`}
                >
                  <iframe
                    src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=0&mute=0`}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : isVideoFileMedia(media, getVideoSrc) ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    src={getDisplayImage(getVideoSrc(media, true), isR2Fallback, isEmbeddedData)}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                    controls
                    muted
                    playsInline
                    preload="metadata"
                  />
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={getDisplayImage(getImageSrc(media, true), isR2Fallback, isEmbeddedData)}
                    alt={postTitle}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => handleImageLoad(`${postId}-${i}`, e)}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      if (target.src.includes('maxresdefault.jpg')) {
                        target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                      } else if (
                        media.image &&
                        target.src !== getDisplayImage(media.image, isR2Fallback, isEmbeddedData) &&
                        target.src !== media.image
                      ) {
                        target.src =
                          getDisplayImage(media.image, isR2Fallback, isEmbeddedData) || '';
                      }
                    }}
                  />
                </div>
              )}
            </div>
          );
        })
      ) : !isEditing && mediaList.length > 1 ? (
        <div className="w-full max-h-[85vh] overflow-y-auto custom-scrollbar pr-2 space-y-4">
          {mediaList.map((media: any, i: number) => (
            <article
              key={`${postId}-${i}`}
              className="group relative min-h-[min(72vh,720px)] w-full"
              onClick={() => setActiveMediaIndex(i)}
            >
              <div className="flex min-h-[calc(min(72vh,720px)-1.5rem)] w-full items-center justify-center">
                {(media.type === 'bunny' && media.videoId && media.libraryId) ||
                (media.type === 'youtube' && media.youtubeId) ? (
                  loadedPlayers.has(i) ? (
                    <div
                      className="w-full max-w-5xl aspect-video overflow-hidden rounded-lg shadow-2xl shrink-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {media.type === 'bunny' ? (
                        <iframe
                          src={`https://iframe.mediadelivery.net/embed/${media.libraryId}/${media.videoId}?autoplay=1&loop=false&muted=false&playsinline=true&preload=true&responsive=true`}
                          loading="lazy"
                          className="w-full h-full border-0"
                          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                          allowFullScreen
                          title={`${postTitle} – Bunny video ${i + 1}`}
                        />
                      ) : (
                        <iframe
                          src={`https://www.youtube.com/embed/${media.youtubeId}?autoplay=1&mute=0&playsinline=1`}
                          className="w-full h-full border-0"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title={`${postTitle} – YouTube video ${i + 1}`}
                        />
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="relative block w-full max-w-5xl aspect-video overflow-hidden rounded-lg shadow-2xl shrink-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        onActivatePlayer(i);
                      }}
                      aria-label="Video abspielen"
                    >
                      {getMediaPosterSrc(media) ? (
                        <img
                          src={getMediaPosterSrc(media)}
                          alt={postTitle}
                          className="absolute inset-0 h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(event) => {
                            const target = event.currentTarget;
                            if (target.src.includes('maxresdefault.jpg')) {
                              target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                            }
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-white/5">
                          <Youtube className="h-12 w-12 text-white/50" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-sm">
                          <Play className="ml-1 h-7 w-7" />
                        </div>
                      </div>
                    </button>
                  )
                ) : isVideoFileMedia(media, getVideoSrc) ? (
                  <video
                    src={getDisplayImage(getVideoSrc(media, true), isR2Fallback, isEmbeddedData)}
                    className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl shrink-0"
                    controls
                    playsInline
                    preload="metadata"
                    poster={getMediaPosterSrc(media)}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <img
                    src={getDisplayImage(getImageSrc(media, true), isR2Fallback, isEmbeddedData)}
                    alt={postTitle}
                    className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-2xl shrink-0"
                    referrerPolicy="no-referrer"
                    onLoad={(event) => handleImageLoad(`${postId}-${i}`, event)}
                    onError={(event) => {
                      const target = event.currentTarget;
                      if (target.src.includes('maxresdefault.jpg')) {
                        target.src = target.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
                      }
                    }}
                  />
                )}
              </div>
            </article>
          ))}
        </div>
      ) : activeMedia ? (
        <div
          className="group relative w-full h-full flex items-center justify-center"
          onMouseEnter={() => setShouldPlayActiveMedia(true)}
          onMouseLeave={() => setShouldPlayActiveMedia(false)}
        >
          {mediaList.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 transition-colors hover:text-white"
                onClick={() =>
                  setActiveMediaIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length)
                }
                aria-label="Vorheriges Medium"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white/70 transition-colors hover:text-white"
                onClick={() => setActiveMediaIndex((prev) => (prev + 1) % mediaList.length)}
                aria-label="Nächstes Medium"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {showEmbeddedPreview ? (
            <button
              type="button"
              className="relative flex items-center justify-center"
              onClick={() => setShouldPlayActiveMedia(true)}
              aria-label="Video starten"
            >
              {activeMediaPosterSrc ? (
                <img
                  src={activeMediaPosterSrc}
                  alt={postTitle}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl shrink-0"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => handleImageLoad(`${postId}-${activeMediaIndex}`, e)}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src.includes('maxresdefault.