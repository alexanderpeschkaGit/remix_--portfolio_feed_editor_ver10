import type { Express } from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { DATA_DIR, pickBestImage } from './serverContext.ts';
import { backupState } from './stateManager.ts';
import { getDeletedIds, mergeScrapedData } from './scrapeService.ts';

export function registerScrapeRoutes(app: Express) {
  const scrapeStatus: Record<string, { running: boolean, logs: string[], done: boolean, error: string | null }> = {
    instagram: { running: false, logs: [], done: false, error: null },
    flickr: { running: false, logs: [], done: false, error: null }
  };

  // API route to start scraping
  app.post("/api/scrape/start", async (req, res) => {
    const { source } = req.body;
    if (!source || !['instagram', 'flickr'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source. Must be: instagram or flickr.' });
    }

    if (scrapeStatus[source].running) {
      return res.json({ message: 'Scrape already in progress', status: scrapeStatus[source] });
    }

    const scriptPath = path.join(process.cwd(), 'scrape_combined.py');
    const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
    
    scrapeStatus[source] = { running: true, logs: [`Starte ${source} Scraper...`, `Running: ${pythonCmd} ${path.basename(scriptPath)} ${source}`], done: false, error: null };

    try {
      // Check if script exists
      try {
        await fs.access(scriptPath);
      } catch (e) {
        throw new Error(`Python script not found: ${scriptPath}`);
      }

      // Read state to get scrape config
      let igAccount = "vijay_sikanda";
      let flickrUrl = "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/";
      try {
        const stateData = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8'));
        if (stateData.scrapeConfig) {
          if (stateData.scrapeConfig.igAccount) igAccount = stateData.scrapeConfig.igAccount;
          if (stateData.scrapeConfig.flickrUrl) flickrUrl = stateData.scrapeConfig.flickrUrl;
        }
      } catch (e) {
        console.log("Could not read state.json for scrape config, using defaults.");
      }

      scrapeStatus[source].logs.push(`Instagram Target: ${igAccount}`);
      scrapeStatus[source].logs.push(`Flickr Target: ${flickrUrl}`);

      console.log(`[SCRAPE] Starting ${source} with command: ${pythonCmd} ${scriptPath}`);

      const py = spawn(pythonCmd, [scriptPath, source, igAccount, flickrUrl], {
        shell: os.platform() === 'win32'
      });

      py.on('error', (err: any) => {
        console.error(`[SCRAPE] Failed to start ${source} process:`, err);
        scrapeStatus[source].running = false;
        scrapeStatus[source].error = `Failed to start process: ${err.message}`;
        scrapeStatus[source].logs.push(`[ERROR] Failed to start process: ${err.message}`);
        if (os.platform() === 'win32') {
          scrapeStatus[source].logs.push(`[TIP] Ensure 'python' is in your PATH. You might need to use 'python3' or 'py' instead.`);
        }
      });

      py.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        scrapeStatus[source].logs.push(...lines);
        if (scrapeStatus[source].logs.length > 500) scrapeStatus[source].logs.shift();
      });

      py.stderr.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        scrapeStatus[source].logs.push(`[ERROR] ${lines.join(' ')}`);
      });

      py.on('close', async (code: number) => {
        scrapeStatus[source].running = false;
        scrapeStatus[source].done = true;
        if (code !== 0) {
          scrapeStatus[source].error = `Prozess beendet mit Code ${code}`;
          scrapeStatus[source].logs.push(`Scraping fehlgeschlagen (Code ${code}).`);
        } else {
          scrapeStatus[source].logs.push('Scraping erfolgreich beendet. Starte Smart Merge...');
          const addedCount = await mergeScrapedData(source);
          scrapeStatus[source].logs.push(`Smart Merge abgeschlossen. ${addedCount} neue Elemente hinzugefügt.`);
        }
      });

      res.json({ message: 'Scrape started', status: scrapeStatus[source] });
    } catch (err: any) {
      scrapeStatus[source].running = false;
      scrapeStatus[source].error = err.message;
      res.status(500).json({ error: 'Failed to start scraper', details: err.message });
    }
  });

  // API route to check scraping status
  app.get("/api/scrape/status/:source", (req, res) => {
    const { source } = req.params;
    if (!source || !scrapeStatus[source]) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json(scrapeStatus[source]);
  });

  // API route to merge already-scraped data into state.json without re-scraping
  // Bypasses media validation (runs later via generate-and-publish)
  app.post("/api/scrape/merge", async (req, res) => {
    const { source } = req.body;
    if (!source || !['instagram', 'flickr'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source. Must be: instagram or flickr.' });
    }
    try {
      await backupState();
      const statePath = path.join(DATA_DIR, 'state.json');
      let state: any = { items: [] };
      try { state = JSON.parse(await fs.readFile(statePath, 'utf-8')); } catch (e) {}
      const deletedIds = await getDeletedIds();
      const existsInState = (id: string) => {
        for (const item of state.items) {
          if (item.id === id) return true;
          if (item.mergedMedia) {
            for (const m of item.mergedMedia) {
              if (m.id === id) return true;
            }
          }
        }
        return false;
      };

      let newItems: any[] = [];
      if (source === 'instagram') {
        try {
          const data = await fs.readFile(path.join(DATA_DIR, 'instagram', 'insta_data.json'), 'utf-8');
          const scraped = JSON.parse(data);
          for (const item of scraped) {
            const id = item.id;
            if (existsInState(id) || deletedIds.includes(id)) continue;
            const mergedMedia = Array.isArray(item.media_list)
              ? item.media_list.map((media: any) => {
                  if (typeof media === 'string') {
                    if (media.endsWith('.mp4')) {
                      return { type: 'video', video: media, video_url: media, url: media, link: item.link };
                    }
                    return { type: 'image', image: media, image_large: media, link: item.link };
                  }
                  const bestImage = pickBestImage(media.image_original, media.image_3k, media.image_2k, media.image_large, media.image_1k, media.image_thumb, media.image);
                  return {
                    type: media.type || 'image',
                    image: bestImage || media.image || media.image_thumb || '',
                    image_thumb: media.image_thumb || media.image || '',
                    image_1k: media.image_1k || '',
                    image_2k: media.image_2k || '',
                    image_large: media.image_large || media.image_2k || media.image_3k || media.image_1k || media.image_thumb || media.image || '',
                    image_3k: media.image_3k || '',
                    image_original: media.image_original || '',
                    image_width: media.image_width || 0,
                    image_height: media.image_height || 0,
                    link: media.link || item.link
                  };
                })
              : (item.image ? [{ type: 'image', image: item.image, image_thumb: item.image_thumb || item.image || '', image_1k: item.image_1k || '', image_2k: item.image_2k || '', image_large: item.image_large || '', image_3k: item.image_3k || '', image_original: item.image_original || '', image_width: item.image_width || 0, image_height: item.image_height || 0, link: item.link }] : []);
            newItems.push({
              id,
              type: mergedMedia.some((media: any) => media.type === 'video') ? 'video' : 'image',
              source: 'instagram',
              title: item.title || '',
              description: item.description || '',
              image: pickBestImage(item.image_original, item.image_3k, item.image_2k, item.image_large, item.image_1k, item.image_thumb, item.image) || item.image || item.image_thumb || '',
              image_thumb: item.image_thumb || item.image || '',
              image_1k: item.image_1k || '',
              image_2k: item.image_2k || '',
              image_large: item.image_large || item.image_2k || item.image_3k || item.image_1k || item.image_thumb || item.image || '',
              image_3k: item.image_3k || '',
              image_original: item.image_original || '',
              image_width: item.image_width || 0,
              image_height: item.image_height || 0,
              mergedMedia,
              url: item.link,
              date: item.timestamp || new Date().toISOString(),
              phash: item.phash
            });
          }
        } catch (e) { console.error('[Merge] Instagram data read failed:', e); }
      }

      if (newItems.length > 0) {
        state.items = [...newItems, ...state.items];
        state.lastUpdated = new Date().toISOString();
        // Use Buffer for explicit UTF-8 encoding to prevent umlaut corruption on Windows
        const stateStr = JSON.stringify(state, null, 2);
        await fs.writeFile(statePath, Buffer.from(stateStr, 'utf-8'));
        console.log(`[Merge] Wrote ${newItems.length} new ${source} items to state.json (validation bypassed).`);
      }

      res.json({ success: true, addedCount: newItems.length, message: `Merge complete: ${newItems.length} new items added from ${source}.` });
    } catch (error: any) {
      console.error(`[Merge] Failed for ${source}:`, error);
      res.status(500).json({ error: error.message || String(error) });
    }
  });

  // API route to get scraped data from local JSON files
  app.get("/api/scraped-data", async (req, res) => {
    try {
      const instagramDataPath = path.join(DATA_DIR, 'instagram', 'insta_data.json');
      const flickrDataPath = path.join(DATA_DIR, 'flickr', 'flickr_data.json');
      
      let instagramItems = [];
      let flickrItems = [];
      
      try {
        const data = await fs.readFile(instagramDataPath, 'utf-8');
        instagramItems = JSON.parse(data);
      } catch (e) {}
      
      try {
        const data = await fs.readFile(flickrDataPath, 'utf-8');
        flickrItems = JSON.parse(data);
      } catch (e) {}
      
      res.json({ instagram: instagramItems, flickr: flickrItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to load scraped data" });
    }
  });

  // API route to simulate scraping and stream logs (Legacy/Simulation)
  app.get("/api/scrape", (req, res) => {
    const source = req.query.source as string || 'unbekannt';
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Here you would normally spawn a python script like:
    // const { spawn } = require('child_process');
    // const py = spawn('python3', ['scraper.py', source]);
    // py.stdout.on('data', data => res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`));
    // py.on('close', () => res.write(`data: ${JSON.stringify({ done: true })}\n\n`));

    // Simulation for now:
    let step = 0;
    const steps = [
      `Starte Python Scraper für ${source}...`,
      `Verbinde mit ${source} API...`,
      `Lade neueste Beiträge herunter...`,
      `Verarbeite Bilder und Metadaten...`,
      `Speichere Daten lokal...`,
      `Scraping erfolgreich beendet.`
    ];

    const interval = setInterval(() => {
      if (step < steps.length) {
        res.write(`data: ${JSON.stringify({ log: steps[step] })}\n\n`);
        step++;
      } else {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        clearInterval(interval);
        res.end();
      }
    }, 1500);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  // API route to fetch Flickr album
  app.get("/api/flickr", async (req, res) => {
    const albumUrl = req.query.url as string || "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/";
    
    try {
      const response = await fetch(albumUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      let allPhotos: any[] = [];
      
      // Try to parse modelExport which contains all the data including titles and descriptions
      const modelExportMatch = html.match(/modelExport:\s*({.*}),\n/);
      if (modelExportMatch) {
        try {
          const data = JSON.parse(modelExportMatch[1]);
          
          const findPhotos = (obj: any): void => {
            if (!obj || typeof obj !== 'object') return;
            
            if (Array.isArray(obj)) {
              obj.forEach(item => findPhotos(item));
            } else {
              // Look for photo objects (they have _flickrModelRegistry: 'photo-models' or just id, title, description, secret)
              if (obj.id && obj.title !== undefined && obj.secret && obj.sizes && obj.sizes.data) {
                // We found a photo object!
                allPhotos.push(obj);
              }
              for (const key in obj) {
                findPhotos(obj[key]);
              }
            }
          };
          
          findPhotos(data);
          
          // Deduplicate photos by ID
          const uniquePhotos = new Map();
          for (const photo of allPhotos) {
            if (!uniquePhotos.has(photo.id)) {
              uniquePhotos.set(photo.id, photo);
            }
          }
          allPhotos = Array.from(uniquePhotos.values());
          
        } catch (e) {
          console.error("Failed to parse modelExport:", e);
        }
      }
      
      // If modelExport failed or didn't find anything, fallback to API key approach
      if (allPhotos.length === 0) {
        const apiKeyMatch = html.match(/"api_key":"([^"]+)"/) || html.match(/site_key"\s*:\s*"([^"]+)"/);
        const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
        
        if (apiKey) {
          // Extract user_id and photoset_id from URL
          const urlParts = albumUrl.split('/');
          const userId = urlParts[4];
          const photosetId = urlParts[6];
          
          if (userId && photosetId) {
            // Fetch all pages using Flickr API
            let page = 1;
            let pages = 1;
            
            while (page <= pages) {
              const apiUrl = `https://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&api_key=${apiKey}&photoset_id=${photosetId}&user_id=${userId}&format=json&nojsoncallback=1&page=${page}&per_page=500&extras=description,url_m,url_b,url_k,url_3k,url_4k,url_o`;
              const apiRes = await fetch(apiUrl);
              const apiData = await apiRes.json() as any;
              
              if (apiData.stat === 'ok' && apiData.photoset) {
                allPhotos = allPhotos.concat(apiData.photoset.photo);
                pages = apiData.photoset.pages;
                page++;
              } else {
                break;
              }
            }
          }
        }
      }
      
      // Format to match the structure the user wants in their TS snippet
      const items = allPhotos.map(photo => {
        // If we got it from modelExport, the sizes are in photo.sizes.data
        let mUrl = '';
        let bUrl = '';
        let bestUrl = '';
        
        if (photo.sizes && photo.sizes.data) {
          // modelExport format
          const sizes = photo.sizes.data;
          
          // Extract URLs from the nested structure
          const getUrl = (sizeObj: any) => {
            if (!sizeObj) return '';
            let url = '';
            if (typeof sizeObj.url === 'string') url = sizeObj.url;
            else if (sizeObj.data && typeof sizeObj.data.url === 'string') url = sizeObj.data.url;
            
            if (url && url.startsWith('//')) {
              url = 'https:' + url;
            }
            return url;
          };
          
          mUrl = getUrl(sizes.m) || getUrl(sizes.z) || getUrl(sizes.c) || '';
          bUrl = getUrl(sizes.b) || getUrl(sizes.l) || getUrl(sizes.c) || mUrl;
          // Try original, then 6k, 5k, 4k, 3k, 2k(k), h, l, b
          bestUrl = getUrl(sizes.o) || getUrl(sizes.k6) || getUrl(sizes.k5) || getUrl(sizes.k4) || getUrl(sizes.k3) || getUrl(sizes.k) || getUrl(sizes.h) || getUrl(sizes.l) || getUrl(sizes.b) || bUrl;
        } else if (photo.url_m) {
          // API format
          mUrl = photo.url_m;
          bUrl = photo.url_b || mUrl.replace('_m.jpg', '_b.jpg');
          bestUrl = photo.url_o || photo.url_4k || photo.url_3k || photo.url_k || bUrl.replace('_b.jpg', '_k.jpg');
        } else if (photo.server && photo.secret) {
          // Fallback format
          mUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_m.jpg`;
          bUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
          bestUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_k.jpg`;
        }
        
        let cleanTitle = photo.title || '';
        if (typeof cleanTitle === 'object' && cleanTitle._content) {
          cleanTitle = cleanTitle._content;
        }
        
        let cleanDesc = photo.description || '';
        if (typeof cleanDesc === 'object' && cleanDesc._content) {
          cleanDesc = cleanDesc._content;
        }
        
        return {
          id: photo.id,
          title: cleanTitle,
          description: cleanDesc,
          link: `https://www.flickr.com/photos/23689211@N04/${photo.id}/`,
          media: { m: mUrl },
          best_resolution: bestUrl 
        };
      });
      
      res.json({ items });
      
    } catch (error) {
      console.error("Error fetching Flickr data:", error);
      res.status(500).json({ error: "Failed to fetch Flickr data" });
    }
  });


}
