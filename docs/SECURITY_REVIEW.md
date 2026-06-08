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

| Слой   | Что прогоняем                                                                                                                            | Статус | Куда пишем результат                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| **L0** | Статический разбор репо: код, миграции, cloud functions, hooks                                                                           | ✅     | Раздел 0 + Журнал (SEC-001…012)                                                             |
| **L1** | Прогон инструментов: `pnpm audit`, `dependency-check`, SAST, `security-smoke-test`                                                       | 🔄     | SAST ENFILE починен (SEC-002); осталось тюнинг ruleset (SEC-014) + prod/dev split (SEC-010) |
| **L2** | Живой аудит БД: гранты, RLS, политики — **прогнан** (`security-reports/l2-db-audit.txt`); вскрыл 3 гэпа SEC-015/016/017                  | ✅     | Журнал (SEC-013…017) + Раздел 0 (3) + Facts Table                                           |
| **L3** | Auth/доступ динамика: brute-force PIN/login, IDOR-подмена `client_id`/`context_id`, прод-значение `HEYS_WRITE_CONTEXT_STRICT`, CORS curl | ⬜     | Журнал + Раздел 0 (1,2,5)                                                                   |
| **L4** | Инъекции/XSS динамика: пробы в meals/messages/products/FAQ/lead, трассировка источника FAQ-HTML, SQLi в REST-фильтрах                    | ⬜     | Журнал + Раздел 0 (8,9,16)                                                                  |
| **L5** | Storage/webhooks/интеграции: S3 bucket policy + public-read фото, ownership на delete, спуф/replay webhook (ЮKassa/Telegram/cron)        | ⬜     | Журнал + Раздел 0 (18,19,20)                                                                |
| **L6** | Устойчивость/комплаенс: restore-drill, deletion cascade (152-ФЗ/DSAR), retention аудита, шифрование бэкапов, RPO/RTO                     | ⬜     | Журнал + Раздел 0 (11,13)                                                                   |
| **L7** | Hardening CI/CD: убрать `continue-on-error`, сделать gitleaks/audit/SAST блокирующими, SBOM                                              | ⬜     | Журнал + Раздел 0 (14,15)                                                                   |
| **L8** | Внешний пентест (динамика третьей стороной) для всех пунктов `⚪`                                                                        | ⬜     | Журнал + Раздел 0                                                                           |

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

| Приор. | Действие                                                                                                                                                       | Почему                                                                                 | Находка          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| **P0** | Включить `HEYS_WRITE_CONTEXT_STRICT=1` в проде (после суток Phase B и чистки ложных `data_loss_audit`)                                                         | Главная защита от межклиентского затирания работает в режиме «логируем, но пропускаем» | SEC-004          |
| **P0** | Зависимости: разнести 160 advisories на runtime vs dev-only, закрыть 5 critical/72 high в runtime-пути                                                         | `pnpm audit`: 5 critical / 72 high; нельзя оставлять в проде                           | SEC-010          |
| ✅ P0  | Починить `scripts/security/dependency-check.js` (ложный «0»)                                                                                                   | Гейт всегда показывал 0 → ложный зелёный; **исправлено 2026-06-08**                    | SEC-001          |
| **P1** | Добавить `Content-Security-Policy` на ответы functions/статику                                                                                                 | Нет второго рубежа против XSS                                                          | SEC-005          |
| 🔄 P1  | SAST: ENFILE починен (SEC-002 ✅), ruleset тюнингован 2026-06-08 (8644→1567 total, critical 9, high 6); осталось baseline-ratchet → убрать `continue-on-error` | После тюнинга остались 15 критов/хайхов кандидатов FP; нельзя блокировать CI до триажа | SEC-002, SEC-014 |
| ✅ P1  | REST POST `/rest/shared_products`: отдавать явный 403/405, не утечку `code:42601` — **исправлено 2026-06-08** (`heys-api-rest` deployed)                       | Прод-ответ раскрывает внутреннюю ошибку БД                                             | SEC-003          |
| ✅ P1  | Снять снимок грантов/RLS из прод-БД (L2) — сделано, вскрыло гэпы ниже                                                                                          | Миграции ≠ задеплоено — подтвердилось                                                  | SEC-013          |
| ✅ P1  | БД-hardening: **обе миграции применены в проде 2026-06-08** — `…_harden_secdef_search_path.sql` (M1) + `…_revoke_public_execute_secdef.sql` (M2)               | Crown-jewel функции без search_path; PUBLIC-execute ломает least-privilege             | SEC-015, SEC-016 |
| **P1** | Auth куратора: MFA (TOTP) + per-account lockout; задать ротацию `JWT_SECRET`                                                                                   | Сейчас только per-IP rate-limit, нет MFA/ротации                                       | SEC-011          |

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
хешированные секреты/токены, аудит-слой, pre-commit-гейты). Реальные риски
сосредоточены в трёх местах: **изоляция арендаторов в наблюдательном режиме**,
**сломанная/несблокирующая security-автоматизация** (dependency-check починен,
SAST/CI — нет) и **отсутствие CSP**. Плюс половина матрицы (L2–L8) ещё ждёт
живой проверки.

---

## Раздел 1 — Журнал находок (Findings Log)

Шаблон строки:
`SEC-NNN | дата | слой | компонент | severity | описание | evidence (команда/файл) | статус`.

| ID      | Дата       | Слой | Компонент            | Severity | Описание                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Evidence                                                                                                  | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ---- | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | 2026-06-08 | L1   | Deps / CI            | High     | `dependency-check.js` всегда рапортовал 0 (парсил npm-v6 NDJSON, которого pnpm не выдаёт) → ложный зелёный гейт                                                                                                                                                                                                                                                                                                                                                     | `node scripts/security/dependency-check.js` → «0», против `pnpm audit` → 160                              | **fixed** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SEC-002 | 2026-06-08 | L1   | SAST / CI            | Medium   | SAST падал `ENFILE` — `walk()` рекурсировал внутрь `node_modules`/`.pnpm` (исключение было только для файлов). Фикс: прунинг каталогов до рекурсии + skip симлинков                                                                                                                                                                                                                                                                                                 | `node scripts/security/sast-scan.js` → 4516 файлов, без ENFILE                                            | **fixed** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SEC-003 | 2026-06-08 | L1   | API REST             | Medium   | Прод REST POST `/rest/shared_products` отдаёт `{code:42601,...}` (внутренняя ошибка БД) вместо 403/405                                                                                                                                                                                                                                                                                                                                                              | `bash scripts/security-smoke-test.sh` (8 passed, 1 failed)                                                | **fixed** (2026-06-08, `heys-api-rest` index.js: пустое тело → 400 «Empty body» до SQL; catch не выводит `error.code` SQLSTATE; deploy + смок 9/9 PASS)                                                                                                                                                                                                                                                                                                                                                                                             |
| SEC-004 | 2026-06-08 | L0   | Tenant isolation     | High     | `HEYS_WRITE_CONTEXT_STRICT` по умолчанию off → write-context в warn-only (пишет audit, но пропускает запись)                                                                                                                                                                                                                                                                                                                                                        | `heys-api-rpc/index.js:569`, `heys-api-rest/index.js:114`                                                 | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-005 | 2026-06-08 | L0   | Transport / headers  | Medium   | Нет `Content-Security-Policy` ни в одной cloud function                                                                                                                                                                                                                                                                                                                                                                                                             | `grep -ri content-security-policy yandex-cloud-functions` → пусто                                         | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-006 | 2026-06-08 | L0   | Photos / S3          | Medium   | Объекты пишутся `ACL: public-read` → знание URL = доступ к фото (потенциально PII)                                                                                                                                                                                                                                                                                                                                                                                  | static read `heys-api-photos`                                                                             | open (confirm meal-фото)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| SEC-007 | 2026-06-08 | L0   | Sync integrity       | Medium   | L3 server-revision pull-gate возвращает `true` без `server_revision` → эффективного гейтинга нет; LWW на device-clock                                                                                                                                                                                                                                                                                                                                               | `heys_storage_supabase_v1.js:12187`; `BUGS_HISTORY.md`                                                    | open (ceiling)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| SEC-008 | 2026-06-08 | L0   | Landing / XSS        | Low→?    | FAQ рендерит `dangerouslySetInnerHTML={{__html:item.a}}` — severity зависит от источника `items`                                                                                                                                                                                                                                                                                                                                                                    | `FAQAccordion.tsx:53`; источник `items` не прослежен                                                      | open (trace)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SEC-009 | 2026-06-08 | L0   | Messages / push      | Low      | Rate-limit 30/мин/клиент хранится в памяти функции → сбрасывается на cold-start                                                                                                                                                                                                                                                                                                                                                                                     | static read `heys-api-messages`                                                                           | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-010 | 2026-06-08 | L1   | Deps                 | High     | `pnpm audit`: 160 advisories (5 critical / 72 high / 63 moderate / 20 low); не разнесены runtime vs dev                                                                                                                                                                                                                                                                                                                                                             | `pnpm audit --audit-level moderate`                                                                       | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-011 | 2026-06-08 | L0   | Auth                 | Medium   | Нет MFA для кураторов; lockout только per-IP, не per-account; ротация `JWT_SECRET` не задокументирована                                                                                                                                                                                                                                                                                                                                                             | `heys-api-auth/index.js`                                                                                  | open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SEC-012 | 2026-06-08 | L0   | Landing              | Low      | iframe demo sandbox: `allow-same-origin` + `allow-scripts` (классический потенциал sandbox-escape)                                                                                                                                                                                                                                                                                                                                                                  | `DemoSection.tsx:121-151`                                                                                 | open (review)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| SEC-013 | 2026-06-08 | L2   | БД гранты/RLS        | —        | L2-аудит прогнан на проде (`security-reports/l2-db-audit.txt`). Подтверждено хорошее (0 прямых table-грантов anon/PUBLIC; 19 FK на clients все CASCADE кроме leads=SET NULL; write_contexts USING(false)); вскрыты 3 гэпа → SEC-015/016/017                                                                                                                                                                                                                         | вывод `audit-db.sql`                                                                                      | **done** (2026-06-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| SEC-014 | 2026-06-08 | L1   | SAST / CI            | Low      | После фикса ENFILE SAST шумен: 7764 хита `insecure-operations` = почти все `Date.now()` (таймстампы, не crypto-RNG) + 90 «critical» в основном FP. Нельзя делать блокирующим без тюнинга ruleset                                                                                                                                                                                                                                                                    | `node scripts/security/sast-scan.js` (8644 total)                                                         | **partial** (2026-06-08): шум сокращён 98% — excludes (`.claude`, `archive`, `react-bundle.js`, `*.bundle.<hash>.js`, self-match) + FP-фильтры (`$${placeholder}`, `console.*` log-строки, identifier-substring `searchQuery`). Итог: 8644→1567 total, critical 90→9, high 100→6. Оставшиеся 15 critical+high — кандидаты FP (heys-api-rest WHERE/ORDER/LIMIT уже верифицированы как safe; нужен ручной триаж + baseline-ratchet). `continue-on-error: true` пока сохранён — отдельная подзадача SEC-014-extended: baseline-snapshot + fail-on-NEW. |
| SEC-015 | 2026-06-08 | L2   | БД: SECURITY DEFINER | High     | 70 SECURITY DEFINER функций в `public` БЕЗ `SET search_path` — вкл. crown-jewels: `client_pin_auth`, `create_client_with_pin`, `admin_set_client_pin`, `decrypt_health_data`/`encrypt_health_data`/`get_encryption_key`, `safe_upsert_client_kv`, `get_client_salt`, `verify_client_pin`. Риск hijack резолва (CWE-426/427)                                                                                                                                         | `audit-db.sql` §1; fix → `database/2026-06-08_harden_secdef_search_path.sql`                              | **fixed + live-verified** (2026-06-08, M1 applied: 70 функций; verify 0; PIN + curator смок на проде: 0 errors / 0 upload*fail в Sync Log; log `…\_M1*\*.txt`)                                                                                                                                                                                                                                                                                                                                                                                      |
| SEC-016 | 2026-06-08 | L2   | БД: гранты           | High     | Дефолтный `PUBLIC EXECUTE` не отозван: ~210 функций (admin/crypto/internal) исполнимы ролью PUBLIC. `p1_grants_heys_rpc_only.sql` дал GRANT'ы heys_rpc, но не сделал `REVOKE FROM PUBLIC` → intended REVOKE internal-helpers (`issue_client_session`, `subscription_can_write`) неэффективен; heys_rest (даны явно 4 ф-ции) через PUBLIC получает admin/crypto. Caveat: роли anon нет → не интернет-callable, но ломает blast-radius при компрометации backend-роли | `audit-db.sql` §2/§3; fix → `database/2026-06-08_revoke_public_execute_secdef.sql` (test/rollback внутри) | **fixed + live-verified** (2026-06-08, M2 applied: PUBLIC снят с 70 SECDEF, явный EXECUTE — `heys_rpc` на всё, `heys_rest` на `safe_upsert_client_kv`; verify 0; смок на проде PIN + curator-batch: `safe_upsert_client_kv` path работает, hot-sync success/failed=0; log `…_M2_*.txt`)                                                                                                                                                                                                                                                             |
| SEC-017 | 2026-06-08 | L2   | БД: RLS              | Medium   | RLS включён лишь на 4 из 45 таблиц; **выключен на `clients`, `client_kv_store`, `client_sessions`, `payments`, `consents`, `subscriptions`, аудит-таблицах**. `auth.uid()`-политики из миграций НЕ задеплоены (нет в `pg_policies`). DB-уровень не даёт defense-in-depth — вся изоляция держится на RPC + write_contexts (single layer)                                                                                                                             | `audit-db.sql` §4/§5                                                                                      | open (структурное)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

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
