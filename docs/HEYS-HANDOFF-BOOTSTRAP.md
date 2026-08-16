# Bootstrap HANDOFF → факты из репо

Дата: 2026-08-06. Источник: живой checkout `HEYS-v2`, не HANDOFF и не чужой
отчёт. HANDOFF (`docs/HEYS-HANDOFF.md`) — снимок задачника от 03.08; ниже только
то, что подтверждено чтением файлов. `AGENTS.md` / `CLAUDE.md` **не
переписывались**: это живой контракт агента (~440 строк), а не «двухминутный»
черновик из приложения А.

Связано: heys/42a93b, docs/codex-mode.md (режим переигран 06.08 — код пишет
агент в Cursor/HEYS-v2, не Codex).

---

## 1. Пробелы (заполнены по репо)

### Стек

- Монорепо `@heys/monorepo` v13, `type: module`, workspaces: `packages/*`,
  `apps/web`, `apps/landing`, `tools/*` (mobile/tg-mini в дереве есть, в
  `pnpm-workspace.yaml` временно выключены через комментарий `apps/*`).
- Пакетный менеджер: **pnpm** 8.x (lockfile `pnpm-lock.yaml`). Node: `.nvmrc` =
  `22.x` (на машине проверки был v24.8.0 — допустимый дрейф окружения).
- Оркестрация: turbo. Legacy web: бандлы через `scripts/bundle-legacy*.mjs`.
- Языки: JS (legacy `apps/web/heys_*.js`), TS/React (landing, часть packages),
  cloud functions — Node CJS/ESM в `yandex-cloud-functions/`.

### Структура

| Зона                                | Путь                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| Клиентское приложение (legacy + UI) | `apps/web/`                                                           |
| Лендинг heyslab.ru                  | `apps/landing/` (`/v/d/` = draft)                                     |
| API local                           | `packages/core/src/server.js` (`pnpm dev:local` → :4001 + web :3001)  |
| MCP-коннектор куратора              | `yandex-cloud-functions/heys-mcp/`                                    |
| RPC/KV/мердж дней                   | `yandex-cloud-functions/heys-api-rpc/`                                |
| Зеркало формул web→mcp              | `yandex-cloud-functions/heys-mcp/lib/web-mirror/`                     |
| Канон TDEE / суточные нормы         | `apps/web/heys_tdee_v1.js`, `apps/web/heys_day_calculations.js`       |
| Shipping / agent policy             | `AGENTS.md`, `CLAUDE.md`, `docs/operations/AGENT_SHIPPING_RUNBOOK.md` |
| Статусы продукта                    | `todo.md`, `docs/README.md` (карта, не статусы)                       |

### Команды (рабочие)

- Локалка: **всегда** `pnpm dev:local` (API :4001 + web :3001). «Запусти 3001» =
  `dev:local`, не `dev:web`.
- `dev:web` / `dev:api` по отдельности — только явная изоляция; без API auth и
  sync падают с `ERR_CONNECTION_REFUSED:4001`.
- Тесты: `pnpm test` / `pnpm test:unit` / `pnpm test:web:critical` / e2e
  Playwright
- Линт: `pnpm lint`; shipping docs: `pnpm docs:shipping:check`
- ПДн: `pnpm pdn:monthly-audit`
- Зеркало формул: `node scripts/lint-heys-mcp-web-mirror.mjs` (**есть скрипт**)
- Ship: `pnpm ship` (см. runbook; commit/push только по прямому grant)
- Cloud deploy: `yandex-cloud-functions/deploy-all.sh`

### Pre-commit / CI (факт)

`.husky/pre-commit` гоняет lint-staged, agent-staging, legacy bundle check,
pricing-sync, sync-merge cjs mirror и
**`lint-heys-mcp-web-mirror.mjs --staged`** (подключён 06.08).
`check-agent-shipping-docs.mjs` по-прежнему ручной (`pnpm docs:shipping:check`),
не husky.

### День клиента (схема)

- Ключ: `heys_dayv2_YYYY-MM-DD` в `client_kv_store` (per-client).
- Поля дня: meals, sleep/weight/mood/…, `savedDisplayOptimum`, curator marks.
- Норма в MCP: `source: client_saved` ← `savedDisplayOptimum`, иначе estimate
  через web-mirror (`heys-mcp/lib/day.js`).
- `heys_get_day` отдаёт `curator_authored` — подтверждено кодом.

### Зеркало формул

- Источник: `apps/web/heys_tdee_v1.js` + `heys_day_calculations.js`
- Копия: `yandex-cloud-functions/heys-mcp/lib/web-mirror/`
- Сторож: `scripts/lint-heys-mcp-web-mirror.mjs` — в `.husky/pre-commit` с
  `--staged` (с 06.08)

### Белок / жир (код, не мнение)

`computeDailyNorms` (`apps/web/heys_day_calculations.js:68-90`):

- `prot = (K * proteinPct/100) / ATWATER.protein` (fallback **3**, не 4)
- `fatPct = max(0, 100 - carbs - protein)` — жир остатком от процентов
- Это совпадает с формулировкой HANDOFF §4.4 про привязку белка к калориям дня

### heys_checkin

Инструмент **уже есть** в `heys-mcp/lib/tools.js` (`name: 'heys_checkin'`), с
тестами в `__tests__/tools.test.cjs` (get/submit, retroactive reject, cold_type,
кураторская метка не закрывает шаг). HANDOFF §4.3 («скорее уедет за релиз») —
**устарел**.

### Деплой

Прод: Yandex Cloud Functions + API Gateway. Гайд: `docs/DEPLOYMENT_GUIDE.md`,
скрипт `yandex-cloud-functions/deploy-all.sh`. Ops: `pnpm ops:heys:status`.

### Соглашения

Живые правила агента — `AGENTS.md` / `CLAUDE.md` (parity через
`pnpm agents:policy:check`). Commit/push/ship — только по прямой команде;
Codex-ветки/`claude/*` — см. Execution autonomy в AGENTS.md.

---

## 2. Пути из HANDOFF §3 — сверка

| Упоминание в HANDOFF                                              | Факт 06.08                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `heys_tdee_v1.js`                                                 | ✅ `apps/web/heys_tdee_v1.js` (+ web-mirror)                                              |
| `heys_day_calculations.js` / computeDailyNorms ~68-91             | ✅ строки 68-90                                                                           |
| `scripts/lint-heys-mcp-web-mirror.mjs`                            | ✅ есть; в pre-commit с `--staged` с 06.08                                                |
| `.husky/pre-commit` «нужна строка сторожа»                        | ✅ закрыто 06.08                                                                          |
| `check-agent-shipping-docs`                                       | ✅ `scripts/check-agent-shipping-docs.mjs` + `pnpm docs:shipping:check`; в husky не видел |
| `docs/heys-mcp-connector.md`                                      | ❌ в HEYS нет → лежит в **tasks** `docs/heys-mcp-connector.md`                            |
| `docs/checkin-via-curator.md`                                     | ❌ в HEYS нет → **tasks** `docs/checkin-via-curator.md`                                   |
| `docs/experiment-two-answers.md`                                  | ❌ ни в HEYS, ни в tasks (эксперимент закрыт решением)                                    |
| `pnpm pdn:monthly-audit`                                          | ✅ есть                                                                                   |
| MCP tools `heys_update_day` / `heys_get_day` / `curator_authored` | ✅                                                                                        |
| Лендинг `/v/d/`                                                   | ✅ `apps/landing` VERSION_PATHS.D = `/v/d/`                                               |

---

## 3. Что в HANDOFF неверно или устарело

1. **Релиз 8 августа** — в задачнике дедлайн сдвинут на **31.08**, go/no-go
   ~26.08. Календарь §1 HANDOFF целиком про прошлую неделю.
2. **«Claude кода не пишет / только Codex»** — переиграно 06.08: код в HEYS-v2
   пишет агент в Cursor; bootstrap Codex не обязателен. Тариф x5 (heys/e88191)
   больше не блокер запуска схемы.
3. **«Собрать AGENTS.md с нуля»** — в корне уже полный `AGENTS.md` + `CLAUDE.md`
   (04.08). Цель «двухминутный AGENTS» из приложения А **не выполнять заменой**:
   это сотрёт живой shipping/policy контракт. Итог bootstrap = этот файл.
4. **§4.3 heys_checkin «уезжает за релиз»** — инструмент и тесты уже в репо.
5. **Три docs/\* из §3** — пути указаны как будто в HEYS; два живут в tasks,
   один отсутствует.
6. **«Сторож зеркала не подключён»** — было верно на момент HANDOFF; **закрыто
   06.08** (строка в `.husky/pre-commit`).

Не проверял заново численно кейс 1503/1534/1458 и sleep hours 5.8→5.5 — это
отдельные техзадачи (нормы / сон), не bootstrap. Формула белка от % калорий в
коде подтверждена.

---

## 4. Риски сейчас (не «перед 8 августа»)

P1-класс по живому коду/повестке, не по HANDOFF-календарю:

1. **Гонка dayv2 / PWA sync** (heys/c0632c) — клиентский lastSeen ещё мог не
   доехать в прод; серверный guard на main уже был.
2. **Чек-ин UX** (heys/4546fb) — мастер открывается / mood откатывается после
   записи куратором; `heys_checkin` есть, баг показа/статуса — отдельно.
3. ~~**Зеркало формул без husky-gate**~~ — закрыто 06.08
   (`lint-heys-mcp-web-mirror --staged` в pre-commit). Остаётся риск правка
   только одной стороны до commit — но hook уже не пропустит.
4. **Три источника нормы** (estimate / client_saved / канон TDEE) — модель всё
   ещё объясняет куратору разные числа; менять порядок расчёта белка опасно,
   пока не закрыт разбор 38.75 ккал.
5. **Параллельные Cowork-сессии → дневник** — живой прецедент 05.08; правило «не
   две сессии на один день» держится дисциплиной, не только кодом.

---

## 5. Вердикт bootstrap

| Шаг приложения А                 | Статус                                      |
| -------------------------------- | ------------------------------------------- |
| HANDOFF в `docs/HEYS-HANDOFF.md` | ✅ в main (`96f197c30`)                     |
| Пробелы заполнены фактами репо   | ✅ этот файл                                |
| Пути §3 сверены                  | ✅ таблица выше                             |
| Короткий AGENTS.md «с нуля»      | ❌ **отклонён**: живой AGENTS.md не трогать |
| Список расхождений + рисков      | ✅ §3–4                                     |
| Тариф Codex x5                   | не нужен для этого bootstrap                |

Готово для heys/42a93b: контекст агента = `AGENTS.md` + этот bootstrap при
работе от HANDOFF; дальше кодовые задачи — напрямую в Cursor по `AGENTS.md`.
