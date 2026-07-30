# Portfolio Editor - Bedienungsanleitung (How to Use)

Willkommen im Portfolio Editor! Diese Anleitung erklärt dir alle Buttons und Funktionen des Admin-Panels, damit du deine Galerie optimal verwalten kannst.

---

## 🔄 Scraping & Automatisierung (Reihe 1)

Diese Buttons dienen dazu, neue Bilder von deinen Social-Media-Kanälen in den Editor zu laden.

*   **Flickr:** Sucht nach neuen Bildern in deinem verknüpften Flickr-Account und lädt sie in den Editor.
*   **Insta:** Sucht nach neuen Bildern in deinem Instagram-Feed und lädt sie in den Editor.
*   **Alle:** Führt das Scraping für Flickr und Instagram gleichzeitig aus.
*   **Auto-Up (Checkbox):** Wenn aktiviert, wird nach einem erfolgreichen Scraping automatisch der "PUBLISH" Button gedrückt. Deine Live-Website wird also sofort mit den neuen Bildern aktualisiert.

---

## 🛠️ Bildverwaltung & Synchronisation (Reihe 2)

Hier verwaltest du die Qualität deiner Bilder und stellst sicher, dass alles sicher in der Cloud liegt.

*   **better Res. (High-Res Sync):** 
    *   *Was es macht:* Scrapt den lokalen Ordner `data/originals/` (und alle Unterordner) auf deinem PC.
    *   *Wozu:* Wenn du dort hochauflösende Originaldateien ablegst, versucht das System, diese anhand des Dateinamens mit deinen bereits gescrapten (oft niedriger aufgelösten) Social-Media-Posts abzugleichen. Bei einem Treffer wird eine optimierte 3K-Version erstellt und das alte Bild ersetzt.
*   **Backups:** Öffnet ein Menü, in dem du auf automatische Sicherungen deines Portfolios zugreifen kannst. Falls du aus Versehen etwas gelöscht hast, kannst du hier einen alten Stand wiederherstellen.
*   **Cloud Sync:** 
    *   *Was es macht:* Spiegelt alle deine lokalen Bilder (aus den Ordnern `uploads`, `flickr`, `instagram`, `highres` etc.) in deinen Cloudflare R2 Speicher.
    *   *Wozu:* Das stellt sicher, dass deine öffentliche Website alle Bilder laden kann, auch wenn sie ursprünglich nur auf deiner Festplatte lagen. (Dieser Button befindet sich direkt über dem Publish-Button).
*   **Review (Unsichere Matches):** 
    *   *Was es macht:* Dieser Button leuchtet gelb auf und zeigt eine Zahl, wenn der "better Res." (High-Res Sync) Bilder gefunden hat, bei denen er sich nicht zu 100% sicher ist, zu welchem Post sie gehören (z.B. bei ähnlichen Dateinamen).
    *   *Wozu:* Ein Klick öffnet ein Fenster, in dem du die unsicheren Treffer manuell überprüfen kannst. Du siehst das Originalbild und das neue High-Res-Bild nebeneinander und kannst entscheiden, ob sie zusammenpassen (Bestätigen) oder nicht (Ablehnen).

---

## ✏️ Bearbeitung & Veröffentlichung (Reihe 3)

Mit diesen Buttons passt du das Layout an und bringst deine Seite online.

*   **Edit Mode:** Schaltet den Bearbeitungsmodus ein oder aus. Im Bearbeitungsmodus kannst du:
    *   Titel und Beschreibungen der einzelnen Bilder ändern.
    *   Die Projekt-Kategorien (z.B. "Projection", "Lightart") für jedes Bild festlegen.
*   **Rearrange:** Öffnet den Sortier-Modus. Hier kannst du:
    *   Bilder per Drag & Drop in eine neue Reihenfolge ziehen.
    *   Mehrere Bilder zu einem einzigen Projekt zusammenführen (Merge), indem du sie übereinander ziehst.
*   **PUBLISH:** 
    *   *Was es macht:* Generiert die finale `index.html` Datei deiner Galerie mit allen aktuellen Texten, Sortierungen und Bildern.
    *   *Wozu:* Diese Datei wird direkt auf deinen Cloudflare R2 Speicher hochgeladen. Sobald der Ladebalken voll ist, sind deine Änderungen live im Internet sichtbar!
*   **+ (Plus-Icon):** Fügt einen komplett neuen, leeren Post zu deiner Galerie hinzu. Du kannst danach ein Bild hochladen oder ein YouTube-Video verlinken.

---

## 🖼️ Innerhalb eines Posts (Im Edit Mode)

Wenn du den "Edit Mode" aktiviert hast, siehst du auf jedem Bild zusätzliche Symbole:

*   **Bild-Upload (Wolke mit Pfeil):** Erlaubt dir, ein Bild von deiner Festplatte für diesen Post hochzuladen.
*   **YouTube (Play-Icon):** Erlaubt dir, einen YouTube-Link einzufügen. Das Video wird dann anstelle eines Bildes angezeigt.
*   **Mülleimer:** Löscht den Post unwiderruflich aus deiner Galerie.
*   **Kategorie-Tags (z.B. Projection, Lightart):** Klicke auf die kleinen Tags unter dem Textfeld, um das Bild einer oder mehreren Kategorien zuzuordnen. Leuchtende Tags sind aktiv.

---

## 🖼️ Media Variants (Thumbnails & Video-Poster)

Der **Thumbs**-Button in der Admin-Leiste öffnet das Media-Variants-Modal. Hier kannst du fehlende Thumbnail- und Video-Poster-Varianten prüfen und erzeugen.

**Wann brauchst du das?** Wenn Bilder nach einem Upload keine Vorschaubilder haben, oder nachdem du neue Videos hinzugefügt hast, deren Poster/Thumbnails fehlen.

*   **Scan Local:** Prüft den lokalen Editor-Zustand auf fehlende oder defekte Varianten-Referenzen.
*   **Verify Live:** Prüft den veröffentlichten `state.json` auf Cloudflare R2 auf intakte Varianten.
*   **Generate:** Erzeugt alle fehlenden Varianten lokal auf deinem Rechner (kein Upload).
*   **Gen + Publish:** Erzeugt fehlende Varianten UND lädt sie direkt zu R2 hoch — alles in einem Schritt.
*   **Publish:** Lädt zuvor mit "Generate" erstellte Dateien zu R2 hoch und veröffentlicht `state.json`.
*   **? (Info-Button):** Öffnet eine ausführliche Hilfe direkt im Modal.

**Typischer Ablauf:** Scan Local → Generate → Publish → Verify Live (zum Kontrollieren). Oder einfach Gen + Publish für alles auf einmal.

