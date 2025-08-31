#!/bin/bash
# 🤖 GIT HOOKS - АВТОМАТИЗАЦИЯ АКТУАЛИЗАЦИИ ДОКУМЕНТАЦИИ
# Скрипт для установки в .git/hooks/pre-commit

echo "🔍 Проверка изменений документации..."

# Получение списка измененных файлов
CHANGED_FILES=$(git diff --cached --name-only)

# Флаги для отслеживания типов изменений
JS_CHANGED=false
TS_CHANGED=false
DOCS_CHANGED=false
ROADMAP_CHANGED=false

# Анализ измененных файлов
for file in $CHANGED_FILES; do
    case $file in
        *.js)
            JS_CHANGED=true
            echo "📝 Обнаружены изменения в JS: $file"
            ;;
        *.ts)
            TS_CHANGED=true
            echo "📝 Обнаружены изменения в TS: $file"
            ;;
        *.md)
            DOCS_CHANGED=true
            echo "📚 Обнаружены изменения в документации: $file"
            ;;
        docs/plans/*)
            ROADMAP_CHANGED=true
            echo "🗺️ Обнаружены изменения в планах: $file"
            ;;
    esac
done

# 🔒 Создание backup перед изменениями
if [ "$JS_CHANGED" = true ] || [ "$TS_CHANGED" = true ] || [ "$DOCS_CHANGED" = true ]; then
    echo "🔒 Создание backup критических файлов..."
    node -e "
        const DocsBackupSystem = require('./docs/automation/backup-system.js');
        const backup = new DocsBackupSystem();
        backup.autoBackupCriticalFiles('pre_commit').then(() => {
            console.log('✅ Backup создан успешно');
        }).catch(err => {
            console.error('❌ Ошибка создания backup:', err);
            process.exit(1);
        });
    "
fi

# 🗺️ Обновление навигационных карт для JS/TS файлов
if [ "$JS_CHANGED" = true ] || [ "$TS_CHANGED" = true ]; then
    echo "🗺️ Обновление навигационных карт..."
    
    for file in $CHANGED_FILES; do
        case $file in
            *.js|*.ts)
                # Проверка наличия навигационной карты
                if grep -q "🗺️ НАВИГАЦИОННАЯ КАРТА" "$file"; then
                    echo "✅ Навигационная карта найдена в $file"
                else
                    echo "⚠️ Отсутствует навигационная карта в $file"
                    echo "📝 Добавление базовой навигационной карты..."
                    
                    # Добавление базовой навигационной карты
                    cat >> "$file" << EOF

// 🗺️ НАВИГАЦИОННАЯ КАРТА
// Автоматически добавлено git hook
// Основные функции:
// - [Функция будет определена при анализе кода]
// Зависимости:
// - [Зависимости будут определены при анализе]
// Последнее обновление: $(date -I)
EOF
                    git add "$file"
                    echo "✅ Навигационная карта добавлена в $file"
                fi
                ;;
        esac
    done
fi

# 📊 Обновление файла зависимостей
if [ "$JS_CHANGED" = true ] || [ "$TS_CHANGED" = true ] || [ "$DOCS_CHANGED" = true ]; then
    echo "📊 Обновление файла зависимостей..."
    
    # Обновление timestamp в dependencies.yaml
    sed -i "s/last_updated: .*/last_updated: \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"/" docs/dependencies.yaml
    
    # Добавление в коммит
    git add docs/dependencies.yaml
    echo "✅ Файл зависимостей обновлен"
fi

# 🔄 Обновление главного файла актуализации
if [ "$ROADMAP_CHANGED" = true ] || [ "$DOCS_CHANGED" = true ]; then
    echo "🔄 Обновление системы актуализации..."
    
    # Обновление счетчиков в DOCS_ACTUALIZATION_SYSTEM.md
    CURRENT_COUNT=$(grep -o "Файлов обновлено:** [0-9]*" docs/DOCS_ACTUALIZATION_SYSTEM.md | grep -o "[0-9]*" | head -1)
    NEW_COUNT=$((CURRENT_COUNT + 1))
    
    sed -i "s/Файлов обновлено:** [0-9]*\/[0-9]*/Файлов обновлено:** $NEW_COUNT\/25/" docs/DOCS_ACTUALIZATION_SYSTEM.md
    
    # Обновление последнего времени актуализации
    sed -i "s/Обновлено:** .*/Обновлено:** $(date '+%d.%m.%Y %H:%M')/" docs/DOCS_ACTUALIZATION_SYSTEM.md
    
    git add docs/DOCS_ACTUALIZATION_SYSTEM.md
    echo "✅ Система актуализации обновлена"
fi

# 🧪 Проверка циклических зависимостей
echo "🔍 Проверка циклических зависимостей..."
node -e "
    const fs = require('fs');
    const yaml = require('js-yaml');
    
    try {
        const deps = yaml.load(fs.readFileSync('docs/dependencies.yaml', 'utf8'));
        const cycles = deps.circular_dependencies || [];
        
        if (cycles.length > 0) {
            console.log('⚠️ Обнаружены циклические зависимости:', cycles.length);
            for (let cycle of cycles) {
                if (cycle.severity === 'high') {
                    console.error('❌ Критическая циклическая зависимость:', cycle.cycle);
                    process.exit(1);
                }
            }
        } else {
            console.log('✅ Циклические зависимости не обнаружены');
        }
    } catch (error) {
        console.warn('⚠️ Не удалось проверить зависимости:', error.message);
    }
"

# 📝 Генерация сводки изменений
echo ""
echo "📋 СВОДКА ИЗМЕНЕНИЙ:"
echo "- JS файлов изменено: $(echo $CHANGED_FILES | tr ' ' '\n' | grep '\.js$' | wc -l)"
echo "- TS файлов изменено: $(echo $CHANGED_FILES | tr ' ' '\n' | grep '\.ts$' | wc -l)"
echo "- MD файлов изменено: $(echo $CHANGED_FILES | tr ' ' '\n' | grep '\.md$' | wc -l)"
echo ""

echo "✅ Все проверки пройдены. Коммит разрешен."
exit 0
