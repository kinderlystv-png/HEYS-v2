# 🗺️ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ HEYS
# Быстрый анализ больших файлов проекта

param(
    [string]$ProjectPath = ".",
    [int]$MinLines = 300
)

Write-Host "🗺️ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ HEYS" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

function Get-LargeFiles {
    param([string]$Path, [int]$MinLines)
    
    $extensions = @('.js', '.html', '.css', '.ts', '.jsx', '.tsx')
    $largeFiles = @()
    
    Get-ChildItem -Path $Path -Recurse -File | Where-Object {
        $_.Extension -in $extensions -and
        $_.Name -notlike "*.min.*" -and
        $_.Directory.Name -ne "node_modules"
    } | ForEach-Object {
        $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
        if ($lineCount -ge $MinLines) {
            $largeFiles += [PSCustomObject]@{
                Name = $_.Name
                Path = $_.FullName
                Lines = $lineCount
                Size = [math]::Round($_.Length / 1KB, 1)
                Extension = $_.Extension
            }
        }
    }
    
    return $largeFiles | Sort-Object Lines -Descending
}

function New-NavigationMap {
    param([string]$FilePath, [int]$TotalLines)
    
    $fileName = Split-Path $FilePath -Leaf
    $content = Get-Content $FilePath -Raw
    $lines = Get-Content $FilePath
    
    # Анализ структуры
    $functions = @()
    $classes = @()
    $sections = @()
    
    # Поиск функций
    $functionMatches = [regex]::Matches($content, 'function\s+(\w+)')
    foreach ($match in $functionMatches) {
        $lineIndex = ($content.Substring(0, $match.Index) -split "`n").Count
        $functions += [PSCustomObject]@{
            Name = $match.Groups[1].Value
            Line = $lineIndex
            Type = "function"
        }
    }
    
    # Поиск классов
    $classMatches = [regex]::Matches($content, 'class\s+(\w+)')
    foreach ($match in $classMatches) {
        $lineIndex = ($content.Substring(0, $match.Index) -split "`n").Count
        $classes += [PSCustomObject]@{
            Name = $match.Groups[1].Value
            Line = $lineIndex
            Type = "class"
        }
    }
    
    # Поиск секций (комментарии-разделители)
    $sectionMatches = [regex]::Matches($content, '//\s*[=\-]{3,}\s*(.+?)\s*[=\-]{3,}')
    foreach ($match in $sectionMatches) {
        $lineIndex = ($content.Substring(0, $match.Index) -split "`n").Count
        $sections += [PSCustomObject]@{
            Name = $match.Groups[1].Value.Trim()
            Line = $lineIndex
            Type = "section"
        }
    }
    
    # Создание карты
    $border = "─" * 85
    $map = @"
/*
┌$border┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА $fileName ($TotalLines строк)$(" " * [math]::Max(0, 85 - $fileName.Length - $TotalLines.ToString().Length - 45))│
├$border┤
│ 📋 СТРУКТУРА ФАЙЛА:$(" " * (85 - 20))│
│$(" " * 85)│
"@

    if ($sections.Count -gt 0) {
        $map += "`n│ 📋 СЕКЦИИ:$(" " * (85 - 11))│`n"
        foreach ($section in $sections) {
            $line = "│    ├── $($section.Name) (строка $($section.Line))"
            $padding = " " * [math]::Max(0, 85 - $line.Length + 4)
            $map += "$line$padding│`n"
        }
        $map += "│$(" " * 85)│`n"
    }
    
    if ($functions.Count -gt 0) {
        $map += "`n│ ⚙️ ФУНКЦИИ:$(" " * (85 - 12))│`n"
        foreach ($func in $functions) {
            $line = "│    ├── $($func.Name)() (строка $($func.Line))"
            $padding = " " * [math]::Max(0, 85 - $line.Length + 4)
            $map += "$line$padding│`n"
        }
        $map += "│$(" " * 85)│`n"
    }
    
    if ($classes.Count -gt 0) {
        $map += "`n│ 📦 КЛАССЫ:$(" " * (85 - 11))│`n"
        foreach ($class in $classes) {
            $line = "│    ├── $($class.Name) (строка $($class.Line))"
            $padding = " " * [math]::Max(0, 85 - $line.Length + 4)
            $map += "$line$padding│`n"
        }
        $map += "│$(" " * 85)│`n"
    }

    $map += @"
├$border┤
│ 🎯 БЫСТРЫЙ ПОИСК:$(" " * (85 - 18))│
│    • Найти функцию: Ctrl+F "function " + название$(" " * (85 - 52))│
│    • Найти класс: Ctrl+F "class " + название$(" " * (85 - 48))│
│    • Общий поиск: Ctrl+F + ключевое слово$(" " * (85 - 45))│
└$border┘
*/

"@

    return $map
}

# Основная логика
Write-Host "🔍 Сканирую проект: $ProjectPath" -ForegroundColor Yellow

$largeFiles = Get-LargeFiles -Path $ProjectPath -MinLines $MinLines

Write-Host "`n📊 НАЙДЕННЫЕ БОЛЬШИЕ ФАЙЛЫ:" -ForegroundColor Green
$largeFiles | Format-Table Name, Lines, Size, Extension -AutoSize

Write-Host "`n🗺️ СОЗДАНИЕ НАВИГАЦИОННЫХ КАРТ:" -ForegroundColor Cyan

foreach ($file in $largeFiles) {
    Write-Host "📄 Обрабатываю: $($file.Name)" -ForegroundColor Yellow
    
    try {
        $map = New-NavigationMap -FilePath $file.Path -TotalLines $file.Lines
        
        # Создаем резервную копию
        $backupPath = "$($file.Path).backup"
        if (-not (Test-Path $backupPath)) {
            Copy-Item $file.Path $backupPath
            Write-Host "   💾 Создана резервная копия" -ForegroundColor Gray
        }
        
        # Читаем оригинальный файл
        $originalContent = Get-Content $file.Path -Raw
        
        # Проверяем, есть ли уже карта
        if ($originalContent -match '/\*\s*┌.*?НАВИГАЦИОННАЯ КАРТА.*?┘\s*\*/') {
            Write-Host "   ⚠️ Карта уже существует, пропускаю" -ForegroundColor Yellow
        } else {
            # Добавляем карту в начало файла
            $newContent = $map + $originalContent
            Set-Content -Path $file.Path -Value $newContent -Encoding UTF8
            Write-Host "   ✅ Навигационная карта добавлена" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "   ❌ Ошибка: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n🎉 АНАЛИЗ ЗАВЕРШЕН!" -ForegroundColor Green
Write-Host "Обработано файлов: $($largeFiles.Count)" -ForegroundColor Cyan
Write-Host "Карты созданы для файлов больше $MinLines строк" -ForegroundColor Cyan
