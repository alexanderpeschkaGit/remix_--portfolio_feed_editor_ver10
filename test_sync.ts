
import fs from 'fs/promises';
import path from 'path';

async function getRecursiveFiles(dir: string, baseDir: string): Promise<string[]> {
  try {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map(async (dirent) => {
      const res = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        return getRecursiveFiles(res, baseDir);
      } else {
        return path.relative(baseDir, res);
      }
    }));
    return Array.prototype.concat(...files);
  } catch (e) {
    console.error(`Error reading ${dir}:`, e);
    return [];
  }
}

async function test() {
  const ORIGINALS_DIR = path.join(process.cwd(), 'originals');
  console.log('CWD:', process.cwd());
  console.log('ORIGINALS_DIR:', ORIGINALS_DIR);
  
  const allFiles = await getRecursiveFiles(ORIGINALS_DIR, ORIGINALS_DIR);
  console.log('All files:', allFiles);
  const imageFiles = allFiles.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log('Found image files:', imageFiles);
}

test();
