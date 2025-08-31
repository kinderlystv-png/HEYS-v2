@echo off
chcp 65001 >nul
echo.
echo 🗺️ АВТОМАТИЧЕСКОЕ ВНЕДРЕНИЕ НАВИГАЦИОННЫХ КАРТ HEYS
echo =====================================================
echo.

powershell -ExecutionPolicy Bypass -File "TOOLS\Update-AllNavigationMaps.ps1"

echo.
echo 🎪 Готово! Откройте super-diagnostic-center.html для проверки
echo.
pause
