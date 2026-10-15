import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Clipboard, HelpCircle, Image as ImageIcon, Loader2, RefreshCw, UploadCloud, X, Zap } from 'lucide-react';

interface MediaVariantIssue {
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

interface MediaVariantAudit {
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

interface MediaVariantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStateUpdated: () => Promise<void>;
}

const reasonLabel = (reason: string) => {
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

const issueClass = (issue: MediaVariantIssue) => {
  if (issue.reason === 'source-unavailable' || issue.reason === 'published-verification-failed') {
    return 'border-red-400/25 bg-red-500/10';
  }
  if (issue.canGenerate) return 'border-amber-400/25 bg-amber-500/10';
  return 'border-white/10 bg-white/5';
};

export function MediaVariantsModal({ isOpen, onClose, onStateUpdated }: MediaVariantsModalProps) {
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

  const groupedCounts = useMemo(() => {
    if (!visibleAudit) return [];
    return [
      { label: 'JSON', value: visibleAudit.missingJsonCount },
      { label: 'R2', value: visibleAudit.missingR2Count },
      { label: 'External', value: visibleAudit.externalReferenceCount },
      { label: 'No source', value: visibleAudit.sourceUnavailableCount },
    ];
  }, [visibleAudit]);

  const scan = async () => {
    // Clear any previous poll
    if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
    setLoading(true);
    setScanProgress({ progress: 0, total: 0 });
    setError(null);
    setResult(null);
    setAudit(null);
    try {
      // Start the audit (server responds immediately, works in background)
      const startRes = await fetch('/api/media-variants/audit', { method: 'POST' });
      if (!startRes.ok) throw new Error('Failed to start audit');
      // Poll for progress every 1000ms
      scanPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/media-variants/status');
          const status = await statusRes.json();
          setScanProgress({ progress: status.progress || 0, total: status.total || 0 });
          if (status.cancelled) {
            if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
            setLoading(false);
            setScanProgress(null);
            setError('Scan cancelled.');
            return;
          }
          if (!status.running || status.done) {
            if (scanPollRef.current) { clearInterval(scanPollRef.current); scanPollRef.current = null; }
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

  // Cleanup poll on unmount
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
      // Show one-step result in the publish banner: total generated files count
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

  // Auto-scan removed — user must click "Scan Local" explicitly

  if (!isOpen) return null;

  const busy = loading || generating || generatingAndPublishing || publishing;
  const isScanning = loading && scanProgress !== null;

  const generatedFiles: string[] = result?.generatedFiles || [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={() => (!busy || isScanning) ? undefined : onClose()}
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
            <div className={`rounded-lg border px-3 py-2 ${visibleAudit.ok ? 'border-green-400/25 bg-green-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Issues</div>
              <div className="text-lg text-white font-semibold">{visibleAudit.issueCount}</div>
            </div>
            {groupedCounts.map((count) => (
              <div key={count.label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <div className="text-[10px] text-white/40 uppercase tracking-wider">{count.label}</div>
                <div className="text-lg text-white font-semibold">{count.value}</div>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${result.success ? 'border-green-400/25 bg-green-500/10 text-green-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-100'}`}>
            {result.published ? 'Generated & published' : 'Generated'} {result.generated?.length || 0} media entries ({generatedFiles.length} files).
            {result.failed?.length ? ` ${result.failed.length} failed.` : ''}
            {result.published && ' State.json published to R2.'}
            {!result.dryRun && result.candidatePath && (
              <div className="mt-1 text-[11px] text-white/40 truncate">Candidate: {result.candidatePath}</div>
            )}
          </div>
        )}

        {publishResult && (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${publishResult.success ? 'border-green-400/25 bg-green-500/10 text-green-100' : 'border-amber-400/25 bg-amber-500/10 text-amber-100'}`}>
            Published {publishResult.uploaded?.length || 0}/{publishResult.totalFiles || 0} files to R2.
            {publishResult.uploadErrors?.length ? ` ${publishResult.uploadErrors.length} errors.` : ' State.json published.'}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar border border-white/5 rounded-lg bg-black/35">
          {busy && !isScanning && (
            <div className="h-64 flex flex-col items-center justify-center text-white/50 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span>{publishing ? 'Uploading files to R2...' : generatingAndPublishing ? 'Generating & publishing...' : generating ? 'Generating local variants...' : 'Scanning media variants...'}</span>
            </div>
          )}

          {isScanning && (
            <div className="p-6 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <span className="text-white/60 text-sm">Scanning... {scanProgress.total > 0 ? `${scanProgress.progress}/${scanProgress.total} entries` : ''}</span>
              <div className="w-full max-w-md h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.progress / scanProgress.total) * 100) : 0}%` }}
                />
              </div>
              <button
                onClick={cancelScan}
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
              <span>Press "Scan Local" to check for missing variants.</span>
            </div>
          )}

          {!busy && !isScanning && issues.length > 0 && (
            <div className="divide-y divide-white/5">
              {issues.map((issue, index) => (
                <div key={`${issue.itemId}-${issue.mediaIndex}-${issue.field}-${issue.reason}-${index}`} className={`p-3 border-l-2 ${issueClass(issue)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-white">
                        <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                        <span className="truncate">{issue.label || issue.title || issue.itemId}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {issue.mediaIndex >= 0 ? `Media #${issue.mediaIndex + 1}` : 'Top level'} · {issue.mediaType || 'media'} · {issue.field}
                      </div>
                      {(issue.r2Key || issue.url || issue.error) && (
                        <div className="mt-1 font-mono text-[11px] text-white/35 break-all truncate max-w-[320px]" title={issue.r2Key || issue.url || issue.error}>
                          {issue.r2Key || issue.url || issue.error}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] uppercase tracking-wider text-white/60">{reasonLabel(issue.reason)}</div>
                      <div className={`mt-1 text-[10px] ${issue.canGenerate ? 'text-green-300' : 'text-white/35'}`}>
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
                  onClick={copyFileList}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
                  title="Copy file list to clipboard"
                >
                  <Clipboard className="w-3 h-3" />
                  Copy
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar bg-black/25 rounded-lg border border-white/5">
                {generatedFiles.map((file: string, i: number) => (
                  <div key={i} className="px-2 py-1 text-[11px] font-mono text-white/40 border-b border-white/5 last:border-0 truncate hover:text-white/60">
                    {file}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <div className="relative group">
            <button
              onClick={scan}
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
              onClick={verifyPublished}
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
              onClick={generate}
              disabled={busy || !visibleAudit || visibleAudit.issueCount === 0 || generatableCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-300/30 bg-blue-500/30 hover:bg-blue-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              {generating ? 'Generating...' : 'Generate'}
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
              Creates missing variant files on your local machine only. Nothing is uploaded. Use Publish afterwards.
            </div>
          </div>
          <div className="relative group">
            <button
              onClick={generateAndPublish}
              disabled={busy || !visibleAudit || visibleAudit.issueCount === 0 || generatableCount === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300/30 bg-purple-500/30 hover:bg-purple-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {generatingAndPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {generatingAndPublishing ? 'Generating...' : 'Gen + Publish'}
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
              Generates missing variants, uploads to R2, and publishes state.json — all in one click.
            </div>
          </div>
          <div className="relative group">
            <button
              onClick={publishToR2}
              disabled={busy || !result || generatedFiles.length === 0 || publishResult?.success}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-green-300/30 bg-green-500/30 hover:bg-green-500/40 text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {publishing ? 'Publishing...' : publishResult?.success ? 'Published ✓' : 'Publish'}
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-white text-black text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-[60] shadow-xl max-w-[440px] text-center leading-relaxed whitespace-normal">
              Uploads previously generated files to R2 and publishes state.json. Only available after Generate.
            </div>
          </div>
        </div>
      </div>

      {/* Help Overlay */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-white">Media Variants — Help</h2>
              <button
                className="text-white hover:text-white/90 transition-colors p-1"
                onClick={() => setShowHelp(false)}
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
                onClick={() => setShowHelp(false)}
                className="px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
