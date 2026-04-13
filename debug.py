import urllib.parse
rel_url = "flickr_1024/001_Born Naked-Tuntenball-For_54746493210.jpg"
encoded = urllib.parse.quote(rel_url)
print(encoded)
