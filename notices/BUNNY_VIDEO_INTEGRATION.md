# Bunny-Video-Integration – Lessons Learned

> Gesammelte Erkenntnisse aus Debugging & Implementation, Stand 2026-06-12

---

## Datenstruktur

Bunny-Videos sind in `mergedMedia`-Arrays und auf Post-Ebene mit folgenden Feldern gespeichert:

```json
{
  "type": "bunny",
  "videoId": "2fe65c1a-006e-4984-888f-ef06fbfcb871",
  "libraryId": "679639",
  "duration": 5,
  "image": "/data_v2/uploads/2k/vidbunny-xxx_local_2k.jpg",
  "image_thumb": "/data_v2/uploads/thumbs400/vidbunny-xxx_local_thumb.jpg",
  "image_1k": "/data_v2/uploads/1k/vidbunny-xxx_local_1k.jpg",
  "image_2k": "/data_v2/uploads/2k/vidbunny-xxx_local_2k.jpg",
  "image_3k": "/data_v2/uploads/3k/vidbunny-xxx_local_3k.jpg",
  "image_original": "https://iframe.mediadelivery.net/embed/679639/{videoId}",
  "url": "https://iframe.mediadelivery.net/embed/679639/{videoId}",
  "image_width": 3840,
  "image_height": 2160,
  "bunnyTaskId": "bunny-xxx",
  "bunnyThumbUrl": ""
}
```

**Wichtig:** `url` und `image_original` zeigen auf die **Bunny-Embed-URL**, nicht auf einen lokalen MP4-Pfad. Der lokale MP4-Fallback (`image_original` als R2-MP4) wird beim Background-Task durch die Bunny-Embed-URL ersetzt.

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

## Upload- & Publish-Flow

### 1. Video-Upload (Phase 1 – synchron)
- `POST /api/upload-video-to-bunny` wird vom Frontend aufgerufen
- MP4 wird **lokal** unter `data_v2/uploads/originals/...` gespeichert
- ffmpeg extrahiert 1 Frame → Thumbnail-Varianten (thumb, 1k, 2k, 3k) werden **sofort nach R2 hochgeladen** (`uploadToCloud: true`)
- Antwort zurück ans Frontend: `{ type: 'video', image_thumb: '...', bunnyTaskId: '...' }`
- Frontend speichert provisorischen Eintrag im state

### 2. Bunny-Stream-Upload (Phase 2 – Background-Task)
- Server erstellt Bunny-Video-Eintrag via REST API
- Lädt MP4 zu Bunny Stream hoch
- Pollt auf Encoding-Fortschritt (max 45s)
- **Holt Bunny-Thumbnail** → generiert Varianten → **lädt sofort nach R2 hoch** (`uploadToCloud: true`)
- Ergebnis: `{ type: 'bunny', videoId, libraryId, url: iframe-embed, image_thumb: '...' }`
- Frontend pollt alle 2.5s und aktualisiert den state auf `type: 'bunny'` mit korrekten Daten

### 3. Korrekte Felder nach Background-Abschluss
```json
{
  "type": "bunny",
  "videoId": "abc-123",
  "libraryId": "679639",
  "url": "https://iframe.mediadelivery.net/embed/679639/abc-123",
  "image_original": "https://iframe.mediadelivery.net/embed/679639/abc-123",
  "image_thumb": "https://pub-...r2.dev/v2/data/uploads/thumbs400/vidbunny-xxx_thumb.jpg"
}
```

### 4. Publizieren
- `generateHTML()` baut HTML mit Bunny-Iframes + Thumbnails (R2-URLs)
- `state.json` wird 1:1 nach R2 geschrieben
- R2-Thumbnails sind sofort verfügbar (kein Cloud Sync nötig)

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

## Bug: Doppelt escape in server.ts NICHT erlaubt

Im Gegensatz zu `generateHTML()` (`src/App.tsx`) ist `server.ts` **reines TypeScript** ohne Template-Literal-Einbettung. Hier werden Backtick-Template-Literals direkt ausgeführt:

```typescript
// ✅ Richtig (server.ts):
url: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`

// ❌ Falsch (führt zu SyntaxError ""`""):
url: \`https://...\${libraryId}\`
```

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

---

## Bunny-Flow für Frontend-Coder: So findet das Frontend die Videos

### 1. Wo liegt das Video?

Jedes Bunny-Video hat im `state.json` einen Eintrag wie:

```json
{
  "type": "bunny",
  "videoId": "2fe65c1a-006e-4984-888f-ef06fbfcb871",
  "libraryId": "679639"
}
```

**Im Browser abspielen:** `https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}`

```
https://iframe.mediadelivery.net/embed/679639/2fe65c1a-006e-4984-888f-ef06fbfcb871
```

### 2. Wo liegen die Thumbnails?

Auf Cloudflare R2, public Domain:

```
https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/v2/data/uploads/{variant}/{filename}
```

Varianten: `thumbs400/`, `1k/`, `2k/`, `3k/`

Beispiel:
```
https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/v2/data/uploads/thumbs400/vidbunny-xxx_local_thumb.jpg
```

Diese werden **automatisch beim Upload** nach R2 hochgeladen – kein manueller Sync nötig.

### 3. Wie kommen die Daten ins Frontend?

| Schritt | API-Endpunkt | Methode | Beschreibung |
|---------|-------------|---------|-------------|
| Video hochladen | `/api/upload-video-to-bunny` | `POST` (multipart/form-data) | MP4 + projectId + projectName → sofortige Antwort mit localen Thumbnails + Background-Task-ID |
| Status poll | `/api/bunny/task/{taskId}/status` | `GET` | Pollt alle 2.5s, bis `step: 'done'` → dann `type: 'bunny'` + `videoId` + `libraryId` |
| bunny konfiguriert? | `/api/upload-video-to-bunny` gibt `{ bunnyMissing: true }` | - | Wenn Bunny nicht konfiguriert ist, fällt auf `/api/upload-video` (lokal-only) zurück |
| Video löschen | `/api/state/delete` | `POST` | Löscht Post aus state.json |

### 4. Credentials (Server-seitig, nicht im Frontend lesbar)

| Variable | Wert | Wofür |
|----------|------|-------|
| `CF_ACCOUNT_ID` | `9b109aa9587252172ccb60f664f603f0` | R2-Endpoint |
| `CF_ACCESS_KEY` | `0e11678f19a97c193c9a5647f7c4b37b` | R2-Schreibzugriff |
| `CF_SECRET_KEY` | `54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d` | R2-Schreibzugriff |
| `CF_BUCKET` | `portfoliodata` | R2-Bucket-Name |
| `R2_PUBLIC_DOMAIN` | `https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev` | Public-Reader-URL für Bilder/state.json |
| `BUNNY_API_KEY` | (nur im Server-Env) | Schreibzugriff auf Bunny Stream |
| `BUNNY_LIBRARY_ID` | `679639` | Bunny Stream Library (alle Videos) |
| `BUNNY_PULL_ZONE` | (optional) | Bunny-CDN für Thumbnails |

### 5. Daten im published HTML

Die `state.json` liegt auf R2 unter:
```
https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev/state.json
```

Das published HTML embeddet ein `<script id="portfolio-data">...</script>` mit denselben Daten (für Offline-Fallback).

### 6. Entscheidungsbaum: Was rendern?

```
Post mit mergedMedia-Eintrag:
├── type: "bunny" + videoId + libraryId
│   → <iframe src="https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}">
│   → poster/thumbnail via getImageSrc() von R2
├── type: "youtube" + youtubeId
│   → <iframe src="https://www.youtube.com/embed/{youtubeId}">
├── type: "video" + url endet auf .mp4
│   → <video src="{url}" poster="{thumb}">
├── type: "image" + image_*
│   → <img src="{image}">
```

### 7. Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `getImageSrc is not defined` | Fehlende Client-JS-Funktionen | `isDirectMediaFile`, `isValidImageCandidate`, `getImageSrc`, `getYoutubeId`, `getPrimaryMergedMedia`, `getProxiedUrl` müssen im Browser-Script definiert sein |
| `Invalid regular expression: /.(...)` | `\?` nicht doppelt escaped in Template-Literal | `\?` → `\\?`, `\.` → `\\.` NUR in `generateHTML()`-Template-Strings |
| `SyntaxError ""` in server.ts | Backslash vor Backtick in server.ts | `\`` raus, `` ` `` rein – server.ts ist reines TypeScript |
| Thumbnails nicht sichtbar auf CF | Nicht auf R2 hochgeladen | `uploadToCloud: true` setzen in `materializeVariantSet`-Options |
| `url` zeigt auf MP4 statt Embed | Background-Task hat `originalUrl` verwendet | `url: \`https://iframe.mediadelivery.net/embed/\${libraryId}/\${videoId}\``
