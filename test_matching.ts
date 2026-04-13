import { imageHash } from "image-hash";
import fetch from "node-fetch";
import path from "path";
import fs from "fs/promises";

async function testMatching() {
  const originalsDir = path.join(process.cwd(), 'originals');
  const files = await fs.readdir(originalsDir);
  console.log("Originals:", files);

  const statePath = path.join(process.cwd(), 'data', 'state.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
  const items = state.items;

  function hammingDistance(h1: string, h2: string) {
    if (!h1 || !h2 || h1.length !== h2.length) return 999;
    let dist = 0;
    for (let i = 0; i < h1.length; i++) {
      const b1 = parseInt(h1[i], 16).toString(2).padStart(4, '0');
      const b2 = parseInt(h2[i], 16).toString(2).padStart(4, '0');
      for (let j = 0; j < 4; j++) {
        if (b1[j] !== b2[j]) dist++;
      }
    }
    return dist;
  }

  for (const file of files) {
    if (!file.endsWith('.jpg')) continue;
    const filePath = path.join(originalsDir, file);
    
    console.log(`\nProcessing local file: ${file}`);
    const localHash: string = await new Promise((resolve, reject) => {
      imageHash(filePath, 16, true, (err: any, hash: string) => {
        if (err) reject(err);
        else resolve(hash);
      });
    });
    console.log(`Local Hash: ${localHash}`);

    for (const item of items) {
      if (item.type !== 'image' || !item.image) continue;
      
      // We need to hash the remote image to compare
      try {
        console.log(`Comparing with item: ${item.title} (${item.id})`);
        const imgRes = await fetch(item.image);
        if (!imgRes.ok) {
          console.log(`  Failed to fetch ${item.image}`);
          continue;
        }
        const buffer = await imgRes.buffer();
        const remoteHash: string = await new Promise((resolve, reject) => {
          imageHash({ data: buffer }, 16, true, (err: any, hash: string) => {
            if (err) reject(err);
            else resolve(hash);
          });
        });
        const dist = hammingDistance(localHash, remoteHash);
        console.log(`  Remote Hash: ${remoteHash}, Distance: ${dist}`);
        if (dist <= 12) {
          console.log(`  *** MATCH FOUND (dist: ${dist}) ***`);
        }
      } catch (e) {
        console.log(`  Error hashing remote image: ${e}`);
      }
    }
  }
}

testMatching();
