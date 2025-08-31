# ┌─────────────────────────────────────────────────────────────────────────────────────────┐
# │ 🔧 АВТОМАТИЧЕСКИЙ ГЕНЕРАТОР ЯКОРЕЙ - PowerShell Script                                 │
# └─────────────────────────────────────────────────────────────────────────────────────────┘

param(
    [string]$Path = ".",           # Путь для обработки
    [switch]$DryRun = $false,      # Только показать, что будет сделано
    [switch]$Force = $false,       # Обработать даже маленькие файлы
    [switch]$Interactive = $false   # Интерактивный режим
)

Write-Host "🔧 АВТОМАТИЧЕСКИЙ ГЕНЕРАТОР ЯКОРЕЙ" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Gray

# Проверяем наличие Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js найден: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js не найден! Установите Node.js для работы генератора." -ForegroundColor Red
    exit 1
}

# Создаем временный файл для запуска генератора
$tempScript = @"
const { AutoAnchorGenerator } = require('./TOOLS/auto-anchor-generator.js');
const fs = require('fs').promises;
const path = require('path');

async function main() {
    const generator = new AutoAnchorGenerator();
    const targetPath = process.argv[2] || '.';
    const options = {
        dryRun: process.argv.includes('--dry-run'),
        force: process.argv.includes('--force'),
        interactive: process.argv.includes('--interactive')
    };

    console.log('🎯 Цель:', targetPath);
    console.log('⚙️ Режим:', options.dryRun ? 'Предварительный просмотр' : 'Реальная обработка');
    console.log('');

    try {
        const stats = await fs.stat(targetPath);
        
        if (stats.isDirectory()) {
            console.log('📁 Обработка директории...');
            const results = await generator.processDirectory(targetPath, options);
            
            let totalChanges = 0;
            results.forEach(result => {
                if (result.changes && result.changes.length > 0) {
                    console.log(`  ✅ ${'$'}{result.file}: ${'$'}{result.changes.length} якорей`);
                    totalChanges += result.changes.length;
                } else if (result.error) {
                    console.log(`  ❌ ${'$'}{result.file}: ошибка`);
                } else {
                    console.log(`  ⏩ ${'$'}{result.file}: пропущен`);
                }
            });
            
            console.log('');
            console.log(`🎉 Итого: ${'$'}{totalChanges} якорей добавлено в ${'$'}{results.length} файлах`);
            
        } else {
            console.log('📄 Обработка файла...');
            const result = await generator.processFile(targetPath, options);
            
            if (result.changes && result.changes.length > 0) {
                console.log(`✅ Добавлено якорей: ${'$'}{result.changes.length}`);
                result.changes.forEach(change => {
                    console.log(`  • Строка ${'$'}{change.line}: ${'$'}{change.anchor.split('\n')[0]}`);
                });
            } else {
                console.log('⏩ Файл не изменен');
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
}

main();
"@

$tempFile = "temp-anchor-generator.js"
$tempScript | Out-File -FilePath $tempFile -Encoding UTF8

# Формируем аргументы для Node.js
$nodeArgs = @($tempFile, $Path)
if ($DryRun) { $nodeArgs += "--dry-run" }
if ($Force) { $nodeArgs += "--force" }
if ($Interactive) { $nodeArgs += "--interactive" }

Write-Host "🚀 Запуск генератора..." -ForegroundColor Yellow
Write-Host ""

try {
    # Запускаем генератор
    & node @nodeArgs
    
    Write-Host ""
    Write-Host "✅ Генератор завершил работу!" -ForegroundColor Green
    
    if ($DryRun) {
        Write-Host "💡 Это был предварительный просмотр. Для реальной обработки запустите без -DryRun" -ForegroundColor Cyan
    }
    
}
catch {
    Write-Host "❌ Ошибка выполнения: $_" -ForegroundColor Red
}
finally {
    # Удаляем временный файл
    if (Test-Path $tempFile) {
        Remove-Item $tempFile -Force
    }
}

Write-Host ""
Write-Host "📖 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ:" -ForegroundColor Cyan
Write-Host "  .\Add-Anchors.ps1                    # Обработать текущую папку" -ForegroundColor Gray
Write-Host "  .\Add-Anchors.ps1 -Path .\src        # Обработать папку src" -ForegroundColor Gray
Write-Host "  .\Add-Anchors.ps1 -DryRun            # Только посмотреть изменения" -ForegroundColor Gray
Write-Host "  .\Add-Anchors.ps1 -Force             # Обработать даже маленькие файлы" -ForegroundColor Gray
Write-Host ""
Write-Host "🔗 Якорная навигация готова к использованию!" -ForegroundColor Green
