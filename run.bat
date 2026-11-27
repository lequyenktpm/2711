@echo off
setlocal
cd /d "%~dp0"

echo ==================================================
echo   KineticSub Studio - Starting on Port 3030
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies first...
  call npm install
  if errorlevel 1 (
    echo [WARN] npm install encountered a dependency conflict. Retrying with --legacy-peer-deps...
    call npm install --legacy-peer-deps
  )
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

set PORT=3030
start "" http://localhost:3030
npx tsx server.ts
