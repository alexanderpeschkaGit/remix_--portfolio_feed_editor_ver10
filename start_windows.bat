@echo off
echo ==========================================
echo Starting Portfolio Editor (Windows Mode)
echo ==========================================
cd /d "%~dp0"
:: Check if node_modules exists, if not run npm install
IF NOT EXIST "node_modules\" (
    echo Installing dependencies...
    call npm install
)

:: Start the server
echo Starting local server...
start "Portfolio Server" cmd /c "npm run dev"

:: Wait a few seconds for the server to start
timeout /t 5 /nobreak > nul

:: Open the browser
echo Opening browser...
start http://localhost:3000

echo.
echo Server is running in the background window.
echo You can close this window, but keep the server window open.
echo To stop the server, close the server window or press Ctrl+C in it.
pause
