# E2E agent smoke

> **Статус:** проверено 2026-08-23 · локальный Playwright smoke для агентов (без
> участия человека в UI).

## Назначение

Автономная проверка критичных контуров после правок auth, sync, products:

| Спека                                   | Что проверяет                                 |
| --------------------------------------- | --------------------------------------------- |
| `curator-login-smoke.spec.ts`           | Кураторский login → dashboard                 |
| `pin-auth.spec.ts`                      | PIN login + session restore                   |
| `products-client-scope-smoke.spec.ts`   | `isDayv2KeyForCurrentClient` (инцидент 23.08) |
| `products-heardfromcloud-smoke.spec.ts` | `OverlayStore.heardFromCloud` + `clear()`     |

## Команды

```bash
pnpm test:e2e:smoke      # setup + playwright + summary (агент)
pnpm test:e2e:verify     # префлайт без секретов в логе
pnpm test:e2e:setup      # только БД + chromium
pnpm test:e2e:curator-switch  # anti-pollution suite (3 теста)
```

Playwright поднимает `pnpm dev:local` (3001+4001), если порты свободны.

## Секреты

| Источник                                            | Ключи                                                   |
| --------------------------------------------------- | ------------------------------------------------------- |
| `.env.local` (корень репо)                          | `HEYS_TEST_CURATOR_EMAIL`, `HEYS_TEST_CURATOR_PASSWORD` |
| Lockbox `heys-app-secrets` (`e6qrvefs3vn66jiamfk4`) | `heys_test_curator_email`, `heys_test_curator_password` |
| `.env.local.example` (preset)                       | E2E PIN `1357`/`9753`, client UUIDs                     |

`setup.mjs` / `verify.mjs`: если в `.env.local` пусто — пробуют Lockbox и
дописывают файл.

Один раз положить креды в Lockbox (owner):

```bash
HEYS_TEST_CURATOR_EMAIL=... HEYS_TEST_CURATOR_PASSWORD=... node scripts/e2e/lockbox-add-curator-test-secret.mjs
```

Если секретов нет — агент **просит человека** заполнить путь из stderr
(`scripts/e2e/env-secrets.mjs` → `ENV_LOCAL_FILE`).

## DB fixtures

Idempotent миграции (через `scripts/e2e/setup.mjs`):

- `2026-05-31_create_e2e_test_clients.sql`
- `2026-08-23_e2e_test_clients_login_v2.sql` — PIN/access 1357/9753
- `2026-08-23_e2e_test_clients_consents.sql` — consent proof + profile flags
- `2026-08-23_e2e_test_clients_day_seed.sql` — dayv2 на сегодня, без утреннего
  чек-ина

Клиенты: `E2E-TestAlex` (`11111111-…`), `E2E-TestPopl` (`22222222-…`).

## Кураторская панель vs dev fixtures

Во вкладке «Клиенты» **скрыты** dev-fixture строки (`heys_e2e_fixtures_v1.js` →
`filterCuratorPanelClients`). Полный список в `HEYS.curatorClients` и dropdown
шапки не трогается.

| Группа                 | Примеры                                                                                        | UUID (short)                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| E2E smoke              | `E2E-TestAlex`, `E2E-TestPopl`                                                                 | `11111111…`, `22222222…`                                        |
| Production/login smoke | `HEYS production smoke *`, `Login Smoke Test`, `login-smoke-deploy`, `Purge Warn Smoke Client` | `7397a9db…`, `9bc6f6c3…`, `5d067903…`, `f5822a0f…`, `a8958ff0…` |

Реальные клиенты (`Антон Полtavский`, `Александра`) **не** скрываются.

`localStorage.heys_show_e2e_clients=1` показывает все скрытые dev fixtures
(E2E + smoke). E2E через плитку панели (`enterCuratorClientFromPanel`) ставит
флаг и reload — см. `curator-auth.ts`.

Опциональная очистка dev-БД:
`scripts/db/migrations/2026-08-23_dev_cleanup_smoke_clients.sql` (DELETE только
5 smoke UUID, не E2E и не real).

## Хелперы

- `TESTS/e2e/helpers/pin-auth.ts` — login, consent, overlays,
  `expectDashboardReady`
- `TESTS/e2e/helpers/curator-auth.ts` — curator login/switch (+ overlays)
- `TESTS/e2e/helpers/test-cleanup.ts` — snapshot restore для E2E UUID

## Правило для агентов

`.cursor/rules/e2e-smoke.mdc` · раздел в `AGENTS.md`.

## См. также

- [`PRODUCTS_AND_SEARCH.md`](PRODUCTS_AND_SEARCH.md) — контракты products/sync
- [`TESTS/e2e/README.md`](../../../TESTS/e2e/README.md) — isolation,
  curator-switch
