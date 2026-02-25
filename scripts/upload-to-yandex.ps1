#!/usr/bin/env pwsh
# Upload script for Yandex Object Storage (PowerShell version)
# Mirrors the CI deploy-yandex.yml golden standard caching strategy:
#   - Gzipped bundles: .gz uploaded AS .js with Content-Encoding: gzip (78% savings)
#   - Immutable assets: 1-year cache
#   - Mutable JS (heys_*.js): max-age=0, must-revalidate
#   - Entry points (index.html, sw.js): max-age=0, must-revalidate
param(
    [string]$distDir = "C:\Users\Ant\HEYS-v2\apps\web\dist",
    [string]$bucket = "heys-app"
)

function Get-ContentType([string]$fileName) {
    if ($fileName -like "*.html") { return "text/html; charset=utf-8" }
    if ($fileName -like "*.css") { return "text/css; charset=utf-8" }
    if ($fileName -like "*.js") { return "application/javascript" }
    if ($fileName -like "*.json") { return "application/json" }
    if ($fileName -like "*.svg") { return "image/svg+xml" }
    if ($fileName -like "*.png") { return "image/png" }
    if ($fileName -like "*.jpg") { return "image/jpeg" }
    if ($fileName -like "*.jpeg") { return "image/jpeg" }
    if ($fileName -like "*.webp") { return "image/webp" }
    if ($fileName -like "*.woff2") { return "font/woff2" }
    if ($fileName -like "*.woff") { return "font/woff" }
    return "application/octet-stream"
}

function Get-CacheControl([string]$key) {
    # Hashed bundles = immutable (1 year)
    if ($key -match '\.bundle\.\w+\.js$') { return "public, max-age=31536000, immutable" }
    # Mutable JS files (heys_*.js, react-bundle.js) = must-revalidate
    if ($key -match '^heys_.*\.js$') { return "public, max-age=0, must-revalidate" }
    if ($key -eq 'react-bundle.js') { return "public, max-age=0, must-revalidate" }
    # Entry points = must-revalidate
    if ($key -match '^(index\.html|sw\.js|version\.json|manifest\.(json|webmanifest))$') {
        return "public, max-age=0, must-revalidate"
    }
    # Everything else (images, fonts, assets/) = immutable
    return "public, max-age=31536000, immutable"
}

$totalUploaded = 0
$errors = 0
$totalRaw = 0
$totalGz = 0

# ===================================================================
# STEP 1: Gzipped bundles - upload .gz AS .js with Content-Encoding: gzip
# This is the critical step that provides 78% transfer savings.
# ===================================================================
Write-Host "`n[GZIP] STEP 1: Uploading gzipped bundles with Content-Encoding: gzip..."
$gzFiles = Get-ChildItem "$distDir\*.bundle.*.js.gz" -ErrorAction SilentlyContinue
$gzFiles += Get-ChildItem "$distDir\react-bundle.js.gz" -ErrorAction SilentlyContinue
$gzUploaded = 0

foreach ($gz in $gzFiles) {
    $jsName = $gz.Name -replace '\.gz$', ''
    $rawPath = Join-Path $distDir $jsName
    $cacheControl = Get-CacheControl $jsName

    if (Test-Path $rawPath) {
        $rawSize = (Get-Item $rawPath).Length
        $gzSize = $gz.Length
        $pct = [math]::Round(100 - ($gzSize / $rawSize * 100))
        $totalRaw += $rawSize
        $totalGz += $gzSize
        $rawKB = [math]::Round($rawSize / 1024)
        $gzKB = [math]::Round($gzSize / 1024)
        $idx = $gzUploaded + 1
        $cnt = $gzFiles.Count
        Write-Host "  [$idx/$cnt] $jsName (${rawKB}KB -> ${gzKB}KB, ${pct}% saved)"
    }
    else {
        $idx = $gzUploaded + 1
        $cnt = $gzFiles.Count
        Write-Host "  [$idx/$cnt] $jsName (gz only)"
    }

    $result = yc storage s3api put-object --bucket $bucket --key $jsName --body $gz.FullName `
        --acl public-read --content-type "application/javascript" `
        --content-encoding "gzip" --cache-control $cacheControl 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "FAILED: $jsName - $result"
        $errors++
    }
    $gzUploaded++
    $totalUploaded++
}

if ($totalRaw -gt 0) {
    $totalPct = [math]::Round(100 - ($totalGz / $totalRaw * 100))
    $trKB = [math]::Round($totalRaw / 1024)
    $tgKB = [math]::Round($totalGz / 1024)
    Write-Host "  OK: $gzUploaded gzipped bundles (${trKB}KB -> ${tgKB}KB, ${totalPct}% saved)"
}

# ===================================================================
# STEP 2: All other files (skip raw .js that have .gz versions, skip .gz files)
# ===================================================================
Write-Host "`n[FILES] STEP 2: Uploading remaining files..."
# Build a set of files that were already uploaded via gzip
$gzippedJsNames = @{}
foreach ($gz in $gzFiles) {
    $jsName = $gz.Name -replace '\.gz$', ''
    $gzippedJsNames[$jsName] = $true
}

$files = Get-ChildItem -Recurse -File $distDir
$step2Count = 0

foreach ($f in $files) {
    $key = $f.FullName.Replace("$distDir\", "").Replace("\", "/")
    $fileName = $f.Name

    # Skip .gz files (already processed in step 1)
    if ($fileName -like "*.gz") { continue }

    # Skip raw .js files that have gzipped versions (uploaded in step 1)
    if ($gzippedJsNames.ContainsKey($fileName)) { continue }

    $ct = Get-ContentType $fileName
    $cc = Get-CacheControl $key
    $step2Count++
    Write-Host "  [$step2Count] $key"
    $result = yc storage s3api put-object --bucket $bucket --key $key --body $f.FullName `
        --acl public-read --content-type $ct --cache-control $cc 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "FAILED: $key - $result"
        $errors++
    }
    $totalUploaded++
}

Write-Host ""
Write-Host "=== DONE: $totalUploaded files uploaded, $errors errors ==="
Write-Host "    Gzipped bundles: $gzUploaded (Content-Encoding: gzip)"
Write-Host "    Other files: $step2Count"
