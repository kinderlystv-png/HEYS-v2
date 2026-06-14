# HEYS-v2 — Security Review (канонический)

Единый рабочий документ security-ревью. **Это living-документ**: статус-сводка
(Раздел 0) и журнал находок (Раздел 1) обновляются по мере прохождения слоёв
аудита из дорожной карты ниже.

- **Последнее обновление**: 2026-06-08
- **Сводит в себя**: `docs/SECURITY_REVIEW_METHODOLOGY_2026-06-08.md` (каркас,
  evidence-matrix, facts-table, прогон инструментов) + статический разбор
  изоляции арендаторов и целостности sync. Оба исходных документа — историчны;
  этот файл — источник истины.
- **Стандарты**:
  [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/)
  (контроли), [OWASP Top 10](https://owasp.org/www-project-top-ten/) (risk
  framing), [OWASP API Security](https://owasp.org/www-project-api-security/)
  (API).
- **Важно**: миграции и код — это _намерение_, не доказательство задеплоенного
  состояния. Пункты, требующие живой проверки (psql/curl/динамика), помечены
  `⬜` в дорожной карте и `⚪` в оценках.

---

## TODO — дорожная карта аудита (что дальше и куда писать находки)

Аудит идёт слоями. Каждый слой прогоняется целиком, его находки пишутся в
**Раздел 1 «Журнал находок»**, после чего обновляются оценки в **Разделе 0** и
строки в **Facts Table** (Раздел 9).

> **✅ Статус деплоя (2026-06-08):** весь код и SQL-миграции **закоммичены,
> запушены и применены к проду** (commit `5c28c68d`). **M1** — 70 SECDEF
> получили `SET search_path = public, pg_temp`; **M2** — `PUBLIC EXECUTE`
> отозван, `heys_rpc` получил явный EXECUTE на все 70 функций, `heys_rest` — на
> `safe_upsert_client_kv`. Verify-SELECT в обеих миграциях вернул 0 строк. Логи:
> `security-reports/migrations/2026-06-08_M1_harden_secdef.txt` +
> `…_M2_revoke_public.txt`. SEC-015/016 → **fixed**. Smoke-test приложения
> (PIN-вход, curator-sync, REST KV, messages, payments) — пользователю в
> браузере; rollback (если что-то всплывёт) — внутри M2.

| Слой   | Что прогоняем                                                                                                                                                               | Статус | Куда пишем результат                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| **L0** | Статический разбор репо: код, миграции, cloud functions, hooks                                                                                                              | ✅     | Раздел 0 + Журнал (SEC-001…012)                                                             |
| **L1** | Прогон инструментов: `pnpm audit`, `dependency-check`, SAST, `security-smoke-test`                                                                                          | 🔄     | SAST ENFILE починен (SEC-002); осталось тюнинг ruleset (SEC-014) + prod/dev split (SEC-010) |
| **L2** | Живой аудит БД: гранты, RLS, политики — **прогнан** (`security-reports/l2-db-audit.txt`); вскрыл 3 гэпа SEC-015/016/017                                                     | ✅     | Журнал (SEC-013…017) + Раздел 0 (3) + Facts Table                                           |
| **L3** | Auth/доступ динамика: brute-force PIN/login, IDOR-подмена `client_id`/`context_id`, прод-значение `HEYS_WRITE_CONTEXT_STRICT`, CORS curl — **готовый чек-лист → Раздел 10** | ⬜     | Журнал + Раздел 0 (1,2,5)                                                                   |
| **L4** | Инъекции/XSS динамика: пробы в meals/messages/products/FAQ/lead, трассировка источника FAQ-HTML, SQLi в REST-фильтрах — **готовый чек-лист → Раздел 10**                    | ⬜     | Журнал + Раздел 0 (8,9,16)                                                                  |
| **L5** | Storage/webhooks/интеграции: S3 bucket policy + public-read фото, ownership на delete, спуф/replay webhook (ЮKassa/Telegram/cron) — **готовый чек-лист → Раздел 10**        | ⬜     | Журнал + Раздел 0 (18,19,20)                                                                |
| **L6** | Устойчивость/комплаенс: restore-drill, deletion cascade (152-ФЗ/DSAR), retention аудита, шифрование бэкапов, RPO/RTO                                                        | ⬜     | Журнал + Раздел 0 (11,13)                                                                   |
| **L7** | Hardening CI/CD: убрать `continue-on-error`, сделать gitleaks/audit/SAST блокирующими, SBOM                                                                                 | ⬜     | Журнал + Раздел 0 (14,15)                                                                   |
| **L8** | Внешний пентест (динамика третьей стороной) для всех пунктов `⚪`                                                                                                           | ⬜     | Журнал + Раздел 0                                                                           |

Легенда статуса слоя: ✅ выполнен · 🔄 частично · ⬜ не начат.

### Как вести этот документ (конвенция)

1. **Каждая находка → строка в Разделе 1** с ID `SEC-NNN` (сквозная нумерация),
   датой, слоем, компонентом, severity, командой-доказательством и статусом.
2. **После слоя**: обнови `Статус` слоя в таблице выше; пересмотри `Оценку`
   затронутых компонентов в Разделе 0; добавь подтверждённые факты в Facts
   Table.
3. **Severity** (по влиянию): `Critical / High / Medium / Low / Info`. **Статус
   находки**: `open / in-progress / fixed / accepted-risk / false-positive`.
   **Приоритет работ** (P0–P3) — отдельно от severity, живёт в Разделе 0 и в
   backlog ниже.
4. **Не удаляй** закрытые находки — меняй статус на `fixed`/`accepted-risk`
   (журнал = история). Ложные срабатывания помечай `false-positive` с причиной.

### Немедленный backlog (P0/P1)

| Приор.                      | Действие                                                                                                                                                                                                                               | Почему                                                                                                                                                                 | Находка          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **P0 🚦 pre-launch блокер** | Включить `HEYS_WRITE_CONTEXT_STRICT=1` в проде (после суток Phase B и чистки ложных `data_loss_audit`). По threat-model — топ-риск №1 (cross-client writes/IDOR). Самый дешёвый P0: env-var flip + sutki soak.                         | Главная защита от межклиентского затирания работает в режиме «логируем, но пропускаем». Reviewer (`SECURITY_REVIEW_tier2.md` §R1): pre-launch блокер, не «желательно». | SEC-004          |
| **P0**                      | Зависимости: разнести 160 advisories на runtime vs dev-only + **сначала триаж 5 critical** (какие CVE, достижимы ли в runtime), потом решать «закрыть/defer».                                                                          | `pnpm audit`: 5 critical / 72 high; нельзя «может подождать» без триажа (reviewer §R-minor)                                                                            | SEC-010          |
| ✅ P0                       | Починить `scripts/security/dependency-check.js` (ложный «0»)                                                                                                                                                                           | Гейт всегда показывал 0 → ложный зелёный; **исправлено 2026-06-08**                                                                                                    | SEC-001          |
| **P1**                      | Добавить `Content-Security-Policy` на ответы functions/статику                                                                                                                                                                         | Нет второго рубежа против XSS                                                                                                                                          | SEC-005          |
| ✅ P1                       | SAST: ENFILE + ruleset тюнинг + baseline-ratchet (2026-06-08); `continue-on-error` снят с SAST шага → CI блокирует НОВЫЕ critical/high                                                                                                 | SAST теперь даёт fail только на находках вне `security-reports/sast-baseline.json`                                                                                     | SEC-002, SEC-014 |
| ✅ P1                       | REST POST `/rest/shared_products`: отдавать явный 403/405, не утечку `code:42601` — **исправлено 2026-06-08** (`heys-api-rest` deployed)                                                                                               | Прод-ответ раскрывает внутреннюю ошибку БД                                                                                                                             | SEC-003          |
| ✅ P1                       | Снять снимок грантов/RLS из прод-БД (L2) — сделано, вскрыло гэпы ниже                                                                                                                                                                  | Миграции ≠ задеплоено — подтвердилось                                                                                                                                  | SEC-013          |
| ✅ P1                       | БД-hardening: **обе миграции применены в проде 2026-06-08** — `…_harden_secdef_search_path.sql` (M1) + `…_revoke_public_execute_secdef.sql` (M2)                                                                                       | Crown-jewel функции без search_path; PUBLIC-execute ломает least-privilege                                                                                             | SEC-015, SEC-016 |
| **P1**                      | Auth куратора: MFA (TOTP) + per-account lockout; задать ротацию `JWT_SECRET`                                                                                                                                                           | Сейчас только per-IP rate-limit, нет MFA/ротации                                                                                                                       | SEC-011          |
| ✅ P1                       | Cloud Functions: `MAX_BODY_BYTES` guard введён в `heys-api-rest`/`-photos`/`-leads` (`-payments` ждёт YUKASSA-creds deploy). Caps: REST=512KB, photos=8MB, leads/payments=64KB. **Исправлено 2026-06-08**, live-verified curl-пробами. | DoS / OOM через гигантский JSON-тело; cold-start lag; billing spike                                                                                                    | SEC-018          |
| ✅ P1                       | Leads CSRF: добавлен origin guard (раньше evil-origin POST тихо проходил с подменой ACAO). **Исправлено 2026-06-08**, live-verified.                                                                                                   | Evil-origin POST → 403 cors_denied (раньше 400 «Consent required», запрос принимался)                                                                                  | SEC-019          |
| ✅ P1                       | Telegram bot `/bot/webhook` secret_token check. **Код deployed, warn-only** (env-var не выставлен в YC). Активация: env `TELEGRAM_WEBHOOK_SECRET` + `setWebhook` с тем же `secret_token`.                                              | До активации fake-updates принимаются (DoS/spoof). Активация — 5 мин user-action.                                                                                      | SEC-020          |
| **P1 pre-launch**           | L3 IDOR sanity-check: cross-client read/write isolation. **Не предполагать, проверить.** Нужны 2 PIN/phone пары от user'а. Reviewer (§R2): главный незакрытый unknown для мультитенант-приложения.                                     | Запуск без verified изоляции = неприемлемо для health-данных                                                                                                           | L3.3/L3.4        |
| **P1 pre-launch**           | SEC-006: фото-bucket `anonymous_access_flags.read=true`. Quick fix: `yc storage bucket update heys-photos --anonymous-access-flags read=false`; signed URLs — отдельно. Reviewer: 🔴 единственное активно-эксплуатируемое сейчас.      | Знание URL = доступ к фото (PII)                                                                                                                                       | SEC-006          |
| **P2 pre-launch**           | L6 baseline: restore-drill, retention для перс-данных, deletion-cascade, RPO/RTO. Reviewer (§R3): для РФ 152-ФЗ — юридическая база, не «может подождать».                                                                              | Юридическое требование для перс-данных health-приложения                                                                                                               | L6               |

---

## Раздел 0 — Авто-сводка состояния по компонентам

Шкала: 🟢 adequate (нужна доводка) · 🟡 partial (есть пробелы) · 🔴 weak
(приоритетное устранение) · ⚪ не оценено статикой (нужна динамика).
Уверенность: `✓` проверено в сессии · `~` со слов статики/прогона · `⚪` требует
живой проверки.

| #   | Компонент                                   | Оц. | Сильные стороны (кратко)                                                                        | Главные пробелы / что дальше                                                                                                    | Приор. | Conf. |
| --- | ------------------------------------------- | --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| 1   | Аутентификация (curator JWT, PIN, sessions) | 🟡  | PBKDF2-100k пароль, bcrypt PIN, session-токены хешем, HttpOnly+Secure cookie, rate-limit        | Нет MFA, нет per-account lockout, JWT 24ч без refresh/rotation                                                                  | P1     | ~     |
| 2   | Авторизация / мультитенантная изоляция      | 🔴  | client_id из `context_id` на сервере, `write_contexts`, RPC-only, `curator_write_lock`          | **STRICT off по умолчанию** (warn-only); живой прод-флаг не подтверждён                                                         | **P0** | ✓     |
| 3   | БД: роли, RLS, SECURITY DEFINER             | 🔴  | (L2 ✓) 0 прямых table-грантов anon/PUBLIC; FK CASCADE на 19 табл.; write_contexts USING(false)  | (L2 ✓) 70 SECDEF без `search_path` (SEC-015); `PUBLIC EXECUTE` не отозван (SEC-016); RLS off на 41 табл. вкл. clients (SEC-017) | P1     | ✓     |
| 4   | Cloud Functions (perimeter, CORS, secrets)  | 🟡  | Lockbox-секреты, CORS-whitelist без wildcard, JWT/session middleware                            | Нет лимита размера тела; вербозные ошибки; нет CSP                                                                              | P2     | ~     |
| 5   | API: REST / RPC                             | 🟡  | whitelist таблиц/колонок, regex-валидация, параметризация, `::uuid`-cast                        | `LIMIT`/`OFFSET` не ограничены; smoke: POST течёт `42601`; широкие DELETE/PATCH                                                 | P2     | ~     |
| 6   | Управление секретами                        | 🟢  | Lockbox+env, `.env*` в `.gitignore`/`.ycignore`, gitleaks workflow, placeholder-strip           | Нет политики ротации; `apps/tg-mini/.env.telegram` в гите (только Vite-конфиг, без секретов ✓)                                  | P3     | ✓     |
| 7   | Транспорт / HTTP-заголовки                  | 🟡  | TLS `rejectUnauthorized` prod, HSTS 2г, X-Frame DENY, nosniff, Referrer-Policy, Secure-cookie   | **Нет CSP** (✓); `SameSite=Lax` вместо Strict; нет Permissions-Policy                                                           | P1     | ✓     |
| 8   | Client-side / XSS / DOM (web)               | 🟡  | Нет `eval`/`new Function`; React-escaping; storage auth-key allowlist; strip console            | Нет CSP-backstop; санитизация user-content не подтверждена; legacy токен в localStorage                                         | P2     | ⚪/~  |
| 9   | Валидация входа / инъекции                  | 🟡  | Параметризация повсеместно, type-cast, whitelists, фикс phone-enumeration                       | Нет лимитов длины строк/размера массивов; `LIMIT` без потолка                                                                   | P2     | ~     |
| 10  | Rate limiting / anti-abuse                  | 🟡  | PIN 10/15мин, логин 10/15мин в БД, лимит лидов, anti-enumeration                                | Нет CAPTCHA; обход ротацией IP; нет per-account lockout; спуф `X-Forwarded-For`                                                 | P2     | ~     |
| 11  | Логирование / аудит / PII                   | 🟡  | `data_access_audit_log`, `data_loss_audit`, `security_events`, `LOG_LEVEL`-gating               | Audit-табл. правит runtime-роль, не шифрованы, без retention; прямой SQL минует app-аудит                                       | P2     | ~     |
| 12  | Целостность синхронизации / защита данных   | 🟡  | shrink-guard, tombstones, central stamper, `isNonClientDataKey`, lint-гейты                     | Потолок clock-skew LWW; server-revision pull-gate инертен (возвращает `true`)                                                   | P1     | ~     |
| 13  | Резервное копирование / DR                  | 🟡  | Ежедневный S3-backup, FK CASCADE без сирот, рабочая процедура restore (применялась)             | Нет restore-drill цикла; не задокументированы RPO/RTO; шифрование архивов не подтверждено                                       | P3     | ~/⚪  |
| 14  | Зависимости / supply chain                  | 🔴  | gitleaks, богатый набор pre-commit/pre-push lint'ов, pnpm-lock; **dependency-check починен**    | `pnpm audit`: 5 critical/72 high (нужен prod/dev split); `^`-диапазоны; нет SBOM                                                | **P0** | ✓     |
| 15  | SAST / Security CI                          | 🔴  | Workflow SAST/dep/secret на PR+schedule; **SAST ENFILE починен** (бежит, 4516 файлов)           | Ruleset шумен (7764 `Date.now()`-FP → SEC-014); гейты `continue-on-error` не блокируют                                          | P1     | ✓     |
| 16  | Landing app                                 | 🟡  | Static export, lead API: consent/honeypot/rate-limit серверный                                  | `next@14.2.18` advisories; FAQ `dangerouslySetInnerHTML`; iframe sandbox allow-same-origin+scripts; нет security-headers        | P2     | ~     |
| 17  | Telegram Mini App                           | 🟡  | Шлёт `initData` на бэкенд, auth-заголовки централизованы, dev-fallback за `import.meta.env.DEV` | Серверная верификация `initData` hash не подтверждена; dev-логи содержат initData                                               | P2     | ⚪    |
| 18  | Payments / ЮKassa                           | 🟡  | returnUrl-whitelist, oferta-consent перед оплатой, webhook IP-allowlist                         | Gateway-spec помечает payments как stub/TODO; нужна криптоподпись webhook, не только IP                                         | P2     | ~     |
| 19  | Photos / object storage                     | 🟡  | Auth-резолв владельца, ownership-check на delete, 5MB upload-cap                                | Объекты `public-read` → утечка URL = утечка фото; нужна bucket policy/lifecycle                                                 | P2     | ~     |
| 20  | Messages / push                             | 🟡  | Client/curator auth, валидация payload, VAPID через Lockbox                                     | Rate-limit 30/мин **в памяти** (сброс на cold-start); приватность push не разобрана                                             | P2     | ~     |
| 21  | Leads / consent (152-ФЗ)                    | 🟡  | Honeypot, серверный required-consent, email-валидация, 18+ gate, минимизация PII в Telegram     | Нужна DB-side uniqueness/rate-limit; CORS-fallback отдаёт default origin для disallowed                                         | P2     | ~     |
| 22  | Local dev API proxy (`packages/core`)       | 🟡  | Секрет только из server-env, явный CORS, dev-only                                               | Проксирует `/rpc /rest /auth /messages /photos` на **прод** по умолчанию — риск bypass                                          | P2     | ~     |

### Позиция одной строкой

Периметр выстроен зрело (RPC-only доступ, least-privilege роли, параметризация,
хешированные секреты/токены, аудит-слой, pre-commit-гейты). Ядро хардненинга
2026-06-08 сделано: search_path на 70 SECDEF, REVOKE PUBLIC, CSP на 7 cloud
functions + index.html, body-size DoS guards, leads CSRF guard, messages
rate-limit перенесён в БД, SAST baseline-ratchet с CI-gate'ом, новые
SEC-018/019/020 закрыты или с deployed-fix.

**До публичного запуска НЕ закрыты (по reviewer'у `SECURITY_REVIEW_tier2.md`):**

- **SEC-004** — `HEYS_WRITE_CONTEXT_STRICT=0`: cross-client writes всё ещё
  проходят (warn-only). Top tenant-isolation risk, pre-launch блокер.
- **L3 IDOR не verified** — read/write изоляция между клиентами предположена, не
  проверена. Нужны 2 cred-пары для curl-проб.
- **SEC-006** — фото-bucket `anonymous_access_flags.read=true`: знание URL =
  доступ. Единственное активно-эксплуатируемое сейчас.
- **SEC-010** — 5 critical / 72 high в `pnpm audit`, не триажены (какие
  достижимы в runtime).
- **L6** — restore-drill, 152-ФЗ retention/deletion-cascade, RPO/RTO baseline не
  начат. Юридическое требование для перс-данных.
- **SEC-020 warn-only** — bot webhook secret_token check deployed, но env-var в
  YC не выставлен → активируется после 5-мин user-action.

**Непройденные слои:** L3 (частично — L3.5 done), L4 (частично — L4.1/4.2/4.6
done), L5 (частично — L5.1/5.3/5.4/5.5 done), L6 (не начат), L7 (SAST done,
dep-check + gitleaks + SBOM открыты), L8 (внешний пентест — третья сторона).

**Что не моя зона:** go/no-go вердикт «можно ли пускать пользователей» — решение
владельца на основе risk-ledger выше, не само-сертификация агента.

---

## Раздел 1 — Журнал находок (Findings Log)

Шаблон строки:
`SEC-NNN | дата | слой | компонент | severity | описание | evidence (команда/файл) | статус`.

| ID      | Дата       | Слой | Компонент             | Severity | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidence                                                                                                                                       | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | ---------- | ---- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | 2026-06-08 | L1   | Deps / CI             | High     | `dependency-check.js` всегда рапортовал 0 (парсил npm-v6 NDJSON, которого pnpm не выдаёт) → ложный зелёный гейт                                                                                                                                                                                                                                                                                                                                                                                              | `node scripts/security/dependency-check.js` → «0», против `pnpm audit` → 160                                                                   | **fixed** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SEC-002 | 2026-06-08 | L1   | SAST / CI             | Medium   | SAST падал `ENFILE` — `walk()` рекурсировал внутрь `node_modules`/`.pnpm` (исключение было только для файлов). Фикс: прунинг каталогов до рекурсии + skip симлинков                                                                                                                                                                                                                                                                                                                                          | `node scripts/security/sast-scan.js` → 4516 файлов, без ENFILE                                                                                 | **fixed** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SEC-003 | 2026-06-08 | L1   | API REST              | Medium   | Прод REST POST `/rest/shared_products` отдаёт `{code:42601,...}` (внутренняя ошибка БД) вместо 403/405                                                                                                                                                                                                                                                                                                                                                                                                       | `bash scripts/security-smoke-test.sh` (8 passed, 1 failed)                                                                                     | **fixed** (2026-06-08, `heys-api-rest` index.js: пустое тело → 400 «Empty body» до SQL; catch не выводит `error.code` SQLSTATE; deploy + смок 9/9 PASS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SEC-004 | 2026-06-08 | L0   | Tenant isolation      | High     | `HEYS_WRITE_CONTEXT_STRICT` по умолчанию off → write-context в warn-only (пишет audit, но пропускает запись)                                                                                                                                                                                                                                                                                                                                                                                                 | `heys-api-rpc/index.js:569`, `heys-api-rest/index.js:114`                                                                                      | **ready-to-flip** (2026-06-14, solo-триаж `data_loss_audit` за 30д: 204 cross-client попыток заблокированы — `cross_client_dayv2_content_dup`=141 / `cross_client_blob_blocked`=63; **0 false positives**. Также 3279 `non_client_data_rejected` (правомерный блок curator-batch writes на глобальные ключи). Reviewer-критерий «при 0 FP → флип» выполнен. **Caveat:** в текущем дампе нет explicit `context_mismatch`/`context_invalid` действий — нужно verify что warn-mode detector пишет такие события в `data_loss_audit` (иначе flip risk = blind). Перед flip: code-trace `HEYS_WRITE_CONTEXT_STRICT` в `heys-api-rpc/index.js:569` чтобы убедиться что warn-mode логирует context-rejects. Если да — flip safe.) |
| SEC-005 | 2026-06-08 | L0   | Transport / headers   | Medium   | Нет `Content-Security-Policy` ни в одной cloud function                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `grep -ri content-security-policy yandex-cloud-functions` → пусто                                                                              | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SEC-007 | 2026-06-08 | L0   | Sync integrity        | Medium   | L3 server-revision pull-gate возвращает `true` без `server_revision` → эффективного гейтинга нет; LWW на device-clock                                                                                                                                                                                                                                                                                                                                                                                        | `heys_storage_supabase_v1.js:12187`; `BUGS_HISTORY.md`                                                                                         | open (ceiling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SEC-009 | 2026-06-08 | L0   | Messages / push       | Low      | Rate-limit 30/мин/клиент хранится в памяти функции → сбрасывается на cold-start                                                                                                                                                                                                                                                                                                                                                                                                                              | static read `heys-api-messages`                                                                                                                | **fixed + live-verified** (2026-06-08, миграция `database/2026-06-08_messages_rate_limit.sql` применена: таблица `messages_rate_limits` + SECDEF `check_messages_rate_limit(uuid,int,int)` с pinned search_path. Code: in-memory Map → атомарный UPSERT в БД. Smoke: 1→allowed, 2→allowed, 3→rejected retry_after=53s. Fail-open при инфра-ошибке.)                                                                                                                                                                                                                                                                                                                                                                        |
| SEC-010 | 2026-06-08 | L1   | Deps                  | High     | `pnpm audit`: 160 advisories (5 critical / 72 high / 63 moderate / 20 low); не разнесены runtime vs dev                                                                                                                                                                                                                                                                                                                                                                                                      | `pnpm audit --audit-level moderate`                                                                                                            | **triaged: defer** (2026-06-14, solo-триаж 6Б.6: lockfile обновился с тех пор, current state — **0 critical / 1 high / 3 moderate / 1 low**. Prod-only audit: **1 advisory** (esbuild GHSA-gv7w-rqvm-qjhr — Deno-specific binary integrity, мы на Node.js → не reachable в runtime, только build-time; recommend bump для hardening). Остальные 4 — dev/build-only (tsup, js-yaml в @changesets/eslint configs, ajv в commitlint/eslint, brace-expansion в minimatch). **Runtime exposure: 0**. Можно defer на post-launch; build-pipeline hardening — pre-launch nice-to-have (esbuild >=0.28.1).)                                                                                                                        |
| SEC-011 | 2026-06-08 | L0   | Auth                  | Medium   | Нет MFA для кураторов; lockout только per-IP, не per-account; ротация `JWT_SECRET` не задокументирована                                                                                                                                                                                                                                                                                                                                                                                                      | `heys-api-auth/index.js`                                                                                                                       | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SEC-012 | 2026-06-08 | L0   | Landing               | Medium   | iframe demo sandbox: `allow-same-origin` + `allow-scripts` (классический потенциал sandbox-escape; severity повышена с Low до Medium 2026-06-08 по итогам deep-audit — подтверждённый паттерн, не теоретический)                                                                                                                                                                                                                                                                                             | `apps/landing/src/components/sections/DemoSection.tsx:125,150`                                                                                 | **mitigated-by-design** (2026-06-08): parent=heyslab.ru, iframe-src=try.heyslab.ru (`DEMO_BASE_URL`) — cross-origin делает sandbox-escape невозможным. Защита держится на инварианте `DEMO_BASE_URL !== window.location.host`. Добавлен code-comment с предупреждением «если поменяешь DEMO_BASE_URL на same-host — снять allow-same-origin». Не fixed (sandbox-настройка не менялась), но эффективно безопасно.                                                                                                                                                                                                                                                                                                           |
| SEC-008 | 2026-06-08 | L0   | Landing / XSS         | Low      | FAQ рендерит `dangerouslySetInnerHTML={{__html:item.a}}` — severity зависит от источника `items`                                                                                                                                                                                                                                                                                                                                                                                                             | `FAQAccordion.tsx:53` ← `FAQVariantSSR.tsx:34` ← `content.faq` ← **`apps/landing/src/config/landing-variants.ts:311+` hardcoded**              | **accepted-risk** (2026-06-08): items полностью hardcoded в TS-файле dev'ом, нет admin-endpoint, нет БД-источника. HTML в items intentional (`<strong>`, `<a>`). Инвариант: не добавлять dynamic FAQ items без sanitize (DOMPurify) перед рендером.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SEC-006 | 2026-06-08 | L0   | Photos / S3           | Medium   | Объекты пишутся `ACL: public-read` → знание URL = доступ к фото (потенциально PII)                                                                                                                                                                                                                                                                                                                                                                                                                           | static read `heys-api-photos`                                                                                                                  | **recommendation-ready** (2026-06-14, solo-анализ 6Б.2: подробный A vs B doc в [`SECURITY_REVIEW_sec006_recommendation.md`](SECURITY_REVIEW_sec006_recommendation.md). Структура ключа `<UUID-cid>/<date>/<mealId>/<12-byte-randomId>.<ext>` = ~318 бит entropy → brute-force невозможен. Реальный риск = URL leakage. Security-агент рекомендует **Вариант B (accepted-risk)** с 3 митигациями (Cache-Control private+no-store, Referrer-Policy no-referrer, не логировать photo URLs). 5 мин update vs 10-15 ч рефактор на Variant A. Триггеры пересмотра на A: 100+ клиентов, sharing feature, compliance audit. Решение основателя ждёт.)                                                                              |
| SEC-019 | 2026-06-08 | L3   | API / Leads CSRF      | Medium   | Live-проба показала: `POST /leads` с `Origin: https://evil.com` тихо подменяет ACAO на `ALLOWED_ORIGINS[0]` (`heyslab.ru`), браузер блокирует чтение ответа, но lead УЖЕ залит в БД + Telegram-уведомление ушло. То есть evil-page может через жертв спамить leads через staff-канал                                                                                                                                                                                                                         | curl-проба `curl -X POST https://api.heyslab.ru/leads -H "Origin: https://evil.com" -d '<lead>'` → HTTP 400 «Consent required» (запрос принят) | **fixed + live-verified** (2026-06-08, leads/index.js +13 строк origin guard по образцу REST function; deploy подтверждён: evil-origin POST → 403 cors_denied, legit-origin POST → нормальная валидация)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| SEC-020 | 2026-06-08 | L5   | API / Telegram bot    | Medium   | Live-проба: `POST /bot/webhook` без любых credentials → `{ok:true}`. Функция `heys-bot-client` обрабатывает Telegram-update без верификации `X-Telegram-Bot-Api-Secret-Token`. Атакующий может: (a) спамить bot-users fake-сообщениями (DoS bot rate-limit на Telegram стороне), (b) race-claim`claim_pin_token_chat` с угадаемым/утечённым UUID (122-bit entropy ≈ невозможно brute, но утечка ссылки в email/screenshot реалистична).                                                                      | curl `POST /bot/webhook` с `{update_id:111, message:{chat:{id:-1001}, text:"/test"}}` → HTTP 200 `{ok:true}`                                   | **fixed (warn-only) — нужен user-action для активации**: heys-bot-client/index.js +30 строк secret_token check (см. handler `/bot/webhook`). Deployed. Сейчас warn-only потому что `TELEGRAM_WEBHOOK_SECRET` env-var не выставлен в YC. **Для полной активации:** (1) `yc serverless function update heys-bot-client --environment TELEGRAM_WEBHOOK_SECRET=<random-64char>`; (2) Telegram setWebhook с тем же `secret_token`. После — любой POST без правильного header → 403.                                                                                                                                                                                                                                             |
| SEC-021 | 2026-06-14 | L6   | Backup chain          | High     | Backup-chain имеет 27-дневную дыру с 2026-04-14 по 2026-05-10 (нет daily backups). Если клиент существовал и удалился в этот период — данные невосстановимы. Влияет на 152-ФЗ DSAR (могут не суметь восстановить данные субъекту по запросу).                                                                                                                                                                                                                                                                | `aws --endpoint-url=https://storage.yandexcloud.net s3 ls s3://heys-backups/client-daily/` → видимый gap                                       | open (нужно: root-cause investigation cron'а + добавить gap-detector watchdog раз в неделю)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-022 | 2026-06-14 | L6   | Photos / 152-ФЗ §14   | Medium   | При `DELETE FROM clients WHERE id = <uuid>` 18 FK CASCADE удаляют все ПДн из БД ✅, но photos в S3 `heys-photos/<cid>/...` **НЕ удаляются** (нет связи S3 ↔ БД на уровне FK/триггеров). Это нарушение 152-ФЗ §14 («право на удаление»): ПДн (фото еды могут содержать PII — лицо, документы) остаётся после deletion аккаунта. Дополнительно: storage bloat.                                                                                                                                                | `database/2026-05-11_add_clients_fk_cascade.sql` + grep `S3` cleanup в `heys-cron-*` → no orphan cleanup                                       | open (нужно: cron-задача `heys-cron-photo-cleanup` раз в день удаляет S3 objects где `<cid>` не в `clients` table; ИЛИ Lambda trigger на `DELETE clients` для S3 cleanup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SEC-013 | 2026-06-08 | L2   | БД гранты/RLS         | —        | L2-аудит прогнан на проде (`security-reports/l2-db-audit.txt`). Подтверждено хорошее (0 прямых table-грантов anon/PUBLIC; 19 FK на clients все CASCADE кроме leads=SET NULL; write_contexts USING(false)); вскрыты 3 гэпа → SEC-015/016/017                                                                                                                                                                                                                                                                  | вывод `audit-db.sql`                                                                                                                           | **done** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| SEC-014 | 2026-06-08 | L1   | SAST / CI             | Low      | После фикса ENFILE SAST шумен: 7764 хита `insecure-operations` = почти все `Date.now()` (таймстампы, не crypto-RNG) + 90 «critical» в основном FP. Нельзя делать блокирующим без тюнинга ruleset                                                                                                                                                                                                                                                                                                             | `node scripts/security/sast-scan.js` (8644 total)                                                                                              | **fixed** (2026-06-08): (a) excludes (`.claude`, `archive`, vendor bundles, self-match); (b) FP-фильтры (`$${placeholder}`, `console.*`, identifier-substring); (c) baseline-ratchet — `security-reports/sast-baseline.json` фиксирует 14 fingerprint'ов известных FP (heys-api-rest WHERE/ORDER/LIMIT/RETURNING — параметризованы; `dangerouslySetInnerHTML` в проверенных компонентах). Workflow `.github/workflows/security-scan.yml` теперь без `continue-on-error: true` на SAST шаге → CI падает только на НОВЫХ находках вне baseline. Регенерация: `node scripts/security/sast-scan.js --update-baseline`. Итог: 8644→1680 total → 0 critical / 0 high после baseline (exit 0).                                    |
| SEC-015 | 2026-06-08 | L2   | БД: SECURITY DEFINER  | High     | 70 SECURITY DEFINER функций в `public` БЕЗ `SET search_path` — вкл. crown-jewels: `client_pin_auth`, `create_client_with_pin`, `admin_set_client_pin`, `decrypt_health_data`/`encrypt_health_data`/`get_encryption_key`, `safe_upsert_client_kv`, `get_client_salt`, `verify_client_pin`. Риск hijack резолва (CWE-426/427)                                                                                                                                                                                  | `audit-db.sql` §1; fix → `database/2026-06-08_harden_secdef_search_path.sql`                                                                   | **fixed + live-verified** (2026-06-08, M1 applied: 70 функций; verify 0; PIN + curator смок на проде: 0 errors / 0 upload*fail в Sync Log; log `…\_M1*\*.txt`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SEC-016 | 2026-06-08 | L2   | БД: гранты            | High     | Дефолтный `PUBLIC EXECUTE` не отозван: ~210 функций (admin/crypto/internal) исполнимы ролью PUBLIC. `p1_grants_heys_rpc_only.sql` дал GRANT'ы heys_rpc, но не сделал `REVOKE FROM PUBLIC` → intended REVOKE internal-helpers (`issue_client_session`, `subscription_can_write`) неэффективен; heys_rest (даны явно 4 ф-ции) через PUBLIC получает admin/crypto. Caveat: роли anon нет → не интернет-callable, но ломает blast-radius при компрометации backend-роли                                          | `audit-db.sql` §2/§3; fix → `database/2026-06-08_revoke_public_execute_secdef.sql` (test/rollback внутри)                                      | **fixed + live-verified** (2026-06-08, M2 applied: PUBLIC снят с 70 SECDEF, явный EXECUTE — `heys_rpc` на всё, `heys_rest` на `safe_upsert_client_kv`; verify 0; смок на проде PIN + curator-batch: `safe_upsert_client_kv` path работает, hot-sync success/failed=0; log `…_M2_*.txt`)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SEC-017 | 2026-06-08 | L2   | БД: RLS               | Medium   | RLS включён лишь на 4 из 45 таблиц; **выключен на `clients`, `client_kv_store`, `client_sessions`, `payments`, `consents`, `subscriptions`, аудит-таблицах**. `auth.uid()`-политики из миграций НЕ задеплоены (нет в `pg_policies`). DB-уровень не даёт defense-in-depth — вся изоляция держится на RPC + write_contexts (single layer)                                                                                                                                                                      | `audit-db.sql` §4/§5                                                                                                                           | open (структурное)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| SEC-018 | 2026-06-08 | L0   | Cloud Functions / DoS | High     | 4 user-facing cloud functions (`heys-api-rest`, `heys-api-photos`, `heys-api-payments`, `heys-api-leads`) не проверяют размер HTTP request body. Только `heys-api-rpc` имеет `MAX_BODY_BYTES = 256KB` (index.js:1517-1518). REST POST без auth может получить произвольный JSON; photos принимает base64 (decoded ≤5MB, но raw request тело никак не ограничено до парсинга); payments/leads — публичные endpoint'ы. Атакующий шлёт 100MB JSON → функция парсит → OOM / cold-start lag → DoS / billing-spike | `grep -n "Buffer.byteLength.*event.body\|MAX_BODY_BYTES\|event.body.length" yandex-cloud-functions/heys-api-*/index.js` → защита только в rpc  | **fixed + live-verified** (2026-06-08, REST=512KB / photos=8MB / leads+payments=64KB; deployed REST/photos/leads (payments готов, ждёт YUKASSA-creds deploy); curl-проба: 600KB→REST 413, 100KB→leads 413, 9MB→photos 413 (gateway-level ~3.5MB кроет защитой ниже моего code-cap'a) )                                                                                                                                                                                                                                                                                                                                                                                                                                     |

> Следующий `SEC-018`. Добавляй новые находки сюда; не переписывай существующие.

---

## Раздел 2 — Цель ревью

Не «найти дырки», а проверить, что **каждый путь к чувствительным данным имеет
предсказуемую защиту**. Для HEYS это: клиент видит только свои данные, куратор —
только своих клиентов, платежи и лиды не раскрывают ПДн, а баг синхронизации не
может превратиться в cross-client pollution.

## Раздел 3 — Компоненты, которые обязательно покрываем

| Слой                    | Компоненты                                                     | Класс данных / риска                               | Минимальный уровень защиты                                                    |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Browser / PWA           | `apps/web`, localStorage, service worker, iframe/demo, auth UI | health data, session state, профиль клиента        | XSS-hardening, безопасное хранение, auth-key allowlist, no stale cross-client |
| Landing                 | `apps/landing`, trial-форма, demo-iframe, legal                | leads PII, consent, analytics                      | dep-гигиена, no unsanitized HTML, consent-proof, anti-spam                    |
| Telegram mini app       | `apps/tg-mini`                                                 | curator identity, day-data клиента                 | верификация `initData`, no prod dev-fallback, least-privilege API             |
| Local dev API           | `packages/core/src/server.js`                                  | dev-proxy на прод, SMS-proxy                       | no secret-from-client, явный CORS, no accidental prod bypass                  |
| Cloud API               | `yandex-cloud-functions/heys-api-*`                            | auth, RPC, REST, messages, photos, payments, leads | allowlists, auth на каждый endpoint, rate-limit, generic errors, param SQL    |
| Database                | `database/*.sql`, живой PostgreSQL                             | вся персистентная PII/health                       | RLS/гранты, ревью `SECURITY DEFINER`, session-safe функции, audit-триггеры    |
| Storage / S3            | photos, backups, demo-snapshots                                | meal-фото, бэкапы, demo                            | ownership-checks, bucket policy, object TTL, no public sensitive data         |
| CI/CD                   | `.github/workflows`, deploy-скрипты, hooks                     | supply chain, секреты, release-гейты               | блокирующие security-гейты, secret/dep scanning, reproducible deploy          |
| Monitoring / compliance | alerts, audit logs, DSAR/deletion, consents                    | 152-ФЗ, incident response                          | alerting, immutable audit, retention, deletion-cascade proof                  |

## Раздел 4 — Метод проверки (единый цикл на компонент)

1. **Asset map** — какие данные держит компонент, кто вправе читать/писать, где
   граница доверия.
2. **Entry points** — URL, RPC, REST-таблица, browser-событие, LS-ключ, cron,
   webhook, S3-путь.
3. **Trust checks** — auth, ownership, CORS, origin, signature, истечение
   сессии, роль.
4. **Input/output checks** — валидация, параметризация SQL, санитизация HTML,
   file-limits, generic errors.
5. **State checks** — гонки, stale local state, replay, идемпотентность,
   cross-client pollution.
6. **Evidence** — тест, grep/read, smoke-test, psql, экспорт cloud-config,
   CI-артефакт.
7. **Risk decision** — severity, exploitability, затронутые данные, фикс,
   регрессионный тест. → строка в Журнале (Раздел 1).

## Раздел 5 — Threat model HEYS

| Угроза                     | Проверяемые вопросы                                                                  | Минимальный accept-criteria                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| IDOR / cross-client access | Можно подставить чужой `client_id`/`context_id` в RPC/REST/messages/photos/payments? | Сервер сам выводит owner из session/JWT/capability или проверяет curator-ownership.       |
| Auth brute-force           | Можно перебрать PIN/password/Telegram session?                                       | DB-backed rate-limit + одинаковые ответы без enumeration; желательно per-account lockout. |
| XSS                        | Можно вставить HTML/JS через FAQ, products, messages, logs, profile, lead?           | React-escaping или sanitizer; `dangerouslySetInnerHTML` только trusted/static + CSP.      |
| SQL injection              | Есть динамические table/column/query-строки?                                         | Allowlist таблиц/колонок + параметризованные значения.                                    |
| CSRF / cookie misuse       | Где HttpOnly-cookie принимается как auth?                                            | SameSite-стратегия, origin-checks на state-changing, no wildcard CORS+credentials.        |
| Secrets leakage            | Есть секреты в git/logs/bundle/deploy-stdout?                                        | gitleaks clean, `.env` ignored, logs маскируют секреты, Lockbox.                          |
| Dependency compromise      | Есть critical/high в runtime-пути?                                                   | `pnpm audit` clean для prod/runtime; задокументированные dev-only исключения.             |
| File/object leakage        | Можно прочитать/удалить чужие фото/бэкапы?                                           | Object-keys scoped по owner, delete проверяет owner, bucket policy ревьюнута.             |
| Webhook spoofing           | Можно подделать ЮKassa/Telegram/cron?                                                | Signature/token/IP + replay-protection + идемпотентность.                                 |
| Data deletion / compliance | Удаление клиента чистит KV, sessions, photos, messages, backups?                     | DB cascade + async cleanup + audit-proof.                                                 |

## Раздел 6 — Required evidence matrix (костяк проверок)

Каждый пункт — команда + pass-condition. Это то, что прогоняется в слоях L1–L8.

| Evidence                 | Команда / источник                                            | Pass condition                                                         | Слой |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- |
| Dependency audit         | `pnpm audit --audit-level moderate`                           | 0 critical/high в runtime-пути; dev-only исключения задокументированы. | L1   |
| Custom dep checker       | `node scripts/security/dependency-check.js`                   | Счётчики совпадают с `pnpm audit` (после фикса SEC-001).               | L1   |
| SAST                     | `node scripts/security/sast-scan.js`                          | Завершается без `ENFILE`; исключает `node_modules`/`dist`/бандлы.      | L1   |
| API smoke                | `bash scripts/security-smoke-test.sh`                         | 0 failed; запрещённые write → generic 403/404/405, не внутренности БД. | L1   |
| DB grants                | `psql` по `pg_proc`, `information_schema.role_routine_grants` | Нет sensitive-функций, исполнимых `PUBLIC`; только ожидаемые роли.     | L2   |
| RLS / policies           | `psql` по `pg_policies`, `pg_class.relrowsecurity`            | Sensitive-таблицы под RLS или доступны только через safe-definer RPC.  | L2   |
| Write-context strict     | прод-env функций `HEYS_WRITE_CONTEXT_STRICT`                  | `=1` в проде (или явно принятый риск с компенсацией).                  | L3   |
| CORS                     | `curl -i -X OPTIONS` с allowed и evil origin                  | Allowed получает ACAO; evil — без ACAO/403.                            | L3   |
| Auth brute-force         | скрипт неверных попыток (PIN + login)                         | Lockout/rate-limit работает across instances.                          | L3   |
| XSS probes               | payload'ы в forms/messages/products/FAQ-source                | Рендерится как текст или санитизируется.                               | L4   |
| Object storage           | экспорт bucket policy + upload/delete тесты                   | Нет unauth listing sensitive-объектов; delete требует owner.           | L5   |
| Webhook spoofing         | replay/spoof тесты payments/Telegram webhook                  | Non-provider/non-signed запросы отклоняются.                           | L5   |
| Restore / deletion drill | restore из бэкапа + тест cascade-удаления клиента             | Restore работает; удаление чистит DB-данные и связанные объекты.       | L6   |

---

## Раздел 7 — Чек-листы по компонентам

Нумерация совпадает с Разделом 0. Формат: **Требования** (что должно быть) →
**Проверять** (как) → **Сейчас** (что найдено на 2026-06-08).

### 7.1 Аутентификация — 🟡

- **Требования**: медленный KDF с солью; PIN хешируется; session-токен в БД
  только хешем; JWT ≥32б из хранилища с `exp`; cookie HttpOnly+Secure+SameSite;
  rate-limit per-IP **и** per-account; единый ответ anti-enumeration; MFA для
  кураторов; ротация секрета подписи; ревокация + аудит массовых revoke.
- **Проверять**:
  `grep -rin "pbkdf2\|bcrypt\|crypt(" database yandex-cloud-functions`; 11+
  неверных PIN/логинов → lockout; сравнить ответ «нет аккаунта» vs «неверный
  PIN»; снять флаги cookie.
- **Сейчас**: PBKDF2-SHA512-100k+соль (куратор), pgcrypto PIN, session-токен
  sha256-хешем, HttpOnly+Secure+SameSite=Lax, rate-limit обоих путей,
  anti-enumeration (`2025-12-25_p2`). Пробелы → SEC-011 (MFA, per-account
  lockout, ротация JWT, refresh).

### 7.2 Авторизация / мультитенантная изоляция — 🔴 (P0)

Самый чувствительный компонент HEYS (см. `apps/web/BUGS_HISTORY.md`, курaтор
pollution 2026-05-27/28 — каскад из 4 root-cause).

- **Требования**: `client_id` резолвится на сервере из доверенного контекста, не
  из тела; каждая запись несёт server-issued `context_id`, сервер валидирует и
  **переписывает** scope при mismatch (rerouting, не pollution); **STRICT-режим
  включён в проде**; identity-ключи (`profile/norms/game/hr_zones/dayv2_*`)
  защищены от curator-пути; `CLIENT_SPECIFIC_KEYS` актуален; любой LS-scan
  фильтрует foreign-scoped (`/^heys_([0-9a-f-]{36})_/`); DB per-client
  write-lock.
- **Проверять**: REST/RPC-запись с подменённым `client_id`/`context_id` →
  отвергнуть/перенаправить;
  `grep -rin "validate_write_context\|issue_write_context\|p_context_id" .`;
  прод-значение `HEYS_WRITE_CONTEXT_STRICT`; зайти куратором → ни один
  curator-global ключ не попал в `client_kv_store` клиента.
- **Сейчас**: `write_contexts` + `issue_write_context_by_*` +
  `validate_write_context` (`database/2026-06-02_add_write_contexts.sql`),
  сервер переписывает canonical `client_id` (инвариант №10 `CLAUDE.md`);
  identity-guard + table-whitelist; `curator_write_lock` (default-on). **Главный
  пробел → SEC-004**: STRICT off по умолчанию (warn-only). RLS `auth.uid()`
  инертен под `heys_rpc` — изоляция держится на RPC + write_contexts, не на RLS.

### 7.3 БД: роли, RLS, SECURITY DEFINER — 🟡

- **Требования**: все `SECURITY DEFINER` с `SET search_path`; runtime-роли
  только нужные `EXECUTE`, internal-helpers `REVOKE`; `anon`/`authenticated` без
  прямого доступа к sensitive-таблицам; все FK на `clients(id)` — CASCADE;
  триггеры с orphan-guard; sensitive-таблицы под `USING (false)`; PII-колонки —
  шифрование/хеш.
- **Проверять** (L2): `grep -rh "SECURITY DEFINER" database | wc -l` + наличие
  `search_path`; под `heys_rpc` `SELECT * FROM client_sessions` → отказ;
  psql-снимок `pg_policies`/`role_routine_grants`/`relrowsecurity`.
- **Сейчас**: `SET search_path=public` системно; least-privilege GRANT+REVOKE
  internal (`2025-12-25_p1_grants_heys_rpc_only.sql`); sensitive под
  `USING(false)`; FK CASCADE по 11 таблицам. Пробелы: RLS `auth.uid()`
  вестигиальна; **живые гранты не сняты → SEC-013**; audit-таблицы tamper;
  колоночное шифрование PII (⚪).

### 7.4 Cloud Functions — 🟡

- **Требования**: секреты из Lockbox (placeholder-strip); CORS-whitelist без `*`
  при credentials; auth на каждой не-публичной функции; подпись webhook; лимит
  размера тела + таймаут БД; generic-ошибки наружу; TLS к БД
  `rejectUnauthorized`.
- **Проверять**: запрос с чужого Origin; без `Authorization` → 401/403; большое
  тело → отказ; греп `console.log` секретов.
- **Сейчас**: Lockbox (`shared/secrets.js`,`lockbox-client.js`), CORS-whitelist,
  JWT/session middleware (`shared/auth-helpers.js`), TLS `rejectUnauthorized`
  prod, `query_timeout:10000`. Пробелы: нет лимита тела; вербозность ошибок; нет
  circuit-breaker Lockbox.

### 7.5 API: REST / RPC — 🟡

- **Требования**: только параметризация; whitelist таблиц **и** колонок (regex);
  type-cast; жёсткий потолок `LIMIT`/`OFFSET`; обязательный фильтр
  DELETE/PATCH + верхняя граница строк; лимит тела/массивов; generic-ошибки.
- **Проверять**: инъекционные строки в фильтрах/колонках; `LIMIT 1000000` →
  обрезка; DELETE/PATCH без фильтра → отказ; таблица вне whitelist → 4xx.
- **Сейчас**: `client.query(sql,[params])`, `ALLOWED_TABLES`(6),
  `ALLOWED_COLUMNS`, regex `^[a-zA-Z_][a-zA-Z0-9_]*$`, `::uuid`. Пробелы:
  `LIMIT` без потолка; **POST течёт `42601` → SEC-003**; нет schema-валидации.

### 7.6 Управление секретами — 🟢

- **Требования**: секреты только в хранилище/env, не в git/логах/бандле; `.env*`
  `*.pem` `*.key` в ignore; gitleaks в pre-commit/CI; документированная ротация;
  аудит доступа к Lockbox.
- **Проверять**: `git ls-files | grep -iE '\.env|secret|\.pem|\.key'`; gitleaks
  по истории.
- **Сейчас**: Lockbox+env, `.gitignore`/`.ycignore` покрывают env, gitleaks
  workflow, placeholder-strip. ✓ В гите только `apps/tg-mini/.env.telegram` —
  внутри Vite-конфиг **без секретов**. Пробелы: нет политики ротации; нет аудита
  Lockbox; стоит добавить `.env.telegram` в ignore.

### 7.7 Транспорт / HTTP-заголовки — 🟡

- **Требования**: HTTPS+HSTS `includeSubDomains`; **CSP**
  (script/object/base-uri, желательно report-uri);
  `X-Frame-Options DENY`/`frame-ancestors none`; `nosniff`; `Referrer-Policy`;
  `Permissions-Policy`; cookie HttpOnly+Secure+SameSite(Strict где можно); TLS к
  БД `rejectUnauthorized` prod.
- **Проверять**: `curl -sI <api>`;
  `grep -rin "Strict-Transport\|X-Frame\|Content-Security" yandex-cloud-functions`.
- **Сейчас**: HSTS 2г+subdomains, X-Frame DENY, nosniff, Referrer-Policy,
  Secure-cookie, TLS prod. **Пробел → SEC-005**: нет CSP. Также SameSite=Lax,
  нет Permissions-Policy.

### 7.8 Client-side / XSS / DOM (web) — 🟡

- **Требования**: нет `eval`/`new Function`/`document.write` с user-data;
  user-текст через `textContent`/escaping; токены не в `localStorage`;
  CSP-backstop; санитизация контента «куратор→клиент».
- **Проверять**:
  `grep -rin "innerHTML\|insertAdjacentHTML\|new Function\|eval(" apps/web`
  - трассировка источника; ввести `<img src=x onerror=alert(1)>` в название
    продукта/сообщение.
- **Сейчас**: нет `eval`/`new Function`; `innerHTML` в просмотренных местах —
  внутренние строки. ⚪ Санитизация user-content не подтверждена (L4); legacy
  токен в localStorage; усиливается отсутствием CSP.

### 7.9 Валидация входа / инъекции — 🟡

- **Требования**: 100% параметризация; строгие типы/касты; лимиты длины строк и
  размера массивов/тела; единые сообщения об ошибке.
- **Проверять**: аудит мест построения SQL (только `$n`); сверхдлинные
  строки/большие массивы → отбраковка; сравнить ошибки enumeration.
- **Сейчас**: параметризация+касты, phone-enumeration закрыт. Пробелы: лимиты
  длины/размера не enforced; `LIMIT` без границы (пересечение с 7.5).

### 7.10 Rate limiting / anti-abuse — 🟡

- **Требования**: rate-limit оба пути (per-IP **и** per-account); прогрессивный
  backoff в БД (переживает cold-start); CAPTCHA/PoW на публичных формах;
  доверенный источник client-IP; квоты на дорогие чтения.
- **Проверять**: серия неверных попыток → lockout + `security_events`; подмена
  `X-Forwarded-For` не сбрасывает лимит.
- **Сейчас**: PIN 10/15мин, логин 10/15мин (БД), лимит лидов, anti-enumeration.
  Пробелы: нет CAPTCHA; обход ротацией IP; нет per-account lockout; спуф XFF;
  REST GET без лимита.

### 7.11 Логирование / аудит / PII — 🟡

- **Требования**: никаких секретов/PIN/токенов в логах; `LOG_LEVEL`-gating, prod
  без env-дампов; аудит append-only (роль без UPDATE/DELETE; рассмотреть
  hash-chain); retention + архивация независимо от удаления клиента; алерты на
  security-события.
- **Проверять**: греп логов на `password|token|pin|secret`; привилегии роли на
  audit-таблицы; cascade-delete клиента не стирает security-аудит.
- **Сейчас**: `data_access_audit_log`/`data_loss_audit`/`security_events`,
  `2026-05-28_audit_session_revoke.sql`, `LOG_LEVEL`-gating,
  `heys-cron-security-alerts`. Пробелы: аудит правит runtime-роль, не шифрован,
  без retention; обход прямым SQL.

### 7.12 Целостность синхронизации / защита данных — 🟡

> Для HEYS целостность данных — **security-свойство**: исторически именно здесь
> происходили реальные потери/«протекания» данных клиентов.

- **Требования**: никаких cleanup/GC по shape-inference — только явные
  tombstones/ версии (инвариант №7); shrink-guard с tombstone-tolerance;
  централизованная штамповка (не инжектить TS без caller'а); **server-revision
  write-merge** против clock-skew; LS-scan фильтрует foreign-scoped (инвариант
  №9); CJS/ESM mirror-checks.
- **Проверять**: lint-гейты (`lint-shared-cache-writes`,
  `lint-direct-localstorage-writes`, `lint-unscoped-client-writes`,
  `lint-sync-merge-cjs-mirror`); сценарий «stale-телефон
  - спешащие часы» не выигрывает конфликт; `server_revision` реально приходит в
    kv-строках.
- **Сейчас**: shrink-guard, tombstones, central stamper, `isNonClientDataKey`,
  `curator_write_lock`, набор lint'ов. **Потолок → SEC-007**: LWW на
  `Date.now()` устройства; pull-gate `heys_storage_supabase_v1.js:12187`
  возвращает `true` без `server_revision`.

### 7.13 Резервное копирование / DR — 🟡

- **Требования**: регулярный авто-бэкап + проверка успешности; периодический
  **тест restore**; зафиксированные RPO/RTO; шифрование архивов +
  least-privilege к bucket; FK CASCADE/целостность.
- **Проверять** (L6): `restore-client-backup.js --dry-run`; сверка ключей
  до/после; права S3-ключа (только нужный bucket).
- **Сейчас**: `heys-client-daily-backup` (S3), процедура restore **применялась**
  (11 ключей, 2026-05-27), FK CASCADE, S3-креды в Lockbox. Пробелы: нет
  restore-drill цикла; RPO/RTO не задокументированы; шифрование архивов (⚪).

### 7.14 Зависимости / supply chain — 🔴 (P0)

- **Требования**: локфайл коммитится, пиннинг где возможно; авто `pnpm audit`
  (fail на high/critical) в CI; SAST/CodeQL + gitleaks в pipeline;
  pre-commit/pre-push гейты; SBOM/provenance.
- **Проверять**: `pnpm audit --prod`; ревью `.github/workflows`; gitleaks по
  истории; pre-push нельзя обойти без `--no-verify`.
- **Сейчас**: gitleaks, набор lint-гейтов, pnpm-lock; **`dependency-check.js`
  починен (SEC-001)**. Пробелы → SEC-010: 5 critical/72 high (нужен prod/dev
  split); `^`-диапазоны; нет SBOM. См. также 7.15.

### 7.15 SAST / Security CI — 🔴

- **Требования**: SAST завершается, исключает `node_modules`/бандлы;
  security-гейты **блокирующие** (не `continue-on-error`); secret/dep-scan в
  pipeline.
- **Проверять**: `node scripts/security/sast-scan.js`;
  `.github/workflows/security-scan.yml` на `continue-on-error`.
- **Сейчас**: workflow есть. Пробелы → SEC-002: SAST падает `ENFILE`; гейты
  `continue-on-error` (строки 45-47, 78-80 по facts-table) — не блокируют.

### 7.16 Landing app — 🟡

- **Требования**: dep-гигиена (`next` без critical); no unsanitized HTML;
  security-headers в `next.config.js`; demo-iframe sandbox без
  `allow-same-origin`+`allow-scripts` одновременно.
- **Проверять**: `pnpm --filter landing audit`; трассировка источника FAQ
  `items`; ревью iframe `sandbox`.
- **Сейчас**: static export, lead API consent/honeypot/rate-limit. Пробелы:
  `next@14.2.18` advisories; FAQ `dangerouslySetInnerHTML` → **SEC-008**
  (severity зависит от источника `items` — проследить); iframe
  `allow-same-origin`+`allow-scripts` → **SEC-012**; нет security-headers.

### 7.17 Telegram Mini App — 🟡

- **Требования**: серверная верификация `initData` (HMAC по bot-token); no prod
  dev-fallback; initData не в логах в prod; least-privilege API.
- **Проверять**: аудит backend-верификатора `initData`; grep dev-логов на
  initData.
- **Сейчас**: шлёт `X-Telegram-Init-Data` + Bearer централизованно; dev-fallback
  за `import.meta.env.DEV`. ⚪ Реализация серверной hash-валидации не
  подтверждена (L3/L5); dev-логи содержат initData.

### 7.18 Payments / ЮKassa — 🟡

- **Требования**: returnUrl-whitelist; consent перед оплатой; webhook —
  криптоподпись + replay-protection + идемпотентность (не только IP); никаких
  карточных данных на стороне приложения.
- **Проверять** (L5): replay/spoof webhook без подписи → отказ; ревью
  gateway-spec.
- **Сейчас**: returnUrl-whitelist, oferta-consent, webhook IP-allowlist.
  Пробелы: gateway-spec помечает payments как stub/TODO; нужна подпись webhook
  сверх IP.

### 7.19 Photos / object storage — 🟡

- **Требования**: object-keys scoped по owner; delete проверяет owner;
  upload-cap; **не** `public-read` для PII; bucket policy + lifecycle/TTL;
  подписанные URL для приватного.
- **Проверять** (L5): экспорт bucket policy; upload/delete чужого объекта;
  проверить ACL meal-фото.
- **Сейчас**: auth-резолв владельца, ownership на delete, 5MB cap. Пробел →
  SEC-006: `ACL: public-read` (URL = доступ); подтвердить, что это meal-фото
  (PII), не demo.

### 7.20 Messages / push — 🟡

- **Требования**: client/curator auth; валидация payload; rate-limit
  **переживающий cold-start** (БД, не память); минимизация PII в push; privacy
  уведомлений.
- **Проверять**: cold-start сбрасывает лимит? содержимое push.
- **Сейчас**: auth-резолв, валидация payload, VAPID через Lockbox. Пробел →
  SEC-009: rate-limit 30/мин **в памяти**; приватность push не разобрана.

### 7.21 Leads / consent (152-ФЗ) — 🟡

- **Требования**: honeypot + серверный required-consent + email-валидация + 18+
  gate; DB-side uniqueness/rate-limit; минимизация PII в нотификациях; CORS не
  отдаёт default origin для disallowed.
- **Проверять**: DB-side rate-limit/uniqueness; abuse-тест формы; CORS на
  disallowed origin.
- **Сейчас**: honeypot, серверный consent, 18+ gate, минимизация PII в Telegram.
  Пробелы: нужна DB-side проверка; CORS-fallback отдаёт default origin для
  disallowed.

### 7.22 Local dev API proxy — 🟡

- **Требования**: секрет только из server-env (не от клиента); явный CORS; **no
  accidental prod bypass**; dev-only, не в prod-сборке.
- **Проверять**: куда проксирует по умолчанию; не уходит ли dev-трафик/секрет на
  прод.
- **Сейчас**: SMS-ключ из server-env, валидация phone/message. Риск: проксирует
  `/rpc /rest /auth /messages /photos` на **прод** по умолчанию
  (`packages/core/src/server.js`) — держать dev-only, не давать обходить
  прод-защиты.

---

## Раздел 8 — Прогон инструментов (статус L1)

| Проверка           | Команда                                     | Результат 2026-06-08                                                                 |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Dependency audit   | `pnpm audit --audit-level moderate`         | 160 total: 5 critical / 72 high / 63 moderate / 20 low → SEC-010                     |
| Custom dep checker | `node scripts/security/dependency-check.js` | Был «0» (ложь) → **починен** (SEC-001); теперь считает по `metadata.vulnerabilities` |
| SAST               | `node scripts/security/sast-scan.js`        | `ENFILE: file table overflow` → SEC-002                                              |
| API smoke          | `bash scripts/security-smoke-test.sh`       | 8 passed / 1 failed (REST POST `42601`) → SEC-003                                    |

---

## Раздел 9 — Facts Table (реестр подтверждённого)

«Claim → источник → команда → результат». Дополняй при каждом слое.

| Claim                                                       | Команда / источник                                         | Результат                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| REST write-context может быть warn-only без strict-флага    | `rg -n "HEYS_WRITE_CONTEXT_STRICT" yandex-cloud-functions` | Подтверждено: `STRICT_MODE = … === '1'`, default off              |
| `pnpm audit` показывает critical/high                       | `pnpm audit --audit-level moderate`                        | 160 (5 critical / 72 high / 63 mod / 20 low)                      |
| Кастомный dep-checker рапортовал 0                          | `node scripts/security/dependency-check.js`                | Было «0» → исправлено (парсер `metadata.vulnerabilities`)         |
| dep-checker корректно считает после фикса                   | `node --check` + синтетический v6/v7 report                | v6→160 (exit 2), v7→1, пусто→unknown (exit 1)                     |
| SAST падает локально                                        | `node scripts/security/sast-scan.js`                       | `ENFILE: file table overflow`                                     |
| Прод smoke имеет 1 фейл                                     | `bash scripts/security-smoke-test.sh`                      | 8 passed / 1 failed (REST POST блок)                              |
| CSP отсутствует в functions                                 | `grep -ri content-security-policy yandex-cloud-functions`  | Пусто (нет CSP)                                                   |
| Единственный tracked `.env` — без секретов                  | `git ls-files \| grep .env` + чтение                       | `apps/tg-mini/.env.telegram` = Vite-конфиг, секретов нет          |
| Auth: HttpOnly+Secure+SameSite=Lax cookie, токен и в теле   | `heys-api-auth/index.js` (~305-335)                        | Подтверждено                                                      |
| Session-токены хранятся sha256-хешем                        | `shared/auth-helpers.js` (~1-72)                           | Подтверждено                                                      |
| Landing FAQ рендерит HTML через `dangerouslySetInnerHTML`   | `FAQAccordion.tsx:53`                                      | Подтверждено; источник `items` не прослежен                       |
| Security workflow помечает SAST/dep как `continue-on-error` | `.github/workflows/security-scan.yml` (45-47, 78-80)       | Подтверждено (из исходного методдока)                             |
| Photos пишутся `public-read`                                | static read `heys-api-photos`                              | Подтверждено; нужно подтвердить, что это meal-фото                |
| SAST бежит без ENFILE после фикса каталог-прунинга          | `node scripts/security/sast-scan.js`                       | 4516 файлов, 8644 хита (шумно: 7764 `Date.now()`)                 |
| Готов read-only L2-аудит БД                                 | `scripts/security/audit-db.sql`                            | Создан; прод-прогон ждёт окружения с доступом к БД                |
| Из песочницы прод-БД недоступна                             | `bash scripts/db/psql.sh -tAc "select 1"`                  | `yc` IAM timeout (Lockbox недоступен) → L2 не из песочницы        |
| L2 §1: SECDEF без `search_path`                             | `audit-db.sql` на проде                                    | 70 функций (вкл. PIN/crypto/admin) → SEC-015                      |
| L2 §2/§3: `PUBLIC EXECUTE` не отозван                       | `audit-db.sql`                                             | ~210 ф-ций PUBLIC; heys_rest явно 4, но PUBLIC даёт все → SEC-016 |
| L2 §4: RLS на таблицах                                      | `audit-db.sql`                                             | RLS on только 4/45; clients/kv/sessions/payments — off → SEC-017  |
| L2 §6: прямой доступ anon/PUBLIC к таблицам                 | `audit-db.sql`                                             | 0 строк — прямого table-доступа нет ✓                             |
| L2 §7: FK на clients(id)                                    | `audit-db.sql`                                             | 19 FK, все CASCADE кроме leads=SET NULL ✓                         |

---

## Приложение A — ключевые файлы и инварианты

- Инварианты безопасности: `CLAUDE.md` (№3–№10), `apps/web/ARCHITECTURE.md`.
- История инцидентов (root-cause + паттерны): `apps/web/BUGS_HISTORY.md`.
- Изоляция арендаторов: `database/2026-06-02_add_write_contexts.sql`,
  `database/2026-05-28_curator_write_lock.sql`, `heys-api-rpc/index.js:569`,
  `heys-api-rest/index.js:114`.
- Привилегии/роли: `database/2025-12-25_p1_grants_heys_rpc_only.sql`.
- Auth: `heys-api-auth/index.js`, `database/2025-12-12_phone_pin_auth.sql`,
  `database/2025-12-24_subscriptions_and_sessions.sql`.
- Секреты/TLS:
  `yandex-cloud-functions/shared/{secrets.js,lockbox-client.js,db-pool.js}`,
  `gitleaks.toml`.
- Security-скрипты/гейты: `scripts/security/*`, `.husky/`, `scripts/lint-*.mjs`,
  `.github/workflows/`.

## Приложение B — оговорки точности

- Оценки Раздела 0 — статика + частичный прогон L1 на 2026-06-08. Пункты `⚪` и
  часть `~` требуют слоёв L2–L8.
- **Миграции/код = намерение, не задеплоенное состояние.** Гранты/RLS/прод-флаги
  — подтверждать живой проверкой (L2/L3).
- Номера строк дрейфуют — искать по имени функции (`grep -n`).
- Часть находок скана уточнена при верификации: `.env.telegram` без секретов;
  RLS-`auth.uid()` вестигиальна, не дыра; `dependency-check` чинён и проверен.

## Приложение C — история документа

- 2026-06-08 — собран канонический документ; сведены
  `docs/SECURITY_REVIEW_METHODOLOGY_2026-06-08.md` + статический разбор изоляции
  и sync; добавлены TODO-дорожная карта, Журнал находок, исправление SEC-001.
  Исходные документы оставлены как историчные.

---

## Раздел 10 — L3-L5 Attack Plan (исполнить следующей сессией)

**Назначение:** конкретный исполнимый чек-лист 18 проб для динамики L3
(auth/доступ), L4 (инъекции/XSS), L5 (storage/webhooks). Каждая проба: команда,
что считать PASS, что считать FAIL, severity при FAIL. План построен поверх
результата deep-audit (новая находка SEC-018, severity bump SEC-012).

**Предусловия (нужно от пользователя до исполнения):**

- **L3.1 / L3.2** brute-force: тестовый номер `+71234567890` (несуществующий
  клиент, rate-limit проверяется per-IP, не аффектит реальных пользователей).
- **L3.3 / L3.4** IDOR: 2 реальных PIN+phone от пользователя —
  `<USER_PHONE>`+`<USER_PIN>` (его клиент-аккаунт) и
  `<CURATOR_PHONE>`+`<CURATOR_PIN>` (его куратор-сессия, чтобы через
  куратор-токен иметь UUID другого клиента для cross-read). Альтернатива:
  `admin_get_all_clients()` чтобы достать UUID для подмены.
- **L3.7** `HEYS_WRITE_CONTEXT_STRICT`: `yc` CLI на машине агента + access к
  функции `heys-api-rest` (или `psql` доступ для `data_loss_audit` инспекции).
- **L5.1** S3 bucket policy: `yc storage` CLI с правами read на бакет фото (имя
  бакета — узнать из `yandex-cloud-functions/heys-api-photos/index.js`).
- **L5.3** ЮKassa webhook: запускать ТОЛЬКО на test-сумме (например 1 руб),
  чтобы не помечать реальный платёж как paid. Откатить через psql если случайно
  прошёл.

### L3 — Auth/доступ (7 проб, ~17 мин)

#### L3.1 — Brute-force PIN per-IP rate-limit

```bash
for i in {1..12}; do
  curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin_v3" \
    -H "Content-Type: application/json" \
    -d '{"p_phone":"+71234567890","p_pin":"1234"}' \
    | jq -r '.error // .code // .message'
done
```

- **PASS:** ≥10-я попытка возвращает `pin_locked_until` / `rate_limit` /
  `too_many_attempts` или HTTP 429.
- **FAIL:** все 12 попыток возвращают `invalid_credentials` без блокировки.
- **Risk при FAIL:** Critical — бесконечный PIN-brute.
- **Подтверждение в БД:**
  `bash scripts/db/psql.sh -c "SELECT ip, attempts, reset_at FROM security_events WHERE event_type LIKE 'pin%' ORDER BY created_at DESC LIMIT 5;"`

#### L3.2 — Brute-force login (email+password) per-IP

```bash
for i in {1..12}; do
  curl -s -X POST "https://api.heyslab.ru/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"nonexistent@example.com","password":"wrong"}' \
    | jq -r '.error // .message'
done
```

- **PASS:** ≥10-я попытка → HTTP 429 / `Too many login attempts` / `retryAfter`.
- **FAIL:** все 12 попыток → `invalid_credentials`.
- **Risk при FAIL:** Critical — bruteforce куратор-паролей.
- **Подтверждение:**
  `bash scripts/db/psql.sh -c "SELECT * FROM auth_rate_limits WHERE reset_at > NOW();"`

#### L3.3 — IDOR client_id в RPC get_client_data (cross-read)

**Сценарий:** получить токен Alice. Попытаться вызвать `get_client_data` с
`p_client_id` Bob.

```bash
TOKEN_ALICE=$(curl -s -X POST "https://api.heyslab.ru/rpc?fn=verify_client_pin_v3" \
  -H "Content-Type: application/json" \
  -d '{"p_phone":"<USER_PHONE>","p_pin":"<USER_PIN>"}' \
  | jq -r '.session_token // .token')
BOB_UUID="<CURATOR_OBSERVES_CLIENT_UUID>"
curl -s -X POST "https://api.heyslab.ru/rpc?fn=get_client_data" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -d "{\"p_client_id\":\"$BOB_UUID\"}" | jq .
```

- **PASS:** HTTP 403 / `not_authorized` / пустой результат /
  `mismatched_client`.
- **FAIL:** данные Bob возвращаются (имя, meals, профиль).
- **Risk при FAIL:** Critical — полная утечка через IDOR.

#### L3.4 — IDOR context_id (cross-write detection в warn-mode)

```bash
curl -s -X POST "https://api.heyslab.ru/rest/client_kv_store" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"<ALICE_UUID>\",\"k\":\"heys_dayv2_2026-06-08\",\"v\":{\"meals\":[{\"id\":\"x\"}]},\"context_id\":\"<BOB_UUID>\"}" \
  | jq .
```

- **PASS warn-mode** (`STRICT=0`): HTTP 200 + в БД:
  `bash scripts/db/psql.sh -c "SELECT action, details FROM data_loss_audit ORDER BY created_at DESC LIMIT 3;"`
  показывает `context_rerouted` / `context_mismatch` / `cross_client`.
- **PASS strict-mode** (`STRICT=1`): HTTP 400/403 + `context_invalid` /
  `context_required`.
- **FAIL:** HTTP 200 + НЕТ audit-записи (write прошёл молча).
- **Risk при FAIL:** High — единственный детектор cross-client нем.

#### L3.5 — CORS evil-origin (echo-check)

```bash
for origin in "https://evil.com" "null" "file://" "data:text/html"; do
  echo "=== Origin: $origin ==="
  curl -s -X OPTIONS "https://api.heyslab.ru/auth/login" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: POST" \
    -D - -o /dev/null | grep -iE "HTTP|access-control-allow-origin"
done
```

- **PASS:** ни в одном случае `Access-Control-Allow-Origin` не равен переданному
  Origin и не `*`. Допустимо отсутствие заголовка ACAO или явное 403.
- **FAIL:** ACAO = переданному Origin / `*`.
- **Risk при FAIL:** High — CSRF с любого сайта (с учётом credentials cookie).

#### L3.6 — Token replay (expired JWT)

```bash
EXPIRED_JWT="<crafted_jwt_with_exp_in_past>"
curl -s -X POST "https://api.heyslab.ru/rpc?fn=get_client_data" \
  -H "Authorization: Bearer $EXPIRED_JWT" \
  -d '{}' | jq .
```

- **PASS:** HTTP 401 + `token_expired` / `unauthorized`.
- **FAIL:** HTTP 200 / `valid: true` с истекшим токеном.
- **Risk при FAIL:** Critical — токены живут вечно.
- **Открытый вопрос:** алгоритм JWT (RS256 / HS256) — посмотреть в
  `heys-api-auth/index.js` перед крафтом.

#### L3.7 — `HEYS_WRITE_CONTEXT_STRICT` env value в проде (SEC-004 статус)

```bash
yc serverless function version list --function-name heys-api-rest \
  --format json | jq '.[0].environment.HEYS_WRITE_CONTEXT_STRICT'
# или косвенно — через активность detector'a:
bash scripts/db/psql.sh -c "SELECT action, count(*) FROM data_loss_audit \
  WHERE created_at > NOW() - INTERVAL '24 hours' \
  GROUP BY action ORDER BY count DESC LIMIT 10;"
```

- **PASS:** `"1"` (strict ON) ИЛИ `"0"` + `data_loss_audit` показывает >0
  entries за сутки (warn активен).
- **FAIL:** `"0"` И `data_loss_audit` за сутки пуст (нет ни strict-блока, ни
  warn-логов — детектор молчит).
- **Risk при FAIL:** Medium — основная защита от cross-client молча отключена.

### L4 — Инъекции/XSS (6 проб, ~18 мин)

#### L4.1 — SQL-injection в REST WHERE-фильтрах

```bash
curl -s "https://api.heyslab.ru/rest/shared_products?select=id,name&id=eq.1%27%20OR%20%271%27%3D%271" | jq .
# Альтернативный пейлод:
curl -s "https://api.heyslab.ru/rest/shared_products?select=id&id=eq.1)%3B%20SELECT%201--" | jq .
```

- **PASS:** HTTP 400 / пустой результат / `invalid_query`. Никаких SQLSTATE
  кодов в ответе (SEC-003 уже фикшен).
- **FAIL:** возврат всех записей (`OR '1'='1'` сработал) или `SQLSTATE` в JSON.
- **Risk при FAIL:** Critical.

#### L4.2 — SQL-injection в REST SELECT (UNION / DROP попытка)

```bash
curl -s "https://api.heyslab.ru/rest/shared_products?select=id%3BDROP%20TABLE%20clients" | jq .
# Контроль: clients таблица существует?
bash scripts/db/psql.sh -c "SELECT count(*) FROM clients;"
```

- **PASS:** HTTP 400 «Invalid select columns» + clients таблица жива.
- **FAIL:** clients таблица удалена (БД крах).
- **Risk при FAIL:** Critical.

#### L4.3 — RPC JSON-injection через спец-символы

```bash
curl -s -X POST "https://api.heyslab.ru/rpc?fn=merge_save_day_v1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -d "{\"p_client_id\":\"<ALICE_UUID>\",\"p_date\":\"2026-06-08\",\"p_data\":{\"meals\":[{\"name\":\"x'); DROP TABLE clients;--\",\"id\":\"x\"}]}}" \
  | jq .
```

- **PASS:** HTTP 200 + meal сохранён со строкой как-есть (jsonb принимает любые
  символы) ИЛИ HTTP 400 schema validation.
- **FAIL:** БД крах / таблица удалена.
- **Risk при FAIL:** Critical.

#### L4.4 — XSS payload через meal-name (stored XSS)

**Серверная часть:** записать meal с XSS-полезной нагрузкой:

```bash
curl -s -X POST "https://api.heyslab.ru/rest/client_kv_store" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"<ALICE_UUID>\",\"k\":\"heys_dayv2_2026-06-08\",\"v\":{\"meals\":[{\"name\":\"<img src=x onerror=fetch('https://api.heyslab.ru/health').then(r=>console.log('XSS_FIRED'))>\",\"id\":\"x\"}]}}"
```

**Клиентская часть:** залогиниться `app.heyslab.ru` под Alice, открыть DayTab
`2026-06-08`, проверить DevTools Console.

- **PASS:** имя отображается как текст `<img src=x onerror=...>` (React-escape
  работает).
- **FAIL:** в консоли `XSS_FIRED` (полезная нагрузка выполнилась).
- **Risk при FAIL:** High — stored XSS.
- **Очистка:** удалить тестовый meal через UI или REST DELETE.
- **Замечание:** во избежание загрязнения реального дня, можно использовать
  выделенный test-key (например `heys_dayv2_2030-01-01`).

#### L4.5 — XSS в FAQ landing (SEC-008 origin trace)

Без curl — static code-trace:

```bash
grep -rn "FAQAccordion\|<FAQ" apps/landing/src/ --include="*.tsx" --include="*.ts"
# Найти где prop `items` инициализируется.
```

- **PASS:** `items` — hardcoded в .tsx, нет admin-endpoint для редактирования.
  SEC-008 → `accepted-risk` или `false-positive`.
- **FAIL:** есть endpoint `POST /admin/faq` принимающий свободный HTML. SEC-008
  → High (Stored XSS).
- **Risk при FAIL:** High.

#### L4.6 — Path-traversal в photo upload

```bash
curl -s -X POST "https://api.heyslab.ru/photos/upload" \
  -H "Authorization: Bearer $TOKEN_ALICE" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"../../../etc/passwd\",\"data\":\"$(echo 'test' | base64)\"}" \
  | jq .
# Контроль:
yc storage object list --bucket <BUCKET> --prefix 'etc/' 2>&1 | head
```

- **PASS:** HTTP 400 «invalid filename» или filename нормализуется
  (`passwd_<uuid>.png`).
- **FAIL:** файл сохранён в S3 по пути `etc/passwd`.
- **Risk при FAIL:** High — перезапись соседних объектов.

### L5 — Storage / webhooks (5 проб, ~12 мин)

#### L5.1 — S3 photos bucket policy

```bash
# Имя бакета:
grep -n "PHOTO_BUCKET\|BUCKET_NAME\|bucket:" yandex-cloud-functions/heys-api-photos/index.js | head -3
# Замени <BUCKET>:
yc storage bucket get <BUCKET> --format json | jq '.acl, .policy'
# или через aws CLI:
aws --endpoint-url=https://storage.yandexcloud.net s3api get-bucket-policy --bucket <BUCKET>
```

- **PASS:** policy `Principal != "*"` / нет публичных `s3:GetObject` / ACL =
  private.
- **FAIL:** `Principal:"*"` + `Action:"s3:GetObject"` + `Effect:"Allow"`.
- **Risk при FAIL:** High — фото утекают по URL.

#### L5.2 — Photo enumeration по UUID

```bash
PHOTO_URL_ALICE="https://storage.yandexcloud.net/<BUCKET>/<ALICE_UUID>/<filename>"
PHOTO_URL_RANDOM=$(echo $PHOTO_URL_ALICE | sed "s/<ALICE_UUID>/$(uuidgen)/")
curl -sI "$PHOTO_URL_ALICE" | head -1
curl -sI "$PHOTO_URL_RANDOM" | head -1
```

- **PASS:** Alice URL → 200; Random UUID → 403/404. ИЛИ обе требуют подписанный
  URL (`X-Amz-Signature`).
- **FAIL:** обе возвращают 200 (открытый доступ по знанию URL).
- **Risk при FAIL:** Critical — массовое сканирование фото через UUID brute.
- **Открытый вопрос:** endpoint скачивания фото может проксироваться через cloud
  function — посмотреть `apps/web/heys_photos_*.js`.

#### L5.3 — ЮKassa webhook spoofing

```bash
curl -s -X POST "https://api.heyslab.ru/payments/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.succeeded","object":{"id":"fake-test","amount":{"value":"1.00","currency":"RUB"},"metadata":{"client_id":"<ALICE_UUID>"}}}' \
  | jq .
# Контроль:
bash scripts/db/psql.sh -c "SELECT id, status, amount, created_at FROM payments WHERE id='fake-test';"
```

- **PASS:** HTTP 403 / `invalid_signature` / `forbidden_ip`. В payments нет
  записи fake-test.
- **FAIL:** HTTP 200 + запись в payments с amount=1 и status=succeeded.
- **Risk при FAIL:** Critical — бесплатный платный доступ.
- **Откат при FAIL:**
  `bash scripts/db/psql.sh -c "DELETE FROM payments WHERE id='fake-test';"`.

#### L5.4 — Telegram webhook spoofing (если endpoint существует)

```bash
grep -rn "/tg/webhook\|telegram.*webhook\|setWebhook" yandex-cloud-functions/ | head
# Если найден:
curl -s -X POST "https://api.heyslab.ru/<endpoint>" \
  -H "Content-Type: application/json" \
  -d '{"update_id":99999,"message":{"chat":{"id":-1001234},"text":"/admin_reset"}}' \
  | jq .
```

- **PASS:** 403 / `unauthorized` / требуется `X-Telegram-Bot-Api-Secret-Token`.
- **FAIL:** 200 OK + fake-команда обработана.
- **Risk при FAIL:** High.

#### L5.5 — Cron-secret unsigned invocation

```bash
grep -n "cron-security-alerts\|cron-reminders\|cron-trial-drip" yandex-cloud-functions/api-gateway-spec*.yaml
# Если есть HTTP endpoint:
curl -s -X POST "https://api.heyslab.ru/cron/security-alerts" \
  -H "Content-Type: application/json" -d '{}' | jq .
```

- **PASS:** HTTP 401 / `unauthorized` / требуется `X-Internal-Cron-Token`. ИЛИ
  endpoint не существует (cron только через `serverless triggers timer`).
- **FAIL:** 200 OK + alerts отправлены (внешний DoS / спам).
- **Risk при FAIL:** Medium.

### Сводка плана исполнения

| Слой      | Проб   | Время       | Ожидаемых находок                         |
| --------- | ------ | ----------- | ----------------------------------------- |
| L3        | 7      | ~17 мин     | 1–2 (warm-up + статус SEC-004)            |
| L4        | 6      | ~18 мин     | 0–2 (REST/RPC санитизация должна держать) |
| L5        | 5      | ~12 мин     | 1–3 (S3 policy + webhook signing непрямо) |
| **Итого** | **18** | **~45 мин** | **2–5**                                   |

### Куда писать результаты

- Каждая PASS-проба: пометка `live-verified 2026-06-XX` в строке
  соответствующего SEC-NNN.
- Каждая FAIL-проба: новая строка `SEC-019+` в Журнале с
  командой-доказательством.
- После завершения слоя: статус слоя в Дорожной карте `⬜ → ✅` / `🔄`; обновить
  Раздел 0 строк затронутых компонентов.
