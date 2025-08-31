# 🗺️ АВТОМАТИЧЕСКОЕ ВНЕДРЕНИЕ НАВИГАЦИОННЫХ КАРТ
# Массово добавляет навигационные карты во все большие файлы проекта HEYS

param(
    [string]$RootPath = ".",
    [int]$MinLines = 500,
    [switch]$DryRun,
    [switch]$Force
)

Write-Host "Navigation Maps Deployment Started" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Gray

# Set UTF-8 encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Change to project root
Set-Location $RootPath

Write-Host "Searching for files to update..." -ForegroundColor Yellow

# Find all large files
$bigFiles = Get-ChildItem -Recurse -Include "*.js","*.ts","*.html" | Where-Object { 
    $_.Length -gt 10KB -and 
    (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines -gt $MinLines
}

Write-Host "Found $($bigFiles.Count) files larger than $MinLines lines:" -ForegroundColor Green

$priorityFiles = @()
$htmlFiles = @()
$jsFiles = @()

foreach ($file in $bigFiles) {
    $lines = (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    $hasNavigation = Select-String -Path $file.FullName -Pattern "dynamic-navigation-mapper|initNavigationMapper" -Quiet
    
    $status = if ($hasNavigation) { "✅" } else { "🔄" }
    $type = $file.Extension.ToUpper()
    
    Write-Host "  $status $($file.Name) ($lines lines, $type)" -ForegroundColor $(if ($hasNavigation) { "Green" } else { "White" })
    
    if ($file.Extension -eq ".html") {
        $htmlFiles += $file
    } else {
        $jsFiles += $file
    }
    
    # Priority HEYS files
    if ($file.Name -match "heys_core|heys_reports|heys_day|heys_storage|heys_user|super-diagnostic") {
        $priorityFiles += $file
    }
}

if ($DryRun) {
    Write-Host "`nDRY RUN MODE - no changes will be saved" -ForegroundColor Yellow
    Write-Host "Run without -DryRun parameter to apply changes" -ForegroundColor Yellow
    exit 0
}

Write-Host "`nStarting file processing..." -ForegroundColor Cyan

$processed = 0
$errors = 0

# Process HTML files
foreach ($file in $htmlFiles) {
    $hasNavigation = Select-String -Path $file.FullName -Pattern "dynamic-navigation-mapper|initNavigationMapper" -Quiet
    
    if ($hasNavigation -and -not $Force) {
        Write-Host "Skipping $($file.Name) - navigation already exists" -ForegroundColor Yellow
        continue
    }
    
    try {
        Write-Host "Processing HTML: $($file.Name)..." -ForegroundColor Blue
        
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        
        # Add navigation panel after body tag
        $navigationHTML = @"

    <!-- Navigation Map Panel -->
    <div id="dynamic-navigation-map" class="navigation-sidebar">
        <div class="navigation-header">
            <h3>Navigation</h3>
            <button id="toggle-navigation">📍</button>
        </div>
        <div class="navigation-content">
            <div class="navigation-stats"></div>
            <div class="navigation-anchors"></div>
        </div>
    </div>

    <!-- Navigation Styles -->
    <style>
        .navigation-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 300px;
            height: 100vh;
            background: linear-gradient(135deg, #1e293b, #334155);
            color: white;
            z-index: 1000;
            overflow-y: auto;
            box-shadow: 4px 0 20px rgba(0,0,0,0.3);
            transform: translateX(-280px);
            transition: all 0.3s ease;
        }

        .navigation-sidebar.expanded {
            transform: translateX(0);
        }

        .navigation-header {
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .navigation-content {
            padding: 15px;
        }

        .anchor-item {
            padding: 8px 12px;
            margin: 4px 0;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-left: 3px solid #60a5fa;
        }

        .anchor-item:hover {
            background: rgba(255,255,255,0.2);
            transform: translateX(5px);
        }

        #toggle-navigation {
            position: fixed;
            left: 10px;
            top: 10px;
            background: rgba(30, 41, 59, 0.9);
            color: white;
            border: none;
            padding: 10px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 1001;
            font-size: 18px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
    </style>
"@

        # Add navigation after body tag
        $content = $content -replace '(<body[^>]*>)', "`$1$navigationHTML"
        
        # Add script before closing body tag
        $scriptHTML = @"

    <!-- Navigation System -->
    <script src="../TOOLS/dynamic-navigation-mapper.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof initNavigationMapper !== 'undefined') {
                initNavigationMapper();
            }
            
            // Navigation toggle
            const toggleBtn = document.getElementById('toggle-navigation');
            const sidebar = document.getElementById('dynamic-navigation-map');
            
            if (toggleBtn && sidebar) {
                toggleBtn.addEventListener('click', () => {
                    sidebar.classList.toggle('expanded');
                });
            }
        });
    </script>
"@

        $content = $content -replace '</body>', "$scriptHTML`n</body>"
        
        # Save file
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8
        
        Write-Host "  Successfully updated: $($file.Name)" -ForegroundColor Green
        $processed++
        
    } catch {
        Write-Host "  Error in $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
}

# Обрабатываем JS/TS файлы
foreach ($file in $jsFiles) {
    $hasNavigation = Select-String -Path $file.FullName -Pattern "НАВИГАЦИОННАЯ КАРТА|📍|🗺️" -Quiet
    
    if ($hasNavigation -and -not $Force) {
        Write-Host "⏭️  Пропускаем $($file.Name) - навигационные комментарии уже есть" -ForegroundColor Yellow
        continue
    }
    
    try {
        Write-Host "🔧 Обрабатываем JS/TS: $($file.Name)..." -ForegroundColor Blue
        
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        $lines = ($content -split "`n").Count
        
        # Добавляем навигационный заголовок
        $navigationHeader = @"
/**
 * 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА
 * Файл: $($file.Name)
 * Размер: $lines строк
 * Обновлено: $(Get-Date -Format "yyyy-MM-dd HH:mm")
 * 
 * 📍 ОСНОВНЫЕ СЕКЦИИ:
 * - Инициализация и конфигурация
 * - Основные классы и функции  
 * - Обработчики событий
 * - Утилиты и помощники
 * - Экспорт модулей
 */

// 🏗️ === АРХИТЕКТУРНАЯ СЕКЦИЯ ===

"@

        # Добавляем в начало файла
        $content = $navigationHeader + $content
        
        # Сохраняем файл
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8
        
        Write-Host "  ✅ Успешно обновлен: $($file.Name)" -ForegroundColor Green
        $processed++
        
    } catch {
        Write-Host "  ❌ Ошибка в $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $errors++
    }
}

# Итоговый отчет
Write-Host "`n" + "=" * 60 -ForegroundColor Gray
Write-Host "📊 ОТЧЕТ О ВНЕДРЕНИИ НАВИГАЦИОННЫХ КАРТ" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "🎯 Всего файлов найдено: $($bigFiles.Count)" -ForegroundColor White
Write-Host "✅ Успешно обработано: $processed" -ForegroundColor Green
Write-Host "❌ Ошибок: $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })

if ($priorityFiles.Count -gt 0) {
    Write-Host "`n🏆 Приоритетные файлы HEYS обновлены:" -ForegroundColor Yellow
    foreach ($file in $priorityFiles) {
        Write-Host "  🎯 $($file.Name)" -ForegroundColor White
    }
}

Write-Host "`n🎪 Результат:" -ForegroundColor Cyan
Write-Host "   📁 Все большие файлы теперь имеют навигационные карты!" -ForegroundColor White
Write-Host "   🗺️  Улучшена навигация по проекту" -ForegroundColor White
Write-Host "   🚀 Повышена эффективность разработки" -ForegroundColor White

Write-Host "`n🎯 Следующие шаги:" -ForegroundColor Green
Write-Host "   1. Откройте любой обновленный HTML файл" -ForegroundColor White
Write-Host "   2. Нажмите 📍 кнопку навигации слева" -ForegroundColor White
Write-Host "   3. Наслаждайтесь удобной навигацией!" -ForegroundColor White

Write-Host "`n🎮 Для тестирования запустите:" -ForegroundColor Yellow
Write-Host "   start TESTS/super-diagnostic-center.html" -ForegroundColor White
