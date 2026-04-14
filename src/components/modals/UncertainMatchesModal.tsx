// src/components/modals/UncertainMatchesModal.tsx
import React from 'react';
import { ImageIcon, X, CheckCircle, Trash2 } from 'lucide-react';

interface UncertainMatch {
  postId: string;
  previewUrl: string;
  localFile: string;
  distance: number;
}

interface UncertainMatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  matches: UncertainMatch[];
  flickrPosts: any[];
  getImageSrc: (post: any) => string | null;
  getDisplayImage: (url: string | undefined, isR2Fallback: boolean, isEmbeddedData: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  onConfirmMatch: (match: UncertainMatch) => void;
  onRejectMatch: (match: UncertainMatch) => void;
}

export function UncertainMatchesModal({
  isOpen,
  onClose,
  matches,
  flickrPosts,
  getImageSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
  onConfirmMatch,
  onRejectMatch
}: UncertainMatchesModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="bg-[#111] p-6 rounded-xl border border-white/10 w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-yellow-500" /> Unsichere Treffer prüfen
          </h2>
          <button 
            className="text-white/50 hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 space-y-6">
          {matches.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-8">Keine unsicheren Treffer zur Überprüfung.</p>
          ) : (
            matches.map((match, i) => {
              const post = flickrPosts.find(p => p.id === match.postId);
              return (
                <div key={i} className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col md:flex-row gap-6">
                  <div className="flex-1 flex flex-col gap-2">
                    <span className="text-xs text-white/40 uppercase tracking-wider">Feed Bild</span>
                    {getImageSrc(post) ? (
                      <img 
                        src={getDisplayImage(getImageSrc(post) ?? undefined, isR2Fallback, isEmbeddedData)} 
                        alt="" 
                        className="w-full aspect-square object-cover rounded-lg border border-white/10" 
                      />
                    ) : (
                      <div className="w-full aspect-square rounded-lg border border-white/10 bg-[#111] flex items-center justify-center text-white/40">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                    <span className="text-xs text-white/60 mt-2 truncate">{post?.title || 'Unbekannter Post'}</span>
                  </div>
                  
                  <div className="flex items-center justify-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xs text-yellow-500 font-bold">Match?</span>
                      <div className="h-px w-8 bg-white/20" />
                      <span className="text-[10px] text-white/30">Dist: {match.distance}</span>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col gap-2">
                    <span className="text-xs text-white/40 uppercase tracking-wider">Lokales Original (Preview)</span>
                    <img 
                      src={getDisplayImage(match.previewUrl, isR2Fallback, isEmbeddedData)} 
                      alt="" 
                      className="w-full aspect-square object-cover rounded-lg border border-white/10" 
                    />
                    <span className="text-xs text-white/60 mt-2 truncate">{match.localFile}</span>
                  </div>

                  <div className="flex flex-col justify-center gap-2">
                    <button 
                      onClick={() => onConfirmMatch(match)}
                      className="flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-500 transition-all active:scale-95"
                    >
                      <CheckCircle className="w-4 h-4" /> Bestätigen
                    </button>
                    <button 
                      onClick={() => onRejectMatch(match)}
                      className="flex items-center justify-center gap-2 bg-white/5 text-white/50 px-6 py-3 rounded-xl font-medium hover:bg-white/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4" /> Ablehnen
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
