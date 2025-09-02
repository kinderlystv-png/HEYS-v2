@echo off
title HEYS Project B - Dual Server Launcher
color 0A

echo.
echo ===================================
echo HEYS Project B - Starting Servers
echo ===================================
echo.

REM Остановка существующих процессов Node.js
echo 🛑 Stopping existing Node.js processes...
taskkill /F /IM "node.exe" >nul 2>&1

REM Установка переменных окружения
set PORT=3001
set API_PORT=4001
set VITE_PORT=3001
set DATABASE_NAME=projectB

echo.
echo 🚀 Starting API server on port 4001...
start "HEYS API Server" cmd /c "cd /d "c:\! HEYS 2" && set API_PORT=4001 && node packages/core/src/server.js && pause"

REM Ожидание запуска API сервера
timeout /t 5 /nobreak >nul

echo 🌐 Starting Frontend server on port 3001...
start "HEYS Frontend" cmd /c "cd /d "c:\! HEYS 2" && set PORT=3001 && set VITE_PORT=3001 && set API_PORT=4001 && pnpm --filter "@heys/web" run dev && pause"

REM Ожидание запуска Frontend сервера
timeout /t 8 /nobreak >nul

echo.
echo ====================================
echo Frontend: http://localhost:3001
echo Frontend: http://localhost:3002 (if port conflict)
echo API: http://localhost:4001
echo Health: http://localhost:4001/health
echo ====================================
echo.

echo 📋 Both servers are starting in separate windows
echo 💡 Check the opened terminal windows for detailed logs
echo ❌ To stop servers, close the terminal windows or press Ctrl+C in each
echo.
echo Press any key to open browsers...
pause >nul

REM Открытие браузеров
start "" "http://localhost:4001/health"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3002"

echo.
echo ✅ Servers launched successfully!
echo ℹ️  Check opened browser tabs and terminal windows
echo.
pause
