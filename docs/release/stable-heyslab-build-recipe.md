# stable.heyslab.ru — рецепт пересборки

> **Не prod.** Бакет `stable-heyslab-ru`, хост `stable.heyslab.ru`. Эталон UI
> заморожен на линии git `36df9ce3` (2026-08-11). Пересборка из текущего `main`
> уничтожает эталон — **запрещено**.

## Когда нужен этот файл

Cherry-pick readonly-коммитов на `36df9ce3` **конфликтует** (`index.html`,
`000-base-and-gamification.css`). Одной командой не повторяется — только этот
рецепт.

## Что лежит на копии сейчас (после pin-login-v1, 2026-08-14)

| Поле                                | Значение                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| База UI                             | git `36df9ce3`                                                                                                                                             |
| Patches                             | `d75ec593d` readonly, `3d1904513` write-context RPC, `4a7ced768` consent gate, `00c443259` readonly round 2; chrome = `36df9ce3` shell; `pin-login-bridge` |
| `boot-app.bundle`                   | `4592100534db.js` (лампочка 💡 + настройки; не v4 `renderNavIcon`) — **не менялся**                                                                        |
| `boot-core.bundle`                  | `fce9d94d6c84.js` — живой `3b5581270022` + `login_client_v1` / `verify_client_onetime_pin` в readonly allowlist                                            |
| PIN-мост                            | `heys_stable_pin_bridge_v1.js` (`scripts/stable/`) — старый экран, новый вход если v3 отвечает `access_code_login_required`                                |
| `version.json` → `hash`             | `36df9ce3` (линия эталона)                                                                                                                                 |
| `version.json` → `stableRebuild.id` | `pin-login-v1-20260814`                                                                                                                                    |

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
# ⚠️ НЕ копировать heys_app_shell_v1.js из d75ec593d / 00c443259 / main:
# там уже v4-навигация (renderNavIcon, без 💡). Chrome эталона — shell с 36df9ce3.
# В него вручную: hdr-readonly-banner после { className: 'hdr' } и
# isReadonlyHost ПЕРЕД shouldShowPendingSyncBanner (иначе TDZ/ErrorBoundary).
# git show d75ec593d:apps/web/heys_app_shell_v1.js  — НЕ использовать как chrome
git show d75ec593d:apps/web/heys_storage_supabase_v1.js > apps/web/heys_storage_supabase_v1.js
git show d75ec593d:apps/web/styles/modules/000-base-and-gamification.css > apps/web/styles/modules/000-base-and-gamification.css
git show 3d1904513:apps/web/heys_yandex_api_v1.js > apps/web/heys_yandex_api_v1.js
# consent + readonly round 2 — подставить актуальный commit с main:
git show 00c443259:apps/web/heys_app_derived_state_v1.js > apps/web/heys_app_derived_state_v1.js
git show 00c443259:apps/web/heys_app_root_impl_v1.js > apps/web/heys_app_root_impl_v1.js
git show 00c443259:apps/web/heys_app_gate_flow_v1.js > apps/web/heys_app_gate_flow_v1.js
git show 00c443259:apps/web/heys_consents_v1.js > apps/web/heys_consents_v1.js
# ⚠️ НЕ копировать heys_gamification_v1.js целиком с main: на базе 36df9ce3
# GamificationBar в boot-app всё ещё зовёт HEYS.game.getRankBadge, а в main
# API убрали. Берите 36df9ce3 + только readonly-guards в scheduleCloudSync/syncToCloud.
git show 00c443259:apps/web/heys_products_overlay_v1.js > apps/web/heys_products_overlay_v1.js
# boot-core на бакете уже 3b5581270022 — не перезаливать yandex_api / boot-core
# с worktree 36df9ce3: его index указывает на boot-core.bundle.2ff5c7b961dd.js (404).

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
aws s3 cp dist/lazy-manifest.json s3://${BUCKET}/lazy-manifest.json \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json"
aws s3 cp dist/bundle-manifest.json s3://${BUCKET}/bundle-manifest.json \
  --endpoint-url=$ENDPOINT --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json"
# boot-app.bundle.*.js(.gz) — см. index.html, загрузить новый hash
#
# ⚠️ index.html НЕ брать из worktree 36df9ce3 и НЕ из local main.
# Worktree index ссылается на boot-core.bundle.2ff5c7b961dd.js (нет в бакете → 404 → PIN).
# Main index подставит свой boot-core hash, которого тоже нет.
# Правильно: скачать ЖИВОЙ index с stable, заменить только boot-app hash,
# оставить boot-core.bundle.3b5581270022.js. После upload каждый boot-*.js = 200.
# Бандл boot-app обязан содержать tab-advice / 💡 и НЕ содержать renderNavIcon.

# 4b. ⛔ ВЕТКА НЕ ИСПОЛЬЗОВАНА И НЕ ДОЛЖНА БЫТЬ ИСПОЛЬЗОВАНА (2026-08-24).
# Проверено по живому index.html, скачанному с зеркала: в нём ноль упоминаний
# 002-ui-v4-palette-roles.css, heys_theme_v1.js, 733-ui-v4-login-theme.css,
# атрибутов data-theme-id / data-palette и токенов --v4-*. CSS зеркала —
# дореспличный монолит styles/main.css?v=57. Значит index взят НЕ из d75ec593d,
# и v4-статики на зеркале нет.
# Заливать её теперь нельзя: это разморозит эталон. Эталон собран вручную из
# 36df9ce3 (10 августа 02:48), а 002-ui-v4-palette-roles.css появился на семь
# часов позже — на базе эталона этого файла не существует. Каноничная палитра
# из рабочей ветки снята 2026-08-24 (решение владельца: канон живёт только
# здесь, на зеркале), поэтому файл из main принёс бы на stable четыре чужих
# набора вместо канона.
# Блок оставлен как запись о разобранной развилке, а не как шаг. Если когда-то
# понадобится v4 login shell на зеркале — это отдельное решение владельца и
# новая пересборка эталона, а не выполнение этих строк.
#
# Команды развилки оставлены закомментированными — копировать их целиком нельзя:
# aws s3 cp apps/web/heys_theme_v1.js s3://${BUCKET}/heys_theme_v1.js \
#   --endpoint-url=$ENDPOINT --content-type "application/javascript" \
#   --cache-control "public, max-age=31536000, immutable"
# aws s3 cp apps/web/heys_login_theme_picker_v1.js s3://${BUCKET}/heys_login_theme_picker_v1.js \
#   --endpoint-url=$ENDPOINT --content-type "application/javascript" \
#   --cache-control "public, max-age=31536000, immutable"
# aws s3 cp apps/web/styles/modules/002-ui-v4-palette-roles.css s3://${BUCKET}/styles/modules/002-ui-v4-palette-roles.css \
#   --endpoint-url=$ENDPOINT --content-type "text/css" \
#   --cache-control "public, max-age=31536000, immutable"
# aws s3 cp apps/web/styles/modules/733-ui-v4-login-theme.css s3://${BUCKET}/styles/modules/733-ui-v4-login-theme.css \
#   --endpoint-url=$ENDPOINT --content-type "text/css" \
#   --cache-control "public, max-age=31536000, immutable"

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
4. Нижнее меню — старое: вкладка советов с 💡 и шестерёнка настроек, не v4
   SVG/`more`.

## PIN-мост (2026-08-14) — не пересобирать UI

Живой вход после 11.08 закрывает `verify_client_pin_v3` для клиентов с
`access_code_hash`. Замороженный экран этого не знает. Чтобы PIN проходил
**без** выкладки нового дизайна:

1. Скачать живой `boot-core.bundle.<hash>.js` со stable.
2. В `READONLY_ALLOWED_RPC_EXACT` добавить `login_client_v1` и
   `verify_client_onetime_pin`. Не трогать остальной бандл.
3. Залить новый boot-core hash + `scripts/stable/heys_stable_pin_bridge_v1.js`.
4. В живом `index.html` заменить только boot-core hash и вставить
   `<script defer src="heys_stable_pin_bridge_v1.js">` сразу после boot-core.
5. `boot-app.bundle.4592100534db.js` не перезаливать — там эталон вкладок.

Мост сначала зовёт старый `verify_client_pin_v3`. На
`access_code_login_required` / `pin_login_disabled` повторяет вход через
`login_client_v1` (PIN как код доступа) или `verify_client_onetime_pin`. Ответ
маскируется под форму v3 — экран и вкладки не меняются.

## Нельзя

- `pnpm --filter @heys/web build` от HEAD `main` → в stable-бакет.
- Деплой в `heys-app` / `app.heyslab.ru` под видом stable-fix.
- Cherry-pick без ручной сверки readonly-файлов — конфликт ожидаем.
- Копировать `heys_app_shell_v1.js` с `00c443259` / `main` в эталон — ломает
  меню (v4 nav).
- Заливать `index.html` из worktree `36df9ce3` или из local `main` — 404 на
  boot-core.
