# Простой генератор навигационных карт
param(
    [string]$ProjectPath = ".",
    [int]$MinLines = 400
)

Write-Host "🗺️ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ HEYS" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$extensions = @('.js', '.html', '.css', '.ts')
$largeFiles = Get-ChildItem -Path $ProjectPath -Recurse -File | Where-Object {
    $_.Extension -in $extensions -and
    $_.Name -notlike "*.min.*" -and
    $_.Directory.Name -ne "node_modules"
} | ForEach-Object {
    $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
    if ($lineCount -ge $MinLines) {
        [PSCustomObject]@{
            Name = $_.Name
            Path = $_.FullName
            Lines = $lineCount
            Size = [math]::Round($_.Length / 1KB, 1)
        }
    }
} | Sort-Object Lines -Descending

Write-Host "`n📊 НАЙДЕННЫЕ БОЛЬШИЕ ФАЙЛЫ:" -ForegroundColor Green
$largeFiles | Format-Table Name, Lines, Size -AutoSize

Write-Host "`nВсего найдено больших файлов: $($largeFiles.Count)" -ForegroundColor Yellow

foreach ($file in $largeFiles) {
    Write-Host "`n📄 $($file.Name) - $($file.Lines) строк" -ForegroundColor Cyan
    
    # Анализ содержимого
    $content = Get-Content $file.Path -Raw
    
    # Поиск функций
    $functions = [regex]::Matches($content, 'function\s+(\w+)') | ForEach-Object {
        $lineIndex = ($content.Substring(0, $_.Index) -split "`n").Count
        "$($_.Groups[1].Value) (строка $lineIndex)"
    }
    
    # Поиск классов
    $classes = [regex]::Matches($content, 'class\s+(\w+)') | ForEach-Object {
        $lineIndex = ($content.Substring(0, $_.Index) -split "`n").Count
        "$($_.Groups[1].Value) (строка $lineIndex)"
    }
    
    if ($functions.Count -gt 0) {
        Write-Host "  ⚙️ Функции: $($functions.Count)" -ForegroundColor Green
        $functions | Select-Object -First 5 | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
    }
    
    if ($classes.Count -gt 0) {
        Write-Host "  📦 Классы: $($classes.Count)" -ForegroundColor Green
        $classes | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }
    }
}
}
