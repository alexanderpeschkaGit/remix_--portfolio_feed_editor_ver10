import React from 'react';
import { X, Plus, Play, Music } from 'lucide-react';

interface PostCommitModalProps {
  isOpen: boolean;
  post: any | null;
  onClose: () => void;
  onConfirm: () => void;
  source: 'instagram' | 'flickr' | null;
}

export function PostCommitModal({ isOpen, post, onClose, onConfirm, source }: PostCommitModalProps) {
  if (!isOpen || !post) return null;

  const isVideo = post.type === 'video';
  const imageUrl = isVideo
    ? post.image_preview || post.image || post.image_large
    : post.image || post.image_large || post.image_preview;

  const sourceLabel = source === 'instagram' ? 'Instagram' : 'Flickr';

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            Add {sourceLabel} Post
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Preview */}
        <div className="relative w-full aspect-square bg-black/50 rounded-lg overflow-hidden mb-4 border border-white/10">
          {imageUrl ? (
            <>
              <img
                src={imageUrl}
                alt={post.title}
                className="w-full h-full object-cover"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Play className="w-12 h-12 text-white fill-white" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40">
              No preview available
            </div>
          )}
        </div>

        {/* Title and Description */}
        <div className="mb-4 space-y-2">
          <h3 className="text-white font-semibold truncate">{post.title}</h3>
          <p className="text-white/60 text-sm line-clamp-3">
            {post.description || 'No description'}
          </p>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-xs truncate block"
            >
              View on {sourceLabel}
            </a>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-white/30 hover:bg-white/40 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add to Portfolio
          </button>
        </div>
      </div>
    </div>
  );
}
