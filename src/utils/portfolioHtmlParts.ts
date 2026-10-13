import { getImageSrc, getVideoSrc, hasRenderableMedia, getMediaPriorityScore, getPrimaryMergedMedia, isValidImageCandidate, isDirectMediaFile } from './mediaHelpers';
import { linkifyToHtml } from './linkify';
import { PROJECT_STATES } from '../constants';

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

export const buildPostCards = (posts: any[], opts: { baseUrl: string; forPreview: boolean }): string => {
  const { baseUrl, forPreview } = opts;
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

  return cards;
};

export const buildPortfolioHead = (title: string): string =>
`<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/svg+xml" href="${EDITOR_FAVICON_DATA_URI}">
`;

export const buildPortfolioStyles = (): string =>
`    <style>
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
`;

export const buildPortfolioDataScript = (title: string, subtitle: string, bio: string, posts: any[], baseUrl: string): string =>
`    <script id="portfolio-data" type="application/json">
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
`;

export const buildPortfolioBody = (title: string, subtitle: string, bio: string, filterBar: string, cards: string): string =>
`</head>
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
