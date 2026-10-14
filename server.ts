import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import {
  BACKUPS_DIR,
  DATA_DIR,
  DATA_V2_DIR,
  ORIGINALS_DIR,
  ensureServerDirectories,
  loadUsage,
  syncStorageSize,
} from "./src/server/serverContext.ts";
import { registerSyncRoutes } from "./src/server/syncRoutes.ts";
import { registerMediaVariantsRoutes } from "./src/server/mediaVariantsRoutes.ts";
import { registerStateRoutes } from "./src/server/stateRoutes.ts";
import { registerKiEditRoutes } from "./src/server/kiEditRoutes.ts";
import { registerMediaDeleteRoutes } from "./src/server/mediaDeleteRoutes.ts";
import { registerMaintenanceRoutes } from "./src/server/maintenanceRoutes.ts";
import { registerScrapeRoutes } from "./src/server/scrapeRoutes.ts";
import { registerUploadRoutes } from "./src/server/uploadRoutes.ts";
import { registerBunnyUploadRoutes } from "./src/server/bunnyUploadRoutes.ts";
import { registerBunnyRoutes } from "./src/server/bunnyRoutes.ts";
import { registerVideoResolveRoutes } from "./src/server/videoResolveRoutes.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.use('/data/preview.html', (req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https://www.youtube.com https://s.ytimg.com; frame-src https://iframe.mediadelivery.net https://www.youtube.com;"
    );
    next();
  });
  app.use('/data', express.static(DATA_DIR));
  app.use('/data_v2', express.static(DATA_V2_DIR));
  app.use('/originals', express.static(ORIGINALS_DIR));
  app.use('/backups', express.static(BACKUPS_DIR));

  await ensureServerDirectories();

  loadUsage().then(() => {
    syncStorageSize();
  });

  registerSyncRoutes(app);
  registerMediaVariantsRoutes(app);
  registerStateRoutes(app);
  registerKiEditRoutes(app);
  registerMediaDeleteRoutes(app);
  registerMaintenanceRoutes(app);
  registerScrapeRoutes(app);
  registerUploadRoutes(app);
  registerBunnyUploadRoutes(app);
  registerBunnyRoutes(app);
  registerVideoResolveRoutes(app);

  // Catch-all for undefined API routes to prevent HTML responses
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Global error handler to ensure JSON responses for all errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global server error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/data/**', '**/backups/**']
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
