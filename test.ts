import fetch from "node-fetch";

async function test() {
  const albumUrl = "https://www.flickr.com/photos/23689211@N04/albums/72157604835171705/";
  const response = await fetch(albumUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
  const html = await response.text();
  
  const modelExportMatch = html.match(/modelExport:\s*({.*}),\n/);
  if (modelExportMatch) {
    try {
      const data = JSON.parse(modelExportMatch[1]);
      
      let count = 0;
      const findPhotos = (obj: any): void => {
        if (!obj || typeof obj !== 'object') return;
        
        if (Array.isArray(obj)) {
          obj.forEach(item => findPhotos(item));
        } else {
          // Flickr sometimes uses different keys
          if (obj.id && obj.title) {
            if (count < 2) {
              console.log("Found object with id and title:", obj);
            }
            count++;
          }
          for (const key in obj) {
            findPhotos(obj[key]);
          }
        }
      };
      
      findPhotos(data);
      console.log("Total objects with id and title:", count);
      
    } catch (e) {
      console.error("Failed to parse modelExport:", e);
    }
  } else {
    console.log("No modelExport found");
  }
}

test();
