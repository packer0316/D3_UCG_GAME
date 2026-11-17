@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title D3 UCG GAME

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js，請先安裝：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/3] 安裝套件 npm install ...
  call npm install
  if errorlevel 1 (
    echo [錯誤] npm install 失敗
    pause
    exit /b 1
  )
) else (
  echo [1/3] 套件已安裝
)

if not exist "public\res\manifest.json" (
  echo [2/3] 複製原版資源 npm run assets ...
  call npm run assets
  if errorlevel 1 (
    echo [錯誤] 資源複製失敗，請確認原版路徑，或設定環境變數 D3_SRC
    pause
    exit /b 1
  )
) else (
  echo [2/3] 資源已存在（要重新複製請執行 npm run assets）
)

echo [3/3] 啟動開發伺服器，瀏覽器會自動開啟 ...
echo       關閉此視窗即可停止伺服器
call npm run dev -- --open

pause
