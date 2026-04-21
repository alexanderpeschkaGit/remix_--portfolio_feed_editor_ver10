import React from 'react';
import { X, Save } from 'lucide-react';

interface BioEditorModalProps {
  isOpen: boolean;
  bio: string;
  onClose: () => void;
  onSave: (bio: string) => void;
}

export function BioEditorModal({ isOpen, bio, onClose, onSave }: BioEditorModalProps) {
  const [tempBio, setTempBio] = React.useState(bio);

  React.useEffect(() => {
    setTempBio(bio);
  }, [bio, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(tempBio);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 max-w-2xl w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Edit Bio</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <textarea
          value={tempBio}
          onChange={(e) => setTempBio(e.target.value)}
          placeholder="Enter your portfolio bio..."
          className="w-full h-[15rem] bg-black/30 border border-white/20 rounded-lg p-4 text-white/90 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 resize-none"
        />

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Bio
          </button>
        </div>
      </div>
    </div>
  );
}
