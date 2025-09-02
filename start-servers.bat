@echo off
echo.
echo ===================================
echo HEYS Project B - Starting Servers
echo ===================================
echo.

:: Kill existing Node.js processes
echo Stopping existing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

:: Wait a bit
timeout /t 2 /nobreak >nul

:: Start API server in background
echo Starting API server on port 4001...
start /B /MIN cmd /c "cd /d "c:\! HEYS 2" && node packages/core/src/server.js"

:: Wait for API to start
timeout /t 5 /nobreak >nul

:: Start Frontend server in background  
echo Starting Frontend server on port 3001...
start /B /MIN cmd /c "cd /d "c:\! HEYS 2" && pnpm --filter @heys/web run dev"

:: Wait for Frontend to start
timeout /t 8 /nobreak >nul

:: Check if ports are open
echo.
echo Checking servers...

:: Simple port check using netstat
netstat -an | find ":4001" >nul
if %errorlevel%==0 (
    echo [✓] API server is running on port 4001
) else (
    echo [✗] API server failed to start
)

netstat -an | find ":3001" >nul  
if %errorlevel%==0 (
    echo [✓] Frontend server is running on port 3001
) else (
    echo [✗] Frontend server failed to start
)

echo.
echo ====================================
echo Frontend: http://localhost:3001
echo API: http://localhost:4001
echo Health: http://localhost:4001/api/health
echo ====================================
echo.
echo Press any key to exit...
pause >nul
