@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

cd /d "%~dp0"

echo ========================================================================
echo  Portfolio Feed Editor - Repomix Codebase Bundler
echo  Aufteilung auf Chunks mit maximal 130.000 Zeichen
echo ========================================================================
echo.

set "TARGET_DIR=repomix-output"
set "REMAINING_ARGS="
set "FIRST_ARG=%~1"

if not defined FIRST_ARG goto run_pack

set "CHECK_PREFIX=%FIRST_ARG:~0,2%"
if "%CHECK_PREFIX%"=="--" (
    set "TARGET_DIR=repomix-output"
    set "REMAINING_ARGS=%*"
    goto run_pack
)

set "PREFIX_CHECK=%FIRST_ARG:~0,8%"
if /i "%PREFIX_CHECK%"=="repomix_" (
    set "TARGET_DIR=%FIRST_ARG%"
) else if /i "%PREFIX_CHECK%"=="repomix-" (
    set "TARGET_DIR=%FIRST_ARG%"
) else (
    set "TARGET_DIR=repomix_%FIRST_ARG%"
)

shift
:collect_args
if "%~1"=="" goto run_pack
set "REMAINING_ARGS=%REMAINING_ARGS% %1"
shift
goto collect_args

:run_pack
echo Zielverzeichnis : %TARGET_DIR%

if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
echo Bereinige vorherige Chunks in %TARGET_DIR%...
del /q "%TARGET_DIR%\*.*" 2>nul

echo Starte Repomix...
echo.

where repomix.cmd >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    call repomix.cmd --output "%TARGET_DIR%\bundle.txt" %REMAINING_ARGS%
) else (
    pushd "%TEMP%"
    call npx --yes repomix --cwd "%~dp0" --output "%TARGET_DIR%\bundle.txt" %REMAINING_ARGS%
    popd
)

set REPOMIX_EXIT=%ERRORLEVEL%
if %REPOMIX_EXIT% NEQ 0 (
    echo.
    echo [FEHLER] Repomix wurde mit Fehlercode %REPOMIX_EXIT% beendet.
    if not defined FIRST_ARG pause
    exit /b %REPOMIX_EXIT%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\repomix-audit.ps1" -OutputDir "%TARGET_DIR%"

if not defined FIRST_ARG pause
endlocal
