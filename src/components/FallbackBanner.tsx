import { RefreshCw, X } from 'lucide-react';

interface FallbackBannerProps {
  label: string;
  isError: boolean;
  fallbackEnabled: boolean;
  onDismiss: () => void;
  onToggleFallback: () => void;
}

export const FallbackBanner = ({ label, isError, fallbackEnabled, onDismiss, onToggleFallback }: FallbackBannerProps) => {
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 ${isError ? 'bg-red-500/90 text-white' : 'bg-amber-500/90 text-black'} backdrop-blur-md text-[10px] sm:text-xs font-bold rounded-full shadow-lg border ${isError ? 'border-red-400' : 'border-amber-400'} animate-pulse`}>
      <RefreshCw className="w-3 h-3 animate-spin" />
      <span>{label}</span>
      <button
        onClick={onDismiss}
        className="ml-2 hover:opacity-70"
      >
        <X className="w-3 h-3" />
      </button>
      <button
        onClick={onToggleFallback}
        className="ml-1 inline-flex items-center gap-1 px-2 py-1 bg-white/30 hover:bg-white/40 border border-white/20 rounded text-[10px] font-bold text-white"
        title="Persistently disable R2/Flickr fallback loading"
      >
        {fallbackEnabled ? 'Fallback aus' : 'Fallback an'}
      </button>
    </div>
  );
};
