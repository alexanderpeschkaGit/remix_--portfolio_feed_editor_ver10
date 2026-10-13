import { CheckCircle, X } from 'lucide-react';
import type { StatusNoticeData } from '../hooks/useStatusNotice';

interface StatusNoticeProps {
  notice: StatusNoticeData | null;
  onClose: () => void;
}

export const StatusNotice = ({ notice, onClose }: StatusNoticeProps) => {
  if (!notice) return null;
  return (
    <div
      className={`fixed top-4 right-4 z-[120] w-[min(92vw,420px)] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md ${
        notice.kind === 'success'
          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-50'
          : notice.kind === 'warning'
            ? 'border-amber-400/30 bg-amber-500/15 text-amber-50'
            : 'border-sky-400/30 bg-sky-500/15 text-sky-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <CheckCircle className="mt-0.5 w-5 h-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold tracking-tight">{notice.title}</div>
          <div className="text-sm opacity-90 mt-0.5">{notice.message}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-current/70 hover:text-current transition-colors"
          aria-label="Hinweis schließen"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
