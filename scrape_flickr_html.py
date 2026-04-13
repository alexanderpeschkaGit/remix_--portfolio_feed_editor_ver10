import sys
import os
import json
import re
import urllib.parse
import urllib.request
import hashlib
import time

# Ensure Windows console output does not crash on Unicode characters.
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# ==========================================
# CONFIGURATION
# ==========================================
TARGET_URL = "https://flickr-html.pages.dev/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}
OUTPUT_DIR = os.path.join("data", "flickr_html")

def scrape_flickr_html():
    print(f"\n--- STARTING FLICKR HTML SCRAPE ---")
    sys.stdout.flush()
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    scraped_data = []
    try:
        print(f"Fetching data from {TARGET_URL}...")
        sys.stdout.flush()
        
        req = urllib.request.Request(TARGET_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8')
        
        print(f"HTML fetched successfully ({len(html)} bytes). Parsing...")
        sys.stdout.flush()
        
        # Simple regex to find <h3>Title</h3> and the following <p><a href="...">Link</a></p>
        # Looking at the structure from read_url_content:
        # ### SlideInstallation...
        # [ift.tt/2NaibCR](https://ift.tt/2NaibCR)
        
        # Parse the new card-based HTML structure
        # <div class="card"> ... <a href="..."> ... <img src="..."> ... <h3>...</h3> ... <div>...</div> ... </div>
        cards = re.findall(r'<div class="card">(.*?)</div>\s*(?=<div class="card">|</div>\s*</body>)', html, re.IGNORECASE | re.DOTALL)
        
        # If the above regex doesn't work well, let's just split by '<div class="card">'
        card_blocks = html.split('<div class="card">')[1:]
        
        print(f"Found {len(card_blocks)} potential items.")
        sys.stdout.flush()
        
        # Create directories for images
        folder_1024 = os.path.join("data", "flickr_html_1024")
        folder_2048 = os.path.join("data", "flickr_html_2048")
        os.makedirs(folder_1024, exist_ok=True)
        os.makedirs(folder_2048, exist_ok=True)
        
        processed_count = 0
        skipped_count = 0

        for i, card_html in enumerate(card_blocks, 1):
            try:
                processed_count += 1
                # Extract high-res link
                href_match = re.search(r'<a.*?href="(.*?)"', card_html, re.IGNORECASE)
                href = href_match.group(1) if href_match else ""
                
                # Extract low-res image
                src_match = re.search(r'<img.*?src="(.*?)"', card_html, re.IGNORECASE)
                src = src_match.group(1) if src_match else ""
                
                # Extract title
                title_match = re.search(r'<h3.*?>(.*?)</h3>', card_html, re.IGNORECASE | re.DOTALL)
                title = title_match.group(1).strip() if title_match else f"Item {i}"
                title = re.sub(r'<.*?>', '', title)
                
                # Extract description (the div after h3)
                desc_match = re.search(r'</h3>\s*<div.*?>(.*?)</div>', card_html, re.IGNORECASE | re.DOTALL)
                desc = desc_match.group(1).strip() if desc_match else ""
                desc = re.sub(r'<.*?>', '', desc)
                
                # Download images
                image_path = ""
                image_large_path = ""
                downloaded_any = False
                
                # Helper to download
                def download_img(rel_url, target_folder):
                    nonlocal downloaded_any
                    if not rel_url: return ""
                    
                    # Handle spaces and special characters in URL
                    if not rel_url.startswith("http"):
                        encoded_url = urllib.parse.quote(rel_url)
                        full_url = f"{TARGET_URL.rstrip('/')}/{encoded_url.lstrip('/')}"
                    else:
                        full_url = rel_url
                        
                    filename = os.path.basename(urllib.parse.unquote(rel_url).split('?')[0])
                    filename = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in (' ', '.', '_', '-')]).rstrip()
                    if not filename: filename = f"image_{i}.jpg"
                    
                    filepath = os.path.join(target_folder, filename)
                    
                    if not os.path.exists(filepath):
                        try:
                            downloaded_any = True
                            req = urllib.request.Request(full_url, headers=HEADERS)
                            with urllib.request.urlopen(req, timeout=15) as r:
                                if r.status == 200:
                                    with open(filepath, 'wb') as f:
                                        while True:
                                            chunk = r.read(8192)
                                            if not chunk: break
                                            f.write(chunk)
                                else:
                                    return ""
                        except Exception:
                            return ""
                    
                    folder_name = os.path.basename(target_folder)
                    return f"/data/{folder_name}/{filename}"

                if src:
                    image_path = download_img(src, folder_1024)
                    
                if href and (href.endswith('.jpg') or href.endswith('.png') or 'flickr_2048' in href):
                    image_large_path = download_img(href, folder_2048)
                
                status = "Downloaded" if downloaded_any else "Cached"
                print(f"[{i}/{len(card_blocks)}] {title} ({status})")
                sys.stdout.flush()
                
                # Determine type
                item_type = "image"
                youtube_id = ""
                
                if "youtube.com" in href or "youtu.be" in href:
                    item_type = "youtube"
                    yt_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', href)
                    if yt_match:
                        youtube_id = yt_match.group(1)
                
                # Stable ID based on href
                stable_id = hashlib.md5(href.encode('utf-8')).hexdigest()[:12] if href else hashlib.md5(title.encode('utf-8')).hexdigest()[:12]
                
                scraped_data.append({
                    "id": f"fhtml-{stable_id}",
                    "title": title,
                    "description": desc,
                    "link": href if href.startswith("http") else f"{TARGET_URL.rstrip('/')}/{href.lstrip('/')}",
                    "type": item_type,
                    "youtubeId": youtube_id,
                    "image": image_path,
                    "imageLarge": image_large_path,
                    "timestamp": ""
                })
                
                # Polite delay to avoid "Abuse" flags (1 second)
                time.sleep(1)
            except Exception as item_err:
                skipped_count += 1
                print(f"[{i}/{len(card_blocks)}] Skipped item due to error: {item_err}")
                sys.stdout.flush()

        print(f"SUMMARY: Processed {processed_count}/{len(card_blocks)} cards, saved {len(scraped_data)} items, skipped {skipped_count} due to errors.")
        sys.stdout.flush()
            
    except Exception as e:
        print(f"An error occurred during Flickr HTML scrape: {e}")
        
    # Save JSON
    output_path = os.path.join(OUTPUT_DIR, "flickr_html_data.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(scraped_data, f, indent=2)
        
    print(f"SUCCESS! Saved {len(scraped_data)} items to {output_path}")
    sys.stdout.flush()
    return scraped_data

if __name__ == "__main__":
    scrape_flickr_html()
    print("\n" + "="*30)
    # Only pause if running in an interactive terminal (TTY)
    if sys.stdin.isatty():
        input("Process finished. Press Enter to close...")
    else:
        print("Process finished.")
