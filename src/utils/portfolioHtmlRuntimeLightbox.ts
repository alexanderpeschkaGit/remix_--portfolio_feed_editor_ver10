export const buildPortfolioRuntimeLightbox = (): string =>
`    function renderGallery() {
          const galleryRoot = document.getElementById('gallery-root');
          if (!galleryRoot || !window.portfolioData) return;
          const sourcePosts = (window.portfolioData.posts && window.portfolioData.posts.length > 0)
            ? window.portfolioData.posts
            : (window.portfolioData.items || []);
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
              const post = window.portfolioData.posts.find(p => String(p.id) === String(postId));
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
          if (!window.portfolioData || !window.portfolioData.posts) return;

          currentPost = window.portfolioData.posts.find(p => String(p.id) === String(postId));
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

          if (currentPost.states && currentPost.states.length > 0 && window.portfolioData.projectStates) {
            lightboxTags.innerHTML = currentPost.states.map(stateId => {
              const state = window.portfolioData.projectStates.find(s => String(s.id).toLowerCase() === String(stateId).toLowerCase());
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
            
            // Update the post in window.portfolioData
            const postIdx = window.portfolioData.posts.findIndex(p => String(p.id) === String(currentPost.id));
            if (postIdx !== -1) {
              const updatedPost = { ...window.portfolioData.posts[postIdx], mergedMedia: currentPostMedia };
              const primaryMedia = currentPostMedia[0];
              if (primaryMedia) {
                updatedPost.type = primaryMedia.type || updatedPost.type;
                updatedPost.image = primaryMedia.image || updatedPost.image;
                updatedPost.image_large = primaryMedia.image_large || updatedPost.image_large;
                updatedPost.url = primaryMedia.url || primaryMedia.link || updatedPost.url;
                updatedPost.youtubeId = primaryMedia.youtubeId || updatedPost.youtubeId;
              }
              window.portfolioData.posts[postIdx] = updatedPost;
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
          window.portfolioData = normalizePortfolioState(window.portfolioData);

          // Update the script tag content
          const scriptTag = document.getElementById('portfolio-data');
          scriptTag.textContent = JSON.stringify(window.portfolioData);
          
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
`;
