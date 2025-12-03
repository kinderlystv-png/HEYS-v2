#!/bin/bash
# css-audit.sh — Аудит CSS метрик для HEYS
# Использование: pnpm css:audit

CSS_DIR="apps/web/styles/modules"
TOTAL_LINES=0
TOTAL_IMPORTANT=0
TOTAL_KEYFRAMES=0

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    HEYS CSS AUDIT REPORT                      ║"
echo "║                    $(date '+%Y-%m-%d %H:%M')                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

printf "%-40s %8s %10s %10s\n" "Module" "Lines" "!important" "@keyframes"
echo "────────────────────────────────────────────────────────────────────"

for f in "$CSS_DIR"/*.css; do
    filename=$(basename "$f")
    lines=$(wc -l < "$f" | tr -d ' ')
    important=$(grep -c '!important' "$f" 2>/dev/null || echo "0")
    keyframes=$(grep -c '@keyframes' "$f" 2>/dev/null || echo "0")
    
    # Убираем переводы строк
    important=$(echo "$important" | tr -d '\n')
    keyframes=$(echo "$keyframes" | tr -d '\n')
    
    printf "%-40s %8s %10s %10s\n" "$filename" "$lines" "$important" "$keyframes"
    
    TOTAL_LINES=$((TOTAL_LINES + lines))
    TOTAL_IMPORTANT=$((TOTAL_IMPORTANT + important))
    TOTAL_KEYFRAMES=$((TOTAL_KEYFRAMES + keyframes))
done

echo "────────────────────────────────────────────────────────────────────"
printf "%-40s %8s %10s %10s\n" "TOTAL" "$TOTAL_LINES" "$TOTAL_IMPORTANT" "$TOTAL_KEYFRAMES"
echo ""

# Проверка дублей селекторов (топ-10)
echo "🔍 Потенциальные дубли селекторов (топ-10):"
echo "────────────────────────────────────────────────────────────────────"
grep -h '^\.' "$CSS_DIR"/*.css 2>/dev/null | \
    sed 's/{.*//' | \
    sed 's/,.*//' | \
    tr -d ' ' | \
    sort | uniq -c | sort -rn | head -10 | \
    while read count selector; do
        if [ "$count" -gt 1 ]; then
            printf "  %3s × %s\n" "$count" "$selector"
        fi
    done

echo ""
echo "✅ Аудит завершён. Сохрани эти метрики перед рефакторингом!"
