# Локальные CLI для prod Postgres и MCP-телеметрии на Windows.
#   pwsh scripts/db/setup-windows-tools.ps1
#
# Ставит:
#   - tools/pgsql/pgsql/bin/psql.exe  (не в git, см. .gitignore)
#   - jq через scoop (если scoop есть и jq ещё нет)
#
# Нужно: yc (Lockbox), сеть. zip/7z — для распаковки (scoop 7z обычно есть).

param(
  [string]$PgVersion = '16.15-1'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$ToolsDir = Join-Path $Root 'tools\pgsql'
$PsqlBin = Join-Path $ToolsDir 'pgsql\bin\psql.exe'
$ZipUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PgVersion-windows-x64-binaries.zip"

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Expand-ZipTo($ZipPath, $DestDir) {
  if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
  }
  if (Test-Command Expand-Archive) {
    Expand-Archive -Path $ZipPath -DestinationPath $DestDir -Force
    return
  }
  if (Test-Command 7z) {
    & 7z x $ZipPath "-o$DestDir" -y | Out-Null
    return
  }
  throw 'Нужен Expand-Archive (PowerShell 5+) или 7z в PATH (scoop install 7zip).'
}

Write-Host "HEYS Windows DB tools setup"
Write-Host "  repo: $Root"

# --- psql ---
if (Test-Path $PsqlBin) {
  Write-Host "[ok] psql уже есть: $PsqlBin"
} else {
  Write-Host "[..] скачиваю PostgreSQL binaries $PgVersion ..."
  $tmpZip = Join-Path $env:TEMP "heys-postgresql-$PgVersion-binaries.zip"
  Invoke-WebRequest -Uri $ZipUrl -OutFile $tmpZip -UseBasicParsing
  if (-not (Test-Path $tmpZip) -or (Get-Item $tmpZip).Length -lt 1MB) {
    throw "Скачивание не удалось или файл слишком маленький: $ZipUrl"
  }
  if (Test-Path $ToolsDir) {
    Remove-Item -Recurse -Force $ToolsDir
  }
  New-Item -ItemType Directory -Path $ToolsDir -Force | Out-Null
  Expand-ZipTo $tmpZip $ToolsDir
  Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $PsqlBin)) {
    throw "После распаковки нет $PsqlBin — проверь структуру zip."
  }
  Write-Host "[ok] psql: $PsqlBin"
}

# --- jq (deploy-all.sh читает env функций через yc | jq) ---
if (Test-Command jq) {
  Write-Host "[ok] jq: $(Get-Command jq | Select-Object -ExpandProperty Source)"
} elseif (Test-Command scoop) {
  Write-Host "[..] jq не найден — ставлю через scoop ..."
  & scoop install jq
  if (-not (Test-Path (Join-Path $env:USERPROFILE 'scoop\shims\jq.exe'))) {
    throw 'scoop install jq не дал jq.exe в shims'
  }
  Write-Host "[ok] jq установлен через scoop"
} else {
  Write-Host "[!!] jq нет и scoop нет — для deploy: scoop install jq или choco install jq"
}

# --- smoke ---
Write-Host "[..] smoke: SELECT 1 через psql.ps1 ..."
& (Join-Path $PSScriptRoot 'psql.ps1') -c 'SELECT 1 AS ok;'
if ($LASTEXITCODE -ne 0) {
  throw 'psql.ps1 smoke failed (нужен yc + Lockbox)'
}
Write-Host "[ok] prod Postgres доступен"

Write-Host ""
Write-Host "Готово. Примеры:"
Write-Host "  pwsh scripts/db/psql.ps1 -c `"SELECT count(*) FROM mcp_call_events;`""
Write-Host "  node scripts/mcp-stats.mjs --days 7"
