@echo off
setlocal

set "PORT=5500"
set "PROJECT_ROOT=%~dp0"

echo Starting SKADIS Creator at http://localhost:%PORT%/
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%start-server.ps1" -Port %PORT%
