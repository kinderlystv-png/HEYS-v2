# PowerShell скрипт запуска серверов HEYS Project B
Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "HEYS Project B - Starting Servers" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Остановка существующих процессов Node.js
Write-Host "🛑 Stopping existing Node.js processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Установка переменных окружения
$env:PORT = "3001"
$env:API_PORT = "4001"
$env:VITE_PORT = "3001"

# Запуск API сервера в фоне
Write-Host "🚀 Starting API server on port 4001..." -ForegroundColor Green
$apiJob = Start-Job -ScriptBlock {
    Set-Location "c:\! HEYS 2"
    $env:PORT = "4001"
    $env:API_PORT = "4001"
    node packages/core/src/server.js
}

# Ожидание запуска API
Start-Sleep -Seconds 5

# Запуск Frontend сервера в фоне
Write-Host "🌐 Starting Frontend server on port 3001..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    Set-Location "c:\! HEYS 2"
    $env:PORT = "3001"
    $env:VITE_PORT = "3001"
    $env:API_PORT = "4001"
    pnpm --filter "@heys/web" run dev
}

# Ожидание запуска Frontend
Start-Sleep -Seconds 8

# Проверка портов
Write-Host ""
Write-Host "🔍 Checking servers..." -ForegroundColor Yellow

# Проверка API сервера
try {
    $apiResponse = Invoke-WebRequest -Uri "http://localhost:4001" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[✓] API server is running on port 4001" -ForegroundColor Green
} catch {
    Write-Host "[✗] API server failed to start" -ForegroundColor Red
}

# Проверка Frontend сервера
$frontendRunning = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "[✓] Frontend server is running on port 3001" -ForegroundColor Green
} else {
    Write-Host "[✗] Frontend server failed to start" -ForegroundColor Red
}

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3001" -ForegroundColor White
Write-Host "API: http://localhost:4001" -ForegroundColor White
Write-Host "Health: http://localhost:4001/api/health" -ForegroundColor White
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📋 Background jobs created:" -ForegroundColor Yellow
Write-Host "API Job ID: $($apiJob.Id)" -ForegroundColor Gray
Write-Host "Frontend Job ID: $($frontendJob.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "To stop servers, run: Get-Job | Stop-Job" -ForegroundColor Yellow
Write-Host "To view logs, run: Get-Job | Receive-Job" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to exit (servers will continue running)..." -ForegroundColor Cyan
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
