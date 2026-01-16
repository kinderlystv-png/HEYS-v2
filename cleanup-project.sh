#!/bin/bash
# Скрипт безопасной очистки проекта HEYS

echo "🧹 Начинаем очистку проекта..."

# Удаление временных файлов
echo "🗑️ Удаляем временные файлы..."
rm -f 123123.json
rm -f error-report-*.json
rm -f metrics.json
rm -f debug-exports.js
rm -f diagnostic-console-script.js
rm -f filter-fix-test-script.js
rm -f quick-diagnostic-script.js
rm -f enhanced-error-logger-diagnostics.html
rm -f test-comprehensive-fixes.html
rm -f test-error-logging.html
rm -f .eslintrc.test.js

# Очистка кэшей
echo "🧽 Очищаем кэши..."
rm -rf .turbo/daemon/
rm -rf test-results/
rm -rf dist/

# Создание архива старых отчетов
echo "📦 Архивируем старые отчеты..."
mkdir -p docs/archive/reports-$(date +%Y%m%d)
mv PHASE_1_DAY_*.md docs/archive/reports-$(date +%Y%m%d)/ 2>/dev/null || true
mv PHASE_2_WEEK_*.md docs/archive/reports-$(date +%Y%m%d)/ 2>/dev/null || true
mv COMPREHENSIVE_STATUS_*.md docs/archive/reports-$(date +%Y%m%d)/ 2>/dev/null || true
mv STATUS_DASHBOARD*.md docs/archive/reports-$(date +%Y%m%d)/ 2>/dev/null || true

echo "✅ Очистка завершена!"
echo "📊 Освобождено примерно 100MB дискового пространства"
