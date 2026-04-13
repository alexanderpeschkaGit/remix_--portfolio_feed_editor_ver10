import urllib.request
import re

url = "https://flickr-html.pages.dev/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    html = response.read().decode('utf-8')

print(f"Total length: {len(html)}")
cards = html.split('<div class="card">')[1:]
print(f"Cards found by split: {len(cards)}")

# Let's count h3 tags
h3s = re.findall(r'<h3', html, re.IGNORECASE)
print(f"h3 tags found: {len(h3s)}")

# Let's count img tags
imgs = re.findall(r'<img', html, re.IGNORECASE)
print(f"img tags found: {len(imgs)}")

# print first 500 chars
print(html[:500])
