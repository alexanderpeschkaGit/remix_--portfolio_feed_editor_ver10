import requests
import sys

URL = "https://flickr-html.pages.dev/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}

try:
    res = requests.get(URL, headers=HEADERS)
    print(res.text[:3000])
except Exception as e:
    print(e)
