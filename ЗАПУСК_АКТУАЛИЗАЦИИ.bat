@echo off
REM 🚀 BATCH СКРИПТ ДЛЯ ЗАПУСКА СИСТЕМЫ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ HEYS

echo.
echo ========================================
echo 🔄 СИСТЕМА АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ HEYS
echo ========================================
echo.

REM Проверка наличия Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js не найден! Установите Node.js для продолжения.
    pause
    exit /b 1
)

REM Переход в рабочую директорию
cd /d "%~dp0"

REM Проверка наличия основных файлов системы
if not exist "docs\actualization-runner.js" (
    echo ❌ Основной файл системы не найден!
    echo 📂 Ожидается: docs\actualization-runner.js
    pause
    exit /b 1
)

if not exist "docs\dependencies.yaml" (
    echo ❌ Файл зависимостей не найден!
    echo 📂 Ожидается: docs\dependencies.yaml
    pause
    exit /b 1
)

REM Установка зависимостей если нужно
if not exist "node_modules\js-yaml" (
    echo 📦 Установка зависимостей...
    npm install js-yaml
    if errorlevel 1 (
        echo ❌ Ошибка установки зависимостей!
        pause
        exit /b 1
    )
)

echo 🔍 Проверка системы...
echo   ✅ Node.js обнаружен
echo   ✅ Основные файлы найдены
echo   ✅ Зависимости установлены
echo.

REM Меню выбора режима запуска
echo Выберите режим актуализации:
echo.
echo [1] 🔄 Полная актуализация (рекомендуется)
echo [2] 🗺️ Только навигационные карты
echo [3] 📝 Только документация
echo [4] 🧪 Только валидация
echo [5] 📊 Открыть панель управления
echo [6] 🔒 Создать backup
echo [0] ❌ Отмена
echo.

set /p choice="Введите номер [0-6]: "

if "%choice%"=="1" goto full_actualization
if "%choice%"=="2" goto nav_maps_only
if "%choice%"=="3" goto docs_only
if "%choice%"=="4" goto validation_only
if "%choice%"=="5" goto open_dashboard
if "%choice%"=="6" goto create_backup
if "%choice%"=="0" goto cancel
goto invalid_choice

:full_actualization
echo.
echo 🚀 Запуск полной актуализации...
echo ⚠️ Это может занять несколько минут.
echo.
pause
node docs\actualization-runner.js
goto end

:nav_maps_only
echo.
echo 🗺️ Обновление только навигационных карт...
node docs\actualization-runner.js --no-docs
goto end

:docs_only
echo.
echo 📝 Обновление только документации...
node docs\actualization-runner.js --no-nav-maps
goto end

:validation_only
echo.
echo 🧪 Запуск валидации системы...
node -e "
const ActualizationSystem = require('./docs/actualization-runner.js');
const system = new ActualizationSystem();
system.phase4_Validate().then(() => {
    console.log('✅ Валидация завершена');
}).catch(err => {
    console.error('❌ Ошибка валидации:', err.message);
});
"
goto end

:open_dashboard
echo.
echo 📊 Открытие панели управления...
if exist "docs\ui\actualization-dashboard.html" (
    start "" "docs\ui\actualization-dashboard.html"
    echo ✅ Панель управления открыта в браузере
) else (
    echo ❌ Панель управления не найдена!
    echo 📂 Ожидается: docs\ui\actualization-dashboard.html
)
goto end

:create_backup
echo.
echo 🔒 Создание backup критических файлов...
node -e "
const DocsBackupSystem = require('./docs/automation/backup-system.js');
const backup = new DocsBackupSystem();
backup.autoBackupCriticalFiles('manual_backup').then(results => {
    console.log('✅ Backup создан успешно');
    for (let result of results) {
        if (result.success) {
            console.log('  ✅', result.file);
        } else {
            console.log('  ❌', result.file, ':', result.error);
        }
    }
}).catch(err => {
    console.error('❌ Ошибка создания backup:', err.message);
});
"
goto end

:invalid_choice
echo.
echo ❌ Неверный выбор! Попробуйте еще раз.
echo.
goto menu

:cancel
echo.
echo ❌ Операция отменена.
goto end

:end
echo.
echo ========================================
echo 🏁 ОПЕРАЦИЯ ЗАВЕРШЕНА
echo ========================================
echo.

REM Показать краткую статистику
if exist "docs\DOCS_ACTUALIZATION_SYSTEM.md" (
    echo 📊 Текущая статистика:
    findstr /c:"Файлов обновлено:" "docs\DOCS_ACTUALIZATION_SYSTEM.md" 2>nul
    findstr /c:"Актуальность документации:" "docs\DOCS_ACTUALIZATION_SYSTEM.md" 2>nul
    findstr /c:"Обновлено:" "docs\DOCS_ACTUALIZATION_SYSTEM.md" 2>nul
    echo.
)

echo 💡 Полезные команды:
echo   📊 Панель управления: start docs\ui\actualization-dashboard.html
echo   🔒 Список backup'ов: node -e "const b=require('./docs/automation/backup-system.js'); new b().listBackups().then(console.log)"
echo   🔍 Проверка зависимостей: node -e "const d=require('./docs/automation/dependency-resolver.js'); new d().detectCircularDependencies().then(console.log)"
echo.

pause
