@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer to start SAGA.
  pause
  exit /b 1
)
if not defined PORT set PORT=4318
start "" http://127.0.0.1:%PORT%
node src/server.mjs %*
pause
