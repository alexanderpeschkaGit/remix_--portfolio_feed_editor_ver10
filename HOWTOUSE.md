# Portfolio Editor - Bedienungsanleitung (How to Use)

Willkommen im Portfolio Editor! Diese Anleitung erklärt dir alle Buttons und Funktionen des Admin-Panels, damit du deine Galerie optimal verwalten kannst.

---

## 📊 Status & Scraping

* **Cloudflare Usage (Top):** Ganz oben siehst du deine aktuelle Speicher- und Request-Auslastung bei Cloudflare R2.
* **Insta & Flickr (Split-Button):** Startet einen vollständigen Durchlauf, um neue Bilder aus deinem Instagram-Feed oder Flickr-Album in den Editor zu laden.
* **+ Insta / + Flickr:** Lädt gezielt nur den allerneuesten Post von Instagram oder Flickr herunter und fügt ihn direkt dem Portfolio hinzu.
* **better Res. (High-Res Sync):** Scrapt den lokalen Ordner `data/originals/` (inkl. Unterordner). Wenn dort hochauflösende Originale liegen, werden sie mit gescrapten Posts abgeglichen. Alte Bilder werden durch optimierte 3K-Versionen ersetzt.
* **Review (Unsichere Matches):** Leuchtet auf, wenn "better Res." sich bei einigen Bildern nicht zu 100% sicher ist. Du kannst die Treffer manuell bestätigen oder ablehnen.

---

## ☁️ Cloudflare & Daten-Management

* **Backups:** Öffnet ein Menü, in dem du automatische lokale Sicherungen deines Portfolios wiederherstellen kannst.
* **Rebuild R2:** Leert deinen kompletten Cloudflare R2-Bucket und baut ihn aus deinen lokalen Daten frisch auf.
* **Cloud Sync:** Spiegelt alle deine lokalen Bilder (Uploads, Flickr, Instagram etc.) zuverlässig auf Cloudflare R2.
* **Merge Cloud:** Übernimmt Text- und Kategorie-Änderungen von der Live-Umgebung, während deine lokalen Medien erhalten bleiben (nützlich bei parallel gemachten Änderungen).
* **Media Variants:** Prüft und generiert fehlende Bild-Thumbnails und Video-Poster (lokal oder direkt auf R2).

### 🧹 Cleanup Tools (Die kleinen Mülleimer-Buttons)
Diese kompakte Button-Gruppe hilft dir, Speicherplatz auf R2 und lokal freizugeben:
* **R2:** Sucht nach verwaisten Dateien (ohne Post-Zuordnung) im R2-Bucket und verschiebt sie in den Trash.
* **Dupes:** Findet alte Datei-Duplikate und verschiebt die redundanten Kopien in den Trash.
* **Redundant:** Löscht bit-identische Dateien auf R2 und lokal (Hash-Vergleich).
* **Trash:** Öffnet den R2-Papierkorb. Hier kannst du gelöschte Dateien wiederherstellen oder als lokales Backup (`bak/`) archivieren.
* **Purge bak/:** Löscht das lokale `bak/`-Archiv endgültig (Achtung: Unwiderruflich!).

---

## ✏️ Bearbeitung & Sortierung

* **Edit Mode / Exit Edit:** Schaltet den Bearbeitungsmodus um. Hier kannst du Titel, Texte und Kategorien (Tags) der Posts bearbeiten. Im Edit Mode kannst du ganz oben auch den Haupttitel, Untertitel und deine Social-Media-Links anpassen.
* **Rearrange:** Öffnet den Sortier-Modus. Hier kannst du Bilder per Drag & Drop verschieben.
* **Merge Similar:** Führt automatisch alle Projekte zusammen, die den exakt gleichen Text/Titel haben.
* **Neu (+):** Fügt einen komplett neuen, leeren Post hinzu.
* **Bio:** Öffnet den Text-Editor für deine "Über mich"-Sektion (Biografie).
* **Undo / Redo:** Macht deine letzten Aktionen (wie Sortieren, Löschen, Zusammenführen) rückgängig oder stellt sie wieder her.

---

## 🚀 Veröffentlichung

* **Preview:** Zeigt eine lokale HTML-Vorschau deines aktuellen Standes.
* **Undo Publish:** Falls beim Publish ein Fehler passiert ist, kannst du hiermit direkt das vorherige HTML-Backup wieder live schalten.
* **PUBLISH:** Generiert die finale `index.html` Datei und lädt sie mitsamt dem aktuellen State (`state.json`) auf Cloudflare R2 hoch. Deine Änderungen sind damit sofort live im Internet sichtbar!
* **Live:** Öffnet deine aktuell veröffentlichte Galerie in einem neuen Tab.

---

## 🖼️ Innerhalb eines Posts (Im Edit Mode)

Wenn du den "Edit Mode" aktiviert hast, siehst du auf jedem Bild zusätzliche Symbole:

* **Bild-Upload (Wolke mit Pfeil):** Erlaubt dir, ein Bild von deiner Festplatte für diesen Post hochzuladen.
* **YouTube (Play-Icon):** Erlaubt dir, einen YouTube-Link oder Bunny.net Video-Link einzufügen.
* **Mülleimer:** Löscht den Post aus deiner Galerie.
* **Kategorie-Tags (z.B. Projection, Lightart):** Klicke auf die kleinen Tags unter dem Textfeld, um das Bild Kategorien zuzuordnen. Leuchtende Tags sind aktiv.

---

## 🖼️ Media Variants (Thumbnails & Video-Poster)

Der **Media Variants**-Button öffnet ein Modal zur Varianten-Prüfung:
* **Scan Local:** Prüft den lokalen Editor-Zustand auf fehlende Varianten.
* **Verify Live:** Prüft den veröffentlichten `state.json` auf R2.
* **Generate:** Erzeugt alle fehlenden Varianten lokal.
* **Gen + Publish:** Erzeugt fehlende Varianten UND lädt sie direkt zu R2 hoch.
* **Publish:** Lädt erstellte Varianten zu R2 hoch.
* **? (Info-Button):** Öffnet eine ausführliche Hilfe.

---

## 👁️ Vorschau & Auflösungen (Hover-Popover im Edit Mode)

Wenn du im Edit Mode über das **Augen-Icon (Eye)** neben dem Custom-Thumbnail-Button eines Videos hoverst, öffnet sich ein kleines Popover. Es zeigt das Video-Poster, alle vorhandenen **Bildvarianten** und – nur bei Bunny-Videos – die **Streaming-Auflösungen**.

| Abkürzung | Medien-Feld | Bedeutung |
|---|---|---|
| **CT** | `custom_thumb` | Custom Thumbnail – benutzerdefiniertes Thumbnail |
| **TH** | `image_thumb` | Thumbnail – kleine Vorschau-Variante |
| **PV** | `image_preview` | Preview – Vorschau-Bild |
| **1K** | `image_1k` | Variante mit ~1000 px Breite |
| **2K** | `image_2k` | Variante mit ~2000 px Breite |
| **3K** | `image_3k` | Variante mit ~3000 px Breite |
| **LG** | `image_large` | Large – größere Downscale-Stufe |
| **OR** | `image_original` | Original – die unskalierte Quelldatei |
| **IMG** | `image` | Generisches Bild-Feld / Fallback |

---

## ⌨️ Tastatur- & Maus-Kürzel

### Globale Tastenkürzel
| Kürzel | Wirkung |
|---|---|
| `Strg` + `Alt` + `A` | Edit Mode ein/aus |
| `Strg` + `Alt` + `R` | Rearrange-Ansicht (Sortier-Modus) ein/aus |
| `Strg` + `Alt` + `Y` | Auflösungs-Overlay (CT/TH/PV/1K...) ein/aus |
| `Strg` + `Z` | Undo |
| `Strg` + `Shift` + `Z` oder `Strg` + `Y` | Redo |
| `Esc` | Hebt die Medien-Auswahl auf bzw. schließt die Lightbox |

### Maus + Modifier-Taste (Medien in einem Post, Edit Mode)
| Aktion | Wirkung |
|---|---|
| `Klick` auf ein Medium | Wählt genau dieses Medium aus |
| `Strg` + `Klick` | Fügt ein Medium zur Auswahl hinzu bzw. entfernt es |
| `Shift` + `Klick` | Wählt den Bereich vom zuletzt geklickten bis zum angeklickten Medium |
| `Alt` + `Klick` in einem **anderen** Post | Verschiebt die ausgewählten Medien an diese Position im Ziel-Post |
| Drag & Drop | Medien innerhalb eines Posts umsortieren oder in einen anderen Post ziehen |

### Rearrange-Ansicht (Thumbnail-Raster)
| Aktion | Wirkung |
|---|---|
| `Klick` | Einzelauswahl |
| `Strg` + `Klick` | Mehrfachauswahl umschalten |
| `Shift` + `Klick` | Bereichsauswahl |

### Merge-Bestätigung (Post nach unten zusammenführen)
| Taste | Wirkung |
|---|---|
| `←` / `→` | Wechselt zwischen „y“ (ja) und „n“ (nein) |
| `Enter` | Bestätigt die aktuelle Wahl |
| `Esc` | Bricht ab |

### Custom-Thumbnail-Modal
| Taste | Wirkung |
|---|---|
| `Leertaste` | Play / Pause |
| `←` / `→` | 1 Sekunde zurück / vor |
| `Esc` | Schließt das Modal |

---

## 🤖 Hinweis für KI-Assistenten

Diese Datei ist ein **Nutzerhandbuch für Menschen**. Sie wird bewusst nicht von `AGENTS.md` oder den Pointer-Dateien geladen und muss nur gelesen werden, wenn der Nutzer ausdrücklich nach Bedienung oder Kürzeln fragt.
