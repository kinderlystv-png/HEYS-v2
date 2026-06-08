# Координация 5+ параллельных агентов — design

> Это **design-документ**. Цель — собрать варианты, их трейд-оффы для HEYS, и
> текущую рекомендацию. История: первая версия рекомендовала worktree-режим
> (`Вариант B`), это оказалось неправильно — bundle-pain на integrate
> перевешивает выигрыш. Текущая рекомендация: **Вариант D (ship-lock на
> trunk)**.

## TL;DR

Для 5+ агентов на HEYS:

- **Worktree-подход** (`Вариант B`) — НЕ годится, потому что на integrate
  bundle- hash коллизии + dual node_modules + stale-worktree наследие.
- **Полный push-train** (`Вариант C`) — overkill, 500+ строк сложного кода.
- **✅ Рекомендуется Вариант D — ship-lock на trunk**: все агенты на одном
  `main`, но сам акт `pnpm ship` сериализуется через единый lock-файл. ~30-50
  строк кода, не требует worktree, не требует integration-cron, не трогает
  bundle-логику.

## Контекст: что есть сейчас

- `pnpm ship "<msg>"` — solo-default: stage → commit → whats-new → push → watch.
  Работает идеально для 1 агента, ломается при 2+.
- `pnpm agent:worktree <task>` — создаёт `.claude/worktrees/<task>` на branch
  `claude/<task>`, isolated. Существует, но требует ручного запуска.
- `pnpm agents:integrate --branches=...` — мерж worktree-веток в main с
  пересборкой. Существует, но требует ручного вызова + ловит bundle-pain (см.
  ниже).

## Что ломается при 5+ агентов на trunk (наблюдаемо в сессии 2026-06-08)

1. **`git reset --hard origin/main`** одного агента дропает unpushed коммиты
   других (`62c5273c` улетел в orphan, восстановлен через reflog).
2. **`git add -A`** в ship'е захватывал чужой WIP в чужой коммит (`11fbaec5`).
   Уже исправлено в `6e2dcd63`.
3. **Stale `.git/index.lock`** после крашнутого агента блокирует всех остальных.
   Уже исправлено в `d1fc7c2e` (cleanup в `ship.mjs`).
4. **Non-fast-forward push** каскадом: A пушит, B пушит, B получает rejection,
   ребейзит, A снова пушит первым, и т.д. — 5+ агентов = постоянный гонящийся
   хвост.
5. **`whats-new.json` дубли** — каждый агент генерит свой entry; при merge'е
   получается 5 entries для одной фичи или конфликт.

## Bundle pain — почему worktree-режим хуже trunk-режима

Когда 2+ агентов работают в разных worktree:

- Каждый делает source-правки → pre-commit hook `legacy-sync` пересобирает
  затронутые bundles → файлы вида `apps/web/public/boot-X.bundle.<hash>.js` +
  `bundle-manifest.json` обновляются с НОВЫМ hash'ем.
- Каждый агент-worktree получает СВОЙ набор bundle-hashes для одного и того же
  логического состояния `main`.
- При `pnpm agents:integrate` приходится либо:
  - **merge bundle-manifest.json** — конфликт по строчке для каждого bundle'а,
    конфликт неизбежен;
  - **пересобрать с нуля** после мерж source'ов — но тогда получившиеся хеши
    отличаются от тех что в worktree'ях, и `whats-new.coveredCommits` уже
    указывает на коммиты с устаревшими хешами → deploy-gate отклоняет.
- Дополнительно: каждый worktree требует свой `pnpm install` (помечен в
  `agent-worktree.mjs`), потому что fresh checkout без node_modules ломает
  husky/lint-staged.
- Дополнительно: stale-worktree'и накапливаются и pre-commit
  `check-agent-staging` начинает рапортовать «shared root checkout»
  false-positive в соло-режиме (per CLAUDE.md).

**Bundle pain — главная причина почему `Вариант B` (worktree-by-default)
отклонён.** Текущий «5 агентов на main» хотя бы делает один общий bundle build
после каждого ship'а.

## Почему полный push-train не подходит для HEYS

В классической push-train модели (Gitlab Merge Train, Marge-bot):

1. Агенты пушат в feature-branch.
2. CI берёт feature-branch, ребейзит поверх свежего main, тестит, мерджит.
3. Если тесты упали — branch выкидывается, агент чинит и пушит снова.

**Это не работает для HEYS потому что:**

| Зависимость                                                                      | Что сломается                                                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `whats-new.json` имеет `coveredCommits: ["<hash>"]` от исходного commit          | После train-ребейза hash меняется → entry «прикрывает» несуществующий коммит. Deploy-gate отклоняет.                                           |
| Legacy-bundles в `apps/web/public/*.bundle.<hash>.js` запекают source-hash в имя | Pre-commit hook (`legacy-sync`) пересобирает их. После rebase hash меняется → новый bundle. Старый bundle коммит ссылается на устаревший hash. |
| `bundle-manifest.json` запекает все bundle-hashes                                | После ребейза должен быть пересобран целиком → diff против main всегда conflict.                                                               |
| Bundle размеры в `bundle-size-baseline.txt`                                      | Тоже привязаны к hash; train-ребейзы делают metric-history несравнимыми.                                                                       |

Каждая из 4 деталей по отдельности фиксится, но **в сумме** train-механизм
должен быть умнее «обычного» merge-train: уметь по-настоящему пересобирать
целиком после каждого rebase'а и переписывать whats-new entries. На текущей
кодовой базе это 200+ строк нетривиальной логики плюс деплой задерживается на
cycle-time train'a.

## 4 варианта решения

### Вариант A — оставить как есть + cooperative discipline (0 кода)

- Пользователь сам разруливает кто когда пушит.
- Реальность: при 5+ агентах не соблюдается.

**Плюсы:** 0 кода. **Минусы:** наблюдаемые инциденты 2026-06-08 (см. выше).

### Вариант B — worktree-by-default (~100-200 строк) — **отклонён**

`ship` детектит 2+ агентов, отказывается ship'ить с trunk'а, требует worktree.

**Почему отклонён:** bundle pain на integrate (см. секцию выше). Решает 4 из 5
trunk-проблем но создаёт 4 новые проблемы на integration этапе.

### Вариант C — full push-train + reorg (~500-1000 строк) — **overkill**

Полноценная train-инфра с rebase + bundle regen + whats-new rewrite.

**Почему отклонён:** объём кода + cycle-time + дублирование с GitHub Actions.

### ✅ Вариант D — ship-lock на trunk (~30-50 строк) — **рекомендован**

Все агенты остаются на одном `main` checkout (нет worktree, нет bundle pain).
Сериализуем **только акт `pnpm ship`** через единый lock-файл.

**Как работает:**

1. `pnpm ship` первым делом пытается захватить `.claude/ship-lock` — файл
   содержащий `<pid>:<unix_ts>:<branch>:<short_message>`.
2. Если файл существует:
   - Проверяет жив ли PID (`kill -0`).
   - Проверяет возраст timestamp'a (TTL 5 минут).
   - Если PID живой И timestamp свежий → отказывает с конкретным сообщением:
     ```
     ❌ Another agent is currently shipping (PID 12345, started 47s ago,
        message: "fix(sync): drop stale dayv2").
        Wait ~30 seconds and retry, or:
        - check that agent is actually running: ps -p 12345
        - if hung: kill -9 12345 && rm .claude/ship-lock
     ```
   - Если PID мёртв ИЛИ timestamp старше TTL → перехватывает lock (warn в
     stderr).
3. Записывает свой lock-файл.
4. Регистрирует `process.on('exit'|'SIGINT'|'SIGTERM'|'uncaughtException')` для
   удаления lock-файла при любом завершении.
5. Делает всю остальную работу ship'а.
6. На exit lock удаляется.

**Что это решает из 5 болей:**

| #   | Боль                                    | Решено?                                                           |
| --- | --------------------------------------- | ----------------------------------------------------------------- |
| 1   | `git reset --hard` дропнул чужой коммит | ❌ нет, но Variant D не делает reset, кроме как сами агенты       |
| 2   | `git add -A` захватил чужой WIP         | ✅ уже решено в `6e2dcd63` (explicit staging)                     |
| 3   | Stale `.git/index.lock`                 | ✅ уже решено в `d1fc7c2e` (cleanup в ship)                       |
| 4   | Non-fast-forward push гонка             | ✅ да — sequential ship = sequential push, нет гонки              |
| 5   | `whats-new.json` дубли                  | ✅ да — ship*n видит whats-new от ship*{n-1} и аппендит правильно |

**Что не решает (acceptable):**

- 2 агента редактируют один файл → last writer wins. Это уже сейчас так, не
  хуже.
- Агент A долго ship'ит (минут 5), агент B ждёт. Это норма для одной ветки.
- Если 5 агентов одновременно нажали ship — образуется очередь. На практике
  каждый ship занимает 30-90 секунд (тесты, push, watch), очередь рассасывается
  быстро.

**Чего НЕТ в Variant D:**

- Worktree → нет bundle pain.
- Integration merge → нет bundle-hash коллизий.
- Cron daemon → ничего не висит в фоне.
- Дублирование node_modules → один checkout.

## Сравнительная таблица

| Аспект              | A (status quo)         | B (worktree)                            | C (train)                    | D (ship-lock)                                    |
| ------------------- | ---------------------- | --------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Bundle pain         | низкая                 | высокая на integrate                    | высокая на rebase            | нулевая                                          |
| Доп. инфра          | —                      | worktree dirs + cron                    | train daemon + queue         | 1 lock file                                      |
| Solo не ломается    | ✅                     | ✅                                      | ✅                           | ✅                                               |
| Кода (строк)        | 0                      | 100-200                                 | 500-1000                     | 30-50                                            |
| Где может сломаться | везде где видим сейчас | integrate, stale worktree, node_modules | rebase conflicts, regen bugs | hung ship не удалил lock (но stale-cleanup есть) |

## Рекомендация: реализовать Вариант D

**Конкретные шаги:**

1. В `scripts/ship.mjs` добавить:
   - `SHIP_LOCK_PATH = .claude/ship-lock`
   - `SHIP_LOCK_TTL_MS = 5 * 60 * 1000`
   - `acquireShipLock()` — атомарная попытка через `fs.writeFileSync` с
     `{ flag: 'wx' }`. Если файл существует — читаем, парсим, проверяем TTL и
     PID. Если живой и свежий — fail. Иначе — перезаписываем.
   - `releaseShipLock()` — `fs.unlinkSync` если файл всё ещё наш (по PID).
   - Регистрация на `process.on('exit')` + signals.
2. Тест:
   - Соло ship — успех (без lock'а).
   - Соло ship × 2 быстро — второй ждёт или fail с сообщением.
   - Stale lock (mtime > 5 мин) — перехватывается, warn в stderr.
   - Lock от мёртвого PID — перехватывается.
3. Docs: добавить в CLAUDE.md строку «`pnpm ship` сериализуется через ship-lock
   — если получил `Another agent is shipping`, подожди / проверь PID».

## Открытые вопросы

1. **Что если агент крашнулся И PID-номер переиспользовался другим процессом?**
   Маловероятно за TTL=5min на macOS/Linux (PID-space большой). Если случилось —
   ship отказывает зря, пользователь делает `rm .claude/ship-lock`. Acceptable.
2. **Что если 5 агентов одновременно вызвали ship?** Только один захватит lock
   (atomicity via `wx` flag). Остальные fail с сообщением. Они могут retry через
   30s. Не делаем retry-loop в ship'е — пусть агент решит сам.
3. **Что если ship зависнет на 10 минут (медленный deploy watch)?** TTL 5 минут
   истечёт, следующий ship перехватит lock и пойдёт. Параллельный ship
   одновременно с зависшим — теоретически возможен race, но первый ship уже
   сделал commit+push и теперь только ждёт deploy → его коммиты в проде, новый
   ship просто работает поверх них. Acceptable.
4. **`--no-lock` override?** Да, добавить для дебага и эмерженси. По умолчанию
   выключен.

## Что НЕ предлагаю (отвергнутые альтернативы)

- **GitHub Merge Queue** — overkill для соло-разработчика + работает только в
  enterprise.
- **Worktree-by-default** — bundle pain (Вариант B).
- **Full push-train** — 500+ строк сложного кода (Вариант C).
- **Submodules / monorepo split** — HEYS уже монорепо, дробление сделает только
  больнее.
- **Force-push allow** — опасно по умолчанию, спасает только в крайних случаях.

## История документа

- 2026-06-08 v1 — собран по итогам сессии security-ревью где наблюдались 5+
  агентов на main. Первая рекомендация — `Вариант B` (worktree-by-default).
- 2026-06-08 v2 — пользователь возразил по bundle-pain на worktree'ях.
  Рекомендация переключена на `Вариант D` (ship-lock на trunk). Текущая версия.
