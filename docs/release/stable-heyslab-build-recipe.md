# stable.heyslab.ru — рецепт пересборки

> **Не prod.** Бакет `stable-heyslab-ru`, хост `stable.heyslab.ru`. Эталон UI
> заморожен на линии git `36df9ce3` (2026-08-11). Пересборка из текущего `main`
> уничтожает эталон — **запрещено**.

## Когда нужен этот файл

Cherry-pick readonly-коммитов на `36df9ce3` **конфликтует** (`index.html`,
`000-base-and-gamification.css`). Одной командой не повторяется — только этот
рецепт.

## Что лежит на копии сейчас (после consent-readonly, 2026-08-12)

| Поле                                | Значение                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| База UI                             | git `36df9ce3`                                                                                              |
| Patches                             | `d75ec593d` readonly, `3d1904513` write-context RPC, `4a7ced768` consent gate, `00c443259` readonly round 2 |
| `boot-app.bundle`                   | `526ae52da151.js`                                                                                           |
| `version.json` → `hash`             | `36df9ce3` (линия эталона)                                                                                  |
| `version.json` → `stableRebuild.id` | `consent-readonly-20260812`                                                                                 |

## Пошагово

```bash
REPO=/path/to/HEYS-v2
WT=/tmp/heys-stable-build-$$
BASE=36df9ce3
BUCKET=stable-heyslab-ru
ENDPOINT=https://storage.yandexcloud.net

cd "$REPO"
git worktree add "$WT" "$BASE"
cd "$WT"

# 1. Patches (cherry-pick d75ec593d конфликтует — копируем файлы с main)
#
# index.html — НЕ целиком из d75ec593d: там v4/theme-ссылки, которых нет в
# эталоне 36df9ce3. Берём базовый index и вставляем только READONLY_MODE-блок
# (см. apps/web/index.html строки ~107–122 в main).
git show 36df9ce3:apps/web/index.html > apps/web/index.html
# …вручную вставить READONLY_MODE <script> после DEMO_MODE-блока…
git show d75ec593d:apps/web/heys_app_shell_v1.js > apps/web/heys_app_shell_v1.js
git show d75ec593d:apps/web/heys_storage_supabase_v1.js > apps/web/heys_storage_supabase_v1.js
git show d75ec593d:apps/web/styles/modules/000-base-and-gamification.css > apps/web/styles/modules/000-base-and-gamification.css
git show 3d1904513:apps/web/heys_yandex_api_v1.js > apps/web/heys_yandex_api_v1.js
# consent + readonly round 2 — подставить актуальный commit с main:
git show 00c443259:apps/web/heys_app_derived_state_v1.js > apps/web/heys_app_derived_state_v1.js
git show 00c443259:apps/web/heys_app_root_impl_v1.js > apps/web/heys_app_root_impl_v1.js
git show 00c443259:apps/web/heys_app_gate_flow_v1.js > apps/web/heys_app_gate_flow_v1.js
git show 00c443259:apps/web/heys_app_shell_v1.js > apps/web/heys_app_shell_v1.js
git show 00c443259:apps/web/heys_consents_v1.js > apps/web/heys_consents_v1.js
git show 00c443259:apps/web/heys_gamification_v1.js > apps/web/heys_gamification_v1.js
git show 00c443259:apps/web/heys_health_features_v1.js > apps/web/heys_health_features_v1.js
git show 00c443259:apps/web/heys_products_overlay_v1.js > apps/web/heys_products_overlay_v1.js
git show 00c443259:apps/web/heys_yandex_api_v1.js > apps/web/heys_yandex_api_v1.js

# 2. Зависимости и бандлы (только затронутые файлы)
pnpm install --frozen-lockfile
pnpm bundle:legacy:auto --files=apps/web/heys_app_gate_flow_v1.js,apps/web/heys_consents_v1.js,apps/web/heys_yandex_api_v1.js,apps/web/heys_app_shell_v1.js,apps/web/heys_app_derived_state_v1.js,apps/web/heys_app_root_impl_v1.js,apps/web/heys_gamification_v1.js,apps/web/heys_health_features_v1.js,apps/web/heys_products_overlay_v1.js,apps/web/index.html

# 3. dist + version с stableRebuild (hash базы не меняется)
cd apps/web
pnpm run build:dist
cp public/boot-*.js* dist/ 2>/dev/null || true
cp public/postboot-*.js* dist/ 2>/dev/null || true
cp index.html dist/index.html
node ../../scripts/stable-rebuild-version.mjs \
  --base-hash=36df9ce3 \
  --rebuild-id=MY_REBUILD_ID \
  --patches=d75ec593d,3d1904513,4a7ced768

# 4. Upload ТОЛЬКО stable-бакет (не heys-app!)
aws s3 cp dist/index.html s3://${BUCKET}/index.html \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html; charset=utf-8"
aws s3 cp dist/version.json s3://${BUCKET}/version.json \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json"
aws s3 cp dist/build-meta.json s3://${BUCKET}/build-meta.json \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json"
aws s3 cp dist/sw.js s3://${BUCKET}/sw.js \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/javascript"
# boot-app.bundle.*.js(.gz) — см. index.html, загрузить новый hash

# 4b. Если index всё же из d75ec593d (v4 login shell) — обязательно залить
# статику, иначе после PIN пустой экран (404 на theme + v4 CSS):
aws s3 cp apps/web/heys_theme_v1.js s3://${BUCKET}/heys_theme_v1.js \
  --endpoint-url=$ENDPOINT --content-type "application/javascript" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp apps/web/heys_login_theme_picker_v1.js s3://${BUCKET}/heys_login_theme_picker_v1.js \
  --endpoint-url=$ENDPOINT --content-type "application/javascript" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp apps/web/styles/modules/002-ui-v4-palette-roles.css s3://${BUCKET}/styles/modules/002-ui-v4-palette-roles.css \
  --endpoint-url=$ENDPOINT --content-type "text/css" \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp apps/web/styles/modules/733-ui-v4-login-theme.css s3://${BUCKET}/styles/modules/733-ui-v4-login-theme.css \
  --endpoint-url=$ENDPOINT --content-type "text/css" \
  --cache-control "public, max-age=31536000, immutable"

# 5. Smoke
curl -fsS https://stable.heyslab.ru/version.json
curl -fsS https://app.heyslab.ru/version.json   # hash prod НЕ должен измениться

cd "$REPO" && git worktree remove --force "$WT"
```

## Проверки после выкладки

1. `stable.heyslab.ru/version.json` — `hash` = `36df9ce3`, `stableRebuild.id`
   новый.
2. `app.heyslab.ru/version.json` — **без изменений**.
3. PIN-вход на stable не упирается в ConsentScreen; экран согласий открывается с
   плашкой; «Продолжить» без READONLY на `log_consents`.

## Нельзя

- `pnpm --filter @heys/web build` от HEAD `main` → в stable-бакет.
- Деплой в `heys-app` / `app.heyslab.ru` под видом stable-fix.
- Cherry-pick без ручной сверки readonly-файлов — конфликт ожидаем.
