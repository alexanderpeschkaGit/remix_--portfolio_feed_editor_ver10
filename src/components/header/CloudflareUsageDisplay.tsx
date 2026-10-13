interface CloudflareUsageData {
  local: { classA: number; classB: number; storageBytes: number };
  estimatedCost: number;
}

export const CloudflareUsageDisplay = ({ usage }: { usage: CloudflareUsageData | null }) => {
    if (!usage) return null;
    const { local, estimatedCost } = usage;
    
    return (
      <div className="flex items-center justify-between gap-4 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] whitespace-nowrap overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white/90">Cloudflare R2:</span>
          <span className="text-white/60">A: <span className="text-white font-mono">{local.classA}</span></span>
          <span className="text-white/60">B: <span className="text-white font-mono">{local.classB}</span></span>
          <span className="text-white/60">Storage: <span className="text-white font-mono">{(local.storageBytes / (1024 * 1024)).toFixed(1)}MB</span></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded font-bold bg-white/10 text-white/90">
            ${estimatedCost}
          </span>
        </div>
      </div>
    );
  };

  