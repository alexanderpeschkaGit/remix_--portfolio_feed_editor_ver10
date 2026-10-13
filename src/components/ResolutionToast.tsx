import { motion, AnimatePresence } from 'motion/react';
import { ImageIcon } from 'lucide-react';

interface ResolutionToastProps {
  show: boolean;
  resolutionsEnabled: boolean;
}

export const ResolutionToast = ({ show, resolutionsEnabled }: ResolutionToastProps) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          className="fixed bottom-10 left-1/2 z-[100] bg-white/30 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-3 border border-white/20 backdrop-blur-md"
        >
          <ImageIcon className="w-5 h-5" />
          <span>Auflösungs-Overlay: {resolutionsEnabled ? 'AN' : 'AUS'} (Strg+Alt+Y)</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
