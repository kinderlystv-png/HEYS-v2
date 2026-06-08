# Push-train для 5+ параллельных агентов — design

> Это **design-документ**, не план реализации. Цель — собрать в одном месте
> варианты архитектуры, их трейд-оффы для HEYS, и рекомендацию. Решение о
> реализации — отдельным шагом после обсуждения.

## TL;DR

Для 5+ агентов на HEYS push-trunk-по-очереди **не подходит как есть** — ломается
на двух вещах: (1) `whats-new.json` привязан к commit-hash основного коммита;
(2) legacy-bundles имеют hash в имени файла, и pre-commit hook их пересобирает.

Лучший путь — **worktree-required-mode**, активирующийся когда детектится 2+
агентов, плюс **integration cron** что объединяет worktree-ветки в `main` каждые
N минут. Это эволюция существующей `pnpm agent:worktree` +
`pnpm agents:integrate` инфраструктуры (она УЖЕ есть, просто не включается по
умолчанию).

## Контекст: что есть сейчас

- `pnpm ship "<msg>"` — solo-default: stage → commit → whats-new → push → watch.
  Работает идеально для 1 агента, ломается при 2+.
- `pnpm agent:worktree <task>` — создаёт `.claude/worktrees/<task>` на branch
  `claude/<task>`, isolated. Уже есть, но требует ручного запуска.
- `pnpm agents:integrate --branches=...` — мерж worktree-веток в main с
  пересборкой. Уже есть, но запускается вручную пользователем.

## Что ломается при 5+ агентов на trunk (наблюдаемо в сессии 2026-06-08)

1. **`git reset --hard origin/main`** одного агента дропает unpushed коммиты
   других (`62c5273c` улетел в orphan, восстановлен через reflog).
2. **`git add -A`** в ship'е захватывал чужой WIP в чужой коммит (`11fbaec5` —
   security-CSP-edit угодил в fingers-коммит). Уже исправлено в `6e2dcd63`, но
   сценарий остаётся: lint-staged stash + pop сам по себе теряет MM-state.
3. **Stale `.git/index.lock`** после кручёного агента блокирует всех остальных.
   Фикс: `scripts/ship.mjs` cleanup-helper (этот PR).
4. **Non-fast-forward push** каскадом: A пушит, B пушит, B получает rejection,
   ребейзит, A снова пушит первым, и т.д. — 5+ агентов = постоянный гонящийся
   хвост.
5. **`whats-new.json` дубли** — каждый агент генерит свой entry; при merge'е
   получается 5 entries для одной фичи или конфликт.

## Почему наивный push-train не подходит для HEYS

В классической push-train модели (Gitlab Merge Train, Marge-bot и т.д.):

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
| Service Worker version (`sw.js` hash)                                            | Менее критично, но регенерируется.                                                                                                             |

Каждая из 5 деталей по отдельности фиксится, но **в сумме** train-механизм
должен быть умнее «обычного» merge-train: уметь по-настоящему пересобирать
целиком после каждого rebase'а и переписывать whats-new entries. На текущей
кодовой базе это 200+ строк нетривиальной логики.

## 3 варианта решения (по нарастанию инвазивности)

### Вариант A — оставить как есть + cooperative discipline (0 кода)

- Пользователь сам разруливает кто когда пушит.
- CLAUDE.md уже описывает: «если 2+ агентов — обязательно worktree». Реальность:
  не соблюдается.

**Плюсы:** 0 кода. **Минусы:** при 5+ агентах boilerplate-disciplines нарушаются
неизбежно (что сегодня и видно).

### Вариант B — worktree-by-default (~100-200 строк, минимально-инвазивно)

`pnpm ship` детектит наличие 2+ агентов и **отказывается** ship'ить с trunk'а.

Детектор: ENV-переменная `CLAUDE_AGENT_COUNT` (выставляется агентом при старте),
ИЛИ `.claude/agent-locks/<sessionid>` файлы которые агенты записывают и удаляют
при выходе.

Если `count >= 2` И `branch == main`: ship говорит «здесь должен быть worktree»,
предлагает auto-create через `pnpm agent:worktree`. Параллельные агенты
физически живут на разных веточках, не пересекаются.

Слияние в main — по-прежнему ручное (`pnpm agents:integrate`) или по cron.

**Плюсы:**

- Использует существующую worktree-инфру.
- Не требует переписывания whats-new / bundle-hashing логики.
- Решает 4 из 5 проблем из списка выше (#1-#4).
- Backward-compatible: solo агенту ничего не меняется.

**Минусы:**

- Whats-new entries при integrate всё равно нужно мерджить вручную (но это уже
  сейчас так — solved problem).
- Требует чтобы агенты знали свой `CLAUDE_AGENT_COUNT` (нужно договорённость).

### Вариант C — full push-train + reorg (~500-1000 строк, высоко-инвазивно)

Полноценная train-инфра:

1. Все агенты пушат в `train/<task>` (или `claude/<task>` в исходную схему).
2. `train-server.mjs` (новый long-running daemon) cron-style проверяет ветки
   `train/*`, рассчитывает order, ребейзит поверх свежего main, ПЕРЕГЕНЕРИРУЕТ
   whats-new + bundles, тестит, мерджит.
3. Если конфликт или test-fail — ветка возвращается, агент уведомляется.

**Плюсы:**

- Полностью автоматизировано: 50 агентов или 1 — одна и та же модель.
- main всегда зелёный, по определению.

**Минусы:**

- 500+ строк сложного кода в новом доменe (queue, rebase, regen).
- Hard-to-debug при провалах (rebase-конфликт vs flaky-test vs stale-baseline).
- Дублирование с GitHub Actions / Merge Queue (которая уже существует на
  платформе).
- Деплой задерживается на cycle-time train'a (~5 мин минимум).
- При hot-fix (security-миграция) приходится bypass'ить train — а значит
  bypass-механизм нужен ещё отдельно.

## Рекомендация: **Вариант B**

Worktree-by-default для агентов покрывает 80% пейна за 20% работы.

**Конкретные шаги (если решим делать):**

1. В `scripts/ship.mjs` добавить детектор `getActiveAgentCount()`:
   - Считает файлы `.claude/agent-locks/*` (создаются агентом при start,
     удаляются при clean exit; stale-cleanup как у git lock).
   - Если ENV `HEYS_FORCE_SOLO=1` — игнорировать счётчик.
2. `ship` на `main` с `count >= 2` отказывает с сообщением:
   ```
   ❌ 3 agents active in this repo. Solo ship to main not allowed.
      Switch to worktree:
        pnpm agent:worktree my-task
        # ...edit there...
        pnpm ship "<msg>" --allow-non-main
      Or force solo (if you know other agents are dormant):
        HEYS_FORCE_SOLO=1 pnpm ship "<msg>"
   ```
3. В `agents:integrate` — добавить `--auto-flag-conflicts` чтобы при конфликте
   мерж-коммит создавал TODO-маркер вместо краша.
4. Добавить `pnpm agents:status` — показывает кто сейчас работает, в каком
   worktree, сколько коммитов unpushed.

**Не делать в этом подходе:**

- Не писать train-daemon.
- Не трогать whats-new логику (она работает).
- Не реализовывать GitHub Merge Queue интеграцию (можно потом отдельно).

## Если очень хочется push-train — минимальная версия

Если после Варианта B всё ещё нужен train (например, агентов 10+ и интеграция
вручную невозможна), сделать **«thin train»**:

- `train-cron.mjs` запускается каждые 5 мин.
- Берёт все `claude/*` ветки которые `git log -1 --since="10 minutes ago"`.
- Для каждой: `git rebase origin/main`, если без конфликта —
  `pnpm agents:integrate --branches=<one>`.
- При конфликте: оставляет ветку, пишет comment в специальный issue (или
  `.claude/train-conflicts/<task>.md`).
- НЕ перегенерирует whats-new и bundles — это делает `agents:integrate` который
  УЖЕ всё умеет.

Это ~150 строк cron-демона вместо полноценного train-сервера. Можно гонять через
launchd на машине пользователя — не требует CI-инфры.

## Что НЕ предлагаю

- **GitHub Merge Queue** — overkill для соло-разработчика + работает только в
  enterprise, нужна подписка.
- **Submodules / monorepo split** — HEYS уже монорепо, дробление сделает только
  больнее.
- **Force-push allow** — опасно по умолчанию, спасает только в крайних случаях.
- **Per-agent branch protection rules** — нет на GitHub Free, и опять же
  overkill.

## Открытые вопросы

1. **Кто атомарно знает «сколько агентов сейчас активно»?** Варианты: ENV
   (хрупкое), файл-локи (надо договариваться), GitHub workflow check (медленно).
   Файл-локи самое простое и работает offline.
2. **Что делать с агентами которые умерли без cleanup?** TTL на lock-файлах (5
   мин heartbeat). Если файл старше — игнорируется.
3. **Кто запускает `agents:integrate` cron'ом?** На машине user'a через launchd
   / systemd-timer. Не на GitHub — потому что GitHub workflow runs не могут
   пушить в `main` без secret token (и долго).
4. **Что если в worktree уже сделан коммит, а main ушёл сильно вперёд?**
   `agents:integrate` уже умеет — делает merge-commit или rebase. Поведение
   проверено и стабильно с момента ввода (несколько недель ago).

## Дальнейшие шаги (если согласен с Вариантом B)

1. Этот документ — закоммитить как design.
2. Заявить отдельной SEC-NNN / engineering-NNN строку в
   `docs/SECURITY_REVIEW.md` Раздел Engineering-backlog.
3. Реализация — отдельной сессией, 2-3 часа работы.

## История документа

- 2026-06-08 — собран по итогам сессии security-ревью где наблюдались 5+ агентов
  на main и серия push-конфликтов / lost-commit incidents. Поводом стал прямой
  вопрос пользователя «дай дизайн push-train с учётом 5+ агентов».
