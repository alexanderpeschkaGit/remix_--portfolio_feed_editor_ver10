import { getImageSrc, getVideoSrc, hasRenderableMedia, getMediaPriorityScore, getPrimaryMergedMedia, isValidImageCandidate, isDirectMediaFile } from './mediaHelpers';
import { linkifyToHtml } from './linkify';
import { PROJECT_STATES } from '../constants';

// Pure HTML template generator extracted from App.tsx (deep-refactor batch 2).
export const EDITOR_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)"/>
  <rect x="7" y="7" width="50" height="50" rx="12" fill="none" stroke="url(#ring)" stroke-width="2"/>
  <text x="32" y="40" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">PE</text>
</svg>`;
export const EDITOR_FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(EDITOR_FAVICON_SVG)}`;

export const generateHTML = (posts: any[], title: string, subtitle: string, bio: string = '', forPreview = false, publicDomain: string) => {
    console.log('Generating HTML, posts:', posts);
    const domainFromState = publicDomain;
    const baseUrl = domainFromState.startsWith('http') ? domainFromState : `https://${domainFromState}`;

    const getProxiedUrl = (url: string) => {
      if (!url) return '';
      if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
      
      // If we are in preview mode and the path is a local root-relative path, keep it as is
      // so the local dev server can serve it.
      if (forPreview && url.startsWith('/')) return url;
      
      let cleanUrl = url;
      // Strip leading slash if it exists so we can safely join with baseUrl
      if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
      if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);
      
      const domain = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      return `${domain}/${cleanUrl}`;
    };

    const getYoutubeId = (url: string) => {
      if (!url) return null;
      if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].substring(0, 11);
      if (!url.includes('youtube.com/') && !url.includes('youtube-nocookie.com/')) return null;
      if (url.includes('v=')) return url.split('v=')[1].substring(0, 11);
      if (url.includes('embed/')) return url.split('embed/')[1].substring(0, 11);
      return null;
    };

    const getYoutubeFeedEmbedUrl = (videoId: string) => {
      const safeVideoId = encodeURIComponent(videoId);
      return `https://www.youtube.com/embed/${safeVideoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${safeVideoId}&playsinline=1&disablekb=1&fs=0&rel=0`;
    };

    const getBunnyFeedEmbedUrl = (libraryId: string, videoId: string) =>
      `https://iframe.mediadelivery.net/embed/${encodeURIComponent(libraryId)}/${encodeURIComponent(videoId)}?autoplay=true&muted=true&loop=true&playsinline=true&preload=true`;

    const cards = posts.filter(p => !p.hidden).map(post => {
      let mediaHtml = '';
      
      if (post.mergedMedia && post.mergedMedia.length > 0) {
        const sortedMedia = post.mergedMedia.filter(hasRenderableMedia);
        mediaHtml = `<div class="media-stack">` + sortedMedia.map((m: any) => {
          const yid = m.youtubeId || getYoutubeId(m.url || m.link);
          if (yid) {
            const thumbUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            return `<div class="video-container mb-2 video-thumb" data-embed-url="${getYoutubeFeedEmbedUrl(yid)}" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'><img src="${thumbUrl}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" /><div class="play-overlay"></div></div>`;
          } else if (m.type === 'bunny' && m.videoId && m.libraryId) {
            const thumbUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            return `<div class="video-container mb-2 video-thumb" data-embed-url="${getBunnyFeedEmbedUrl(String(m.libraryId), String(m.videoId))}" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'><img src="${thumbUrl}" alt="" loading="lazy" /><div class="play-overlay"></div></div>`;
          } else if (m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || ((m.url || m.link) && (m.url || m.link).endsWith('.mp4'))) {
            const videoUrl = getProxiedUrl(getVideoSrc(m, true) || getVideoSrc(m));
            if (!videoUrl) {
              const imageUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
              if (!imageUrl) return '';
              return `<div class="block mb-2" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'><img src="${imageUrl}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" style="width: 100%; max-height: 400px; object-fit: cover; cursor: pointer;" /></div>`;
            }
            const posterUrl = getProxiedUrl(getImageSrc(m));
            const poster = posterUrl ? ` poster="${posterUrl}"` : '';
            return `<video src="${videoUrl}"${poster} class="feed-video-preview block mb-2" autoplay loop muted playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})' style="width: 100%; max-height: 400px; background: #000; cursor: pointer;"></video>`;
          } else {
            const imageUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
            if (!imageUrl) return '';
            return `<div class="block mb-2" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'><img src="${imageUrl}" alt="" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" /></div>`;
          }
        }).join('') + `</div>`;
      } else {
        const yid = post.youtubeId || getYoutubeId(post.url || post.link);
        if (yid) {
          const thumbUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
          mediaHtml = `
            <div class="video-container video-thumb" data-embed-url="${getYoutubeFeedEmbedUrl(yid)}" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'>
              <img src="${thumbUrl}" alt="${post.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" />
              <div class="play-overlay"></div>
            </div>
          `;
        } else if (post.type === 'bunny' && post.videoId && post.libraryId) {
          const thumbUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
          mediaHtml = `
            <div class="video-container video-thumb" data-embed-url="${getBunnyFeedEmbedUrl(String(post.libraryId), String(post.videoId))}" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'>
              <img src="${thumbUrl}" alt="${post.title.replace(/"/g, '&quot;')}" loading="lazy" />
              <div class="play-overlay"></div>
            </div>
          `;
        } else if (post.type === 'video' || (post.image && post.image.endsWith('.mp4')) || ((post.url || post.link) && (post.url || post.link).endsWith('.mp4'))) {
          const videoUrl = getProxiedUrl(getVideoSrc(post, true) || getVideoSrc(post));
          if (videoUrl) {
            const posterUrl = getProxiedUrl(getImageSrc(post));
            const poster = posterUrl ? ` poster="${posterUrl}"` : '';
            mediaHtml = `
              <video src="${videoUrl}"${poster} class="feed-video-preview" autoplay loop muted playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})' style="width: 100%; max-height: 400px; background: #000; cursor: pointer;"></video>
            `;
          }
        } else {
          const imageUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
          if (imageUrl) {
            mediaHtml = `
              <div onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'>
                <img src="${imageUrl}" alt="${post.title.replace(/"/g, '&quot;')}" loading="lazy" onerror="if(this.src.includes('maxresdefault.jpg')) this.src=this.src.replace('maxresdefault.jpg', 'hqdefault.jpg')" />
              </div>
            `;
          }
        }
      }

      return `
      <div class="card" data-post-id="${post.id}" role="button" tabindex="0" onclick='window.openLightboxPost && window.openLightboxPost(${JSON.stringify(String(post.id))})'>
        ${mediaHtml}
        <div class="content">
          <h2>${post.title}</h2>
          ${post.description ? `<p>${post.description}</p>` : ''}
          ${post.states && post.states.length > 0 ? `<div class="tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">${post.states.map((stateId: string) => {
            const state = PROJECT_STATES.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
            return state ? `<span class="tag-label" style="background-color: ${state.bright}; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">${state.label}</span>` : '';
          }).join('')}</div>` : ''}
          ${post.mergedMedia ? `<div class="links">` + post.mergedMedia.map((m: any, i: number) => (m.url || m.link) ? `<a href="${m.url || m.link}" target="_blank">Link ${i + 1}</a>` : '').join(' ') + `</div>` : ''}
        </div>
      </div>
    `}).join('');

    const filterBar = `<div class="filter-bar">
      <button class="filter-btn active" data-filter="all">Alle</button>
      ${PROJECT_STATES.map(s => `<button class="filter-btn" data-filter="${s.id}" style="--active-bg: ${s.bright}; --active-muted: ${s.muted}">${s.label}</button>`).join('')}
    </div>`;

    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/svg+xml" href="${EDITOR_FAVICON_DATA_URI}">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #000; color: #fff; margin: 0; padding: 2rem; }
        .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; max-width: 1400px; margin: 0 auto; }
        .card { background: #111; border: 1px solid #333; border-radius: 8px; overflow: hidden; transition: transform 0.2s; }
        .card:hover { transform: translateY(-4px); border-color: #555; }
        .card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; cursor: pointer; }
        .media-stack { display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer; }
        .media-stack img { aspect-ratio: auto; max-height: 400px; }
        .video-container { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; background: #000; }
        .video-container iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .video-thumb img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; cursor: pointer; }
        .video-thumb iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        .play-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 56px; height: 56px; background: rgba(0,0,0,0.65); border-radius: 50%; display: flex; align-items: center; justify-content: center; pointer-events: none; }
        .play-overlay::after { content: ''; width: 0; height: 0; border-left: 18px solid #fff; border-top: 11px solid transparent; border-bottom: 11px solid transparent; margin-left: 4px; }
        .video-thumb.playing .play-overlay { display: none; }
        .mb-2 { margin-bottom: 0.5rem; }
        .block { display: block; }
        .content { padding: 1rem; }
        h2 { margin: 0 0 0.5rem 0; font-size: 1.1rem; font-weight: 500; color: #eee; }
        p { margin: 0; color: #aaa; font-size: 0.9rem; line-height: 1.4; }
        .tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
        .tag-label { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
        .links { margin-top: 0.5rem; font-size: 0.8rem; }
        .links a { color: #4285F4; text-decoration: none; margin-right: 0.5rem; }
        .links a:hover { text-decoration: underline; }
        header { text-align: center; margin-bottom: 3rem; }
        h1 { font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase; margin: 0; }
        .subtitle { color: #666; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.8rem; margin-top: 0.5rem; }
        .bio { color: #999; font-size: 0.95rem; line-height: 1.6; max-width: 900px; margin: 2rem auto; padding: 1rem; border-top: 1px solid #333; border-bottom: 1px solid #333; white-space: pre-wrap; word-wrap: break-word; }
        
        /* Filter Bar */
        .filter-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 2rem; }
        .filter-btn { background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); padding: 6px 16px; border-radius: 20px; cursor: pointer; font-size: 0.85rem; transition: all 0.3s; }
        .filter-btn:hover { border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.38); color: #fff; }
        .filter-btn.active { background: var(--active-bg, #4285F4); color: #fff; border-color: var(--active-bg, #4285F4); box-shadow: 0 0 15px var(--active-muted, rgba(66, 133, 244, 0.3)); }
        
        /* Lightbox CSS */
        .lightbox { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 1000; flex-direction: row; }
        .lightbox.active { display: flex; }
        .lightbox-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 20px; min-width: 0; min-height: 0; }
        .lightbox-sidebar { width: 320px; background: #111; border-left: 1px solid #333; display: flex; flex-direction: column; padding: 24px; overflow-y: auto; flex-shrink: 0; }
        .lightbox-close { position: fixed; top: 20px; right: 20px; color: white; font-size: 30px; cursor: pointer; background: rgba(255,255,255,0.3); border: none; width: 40px; height: 40px; border-radius: 50%; z-index: 10; display: flex; align-items: center; justify-content: center; line-height: 1; }
        .lightbox-content { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px; overflow-y: auto; padding: 4px 8px; box-sizing: border-box; }
        .lightbox-media-item { width: min(100%, 980px); min-height: min(72vh, 720px); display: flex; align-items: center; justify-content: center; position: relative; }
        .lightbox-content img, .lightbox-content video, .lightbox-content iframe { max-width: 100%; max-height: 68vh; object-fit: contain; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border-radius: 4px; }
        .lightbox-content iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; }
        .lightbox-video-thumb { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 4px; cursor: pointer; background: #000; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .lightbox-video-thumb img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
        .lightbox-video-thumb iframe { width: 100%; height: 100%; border: 0; }
        .lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.3); color: white; border: none; padding: 15px; cursor: pointer; font-size: 20px; border-radius: 50%; transition: all 0.3s; z-index: 5; }
        .lightbox-nav:hover { background: rgba(255,255,255,0.4); }
        .lightbox-prev { left: 20px; }
        .lightbox-next { right: 20px; }
        .lightbox-info { margin-top: 20px; text-align: center; }
        .lightbox-title-text { color: white; font-size: 1.2rem; font-weight: 500; margin: 0 0 10px 0; }
        .lightbox-counter { color: #aaa; font-size: 0.8rem; }
        
        /* Sidebar CSS */
        .sidebar-section { margin-bottom: 24px; }
        .sidebar-label { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; display: block; }
        .reorder-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .reorder-item { aspect-ratio: 1; background: #222; border-radius: 4px; overflow: hidden; cursor: pointer; position: relative; border: 2px solid transparent; transition: all 0.2s; }
        .reorder-item:hover { border-color: #444; }
        .reorder-item.active { border-color: #4285F4; }
        .reorder-item.dragging { opacity: 0.5; }
        .reorder-item img, .reorder-item video { width: 100%; height: 100%; object-fit: cover; }
        .reorder-item .type-icon { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); padding: 1px 3px; border-radius: 2px; font-size: 8px; color: #fff; }
        .save-order-btn { background: rgba(255,255,255,0.3); color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; width: 100%; margin-top: 20px; transition: background 0.2s; }
        .save-order-btn:hover { background: rgba(255,255,255,0.4); }
        .card img, .card video, .card iframe { pointer-events: none; }
        .feed-video-preview { user-select: none; }
        .sidebar-description { font-size: 0.85rem; color: #aaa; line-height: 1.5; margin-bottom: 20px; }
        @media (max-width: 768px) {
          .lightbox { flex-direction: column; }
          .lightbox-sidebar { width: 100%; border-left: none; border-top: 1px solid #333; height: 300px; }
        }
    </style>
    <script id="portfolio-data" type="application/json">
      ${JSON.stringify({
        title,
        subtitle,
        bio,
        projectStates: PROJECT_STATES,
        posts: posts.filter(p => !p.hidden),
        publicDomain: baseUrl,
        lastUpdated: new Date().toISOString()
      }).replace(new RegExp('<', 'g'), '\\u003c')}
    </script>
    <script>
      console.log('Script running');
      function init() {
        let publicDomain = "https://your-r2-public-domain.example.invalid";
        try {
          console.log('Init starting...');
          const your-r2-bucketEl = document.getElementById('portfolio-data');
          if (!your-r2-bucketEl) {
            console.error('portfolio-data element not found');
            // Continue anyway, maybe some things still work
          } else {
            console.log('your-r2-bucketEl found');
            try {
              window.your-r2-bucket = JSON.parse(your-r2-bucketEl.textContent);
              if (window.your-r2-bucket.items && !window.your-r2-bucket.posts) {
                window.your-r2-bucket.posts = window.your-r2-bucket.items.filter(p => !p.hidden);
              }
              console.log('Portfolio data parsed:', window.your-r2-bucket);
              if (window.your-r2-bucket && window.your-r2-bucket.publicDomain) {
                publicDomain = window.your-r2-bucket.publicDomain;
              }
              
              // Live Update Check
              fetch('state.json')
                .then(res => res.json())
                .then(newData => {
                  if (newData && newData.lastUpdated && window.your-r2-bucket.lastUpdated) {
                    if (new Date(newData.lastUpdated) > new Date(window.your-r2-bucket.lastUpdated)) {
                      console.log('Newer state found! Updating live view...', newData.lastUpdated);
                      
                      // 1. Update Title and Bio if changed
                      if (newData.title) document.title = newData.title;
                      const h1 = document.querySelector('header h1');
                      const subtitle = document.querySelector('header .subtitle');
                      const bio = document.querySelector('header .bio');
                      if (h1 && newData.title) h1.textContent = newData.title;
                      if (subtitle && newData.subtitle) subtitle.textContent = newData.subtitle;
                      if (bio && newData.bio) bio.innerHTML = newData.bio.replace(/\\n/g, '<br/>');
                      
                      // 2. Update existing cards
                      newData.items.forEach(item => {
                        const card = document.querySelector(\`[data-post-id="\${item.id}"]\`);
                        if (card) {
                          const h2 = card.querySelector('.content h2');
                          if (h2) h2.textContent = item.title || '';
                          
                          let p = card.querySelector('.content p');
                          if (item.description) {
                            if (!p) {
                              p = document.createElement('p');
                              if (h2 && h2.nextSibling) {
                                h2.parentNode.insertBefore(p, h2.nextSibling);
                              } else {
                                card.querySelector('.content').appendChild(p);
                              }
                            }
                            p.textContent = item.description;
                          } else if (p) {
                            p.remove();
                          }
                          
                          // States/Tags
                          if (item.states && item.states.length > 0 && newData.projectStates) {
                            let tagsDiv = card.querySelector('.tags');
                            if (!tagsDiv) {
                              tagsDiv = document.createElement('div');
                              tagsDiv.className = 'tags';
                              tagsDiv.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;';
                              card.querySelector('.content').appendChild(tagsDiv);
                            }
                            tagsDiv.innerHTML = item.states.map(stateId => {
                              const state = newData.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
                              return state ? \`<span class="tag-label" style="background-color: \${state.bright}; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">\${state.label}</span>\` : '';
                            }).join('');
                          } else {
                            const tagsDiv = card.querySelector('.tags');
                            if (tagsDiv) tagsDiv.remove();
                          }
                        }
                      });
                      
                      // 3. Update global window object for Lightbox sync
                      newData.posts = newData.items.filter(p => !p.hidden); // Map items back to posts property for Lightbox
                      window.your-r2-bucket = newData;
                      renderGallery();
                    }
                  }
                })
                .catch(err => console.log('Live update check failed or no state.json available yet.', err));
                
            } catch (jsonErr) {
              console.error('JSON parse failed:', jsonErr);
              console.log('Raw data length:', your-r2-bucketEl.textContent.length);
            }
          }
        } catch (e) {
          console.error('Error in init setup:', e);
        }
        const isLocalFile = window.location.protocol === 'file:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('.run.app');
        
        function isDirectMediaFile(url) {
          return !!url && /\\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\\?.*)?$/i.test(url);
        }

        function isValidImageCandidate(url) {
          if (!url) return false;
          if (url.startsWith('data:') || url.startsWith('blob:')) return true;
          if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
          if (url.includes('img.youtube.com/vi/')) return true;
          // Bunny embed URLs are videos, never <img> sources
          if (url.includes('iframe.mediadelivery.net/embed/') || url.includes('player.mediadelivery.net/embed/')) return false;
          if (url.startsWith('http')) return true;
          return !!url.match(/\\.(jpe?g|png|webp|gif|avif|bmp)(\\?.*)?$/i);
        }

        function getImageSrc(media, preferLarge) {
          if (!media) return undefined;
          if (media.type === 'youtube' || media.youtubeId) {
            const id = media.youtubeId;
            if (id) {
              const stored = preferLarge
                ? (media.image_3k || media.image_2k || media.image_original || media.image_1k || media.image_large || media.imageLarge || media.image)
                : (media.image_thumb || media.image_preview || media.image_original || media.image);
              if (isValidImageCandidate(stored)) return stored;
              return 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg';
            }
          }
          if (media.type === 'bunny' || media.videoId) {
            const storedCandidates = preferLarge
              ? [media.custom_thumb, media.image_3k, media.image_2k, media.image_original, media.image_1k, media.bunnyThumbUrl, media.image_large, media.imageLarge, media.largeUrl, media.image, media.image_preview, media.image_thumb]
              : [media.custom_thumb, media.image_thumb, media.image_preview, media.image, media.image_1k, media.image_2k, media.image_3k, media.bunnyThumbUrl, media.image_original, media.image_large, media.imageLarge, media.largeUrl];
            for (var j = 0; j < storedCandidates.length; j++) {
              if (isValidImageCandidate(storedCandidates[j]) && typeof storedCandidates[j] === 'string' && storedCandidates[j].indexOf('/embed/') === -1) {
                return storedCandidates[j];
              }
            }
            if (media.libraryId && media.videoId) {
              return 'https://iframe.mediadelivery.net/' + media.libraryId + '/' + media.videoId + '/thumbnail.jpg';
            }
          }
          const primary = preferLarge
            ? [media.custom_thumb, media.image_3k, media.image_2k, media.image_original, media.image_1k, media.bunnyThumbUrl, media.image_large, media.imageLarge, media.largeUrl, media.image, media.image_preview, media.image_thumb, media.url, media.link]
            : [media.custom_thumb, media.image_thumb, media.image_preview, media.image, media.image_original, media.image_1k, media.bunnyThumbUrl, media.image_2k, media.image_3k, media.image_large, media.imageLarge, media.largeUrl, media.url, media.link];
          for (var i = 0; i < primary.length; i++) {
            if (isValidImageCandidate(primary[i])) return primary[i];
          }
          return undefined;
        }

        function getYoutubeId(url) {
          if (!url) return null;
          if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].substring(0, 11);
          if (!url.includes('youtube.com/') && !url.includes('youtube-nocookie.com/')) return null;
          if (url.includes('v=')) return url.split('v=')[1].substring(0, 11);
          if (url.includes('embed/')) return url.split('embed/')[1].substring(0, 11);
          return null;
        }

        function getYoutubeFeedEmbedUrl(videoId) {
          const safeVideoId = encodeURIComponent(String(videoId));
          return 'https://www.youtube.com/embed/' + safeVideoId + '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + safeVideoId + '&playsinline=1&disablekb=1&fs=0&rel=0';
        }

        function getBunnyFeedEmbedUrl(libraryId, videoId) {
          return 'https://iframe.mediadelivery.net/embed/' + encodeURIComponent(String(libraryId)) + '/' + encodeURIComponent(String(videoId)) + '?autoplay=true&muted=true&loop=true&playsinline=true&preload=true';
        }

        function getMediaPriorityScore(media) {
          if (!media) return -1;
          if (media.type === 'youtube' || media.youtubeId || media.type === 'bunny') return 25;
          if (isValidImageCandidate(media.image_original)) return 100;
          if (isValidImageCandidate(media.image_3k)) return 90;
          if (isValidImageCandidate(media.image_2k)) return 80;
          if (isValidImageCandidate(media.image_large) || isValidImageCandidate(media.largeUrl)) return 70;
          if (isValidImageCandidate(media.image_1k)) return 60;
          if (isValidImageCandidate(media.image)) return 50;
          if (isValidImageCandidate(media.image_preview)) return 40;
          if (isValidImageCandidate(media.bunnyThumbUrl)) return 35;
          if (isValidImageCandidate(media.image_thumb)) return 30;
          if (isValidImageCandidate(media.url) || isValidImageCandidate(media.link)) return 10;
          return 0;
        }

        function getPrimaryMergedMedia(mediaList) {
          if (!Array.isArray(mediaList) || mediaList.length === 0) return undefined;
          var bestMedia = mediaList[0];
          var bestScore = getMediaPriorityScore(bestMedia);
          for (var i = 1; i < mediaList.length; i++) {
            var candidateScore = getMediaPriorityScore(mediaList[i]);
            if (candidateScore > bestScore) {
              bestMedia = mediaList[i];
              bestScore = candidateScore;
            }
          }
          return bestMedia;
        }

        function getVideoSrc(media, preferLarge) {
          if (!media) return undefined;
          // Optimistic local preview: a blob: URL is a just-dropped video file → play it directly.
          if (typeof media.video === 'string' && media.video.startsWith('blob:')) return media.video;
          const primary = preferLarge
            ? [media.video, media.video_large, media.image_3k, media.image_2k, media.image_large, media.imageLarge, media.largeUrl, media.image, media.url, media.link]
            : [media.video, media.video_large, media.image, media.image_preview, media.image_thumb, media.image_1k, media.image_large, media.imageLarge, media.url, media.link];
          for (const candidate of primary) {
            if (candidate && isDirectMediaFile(candidate) && /\\.(mp4|webm|mov)(\\?.*)?$/i.test(candidate)) {
              return candidate;
            }
          }
          return undefined;
        }

        // Client-side mirror of src/server/mediaNormalization.ts (pure parts only; no disk lookup).
        // Strips video URLs from image fields, consolidates single video posts, syncs
        // url/video_url/video, and propagates post-level thumbnails + type before export.
        function normalizePortfolioState(data) {
          if (!data || typeof data !== 'object') return data;
          const imageFields = ['image_thumb', 'image_thumb400', 'image_1k', 'image_2k', 'image_3k', 'image_original', 'image_large', 'image', 'thumbnail'];
          const videoExtRe = /\\.(mp4|mov|webm|mkv|avi)(\\?.*)?$/i;
          const isVideoUrl = (v) => typeof v === 'string' && videoExtRe.test(v.trim());
          const isBunnyOrYoutube = (m) => m && (m.type === 'bunny' || m.type === 'youtube' || m.youtubeId || m.videoId || /youtu(?:be\\.com|\\.be)/i.test(String(m.url || m.link || '')));
          const isVideoMedia = (m) => {
            if (!m) return false;
            if (isBunnyOrYoutube(m)) return false;
            if (String(m.type || '').toLowerCase() === 'video') return true;
            return ['video', 'video_url', 'url'].some((f) => isVideoUrl(m[f]));
          };
          const cleanImage = (v) => (isVideoUrl(v) ? '' : (typeof v === 'string' ? v.trim() : v));
          const fileStem = (p) => {
            if (!p) return '';
            const clean = String(p).split('#')[0].split('?')[0];
            const base = clean.split('/').pop() || '';
            return base.replace(/\\.\\w+$/, '');
          };
          const normalizeList = (mergedMedia) => {
            if (!Array.isArray(mergedMedia) || mergedMedia.length === 0) return [];
            const items = mergedMedia.filter(Boolean);
            if (items.length > 1) {
              const imageItems = items.filter((m) => !isVideoMedia(m) && !isBunnyOrYoutube(m));
              const videoItems = items.filter((m) => isVideoMedia(m));
              if (imageItems.length === 1 && videoItems.length === 1) {
                const imgStem = fileStem(imageItems[0].image || imageItems[0].image_thumb || imageItems[0].url || '');
                const vidStem = fileStem(videoItems[0].url || videoItems[0].video || videoItems[0].video_url || '');
                const baseImg = imgStem.replace(/_\\d+$/, '');
                const baseVid = vidStem.replace(/_\\d+$/, '');
                if (baseImg && baseVid && baseImg === baseVid) {
                  const stream = videoItems[0].url || videoItems[0].video || videoItems[0].video_url || imageItems[0].url;
                  const thumb = imageItems[0].image_thumb || imageItems[0].image_1k || imageItems[0].image;
                  return [{ type: 'video', url: stream, video_url: stream, video: stream, image_thumb: thumb, image_1k: thumb, image: thumb }];
                }
              }
            }
            return items;
          };
          const normalizePost = (post) => {
            if (!post || typeof post !== 'object') return post;
            const n = Object.assign({}, post);
            for (const f of imageFields) {
              if (n[f]) {
                const c = cleanImage(n[f]);
                if (c !== n[f]) n[f] = c;
              }
            }
            let mediaList = Array.isArray(n.mergedMedia) && n.mergedMedia.length > 0 ? n.mergedMedia.slice() : [];
            if (mediaList.length > 0) mediaList = normalizeList(mediaList);
            const hasMerged = mediaList.length > 0;
            const itemsToProcess = hasMerged ? mediaList : [n];
            const processed = [];
            let primaryImage = '';
            for (const item of itemsToProcess) {
              if (isBunnyOrYoutube(item)) { processed.push(item); continue; }
              const isVid = isVideoMedia(item);
              const ni = Object.assign({}, item);
              for (const f of imageFields) {
                if (ni[f]) {
                  const c = cleanImage(ni[f]);
                  if (c !== ni[f]) ni[f] = c;
                }
              }
              if (isVid) {
                ni.type = 'video';
                const stream = ni.url || ni.video_url || ni.video;
                if (stream) { ni.url = stream; ni.video_url = stream; ni.video = stream; }
                const existingThumb = ni.image_thumb || ni.image_1k || ni.image;
                if (existingThumb && !primaryImage) primaryImage = existingThumb;
              } else {
                ni.type = 'image';
                const img = ni.image_thumb || ni.image_1k || ni.image;
                if (img && !primaryImage) primaryImage = img;
              }
              processed.push(ni);
            }
            for (const item of processed) {
              if (isVideoMedia(item) && !item.image_thumb && primaryImage) {
                item.image_thumb = primaryImage;
                item.image_1k = primaryImage;
                item.image = primaryImage;
              }
            }
            if (hasMerged) n.mergedMedia = processed;
            const first = processed[0];
            if (first) {
              const topThumb = first.image_thumb || first.image_1k || first.image || primaryImage;
              if (topThumb) { n.image_thumb = topThumb; n.image_1k = topThumb; n.image = topThumb; }
              const newType = processed.length > 1 ? 'carousel' : (isVideoMedia(first) ? 'video' : (isBunnyOrYoutube(first) ? (first.type || 'video') : 'image'));
              n.type = newType;
            }
            return n;
          };
          const out = Object.assign({}, data);
          if (Array.isArray(data.posts)) out.posts = data.posts.map(normalizePost);
          if (Array.isArray(data.items)) out.items = data.items.map(normalizePost);
          return out;
        }

        function getProxiedUrl(url) {
          if (!url) return '';
          if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
          
          // Normalize path
          let cleanUrl = url;
          if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);
          if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
          if (cleanUrl.startsWith('data_v2/')) cleanUrl = cleanUrl.substring('data_v2/'.length);
          
          // Fallback domain if window.your-r2-bucket.publicDomain is not available
          const domain = (window.your-r2-bucket && window.your-r2-bucket.publicDomain) ? window.your-r2-bucket.publicDomain : publicDomain;
          const safeDomain = domain.endsWith('/') ? domain.slice(0, -1) : domain;

          if (isLocalFile) {
            const pathParts = window.location.pathname.split('/');
            const isInBackups = pathParts[pathParts.length - 2] === 'backups';
            return (isInBackups ? '../' : './') + cleanUrl;
          } else if (!isLocalhost) {
            const domainToUse = safeDomain.endsWith('/') ? safeDomain.slice(0, -1) : safeDomain;
            return domainToUse + '/' + cleanUrl;
          }
          
          return '/' + cleanUrl;
        }

        function hasRenderableMedia(media) {
          return !!(media && (
            media.type === 'youtube' ||
            media.type === 'bunny' ||
            getImageSrc(media, true) ||
            getImageSrc(media) ||
            getVideoSrc(media, true) ||
            getVideoSrc(media) ||
            media.youtubeId ||
            getYoutubeId(media.url || media.link)
          ));
        }

        function renderMediaMarkup(post) {
          let mediaHtml = '';
          if (post.mergedMedia && post.mergedMedia.length > 0) {
            const sortedMedia = post.mergedMedia.filter(hasRenderableMedia);
            mediaHtml = '<div class="media-stack">' + sortedMedia.map((m) => {
              const yid = m.youtubeId || getYoutubeId(m.url || m.link);
              if (yid) {
                const thumbUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
                return '<div class="video-container mb-2 video-thumb" data-embed-url="' + getYoutubeFeedEmbedUrl(yid) + '"><img src="' + thumbUrl + '" alt="" loading="lazy" onerror="if(this.src.includes(\\\'maxresdefault.jpg\\\')) this.src=this.src.replace(\\\'maxresdefault.jpg\\\', \\\'hqdefault.jpg\\\')" /><div class="play-overlay"></div></div>';
              } else if (m.type === 'bunny' && m.videoId && m.libraryId) {
                const thumbUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
                return '<div class="video-container mb-2 video-thumb" data-embed-url="' + getBunnyFeedEmbedUrl(m.libraryId, m.videoId) + '"><img src="' + thumbUrl + '" alt="" loading="lazy" /><div class="play-overlay"></div></div>';
              } else if (m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || ((m.url || m.link) && (m.url || m.link).endsWith('.mp4'))) {
                const videoUrl = getProxiedUrl(getVideoSrc(m, true) || getVideoSrc(m));
                if (!videoUrl) return '';
                const posterUrl = getProxiedUrl(getImageSrc(m));
                const poster = posterUrl ? ' poster="' + posterUrl + '"' : '';
                return '<video src="' + videoUrl + '"' + poster + ' class="feed-video-preview block mb-2" autoplay loop muted playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true" style="width: 100%; max-height: 400px; background: #000; cursor: pointer;"></video>';
              } else {
                const imageUrl = getProxiedUrl(getImageSrc(m, true) || getImageSrc(m));
                if (!imageUrl) return '';
                return '<div class="block mb-2"><img src="' + imageUrl + '" alt="" loading="lazy" onerror="if(this.src.includes(\\\'maxresdefault.jpg\\\')) this.src=this.src.replace(\\\'maxresdefault.jpg\\\', \\\'hqdefault.jpg\\\')" /></div>';
              }
            }).join('') + '</div>';
          } else {
            const yid = post.youtubeId || getYoutubeId(post.url || post.link);
            if (yid) {
              const thumbUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
              mediaHtml = '<div class="video-container video-thumb" data-embed-url="' + getYoutubeFeedEmbedUrl(yid) + '"><img src="' + thumbUrl + '" alt="" loading="lazy" onerror="if(this.src.includes(\\\'maxresdefault.jpg\\\')) this.src=this.src.replace(\\\'maxresdefault.jpg\\\', \\\'hqdefault.jpg\\\')" /><div class="play-overlay"></div></div>';
            } else if (post.type === 'bunny' && post.videoId && post.libraryId) {
              const thumbUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
              mediaHtml = '<div class="video-container video-thumb" data-embed-url="' + getBunnyFeedEmbedUrl(post.libraryId, post.videoId) + '"><img src="' + thumbUrl + '" alt="" loading="lazy" /><div class="play-overlay"></div></div>';
            } else if (post.type === 'video' || (post.image && post.image.endsWith('.mp4')) || ((post.url || post.link) && (post.url || post.link).endsWith('.mp4'))) {
              const videoUrl = getProxiedUrl(getVideoSrc(post, true) || getVideoSrc(post));
              if (videoUrl) {
                const posterUrl = getProxiedUrl(getImageSrc(post));
                const poster = posterUrl ? ' poster="' + posterUrl + '"' : '';
                mediaHtml = '<video src="' + videoUrl + '"' + poster + ' class="feed-video-preview" autoplay loop muted playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true" style="width: 100%; max-height: 400px; background: #000; cursor: pointer;"></video>';
              }
            } else {
              const imageUrl = getProxiedUrl(getImageSrc(post, true) || getImageSrc(post));
              if (imageUrl) {
                mediaHtml = '<div><img src="' + imageUrl + '" alt="' + String(post.title || '').replace(/"/g, '&quot;') + '" loading="lazy" onerror="if(this.src.includes(\\\'maxresdefault.jpg\\\')) this.src=this.src.replace(\\\'maxresdefault.jpg\\\', \\\'hqdefault.jpg\\\')" /></div>';
              }
            }
          }
          return mediaHtml;
        }

        function renderCard(post) {
          if (!post || post.hidden) return '';
          const mediaHtml = renderMediaMarkup(post);
          const descriptionHtml = post.description ? '<p>' + post.description + '</p>' : '';
          const tagsHtml = post.states && post.states.length > 0 ? '<div class="tags" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">' + post.states.map(stateId => {
            const state = window.your-r2-bucket.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
            return state ? '<span class="tag-label" style="background-color: ' + state.bright + '; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">' + state.label + '</span>' : '';
          }).join('') + '</div>' : '';
          const linksHtml = post.mergedMedia ? '<div class="links">' + post.mergedMedia.map((m, i) => (m.url || m.link) ? '<a href="' + (m.url || m.link) + '" target="_blank">Link ' + (i + 1) + '</a>' : '').join(' ') + '</div>' : '';
          return '<div class="card" data-post-id="' + post.id + '" role="button" tabindex="0">' +
            mediaHtml +
            '<div class="content">' +
              '<h2>' + (post.title || '') + '</h2>' +
              descriptionHtml +
              tagsHtml +
              linksHtml +
            '</div>' +
          '</div>';
        }

        function startFeedVideoPreviews(root) {
          if (!root) return;
          root.querySelectorAll('video.feed-video-preview').forEach(video => {
            video.defaultMuted = true;
            video.muted = true;
            video.playsInline = true;
            const playback = video.play();
            if (playback && typeof playback.catch === 'function') playback.catch(() => {});
          });
        }

        function renderGallery() {
          const galleryRoot = document.getElementById('gallery-root');
          if (!galleryRoot || !window.your-r2-bucket) return;
          const sourcePosts = (window.your-r2-bucket.posts && window.your-r2-bucket.posts.length > 0)
            ? window.your-r2-bucket.posts
            : (window.your-r2-bucket.items || []);
          galleryRoot.innerHTML = sourcePosts.filter(p => !p.hidden).map(renderCard).join('');
          startFeedVideoPreviews(galleryRoot);
        }

        // Filter logic
        const filterBtns = document.querySelectorAll('.filter-btn');
        const galleryRoot = document.getElementById('gallery-root');
        renderGallery();
        console.log('Cards found in DOM:', galleryRoot ? galleryRoot.querySelectorAll('.card').length : 0);
        
        filterBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            const cards = galleryRoot ? galleryRoot.querySelectorAll('.card') : document.querySelectorAll('.card');
            
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            cards.forEach(card => {
              const postId = card.getAttribute('data-post-id');
              const post = window.your-r2-bucket.posts.find(p => String(p.id) === String(postId));
              const postStatesLower = post && post.states ? post.states.map(s => String(s).toLowerCase()) : [];
              
              if (filter === 'all') {
                if (postStatesLower.includes('-all')) {
                  card.style.display = 'none';
                } else {
                  card.style.display = 'block';
                }
              } else if (postStatesLower.includes(String(filter).toLowerCase())) {
                card.style.display = 'block';
              } else {
                card.style.display = 'none';
              }
            });
          });
        });

        document.querySelectorAll('img, a, video, iframe').forEach(el => {
          const attr = (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME') ? 'src' : 'href';
          let url = el.getAttribute(attr);
          if (url) {
            const normalizedUrl = getProxiedUrl(url);
            if (normalizedUrl !== url) el.setAttribute(attr, normalizedUrl);
          }
        });
        startFeedVideoPreviews(galleryRoot);

        // Lightbox logic
        const lightbox = document.getElementById('lightbox');
        console.log('Lightbox found:', lightbox);
        const lightboxContent = document.getElementById('lightbox-content');
        const lightboxTitle = document.getElementById('lightbox-title');
        const lightboxTags = document.getElementById('lightbox-tags');
        const lightboxDescription = document.getElementById('lightbox-description');
        const lightboxCounter = document.getElementById('lightbox-counter');
        const btnPrev = document.getElementById('lightbox-prev');
        const btnNext = document.getElementById('lightbox-next');
        const btnSaveOrder = document.getElementById('save-order-btn');
        const reorderGrid = document.getElementById('reorder-grid');
        
        // Verify all critical elements exist
        if (!lightbox || !lightboxContent || !lightboxTitle || !lightboxDescription || !lightboxCounter) {
          console.error('CRITICAL: Missing lightbox DOM elements!', { 
            lightbox, lightboxContent, lightboxTitle, 
            lightboxDescription, lightboxCounter 
          });
          return; // Abort init if critical elements are missing
        }
        
        let currentPost = null;
        let currentPostMedia = [];
        let currentMediaIndex = 0;
        
        console.log('Cards found:', galleryRoot ? galleryRoot.querySelectorAll('.card').length : 0);
        const openLightboxForPostId = (postId) => {
          if (!postId) return;
          if (!window.your-r2-bucket || !window.your-r2-bucket.posts) return;

          currentPost = window.your-r2-bucket.posts.find(p => String(p.id) === String(postId));
          if (!currentPost) return;

          currentPostMedia = [];
          if (currentPost.mergedMedia && currentPost.mergedMedia.length > 0) {
            const filteredMedia = currentPost.mergedMedia.filter(m => m.type === 'bunny' || getImageSrc(m, true) || getImageSrc(m) || getVideoSrc(m, true) || getVideoSrc(m) || m.youtubeId || getYoutubeId(m.url || m.link));
            // Preserve the saved order exactly as stored in mergedMedia.
            // The first item is still treated as the primary media elsewhere,
            // but opening the lightbox must not reshuffle the list.
            currentPostMedia = filteredMedia;
          } else {
            currentPostMedia = [currentPost].filter(m => m.type === 'bunny' || getImageSrc(m, true) || getImageSrc(m) || getVideoSrc(m, true) || getVideoSrc(m) || m.youtubeId || getYoutubeId(m.url || m.link));
          }

          currentMediaIndex = 0;
          lightboxTitle.textContent = currentPost.title || '';
          lightboxDescription.innerHTML = currentPost.description ? currentPost.description.replace(/\\n/g, '<br/>') : '';

          if (currentPost.states && currentPost.states.length > 0 && window.your-r2-bucket.projectStates) {
            lightboxTags.innerHTML = currentPost.states.map(stateId => {
              const state = window.your-r2-bucket.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
              return state ? \`<span class="tag-label" style="background-color: \${state.muted}; border: 1px solid \${state.bright}; color: #fff; margin-right: 4px; margin-bottom: 4px; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600;">\${state.label}</span>\` : '';
            }).join('');
            lightboxTags.style.display = 'flex';
          } else {
            if (lightboxTags) {
              lightboxTags.innerHTML = '';
              lightboxTags.style.display = 'none';
            }
          }

          updateLightbox();
          renderReorderGrid();
          lightbox.classList.add('active');
        };

        const openLightboxForCard = (card) => {
          if (!card) return;
          openLightboxForPostId(card.getAttribute('data-post-id'));
        };

        window.openLightboxPost = (postId) => openLightboxForPostId(String(postId));
        window.openLightboxCard = (card) => openLightboxForCard(card);

        // Feed-Play-Button: Thumbnail durch echten (inline) Player ersetzen.
        // Läuft im Capture-Pfad VOR dem Card-Klick-Handler und verhindert per
        // stopImmediatePropagation, dass beim Play-Klick zusätzlich die Lightbox öffnet.
        document.addEventListener('click', function (e) {
          if (!(e.target instanceof Element)) return;
          const thumb = e.target.closest('.video-thumb');
          if (!thumb) return;
          if (thumb.getAttribute('data-played') === 'true') return;
          const embedUrl = thumb.getAttribute('data-embed-url');
          if (!embedUrl) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          thumb.setAttribute('data-played', 'true');
          thumb.classList.add('playing');
          thumb.innerHTML = '<iframe class="feed-video-preview" src="' + embedUrl + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen tabindex="-1" aria-hidden="true"></iframe>';
        }, true);

        // Lightbox-Play-Button: Thumbnail-Artikel durch den echten Player ersetzen.
        lightboxContent.addEventListener('click', function (e) {
          if (!(e.target instanceof Element)) return;
          const thumb = e.target.closest('.lightbox-video-thumb');
          if (!thumb) return;
          if (thumb.getAttribute('data-played') === 'true') return;
          const embedUrl = thumb.getAttribute('data-embed-url');
          if (!embedUrl) return;
          e.preventDefault();
          e.stopPropagation();
          thumb.setAttribute('data-played', 'true');
          thumb.classList.add('playing');
          thumb.innerHTML = '<iframe src="' + embedUrl + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="Video"></iframe>';
        }, true);

        document.addEventListener('click', (e) => {
          if (!(e.target instanceof Element)) return;
          if (e.target.closest('a')) return;
          const card = e.target.closest('.card');
          if (!card) return;
          openLightboxForCard(card);
        }, true);
        
        function updateLightbox() {
          if (currentPostMedia.length === 0 || !lightboxContent) return;
          
          const m = currentPostMedia[currentMediaIndex];
          if (lightboxCounter) lightboxCounter.textContent = currentPostMedia.length + ' Medien';
          if (btnPrev) btnPrev.style.display = 'none';
          if (btnNext) btnNext.style.display = 'none';

          const renderLightboxMedia = (media, index) => {
            const yid = media.youtubeId || getYoutubeId(media.url || media.link);
            let html = '';
            if (yid) {
              const poster = getProxiedUrl(getImageSrc(media, true) || getImageSrc(media));
              const embedUrl = 'https://www.youtube.com/embed/' + yid + '?autoplay=1&mute=0&playsinline=1';
              html = '<div class="lightbox-video-thumb" data-embed-url="' + embedUrl + '"><img src="' + poster + '" alt="" loading="lazy" onerror="if(this.src.includes(\\\'maxresdefault.jpg\\\')) this.src=this.src.replace(\\\'maxresdefault.jpg\\\', \\\'hqdefault.jpg\\\')" /><div class="play-overlay"></div></div>';
            } else if (media.type === 'bunny' && media.videoId && media.libraryId) {
              const poster = getProxiedUrl(getImageSrc(media, true) || getImageSrc(media));
              const embedUrl = 'https://iframe.mediadelivery.net/embed/' + media.libraryId + '/' + media.videoId + '?autoplay=1&loop=false&muted=false&playsinline=true&preload=true&responsive=true';
              html = '<div class="lightbox-video-thumb" data-embed-url="' + embedUrl + '"><img src="' + poster + '" alt="" loading="lazy" /><div class="play-overlay"></div></div>';
            } else if (media.type === 'video' || (media.image && media.image.endsWith('.mp4')) || ((media.url || media.link) && (media.url || media.link).endsWith('.mp4'))) {
              const videoUrl = getProxiedUrl(getVideoSrc(media, true) || getVideoSrc(media));
              if (videoUrl) {
                const posterUrl = getProxiedUrl(getImageSrc(media));
                const posterAttr = posterUrl ? ' poster="' + posterUrl + '"' : '';
                html = '<video src="' + videoUrl + '"' + posterAttr + ' controls playsinline preload="metadata"></video>';
              } else {
                html = '<div style="color: #aaa; padding: 40px; text-align: center;">Video konnte nicht geladen werden</div>';
              }
            } else {
              const largeUrl = getProxiedUrl(getImageSrc(media, true) || getImageSrc(media));
              html = largeUrl
                ? '<img src="' + largeUrl + '" alt="" loading="lazy" />'
                : '<div style="color: #aaa; padding: 40px; text-align: center;">Bild konnte nicht geladen werden</div>';
            }
            return '<article class="lightbox-media-item" data-media-index="' + index + '">' + html + '</article>';
          };

          lightboxContent.innerHTML = currentPostMedia.map(renderLightboxMedia).join('');
          lightboxContent.querySelectorAll('.lightbox-media-item').forEach(item => {
            item.addEventListener('click', () => {
              currentMediaIndex = parseInt(item.dataset.mediaIndex || '0', 10);
              document.querySelectorAll('.reorder-item').forEach((element, index) => element.classList.toggle('active', index === currentMediaIndex));
            });
          });
          
          // Update active thumbnail in grid
          document.querySelectorAll('.reorder-item').forEach((item, i) => {
            if (i === currentMediaIndex) item.classList.add('active');
            else item.classList.remove('active');
          });
        }

        function renderReorderGrid() {
          if (!reorderGrid) {
            console.warn('reorderGrid element not found, skipping grid render');
            return;
          }
          reorderGrid.innerHTML = '';
          currentPostMedia.forEach((m, i) => {
            const item = document.createElement('div');
            item.className = 'reorder-item' + (i === currentMediaIndex ? ' active' : '');
            item.draggable = true;
            item.dataset.index = i;
            
            const isVideoFile = m.type === 'video' || (m.image && m.image.endsWith('.mp4')) || (m.url && m.url.endsWith('.mp4'));
            const isBunny = m.type === 'bunny';
            const isYoutube = m.type === 'youtube' || !!getYoutubeId(m.url || m.link);
            const thumbUrl = getProxiedUrl(getImageSrc(m) || getImageSrc(m, true));
            
            item.innerHTML = \`
              \${isVideoFile ? \`<video src="\${thumbUrl}" muted></video>\` : \`<img src="\${thumbUrl}" />\`}
              <div class="type-icon">\${isYoutube ? 'VIDEO' : isBunny ? 'BUNNY' : isVideoFile ? 'VIDEO' : 'IMG'}</div>
            \`;
            
            item.addEventListener('click', () => {
              currentMediaIndex = i;
              updateLightbox();
            });
            
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);
            
            reorderGrid.appendChild(item);
          });
        }

        let draggedItemIdx = null;

        function handleDragStart(e) {
          draggedItemIdx = parseInt(this.dataset.index);
          this.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragOver(e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }

        function handleDrop(e) {
          e.preventDefault();
          const targetIdx = parseInt(this.dataset.index);
          if (draggedItemIdx !== null && draggedItemIdx !== targetIdx) {
            const items = [...currentPostMedia];
            const [dragged] = items.splice(draggedItemIdx, 1);
            items.splice(targetIdx, 0, dragged);
            
            // Update currentMediaIndex to follow the dragged item
            if (currentMediaIndex === draggedItemIdx) {
              currentMediaIndex = targetIdx;
            } else if (draggedItemIdx < currentMediaIndex && targetIdx >= currentMediaIndex) {
              currentMediaIndex--;
            } else if (draggedItemIdx > currentMediaIndex && targetIdx <= currentMediaIndex) {
              currentMediaIndex++;
            }
            
            currentPostMedia = items;
            
            // Update the post in window.your-r2-bucket
            const postIdx = window.your-r2-bucket.posts.findIndex(p => String(p.id) === String(currentPost.id));
            if (postIdx !== -1) {
              const updatedPost = { ...window.your-r2-bucket.posts[postIdx], mergedMedia: currentPostMedia };
              const primaryMedia = currentPostMedia[0];
              if (primaryMedia) {
                updatedPost.type = primaryMedia.type || updatedPost.type;
                updatedPost.image = primaryMedia.image || updatedPost.image;
                updatedPost.image_large = primaryMedia.image_large || updatedPost.image_large;
                updatedPost.url = primaryMedia.url || primaryMedia.link || updatedPost.url;
                updatedPost.youtubeId = primaryMedia.youtubeId || updatedPost.youtubeId;
              }
              window.your-r2-bucket.posts[postIdx] = updatedPost;
            }
            
            renderReorderGrid();
            updateLightbox();
          }
        }

        function handleDragEnd() {
          this.classList.remove('dragging');
          draggedItemIdx = null;
        }

        btnSaveOrder.addEventListener('click', () => {
          // Normalize media state before embedding into the exported HTML
          window.your-r2-bucket = normalizePortfolioState(window.your-r2-bucket);

          // Update the script tag content
          const scriptTag = document.getElementById('portfolio-data');
          scriptTag.textContent = JSON.stringify(window.your-r2-bucket);
          
          // Generate new HTML content
          const html = document.documentElement.outerHTML;
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'index.html';
          a.click();
          URL.revokeObjectURL(url);
          
          alert('Reihenfolge gespeichert! Die aktualisierte index.html wurde heruntergeladen.');
        });
        
        if (document.getElementById('lightbox-close')) {
          document.getElementById('lightbox-close').addEventListener('click', () => {
            lightbox.classList.remove('active');
            lightboxContent.innerHTML = '';
            reorderGrid.innerHTML = '';
          });
        }
        
        if (btnPrev) {
          btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMediaIndex = (currentMediaIndex - 1 + currentPostMedia.length) % currentPostMedia.length;
            updateLightbox();
          });
        }
        
        if (btnNext) {
          btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            currentMediaIndex = (currentMediaIndex + 1) % currentPostMedia.length;
            updateLightbox();
          });
        }
        
        if (lightbox) {
          lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
              lightbox.classList.remove('active');
              lightboxContent.innerHTML = '';
              if (reorderGrid) reorderGrid.innerHTML = '';
            }
          });
        }
        
        const activeBtn = document.querySelector('.filter-btn.active');
        if (activeBtn) activeBtn.click();
      }
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
      } else {
        document.addEventListener('DOMContentLoaded', init);
      }
    </script>
</head>
<body>
    <header>
        <h1>${title}</h1>
        <div class="subtitle">${subtitle}</div>
        ${bio ? `<div class="bio">${linkifyToHtml(bio)}</div>` : ''}
    </header>
    ${filterBar}
    <div class="gallery" id="gallery-root">
        ${cards}
    </div>
    
    <div id="lightbox" class="lightbox">
        <div class="lightbox-main">
            <button id="lightbox-close" class="lightbox-close">&times;</button>
            <button id="lightbox-prev" class="lightbox-nav lightbox-prev">&#10094;</button>
            <div id="lightbox-content" class="lightbox-content"></div>
            <button id="lightbox-next" class="lightbox-nav lightbox-next">&#10095;</button>
            <div class="lightbox-info">
                <div id="lightbox-counter" class="lightbox-counter"></div>
            </div>
        </div>
        <div class="lightbox-sidebar">
            <h2 id="lightbox-title" class="lightbox-title-text"></h2>
            <div id="lightbox-tags" class="tags" style="margin-bottom: 16px;"></div>
            <div id="lightbox-description" class="sidebar-description"></div>
            
            <div class="sidebar-section">
                <span class="sidebar-label">Media sortieren (Drag & Drop)</span>
                <div id="reorder-grid" class="reorder-grid"></div>
            </div>
            
            <button id="save-order-btn" class="save-order-btn">Download Updated HTML</button>
        </div>
    </div>
</body>
</html>`;
  };
