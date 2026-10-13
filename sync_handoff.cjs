const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname;
const DEST_DIR = path.join(SRC_DIR, '..', 'portfolio-backend-handoff');

// Ordner, die exakt gespiegelt werden sollen (löscht auch entfernte Dateien im Ziel)
const SYNC_DIRS = [
  'src',
  'scripts',
  'tests',
  '.agents',
  'prompts',
  '.cursor'
];

// Einzelne Dateien, die kopiert werden sollen
const SYNC_FILES = [
  'server.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  'AGENTS.md',
  '.clinerules',
  '.windsurfrules',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  'docs/HOWTOUSE.md'
];

console.log('Starte Handoff-Synchronisation...');

if (!fs.existsSync(DEST_DIR)) {
  console.error(`Fehler: Zielverzeichnis ${DEST_DIR} existiert nicht.`);
  process.exit(1);
}

// 1. Dateien kopieren
for (const file of SYNC_FILES) {
  const srcPath = path.join(SRC_DIR, file);
  const destPath = path.join(DEST_DIR, file);
  
  if (fs.existsSync(srcPath)) {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`[+] Kopiert: ${file}`);
  }
}

// 2. Ordner synchronisieren (rekursiv kopieren und verwaiste Dateien löschen)
function syncDirectory(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  const srcEntries = fs.readdirSync(src, { withFileTypes: true });
  const destEntries = fs.readdirSync(dest, { withFileTypes: true });

  // Verwaiste Dateien/Ordner im Ziel löschen
  const srcNames = new Set(srcEntries.map(e => e.name));
  for (const entry of destEntries) {
    if (!srcNames.has(entry.name)) {
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(destPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(destPath);
      }
    }
  }

  // Kopieren und updaten
  for (const entry of srcEntries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      syncDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of SYNC_DIRS) {
  const srcPath = path.join(SRC_DIR, dir);
  const destPath = path.join(DEST_DIR, dir);
  if (fs.existsSync(srcPath)) {
    syncDirectory(srcPath, destPath);
    console.log(`[+] Synchronisiert: ${dir}/`);
  }
}

console.log('\nHandoff-Synchronisation erfolgreich abgeschlossen!');
console.log('Hinweis: README.md, .env und docs/BACKEND_HANDOFF.md wurden absichtlich ignoriert, um die Handoff-spezifischen Texte zu schützen.');
