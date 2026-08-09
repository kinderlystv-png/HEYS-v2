#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# push-and-watch.sh — ручной push + deploy-watch helper.
# ════════════════════════════════════════════════════════════════════
#
# Делает:
#   1. git push origin <branch>
#   2. находит run по headSha своего коммита (не «последний по ветке») и ждёт,
#      пока Deploy to Yandex Cloud станет зелёным — exit 0
#   3. если workflow красный или таймаут — exit 1 (не отдаёт управление
#      пока не подтвердит deploy)
#
# Зачем: я (Claude) минимум 3 раза в одной сессии забывал проверить, что
# CI deploy прошёл после push. CI падал на whats-new check, прод оставался
# на старой версии, юзер тратил время на ручную проверку. Этот скрипт
# делает чек обязательным — невозможно "забыть посмотреть actions".
#
# Usage:
#   bash scripts/push-and-watch.sh --confirm-push              # main, default workflow
#   bash scripts/push-and-watch.sh --confirm-push main         # explicit branch
#   WORKFLOW="API Health Monitor" bash scripts/push-and-watch.sh --confirm-push
#
# Exit codes:
#   0 — push прошёл + deploy зелёный
#   1 — push прошёл, но deploy упал или не нашёлся (требует ручной
#       проверки whats-new entry или другой блокировки)
#   2 — git push сам провалился (pre-push hook блокировка и т.д.)
# ════════════════════════════════════════════════════════════════════

set -uo pipefail

CONFIRM_PUSH=0
BRANCH="main"
for arg in "$@"; do
  case "$arg" in
    --confirm-push) CONFIRM_PUSH=1 ;;
    -*) echo "Unknown flag: $arg"; exit 2 ;;
    *) BRANCH="$arg" ;;
  esac
done

if [ "$CONFIRM_PUSH" != "1" ] && [ "${HEYS_CONFIRM_PUSH:-}" != "1" ]; then
  echo "❌ push-and-watch requires explicit --confirm-push."
  echo "   This script runs git push and watches production deploy."
  echo "   Preview/check first via: pnpm push:agent -- --print-command"
  exit 2
fi

WORKFLOW="${WORKFLOW:-Deploy to Yandex Cloud}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-900}"  # 15 минут на deploy

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 git push origin $BRANCH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! git push origin "$BRANCH"; then
  echo ""
  echo "❌ git push провалился. Скорее всего pre-push hook (whats-new,"
  echo "   lint-direct-localstorage-writes, или другой). Исправь и повтори."
  exit 2
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏳ Watching latest \"$WORKFLOW\" run for branch $BRANCH..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ждём run именно для своего коммита, а не «последний по ветке».
#
# Инцидент 2026-08-09: скрипт брал --limit 1 сразу после пятисекундной паузы.
# Новый run тогда ещё стоял в очереди, последним числился прошлый деплой —
# давно завершённый успехом. gh run watch мгновенно вернул success, скрипт
# напечатал «Deploy зелёный. Прод обновлён», хотя выкладка даже не начиналась.
# Это худший из возможных отказов для скрипта, вся задача которого — не дать
# уйти с непроверенным деплоем: он не молчит, а уверенно подтверждает неправду.
#
# Поэтому сверяем headSha и ждём появления run, а не берём того, кто оказался
# сверху. Не нашли за отведённое время — честно говорим, что не подтвердили.
PUSHED_SHA=$(git rev-parse HEAD)
DISCOVERY_TIMEOUT="${DISCOVERY_TIMEOUT:-180}"

echo "🔎 Ищу run для коммита ${PUSHED_SHA:0:9} (до ${DISCOVERY_TIMEOUT}s)..."

RUN_ID=""
WAITED=0
while [ "$WAITED" -lt "$DISCOVERY_TIMEOUT" ]; do
  RUN_ID=$(gh run list --workflow="$WORKFLOW" --branch="$BRANCH" --limit 20 \
    --json databaseId,headSha \
    -q "[.[] | select(.headSha == \"$PUSHED_SHA\")] | .[0].databaseId" 2>/dev/null || echo "")
  [ "$RUN_ID" = "null" ] && RUN_ID=""
  [ -n "$RUN_ID" ] && break
  sleep 5
  WAITED=$((WAITED + 5))
done

if [ -z "$RUN_ID" ]; then
  echo ""
  echo "⚠️  За ${DISCOVERY_TIMEOUT}s не появился run \"$WORKFLOW\" для ${PUSHED_SHA:0:9}."
  echo "    ДЕПЛОЙ НЕ ПОДТВЕРЖДЁН — не считай выложенным."
  echo "    Возможные причины:"
  echo "      • push ничего не отправил (ветка уже была актуальна)"
  echo "      • workflow не запускается на изменённые пути"
  echo "      • очередь GitHub Actions дольше обычного — проверь вручную:"
  echo "        gh run list --workflow=\"$WORKFLOW\" --branch=$BRANCH --limit 5"
  echo "      • опечатка в имени workflow"
  exit 1
fi

echo "📋 Run ID: $RUN_ID"
echo "🔗 URL: $(gh run view $RUN_ID --json url -q '.url')"
echo ""

# gh run watch блокирует пока workflow завершится; --exit-status даёт ненулевой
# код если статус != success. --interval 20 чтобы поллить не слишком часто.
if gh run watch "$RUN_ID" --exit-status --interval 20 --compact 2>&1; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Deploy зелёный. Прод обновлён."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  EXIT_CODE=$?
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ Deploy провалился (exit $EXIT_CODE)."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Логи фейла:"
  echo "  gh run view $RUN_ID --log-failed"
  echo ""
  echo "Частые причины:"
  echo "  • whats-new entry отсутствует для current commit (fix/feat тип)"
  echo "    → добавь entry в apps/web/public/whats-new.json,"
  echo "      затем chore(release) commit + повторный push-and-watch"
  echo "  • test failure"
  echo "  • Yandex Cloud creds problem"
  exit 1
fi
