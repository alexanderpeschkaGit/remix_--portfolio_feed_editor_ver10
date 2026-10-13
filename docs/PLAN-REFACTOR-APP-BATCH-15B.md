## Execution Metadata
- **Recommended Execution Model:** PRO
- **Complexity Assessment:** Folge-Runde nach abgeschlossenem App.tsx-Deep-Refactor (Batches 1–15a, commits 07ee9a5..a783401 + 6f161f2). Restarbeit: rein mechanische Formatierung + 2 Pflicht-Dekompositionen (useMediaUploads 637 Z., generatePortfolioHtml 1095 Z. – beide > 500 AGENTS.md-Limit) + Test-/Parity-Gate. Blast-Radius: Bunny-Upload-Pipeline und veröffentlichtes HTML-Template → PRO. Executor agiert als Implementer und spannt vor der Finalisierung einen `pro` Reviewer-Subagent (Red-Teaming).

---

# Plan: Batch 15b — Finalisierung des App.tsx-Deep-Refactors

> Fortsetzung von `docs/PLAN-REFACTOR-APP.md`. Voraussetzung: Batches 1–15a sind committet (Branch `handoff/backend-starter`), `npm run lint` + `npm run build` grün, Red-Team-Review „SAFE to finalize“. Statusdatei: `tmp/refactor-plan-app-progress.md` (Scratch, nicht committen).

## 1. Architektur & Logik

**Preflight (aktuelle Fakten, Quelle: Repo-Stand):**
- `src/App.tsx` = **780 Zeilen** (Ziel ≤ ~480).
- `src/hooks/useMediaUploads.ts` = **637 Zeilen** (> 500 → Pflicht-Dekomposition).
- `src/utils/generatePortfolioHtml.ts` = **1.095 Zeilen** (> 500 → Pflicht-Dekomposition).
- `npm run test` deckt nur Server-Module (`tests/*.test.ts`, 8 Dateien); keine UI-/App.tsx-Tests.
- Build-Warnung „chunks > 500 kB“ (Main-Chunk 667,8 kB) ist **vorbestehend**, kein Fehler.
- AGENTS.md Docs-Delta 1+2+3 (React-19-Korrektur, Canonical Paths/Ownership, Follow-up-Hinweis) ist geschrieben; noch uncommittet in diesem Schritt.
- Zu bewahren (User-Änderungen, nicht anfassen): `.agents/skills/deep-refactor/SKILL.md` (MM).

**Reihenfolge (dependency-aware):**
1. **Baseline-Test:** `npm run test` einmal ausführen, Ergebnis dokumentieren (Server-Tests; App.tsx nicht abgedeckt).
2. **Formatierung kompaktieren:** Hook-Call-Parameter in `App.tsx` verdichten (mehrere Parameter pro Zeile, rein formatierend, kein Logik-Change). Ziel: ~100 Zeilen sparen. Gate: lint + build.
3. **JSX-Leaves extrahieren:** Fallback-Banner (~24 Z.) und Resolution-Toast (~19 Z.) aus dem JSX von `App.tsx` in Leaf-Komponenten unter `src/components/` verschieben (Props sauber, kein Parameter-Bag). Gate: lint + build + Browser-Reload-Smoke (Banner/Toast).
4. **`useMediaUploads.ts` dekomponieren (637 → <500):** Grenzen ziehen ohne Verhaltensänderung, z. B. `handleImageUpload` / `handleVideoFileUpload` / `handleVideoLinkChange` als eigene Cluster (Teil-Hooks oder Helfer). Verbatum-Moves, nur mechanische Anpassungen. Gate: lint + build + `npm run test`.
5. **`generatePortfolioHtml.ts` dekomponieren (1.095 → <500):** Template-Teile pro Sektion extrahieren (head/css, header/bio, post-cards, scripts). Reine String-Pur-Logik; veröffentlichtes HTML muss byte-identisch bleiben. Gate: lint + build + Preview-/Publish-Smoke (Browser).
6. **App.tsx-Größencheck:** ≤ ~480 bestätigen; verbliebene Reste aufräumen; ggf. Legacy-Reste nach `backup_unused/`. Gate: lint + build.
7. **Final-Gate:** `npm run test` + `npm run lint` + `npm run build`; danach `pro` Reviewer-Subagent (Red-Teaming) über den finalen Diff.
8. **Parity-Checkliste (§1.7, 17 Punkte):** manuell per Browser-Reload abhaken (Status: tested / manually checked / N/A / unverified). Erst danach gilt „fertig“.

**Annahmen, Fallbacks, Exit-Bedingungen:**
- Encoding UTF-8 (buffer-sicher); nach jedem Edit CRLF normalisieren (Regex `(?<!`r)`n` → `r`n`).
- `run_fast.bat` / `autostart.bat` NIE autonom ausführen — nur den Befehl an den User übergeben.
- Max. 3 gezielte Reparatur-Iterationen pro Schritt; bei anhaltendem Fail STOPPEN, exakte Fehlermeldung melden, User fragen. Nie `reset`/`checkout`/`clean`.
- Verhaltensparität ist nicht durch grünen Compiler bewiesen — Punkt 8 ist Pflicht.

## 2. Datei-Inventar

| Datei | Aktion |
|---|---|
| `src/App.tsx` | modifiziert (Schritte 2, 3, 6) |
| `src/components/…` (FallbackBanner, ResolutionToast o. ä.) | **Neu** (Schritt 3) |
| `src/hooks/useMediaUploads.ts` + evtl. Teil-Hooks | modifiziert/**Neu** (Schritt 4) |
| `src/utils/generatePortfolioHtml.ts` + evtl. Teil-Helfer | modifiziert/**Neu** (Schritt 5) |
| `docs/PLAN-REFACTOR-APP-BATCH-15B.md` | dieser Plan |
| `tmp/refactor-plan-app-progress.md` | Scratch-Status (nicht committen) |

Explizit unberührt: `server.ts`, `src/server/*`, `src/services/*`, `src/utils/linkify.ts`, `src/utils/mergePosts.ts`, alle Root-Scripts, `backups/`, `backups_app/`, `data*/`, `.agents/skills/deep-refactor/SKILL.md` (User-Änderung), `.env`.

## 3. Risiko- & Komplexitäts-Check (Skala 1–10)

| Aufgabe | Komplexität | Begründung |
|---|---|---|
| 1 Baseline-Test | 1 | vorhandene Tests ausführen |
| 2 Formatierung kompaktieren | 2 | mechanisch, lint-verifiziert |
| 3 JSX-Leaves extrahieren | 4 | kleine UI-Moves, Props sauber halten |
| 4 useMediaUploads dekomponieren | 7 | Bunny-Upload-Pipeline, async, Fortschritts-State |
| 5 generatePortfolioHtml dekomponieren | 6 | Template-Strings, Published-HTML-Regression |
| 6 App.tsx-Cutover | 5 | Orchestrator-Assembly + Aufräumen |
| 7 Final-Gate + Red-Team | 4 | Review, keine Codeproduktion |
| 8 Parity-Checkliste | 6 | nur manuell, 17 UI-Verhalten |
| **Kombinierte Ausführung** | **8** | sequenzielle Abhängigkeiten + manueller UI-Coverage-Anteil |

Einzelwert 7 und Gesamt 8 > 6 → **PRO-Modell erforderlich**; `#exec` agiert als Implementer und spannt vor der Finalisierung einen `pro` Reviewer-Subagent (Red-Teaming).

## 4. Optimierungshinweis

- Schritte **2 + 3** sind kombinierbar (joint-Komplexität ≈ 5) — ein Batch, aber Datei-Limit 3 beachten (App.tsx + 2 neue Leaf-Komponenten = 3 ✓).
- Schritte **4** und **5** NICHT kombinieren (einzeln ≥ 6).
- Test-Gates: nach jedem Schritt `npm run lint` + `npm run build`; `npm run test` nach 4 und 5 zusätzlich.
- Kein neuer Skill entsteht → keine `.agents/WORKFLOWS.md`-Registrierung nötig.
