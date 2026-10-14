import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildGroupedVariantCounts,
  type MediaVariantAudit,
} from "../utils/mediaVariantsHelpers";

interface UseMediaVariantsAuditParams {
  onStateUpdated: () => Promise<void>;
}

export function useMediaVariantsAudit({
  onStateUpdated,
}: UseMediaVariantsAuditParams) {
  const [audit, setAudit] = useState<MediaVariantAudit | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    progress: number;
    total: number;
  } | null>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingAndPublishing, setGeneratingAndPublishing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [helpText, setHelpText] = useState<string | null>(null);

  const visibleAudit = (result?.publishedAudit ||
    result?.auditAfter ||
    audit) as MediaVariantAudit | null;
  const issues = visibleAudit?.issues || [];
  const generatableCount = visibleAudit?.generatableIssueCount || 0;
  const groupedCounts = useMemo(
    () => buildGroupedVariantCounts(visibleAudit),
    [visibleAudit],
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
      const startRes = await fetch("/api/media-variants/audit", {
        method: "POST",
      });
      if (!startRes.ok) throw new Error("Failed to start audit");

      scanPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/media-variants/status");
          const status = await statusRes.json();
          setScanProgress({
            progress: status.progress || 0,
            total: status.total || 0,
          });

          if (status.cancelled) {
            clearScanPoll();
            setLoading(false);
            setScanProgress(null);
            setError("Scan cancelled.");
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
      setError(err.message || "Media variant scan failed");
      setLoading(false);
      setScanProgress(null);
    }
  };

  const cancelScan = async () => {
    try {
      await fetch("/api/media-variants/audit/cancel", { method: "POST" });
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
      const response = await fetch("/api/media-variants/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Media variant generation failed");
      setResult(data);
      await onStateUpdated();
    } catch (err: any) {
      setError(err.message || "Media variant generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const publishToR2 = async () => {
    const confirmed = window.confirm(
      "Upload all generated files to Cloudflare R2 and publish state.json?\n\n" +
        "This will overwrite the live state.json on R2.",
    );
    if (!confirmed) return;

    setPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/media-variants/publish", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Publish failed");
      setPublishResult(data);
      await onStateUpdated();
    } catch (err: any) {
      setError(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const generateAndPublish = async () => {
    const confirmed = window.confirm(
      "Generate missing media variants, upload them to Cloudflare R2, and publish state.json — all in one step?\n\n" +
        "This will overwrite the live state.json on R2.",
    );
    if (!confirmed) return;

    setGeneratingAndPublishing(true);
    setError(null);
    setPublishResult(null);
    try {
      const response = await fetch("/api/media-variants/generate-and-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Generate-and-publish failed");
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
      setError(err.message || "Generate-and-publish failed");
    } finally {
      setGeneratingAndPublishing(false);
    }
  };

  const copyFileList = () => {
    const files = result?.generatedFiles || [];
    if (files.length === 0) return;
    navigator.clipboard.writeText(files.join("\n")).catch(() => {});
  };

  const verifyPublished = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/media-variants/verify-published", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Published verification failed");
      setAudit(data.audit);
      setResult(null);
    } catch (err: any) {
      setError(err.message || "Published verification failed");
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
      const res = await fetch("/data/media_variants_help.txt");
      if (res.ok) {
        const text = await res.text();
        setHelpText(text);
        setShowHelp(true);
      } else {
        setError("Help file not found.");
      }
    } catch {
      setError("Could not load help file.");
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
