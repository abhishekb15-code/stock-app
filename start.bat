@echo off
title Stock Intelligence App
color 0A

echo.
echo  ========================================
echo   📈 Stock Intelligence App
echo  ========================================
echo.

cd /d "%~dp0"

:: Check if client/build exists
if exist "client\build\index.html" (
    echo  ✅ Frontend build found — skipping build step
    goto START_SERVER
)

echo  🔨 Building frontend for the first time...
echo     (This takes ~1 min, only needed once)
echo.

cd client
call npm install --silent
call npm run build
if errorlevel 1 (
    echo.
    echo  ❌ Build failed. Check errors above.
    pause
    exit /b 1
)
cd ..

:START_SERVER
echo.
echo  📦 Installing server dependencies...
cd server
call npm install --silent
cd ..

echo.
echo  🚀 Starting server...
echo.
echo  ========================================
echo   🌐 Open in browser:
echo      http://localhost:5000
echo  ========================================
echo.
echo  Press Ctrl+C to stop the app
echo.

cd server
node index.js
