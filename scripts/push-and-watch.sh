#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# push-and-watch.sh — ручной push + deploy-watch helper.
# ════════════════════════════════════════════════════════════════════
#
# Делает:
#   1. git push origin <branch>
#   2. ждёт пока Deploy to Yandex Cloud workflow для свежего push'а станет
#      зелёным — exit 0
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

# GitHub API нужно ~3-5 сек чтобы зарегистрировать новый run после push
sleep 5

RUN_ID=$(gh run list --workflow="$WORKFLOW" --branch="$BRANCH" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || echo "")

if [ -z "$RUN_ID" ]; then
  echo ""
  echo "⚠️  Не нашёл свежий run для workflow \"$WORKFLOW\" на ветке $BRANCH."
  echo "    Возможные причины:"
  echo "      • workflow ещё не зарегистрировался — подожди и проверь:"
  echo "        gh run list --workflow=\"$WORKFLOW\" --branch=$BRANCH --limit 1"
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
