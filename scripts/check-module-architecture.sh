#!/usr/bin/env bash
# =============================================================================
# 🏗️ HEYS Module Architecture Checker
# =============================================================================
# Проверяет модули на соответствие архитектурным ограничениям:
#   - LOC ≤ 2000 (строки кода)
#   - Функции ≤ 80
#   - HEYS.* ссылки ≤ 50
#
# Использование:
#   ./scripts/check-module-architecture.sh              # Проверить staged файлы
#   ./scripts/check-module-architecture.sh --all        # Проверить все модули
#   ./scripts/check-module-architecture.sh file.js      # Проверить конкретный файл
# =============================================================================

set -e

# Цвета для вывода
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Лимиты
LOC_LIMIT=2000
LOC_WARNING=1500
FUNC_LIMIT=80
FUNC_WARNING=60
HEYS_REF_LIMIT=50
HEYS_REF_WARNING=40

# Счётчики
ERRORS=0
WARNINGS=0

# =============================================================================
# 🏛️ LEGACY ALLOWLIST — файлы исключённые из строгих проверок
# =============================================================================
# Эти файлы превышают лимиты, но рефакторинг планируется постепенно.
# Для них показываем только warnings, не блокируем коммит.
# Удаляй файлы из списка по мере их рефакторинга!
# =============================================================================
LEGACY_ALLOWLIST=(
    "heys_app_v12.js"       # 8400+ LOC — главный модуль, рефакторинг в процессе
    "heys_day_v12.js"       # 6400+ LOC — день/статистика, планируется разбиение
    "heys_day_utils.js"     # 1800+ LOC — утилиты дня (извлечено из day_v12)
    "heys_core_v12.js"      # Продукты/поиск, legacy
    "heys_user_v12.js"      # Профиль, legacy
    "heys_reports_v12.js"   # Отчёты, legacy
)

# =============================================================================
# Функции анализа
# =============================================================================

is_legacy_file() {
    local file="$1"
    local basename=$(basename "$file")
    
    for legacy in "${LEGACY_ALLOWLIST[@]}"; do
        if [ "$basename" = "$legacy" ]; then
            return 0  # true - это legacy файл
        fi
    done
    return 1  # false - обычный файл
}

count_loc() {
    local file="$1"
    wc -l < "$file" | tr -d ' '
}

count_functions() {
    local file="$1"
    # Считаем: function declarations, arrow functions, method definitions
    grep -cE '(function\s+\w+|function\s*\(|=>\s*\{|\w+\s*\([^)]*\)\s*\{)' "$file" 2>/dev/null || echo 0
}

count_heys_refs() {
    local file="$1"
    grep -oE 'HEYS\.[a-zA-Z_]+' "$file" 2>/dev/null | wc -l | tr -d ' '
}

has_warn_missing() {
    local file="$1"
    grep -qE 'warnMissing|warn_missing' "$file" 2>/dev/null
}

# =============================================================================
# Рекомендации
# =============================================================================

print_recommendations() {
    local file="$1"
    local loc="$2"
    local funcs="$3"
    local refs="$4"
    local has_fallback="$5"
    
    echo ""
    echo -e "${CYAN}📋 РЕКОМЕНДАЦИИ для ${BOLD}$(basename "$file")${NC}"
    echo ""
    
    # LOC рекомендации
    if [ "$loc" -gt "$LOC_LIMIT" ]; then
        echo -e "${BOLD}🎯 QUICK WIN (LOC = $loc):${NC}"
        echo "   • Выдели утилитарные функции в отдельный файл *_utils.js"
        echo "   • React компоненты → отдельный *_components.js"
        echo "   • Константы/конфиги → *_config.js"
        echo ""
        echo -e "${BOLD}📈 СТРАТЕГИЧЕСКОЕ:${NC}"
        echo "   • Разбей модуль по доменам (UI / бизнес-логика / данные)"
        echo "   • Создай sub-modules в папке с именем модуля"
        echo "   • Используй фасад-паттерн: главный файл только re-export'ит"
    elif [ "$loc" -gt "$LOC_WARNING" ]; then
        echo -e "${BOLD}⚡ QUICK WIN (LOC = $loc, близко к лимиту):${NC}"
        echo "   • Вынеси самые длинные функции (>50 строк) в helpers"
        echo "   • Перенеси inline JSX в отдельные компоненты"
    fi
    
    # Functions рекомендации
    if [ "$funcs" -gt "$FUNC_LIMIT" ]; then
        echo ""
        echo -e "${BOLD}🎯 QUICK WIN (функций = $funcs):${NC}"
        echo "   • Сгруппируй похожие функции в объект-namespace"
        echo "   • Приватные helpers → вложенный модуль"
        echo ""
        echo -e "${BOLD}📈 СТРАТЕГИЧЕСКОЕ:${NC}"
        echo "   • Проведи аудит: какие функции НЕ экспортируются?"
        echo "   • Неэкспортируемые helpers → отдельный internal.js"
        echo "   • Используй composition вместо множества мелких функций"
    elif [ "$funcs" -gt "$FUNC_WARNING" ]; then
        echo ""
        echo -e "${BOLD}⚡ QUICK WIN (функций = $funcs, близко к лимиту):${NC}"
        echo "   • Объедини однотипные функции в одну с параметром"
        echo "   • Вынеси валидаторы/форматтеры в shared utils"
    fi
    
    # HEYS refs рекомендации
    if [ "$refs" -gt "$HEYS_REF_LIMIT" ]; then
        echo ""
        echo -e "${BOLD}🎯 QUICK WIN (HEYS.* = $refs ссылок):${NC}"
        echo "   • Кэшируй частые обращения: const { utils, store } = HEYS"
        echo "   • Передавай зависимости параметрами в функции"
        echo ""
        echo -e "${BOLD}📈 СТРАТЕГИЧЕСКОЕ:${NC}"
        echo "   • Внедри Dependency Injection в init()"
        echo "   • Создай локальные алиасы в начале модуля"
        echo "   • Пересмотри архитектуру: возможно модуль делает слишком много"
    elif [ "$refs" -gt "$HEYS_REF_WARNING" ]; then
        echo ""
        echo -e "${BOLD}⚡ QUICK WIN (HEYS.* = $refs, близко к лимиту):${NC}"
        echo "   • В начале модуля: const U = HEYS.utils, S = HEYS.store"
        echo "   • Группируй обращения к одному namespace"
    fi
    
    # warnMissing рекомендации
    if [ "$has_fallback" = "true" ]; then
        echo ""
        echo -e "${BOLD}🚨 КРИТИЧНО (warnMissing паттерн найден):${NC}"
        echo "   • Замени на явную проверку в init():"
        echo "     ${YELLOW}if (!HEYS.YandexAPI) throw new Error('YandexAPI required');${NC}"
        echo "   • Это quick win — займёт 5-10 минут"
    fi
    
    echo ""
    echo -e "${BLUE}📚 Документация: docs/dev/MODULE_ARCHITECTURE.md${NC}"
    echo ""
}

# =============================================================================
# Проверка файла
# =============================================================================

check_file() {
    local file="$1"
    local show_recommendations="${2:-true}"
    
    # Пропускаем не-JS файлы
    if [[ ! "$file" =~ \.(js|ts|jsx|tsx)$ ]]; then
        return 0
    fi
    
    # Пропускаем node_modules, dist, archive
    if [[ "$file" =~ (node_modules|dist|archive|\.min\.) ]]; then
        return 0
    fi
    
    # Пропускаем тесты
    if [[ "$file" =~ \.(test|spec)\. ]]; then
        return 0
    fi
    
    local loc=$(count_loc "$file")
    local funcs=$(count_functions "$file")
    local refs=$(count_heys_refs "$file")
    local has_fallback="false"
    local is_legacy="false"
    
    # Проверяем legacy allowlist
    if is_legacy_file "$file"; then
        is_legacy="true"
    fi
    
    if has_warn_missing "$file"; then
        has_fallback="true"
    fi
    
    local status="✅"
    local issues=""
    
    # Проверяем лимиты (для legacy — только warnings, не errors)
    if [ "$loc" -gt "$LOC_LIMIT" ]; then
        if [ "$is_legacy" = "true" ]; then
            status="🏛️"  # Legacy icon
            issues+="LOC=$loc (legacy) "
            ((WARNINGS++))
        else
            status="❌"
            issues+="LOC=$loc>$LOC_LIMIT "
            ((ERRORS++))
        fi
    elif [ "$loc" -gt "$LOC_WARNING" ]; then
        if [ "$status" != "❌" ] && [ "$status" != "🏛️" ]; then status="⚠️"; fi
        issues+="LOC=$loc "
        ((WARNINGS++))
    fi
    
    if [ "$funcs" -gt "$FUNC_LIMIT" ]; then
        if [ "$is_legacy" = "true" ]; then
            if [ "$status" != "🏛️" ]; then status="🏛️"; fi
            issues+="funcs=$funcs (legacy) "
            ((WARNINGS++))
        else
            status="❌"
            issues+="funcs=$funcs>$FUNC_LIMIT "
            ((ERRORS++))
        fi
    elif [ "$funcs" -gt "$FUNC_WARNING" ]; then
        if [ "$status" != "❌" ] && [ "$status" != "🏛️" ]; then status="⚠️"; fi
        issues+="funcs=$funcs "
        ((WARNINGS++))
    fi
    
    if [ "$refs" -gt "$HEYS_REF_LIMIT" ]; then
        if [ "$is_legacy" = "true" ]; then
            if [ "$status" != "🏛️" ]; then status="🏛️"; fi
            issues+="HEYS.*=$refs (legacy) "
            ((WARNINGS++))
        else
            status="❌"
            issues+="HEYS.*=$refs>$HEYS_REF_LIMIT "
            ((ERRORS++))
        fi
    elif [ "$refs" -gt "$HEYS_REF_WARNING" ]; then
        if [ "$status" != "❌" ] && [ "$status" != "🏛️" ]; then status="⚠️"; fi
        issues+="HEYS.*=$refs "
        ((WARNINGS++))
    fi
    
    # warnMissing всегда ошибка (даже для legacy)
    if [ "$has_fallback" = "true" ]; then
        status="❌"
        issues+="warnMissing! "
        ((ERRORS++))
    fi
    
    # Выводим результат
    if [ "$status" != "✅" ] || [ "$VERBOSE" = "true" ]; then
        printf "%s %-50s LOC:%-5s funcs:%-3s HEYS.*:%-3s" \
            "$status" "$(basename "$file")" "$loc" "$funcs" "$refs"
        
        if [ -n "$issues" ]; then
            echo -e " ${RED}← $issues${NC}"
        else
            echo ""
        fi
        
        # Показываем рекомендации только для проблемных файлов
        if [ "$status" = "❌" ] && [ "$show_recommendations" = "true" ]; then
            print_recommendations "$file" "$loc" "$funcs" "$refs" "$has_fallback"
        fi
    fi
    
    # Возвращаем код ошибки если есть критические проблемы
    if [ "$status" = "❌" ]; then
        return 1
    fi
    return 0
}

# =============================================================================
# Главная логика
# =============================================================================

main() {
    echo ""
    echo -e "${BOLD}🏗️  HEYS Module Architecture Check${NC}"
    echo -e "   Лимиты: LOC≤$LOC_LIMIT | funcs≤$FUNC_LIMIT | HEYS.*≤$HEYS_REF_LIMIT"
    echo ""
    
    local files=()
    local check_all=false
    local has_errors=false
    
    # Парсим аргументы
    for arg in "$@"; do
        case "$arg" in
            --all|-a)
                check_all=true
                ;;
            --verbose|-v)
                VERBOSE=true
                ;;
            --help|-h)
                echo "Использование:"
                echo "  $0              # Проверить staged файлы"
                echo "  $0 --all        # Проверить все heys_*.js модули"
                echo "  $0 file.js      # Проверить конкретный файл"
                echo "  $0 --verbose    # Показать все файлы (не только проблемные)"
                exit 0
                ;;
            *)
                if [ -f "$arg" ]; then
                    files+=("$arg")
                fi
                ;;
        esac
    done
    
    # Определяем файлы для проверки
    if [ "$check_all" = true ]; then
        # Все heys_*.js модули в apps/web
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find apps/web -name "heys_*.js" -type f -print0 2>/dev/null)
    elif [ ${#files[@]} -eq 0 ]; then
        # Staged файлы
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                files+=("$file")
            fi
        done < <(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
    fi
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ Нет файлов для проверки${NC}"
        exit 0
    fi
    
    echo -e "${BLUE}Проверяю ${#files[@]} файл(ов)...${NC}"
    echo ""
    
    # Проверяем каждый файл
    for file in "${files[@]}"; do
        if ! check_file "$file"; then
            has_errors=true
        fi
    done
    
    # Итоговый статус
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ $ERRORS -gt 0 ]; then
        echo -e "${RED}❌ БЛОК: $ERRORS критических нарушений${NC}"
        echo -e "   Коммит заблокирован. Исправьте проблемы выше."
        echo ""
        echo -e "${YELLOW}💡 Быстрое решение:${NC}"
        echo "   git commit --no-verify  # Пропустить проверку (НЕ рекомендуется)"
        echo ""
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  $WARNINGS предупреждений (близко к лимитам)${NC}"
        echo "   Коммит разрешён, но рекомендуется рефакторинг."
        exit 0
    else
        echo -e "${GREEN}✅ Все проверки пройдены!${NC}"
        exit 0
    fi
}

main "$@"
