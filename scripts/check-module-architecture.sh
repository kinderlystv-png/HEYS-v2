#!/usr/bin/env bash
# =============================================================================
# 🏗️ HEYS Module Architecture Checker
# =============================================================================
# Проверяет модули на соответствие архитектурным ограничениям:
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

# Лимиты (дефолтные)
LOC_LIMIT=2000
LOC_WARNING=1500
FUNC_LIMIT=80
FUNC_WARNING=60
HEYS_REF_LIMIT=50
HEYS_REF_WARNING=40

# Конфиг автолимитов
LIMITS_CONFIG="config/module-limits.json"
LIMITS_MAP_FILE=""

# Счётчики
ERRORS=0
WARNINGS=0

# =============================================================================
# 🧩 Автолимиты для legacy-модулей
# =============================================================================
# Если существует config/module-limits.json, подхватываем:
#  - дефолтные лимиты
#  - индивидуальные лимиты на файл (relative path)
# =============================================================================

if [ -f "$LIMITS_CONFIG" ]; then
        eval "$(node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('$LIMITS_CONFIG','utf8')); const def=data.defaults||{}; const loc=def.loc||{}; const funcs=def.functions||{}; const refs=def.heysRefs||{}; const out=[
            'LOC_LIMIT='+(loc.error ?? 2000),
            'LOC_WARNING='+(loc.warn ?? 1500),
            'FUNC_LIMIT='+(funcs.error ?? 80),
            'FUNC_WARNING='+(funcs.warn ?? 60),
            'HEYS_REF_LIMIT='+(refs.error ?? 50),
            'HEYS_REF_WARNING='+(refs.warn ?? 40)
        ]; console.log(out.join('\\n'));")"

        LIMITS_MAP_FILE=$(mktemp)
        node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('$LIMITS_CONFIG','utf8')); const def=data.defaults||{}; const loc=def.loc||{}; const funcs=def.functions||{}; const refs=def.heysRefs||{}; const files=data.files||{}; for (const [name, payload] of Object.entries(files)) { const limits=payload.limits||{}; const locL=limits.loc||{}; const funcL=limits.functions||{}; const refL=limits.heysRefs||{}; const line=[
            name,
            (locL.warn ?? loc.warn ?? 1500),
            (locL.error ?? loc.error ?? 2000),
            (funcL.warn ?? funcs.warn ?? 60),
            (funcL.error ?? funcs.error ?? 80),
            (refL.warn ?? refs.warn ?? 40),
            (refL.error ?? refs.error ?? 50)
        ].join('|'); console.log(line); }" > "$LIMITS_MAP_FILE"
fi

cleanup_limits_map() {
        if [ -n "$LIMITS_MAP_FILE" ] && [ -f "$LIMITS_MAP_FILE" ]; then
                rm -f "$LIMITS_MAP_FILE"
        fi
}

trap cleanup_limits_map EXIT

# =============================================================================
# Функции анализа
# =============================================================================

get_limits_for_file() {
    local file="$1"
    local relpath
    relpath=$(node -e "const path=require('path'); const p=path.relative(process.cwd(), '$file').split(path.sep).join('/'); process.stdout.write(p);")
    local loc_warning="$LOC_WARNING"
    local loc_limit="$LOC_LIMIT"
    local func_warning="$FUNC_WARNING"
    local func_limit="$FUNC_LIMIT"
    local refs_warning="$HEYS_REF_WARNING"
    local refs_limit="$HEYS_REF_LIMIT"

    if [ -n "$LIMITS_MAP_FILE" ] && [ -f "$LIMITS_MAP_FILE" ]; then
        local line
        line=$(grep -m 1 "^${relpath}|" "$LIMITS_MAP_FILE" || true)
        if [ -n "$line" ]; then
            IFS='|' read -r _ loc_warning loc_limit func_warning func_limit refs_warning refs_limit <<< "$line"
        fi
    fi

    echo "${loc_warning}|${loc_limit}|${func_warning}|${func_limit}|${refs_warning}|${refs_limit}"
}

get_metrics() {
    local file="$1"
    node scripts/arch-metrics.js --file "$file" --metric all 2>/dev/null || echo "0|0|0"
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
    
    local metrics
    metrics=$(get_metrics "$file")
    IFS='|' read -r loc funcs refs <<< "$metrics"
    local has_fallback="false"
    local limits
    limits=$(get_limits_for_file "$file")
    IFS='|' read -r loc_warning loc_limit func_warning func_limit refs_warning refs_limit <<< "$limits"
    
    if has_warn_missing "$file"; then
        has_fallback="true"
    fi
    
    local status="✅"
    local issues=""
    
    # Проверяем лимиты
    if [ "$funcs" -gt "$func_limit" ]; then
        status="❌"
        issues+="funcs=$funcs>$func_limit "
        ((ERRORS++))
    elif [ "$funcs" -gt "$func_warning" ]; then
        if [ "$status" != "❌" ]; then status="⚠️"; fi
        issues+="funcs=$funcs "
        ((WARNINGS++))
    fi
    
    if [ "$refs" -gt "$refs_limit" ]; then
        status="❌"
        issues+="HEYS.*=$refs>$refs_limit "
        ((ERRORS++))
    elif [ "$refs" -gt "$refs_warning" ]; then
        if [ "$status" != "❌" ]; then status="⚠️"; fi
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
    echo -e "   Лимиты: funcs≤$FUNC_LIMIT (warn:$FUNC_WARNING) | HEYS.*≤$HEYS_REF_LIMIT (warn:$HEYS_REF_WARNING)"
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
        echo "   git commit --no-verify  # Только с явного разрешения пользователя"
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
