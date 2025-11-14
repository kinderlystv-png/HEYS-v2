# Preview Build Script for HEYS Mobile
Write-Host "=== HEYS Mobile - Preview APK Build ===" -ForegroundColor Cyan
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Yellow

# Ensure we're in the mobile app directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Switched to: $(Get-Location)" -ForegroundColor Green
Write-Host ""
Write-Host "Starting EAS Build (preview profile)..." -ForegroundColor Cyan
Write-Host "This will create an APK for internal testing" -ForegroundColor Gray
Write-Host ""

# Run EAS build with preview profile
eas build --profile preview --platform android

$ExitCode = $LASTEXITCODE
Write-Host ""
if ($ExitCode -eq 0) {
    Write-Host "Build command completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Build command failed with exit code: $ExitCode" -ForegroundColor Red
}

exit $ExitCode
