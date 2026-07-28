# RuStore agent runbook

Обязательный общий flow для Codex, Claude и других агентов при RuStore
build/release HEYS.

- Канонический успешный релиз: `apps/mobile` → HEYS `1.0.2(12)`. Версия
  опубликована в RuStore 2026-07-10 18:55 на 100% аудитории:
  <https://rustore.ru/catalog/app/com.heys.mobile>.
- Собирать только через изолированный wrapper:
  `cd apps/mobile && npm run build:rustore -- --local --non-interactive --output /tmp/HEYS-rustore.apk`.
  Прямой `eas build` из монорепы запрещён: он может отправить весь Git-корень.
- После сборки обязательно выполнить
  `npm run verify:release-apk -- /tmp/HEYS-rustore.apk`. Gate проверяет package,
  version, production API, `heys://`, release-подпись, отсутствие private URL и
  `SYSTEM_ALERT_WINDOW`.
- `SYSTEM_ALERT_WINDOW` HEYS не использует. Если RuStore просит обоснование, не
  придумывать его: добавить permission в `blockedPermissions`, пересобрать APK и
  убедиться, что разрешение отсутствует в итоговом manifest.
- Использовать EAS remote release-keystore для всех новых версий. Старые
  отклонённые `1.0.0/1.0.1` были debug-signed; первая опубликованная release-
  версия `1.0.2(12)` принята с новым сертификатом.
- Комментарий и тестовый доступ для модератора брать из
  [RUSTORE_REVIEW_NOTES.md](RUSTORE_REVIEW_NOTES.md). Загружать только APK,
  прошедший artifact gate. Сборка не разрешает загрузку или публикацию: для них
  нужна отдельная прямая команда пользователя.
- Mobile auth UI invariant: пользователь видит только фирменный синий HEYS-вход
  внутри controlled WebView. Удалённый отдельный React Native login
  (`app/auth/login.tsx`) не возвращать. Guest, expired session, logout и deep
  link `login` направляются в `/web`; сохранённая native session может
  использовать безопасный session exchange.
