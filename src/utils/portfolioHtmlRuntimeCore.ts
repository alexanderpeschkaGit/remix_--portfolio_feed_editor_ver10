export const buildPortfolioRuntimeCore = (): string =>
`    <script>
      console.log('Script running');
      function init() {
        let publicDomain = "https://your-r2-public-domain.example.invalid";
        try {
          console.log('Init starting...');
          const portfolioDataEl = document.getElementById('portfolio-data');
          if (!portfolioDataEl) {
            console.error('portfolio-data element not found');
            // Continue anyway, maybe some things still work
          } else {
            console.log('portfolioDataEl found');
            try {
              window.portfolioData = JSON.parse(portfolioDataEl.textContent);
              if (window.portfolioData.items && !window.portfolioData.posts) {
                window.portfolioData.posts = window.portfolioData.items.filter(p => !p.hidden);
              }
              console.log('Portfolio data parsed:', window.portfolioData);
              if (window.portfolioData && window.portfolioData.publicDomain) {
                publicDomain = window.portfolioData.publicDomain;
              }
              
              // Live Update Check
              fetch('state.json')
                .then(res => res.json())
                .then(newData => {
                  if (newData && newData.lastUpdated && window.portfolioData.lastUpdated) {
                    if (new Date(newData.lastUpdated) > new Date(window.portfolioData.lastUpdated)) {
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
                      window.portfolioData = newData;
                      renderGallery();
                    }
                  }
                })
                .catch(err => console.log('Live update check failed or no state.json available yet.', err));
                
            } catch (jsonErr) {
              console.error('JSON parse failed:', jsonErr);
              console.log('Raw data length:', portfolioDataEl.textContent.length);
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
          
          // Fallback domain if window.portfolioData.publicDomain is not available
          const domain = (window.portfolioData && window.portfolioData.publicDomain) ? window.portfolioData.publicDomain : publicDomain;
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
            const state = window.portfolioData.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
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

    `;
