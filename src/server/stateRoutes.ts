import type { Express } from 'express';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertStateAcceptable, stateValidationHttpPayload } from './statePublishing.ts';
import { DATA_DIR, DATA_V2_DIR, ORIGINALS_DIR, R2_CONFIG, s3Client } from './serverContext.ts';
import { backupState, ensureStateVideoDimensions, normalizeStateBunnyMedia, persistAcceptedState } from './stateManager.ts';

export function registerStateRoutes(app: Express) {
  // API route to get saved state
  app.get("/api/state", async (req, res) => {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'state.json'), 'utf-8');
      res.json(JSON.parse(data));
    } catch (e) {
      res.json({ items: [] });
    }
  });

  // API route to proxy R2 state.json (bypasses CORS)
  app.get("/api/r2-state", async (req, res) => {
    try {
      const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
      const timestamp = Date.now();
      
      // First try to fetch the SSOT (state.json) directly with a cache buster
      try {
        const r2Url = `${baseUrl}/state.json?t=${timestamp}`;
        const response = await fetch(r2Url);
        if (response.ok) {
          const data = await response.json();
          return res.json(data);
        }
      } catch (e) {
        console.log("Failed to fetch state.json directly, falling back to index.html embedded state.");
      }
      
      // Fallback: extract the embedded state from index.html (legacy / fallback)
      const r2HtmlUrl = `${baseUrl}/index.html?t=${timestamp}`;
      const htmlResponse = await fetch(r2HtmlUrl);
      
      if (htmlResponse.ok) {
        const htmlText = await htmlResponse.text();
        const match = htmlText.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/);
        if (match && match[1]) {
          const data = JSON.parse(match[1]);
          return res.json(data);
        }
      }

      throw new Error("R2 fetch failed for both state.json and index.html");
    } catch (e) {
      console.error("Failed to fetch R2 state:", e);
      res.status(500).json({ error: 'Failed to fetch R2 state' });
    }
  });

  app.get("/api/media/exists", async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      if (!rawUrl) return res.json({ exists: false });

      let normalized = rawUrl.split('?')[0];
      if (/^https?:\/\//i.test(normalized)) {
        try {
          normalized = new URL(normalized).pathname;
        } catch {
          return res.json({ exists: false });
        }
      }

      let targetPath: string | null = null;
      if (normalized.startsWith('/data_v2/')) {
        targetPath = path.join(DATA_V2_DIR, normalized.replace('/data_v2/', ''));
      } else if (normalized.startsWith('/data/')) {
        targetPath = path.join(DATA_DIR, normalized.replace('/data/', ''));
      } else if (normalized.startsWith('/originals/')) {
        targetPath = path.join(ORIGINALS_DIR, normalized.replace('/originals/', ''));
      }

      if (!targetPath) {
        return res.json({ exists: false });
      }

      const stats = await fs.stat(targetPath).catch(() => null);
      return res.json({ exists: !!(stats && stats.isFile()) });
    } catch {
      return res.json({ exists: false });
    }
  });

  // API route to preview the generated HTML
  app.post("/api/preview", async (req, res) => {
    try {
      const { htmlContent } = req.body;
      if (!htmlContent) return res.status(400).json({ error: 'HTML content required' });
      
      await fs.writeFile(path.join(DATA_DIR, 'preview.html'), htmlContent);
      res.json({ success: true, url: '/data/preview.html' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save preview' });
    }
  });

  // API route to save state
  app.post("/api/state", async (req, res) => {
    try {
      const { pushToR2, forcePublish, ...state } = req.body;
      await ensureStateVideoDimensions(state);
      normalizeStateBunnyMedia(state);
      if (!forcePublish) {
        await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });
      }
      await backupState();

      const stateString = JSON.stringify(state, null, 2);
      await persistAcceptedState(state, path.join(DATA_DIR, 'state.json'));

      if (pushToR2) {
        console.log("[R2 Sync] Pushing state.json to R2...");
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: 'state.json',
          Body: Buffer.from(stateString),
          ContentType: "application/json; charset=utf-8",
        }));
        console.log("[R2 Sync] Pushing state.json to R2 completed successfully.");
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("Failed to save state:", e);
      const validationError = stateValidationHttpPayload(e);
      if (validationError) return res.status(validationError.status).json(validationError.body);
      res.status(500).json({ error: 'Failed to save state', details: e.message });
    }
  });

  // API route to update a single item (used by rendering script AI)
  app.post("/api/item/update", async (req, res) => {
    try {
      const { id, title, description, states } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });

      const statePath = path.join(DATA_DIR, 'state.json');
      const stateData = await fs.readFile(statePath, 'utf-8');
      const state = JSON.parse(stateData);

      const itemIndex = state.items.findIndex((item: any) => String(item.id) === String(id));
      if (itemIndex === -1) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Update fields if provided (ensure they are strings)
      if (title !== undefined) {
        state.items[itemIndex].title = typeof title === 'object' ? (title.title || JSON.stringify(title)) : String(title);
      }
      if (description !== undefined) {
        state.items[itemIndex].description = typeof description === 'object' ? (description.description || description.text || JSON.stringify(description)) : String(description);
      }
      if (states !== undefined) state.items[itemIndex].states = states;
      
      // Auto-correct video dimensions if fallback
      await ensureStateVideoDimensions(state);
      normalizeStateBunnyMedia(state);
      await assertStateAcceptable(state, { rootDir: process.cwd(), allowNetwork: true });

      await backupState();
      const stateString = JSON.stringify(state, null, 2);
      await persistAcceptedState(state, statePath);
      
      // Push the updated state to Cloudflare R2 so the polling detects it
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: 'state.json',
        Body: Buffer.from(stateString),
        ContentType: 'application/json'
      }));
      
      res.json({ success: true, item: state.items[itemIndex] });
    } catch (e: any) {
      console.error("Failed to update item:", e);
      const validationError = stateValidationHttpPayload(e);
      if (validationError) return res.status(validationError.status).json(validationError.body);
      res.status(500).json({ error: 'Failed to update item', details: e.message });
    }
  });


}
