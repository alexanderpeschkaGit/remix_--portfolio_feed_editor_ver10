@echo off
cd /d "%~dp0"

echo === Portfolio Editor Starter ===
echo.

:: 1) Kill any existing process on port 3000
echo [1/4] Schließe alten Server auf Port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr /v ":3000[0-9]"') do (
  if not "%%a"=="" (
    echo   -> Beende Prozess %%a
    taskkill /F /PID %%a >nul 2>&1
  )
)
timeout /t 1 /nobreak >nul

:: 2) Start new server in separate window
echo [2/4] Starte neuen Server...
start "Portfolio Server" cmd /c "npm run dev"

:: 3) Warte auf Server-Readyness (ping alle 2s, max 60s)
echo [3/4] Warte auf Server (http://localhost:3000/api/ping)...
echo      (Das kann bis zu 60s dauern – Server startet Vite + Express)
setlocal enabledelayedexpansion
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/ping' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if !errorlevel! equ 0 (
    echo.
    echo   ^> Server ist bereit!
    goto :openBrowser
  )
  timeout /t 2 /nobreak >nul
)

:: If we get here, server didn't start in time
echo [WARNUNG] Server nicht rechtzeitig gestartet? Oeffne Browser trotzdem...
:openBrowser
endlocal

:: 4) Open browser
echo [4/4] Oeffne Browser...
start http://localhost:3000
echo.
echo Fertig! Der Server laeuft im Fenster "Portfolio Server".
echo Einfach dort ^(Strg+C^) druecken zum Beenden.
exit
