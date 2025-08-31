@echo off
REM Version bump script for HEYS documentation (Windows)
if "%1"=="" (
  echo Usage: %0 ^<new_version^>
  echo Example: %0 1.4.0
  exit /b 1
)

set NEW_VER=%1
for /f "tokens=2 delims==" %%i in ('wmic OS Get localdatetime /value') do set "dt=%%i"
set DATE=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%

echo Updating version tracker...
powershell -Command "(Get-Content docs\.update_tracker.yml) -replace 'version: .*', 'version: %NEW_VER%' | Set-Content docs\.update_tracker.yml"
powershell -Command "(Get-Content docs\.update_tracker.yml) -replace 'date: .*', 'date: %DATE%' | Set-Content docs\.update_tracker.yml"

echo Updating version references in documentation...
for /r docs %%f in (*.md) do (
  powershell -Command "(Get-Content '%%f') -replace '{{version}}', '%NEW_VER%' | Set-Content '%%f'"
)

echo Version updated to %NEW_VER% successfully!
echo Don't forget to commit changes: git add . && git commit -m "Version bump to %NEW_VER%"
