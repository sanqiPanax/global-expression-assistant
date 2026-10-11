@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.9 or newer first.
  pause
  exit /b 1
)
if not exist node_modules\twitter-text (
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:3210 after the server starts.
call npm.cmd start
pause
