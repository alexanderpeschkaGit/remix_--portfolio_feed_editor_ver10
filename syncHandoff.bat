@echo off
chcp 65001 > nul
echo ========================================================
echo   Portfolio Editor - Handoff Synchronisation
echo ========================================================
echo.
node "%~dp0sync_handoff.cjs"
echo.
echo ========================================================
echo   Fertig! Druecke eine beliebige Taste zum Schliessen.
echo ========================================================
pause > nul
