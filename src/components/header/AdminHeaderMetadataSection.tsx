import React from 'react';
import { X } from 'lucide-react';

export interface AdminHeaderMetadataSectionProps {
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  portfolioTitle: string;
  setPortfolioTitle: (v: string) => void;
  portfolioSubtitle: string;
  setPortfolioSubtitle: (v: string) => void;
  igAccount: string;
  setIgAccount: (v: string) => void;
  flickrUrl: string;
  setFlickrUrl: (v: string) => void;
}

export const AdminHeaderMetadataSection: React.FC<AdminHeaderMetadataSectionProps> = ({
  isEditing,
  setIsEditing,
  portfolioTitle,
  setPortfolioTitle,
  portfolioSubtitle,
  setPortfolioSubtitle,
  igAccount,
  setIgAccount,
  flickrUrl,
  setFlickrUrl,
}) => {
  if (isEditing) {
    return (
      <div className="flex flex-col gap-4 mb-8 relative">
        <button 
          onClick={() => setIsEditing(false)}
          className="absolute -top-4 -right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-10"
          title="Bearbeitungsmodus beenden"
        >
          <X className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={portfolioTitle}
          onChange={(e) => setPortfolioTitle(e.target.value)}
          className="w-full text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90 bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-2"
        />
        <input
          type="text"
          value={portfolioSubtitle}
          onChange={(e) => setPortfolioSubtitle(e.target.value)}
          className="w-full text-center text-white/50 mt-2 tracking-widest text-sm uppercase bg-transparent border-b border-white/20 focus:outline-none focus:border-white/50 pb-1"
          placeholder="Subtitle"
        />
        <div className="mt-6 flex flex-col gap-3 max-w-xl mx-auto bg-white/10 p-4 rounded-xl border border-white/10">
          <div className="text-xs text-white/50 uppercase tracking-wider text-left mb-1">Scraping Sources</div>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-sm w-24 text-right">Instagram:</span>
            <input
              type="text"
              value={igAccount}
              onChange={(e) => setIgAccount(e.target.value)}
              className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
              placeholder="Instagram Username"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-sm w-24 text-right">Flickr URL:</span>
            <input
              type="text"
              value={flickrUrl}
              onChange={(e) => setFlickrUrl(e.target.value)}
              className="flex-1 bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/30"
              placeholder="Flickr Album URL"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-12">
      <h1 className="text-center font-light tracking-[8px] text-3xl md:text-5xl uppercase text-white/90">
        {portfolioTitle}
      </h1>
      <p className="text-center text-white/50 mt-4 tracking-widest text-sm uppercase">
        {portfolioSubtitle}
      </p>
    </div>
  );
};
