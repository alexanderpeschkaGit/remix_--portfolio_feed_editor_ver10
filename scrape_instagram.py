import instaloader
import time
import os
import json
import sys
from PIL import Image
import imagehash
import glob

# Ensure UTF-8 for console output to prevent 'charmap' errors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ==========================================
# CONFIGURATION
# ==========================================
IG_TARGET_ACCOUNT = "vijay_sikanda"
IG_POST_LIMIT = 50
OUTPUT_DIR = os.path.join("data", "instagram")

def scrape_instagram():
    print(f"\n--- STARTING INSTAGRAM SCRAPE ---")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # We use a custom directory pattern to keep things organized
    L = instaloader.Instaloader(
        download_pictures=True, 
        download_videos=False, 
        save_metadata=False,
        post_metadata_txt_pattern="",
        dirname_pattern=os.path.join(OUTPUT_DIR, "{target}")
    )
    
    insta_data = []
    try:
        print(f"Connecting to Instagram for: {IG_TARGET_ACCOUNT}...")
        profile = instaloader.Profile.from_username(L.context, IG_TARGET_ACCOUNT)

        for count, post in enumerate(profile.get_posts(), start=1):
            try:
                if count > IG_POST_LIMIT:
                    print(f"Reached limit of {IG_POST_LIMIT} posts.")
                    break
                
                print(f"[{count}] Downloading post {post.shortcode}...")
                try:
                    L.download_post(post, target=IG_TARGET_ACCOUNT)
                except Exception as download_err:
                    print(f"Error downloading post {post.shortcode}: {download_err}")
                    continue
                
                # Find the downloaded image (instaloader saves it with the timestamp or shortcode)
                # We look for the most recent .jpg in the target folder that contains the shortcode
                post_pattern = os.path.join(OUTPUT_DIR, IG_TARGET_ACCOUNT, f"*{post.shortcode}*.jpg")
                image_files = glob.glob(post_pattern)
                
                phash_str = ""
                image_path = ""
                if image_files:
                    # Sort by size or just take the first one (usually the main image)
                    image_files.sort(key=os.path.getmtime, reverse=True)
                    main_image = image_files[0]
                    image_path = os.path.join(IG_TARGET_ACCOUNT, os.path.basename(main_image))
                    
                    try:
                        with Image.open(main_image) as img:
                            phash = imagehash.phash(img)
                            phash_str = str(phash)
                    except Exception as ph_err:
                        print(f"Error hashing {main_image}: {ph_err}")

                insta_data.append({
                    "id": post.shortcode,
                    "title": post.caption[:100] if post.caption else "Instagram Post",
                    "description": post.caption if post.caption else "",
                    "link": f"https://www.instagram.com/p/{post.shortcode}/",
                    "image": f"/data/instagram/{image_path.replace(os.sep, '/')}" if image_path else "",
                    "phash": phash_str,
                    "timestamp": post.date_utc.isoformat()
                })
                
                # Polite delay to avoid "Abuse" flags (2 seconds)
                time.sleep(2) 
                
            except Exception as post_err:
                print(f"Error processing Instagram post {count}: {post_err}")
                continue
            
        print(f"SUCCESS! Instagram scrape finished.")
    except Exception as e:
        print(f"\nAn error occurred during Instagram scrape: {e}")
        
    # Save metadata as JSON for the frontend
    with open(os.path.join(OUTPUT_DIR, "insta_data.json"), "w", encoding="utf-8") as f:
        json.dump(insta_data, f, indent=2)
        
    return insta_data

if __name__ == "__main__":
    scrape_instagram()
    import sys
    if sys.stdin.isatty():
        input("Process finished. Press Enter to close...")
    else:
        print("Process finished.")
