@echo off
title Stock Intelligence App
color 0A

echo.
echo  ========================================
echo   📈 Stock Intelligence App
echo  ========================================
echo.

cd /d "%~dp0"

:: Pull latest code
echo  🔄 Pulling latest code...
git pull --quiet

:: Install server deps if needed
if not exist "server\node_modules" (
    echo  📦 Installing server dependencies...
    cd server && npm install --silent && cd ..
)

:: Install client deps if needed
if not exist "client\node_modules" (
    echo  📦 Installing client dependencies...
    cd client && npm install --silent && cd ..
)

:: Build frontend if not built yet
if not exist "client\build\index.html" (
    echo  🔨 Building frontend ^(first time only, ~1 min^)...
    cd client && npm run build && cd ..
)

:: Seed portfolio if no store exists
if not exist "server\data\store.json" (
    echo  🌱 Loading your portfolio from Equity sheet...
    cd server && node scripts/seed.js && cd ..
)

echo.
echo  ========================================
echo   🌐 Opening: http://localhost:5000
echo  ========================================
echo.

:: Open browser automatically
start "" "http://localhost:5000"

:: Start server
cd server
node index.js
