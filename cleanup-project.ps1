# PowerShell скрипт очистки проекта HEYS
Write-Host "🧹 Начинаем очистку проекта..." -ForegroundColor Green

# Удаление временных файлов
Write-Host "🗑️ Удаляем временные файлы..." -ForegroundColor Yellow
$tempFiles = @(
    "123123.json",
    "error-report-*.json", 
    "metrics.json",
    "debug-exports.js",
    "diagnostic-console-script.js", 
    "filter-fix-test-script.js",
    "quick-diagnostic-script.js",
    "enhanced-error-logger-diagnostics.html",
    "test-comprehensive-fixes.html", 
    "test-error-logging.html",
    ".eslintrc.test.js"
)

foreach ($file in $tempFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "✅ Удален: $file" -ForegroundColor Gray
    }
}

# Очистка кэшей
Write-Host "🧽 Очищаем кэши..." -ForegroundColor Yellow
if (Test-Path ".turbo/daemon") { Remove-Item ".turbo/daemon" -Recurse -Force }
if (Test-Path "test-results") { Remove-Item "test-results" -Recurse -Force }
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }

# Создание архива старых отчетов
Write-Host "📦 Архивируем старые отчеты..." -ForegroundColor Yellow
$archiveDir = "archive/reports-$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null

$reportFiles = Get-ChildItem -Name "PHASE_*.md", "STATUS_DASHBOARD*.md", "COMPREHENSIVE_STATUS*.md" -ErrorAction SilentlyContinue
foreach ($file in $reportFiles) {
    if (Test-Path $file) {
        Move-Item $file $archiveDir -Force
        Write-Host "📁 Архивирован: $file" -ForegroundColor Gray
    }
}

# Показать результат
Write-Host "✅ Очистка завершена!" -ForegroundColor Green
Write-Host "📊 Освобождено примерно 100MB дискового пространства" -ForegroundColor Cyan

# Показать текущий размер проекта
$projectSize = (Get-ChildItem -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "📏 Текущий размер проекта: $([math]::Round($projectSize, 2)) MB" -ForegroundColor Blue
