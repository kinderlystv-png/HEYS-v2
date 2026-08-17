# psql.ps1 — Windows wrapper: Lockbox password + bundled psql (repo tools/pgsql).
# НЕ используй PG_PASSWORD из yandex-cloud-functions/.env — там часто placeholder/устаревший hash.
#
#   pwsh scripts/db/psql.ps1 -c "SELECT count(*) FROM mcp_call_events;"
#   pwsh scripts/db/psql.ps1 -f scripts/db/audit-clients.sql

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PsqlArgs
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$PsqlBin = Join-Path $Root 'tools\pgsql\pgsql\bin\psql.exe'
$CertPath = Join-Path $Root 'yandex-cloud-functions\certs\root.crt'
$LockboxId = if ($env:HEYS_PG_LOCKBOX_ID) { $env:HEYS_PG_LOCKBOX_ID } else { 'e6qr1rm1hm2n9a2pmsnl' }

if (-not (Test-Path $PsqlBin)) {
  Write-Error "psql не найден: $PsqlBin. Распакуй postgresql-*-windows-x64-binaries.zip в tools/pgsql (см. scripts/db/README.md)."
}

$payload = yc lockbox payload get --id $LockboxId --format json | ConvertFrom-Json
$pwdEntry = $payload.entries | Where-Object { $_.key -eq 'postgresql_password' } | Select-Object -First 1
if (-not $pwdEntry) {
  Write-Error "postgresql_password не найден в Lockbox $LockboxId"
}

$env:PGPASSWORD = $pwdEntry.text_value
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $CertPath

$conn = 'host=rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net port=6432 dbname=heys_production user=heys_admin sslmode=verify-full'

& $PsqlBin $conn @PsqlArgs
