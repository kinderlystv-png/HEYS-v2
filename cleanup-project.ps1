# PowerShell скрипт очистки и оптимизации проекта HEYS
Write-Host "🧹 Начинаем глубокую оптимизацию проекта..." -ForegroundColor Green

# Показать текущий размер
$currentSize = (Get-ChildItem -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "📏 Текущий размер проекта: $([math]::Round($currentSize, 2)) MB" -ForegroundColor Blue

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
if (Test-Path "coverage") { Remove-Item "coverage" -Recurse -Force }
if (Test-Path ".nyc_output") { Remove-Item ".nyc_output" -Recurse -Force }

# Создание архива старых отчетов
Write-Host "📦 Архивируем старые отчеты..." -ForegroundColor Yellow
$archiveDir = "docs/archive/reports-$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null

$reportFiles = Get-ChildItem -Name "PHASE_*.md", "STATUS_DASHBOARD*.md", "COMPREHENSIVE_STATUS*.md" -ErrorAction SilentlyContinue
foreach ($file in $reportFiles) {
    if (Test-Path $file) {
        Move-Item $file $archiveDir -Force
        Write-Host "📁 Архивирован: $file" -ForegroundColor Gray
    }
}

# Оптимизация node_modules
Write-Host "⚡ Оптимизируем node_modules..." -ForegroundColor Cyan
Write-Host "📊 Размер node_modules до оптимизации:" -ForegroundColor Yellow
if (Test-Path "node_modules") {
    $nodeModulesSize = (Get-ChildItem "node_modules" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "   $([math]::Round($nodeModulesSize, 2)) MB" -ForegroundColor Red
    
    Write-Host "🔄 Переустанавливаем зависимости..." -ForegroundColor Yellow
    Remove-Item "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "pnpm-lock.yaml" -Force -ErrorAction SilentlyContinue
    
    # Переустановка с оптимизацией
    pnpm install --frozen-lockfile --prefer-offline --ignore-scripts
    
    if (Test-Path "node_modules") {
        $newNodeModulesSize = (Get-ChildItem "node_modules" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "📊 Размер node_modules после оптимизации:" -ForegroundColor Yellow
        Write-Host "   $([math]::Round($newNodeModulesSize, 2)) MB" -ForegroundColor Green
        $saved = $nodeModulesSize - $newNodeModulesSize
        if ($saved -gt 0) {
            Write-Host "� Сэкономлено: $([math]::Round($saved, 2)) MB" -ForegroundColor Green
        }
    }
}

# Создание списка неиспользуемых зависимостей для удаления
Write-Host "🔍 Анализируем неиспользуемые зависимости..." -ForegroundColor Yellow
$unusedDeps = @"
# Найденные неиспользуемые зависимости (по результатам depcheck):

## Production dependencies (можно удалить если не используются):
- @sentry/browser
- @sentry/integrations  
- @sentry/node
- @types/dompurify
- compression
- cors
- dompurify
- express (если не используется API сервер)
- fuse.js
- helmet
- morgan
- zod

## Dev dependencies (можно удалить):
- @axe-core/playwright
- @changesets/changelog-github
- @commitlint/cli
- @commitlint/config-conventional
- @supabase/supabase-js (removed from HEYS monorepo)
- @swc/core
- @testing-library/jest-dom
- @testing-library/user-event
- @trivago/prettier-plugin-sort-imports
- @vitest/coverage-v8
- axe-core
- cross-env
- eslint-import-resolver-typescript
- msw
- prettier-plugin-organize-imports
- prettier-plugin-packagejson
- rimraf
- rollup-plugin-visualizer
- tsup
- vite-plugin-compression
- vite-plugin-pwa
- workbox-window

Для удаления выполните:
pnpm remove [package-name]
"@

$unusedDeps | Out-File "UNUSED_DEPENDENCIES.md" -Encoding UTF8
Write-Host "📄 Создан файл UNUSED_DEPENDENCIES.md с рекомендациями" -ForegroundColor Cyan

# Показать результат
Write-Host "✅ Оптимизация завершена!" -ForegroundColor Green

# Показать итоговый размер проекта
$finalSize = (Get-ChildItem -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$totalSaved = $currentSize - $finalSize
Write-Host "📏 Итоговый размер проекта: $([math]::Round($finalSize, 2)) MB" -ForegroundColor Blue
if ($totalSaved -gt 0) {
    Write-Host "💾 Общая экономия: $([math]::Round($totalSaved, 2)) MB" -ForegroundColor Green
}
Write-Host "📊 Рекомендации по дальнейшей оптимизации в файле UNUSED_DEPENDENCIES.md" -ForegroundColor Cyan
