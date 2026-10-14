import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { moveFileToBak, r2KeyToLocalPath } from './mediaDeletion.ts';
import { BACKUPS_DIR, DATA_BACKUPS_DIR, DATA_DIR, R2_CONFIG, TRASH_PREFIX, syncStorageSize } from './serverContext.ts';
import { backupState, extractPortfolioDataFromHtml, persistAcceptedState } from './stateManager.ts';
import { publishHtmlAndState } from './variantMaterializer.ts';
import { buildLegacyUploadDuplicateReport, buildR2CleanupReport, collectRedundancyData, filterRedundantWithSiblings } from './r2StorageService.ts';
import { archiveTrashObjectsToBak, deleteTrashObjects, listTrashObjects, moveR2ObjectsToTrash, restoreTrashObjects } from './r2TrashService.ts';

export function registerMaintenanceRoutes(app: Express) {
  // API route to list backups
  app.get("/api/backups", async (req, res) => {
    try {
      // 1. Get HTML backups (Full backups)
      const htmlFiles = await fs.readdir(BACKUPS_DIR);
      const fullBackups = htmlFiles
        .filter(f => f.endsWith('.html'))
        .map(f => ({ filename: f, type: 'full' }));

      // 2. Get JSON backups (Data backups)
      const jsonFiles = await fs.readdir(DATA_BACKUPS_DIR);
      const dataBackups = jsonFiles
        .filter(f => f.endsWith('.json'))
        .map(f => ({ filename: `data/${f}`, type: 'data' }));

      // Combine and sort by date (newest first)
      const allBackups = [...fullBackups, ...dataBackups].sort((a, b) => {
        // Extract timestamp from filename
        const getTime = (name: string) => {
          const match = name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
          return match ? match[1] : name;
        };
        return getTime(b.filename).localeCompare(getTime(a.filename));
      });

      res.json({ files: allBackups });
    } catch (e) {
      res.json({ files: [] });
    }
  });

  // API route to download a backup
  app.get("/api/backups/:folder/:filename", async (req, res) => {
    try {
      const { folder, filename } = req.params;
      const filepath = path.join(BACKUPS_DIR, folder, filename);
      res.download(filepath);
    } catch (e) {
      res.status(404).json({ error: 'Backup not found' });
    }
  });

  app.get("/api/backups/:filename", async (req, res) => {
    try {
      const filepath = path.join(BACKUPS_DIR, req.params.filename);
      res.download(filepath);
    } catch (e) {
      res.status(404).json({ error: 'Backup not found' });
    }
  });

  app.post("/api/backups/restore-latest-publish", async (req, res) => {
    try {
      const files = await fs.readdir(BACKUPS_DIR);
      const htmlFiles = files.filter(f => f.endsWith('.html')).sort().reverse();
      const latestBackup = htmlFiles[0];

      if (!latestBackup) {
        return res.status(404).json({ error: 'Kein HTML-Backup gefunden' });
      }

      const backupPath = path.join(BACKUPS_DIR, latestBackup);
      const htmlContent = await fs.readFile(backupPath, 'utf-8');
      const portfolioData = extractPortfolioDataFromHtml(htmlContent);
      const stateData = JSON.stringify({
        items: portfolioData.items || portfolioData.posts || [],
        title: portfolioData.title || 'ProjectionArt',
        subtitle: portfolioData.subtitle || '',
        bio: portfolioData.bio || '',
        projectStates: portfolioData.projectStates || [],
        publicDomain: portfolioData.publicDomain || '',
        scrapeConfig: portfolioData.scrapeConfig || undefined,
        lastUpdated: new Date().toISOString()
      }, null, 2);

      const statePath = path.join(DATA_DIR, 'state.json');
      await backupState();
      await publishHtmlAndState(htmlContent, stateData);
      await persistAcceptedState(stateData, statePath);

      const baseUrl = R2_CONFIG.publicDomain.startsWith('http') ? R2_CONFIG.publicDomain : `https://${R2_CONFIG.publicDomain}`;
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      res.json({
        success: true,
        restoredBackup: latestBackup,
        url: `${cleanBaseUrl}/index.html`,
        state: JSON.parse(stateData)
      });
    } catch (error: any) {
      console.error("Error restoring latest published backup:", error);
      res.status(500).json({ error: error.message || 'Restore fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/preview", async (req, res) => {
    try {
      const report = await buildR2CleanupReport();
      if (!report.refsComplete) {
        return res.status(409).json({
          success: false,
          refsComplete: false,
          warnings: report.warnings,
          error: 'Referenzdaten sind unvollstaendig - Cleanup wurde blockiert, um verwaiste Dateien zu vermeiden.'
        });
      }
      res.json({ success: true, ...report });
    } catch (error: any) {
      console.error("Error generating R2 cleanup preview:", error);
      res.status(500).json({ error: error.message || 'Cleanup-Vorschau fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/execute", async (req, res) => {
    try {
      const report = await buildR2CleanupReport();

      // A partial keep set would mark still-referenced files as orphaned and trash
      // them. Refuse to run until every reference source could be read.
      if (!report.refsComplete) {
        return res.status(409).json({
          success: false,
          refsComplete: false,
          warnings: report.warnings,
          error: 'Referenzdaten sind unvollstaendig - Cleanup wurde abgebrochen, um verwaiste Dateien zu vermeiden.'
        });
      }

      if (report.orphanedCount === 0) {
        return res.json({
          success: true,
          movedCount: 0,
          movedBytes: 0,
          message: 'Keine verwaisten R2-Dateien gefunden.'
        });
      }

      const { movedItems, skippedKeys } = await moveR2ObjectsToTrash(
        report.orphaned,
        'orphaned-cleanup'
      );
      await syncStorageSize();

      res.json({
        success: true,
        movedCount: movedItems.length,
        movedBytes: report.totalBytes,
        skippedCount: skippedKeys.length,
        sampleKeys: report.sampleKeys,
        trashItems: movedItems
      });
    } catch (error: any) {
      console.error("Error executing R2 cleanup:", error);
      res.status(500).json({ error: error.message || 'Cleanup fehlgeschlagen' });
    }
  });

  app.post("/api/r2-redundancy/preview", async (req, res) => {
    try {
      const { report, warnings, refsComplete } = await collectRedundancyData();
      if (!refsComplete) {
        return res.status(409).json({
          success: false,
          refsComplete: false,
          warnings,
          error: 'Referenzdaten sind unvollstaendig - Redundanz-Scan wurde blockiert.'
        });
      }
      res.json({ success: true, ...report, warnings, refsComplete });
    } catch (error: any) {
      console.error("Error generating redundancy preview:", error);
      res.status(500).json({ error: error.message || 'Redundanz-Vorschau fehlgeschlagen' });
    }
  });

  app.post("/api/r2-redundancy/execute", async (req, res) => {
    try {
      const { report, warnings, refsComplete } = await collectRedundancyData();
      if (!refsComplete) {
        return res.status(409).json({
          success: false,
          refsComplete: false,
          warnings,
          error: 'Referenzdaten sind unvollstaendig - Redundanz-Scan wurde abgebrochen.'
        });
      }

      const safeDuplicates = await filterRedundantWithSiblings(report);
      if (safeDuplicates.length === 0) {
        return res.json({ success: true, movedCount: 0, movedBytes: 0, message: 'Keine redundanten Dateien gefunden.' });
      }

      // `scope` is authoritative - never infer R2 vs local from the path shape,
      // because a Windows absolute path also contains forward-slash R2 prefixes.
      // Referenced duplicates are NEVER auto-removed: state.json / the published site
      // still points at them and nothing repoints those references.
      const removable = safeDuplicates.filter((d) => !d.isReferenced);
      const referencedSkipped = safeDuplicates.filter((d) => d.isReferenced).map((d) => d.location);
      const r2Duplicates = removable.filter((d) => d.scope === 'r2');
      const localDuplicates = removable.filter((d) => d.scope === 'local');

      const { movedItems, skippedKeys } = await moveR2ObjectsToTrash(
        r2Duplicates.map((d) => ({ key: d.location, size: d.size })),
        'redundant-content'
      );

      // Local redundant copies are archived into bak/, never hard-deleted.
      const bakFiles: Array<{ from: string; to: string }> = [];
      const localSkipped: string[] = [];
      for (const dup of localDuplicates) {
        try {
          const moved = await moveFileToBak(dup.location, process.cwd(), 'redundant');
          if (moved) bakFiles.push(moved);
          else localSkipped.push(dup.location);
        } catch (error) {
          console.error(`Failed to move redundant local file ${dup.location} to bak/:`, error);
          localSkipped.push(dup.location);
        }
      }

      await syncStorageSize();

      res.json({
        success: true,
        movedCount: movedItems.length + bakFiles.length,
        movedBytes: removable.reduce((sum, d) => sum + d.size, 0),
        skippedCount: skippedKeys.length + localSkipped.length,
        referencedSkipped,
        trashItems: movedItems,
        bakFiles,
        skippedKeys,
        localSkipped,
        sampleKeys: report.sampleKeys
      });
    } catch (error: any) {
      console.error("Error executing redundancy cleanup:", error);
      res.status(500).json({ error: error.message || 'Redundanz-Bereinigung fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/preview-legacy-uploads", async (req, res) => {
    try {
      const report = await buildLegacyUploadDuplicateReport();
      res.json({ success: true, ...report });
    } catch (error: any) {
      console.error("Error generating legacy duplicate preview:", error);
      res.status(500).json({ error: error.message || 'Legacy-Duplikat-Vorschau fehlgeschlagen' });
    }
  });

  app.post("/api/r2-cleanup/execute-legacy-uploads", async (req, res) => {
    try {
      const report = await buildLegacyUploadDuplicateReport();

      if (report.duplicateCount === 0) {
        return res.json({
          success: true,
          movedCount: 0,
          movedBytes: 0,
          message: 'Keine Legacy-Duplikate gefunden.'
        });
      }

      const { movedItems, skippedKeys } = await moveR2ObjectsToTrash(
        report.duplicates,
        'legacy-duplicate-cleanup'
      );
      await syncStorageSize();

      res.json({
        success: true,
        movedCount: movedItems.length,
        movedBytes: report.totalBytes,
        skippedCount: skippedKeys.length,
        sampleKeys: report.sampleKeys,
        trashItems: movedItems
      });
    } catch (error: any) {
      console.error("Error deleting legacy duplicates:", error);
      res.status(500).json({ error: error.message || 'Legacy-Duplikat-Cleanup fehlgeschlagen' });
    }
  });

  app.get("/api/r2-trash", async (req, res) => {
    try {
      const items = await listTrashObjects();
      const totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0);
      res.json({ success: true, items, totalBytes, count: items.length });
    } catch (error: any) {
      console.error("Error loading trash items:", error);
      res.status(500).json({ error: error.message || 'Trash list failed' });
    }
  });

  app.post("/api/r2-trash/restore", async (req, res) => {
    try {
      const trashKeys = Array.isArray(req.body?.trashKeys)
        ? req.body.trashKeys.filter((key: any) => typeof key === 'string' && key.startsWith(TRASH_PREFIX))
        : [];
      if (trashKeys.length === 0) {
        return res.status(400).json({ error: 'trashKeys required' });
      }

      const { restoredItems, skippedKeys, conflicts } = await restoreTrashObjects(trashKeys);
      await syncStorageSize();

      res.json({
        success: true,
        restoredCount: restoredItems.length,
        skippedCount: skippedKeys.length,
        conflictCount: conflicts.length,
        conflicts,
        restoredItems
      });
    } catch (error: any) {
      console.error("Error restoring trash items:", error);
      res.status(500).json({ error: error.message || 'Trash restore failed' });
    }
  });

  app.post("/api/r2-trash/archive", async (req, res) => {
    try {
      const trashKeys = Array.isArray(req.body?.trashKeys)
        ? req.body.trashKeys.filter((key: any) => typeof key === 'string' && key.startsWith(TRASH_PREFIX))
        : [];
      if (trashKeys.length === 0) {
        return res.status(400).json({ error: 'trashKeys required' });
      }

      const { archived, skippedKeys } = await archiveTrashObjectsToBak(trashKeys);
      await syncStorageSize();

      // Return bak/restore-compatible mappings so archiving is undoable.
      const bakFiles = archived
        .map((entry) => {
          const from = r2KeyToLocalPath(entry.originalKey, process.cwd());
          if (!from) return null;
          return { from, to: path.resolve(process.cwd(), entry.bakPath) };
        })
        .filter(Boolean);

      res.json({
        success: true,
        archivedCount: archived.length,
        skippedCount: skippedKeys.length,
        archived,
        bakFiles,
        skippedKeys
      });
    } catch (error: any) {
      console.error("Error archiving trash items to bak/:", error);
      res.status(500).json({ error: error.message || 'Trash archive failed' });
    }
  });

  app.post("/api/r2-trash/delete", async (req, res) => {
    try {
      const trashKeys = Array.isArray(req.body?.trashKeys)
        ? req.body.trashKeys.filter((key: any) => typeof key === 'string' && key.startsWith(TRASH_PREFIX))
        : [];
      if (trashKeys.length === 0) {
        return res.status(400).json({ error: 'trashKeys required' });
      }

      const { deletedKeys, skippedKeys } = await deleteTrashObjects(trashKeys);
      await syncStorageSize();

      res.json({
        success: true,
        deletedCount: deletedKeys.length,
        skippedCount: skippedKeys.length
      });
    } catch (error: any) {
      console.error("Error permanently deleting trash items:", error);
      res.status(500).json({ error: error.message || 'Trash delete failed' });
    }
  });


}
