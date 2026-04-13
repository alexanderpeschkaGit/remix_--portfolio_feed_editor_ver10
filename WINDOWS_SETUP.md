# Portfolio Editor - Windows 11 Setup Guide

Diese Anleitung hilft dir, die Applikation auf deinem Windows 11 Rechner einzurichten und zu betreiben.

## 1. Voraussetzungen

*   **Node.js:** Lade die aktuelle LTS-Version von [nodejs.org](https://nodejs.org/) herunter und installiere sie.
*   **Python:** Installiere Python von [python.org](https://www.python.org/). Achte darauf, bei der Installation die Option **"Add Python to PATH"** zu aktivieren.

## 2. Transfer der Dateien

1.  Lade alle Dateien aus dem AI Studio Projekt herunter (Export als ZIP).
2.  Entpacke die ZIP-Datei in einen Ordner deiner Wahl (z.B. `C:\Projekte\PortfolioEditor`).

## 3. Erster Start

1.  Öffne den Ordner im Windows Explorer.
2.  Suche die Datei `start_windows.bat`.
3.  Mache einen Doppelklick auf `start_windows.bat`.
    *   Beim ersten Start werden automatisch alle notwendigen Bibliotheken installiert (`npm install`). Dies kann einen Moment dauern.
    *   Danach startet der Server automatisch.
    *   Dein Standard-Browser öffnet sich unter `http://localhost:3000`.

## 4. Cloudflare R2 Konfiguration (Optional)

Wenn du deine eigene Cloudflare-Instanz nutzen möchtest:
1.  Erstelle eine Datei namens `.env` im Hauptverzeichnis.
2.  Füge deine Zugangsdaten ein:
    ```env
    CLOUDFLARE_ACCOUNT_ID=deine_id
    CLOUDFLARE_ACCESS_KEY_ID=dein_key
    CLOUDFLARE_SECRET_ACCESS_KEY=dein_secret
    CLOUDFLARE_BUCKET_NAME=dein_bucket
    CLOUDFLARE_PUBLIC_DOMAIN=deine_domain.r2.dev
    ```

## 5. Funktionen nutzen

*   **Scraping:** Nutze die Scraper für Flickr oder Instagram. Die Bilder werden lokal im Ordner `data/` gespeichert.
*   **High-Res Sync:** Wenn du Originale im Ordner `data/originals/` ablegst, kannst du sie über den Button "better Res." automatisch mit deinen Posts verknüpfen.
*   **Cloud Sync:** Nutze den Button "Cloud Sync", um alle lokalen Bilder zu Cloudflare R2 hochzuladen. Dies stellt sicher, dass deine öffentliche Galerie alle Bilder korrekt anzeigt.
*   **Publish:** Klicke auf "PUBLISH", um die aktuelle Galerie und die Daten auf Cloudflare R2 zu veröffentlichen.

## 6. Fehlerbehebung

*   **Python nicht gefunden:** Stelle sicher, dass `python` in deiner Kommandozeile (`cmd`) funktioniert. Tippe `python --version`.
*   **Port 3000 belegt:** Falls eine andere App Port 3000 nutzt, schließe diese oder frage mich nach einer Port-Änderung.
*   **CORS Fehler:** Im lokalen Modus (`localhost`) sollten keine CORS-Fehler auftreten. Falls doch, lade die Seite neu.

---
Viel Erfolg mit deiner Standalone-App!
