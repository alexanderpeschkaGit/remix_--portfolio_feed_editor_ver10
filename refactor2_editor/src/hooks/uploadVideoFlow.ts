import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { hasRenderableMedia } from '../utils/mediaHelpers';

interface UploadVideoFileFlowDeps {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  setError: Dispatch<SetStateAction<string>>;
  pushStatusNotice: (kind: 'success' | 'info' | 'warning', title: string, message: string) => void;
  shouldPushStateToR2Ref: MutableRefObject<boolean>;
  setActiveUploads: Dispatch<SetStateAction<Record<string, number>>>;
  setHasUnsyncedMedia: Dispatch<SetStateAction<boolean>>;
  setBunnyProgress: Dispatch<SetStateAction<Record<string, { step: string; progress: number; text: string }>>>;
}

interface VideoLinkChangeDeps {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  shouldPushStateToR2Ref: MutableRefObject<boolean>;
  handlePostChange: (id: string, field: string, value: string) => void;
}

  const bunnyStepLabels: Record<string, string> = {
    starting: 'Starte Bunny-Upload…',
    uploading: 'Lade Video zu Bunny hoch…',
    encoding: 'Bunny verarbeitet das Video…',
    variants: 'Generiere Thumbnail-Varianten…',
    done: 'Bunny-Upload abgeschlossen ✓',
    error: 'Bunny-Fehler – lokal gespeichert',
  };
export async function uploadVideoFileFlow(
  deps: UploadVideoFileFlowDeps,
  id: string,
  file: File
): Promise<void> {
  const { flickrPosts, updatePosts, describePost, setError, pushStatusNotice, shouldPushStateToR2Ref, setActiveUploads, setHasUnsyncedMedia, setBunnyProgress } = deps;
    if (!file) return;
    setActiveUploads(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setHasUnsyncedMedia(true);

    const uploadId = Math.random().toString(36).substring(7);
    const localUrl = URL.createObjectURL(file);

    // Get project name for folder organization
    const post = flickrPosts.find(p => String(p.id) === String(id));
    const projectName = post?.title || '';
    const projectDescription = typeof post?.description === 'string'
      ? post.description
      : (post?.description?.description || post?.description?.text || '');

    // Optimistic update: add video item to mergedMedia
    updatePosts(posts => posts.map(post => {
      if (String(post.id) !== String(id)) return post;
      // `video` holds the local blob so the card can play the dropped file immediately;
      // `image`/`image_thumb` keep the blob only for drop-compat (never rendered as <img>).
      const newItem: any = { uploadId, type: 'video', video: localUrl, image: localUrl, image_thumb: localUrl, url: localUrl };
      const existingMedia = post.mergedMedia && post.mergedMedia.length > 0
        ? post.mergedMedia.filter(hasRenderableMedia)
        : [];
      return { ...post, mergedMedia: [...existingMedia, newItem] };
    }), `Video-Upload gestartet (${describePost(post)})`);

    // Show initial progress
    setBunnyProgress(prev => ({ ...prev, [id]: { step: 'local', progress: 10, text: 'Speichere lokal & extrahiere Vorschau…' } }));

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('projectId', id);
      formData.append('projectName', projectName);
      formData.append('projectDescription', projectDescription);

      // Try Bunny hybrid first, fall back to local-only if anything goes wrong
      let uploadRes = await fetch('/api/upload-video-to-bunny', {
        method: 'POST',
        body: formData
      });

      // If hybrid fails for ANY reason, fall back to local upload silently
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({}));
        console.warn('Bunny hybrid failed, falling back to local:', errBody.error || uploadRes.status);
        // Retry with local-only endpoint
        uploadRes = await fetch('/api/upload-video', {
          method: 'POST',
          body: formData
        });
      }

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || `Upload fehlgeschlagen (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      const hasThumb = !!(uploadData.image_thumb || uploadData.image || uploadData.bunnyThumbUrl);
      const thumbUrl = hasThumb ? (uploadData.image_thumb || uploadData.image || uploadData.bunnyThumbUrl) : '';
      const url1k = uploadData.image_1k || thumbUrl;
      const url2k = uploadData.image_2k || '';
      const url3k = uploadData.image_3k || '';
      // Use Bunny embed URL if videoId is available from Phase 1, otherwise fall back to local path
      const bunnyTaskId: string | null = uploadData.bunnyTaskId || null;
      const phase1VideoId: string | null = uploadData.videoId || null;
      const phase1LibraryId: string | null = uploadData.libraryId || null;
      const videoUrl = (phase1VideoId && phase1LibraryId)
        ? `https://iframe.mediadelivery.net/embed/${phase1LibraryId}/${phase1VideoId}`
        : (uploadData.url || uploadData.image_original || '');
      const previewCloudUploaded = !!uploadData.previewCloudUploaded;

      if (previewCloudUploaded) {
        pushStatusNotice(
          'success',
          'Bunny-Preview nach R2',
          'Das ffmpeg-Vorschaubild der Video-Datei wurde direkt nach R2 gespiegelt.'
        );
      }

      shouldPushStateToR2Ref.current = true;
      // Update local state immediately
      updatePosts(posts => posts.map(post => {
        if (String(post.id) !== String(id)) return post;
        const newMedia = post.mergedMedia && post.mergedMedia.length > 0
          ? [...post.mergedMedia]
          : [];
        const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId);

        const updatedItem: any = {
          type: 'video', // stays 'video' until bg task confirms encoding; but videoId is already set
          uploadId,
          videoId: phase1VideoId || uploadData.videoId,
          libraryId: phase1LibraryId || uploadData.libraryId,
          duration: uploadData.duration || 0,
          image: thumbUrl,
          image_thumb: thumbUrl,
          image_1k: url1k,
          image_2k: url2k,
          image_3k: url3k,
          image_original: videoUrl,
          url: videoUrl,
          image_width: uploadData.image_width,
          image_height: uploadData.image_height,
          bunnyTaskId,
        };

        if (itemIdx !== -1) {
          const previous = newMedia[itemIdx] || {};
          const updatedItemFinal: any = {
            ...updatedItem,
            // If phase-1 produced no thumbnail yet, keep the optimistic blob so the card
            // keeps showing the live video until the background task provides real variants.
            video: updatedItem.image && updatedItem.image.startsWith('/') ? (previous.video || updatedItem.video) : (previous.video || updatedItem.video || localUrl),
            image: updatedItem.image || previous.image || previous.image_thumb || '',
            image_thumb: updatedItem.image_thumb || previous.image_thumb || previous.image || '',
          };
          newMedia[itemIdx] = updatedItemFinal;
        } else {
          newMedia.push(updatedItem);
        }

        return { ...post, mergedMedia: newMedia };
      }), `Video lokal gespeichert (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);

      // ── Poll Bunny background task if available ──
      if (bunnyTaskId) {
        setBunnyProgress(prev => ({ ...prev, [id]: { step: 'starting', progress: 5, text: bunnyStepLabels.starting } }));

        const pollInterval = 2500;
        const maxPolls = 60; // max 2.5 minutes
        let pollCount = 0;

        const pollBunnyTask = async () => {
          try {
            const statusRes = await fetch(`/api/bunny/task/${bunnyTaskId}/status`);
            const statusData = await statusRes.json();

            if (!statusData.found) {
              // Task not found (maybe cleaned up), stop polling
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
              return;
            }

            setBunnyProgress(prev => ({
              ...prev,
              [id]: {
                step: statusData.step,
                progress: statusData.progress,
                text: bunnyStepLabels[statusData.step] || statusData.step,
              }
            }));

            if (statusData.step === 'done' && statusData.result) {
              shouldPushStateToR2Ref.current = true;
              // Update media entry with Bunny results
              const result = statusData.result;
              if (result.previewCloudUploaded) {
                pushStatusNotice(
                  'info',
                  'Bunny-Preview online',
                  'Der Vorschau-Thumbnail wurde via R2 gespeichert.'
                );
              }
              updatePosts(posts => posts.map(post => {
                if (String(post.id) !== String(id)) return post;
                const newMedia = post.mergedMedia && post.mergedMedia.length > 0
                  ? [...post.mergedMedia]
                  : [];
                const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId || m.bunnyTaskId === bunnyTaskId);
                if (itemIdx !== -1) {
                  newMedia[itemIdx] = {
                    ...newMedia[itemIdx],
                    type: 'bunny',
                    videoId: result.videoId,
                    libraryId: result.libraryId,
                    duration: result.duration || 0,
                    url: result.url || newMedia[itemIdx].url,
                    image: result.image || newMedia[itemIdx].image,
                    image_thumb: result.image_thumb || newMedia[itemIdx].image_thumb,
                    image_1k: result.image_1k || '',
                    image_2k: result.image_2k || '',
                    image_3k: result.image_3k || '',
                    image_original: result.image_original || '',
                    bunnyThumbUrl: result.bunnyThumbUrl,
                  };
                }
                return { ...post, mergedMedia: newMedia };
              }), `Bunny-Upload abgeschlossen (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
              // Clear progress after short delay; ping only when all uploads complete
              setTimeout(() => setBunnyProgress(prev => {
                const next = { ...prev };
                delete next[id];
                const hasPending = Object.values(next).some((v: any) =>
                  v.step !== "done" && v.step !== "error"
                );
                if (!hasPending) {
                  try { new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/gH9/f4CAf39/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/gH9/f3+AgH9/f3+Af39/gIB/f39/gH9/f4CAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAf39/gICAgICAgICAgIA==").play().catch(() => {}); } catch {}
                }
                return next;
              }), 3000);
              return;
            }

            if (statusData.step === 'error') {
              console.warn('Bunny background task failed:', statusData.error);
              setBunnyProgress(prev => ({
                ...prev,
                [id]: { step: 'error', progress: 0, text: `Bunny: ${statusData.error || 'Fehler'} – Video lokal gespeichert` }
              }));
              setTimeout(() => setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; }), 8000);
              return;
            }

            // Continue polling
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollBunnyTask, pollInterval);
            } else {
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
          } catch {
            // Network error during poll, try again
            pollCount++;
            if (pollCount < maxPolls) {
              setTimeout(pollBunnyTask, pollInterval);
            } else {
              setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
          }
        };

        // Start polling after a short delay (let Bunny start processing)
        setTimeout(pollBunnyTask, 2000);
      } else {
        setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
      }

    } catch (err: any) {
      setError(err.message);
      setBunnyProgress(prev => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setActiveUploads(prev => {
        const next = { ...prev };
        if (next[id] > 1) next[id]--;
        else delete next[id];
        return next;
      });
    }
}

export function applyVideoLinkChange(
  deps: VideoLinkChangeDeps,
  id: string,
  url: string
): void {
  const { flickrPosts, updatePosts, describePost, shouldPushStateToR2Ref, handlePostChange } = deps;
    // Check YouTube
    const ytRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const ytMatch = url.match(ytRegExp);
    const youtubeId = (ytMatch && ytMatch[2].length === 11) ? ytMatch[2] : null;
    
    // Check Bunny (video.bunnycdn.com, player.mediadelivery.net, or bunny: scheme)
    const bunnyRegExp = /(?:video\.bunnycdn\.com|player\.mediadelivery\.net)\/play\/(\d+)\/([a-zA-Z0-9-]+)/i;
    const bunnyMatch = url.match(bunnyRegExp);
    let bunnyLibraryId = null;
    let bunnyVideoId = null;
    
    if (bunnyMatch) {
      bunnyLibraryId = bunnyMatch[1];
      bunnyVideoId = bunnyMatch[2];
    } else if (url.startsWith('bunny:')) {
      const parts = url.replace('bunny:', '').split('/');
      if (parts.length === 2) {
        bunnyLibraryId = parts[0];
        bunnyVideoId = parts[1];
      }
    }

    if (bunnyLibraryId && bunnyVideoId) {
      // It's a Bunny video!
      // Trigger the sync API in the background.
      fetch('/api/bunny/sync-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId: bunnyLibraryId, videoId: bunnyVideoId })
      }).then(res => res.json()).then(data => {
        if (data.success) {
           shouldPushStateToR2Ref.current = true;
           updatePosts(posts => posts.map(post => 
             String(post.id) === String(id) ? {
               ...post,
               type: 'bunny',
               videoId: bunnyVideoId,
               libraryId: bunnyLibraryId,
               url: `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`,
               image_original: `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${bunnyVideoId}`,
               image: data.image_2k || data.image_3k || data.image_1k || data.image_thumb || data.image || data.url,
               image_thumb: data.image_thumb || data.url,
               image_1k: data.image_1k,
               image_2k: data.image_2k,
               image_3k: data.image_3k,
               bunnyThumbUrl: data.bunnyThumbUrl || `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`,
               duration: data.duration,
               image_width: data.image_width || 0,
               image_height: data.image_height || 0
             } : post
           ), `Bunny Video hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
        } else {
           console.error("Failed to sync Bunny video", data.error);
           alert("Fehler beim Abrufen der Bunny.net Metadaten: " + data.error);
        }
      });
      
      // Update immediately to show loading or set base data
      updatePosts(posts => posts.map(post => 
        String(post.id) === String(id) ? { 
          ...post, 
          type: 'bunny',
          videoId: bunnyVideoId,
          libraryId: bunnyLibraryId,
          bunnyThumbUrl: `https://iframe.mediadelivery.net/${bunnyLibraryId}/${bunnyVideoId}/thumbnail.jpg`,
          url: url
        } : post
      ), 'Bunny Video wird verarbeitet…');
    } else if (youtubeId) {
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
      shouldPushStateToR2Ref.current = true;
      updatePosts(posts => posts.map(post => 
        String(post.id) === String(id) ? { 
          ...post, 
          youtubeUrl: url, 
          youtubeId, 
          image: thumbnailUrl, 
          image_large: thumbnailUrl, 
          type: 'youtube',
          url: url
        } : post
      ), `YouTube Link hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
    } else {
      handlePostChange(id, 'url', url); // fallback
    }
}
