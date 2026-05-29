import React, { useEffect, useMemo, useState } from 'react';
import { CheckSquare, RefreshCw, RotateCcw, Square, Trash2, X, Image as ImageIcon } from 'lucide-react';

export interface TrashItem {
  key: string;
  trashKey: string;
  originalKey: string;
  reason: string;
  size: number;
  contentType: string;
  trashedAt: string;
  previewUrl: string;
  originalExists?: boolean;
}

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: TrashItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onRestore: (trashKeys: string[]) => Promise<void>;
  onDelete: (trashKeys: string[]) => Promise<void>;
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
};

const formatDateTime = (value: string) => {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export function TrashModal({
  isOpen,
  onClose,
  items,
  loading,
  error,
  onRefresh,
  onRestore,
  onDelete,
}: TrashModalProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  useEffect(() => {
    setSelectedKeys(prev => prev.filter(key => items.some(item => item.key === key)));
  }, [items]);

  const allSelected = items.length > 0 && selectedKeys.length === items.length;
  const selectedItems = useMemo(() => items.filter(item => selectedKeys.includes(item.key)), [items, selectedKeys]);
  const selectedBytes = selectedItems.reduce((sum, item) => sum + (item.size || 0), 0);

  if (!isOpen) return null;

  const toggleItem = (key: string) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(itemKey => itemKey !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    setSelectedKeys(prev => (prev.length === items.length ? [] : items.map(item => item.key)));
  };

  const runAction = async (action: (keys: string[]) => Promise<void>) => {
    if (selectedKeys.length === 0) return;
    const keys = [...selectedKeys];
    await action(keys);
    setSelectedKeys([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-4xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-medium text-white flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Trash
            </h2>
            <p className="text-xs text-white/40 mt-1">
              {items.length} items, {formatBytes(items.reduce((sum, item) => sum + (item.size || 0), 0))} total
            </p>
          </div>
          <button
            className="text-white hover:text-white/90 transition-colors p-1"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={toggleAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/30 hover:bg-white/40 text-white text-sm transition-colors"
          >
            {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {allSelected ? 'Unselect all' : 'Select all'}
          </button>
          <button
            onClick={() => onRefresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/30 hover:bg-white/40 text-white text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => runAction(onRestore)}
            disabled={loading || selectedKeys.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/30 hover:bg-white/40 text-white text-sm transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Restore selected
          </button>
          <button
            onClick={() => runAction(onDelete)}
            disabled={loading || selectedKeys.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 bg-white/30 hover:bg-white/40 text-white text-sm transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            Delete selected
          </button>
          <div className="ml-auto text-xs text-white/40">
            Selected: {selectedKeys.length} {selectedKeys.length > 0 ? `(${formatBytes(selectedBytes)})` : ''}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-white/20 bg-white/10 p-3 text-sm text-white">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {items.length === 0 ? (
            <div className="h-full min-h-64 flex items-center justify-center text-white/40 text-sm">
              The trash is empty.
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => {
                const selected = selectedKeys.includes(item.key);
                const isImage = item.contentType?.startsWith('image/');
                const isConflict = !!item.originalExists;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => !isConflict && toggleItem(item.key)}
                    disabled={isConflict}
                    className={`w-full text-left rounded-xl border p-3 transition-all flex gap-4 items-stretch ${
                      isConflict
                      ? 'border-white/20 bg-white/10 cursor-not-allowed'
                        : selected
                          ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center">
                      {isImage ? (
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-white/30" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {item.originalKey}
                          </div>
                          <div className="text-xs text-white/40 mt-1 truncate">
                            {item.reason} · {formatDateTime(item.trashedAt)}
                          </div>
                          {isConflict && (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/30 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Conflict: original file already exists
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right text-xs text-white/60">
                          <div>{formatBytes(item.size || 0)}</div>
                          <div className="text-white/35 mt-1">
                            {isConflict ? 'Restore blocked' : selected ? 'Selected' : 'Click to select'}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-white/30 break-all">
                        Trash key: {item.trashKey}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
