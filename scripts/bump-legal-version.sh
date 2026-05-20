#!/usr/bin/env bash
# Бамп версии legal-документа: копирует свежий docs/legal/<doc>.md
# и в версионированный снимок (apps/web/public/docs/v<X>/), и в текущую
# копию (apps/web/public/docs/<doc>.md), которую приложение раздаёт юзерам.
#
# Перед запуском (вручную):
#   1. Обновить текст в docs/legal/<doc>.md.
#   2. Если меняются цены — обновить apps/landing/src/config/pricing.ts.
#      check-pricing-sync.cjs ругнётся при коммите, если они разошлись.
#
# Usage:
#   ./scripts/bump-legal-version.sh <doc> <new-version>
# Example:
#   ./scripts/bump-legal-version.sh user-agreement v1.6
#   ./scripts/bump-legal-version.sh privacy-policy 1.6   # 'v' опционален

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOC="${1:-}"
NEW_VERSION="${2:-}"

if [[ -z "$DOC" || -z "$NEW_VERSION" ]]; then
  echo "Usage: $0 <doc> <new-version>"
  echo "Example: $0 user-agreement v1.6"
  exit 1
fi

# Принимаем и 'v1.6', и '1.6' — нормализуем в 'v1.6'
if [[ "$NEW_VERSION" != v* ]]; then
  NEW_VERSION="v$NEW_VERSION"
fi

SRC="$ROOT/docs/legal/$DOC.md"
DEST_VERSIONED="$ROOT/apps/web/public/docs/$NEW_VERSION/$DOC.md"
DEST_CURRENT="$ROOT/apps/web/public/docs/$DOC.md"

if [[ ! -f "$SRC" ]]; then
  echo "❌ Не найден исходник: $SRC"
  exit 1
fi

if [[ -f "$DEST_VERSIONED" ]]; then
  echo "❌ Снимок $DEST_VERSIONED уже существует."
  echo "   Версионированные снапшоты замораживаются для пользователей, акцептовавших ту версию."
  echo "   Если действительно нужно переписать — удалите файл вручную."
  exit 1
fi

# Не пропускаем рассинхрон цен внутрь замороженного снимка
echo "→ Проверяю синхронизацию цен..."
node "$ROOT/scripts/check-pricing-sync.cjs"

# Защита от потери прошлой версии: текущая копия должна совпадать хотя бы с
# одним существующим снимком v<X>/. Иначе её перезапись = потеря осиротевшего
# хвоста (кто-то правил docs/legal/ между бампами без снапшота).
if [[ -f "$DEST_CURRENT" ]]; then
  match_found=0
  shopt -s nullglob
  for snap in "$ROOT/apps/web/public/docs"/v*/"$DOC.md"; do
    if cmp -s "$DEST_CURRENT" "$snap"; then
      match_found=1
      break
    fi
  done
  shopt -u nullglob
  if [[ "$match_found" = 0 ]]; then
    echo "❌ $DEST_CURRENT не совпадает ни с одним снимком v<X>/$DOC.md."
    echo "   Это значит, прошлую версию забыли заснапшотить — её перезапись потеряет хвост."
    echo "   Решение: либо вручную скопируйте $DEST_CURRENT в v<OLD>/, либо подтвердите потерю,"
    echo "   удалив $DEST_CURRENT перед повторным запуском."
    exit 1
  fi
fi

mkdir -p "$(dirname "$DEST_VERSIONED")"

echo "→ Копирую $SRC"
echo "   → $DEST_VERSIONED  (новый замороженный снимок)"
cp "$SRC" "$DEST_VERSIONED"

echo "   → $DEST_CURRENT  (актуальная копия для приложения)"
cp "$SRC" "$DEST_CURRENT"

# kebab-case → camelCase для подсказки про legal-versions.ts
DOC_KEY=$(echo "$DOC" | awk -F'-' '{for(i=2;i<=NF;i++)$i=toupper(substr($i,1,1))substr($i,2)}1' OFS='')

cat <<EOF

✅ Готово.

Что осталось руками (за один коммит):
  1. apps/landing/src/config/legal-versions.ts → LEGAL_DOCS.${DOC_KEY}:
       version: '${NEW_VERSION#v}'
       effectiveDate: '<сегодняшняя дата на русском>'
       lastUpdated:   '<сегодняшняя дата на русском>'
  2. git add docs/legal/${DOC}.md \\
             apps/web/public/docs/${NEW_VERSION}/${DOC}.md \\
             apps/web/public/docs/${DOC}.md \\
             apps/landing/src/config/legal-versions.ts \\
             $([ "$DOC" = "user-agreement" ] && echo "apps/landing/src/config/pricing.ts \\")
EOF
