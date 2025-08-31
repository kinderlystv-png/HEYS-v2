@echo off
setlocal

echo 🏥 Запуск HEYS echo.
echo ✅ HEYS SUPERSYecho 🎯 Доступные функции:
echo   • 🗺️ Управление дорожными картами
echo   • 📋 Создание и планирование задач
echo   • 📊 Экспорт подробных отчетов
echo   • 📝 Автоматическая актуализация документов
echo   • 🔒 Система backup и rollback
echo   • 🚀 Полная диагностика (27 тестов всех систем)
echo   • ⚡ Критические тесты (6 основных систем)  
echo   • 🔮 Современные технологии (6 новых модулей)пущен с тремя вкладками!
echo 🗺️ Система дорожных карт: %ROADMAPS_URL%
echo 🔄 Панель актуализации документации: %ACTUALIZATION_URL%
echo 🏥 Диагностический центр: %DIAGNOSTIC_URL%
echo.
echo 🎯 Доступные функции:
echo   • 🗺️ СИСТЕМА ДОРОЖНЫХ КАРТ:
echo     - 🗺️ Управление дорожными картами
echo     - 📋 Создание и планирование задач
echo     - 📊 Экспорт подробных отчетов
echo   • 🔄 ПАНЕЛЬ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ:
echo     - 📝 Автоматическая актуализация документов
echo     - 🗺️ Управление навигационными картами
echo     - 🔒 Система backup и rollback
echo     - 📊 Мониторинг зависимостей
echo   • 🏥 ДИАГНОСТИЧЕСКИЙ ЦЕНТР:
echo     - 🚀 Полная диагностика (27 тестов всех систем)
echo     - ⚡ Критические тесты (6 основных систем)  
echo     - 🔮 Современные технологии (6 новых модулей)
echo     - 📊 Real-time мониторинг производительностиSTIC CENTER...
echo 📊 Сервер будет доступен на http://127.0.0.1:8000

REM Запускаем HTTP сервер
start "" python -m http.server 8000 --bind 127.0.0.1

REM Ждем пока сервер запустится
timeout /t 3 >nul

REM URLs для открытия
set DIAGNOSTIC_URL=http://127.0.0.1:8000/TESTS/super-diagnostic-center.html
set ROADMAPS_URL=http://127.0.0.1:8000/TESTS/ROADMAPS_SUPERSYSTEM.html
set ACTUALIZATION_URL=http://127.0.0.1:8000/docs/ui/actualization-dashboard.html

REM Ищем Chrome
set CHR=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHR=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHR=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM Открываем все три файла в разных вкладках
if defined CHR (
    echo �️ Открываем ROADMAPS SUPERSYSTEM...
    start "" "%CHR%" --new-window --incognito "%ROADMAPS_URL%"
    timeout /t 2 >nul
    echo � Открываем ПАНЕЛЬ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ...
    start "" "%CHR%" --incognito "%ACTUALIZATION_URL%"
    timeout /t 2 >nul
    echo � Открываем HEYS SUPER DIAGNOSTIC CENTER в Chrome...
    start "" "%CHR%" --incognito "%DIAGNOSTIC_URL%"
) else (
    echo �️ Открываем ROADMAPS SUPERSYSTEM...
    start "" "%ROADMAPS_URL%"
    timeout /t 2 >nul
    echo � Открываем ПАНЕЛЬ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ...
    start "" "%ACTUALIZATION_URL%"
    timeout /t 2 >nul
    echo � Открываем HEYS SUPER DIAGNOSTIC CENTER в браузере по умолчанию...
    start "" "%DIAGNOSTIC_URL%"
)

echo.
echo ✅ HEYS SUPERSYSTEM запущен!
echo 🗺️ Система дорожных карт: %ROADMAPS_URL%
echo 🔄 Панель актуализации документации: %ACTUALIZATION_URL%
echo 🏥 Диагностический центр: %DIAGNOSTIC_URL%
echo.
echo 🎯 Доступные функции:
echo   • 🚀 Полная диагностика (27 тестов всех систем)
echo   • ⚡ Критические тесты (6 основных систем)  
echo   • 🔮 Современные технологии (6 новых модулей)
echo   • �️ Управление дорожными картами
echo   • 📋 Создание и планирование задач
echo   • �📊 Экспорт подробных отчетов
echo   • 🌐 Детальная информация об окружении
echo   • 📋 Система логирования в реальном времени
echo.
echo 🔧 Для остановки сервера закройте это окно

endlocal
pause
