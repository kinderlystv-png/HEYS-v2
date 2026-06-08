# HEYS Security Review Methodology

Дата: 2026-06-08  
Статус: стартовая методология + авто-сводка по видимому состоянию репозитория и
prod smoke-test.

Основа методологии:
[OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
как проверочный стандарт для web app controls,
[OWASP Top 10](https://owasp.org/www-project-top-ten/) для risk framing,
[OWASP API Security Project](https://owasp.org/www-project-api-security/) для
API-specific проверок.

## 0. Авто-сводка защищенности компонентов

Шкала:

- **Высокая**: есть defense-in-depth, тесты/сканы проходят, нет известных
  blockers.
- **Средняя**: есть рабочие защитные слои, но есть открытые проверки или
  частичные gaps.
- **Ниже средней**: защита есть фрагментарно, автоматизация/зависимости/контракт
  дают явный риск.
- **Низкая**: есть подтвержденный blocker, который нельзя считать приемлемым для
  production baseline.

| Компонент                                          |          Текущая степень | Что уже защищает                                                                                                                                             | Главные gaps / что проверять дальше                                                                                                                     | Авто-сигнал 2026-06-08                                                                                                                                                                    |
| -------------------------------------------------- | -----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API perimeter: `api.heyslab.ru`, API Gateway, CORS |                  Средняя | CORS whitelist и security headers в auth/rest functions; gateway throttling на `/auth/login` и `/auth/register`.                                             | REST smoke-test показывает плохой контракт ошибки на POST; throttling покрывает не все публичные write/read paths.                                      | `bash scripts/security-smoke-test.sh`: 8 passed, 1 failed; REST POST returned `{"error":"Database error","message":"Internal server error","code":"42601"}` instead of expected 405/deny. |
| Client PIN auth + curator auth                     |                 Средняя+ | DB-level login rate limit для curator login; JWT secret min length; HttpOnly curator cookie added; client/curator session tokens хранятся как SHA256 digest. | Legacy/localStorage token flow еще не полностью выведен; часть JWT verification кода дублируется в функциях; нужен live brute-force test.               | `heys-api-auth` has DB rate limit and HttpOnly cookie path; shared auth helper verifies token_hash against DB.                                                                            |
| Client data isolation / anti-IDOR / sync           |                  Средняя | `*_by_session` pattern, blocked legacy RPCs, REST/RPC identity pollution guards, data_loss_audit, writerCid/content-dup checks.                              | REST write context has warn-only mode unless `HEYS_WRITE_CONTEXT_STRICT=1`; live env value not verified here.                                           | Smoke-test confirms legacy/UUID functions blocked; static read shows REST `validateContextForWriteRest` can be strict or warn-only.                                                       |
| Database grants, RLS, SECURITY DEFINER RPC         |  Средняя, предварительно | Many migrations include `REVOKE FROM PUBLIC`, `GRANT TO heys_rpc`, session-safe functions, audit triggers.                                                   | Need direct DB audit of actual deployed grants/policies, because migration files are intent, not proof of deployed state.                               | Repository contains revoke/grant/security migrations; no live `psql` grant snapshot run in this phase.                                                                                    |
| Secrets management                                 |                 Средняя+ | Lockbox overlay, placeholder stripping, `.ycignore` excludes `.env*`, GitHub gitleaks workflow scans full history.                                           | Local `.env` files exist by design; need local gitleaks run or GitHub latest run status. Some deploy scripts still source local `.env`.                 | `.gitignore` excludes env files; `.ycignore` excludes env files; gitleaks workflow exists.                                                                                                |
| Dependency supply chain                            |                   Низкая | `pnpm audit` script exists; custom dependency-check exists.                                                                                                  | `pnpm audit` reports 160 vulnerabilities, including 5 critical; custom checker reports 0, so automation is unreliable.                                  | `pnpm audit --audit-level moderate`: 5 critical / 72 high / 63 moderate / 20 low. `node scripts/security/dependency-check.js`: reported 0.                                                |
| SAST / security CI                                 |             Ниже средней | GitHub workflow runs SAST/dependency/security report on PR/schedule; scripts exist.                                                                          | Workflow uses `continue-on-error`; local SAST crashes with `ENFILE` while scanning `node_modules`; SAST exclusions are not effective enough.            | `node scripts/security/sast-scan.js`: failed with `ENFILE: file table overflow`.                                                                                                          |
| Landing app                                        |             Ниже средней | Static export, limited server surface, lead API has consent/honeypot/rate-limit server-side.                                                                 | `next@14.2.18` has critical/moderate advisories in `pnpm audit`; unsanitized FAQ HTML path exists; no Next security headers in `next.config.js`.        | `apps/landing/package.json` uses `next 14.2.18`; `FAQAccordion` uses `dangerouslySetInnerHTML`.                                                                                           |
| Main web app / PWA frontend                        |                  Средняя | React escaping by default; storage registry has auth-key allowlist; build strips console logs; sync/auth critical tests exist.                               | Auth/session values still have localStorage legacy surfaces; some direct DOM/innerHTML uses need trust-source review.                                   | Static grep found targeted `innerHTML`/`dangerouslySetInnerHTML` usage, not all audited yet.                                                                                              |
| Telegram Mini App                                  | Средняя-, предварительно | Sends Telegram `initData` to backend, propagates auth headers centrally, dev fallback is DEV-gated.                                                          | Backend verifier endpoint must be audited; dev logs include Telegram init data in DEV; no evidence yet of hash validation implementation in this phase. | `httpClient` carries `X-Telegram-Init-Data`; `useTelegramWebApp` logs initData only under `import.meta.env.DEV`.                                                                          |
| Payments / YuKassa                                 |  Средняя, предварительно | Return URL whitelist, payment oferta consent check before payment creation, webhook IP allowlist in function.                                                | Gateway spec still comments payments as stub/TODO; webhook authenticity must be verified beyond source IP if provider supports stronger signing.        | Static read confirms returnUrl/consent/IP checks in `heys-api-payments`; API Gateway spec notes payments stub replacement TODO.                                                           |
| Photos / object storage                            |                 Средняя- | Auth identity resolution, curator ownership check, path ownership check on delete, 5MB upload cap.                                                           | Objects are written `public-read`; URL leakage equals data leakage for meal photos; need bucket policy and lifecycle review.                            | Static read confirms public URL design and `ACL: public-read`.                                                                                                                            |
| Messages / push                                    |                  Средняя | Client/curator auth resolution, payload validation, client send rate limit, VAPID via Lockbox.                                                               | Rate limit is in-memory and resets on cold start; push payload minimization and notification privacy need review.                                       | Static read confirms 30/min/client in-memory limit.                                                                                                                                       |
| Leads / legal consent                              |                 Средняя+ | Honeypot, server-side required consent payload, email validation, 18+ gate, rate-limit constants, Telegram notification minimizes PII.                       | Need DB-side uniqueness/rate limit verification and live abuse test; CORS fallback returns default allowed origin for disallowed origin.                | Static read confirms consent/honeypot/minimized Telegram text.                                                                                                                            |
| Backups / disaster recovery                        |  Средняя, предварительно | Daily backup function exists, S3 secrets in Lockbox path, runbooks exist.                                                                                    | Need restore drill proof, bucket encryption/access policy, retention, and per-client DSAR/deletion consistency.                                         | Static map found backup function and DR docs; no restore drill run in this phase.                                                                                                         |
| Observability / incident response                  |                  Средняя | security alerts cron, Telegram alerts, audit logs/data_loss_audit, security runbooks.                                                                        | Need latest alerts health, false positive budget, and SLA evidence.                                                                                     | Static map found security-alert cron and runbooks.                                                                                                                                        |

## 1. Цель ревью

Цель security review: не просто найти "дырки", а проверить, что каждый путь к
чувствительным данным имеет предсказуемую защиту. Для HEYS это значит: клиент
видит только свои данные, куратор только своих клиентов, платежи и лиды не
раскрывают ПДн, а баг синка не может превратиться в cross-client pollution.

## 2. Компоненты, которые обязательно покрываем

| Слой                  | Компоненты                                                     | Класс данных / риска                               | Минимальный уровень защиты                                                        |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Browser/PWA           | `apps/web`, localStorage, service worker, iframe/demo, auth UI | health data, session state, client profile         | XSS hardening, safe storage, auth key allowlist, no stale cross-client state      |
| Landing               | `apps/landing`, trial form, demo iframe, legal pages           | leads PII, consent, analytics/cookies              | dependency hygiene, no unsanitized HTML, consent proof, anti-spam                 |
| Telegram mini app     | `apps/tg-mini`                                                 | curator identity, client day data                  | Telegram initData verification, no prod dev fallback, least-privilege API calls   |
| Local dev API         | `packages/core/src/server.js`                                  | dev proxy to prod, SMS proxy                       | no secret-from-client, explicit CORS, no accidental prod bypass                   |
| Cloud API             | `yandex-cloud-functions/heys-api-*`                            | auth, RPC, REST, messages, photos, payments, leads | allowlists, auth per endpoint, rate limit, generic errors, parameterized SQL      |
| Database              | `database/*.sql`, live PostgreSQL                              | all persisted PII/health data                      | RLS/grants, `SECURITY DEFINER` review, session-safe functions, audit triggers     |
| Storage/S3            | photos, backups, public demo snapshots                         | meal photos, backups, demo data                    | ownership checks, bucket policy, object TTL, no public sensitive data             |
| CI/CD                 | `.github/workflows`, deploy scripts, hooks                     | supply chain, secrets, release gates               | failing security gates, secret scanning, dependency scanning, reproducible deploy |
| Monitoring/compliance | alerts, audit logs, DSAR/deletion, consents                    | 152-ФЗ, incident response                          | alerting, immutable audit, retention, deletion cascade proof                      |

## 3. Метод проверки

Каждый компонент проходит один и тот же цикл:

1. **Asset map**: какие данные держит компонент, кто имеет право читать/писать,
   где граница доверия.
2. **Entry points**: URL, RPC, REST table, browser event, localStorage key,
   cron, webhook, S3 object path.
3. **Trust checks**: auth, ownership, CORS, origin, signature, session
   expiration, role.
4. **Input/output checks**: validation, SQL parameterization, HTML sanitization,
   file limits, generic errors.
5. **State checks**: race conditions, stale local state, replay, idempotency,
   cross-client pollution.
6. **Evidence**: тест, grep/read, smoke-test, psql query, cloud config
   screenshot/export, CI artifact.
7. **Risk decision**: severity, exploitability, affected data, required fix,
   regression test.

## 4. Threat model для HEYS

| Угроза                     | Проверяемые вопросы                                                                  | Минимальный accept criteria                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| IDOR / cross-client access | Можно ли подставить чужой `client_id` в RPC/REST/messages/photos/payments?           | Сервер сам выводит owner из session/JWT или проверяет curator ownership.                     |
| Auth brute-force           | Можно ли перебрать PIN/password/Telegram session?                                    | DB-backed rate limit или provider-backed throttle; одинаковые ответы без enumeration.        |
| XSS                        | Можно ли вставить HTML/JS через FAQ, products, messages, logs, profile, lead fields? | React escaping или sanitizer; `dangerouslySetInnerHTML` только с trusted/static source.      |
| SQL injection              | Есть ли динамические table/column/query strings?                                     | Table/column allowlist + parameterized values.                                               |
| CSRF / cookie misuse       | Где HttpOnly cookies принимаются как auth?                                           | SameSite strategy, origin checks for state-changing endpoints, no wildcard CORS credentials. |
| Secrets leakage            | Есть ли secrets в git, logs, bundle, deploy stdout?                                  | gitleaks clean, `.env` ignored, logs mask secrets, Lockbox preferred.                        |
| Dependency compromise      | Есть ли critical/high advisories in runtime path?                                    | `pnpm audit` clean for prod/runtime; documented exceptions only for dev-only packages.       |
| File/object leakage        | Можно ли прочитать/удалить чужие фото/backup objects?                                | Object keys scoped by owner, delete checks owner, bucket policy reviewed.                    |
| Webhook spoofing           | Можно ли подделать ЮKassa/Telegram/cron request?                                     | Signature/token/IP verification, replay protection, idempotency.                             |
| Data deletion/compliance   | Удаление клиента чистит KV, sessions, photos, messages, backups?                     | DB cascade + async cleanup + audit proof.                                                    |

## 5. Required evidence matrix

| Evidence                  | Команда / источник                                                       | Pass condition                                                                |
| ------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Dependency audit          | `pnpm audit --audit-level moderate`                                      | 0 critical/high runtime advisories, documented dev-only exceptions.           |
| Custom dependency checker | `node scripts/security/dependency-check.js`                              | Matches `pnpm audit` counts or is removed from gates.                         |
| SAST                      | `node scripts/security/sast-scan.js`                                     | Completes without ENFILE; excludes `node_modules`, `dist`, generated bundles. |
| API smoke                 | `bash scripts/security-smoke-test.sh`                                    | 0 failed; all forbidden writes return generic 403/404/405, not DB internals.  |
| DB grants                 | `psql` query against `pg_proc`, `information_schema.role_routine_grants` | No sensitive function executable by `PUBLIC`; only expected roles.            |
| RLS/policies              | `psql` query against `pg_policies`, `pg_class.relrowsecurity`            | Sensitive tables have RLS or are only reachable through safe definer RPC.     |
| CORS                      | curl OPTIONS with allowed and evil origins                               | Allowed origin gets ACAO; evil origin gets no ACAO or 403.                    |
| Auth brute-force          | scripted failed attempts                                                 | Lockout/rate-limit works across instances.                                    |
| XSS probes                | targeted payloads in forms/messages/products/FAQ source                  | Payload renders as text or is sanitized.                                      |
| Object storage            | bucket policy export + upload/delete tests                               | No unauthenticated sensitive object listing; delete requires owner.           |
| Webhook spoofing          | payments webhook replay/spoof tests                                      | Non-provider/non-signed requests rejected.                                    |
| Restore/deletion drill    | backup restore + client deletion cascade test                            | Restore works; deletion removes DB data and related objects.                  |

## 6. Immediate P0/P1 review backlog

| Priority | Item                                                                                                                     | Reason                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| P0       | Fix dependency baseline: upgrade/override `next`, `vitest`, vulnerable transitive packages or prove dev-only exceptions. | `pnpm audit` currently reports critical/high advisories.                                |
| P0       | Fix security automation mismatch: custom dependency checker must not report 0 when `pnpm audit` reports 160.             | False green security report is worse than no report.                                    |
| P1       | Fix SAST scanner traversal/limits so it does not hit `node_modules`/ENFILE.                                              | CI SAST exists but local run fails.                                                     |
| P1       | Fix REST POST smoke contract for `/rest/shared_products`.                                                                | Current prod response leaks DB-internal error shape instead of explicit deny.           |
| P1       | Audit `dangerouslySetInnerHTML` in landing FAQ and any dynamic source feeding it.                                        | XSS class risk; current code has no sanitizer at render point.                          |
| P1       | Verify live `HEYS_WRITE_CONTEXT_STRICT` and DB grants.                                                                   | Static code shows warn-only mode is possible; deployed state decides actual protection. |

## 7. Facts Table

| Claim                                                                                                             | Source      | Verify command                                                                                 | Result                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Root package exposes `deps:check` as `pnpm audit`.                                                                | direct read | `nl -ba package.json \| sed -n '34,38p'`                                                       | Confirmed: line 36.                                             |
| Local full-stack dev uses API 4001 + web 3001.                                                                    | direct read | `nl -ba package.json \| sed -n '38,43p'`                                                       | Confirmed: line 41.                                             |
| Landing uses `next 14.2.18`.                                                                                      | direct read | `nl -ba apps/landing/package.json \| sed -n '11,16p'`                                          | Confirmed: line 13.                                             |
| Web app uses `react-router-dom ^6.15.0` and older app-local test deps.                                            | direct read | `nl -ba apps/web/package.json \| sed -n '32,58p'`                                              | Confirmed: lines 39-57.                                         |
| Security workflow runs SAST/dependency checks but marks both continue-on-error.                                   | direct read | `nl -ba .github/workflows/security-scan.yml \| sed -n '45,80p'`                                | Confirmed: lines 45-47 and 78-80.                               |
| Gitleaks workflow scans full history on push/PR.                                                                  | direct read | `nl -ba .github/workflows/gitleaks.yml \| sed -n '1,25p'`                                      | Confirmed: lines 3-7 and 19-24.                                 |
| Dev API proxy forwards `/rpc`, `/rest`, `/auth`, `/messages`, `/photos` to prod API by default.                   | direct read | `nl -ba packages/core/src/server.js \| sed -n '84,124p'; sed -n '216,223p'`                    | Confirmed: default target line 85; routes lines 216-223.        |
| Dev API SMS endpoint takes API key only from server env and caps phone/message.                                   | direct read | `nl -ba packages/core/src/server.js \| sed -n '225,265p'`                                      | Confirmed: env key line 229, validation lines 241-249.          |
| REST API has table/column allowlists and hides forbidden tables as 404.                                           | direct read | `nl -ba yandex-cloud-functions/heys-api-rest/index.js \| sed -n '240,346p'; sed -n '438,445p'` | Confirmed.                                                      |
| REST writable tables include `client_kv_store`, `shared_products_pending`, `shared_products`, `client_log_trace`. | direct read | `nl -ba yandex-cloud-functions/heys-api-rest/index.js \| sed -n '455,463p'`                    | Confirmed.                                                      |
| REST client KV write path validates write context and identity/content pollution before `safe_upsert_client_kv`.  | direct read | `nl -ba yandex-cloud-functions/heys-api-rest/index.js \| sed -n '760,918p'`                    | Confirmed.                                                      |
| REST write context can run warn-only unless strict env is enabled.                                                | direct read | `rg -n "HEYS_WRITE_CONTEXT_STRICT                                                              | no_context_phase_b                                              | STRICT_MODE" yandex-cloud-functions/heys-api-rest/index.js` | Confirmed by `STRICT_MODE = process.env.HEYS_WRITE_CONTEXT_STRICT === '1'` and `no_context_phase_b`. |
| Auth function has DB-backed login rate limit.                                                                     | direct read | `nl -ba yandex-cloud-functions/heys-api-auth/index.js \| sed -n '67,118p'`                     | Confirmed.                                                      |
| Auth function returns curator JWT in HttpOnly Secure SameSite=Lax cookie and still returns token in body.         | direct read | `nl -ba yandex-cloud-functions/heys-api-auth/index.js \| sed -n '305,335p'`                    | Confirmed: cookie line 320, body lines 322-335.                 |
| Shared auth helper stores/verifies session tokens as SHA256 digest in DB.                                         | direct read | `nl -ba yandex-cloud-functions/shared/auth-helpers.js \| sed -n '1,72p'`                       | Confirmed: comment lines 7-8, query lines 60-67.                |
| Lockbox overlay strips `__IN_LOCKBOX__` placeholders before applying secrets.                                     | direct read | `nl -ba yandex-cloud-functions/shared/secrets.js \| sed -n '41,70p'`                           | Confirmed.                                                      |
| DB pool enforces TLS verification when CA cert exists, dev-only no-verify fallback.                               | direct read | `nl -ba yandex-cloud-functions/shared/db-pool.js \| sed -n '75,105p'`                          | Confirmed.                                                      |
| Telegram mini app carries `X-Telegram-Init-Data` and Bearer token centrally.                                      | direct read | `nl -ba apps/tg-mini/src/api/httpClient.ts \| sed -n '48,70p'`                                 | Confirmed.                                                      |
| Telegram mini app has DEV-only fallback initData.                                                                 | direct read | `nl -ba apps/tg-mini/src/hooks/useTelegramWebApp.ts \| sed -n '12,24p'; sed -n '77,89p'`       | Confirmed.                                                      |
| Landing FAQ renders HTML through `dangerouslySetInnerHTML`.                                                       | direct read | `nl -ba apps/landing/src/components/FAQAccordion.tsx \| sed -n '49,55p'`                       | Confirmed.                                                      |
| Landing demo iframe sandbox allows same-origin, scripts, forms, popups.                                           | direct read | `nl -ba apps/landing/src/components/sections/DemoSection.tsx \| sed -n '121,151p'`             | Confirmed.                                                      |
| Security smoke-test includes phone enumeration, legacy RPC, SQLi, forbidden table, REST POST, CORS checks.        | direct read | `nl -ba scripts/security-smoke-test.sh \| sed -n '54,110p'`                                    | Confirmed.                                                      |
| SAST scanner config intends to exclude `node_modules`, dist, build, tests, coverage.                              | direct read | `nl -ba scripts/security/sast-scan.js \| sed -n '17,37p'`                                      | Confirmed, but local execution contradicted effectiveness.      |
| Custom dependency checker is separate from `pnpm audit` and has its own thresholds.                               | direct read | `nl -ba scripts/security/dependency-check.js \| sed -n '18,68p'`                               | Confirmed.                                                      |
| `pnpm audit --audit-level moderate` currently reports critical/high/moderate/low advisories.                      | command run | `pnpm audit --audit-level moderate`                                                            | Confirmed: 160 total, 5 critical, 72 high, 63 moderate, 20 low. |
| Custom dependency checker currently reports zero vulnerabilities.                                                 | command run | `node scripts/security/dependency-check.js`                                                    | Confirmed: "Found 0 vulnerabilities".                           |
| SAST scanner currently fails locally with ENFILE.                                                                 | command run | `node scripts/security/sast-scan.js`                                                           | Confirmed: `ENFILE: file table overflow`.                       |
| Prod security smoke-test currently has one failed check.                                                          | command run | `bash scripts/security-smoke-test.sh`                                                          | Confirmed: 8 passed, 1 failed on REST POST block.               |
