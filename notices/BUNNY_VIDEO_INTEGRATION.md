# Bunny-Video-Integration – Lessons Learned

> Gesammelte Erkenntnisse aus Debugging & Implementation, Stand 2026-06-11

---

## Datenstruktur

Bunny-Videos sind in `mergedMedia`-Arrays und auf Post-Ebene mit folgenden Feldern gespeichert:

```json
{
  "type": "bunny",
  "videoId": "2fe65c1a-006e-4984-888f-ef06fbfcb871",
  "libraryId": "679639",
  "duration": 5,
  "image": "/data_v2/uploads/2k/vidbunny-1781125396014_local_2k.jpg",
  "image_thumb": "/data_v2/uploads/thumbs400/vidbunny-1781125396014_local_thumb.jpg",
  "image_1k": "/data_v2/uploads/1k/vidbunny-1781125396014_local_1k.jpg",
  "image_2k": "/data_v2/uploads/2k/vidbunny-1781125396014_local_2k.jpg",
  "image_3k": "/data_v2/uploads/3k/vidbunny-1781125396014_local_3k.jpg",
  "image_original": "/data_v2/uploads/originals/.../vidbunny-1781125396014.mp4",
  "url": "/data_v2/uploads/originals/.../vidbunny-1781125396014.mp4",
  "image_width": 3840,
  "image_height": 2160
}
```

---

## Bunny-Embed-URL

```
https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}
```

```html
<iframe src="https://iframe.mediadelivery.net/embed/679639/2fe65c1a-006e-4984-888f-ef06fbfcb871" 
  frameborder="0" 
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
  allowfullscreen>
</iframe>
```

---

## ⚠️ Kritischer Fallstrick: Regex in Template-Literals

Wenn JS-Code in ein Template-Literal (`` `...` ``) eingebettet wird (z.B. `generateHTML()`), MÜSSEN Regex-Escapes **doppelt** escaped werden:

| Regex-Zeichen | Im Template-Literal | Ausgabe | Korrekt? |
|:---:|:---|:---|:---:|
| `\.` | `\\.` | `\.` | ✅ |
| `\.` | `\.` | `.` | ❌ (matcht beliebiges Zeichen) |
| `\?` | `\\?` | `\?` | ✅ |
| `\?` | `\?` | `?` | ❌ (SyntaxError: Invalid group) |

**Beispiel:** `SyntaxError: Invalid regular expression: /.(jpg|...)(?.*)?$/i: Invalid group`

---

## Notwendige Client-JS-Funktionen

Diese Funktionen müssen im **Browser-Runtime-Scope** existieren (nicht nur Build-Time):

### `isDirectMediaFile(url)`
```javascript
function isDirectMediaFile(url) {
  return !!url && /\\.(jpg|jpeg|png|webp|gif|avif|bmp|mp4|webm|mov)(\\\\?.*)?$/i.test(url);
}
```

### `isValidImageCandidate(url)`
```javascript
function isValidImageCandidate(url) {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.startsWith('/data/') || url.startsWith('/data_v2/') || url.startsWith('/originals/')) return true;
  if (url.includes('img.youtube.com/vi/')) return true;
  if (url.startsWith('http')) return true;
  return !!url.match(/\\.(jpe?g|png|webp|gif|avif|bmp)(\\\\?.*)?$/i);
}
```

### `getImageSrc(media, preferLarge)`
```javascript
function getImageSrc(media, preferLarge) {
  if (!media) return undefined;
  if (media.type === 'youtube' || media.youtubeId) {
    var id = media.youtubeId;
    if (id) {
      var stored = preferLarge
        ? (media.image_3k || media.image_2k || media.image_original || media.image_1k || media.image_large || media.imageLarge || media.image)
        : (media.image_thumb || media.image_preview || media.image_original || media.image);
      if (isValidImageCandidate(stored)) return stored;
      return 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg';
    }
  }
  var primary = preferLarge
    ? [media.image_3k, media.image_2k, media.image_original, media.image_1k, media.image_large, media.imageLarge, media.largeUrl, media.image, media.image_preview, media.image_thumb, media.url, media.link]
    : [media.image_thumb, media.image_preview, media.image, media.image_original, media.image_1k, media.image_2k, media.image_3k, media.image_large, media.imageLarge, media.largeUrl, media.url, media.link];
  for (var i = 0; i < primary.length; i++) {
    if (isValidImageCandidate(primary[i])) return primary[i];
  }
  return undefined;
}
```

### `getVideoSrc(media, preferLarge)`
```javascript
function getVideoSrc(media, preferLarge) {
  if (!media) return undefined;
  // YouTube und Bunny haben keine direkten MP4-URLs
  if (media.type === 'youtube' || media.youtubeId || media.type === 'bunny') return undefined;
  // ...
}
```

### `getYoutubeId(url)`
```javascript
function getYoutubeId(url) {
  if (!url) return null;
  if (url.includes('youtu.be/')) return url.split('youtu.be/')[1].substring(0, 11);
  if (url.includes('v=')) return url.split('v=')[1].substring(0, 11);
  if (url.includes('embed/')) return url.split('embed/')[1].substring(0, 11);
  return null;
}
```

### `getPrimaryMergedMedia(mediaList)`
Prioritäten: Bunny/YouTube = 25, image_original = 100, image_3k = 90, image_2k = 80, image_large = 70, image_1k = 60, ...

### `getProxiedUrl(url)`
```javascript
function getProxiedUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  var cleanUrl = url;
  if (cleanUrl.startsWith('./')) cleanUrl = cleanUrl.substring(2);
  if (cleanUrl.startsWith('/')) cleanUrl = cleanUrl.substring(1);
  // WICHTIG: NICHT substring(1) – das würde nur EIN Zeichen entfernen!
  if (cleanUrl.startsWith('data_v2/')) cleanUrl = cleanUrl.substring('data_v2/'.length);
  // ...
}
```

---

## `<video>` braucht `poster`-Attribut

Ohne `poster` zeigt der Browser nur ein schwarzes Video-Symbol:

```html
<video src="{videoUrl}" poster="{thumbUrl}" controls muted playsinline></video>
```

Das Thumbnail kommt via `getImageSrc(media)` – priorisiert `image_thumb` > `image_preview` > `image`.

---

## Lightbox Media-Filter

Bunny-Items müssen EXPLIZIT eingeschlossen werden, da `getImageSrc` für Bunny `undefined` returned:

```javascript
currentPost.mergedMedia.filter(function(m) {
  return m.type === 'bunny' || 
    getImageSrc(m, true) || getImageSrc(m) || 
    getVideoSrc(m, true) || getVideoSrc(m) || 
    m.youtubeId || getYoutubeId(m.url || m.link);
});
```

---

## CSP (nur falls Cloudflare Pages Videos blockiert)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src *; 
  frame-src *; 
  media-src * blob:; 
  img-src * data: blob:; 
  connect-src *; 
  script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:;
">
```
