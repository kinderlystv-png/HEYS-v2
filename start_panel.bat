@echo off
setlocal

echo 🚀 Запуск HEYS приложения...
echo 📊 Сервер будет доступен на http://127.0.0.1:8000

REM Запускаем HTTP сервер
start "" python -m http.server 8000 --bind 127.0.0.1

REM Ждем пока сервер запустится
timeout /t 2 >nul

REM URL основного приложения
set URL=http://127.0.0.1:8000/index.html

REM Ищем Chrome
set CHR=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHR=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHR=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM Открываем основное приложение
if defined CHR (
    echo 🌐 Открываем HEYS в Chrome...
    start "" "%CHR%" --new-window --incognito "%URL%"
) else (
    echo 🌐 Открываем HEYS в браузере по умолчанию...
    start "" chrome --new-window --incognito "%URL%"
    if errorlevel 1 start "" "%URL%"
)

echo.
echo ✅ HEYS приложение запущено!
echo 📋 URL: %URL%
echo 🔧 Для остановки сервера закройте это окно

endlocal
pause
