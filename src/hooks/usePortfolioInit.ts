import { useEffect, useState } from 'react';

interface UsePortfolioInitParams {
  setPortfolioTitle: (v: string) => void;
  setPortfolioSubtitle: (v: string) => void;
  setPortfolioBio: (v: string) => void;
  setIgAccount: (v: string) => void;
  setFlickrUrl: (v: string) => void;
  setFlickrPosts: (updater: any) => void;
  setLoading: (v: boolean) => void;
  setHasUnpublishedChanges: (v: boolean) => void;
  setError: (v: string) => void;
  setLocalLastUpdated: (v: string | null) => void;
  setPublicDomain: (v: string | null) => void;
  setIsEmbeddedData: (v: boolean) => void;
  getPortfolioTitle: () => string;
  getPortfolioSubtitle: () => string;
  getR2Config: () => { publicDomain: string };
  isSavingRef?: { current: boolean };
}

export function usePortfolioInit({
  setPortfolioTitle,
  setPortfolioSubtitle,
  setPortfolioBio,
  setIgAccount,
  setFlickrUrl,
  setFlickrPosts,
  setLoading,
  setHasUnpublishedChanges,
  setError,
  setLocalLastUpdated,
  setPublicDomain,
  setIsEmbeddedData,
  getPortfolioTitle,
  getPortfolioSubtitle,
  getR2Config,
  isSavingRef
}: UsePortfolioInitParams) {
const [isInitialized, setIsInitialized] = useState(false);

  const [isR2Fallback, setIsR2Fallback] = useState(false);
  const [isFlickrFallback, setIsFlickrFallback] = useState(false);
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('portfolioEditorFallbackEnabled');
      if (raw === null) return true;
      return raw !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('portfolioEditorFallbackEnabled', String(fallbackEnabled));
    } catch {
      // ignore storage failures
    }
  }, [fallbackEnabled]);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setPublicDomain(data.publicDomain))
      .catch(() => {
        // Fallback to hardcoded public domain if API fails (e.g. on static hosting)
        setPublicDomain(getR2Config().publicDomain);
      });
  }, []);

  useEffect(() => {
    const loadData = async () => {
      // Check if data is embedded in the HTML (Schritt 3)
      const embeddedDataElement = document.getElementById('portfolio-data');
      if (embeddedDataElement) {
        try {
          const data = JSON.parse(embeddedDataElement.textContent || '{}');
          if (data.posts && data.posts.length > 0) {
            console.log("Loading from embedded data");
            setIsEmbeddedData(true);
            setPortfolioTitle(data.title || "Portfolio Gallery");
            setPortfolioSubtitle(data.subtitle || "My creative works");
            if (data.bio) setPortfolioBio(data.bio);
            setFlickrPosts(data.posts);
            setLoading(false);
            setIsInitialized(true);
            setLocalLastUpdated(typeof data.lastUpdated === 'string' && data.lastUpdated ? data.lastUpdated : new Date().toISOString());
            setHasUnpublishedChanges(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing embedded data:", e);
        }
      }

      try {
        const stateRes = await fetch('/api/state', { cache: 'no-store' });
        if (!stateRes.ok) throw new Error('API not available');
        const stateData = await stateRes.json();
        if (stateData.title) {
          setPortfolioTitle(stateData.title);
        }
        if (stateData.subtitle) {
          setPortfolioSubtitle(stateData.subtitle);
        }
        if (stateData.bio) {
          setPortfolioBio(stateData.bio);
        }
        if (stateData.scrapeConfig) {
          if (stateData.scrapeConfig.igAccount) setIgAccount(stateData.scrapeConfig.igAccount);
          if (stateData.scrapeConfig.flickrUrl) setFlickrUrl(stateData.scrapeConfig.flickrUrl);
        }
        if (stateData.items && stateData.items.length > 0) {
          setFlickrPosts(stateData.items);
          const initLastUpdated = typeof stateData.lastUpdated === 'string' && stateData.lastUpdated ? stateData.lastUpdated : new Date().toISOString();
          setLocalLastUpdated(initLastUpdated);
          setLoading(false);
          setIsInitialized(true);
          setHasUnpublishedChanges(false);
          return;
        } else {
          throw new Error('Local state is empty');
        }
      } catch (e) {
        console.log("No local state found, trying to load from Cloudflare R2...");
        if (!fallbackEnabled) {
          setError('Lokaler Zustand ist leer. Fallback ist deaktiviert.');
          setLoading(false);
          setIsInitialized(true);
          return;
        }
        try {
          // Try to fetch the live state.json from the R2 bucket via our backend proxy to avoid CORS
          const r2Res = await fetch('/api/r2-state');
          if (r2Res.ok) {
            const r2Data = await r2Res.json();
            console.log("Successfully loaded from R2 state.json!");
            setIsR2Fallback(true);
            setIsFlickrFallback(false);
            setPortfolioTitle(r2Data.title || getPortfolioTitle());
            setPortfolioSubtitle(r2Data.subtitle || getPortfolioSubtitle());
            if (r2Data.bio) setPortfolioBio(r2Data.bio);
            if (r2Data.scrapeConfig) {
              if (r2Data.scrapeConfig.igAccount) setIgAccount(r2Data.scrapeConfig.igAccount);
              if (r2Data.scrapeConfig.flickrUrl) setFlickrUrl(r2Data.scrapeConfig.flickrUrl);
            }
            
            const items = r2Data.items || r2Data.posts || [];
            setLocalLastUpdated(typeof r2Data.lastUpdated === 'string' && r2Data.lastUpdated ? r2Data.lastUpdated : new Date().toISOString());
            
            if (items.length > 0) {
              const baseUrl = getR2Config().publicDomain.endsWith('/') ? getR2Config().publicDomain.slice(0, -1) : getR2Config().publicDomain;
              const absoluteItems = items.map((item: any) => ({
                ...item,
                image: item.image && !item.image.startsWith('http') ? `${baseUrl}/${item.image.startsWith('/') ? item.image.substring(1) : item.image}` : item.image,
                image_large: item.image_large && !item.image_large.startsWith('http') ? `${baseUrl}/${item.image_large.startsWith('/') ? item.image_large.substring(1) : item.image_large}` : item.image_large,
                largeUrl: item.largeUrl && !item.largeUrl.startsWith('http') ? `${baseUrl}/${item.largeUrl.startsWith('/') ? item.largeUrl.substring(1) : item.largeUrl}` : item.largeUrl,
                url: item.url && !item.url.startsWith('http') ? `${baseUrl}/${item.url.startsWith('/') ? item.url.substring(1) : item.url}` : item.url,
                link: item.link && !item.link.startsWith('http') ? `${baseUrl}/${item.link.startsWith('/') ? item.link.substring(1) : item.link}` : item.link,
                mergedMedia: item.mergedMedia ? item.mergedMedia.map((m: any) => ({
                  ...m,
                  image: m.image && !m.image.startsWith('http') ? `${baseUrl}/${m.image.startsWith('/') ? m.image.substring(1) : m.image}` : m.image,
                  url: m.url && !m.url.startsWith('http') ? `${baseUrl}/${m.url.startsWith('/') ? m.url.substring(1) : m.url}` : m.url,
                  largeUrl: m.largeUrl && !m.largeUrl.startsWith('http') ? `${baseUrl}/${m.largeUrl.startsWith('/') ? m.largeUrl.substring(1) : m.largeUrl}` : m.largeUrl
                })) : item.mergedMedia
              }));
              setFlickrPosts(absoluteItems);
              setLoading(false);
              setIsInitialized(true);
              setHasUnpublishedChanges(false);
              
              // Save this R2 state to our local backend so we can edit it
              try {
                await fetch('/api/state', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(r2Data)
                });
                console.log("Saved R2 state to local backend.");
              } catch (saveErr) {
                console.error("Could not save R2 state locally:", saveErr);
              }
              
              return;
            }
          }
        } catch (r2Err) {
          console.log("Could not load R2 state (maybe CORS or file missing):", r2Err);
        }
        if (!fallbackEnabled) {
          setLoading(false);
          setIsInitialized(true);
          setHasUnpublishedChanges(false);
          return;
        }
        console.log("Loading from Flickr as fallback (Test Data)");
        setIsFlickrFallback(true);
      }

      try {
        const response = await fetch('/api/flickr');
        if (!response.ok) {
          throw new Error('Failed to fetch Flickr data');
        }
        const flickrData = await response.json();

        const posts = (flickrData?.items || []).map((item: any) => {
          const imgUrl = item.media?.m ? item.media.m.replace('_m.jpg', '_b.jpg') : '';
          const imgLargeUrl = item.best_resolution || (imgUrl ? imgUrl.replace('_b.jpg', '_k.jpg') : '');
          
          let desc = item.description || '';
          desc = desc.replace(/^.?posted a photo:\s/i, '');
          
          return {
            id: item.id || `flickr-${Math.random()}`,
            title: item.title || 'Untitled',
            description: desc,
            image: imgUrl,
            image_large: imgLargeUrl,
            url: item.link || '',
            network_name: 'Flickr',
            type: 'image'
          };
        }).filter((post: any) => post.image);

        setFlickrPosts(posts.slice(0, 24));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setIsInitialized(true);
        setHasUnpublishedChanges(false);
      }
    };

    loadData();
  }, []);

  return {
    isInitialized,
    isR2Fallback,
    setIsR2Fallback,
    isFlickrFallback,
    setIsFlickrFallback,
    fallbackEnabled,
    setFallbackEnabled
  };
}
