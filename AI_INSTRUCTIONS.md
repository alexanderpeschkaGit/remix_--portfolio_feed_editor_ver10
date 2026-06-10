SHORTCUT COMMANDS:
Wenn ich ein Hashtag nutze, reagiere sofort mit dem entsprechenden Protokoll:

# PROTOKOLL: MODUS #PLAN
WENN die Nachricht mit "#plan" beginnt oder oder anweisungen hinter diesem  Tag enthält, tritt dafür oder für diesen teil sofort das PLANUNGS-PROTOKOLL in Kraft.

## STRIKTE REGEL: KEIN CODE
- Erstellung von Programmiercode (JS, Python, HTML etc.) ist in diesem Modus VERBOTEN.
- Konzentriere dich ausschließlich auf Analyse und Strukturierung.

## AUSGABE-STRUKTUR
Erstelle die Antwort exakt in dieser Reihenfolge:

### 1. Architektur & Logik
- Erstelle eine logische Schritt-für-Schritt-Architektur.
- Bedingung: Volle Kompatibilität mit Windows (lokal) & Cloudflare (Cloud).

### 2. Datei-Inventar
- Liste alle betroffenen Dateien mit ihren relativen Pfaden auf.

### 3. Risiko- & Komplexitäts-Check
- Bewerte die Komplexität auf einer Skala von 1-10 für:
  a) Jeden einzelnen Task.
  b) Die kombinierte Ausführung (Gesamtprojekt).
- WARNUNG: Falls ein Einzelwert ODER der Gesamtwert > 6 ist, schreibe fettgedruckt: 
  "EMPFEHLUNG: Für die Umsetzung (#exec) zum  PRO modell wechseln!"

### 4. Optimierungshinweis (Kombinations-Logik)
- FALLS Gesamtkomplexität > 6:
  Prüfe, ob Einzeltasks so kombiniert werden können, dass deren gemeinsame Komplexität < 7 bleibt. 
  Gib eine konkrete Empfehlung für diese Schrittkombinationen ab, um das Risiko zu minimieren.

### 5. Abschluss
- Beende die Ausgabe IMMER mit dem exakten Wortlaut: 
  "Soll ich mit Schritt 1 beginnen oder alles umsetzen?"


#exec [Schritt-Nummer] -> Setze den spezifischen Schritt aus unserem letzten Plan um.
Schreibe sauberen, kommentierten Code.
Nutze die hinterlegten Cloudflare-IDs.
Dokumentiere kurz die Änderungen (Change Log).

#review -> Analysiere den bisherigen Code im Chat-Verlauf auf Fehler, Redundanzen oder Abweichungen von den Clean-Code-Regeln und schlage Verbesserungen vor.

#check -> Analysiere die Komplexität der aktuellen Aufgabe (z.B. Logik-Fehler, tiefe API-Integrationen oder Windows-System-Dateizugriffe).
Gib mir eine Einschätzung von 1 bis 10 (1 = Simples HTML/CSS, 10 = Komplexe Logik/Debugging).
Ab einer Komplexität von 7, empfehle mir explizit, für diesen Schritt zum Gemini 1.5 Pro Modell zu wechseln, um Fehler zu vermeiden.

Test-Prozedur nach Änderungen
Sobald Code-Änderungen an der Website vorgenommen wurden, die das Frontend oder die Logik betreffen, sollst du (die KI) den Testprozess wie folgt einleiten:
Entscheidungshilfe: Analysiere, ob ein einfacher Browser-Reload ausreicht oder ob ein Neustart der Umgebung nötig ist.
Handlungsempfehlung: Gib explizit an, welche Methode jetzt am sinnvollsten ist:
Browser Reload: Wenn nur CSS/HTML/JS im Frontend geändert wurde.
run_fast.bat: Für schnelle Updates der Backend-Logik oder Cache-Resets.
autostart.bat: Nur bei grundlegenden Strukturänderungen oder wenn Dienste neu initialisiert werden müssen.
Wichtig: Führe diese Dateien niemals eigenständig aus, sondern schlage den entsprechenden Befehl zur manuellen Bestätigung vor.
"Schreibe den empfohlenen Befehl (z.B. ./run_fast.bat) in einen Code-Block, damit ich ihn mit einem Klick im Terminal ausführen kann."


CLOUDFLARE IDS:
CF_ACCOUNT_ID = "9b109aa9587252172ccb60f664f603f0"
CF_ACCESS_KEY = "0e11678f19a97c193c9a5647f7c4b37b"
CF_SECRET_KEY = "54bcb9d673d5d53aa6e07b5be67963a01c4b90b7121ca5e1d5ac974e37c8f25d"
CF_BUCKET = "portfoliodata"
CF_publicdomain:"https://pub-85bb68a84f3b4ba6b512b3d165c96497.r2.dev