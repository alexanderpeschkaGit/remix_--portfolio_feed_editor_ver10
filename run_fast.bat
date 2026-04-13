@echo off
echo Starting Portfolio Editor (Fast Mode - No Dependency Check)...
start "Portfolio Server" cmd /c "npm run dev"
echo Server started in background.

:: Wait a few seconds for the server to start
timeout /t 5 /nobreak > nul

:: Open the browser
echo Opening browser...
start http://localhost:3000

exit
