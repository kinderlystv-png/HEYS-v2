# HEYS-v2 — Agent instructions

Compact agent reference. Detailed architecture in
[apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md), debugging procedures in
[apps/web/DEBUGGING.md](apps/web/DEBUGGING.md), past bug post-mortems in
[apps/web/BUGS_HISTORY.md](apps/web/BUGS_HISTORY.md). Project status / TODO in
[todo.md](todo.md).

Для входа в незнакомую область сначала используй
[живой справочник](docs/reference/README.md): найди системное досье, затем перед
правкой перепроверь затронутый контракт по указанным исходникам и тестам.
Обновляй досье только при смене поведения, владельца данных, контракта,
инварианта или подтверждённого риска; после правки запускай
`pnpm docs:reference:check`.

Tone, communication length, adjacent observations — см. user-level CLAUDE.md.

---

## Project-specific communication

- **Всегда отвечать по-русски** — вне зависимости от языка вопроса, инструкций
  или содержимого файлов. Ответы пользователю, брифы и отчёты — только на
  русском.
- В ответ на «что предлагаешь» — одно предложение «предлагаю X, потому что Y» +
  вопрос «делать?». Не вываливать варианты с заголовками и таблицей сравнения.

## Coding guardrails

- Не делай молчаливых предположений: если задача допускает несколько трактовок,
  явно назови их; если без ответа высок риск, сначала спроси.
- Перед реализацией оцени реальную цель задачи и пиши минимальный качественный
  код, который закрывает её без потери надёжности, поддержки, безопасности и
  пользовательского качества. Качественное решение не равно сложное решение.
- Не добавляй speculative flexibility, новые абстракции, универсальные
  механизмы, конфиги, слои, future-proofing, расширяемость "на потом" или
  крупные рефакторы, если текущий scope этого не требует.
- Предпочтение по умолчанию: локальная правка → переиспользование существующего
  паттерна → небольшая новая функция → новая архитектура.
- Для микрозадач не пиши отдельный план: просто сделай минимальную качественную
  правку и проверь её соразмерно риску.
- Для нетривиальных задач перед кодом коротко зафиксируй: что должно измениться;
  какой минимальный качественный результат закрывает задачу; почему выбранное
  решение достаточно простое; какой более сложный вариант отклонён как
  избыточный; чем будет проверен результат.
- Новая архитектура допустима только если простое решение создаёт явную
  хрупкость, дублирование, нарушение существующих контрактов, проблемы
  безопасности или заметный риск будущих ошибок.
- Правки должны быть хирургическими: меняй только строки, которые прямо нужны
  для задачи; не форматируй и не рефакторь соседний код по пути.
- Чисти только последствия своей правки: новые unused
  imports/variables/functions убирай, старый unrelated dead code не трогай без
  отдельной команды.
- Для нетривиальных задач заранее формулируй проверяемый критерий успеха: "что
  должно измениться" + "какой тест/команда/ручной сценарий это доказывает".
- Проверки выбирай по риску. Для микроправок текста/CSS, удаления только что
  добавленного UI-слоя или отката своей последней правки не запускай полный
  `lint`/`tsc`/test/build цикл по привычке; достаточно точечного `rg`,
  `git diff` по затронутому файлу и визуального smoke. Полные проверки нужны,
  когда меняются типы, контракты, бизнес-логика, сборка, роутинг, данные,
  безопасность или несколько связанных файлов.
- Если всё же запускаешь тяжёлую проверку для маленькой правки, сначала коротко
  объясни пользователю, какой конкретный риск она закрывает.

## Полнота модулей: релиз без MVP

- Продуктовые тренировочные модули (режим пальцев, режим растяжек/разминок и
  будущие) делаем **сразу в полной релизной версии** — никакого MVP, никаких
  урезанных «фаз 1/2» с выпиленными разделами. Под релиз идёт **максимально
  полная и качественная** реализация по методологии и карте реализации модуля.
- «Фаза/очередь» в карте реализации = **порядок сборки** (зависимости:
  безопасность → каталог → движок → UI), а не тиры урезания фич. Ничто из
  методологии не откладывается «на потом» как условие релиза.
- Эталон полноты — режим пальцев (`apps/web/fingers`): все блоки/протоколы/
  периодизация/тесты/безопасность реализованы. Новый модуль доводится до того же
  уровня покрытия.

## Архитектура тренировочных режимов: общее ядро + контент домена

Режимов будет много (пальцы/скалолазание, мобильность, плавание, силовой,
кроссфит, бег, армрестлинг…). Не копируем реализацию под каждый и не впихиваем
все домены в один жёсткий шаблон. Модель — **три слоя + контракты**:

1. **Ядро (домен-агностичное, пишется один раз):** strangler-роутер,
   периодизация (машинерия макро/мезо/микро, deload/taper/maintenance),
   прогрессия (плато / оси перегрузки / MED-MEV-MAV), assessment→лимитер
   (алгоритм deficit×levelPrior → ведущий лимитер → веса блоков), readiness
   (z-score/MAD), **валидатор-фреймворк** (fail-closed gate-runner),
   records/persistence (client-scoped, PR/история), bibliography
   (+doseConfidence), runner-shell и timer-ядро (RPE/боль/abort/lifecycle),
   онбординг-фреймворк. Плюс authoring-шаблон «методология+имплемент-мап» и
   чекер покрытия ID.
2. **Контент домена — ДАННЫЕ, не код:** каталоги (оси/качества, атомы/блоки,
   протоколы/дозы, гейты, нормы), правила безопасности (как данные для
   валидатор-фреймворка), шаблоны периодизации, policy прогрессии, бенчмарки,
   записи библиографии, схема онбординга. Это прямой выход «методология →
   данные».
3. **Тонкий код домена — только где реально иначе:** специализированные плееры и
   измерители (вис-таймер, дыхательный пейсер, интервал/темп, гребок,
   гониометрия, динамометр), доменные визуализации.

**Связь слоёв — стабильные контракты:** схема атома (теги-оси), интерфейс
валидатора (domain hook), интерфейс assessment/бенчмарков, интерфейс шаблона
периодизации, абстрактный lift-identifier для records, конфиг фаз runner'а.
Новый домен = его данные + пара плееров против контрактов, без переписывания
ядра.

**Канонический словарь ядра.** Одни и те же абстракции называются одинаково во
всех доменах. Не плодить синонимы (`quality_catalog`↔`axis_catalog`,
`block_catalog`↔`atom_catalog`, `mix_engine`↔`routine_builder`,
`age_gating`↔`population_gating`): домен мапит свои понятия на словарь ядра, а
не переименовывает движок.

**Дефолт — reuse by contract, not by copy.** Новая общая логика идёт в ядро как
generic + данные, пока не доказано, что она домен-специфична. Дублировать
периодизацию / safety-framework / records / runner-shell в каждом режиме —
запрещено.

**Шаблон — каркас, не прокруст.** 11-частную методологию и имплемент-мап
переиспользуем для каждого домена как authoring-шаблон; домен вправе пометить
разделы `—` (n/a) и **добавить свои оси/разделы** (бег: пейс-зоны/ACWR/VO2;
плавание: механика гребка). Не впихивать домен в чужие оси силой.

**Порядок извлечения ядра (не абстрагировать из одного примера).** Пальцы =
первая реф-реализация; абстрагировать ядро только из неё рискованно
(забетонирует climbing-допущения grip/edge/a2ForceRatio). Мобильность строим как
**вторую реф-реализацию против контрактов**, сразу переиспользуя
тривиально-общее (роутер, timer-shell, records, bibliography,
readiness-математику, валидатор-фреймворк, онбординг). Тяжёлые общие движки
(периодизация, лимитер, прогрессия) **выносим в ядро после мобильности**, когда
форма общего видна на двух доменах (правило двух/трёх). Размещение: общее —
`apps/web/_kernel/` (или packages), домен — `apps/web/<domain>/`.

## Execution autonomy

- Делай шаги сам в текущей сессии: SQL миграции через
  `bash scripts/db/psql.sh -f ...`, cloud functions через
  `cd yandex-cloud-functions && ./deploy-all.sh <name>`. Сетевые таймауты, IAM,
  checksum-warnings — твои проблемы, не задачи пользователю. Commit/shipping
  остаётся отдельным явным действием, см. ниже.
- **`git push` — только по явной команде** («пуш», «push», «запушь»,
  «выкатывай»). Approval задачи ≠ approval commit/shipping/push. После явно
  разрешённого commit: «закоммитил, пушить?». HARD invariant — push виден другим
  клиентам.
- **Session-wide push grant.** Если пользователь сказал «пуш в конце» / «соберу
  пушем потом» / «копи всё, пушнём одним заходом» в начале сессии — это grant на
  ВСЮ сессию, не повторяй вопрос «пушить?» после каждого коммита. Один финальный
  push'ом в конце по явному «пуш». Зафиксируй grant как факт в ответе после
  первого коммита («ок, копим, пушу в конце») чтобы было видно что я понял
  правило. Incident 2026-06-08: 6× «пушить?» в течение часа, при том что был
  ранний grant «давай пуш уже в конце».
- Просить пользователя — только: 2FA / hardware key, чужой доступ, destructive
  вне согласованного плана, push на remote.

## Local dev

- **`pnpm dev:local`** — full stack (API:4001 + web:3001). Default for any
  full-stack work.
- `pnpm dev:web` / `pnpm dev:api` — isolated, only if API is already up
  separately. Web-only will fail sync with `ERR_CONNECTION_REFUSED:4001`.

### Verify-перед-сдачей: собери бандл + подними локалку (обязательно)

После любой правки legacy-файла, видимой в браузере (UI/поведение/текст), **до
доклада «готово»**:

1. **Пересобери ТОЛЬКО свои файлы:**
   `pnpm bundle:legacy:auto --files=<твои файлы>`. `dev:web` грузит хеш-бандлы
   из `public/` как статику (без HMR) — без пересборки правку не видно.
   **Никогда** не запускай full `pnpm bundle:legacy` ради превью:
   hash-коллизии + задевает чужие бандлы. Скоуп `--files=` трогает только
   бандлы, затронутые твоими файлами.
2. **Подними `pnpm dev:local`** (если ещё не поднята) и **reload** — убедись
   глазами и по поведению, что правка реально работает. Это то, что пользователь
   видит сразу.
3. **Сделай ревью диффа** (`/code-review` или вдумчивое самокритичное чтение)
   перед докладом — verify ≠ review, нужны оба.
4. **Если пользователь прямо попросил commit/shipping — коммить через
   `pnpm ship`**. `legacy-sync` пересоберёт и вшьёт бандл в твой коммит,
   скоупнуто по правкам. Без явной команды commit/shipping оставь
   preview-generated файлы перечисленными в финале как локальный QA-output.

**Своё vs чужое — решено архитектурно.** `--files=<твои>` означает «пересобери
бандлы, которые задеты твоими файлами», а не «вырежи чужой код из бандла».
Пересборка читает **текущее состояние диска** всех модулей этих бандлов — если
чужая параллельная правка лежит в том же бандле, она корректно попадёт в runtime
(так и надо: бандл обязан соответствовать коду на диске). Чего `--files`
избегает — это пересборки **несвязанных** бандлов, которых никто не трогал: full
`bundle:legacy` плодит им новые хеши на неизменном контенте → коллизии и затирка
чужих in-flight bundle-артефактов. То есть превью чужие source-правки **не
теряет** и **не перетирает**; в коммит чужое берёт только «сборщик» осознанным
`git add` (см. «Commit/shipping flow»).

**Не оставляй превью-артефакты болтаться.** Если пересобрал бандл для проверки,
но не коммитишь сразу — помни, что dirty hybrid-файл (бандл/manifest/index.html)
не из коммита **останавливает `legacy-sync` другим агентам**. Либо доведи до
своего `ship`, либо отдельным явным действием убери только свои
preview-generated файлы перед переключением на другое. Чужие/неясные
generated-файлы не трогай.

---

## Product UI invariants

- Если правило/подраздел методологии влияет на решение движка, оно должно быть
  как-то видно в UI: не обязательно отдельным экраном, но минимум tooltip,
  аннотация, trace/reason, badge/chip, help-popover или строка объяснения в
  самом уместном месте пользовательского flow.
- `UI —` допустимо только для чисто внутренних механизмов, которые не меняют
  пользовательское решение/рекомендацию, или для dev-only tooling. Если
  методология и движок говорят ✅, а UI пустой, это UI-бэклог, а не `n/a`.
- User-facing объяснение должно быть кратким и практичным: что система учла, как
  это повлияло на рекомендацию, и что пользователю с этим делать.

### Progressive disclosure: простое по умолчанию

- Правило действует для всего клиентского и кураторского product UI; dev-only
  tooling исключено. Полнота ядра и методологии не должна превращаться в
  плотность первого экрана.
- Первый слой показывает текущий статус или рекомендацию, краткую причину,
  обязательные сейчас поля и одно визуально доминирующее следующее действие.
  Вторичные действия остаются доступными, но не конкурируют с главным.
- Редкие настройки, экспертные параметры, методологические детали, история и
  полный trace размещаются во втором контекстном слое: `Подробнее`, `Настроить`,
  раскрываемый блок или help-popover в том же flow. Обычный сценарий должен
  проходиться с разумными значениями по умолчанию без открытия этого слоя.
- Нельзя прятать во второй слой безопасность, противопоказания, pain/abort,
  блокирующие ошибки, обязательные решения, необратимые последствия и краткую
  причину, существенно изменившую рекомендацию. Навигация назад/отмена и
  аварийная остановка остаются доступными и не считаются конкурирующим основным
  действием.
- Новая возможность ядра не означает автоматического появления нового видимого
  контрола. Сначала покажи результат и практическую причину; управление выноси
  на первый слой только когда оно нужно большинству пользователей для следующего
  действия, иначе оставляй во втором слое.
- Полнота релиза относится к возможностям, а не к количеству одновременно
  показанных элементов: оба слоя полностью входят в релиз. Progressive
  disclosure упрощает восприятие, а не превращает полный модуль в MVP или
  отложенную «фазу 2».
- Перед каждой UI-правкой агент одной строкой фиксирует:
  `UI-гейт: цель — …; главное действие — …; слой 1 — …; слой 2 — …; критическое не скрывать — …`.
  Для крупного flow строка входит в протокол реализации; для микроправки
  достаточно короткого рабочего сообщения с `слои не меняются`.
- После каждой UI-правки соразмерно её риску проверь, что основной сценарий
  понятен без инструкции и проходит без открытия деталей, вторичные действия не
  спорят с главным, а нужные детали доступны. Для микроправки не нужен отдельный
  план или тяжёлый test/build-цикл.

---

## Landing & user-facing copy

Продукт серьёзного уровня. Копирайт лендинга и любой клиент-видимый текст
требует особого режима: нет места разговорному сленгу, стартап-жаргону, калькам
с английского, overpromise и техническим деталям внутреннего процесса.

**Конкурентные решения.** Лендинг и клиент-видимые функции приложения сверяются
с [`маркетинг/30_Конкурентные_решения.md`](маркетинг/30_Конкурентные_решения.md)
(выведена из аудита рынка `маркетинг/29`). При любой правке лендинга или
клиент-видимых фич: сверяйся с этим документом, но живые статусы задач обновляй
только в `маркетинг/22`; дашборд (`маркетинг/00_Дашборд.html`, вкладка
«Конкуренты») пересоберётся авто-хуком. Новые заимствования у конкурентов —
только через резолюцию в журнале `маркетинг/15` (§2), не напрямую в код.

**Перед написанием или правкой любого user-facing текста — обязательно прочитай
[`apps/landing/COPY_VOICE.md`](apps/landing/COPY_VOICE.md):**

- Чёрный список запрещённых слов и конструкций
- Принципы (клиентоориентированный flow, конкретика вместо абстракции)
- **История замечаний** — пополняй её новой записью когда получаешь feedback по
  копирайту.

---

## Architecture invariants (read first when touching products/sync)

1. **Products canonical = `HEYS.OverlayStore` merged view**, not legacy
   `heys_products` LS. Wrapped via `installOverlayWrapper` in
   [heys_core_v12.js](apps/web/heys_core_v12.js).
2. **Cloud is the single source of truth.** Single product entry point:
   `HEYS.OverlayStore.applyCloudSnapshot()`. Local mutations auto-sync via
   `writeRaw` (debounced 2s).
3. **PIN and curator sessions load products identically.** Curator-only diff:
   sees shared+moderation subtabs in RationTab; orphan-recovery skipped to avoid
   cross-client stamp pollution.
4. **Auth keys never touched by storage tooling**: `heys_supabase_auth_token`,
   `heys_pin_auth_client`, `^sb-*` — hard allowlist in storage registry.
5. **All `localStorage.setItem` is intercepted** by
   [heys_storage_supabase_v1.js](apps/web/heys_storage_supabase_v1.js). The
   interceptor routes cloud sync, dual-writes legacy products mirror, and gates
   against stale cloud overlay. Direct `originalSetItem.bind(...)` bypasses the
   interceptor — when tracing, patch `Storage.prototype.setItem` instead.
6. **DB schema**: `client_kv_store` has FK
   `client_id → clients(id) ON DELETE CASCADE` (added 2026-05-11). Deleting a
   client cascades to all per-client storage.
7. **Никогда не пиши cleanup/garbage-collection через shape inference.** Функции
   которые решают «valid vs invalid» по наличию полей вроде `.name` / `.id`
   ломаются при эволюции данных (overlay v2 → TypeA rows без `.name`; tombstone
   arrays держат IDs, не объекты). Использовать explicit tombstones /
   versioning. См. `BUGS_HISTORY.md` cloud cleanup destruction 2026-05-11.
8. **UPSERT на таблицах с auth-триггерами по `NEW.user_id`** (`client_kv_store`
   и подобные) — всегда `SET user_id = EXCLUDED.user_id` в `ON CONFLICT`. Иначе
   stale `user_id` прошлого writer'а проходит trigger-condition и блокирует
   легитимные writes (incident 2026-05-28, PIN-flow 500; hotfix
   `database/2026-05-28_fix_pin_path_user_id.sql`).
9. **Любой scan по localStorage обязан фильтровать foreign-scoped keys.**
   Pattern-based LS поиск (`key.includes('_dayv2_')`,
   `Object.keys(localStorage)`) возвращает данные **всех клиентов** что
   когда-либо логинились в этой сессии (особенно incognito multi-tab, где все
   tabs делят LS). Если код потом отдаёт эти данные React state как
   «meals/profile/etc for current client» или пишет их под `currentClientId` —
   это cross-client pollution. Pattern для фильтра:
   `/^heys_([0-9a-f-]{36})_/i.exec(key)?.[1] === currentScope` (current =
   `HEYS.currentClientId.toLowerCase()`). Unscoped legacy keys принимаются.
   Incident 2026-06-02 #13: `loadMealsRaw` cross-key fallback в
   [apps/web/heys_day_utils.js:600](apps/web/heys_day_utils.js#L600) — годами
   тёк меж клиентами кураторов.
10. **Server резолвит canonical client_id из `context_id`, игнорирует
    browser-supplied.** Phase A+B (2026-06-02): сервер выдаёт capability token
    `context_id` через `issue_write_context_by_curator/_by_session` RPC,
    привязанный к (curator_id, client_id) или (session_id, client_id) в момент
    issue. Каждый KV write несёт `p_context_id` — сервер валидирует через
    `validate_write_context()` и при mismatch переписывает
    `resolvedClientId ← context.client_id` (rerouting вместо pollution). REST
    POST `/rest/client_kv_store` тоже принимает `row.context_id` (первая
    capability-based auth для этого endpoint'a). `cloud._writeContextReady`
    awaitable promise закрывает boot race (saveClientViaRPC ждёт до 3 сек). См.
    `write_contexts` table + plan
    `/Users/poplavskijanton/.claude/plans/cosmic-tickling-lynx.md`.

See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for full details on
each.

---

## Pre-commit / pre-push hooks

Активные хуки:

- commit-msg: commitlint;
- pre-commit: `lint-staged`, `check-agent-staging` (source-only guard в
  agent-mode), `legacy-sync` (rebundle+auto-stage в integration-mode,
  report-only в agent-mode), lazy chunk/pricing/sync-mirror guards, allowlist
  auto-fix;
- pre-push: `prepare-release:check` (whats-new), localStorage guards,
  `lint-unscoped-client-writes`, `lint-raw-session-clear`, bundle-size guard,
  React.startTransition warn-only guard, legacy-bundle verify, web tests cache;
- manual only: `lint-shared-cache-writes` (`pnpm lint:shared-cache`) не является
  активным Husky hook.

## Commit/shipping flow: `pnpm ship` на `main`

**Только по явной команде commit/shipping:** одиночный shipping-flow —
`git add <intended files>` → `pnpm ship` на `main`. `ship` не stage'ит
dirty-файлы сам: explicit staging — сигнал, что агент осознанно выбрал commit
scope. Если сессия открылась на старой `claude/*`-ветке от прошлой задачи —
`git checkout main` первым делом (ship сам предупредит, если запустить не с
main, и подскажет команду).

**Чужие dirty-файлы в общем дереве — не commit scope по умолчанию.** Перед
staging всегда смотри `git status`, группируй файлы по смыслу и stage'и только
intended files. `git add -A` допустим только если пользователь/сборщик осознанно
принимает весь dirty scope как одну логическую группу.

Чужой WIP не трогать вручную: не делать `stash`, `checkout`, `restore`, `reset`,
удаление generated-файлов или конфликт-правки в чужом scope без прямой команды
пользователя. Если чужой dirty/generated файл мешает shipping, остановись,
покажи scope/риск и следуй stderr hook'а только в пределах явно выбранных
файлов.

```bash
# Solo / точечная правка — стейдж конкретных файлов:
git add apps/web/fingers/heys_fingers_grid_v1.js TESTS/heys_fingers_grid.test.js
pnpm ship "feat(fingers): добавить grid hint"   # UI-правка

# Сборщик: выбрать intended scope, нарезать на логические коммиты по смыслу.
# Каждый коммит — своя группа файлов, push один раз в конце:
git add apps/web/fingers/*           && pnpm ship "feat(fingers): grid hint" --no-push
git add apps/web/heys_core_v12.js    && pnpm ship "fix(sync): drop stale dayv2" --no-push
git add scripts/                     && pnpm ship "chore(scripts): refactor logging" --no-push
git push    # по явной команде «пуш»

# Если вся dirty осознанно принята как одна логическая группа:
git add -A && pnpm ship "feat(...): ..."

# План без коммита:
git add <files> && pnpm ship "..." --dry-run
```

Что делает [scripts/ship.mjs](scripts/ship.mjs):

1. **Проверяет staged** — если ничего не застейджено, но в worktree есть dirty
   файлы, отказывается работать и показывает что было бы захвачено. Это
   страховка от пустого/случайного коммита: агент должен сначала явно выбрать
   нужную группу (`git add <intended files>` или осознанный `git add -A`).
2. Коммитит staged. Pre-commit в `integration`-режиме пересобирает **только
   бандлы, затронутые staged-правкой** (через `bundle:legacy:auto`) и сначала
   падает, если unstaged legacy source мог бы попасть в тот же generated output.
3. Генерит whats-new entry и коммитит её отдельным `chore(release):` — kind
   зависит от типа основного коммита (см. таблицу ниже).
4. Push и (если ты на `main`) — `gh run watch` для деплоя.

### Тип коммита определяет whats-new

| Правка                                                            | Type                            | Whats-new                                             |
| ----------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| Видна пользователю в UI: новая кнопка/экран/текст, поведение фичи | `feat`/`fix`/`perf`             | user-facing entry показывается в модалке «Что нового» |
| Сборка, скрипты, CI, tooling, dev-инструменты                     | `chore(scripts)`/`chore(build)` | technical entry — НЕ показывается пользователю        |
| Security-аудит, миграции БД, RLS, гранты, capability-токены       | `chore(security)`               | technical entry                                       |
| Документация, methodology, doc-комменты                           | `docs(...)`                     | technical entry                                       |
| Тесты, фикстуры                                                   | `test(...)` или `chore(tests)`  | technical entry                                       |
| Рефакторинг без видимых изменений поведения                       | `refactor(...)`                 | technical entry                                       |

Правило: **«если пользователь не заметит правку без диффа — это не
`feat`/`fix`/`perf`»**. Technical-entry создаётся всё равно (deploy-gate требует
entry per build hash), но в user-facing модалке whats-new её не видно. Никакого
спама пользователю про внутренние работы.

### Никогда руками

- **`pnpm bundle:legacy`** (полный rebuild) — задевает чужие бандлы и плодит
  hash-коллизии. Pre-commit `legacy-sync` сам пересоберёт ровно нужные. Для
  локального превью без коммита —
  `pnpm bundle:legacy:auto --files=<твои файлы>`. Scoped preview rebuild нужен,
  чтобы localhost сразу увидел твою web/UI-правку; он не является разрешением
  stage/commit/push и не должен stash/revert чужие правки.
- **`git push`** — только по явной команде («пуш», «push», «выкатывай»).
- **`--no-verify`** — только по явному разрешению. Когда пользователь явно
  разрешил для текущей операции («да на no-verify», «давай через no-verify»,
  «можно --no-verify») — выполняй, **не переспрашивай повторно**. Правило
  защищает от молчаливого обхода хуков, а не требует многократного подтверждения
  одной и той же операции.
- **`pnpm agent:worktree`** «на всякий случай». См. ниже.

### Dirty scope в shared root checkout

В корневом checkout'е могут лежать чужие правки. Сборщик может взять их в commit
только как осознанный intended scope, а не случайным `git add -A`. Перед
`git add`:

- **`git status`** — посмотри что в дереве целиком. Сгруппируй файлы по смыслу
  (фича / фикс / scripts / тесты) и сделай по коммиту на группу. Связанные
  правки разных агентов можно класть в один логический коммит, если это
  намеренное решение сборщика.
- **Хочешь всё одним заходом** — `git add -A && pnpm ship "..."` только если
  весь dirty scope принят как один логический commit.
- **Нужно изолировать только часть** — стейдж конкретной группы:
  `git add <path1> <path2>` или pathspec `git commit -- <path1> <path2> ...`.
- **Не чисти чужое для удобства** — чужие source/generated/WIP файлы не
  stash/revert/delete. Если нужен clean baseline, согласуй это как отдельное
  действие или работай в своём worktree.
- **Hook `legacy-sync`** падает, если в дереве dirty hybrid-файл
  (`apps/web/index.html`, бандл, manifest), которого нет в текущем коммите —
  чтобы коммит с правкой кода не разошёлся со своим бандлом и не прятал чужой
  WIP. Hook больше не делает auto-stash: если это твой preview-output, убери или
  пересобери свой scope отдельным явным действием; если scope чужой/неясный —
  остановись и используй worktree/integration-pass. Он также падает, если
  unstaged legacy source может попасть в тот же generated output: бандл не
  должен коммититься с кодом, которого нет в source scope. Следуй stderr.
- **Перед `git reset --hard|--mixed origin/main`** (или любой `reset` с
  расхождением между HEAD и upstream) — **обязательно** проверь
  `git log --oneline @{u}..HEAD`. Если что-то выведено — это **локальные не
  запушенные коммиты другой сессии**, которые ресет сотрёт. Не ресетить молча:
  это reflog-recoverable, но параллельный агент об этом не узнает и потеряет
  работу. Альтернатива: `git fetch` + `git rebase origin/main` (сохраняет
  локальные коммиты поверх свежего main), либо разобраться по reflog чьи это
  коммиты и согласовать. Инцидент 2026-06-08: чужой
  `git reset --mixed origin/main` снёс 2 моих unpushed коммита (восстановилось
  через worktree- dirty + reflog, но могло легко потеряться).

### Worktree — для реальной параллельной работы

Если одновременно работают 2+ агента над независимыми задачами, используй
worktree + `pnpm agents:integrate`: это защищает от случайного staging чужого
WIP и от dirty generated-конфликтов. Общий root checkout допустим для одиночной
сессии или для роли сборщика, который осознанно принимает общий dirty scope.
`pnpm agents:integrate` — commit-producing collector flow: он мержит ветки,
собирает generated/release artifacts и делает integration commits, но не push.
Mutating запуск требует `--confirm-integration`; запускать только из главной
сессии после явной команды на integration/shipping. Если правка должна жить
отдельно от main (эксперимент, долгий рискованный рефактор под отдельный
review), worktree тоже правильный вариант:

```bash
pnpm agent:worktree <task>            # .claude/worktrees/<task> на claude/<task>
# каждый агент работает в своём worktree, source-only коммиты
pnpm agents:integrate --confirm-integration --branches=claude/a,claude/b ...
git worktree remove .claude/worktrees/<task>   # ОБЯЗАТЕЛЬНО после интеграции
```

**Stale-worktree'и накапливаются и ломают соло-агентам коммиты** (триггерят
«shared root checkout» guard в pre-commit). Перед заведением нового worktree
проверь `git worktree list` — если там 3+ старых, сначала `git worktree prune` и
`git worktree remove` ненужные.

### Legacy push-инструменты (избегай)

`pnpm push:agent` / `pnpm push:ready` — fallback multi-step flows. Дефолт =
`ship`. Эти команды трогай только когда ship не подходит (например коммиты уже
сделаны без ship'a). `push:agent` сам запускает `pnpm push:preflight` перед
`git push`; отдельный `push:preflight` нужен только для диагностики локальных
guards. `pnpm push:safe` deprecated: `HUSKY=0` не является нормальным push-flow.

Если пользователь прямо просит commit+push/push, не делай заведомо падающий
пробный `git push` перед подготовкой релиза. До первого push сразу выбери
штатный shipping flow: `pnpm ship` для одного staged shipping-коммита или
`pnpm push:agent -- --confirm-push ...` для уже сделанных/сгруппированных
коммитов. Заранее учитывай gates, которые всё равно сработают на pre-push:
`prepare-release:check` / What's New, `verify:legacy-bundles`,
localStorage/session guards, bundle-size guard и web tests cache.

**Dev-цикл «увидеть свою правку без коммита»**: `pnpm dev:web` грузит хеш-бандлы
из `public/` как статику (без HMR). Чтобы увидеть свою правку —
`pnpm bundle:legacy:auto --files=<твои>` и reload. После `ship`'a этот ручной
rebuild не нужен.

**Когда хук срабатывает — следуй его stderr.** В тексте — точные инструкции.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
