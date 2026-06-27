# Координация параллельных агентов — design

> Это **design-документ**. Цель — собрать варианты, их трейд-оффы для HEYS, и
> текущую рекомендацию. История: документ 2026-06-08 временно рекомендовал общий
> `main` + ship-lock. После инцидентов с чужим WIP и generated scope текущая
> политика изменилась: **для реальной параллельной работы 2+ агентов
> использовать worktree + `pnpm agents:integrate`; `pnpm ship` остаётся
> shipping-механикой только по явной команде commit/shipping**.

## TL;DR

Для HEYS:

- **2+ независимых агента** — worktree + `pnpm agents:integrate`.
- **Один агент или осознанный сборщик в shared root** — можно работать в root,
  но staging/commit/ship/push только по явной команде и только выбранный scope.
- **Полный push-train** (`Вариант C`) — overkill, 500+ строк сложного кода.
- **Ship-lock** полезен только как защита самого `pnpm ship`, но не как модель
  параллельного редактирования в одном checkout.

## Контекст: что есть сейчас

- `pnpm ship "<msg>"` — commit/shipping flow только по явной команде:
  `git add <intended files>` → commit → whats-new → push → watch. `ship` не
  stage'ит dirty-файлы сам.
- `pnpm agent:worktree <task>` — создаёт `.claude/worktrees/<task>` на branch
  `claude/<task>`, isolated.
- `pnpm agents:integrate --confirm-integration --branches=...` —
  commit-producing collector flow: мерж worktree-веток в main, пересборка
  generated/release артефактов и integration commits без push. Запускать только
  из главной сессии после явной команды на integration/shipping.

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

## Bundle pain — историческая проблема worktree-интеграции

Когда 2+ агентов работают в разных worktree:

- Каждый делает source-правки. В agent-mode generated/release артефакты не
  должны попадать в agent commit; финальные bundles собирает integration pass.
- Каждый агент-worktree получает СВОЙ набор bundle-hashes для одного и того же
  логического состояния `main`, если он всё-таки собирает generated локально.
- При `pnpm agents:integrate` приходится либо:
  - **merge bundle-manifest.json** — конфликт по строчке для каждого bundle'а,
    конфликт неизбежен;
  - **пересобрать с нуля** после мерж source'ов — но тогда получившиеся хеши
    отличаются от тех что в worktree'ях, и `whats-new.coveredCommits` уже
    указывает на коммиты с устаревшими хешами → deploy-gate отклоняет.
- Поэтому текущая политика: agent worktree commits source-only; preview bundles
  разрешены только как локальный QA-output; финальные generated/release
  артефакты собирает `pnpm agents:integrate` или отдельный release pass.

**Старый вывод “worktree хуже trunk” больше не актуален.** Общий root checkout
удобен для solo/collector flow, но не является default для 2+ независимых
агентов.

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

### ✅ Вариант B — worktree + integration pass — **текущий default для 2+ агентов**

Каждый агент работает в своём worktree и не коммитит generated/release
артефакты. Сборщик/интегратор мержит source branches через
`pnpm agents:integrate`, пересобирает bundles/whats-new и дальше shipping идёт
отдельной явной командой.

**Почему принят:** изолирует чужой WIP, убирает случайный staging в shared root
и делает generated/release scope осознанным integration-шагом.

### Вариант C — full push-train + reorg (~500-1000 строк) — **overkill**

Полноценная train-инфра с rebase + bundle regen + whats-new rewrite.

**Почему отклонён:** объём кода + cycle-time + дублирование с GitHub Actions.

### Вариант D — ship-lock на trunk — **дополнительный guard для shipping**

Ship-lock сериализует **только акт `pnpm ship`** через единый lock-файл. Это не
модель параллельного редактирования и не разрешение работать 5 агентам в одном
checkout.

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

**Что не решает:**

- 2 агента редактируют один файл → last writer wins. Это уже сейчас так, не
  хуже, поэтому для 2+ задач нужен worktree.
- Агент A долго ship'ит (минут 5), агент B ждёт. Это норма для одной ветки.
- Если 5 агентов одновременно нажали ship — образуется очередь. На практике
  каждый ship занимает 30-90 секунд (тесты, push, watch), очередь рассасывается
  быстро.

**Чего НЕТ в Variant D:**

- Изоляции source/WIP между агентами.
- Защиты от shared-root editing конфликтов.
- Cron daemon → ничего не висит в фоне.

## Сравнительная таблица

| Аспект              | A (status quo)         | B (worktree)                            | C (train)                    | D (ship-lock)                                    |
| ------------------- | ---------------------- | --------------------------------------- | ---------------------------- | ------------------------------------------------ |
| Bundle pain         | низкая                 | controlled by source-only agent commits | высокая на rebase            | нулевая для solo ship, не решает shared editing  |
| Доп. инфра          | —                      | worktree dirs + cron                    | train daemon + queue         | 1 lock file                                      |
| Solo не ломается    | ✅                     | ✅                                      | ✅                           | ✅                                               |
| Кода (строк)        | 0                      | 100-200                                 | 500-1000                     | 30-50                                            |
| Где может сломаться | везде где видим сейчас | integration conflicts, stale worktree   | rebase conflicts, regen bugs | hung ship не удалил lock (но stale-cleanup есть) |

## Рекомендация

1. 2+ независимых агента: worktree + source-only commits +
   `pnpm agents:integrate`.
2. Solo/collector в shared root: `git status`, explicit
   `git add <intended files>`, `pnpm ship` только по явной команде
   commit/shipping.
3. `git add -A` допустим только когда весь dirty scope осознанно принят как одна
   логическая группа.
4. `pnpm bundle:legacy:auto --files=<свои>` — локальный QA-output, не разрешение
   на stage/commit/push.

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
- **Общий root checkout для 5 агентов по умолчанию** — слишком легко захватить
  чужой WIP/generated scope.
- **Full push-train** — 500+ строк сложного кода (Вариант C).
- **Submodules / monorepo split** — HEYS уже монорепо, дробление сделает только
  больнее.
- **Force-push allow** — опасно по умолчанию, спасает только в крайних случаях.

## История документа

- 2026-06-08 v1 — собран по итогам сессии security-ревью где наблюдались 5+
  агентов на main. Первая рекомендация — `Вариант B` (worktree-by-default).
- 2026-06-08 v2 — пользователь возразил по bundle-pain на worktree'ях.
  Рекомендация переключена на `Вариант D` (ship-lock на trunk).
- 2026-06-27 v3 — после cleanup правил агентов текущая рекомендация:
  worktree+`pnpm agents:integrate` для 2+ независимых агентов; ship-lock
  остаётся guard'ом shipping-flow, а не моделью parallel editing.
