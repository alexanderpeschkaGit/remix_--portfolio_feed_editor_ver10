import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { hasRenderableMedia, getPrimaryMergedMedia, syncMediaFieldsFromPrimary } from '../utils/mediaHelpers';

interface UploadImageFlowDeps {
  flickrPosts: any[];
  updatePosts: (newPosts: any[] | ((p: any[]) => any[]), actionDescription?: string) => void;
  describePost: (post: any) => string;
  setError: Dispatch<SetStateAction<string>>;
  pushStatusNotice: (kind: 'success' | 'info' | 'warning', title: string, message: string) => void;
  shouldPushStateToR2Ref: MutableRefObject<boolean>;
  setActiveUploads: Dispatch<SetStateAction<Record<string, number>>>;
  setHasUnsyncedMedia: Dispatch<SetStateAction<boolean>>;
}

export async function uploadImageFlow(
  deps: UploadImageFlowDeps,
  id: string,
  file: File,
  mediaIndex?: number,
  isNew?: boolean
): Promise<void> {
  const { flickrPosts, updatePosts, describePost, setError, pushStatusNotice, shouldPushStateToR2Ref, setActiveUploads, setHasUnsyncedMedia } = deps;
    if (!file) return;
    setActiveUploads(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    setHasUnsyncedMedia(true);
    
    const localUrl = URL.createObjectURL(file);
    const uploadId = Math.random().toString(36).substring(7); // Unique ID for this specific upload
    
    const cleanOldUrls = (obj: any) => {
      const { largeUrl, url, url_o, url_l, url_q, url_sq, url_m, local_highres, image, image_thumb, image_1k, image_2k, image_large, image_preview, image_3k, image_original, ...rest } = obj;
      return rest;
    };

    const postToMediaItem = (post: any) => ({
      type: post.type || 'image',
      image: post.image,
      image_thumb: post.image_thumb,
      image_1k: post.image_1k,
      image_2k: post.image_2k,
      image_large: post.image_large,
      image_preview: post.image_preview,
      image_3k: post.image_3k,
      image_original: post.image_original,
      image_width: post.image_width,
      image_height: post.image_height,
      youtubeId: post.youtubeId,
      youtubeUrl: post.youtubeUrl,
      url: post.url,
      link: post.url
    });

    const hasPrimaryMedia = (post: any) =>
      !!(post.image || post.image_thumb || post.image_1k || post.image_2k || post.image_large || post.image_preview || post.image_3k || post.image_original || post.youtubeId || post.youtubeUrl || post.url);
    
    updatePosts(posts => posts.map(post => {
      if (String(post.id) === String(id)) {
        // If isNew is true or if we don't have a specific mediaIndex, we treat it as adding a new item to the gallery
        if (isNew || mediaIndex === undefined) {
          const newItem: any = { uploadId, type: 'image', image_preview: localUrl };
          
          // FIX #1: Explizites Array-Clearing beim Hinzufügen neuer Bilder
          // Nur bereits fertiggestellte Bilder mit finalen URLs behalten, keine uploadId-Only oder Phantom-Elemente
          let validatedMedia: any[] = [];
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            // Strikte Validierung: Nur Elemente mit echten finalen URLs beibehalten
            validatedMedia = post.mergedMedia.filter(hasRenderableMedia);
          } else if (hasPrimaryMedia(post)) {
            // Falls keine mergedMedia aber primäre Post-Daten vorhanden: Diese als Basis verwenden
            validatedMedia = [postToMediaItem(post)];
          }
          
          // Neues Array: Nur validierte alte Elemente + neues Item
          const newMedia = [...validatedMedia, newItem];
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newItem;
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);

          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        }
        if (mediaIndex !== undefined && post.mergedMedia) {
          const newMedia = [...post.mergedMedia];
          newMedia[mediaIndex] = { ...cleanOldUrls(newMedia[mediaIndex]), uploadId, image_preview: localUrl, type: 'image' } as any;
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newMedia.find(Boolean);
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);
          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        } else if (mediaIndex !== undefined && !post.mergedMedia) {
          const newMediaRaw = [{ type: post.type || 'image', image: post.image, image_thumb: post.image_thumb, image_1k: post.image_1k, image_2k: post.image_2k, image_large: post.image_large, image_3k: post.image_3k, image_original: post.image_original, youtubeId: post.youtubeId, link: post.url }];
          newMediaRaw[mediaIndex] = { ...cleanOldUrls(newMediaRaw[mediaIndex]), uploadId, image_preview: localUrl, type: 'image' } as any;
          const newMedia = newMediaRaw.filter(hasRenderableMedia);
          const primaryMedia = getPrimaryMergedMedia(newMedia) || newMedia.find(Boolean);
          const updatedPost = syncMediaFieldsFromPrimary({ ...cleanOldUrls(post) }, primaryMedia);
          return {
            ...updatedPost,
            mergedMedia: newMedia
          };
        }
        return { ...cleanOldUrls(post), uploadId, image_preview: localUrl, type: 'image' };
      }
      return post;
    }), `Lokales Bild hinzugefügt (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      const thumbUrl = uploadData.image_thumb || uploadData.url;
      const url1k = uploadData.image_1k || uploadData.url_1k || '';
      const url2k = uploadData.image_2k || uploadData.url_2k || '';
      const url3k = uploadData.image_3k || uploadData.url_3k || '';
      const originalUrl = uploadData.image_original || uploadData.url_original || '';
      const highResUrl = uploadData.url_large || url2k || url3k || url1k || thumbUrl;
      const imageWidth = uploadData.image_width ?? uploadData.width;
      const imageHeight = uploadData.image_height ?? uploadData.height;
      const cloudUploaded = !!uploadData.cloudUploaded;
      
      console.log('Upload successful, thumb:', thumbUrl, 'large:', highResUrl, 'variant:', uploadData.local_large_variant, 'dims:', imageWidth, 'x', imageHeight);
      if (cloudUploaded) {
        pushStatusNotice(
          'success',
          'Direkt nach R2 hochgeladen',
          'Die neuen Bildvarianten sind sofort in Cloudflare R2 verfügbar.'
        );
      } else if (Array.isArray(uploadData.cloudUploadErrors) && uploadData.cloudUploadErrors.length > 0) {
        pushStatusNotice(
          'warning',
          'Lokal gespeichert',
          'Mindestens eine R2-Variante hat den Direkt-Upload nicht geschafft und wird später synchronisiert.'
        );
      }
      
      shouldPushStateToR2Ref.current = true;
      updatePosts(posts => posts.map(post => {
        if (String(post.id) === String(id)) {
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            const newMedia = [...post.mergedMedia];
            const itemIdx = newMedia.findIndex(m => m.uploadId === uploadId);
            
            // FIX #2: Strikte Index-Validierung und Cleanup nach Upload
            if (itemIdx !== -1 && itemIdx < newMedia.length) {
              // Element mit matching uploadId gefunden: aktualisieren mit finalen URLs
              newMedia[itemIdx] = { 
                ...cleanOldUrls(newMedia[itemIdx]), 
                url: uploadData.url || newMedia[itemIdx].url,
                image: thumbUrl, 
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl, 
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl, 
                image_width: imageWidth,
                image_height: imageHeight,
                type: 'image' 
              } as any;
              delete newMedia[itemIdx].uploadId;
              
              const updateBase = itemIdx === 0;
              return updateBase ? { 
                ...cleanOldUrls(post), 
                url: post.url,
                image: thumbUrl, 
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl, 
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl,
                image_width: imageWidth,
                image_height: imageHeight,
                mergedMedia: newMedia 
              } : { ...post, mergedMedia: newMedia };
            } else {
              // CLEANUP: uploadId nicht gefunden oder Index-Problem
              // Entferne alle uploadId-Elemente ohne finale URLs (Phantom-Uploads)
              const cleanedMedia = newMedia.filter(m => {
                if (m.uploadId && !hasRenderableMedia(m)) {
                  // Phantom-Element: uploadId aber keine finale URL - entfernen
                  return false;
                }
                return true;
              });
              
              // Wenn das neue Upload nicht eingefügt wurde, versuche es noch einmal
              if (cleanedMedia.length === newMedia.length) {
                // Element mit uploadId wurde nicht aktualisiert - füge direkt hinzu
                const uploadedItem = { 
                  type: 'image', 
                  image: thumbUrl, 
                  image_thumb: thumbUrl,
                  image_1k: url1k,
                  image_2k: url2k,
                  image_large: highResUrl, 
                  image_3k: url3k,
                  image_original: originalUrl,
                  image_preview: localUrl,
                  image_width: imageWidth,
                  image_height: imageHeight
                };
                cleanedMedia.push(uploadedItem);
              }
              
              return { ...post, mergedMedia: cleanedMedia };
            }
          } else {
            // Keine mergedMedia - erstelle neue
            return { 
              ...cleanOldUrls(post), 
              url: uploadData.url || post.url,
              image: thumbUrl, 
              image_thumb: thumbUrl,
              image_1k: url1k,
              image_2k: url2k,
              image_large: highResUrl, 
              image_3k: url3k,
              image_original: originalUrl,
              image_preview: localUrl,
              image_width: imageWidth,
              image_height: imageHeight,
              mergedMedia: [{
                type: 'image',
                image: thumbUrl,
                image_thumb: thumbUrl,
                image_1k: url1k,
                image_2k: url2k,
                image_large: highResUrl,
                image_3k: url3k,
                image_original: originalUrl,
                image_preview: localUrl,
                image_width: imageWidth,
                image_height: imageHeight
              }],
              type: 'image' 
            };
          }
        }
        return post;
      }), `Bild hochgeladen (${describePost(flickrPosts.find(p => String(p.id) === String(id)))})`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActiveUploads(prev => {
        const next = { ...prev };
        if (next[id] > 1) {
          next[id]--;
        } else {
          delete next[id];
        }
        return next;
      });
    }
}
