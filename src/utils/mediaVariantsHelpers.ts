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
    case "missing-json-field":
      return "Missing JSON field";
    case "missing-r2-object":
      return "Missing R2 object";
    case "not-r2-reference":
      return "External reference";
    case "source-unavailable":
      return "No source";
    case "published-verification-failed":
      return "Verify failed";
    default:
      return reason;
  }
};

export const issueClass = (issue: MediaVariantIssue): string => {
  if (
    issue.reason === "source-unavailable" ||
    issue.reason === "published-verification-failed"
  ) {
    return "border-red-400/25 bg-red-500/10";
  }
  if (issue.canGenerate) return "border-amber-400/25 bg-amber-500/10";
  return "border-white/10 bg-white/5";
};

export const buildGroupedVariantCounts = (
  visibleAudit: MediaVariantAudit | null,
): GroupedVariantCount[] => {
  if (!visibleAudit) return [];
  return [
    { label: "JSON", value: visibleAudit.missingJsonCount },
    { label: "R2", value: visibleAudit.missingR2Count },
    { label: "External", value: visibleAudit.externalReferenceCount },
    { label: "No source", value: visibleAudit.sourceUnavailableCount },
  ];
};
