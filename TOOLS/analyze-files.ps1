# Анализатор больших файлов проекта HEYS
param([string]$Path = ".", [int]$MinLines = 400)

Write-Host "Анализ больших файлов в проекте HEYS" -ForegroundColor Cyan

$files = Get-ChildItem -Path $Path -Recurse -Include "*.js","*.html","*.css","*.ts" | 
    Where-Object { $_.Name -notlike "*.min.*" } |
    ForEach-Object {
        $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
        if ($lineCount -ge $MinLines) {
            [PSCustomObject]@{
                Name = $_.Name
                Lines = $lineCount
                Size = [math]::Round($_.Length / 1KB, 1)
                Path = $_.FullName
            }
        }
    } | Sort-Object Lines -Descending

Write-Host "`nНайдено больших файлов: $($files.Count)" -ForegroundColor Green
$files | Format-Table Name, Lines, Size -AutoSize

Write-Host "`nЭти файлы нуждаются в навигационных картах для удобной навигации." -ForegroundColor Yellow
