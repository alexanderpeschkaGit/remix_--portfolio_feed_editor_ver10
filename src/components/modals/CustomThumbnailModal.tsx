// components/modals/CustomThumbnailModal.tsx
/**
 * CustomThumbnailModal Component
 * 
 * Opens a video player in a lightbox so the user can scrub to any frame,
 * pause, and capture that frame as a custom thumbnail.
 * 
 * Supported: video files (mp4/webm/mov) and Bunny Stream (via direct URL).
 * Not supported: YouTube (cross-origin iframe blocks canvas capture).
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, Loader2, CheckCircle2, AlertCircle, Play, Pause } from 'lucide-react';

interface CustomThumbnailModalProps {
  /** The video URL to play (must be a direct mp4/webm/mov URL) */
  videoUrl: string;
  /** The media item being edited */
  media: any;
  /** Index of this media within the post's mergedMedia array */
  mediaIndex?: number;
  /** Post title for display */
  postTitle: string;
  /** Post ID for server-side naming */
  postId: string;
  /** Display image helper (for R2 fallback resolution) */
  getDisplayImage: (url: string | undefined, r2: boolean, embedded: boolean) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
  /** Called with variant URLs when thumbnail is saved */
  onSave: (variantUrls: {
    image_thumb: string;
    image_1k: string;
    image_2k: string;
    image_3k: string;
    image_original: string;
    image_width: number;
    image_height: number;
  }) => void;
  onClose: () => void;
}

type SaveState = 'idle' | 'capturing' | 'uploading' | 'done' | 'error';

export const CustomThumbnailModal: React.FC<CustomThumbnailModalProps> = ({
  videoUrl,
  media,
  mediaIndex,
  postTitle,
  postId,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
  onSave,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [videoLoadError, setVideoLoadError] = useState(false);

  // Start paused
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      setDuration(video.duration || 0);
      // Seek to 1 second (or 10% of duration) for a reasonable starting frame
      const startTime = Math.min(1, (video.duration || 0) * 0.1);
      video.currentTime = startTime;
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime || 0);
    };

    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onEnded = () => setIsPaused(true);

    const onError = () => {
      setVideoLoadError(true);
      setErrorMessage('Video could not be loaded. The URL may be invalid or inaccessible.');
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    // Ensure video starts paused
    video.pause();

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [videoUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (saveState === 'uploading') return; // Don't close during upload
        onClose();
      }
      // Space: toggle play/pause
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
      // Arrow keys: seek ±1s
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const video = videoRef.current;
        if (!video) return;
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, saveState]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, vw, vh);
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  const handleSaveThumbnail = useCallback(async () => {
    setSaveState('capturing');
    setErrorMessage('');

    // Small delay to ensure the frame is fully rendered
    await new Promise(r => setTimeout(r, 100));

    const imageData = captureFrame();
    if (!imageData) {
      setSaveState('error');
      setErrorMessage('Failed to capture frame. The video may not be ready yet.');
      return;
    }

    setSaveState('uploading');

    try {
      const response = await fetch('/api/upload-custom-thumb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, postId, mediaIndex }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setSaveState('done');
      onSave({
        image_thumb: data.image_thumb,
        image_1k: data.image_1k,
        image_2k: data.image_2k,
        image_3k: data.image_3k,
        image_original: data.image_original,
        image_width: data.image_width || 0,
        image_height: data.image_height || 0,
      });

      // Auto-close after a short delay so the user sees the success state
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error: any) {
      setSaveState('error');
      setErrorMessage(error.message || 'Failed to upload custom thumbnail');
    }
  }, [captureFrame, postId, mediaIndex, onSave, onClose]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && saveState !== 'uploading') {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-sm"
      onClick={handleBackgroundClick}
    >
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Close button */}
      <button
        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-black/50 p-2 rounded-full z-10"
        onClick={() => {
          if (saveState !== 'uploading') onClose();
        }}
        disabled={saveState === 'uploading'}
      >
        <X className="w-6 h-6" />
      </button>

      {/* Header */}
      <div className="absolute top-6 left-6 text-white/70 text-sm z-10 max-w-[60%] truncate">
        Custom Thumbnail — {postTitle}
      </div>

      <div
        className="max-w-5xl w-full flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Video player */}
        <div className="relative w-full bg-black rounded-lg overflow-hidden shadow-2xl">
          {videoLoadError ? (
            <div className="w-full aspect-video flex flex-col items-center justify-center text-white/60 gap-3 bg-black/80">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <span className="text-sm">{errorMessage}</span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded text-white/80 text-sm transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full max-h-[70vh] object-contain"
              preload="auto"
              controls={false}
              muted={false}
              playsInline
              crossOrigin="anonymous"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) {
                  video.play().catch(() => {});
                } else {
                  video.pause();
                }
              }}
            />
          )}

          {/* Video controls overlay */}
          {!videoLoadError && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12">
              {/* Timeline scrubber */}
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (!video) return;
                    if (video.paused) {
                      video.play().catch(() => {});
                    } else {
                      video.pause();
                    }
                  }}
                  className="text-white/80 hover:text-white transition-colors"
                  title={isPaused ? 'Play (Space)' : 'Pause (Space)'}
                >
                  {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                </button>
                <span className="text-white/70 text-xs font-mono min-w-[70px] text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const video = videoRef.current;
                    if (!video) return;
                    video.currentTime = parseFloat(e.target.value);
                  }}
                  className="flex-1 h-1.5 appearance-none bg-white/20 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-black/50"
                />
                <span className="text-white/50 text-xs font-mono min-w-[70px]">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Frame-stepping hint */}
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-[10px]">
                  ← → seek ±1s &nbsp;|&nbsp; Space: play/pause &nbsp;|&nbsp; Click video to toggle
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Save button — only visible when paused and not already saving */}
        {isPaused && saveState === 'idle' && !videoLoadError && (
          <button
            onClick={handleSaveThumbnail}
            className="flex items-center gap-3 px-8 py-3 bg-white/20 hover:bg-white/30 border border-white/30 rounded-xl text-white font-medium text-lg transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-black/30"
            title="Capture current frame as custom thumbnail"
          >
            <Camera className="w-5 h-5" />
            Save Thumbnail
          </button>
        )}

        {/* Upload state indicators */}
        {saveState === 'capturing' && (
          <div className="flex items-center gap-2 text-white/70">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Capturing frame…</span>
          </div>
        )}

        {saveState === 'uploading' && (
          <div className="flex items-center gap-2 text-blue-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Uploading thumbnail &amp; generating variants…</span>
          </div>
        )}

        {saveState === 'done' && (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">Thumbnail saved! Closing…</span>
          </div>
        )}

        {saveState === 'error' && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button
              onClick={() => setSaveState('idle')}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white/70 text-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
