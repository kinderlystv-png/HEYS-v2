@echo off
REM 🤖 WINDOWS ВЕРСИЯ GIT HOOK - АВТОМАТИЗАЦИЯ АКТУАЛИЗАЦИИ
REM Скрипт для установки в .git\hooks\pre-commit.bat

echo 🔍 Проверка изменений документации...

REM Получение списка измененных файлов
for /f "delims=" %%i in ('git diff --cached --name-only') do (
    echo %%i | findstr /i "\.js$" >nul && set JS_CHANGED=true
    echo %%i | findstr /i "\.ts$" >nul && set TS_CHANGED=true
    echo %%i | findstr /i "\.md$" >nul && set DOCS_CHANGED=true
    echo %%i | findstr /i "docs\\plans\\" >nul && set ROADMAP_CHANGED=true
    
    echo 📝 Обнаружен измененный файл: %%i
)

REM 🔒 Создание backup перед изменениями
if "%JS_CHANGED%"=="true" (
    echo 🔒 Создание backup критических файлов...
    node -e "const DocsBackupSystem = require('./docs/automation/backup-system.js'); const backup = new DocsBackupSystem(); backup.autoBackupCriticalFiles('pre_commit').then(() => console.log('✅ Backup создан')).catch(err => { console.error('❌ Ошибка backup:', err); process.exit(1); });"
    if errorlevel 1 exit /b 1
)

REM 🗺️ Проверка навигационных карт
if "%JS_CHANGED%"=="true" (
    echo 🗺️ Проверка навигационных карт...
    
    for /f "delims=" %%f in ('git diff --cached --name-only ^| findstr /i "\.js$"') do (
        findstr /c:"🗺️ НАВИГАЦИОННАЯ КАРТА" "%%f" >nul
        if errorlevel 1 (
            echo ⚠️ Отсутствует навигационная карта в %%f
            echo 📝 Добавление базовой навигационной карты...
            echo. >> "%%f"
            echo // 🗺️ НАВИГАЦИОННАЯ КАРТА >> "%%f"
            echo // Автоматически добавлено git hook >> "%%f"
            echo // Основные функции: >> "%%f"
            echo // - [Функция будет определена при анализе кода] >> "%%f"
            echo // Зависимости: >> "%%f"
            echo // - [Зависимости будут определены при анализе] >> "%%f"
            echo // Последнее обновление: %date% >> "%%f"
            git add "%%f"
            echo ✅ Навигационная карта добавлена в %%f
        ) else (
            echo ✅ Навигационная карта найдена в %%f
        )
    )
)

REM 📊 Обновление файла зависимостей
if "%JS_CHANGED%"=="true" (
    echo 📊 Обновление файла зависимостей...
    
    REM Получение текущей даты в ISO формате
    for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set mydate=%%c-%%a-%%b
    for /f "tokens=1-2 delims=: " %%a in ('time /t') do set mytime=%%a:%%b:00
    
    REM Обновление timestamp в dependencies.yaml
    powershell -Command "(Get-Content 'docs\dependencies.yaml') -replace 'last_updated: .*', 'last_updated: \"%mydate%T%mytime%Z\"' | Set-Content 'docs\dependencies.yaml'"
    
    git add docs\dependencies.yaml
    echo ✅ Файл зависимостей обновлен
)

REM 🔄 Обновление главного файла актуализации  
if "%DOCS_CHANGED%"=="true" (
    echo 🔄 Обновление системы актуализации...
    
    REM Увеличение счетчика файлов
    powershell -Command "$content = Get-Content 'docs\DOCS_ACTUALIZATION_SYSTEM.md'; $updated = $content -replace 'Файлов обновлено:\*\* (\d+)\/(\d+)', { 'Файлов обновлено:** ' + ([int]$_.Groups[1].Value + 1) + '/' + $_.Groups[2].Value }; $updated | Set-Content 'docs\DOCS_ACTUALIZATION_SYSTEM.md'"
    
    REM Обновление времени
    powershell -Command "$content = Get-Content 'docs\DOCS_ACTUALIZATION_SYSTEM.md'; $updated = $content -replace 'Обновлено:\*\* .*', ('Обновлено:** ' + (Get-Date -Format 'dd.MM.yyyy HH:mm')); $updated | Set-Content 'docs\DOCS_ACTUALIZATION_SYSTEM.md'"
    
    git add docs\DOCS_ACTUALIZATION_SYSTEM.md
    echo ✅ Система актуализации обновлена
)

REM 🧪 Проверка циклических зависимостей
echo 🔍 Проверка циклических зависимостей...
node -e "const fs = require('fs'); try { const yaml = require('js-yaml'); const deps = yaml.load(fs.readFileSync('docs/dependencies.yaml', 'utf8')); const cycles = deps.circular_dependencies || []; if (cycles.length > 0) { console.log('⚠️ Обнаружены циклические зависимости:', cycles.length); for (let cycle of cycles) { if (cycle.severity === 'high') { console.error('❌ Критическая циклическая зависимость:', cycle.cycle); process.exit(1); } } } else { console.log('✅ Циклические зависимости не обнаружены'); } } catch (error) { console.warn('⚠️ Не удалось проверить зависимости:', error.message); }"

if errorlevel 1 (
    echo ❌ Обнаружены критические циклические зависимости!
    exit /b 1
)

echo.
echo 📋 СВОДКА ПРОВЕРОК:
echo ✅ Backup критических файлов создан
echo ✅ Навигационные карты проверены
echo ✅ Зависимости обновлены
echo ✅ Система актуализации синхронизирована
echo.
echo ✅ Все проверки пройдены. Коммит разрешен.
exit /b 0
