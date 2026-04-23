SHORTCUT COMMANDS:
Wenn ich ein Hashtag nutze, reagiere sofort mit dem entsprechenden Protokoll:

#plan -> Erstelle KEINEN Code. Analysiere meine Anfrage und erstelle:
Eine logische Schritt-für-Schritt-Architektur (Windows & Cloudflare kompatibel).
Eine Liste der betroffenen Dateien mit relativen Pfaden.
RISIKO-CHECK: Bewerte die Komplexität (1-10). Wenn der Wert > 6 ist, füge eine fettgedruckte Warnung hinzu: "EMPFEHLUNG: Für die Umsetzung (#exec) zu GEMINI 1.5 PRO wechseln!"
Bestätige mit: "Soll ich mit Schritt 1 beginnen?"

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