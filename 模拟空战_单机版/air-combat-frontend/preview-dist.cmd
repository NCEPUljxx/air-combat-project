@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo 未找到 dist\index.html，请先在本目录执行:
  echo   npm install
  echo   npm run build
  pause
  exit /b 1
)
call npm run preview
if errorlevel 1 pause
