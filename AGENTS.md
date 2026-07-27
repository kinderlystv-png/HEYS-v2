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

Tone, implementation scope, shared workspace, verification budget, prompt rules
и adjacent observations — см. user-level AGENTS.md.

---

## Project-specific communication

- Всегда оценивай задачи пользователя критически и объективно: проверяй
  предпосылки, явно называй риски/противоречия и предлагай лучший рабочий путь,
  даже если он отличается от исходной формулировки задачи.
- В ответ на «что предлагаешь» — одно предложение «предлагаю X, потому что Y» +
  вопрос «делать?». Не вываливать варианты с заголовками и таблицей сравнения.

## Shared policy with Claude

- Общие safety/architecture правила должны совпадать с [`CLAUDE.md`](CLAUDE.md):
  scoped legacy-сборка, защита чужих dirty/generated зон, product UI/sync
  invariants, copy/marketing guardrails, local-dev verify и hook discipline.
- Различаться могут только agent-specific execution mechanics. Общий invariant:
  commit/staging под commit/push/PR/publication выполняются только по отдельной
  прямой команде пользователя. `CLAUDE.md` может описывать `pnpm ship` как
  shipping-механику, но не как разрешение ship'ить без команды. Если в правилах
  найден конфликт и оба policy-файла входят в текущий scope, сначала
  синхронизируй общий safety-инвариант, затем оставь явное agent-specific
  исключение. Иначе не расширяй задачу молча: зафиксируй конфликт пользователю.

## RuStore mobile release — проверенный flow

Перед RuStore build/release полностью прочитай общий обязательный runbook:
[apps/mobile/release/RUSTORE_AGENT_RUNBOOK.md](apps/mobile/release/RUSTORE_AGENT_RUNBOOK.md).
Он владеет изолированной сборкой, artifact gate, подписью, permissions,
модерацией и auth UI invariant. Сборка не разрешает загрузку или публикацию.

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

## Web/UI local QA and coder handoff

- После web/UI source-правок проверь source, выполни
  `pnpm bundle:legacy:auto --files=<свои source-файлы>` и обеспечь свежий
  `pnpm dev:local` на `localhost:3001`, если пользователь прямо не запретил
  сборку/запуск.
- Full `pnpm bundle:legacy` не используй для preview: он разрешён только по
  прямой команде на полную пересборку или в integration/release проходе.
- `--files=<свои>` выбирает затронутые бандлы, но собирает их из текущего
  состояния всех входящих source-файлов. Поэтому чужая правка того же bundle
  scope может корректно попасть в runtime; несвязанные бандлы не трогаются.
- До и после сборки проверь status, hash/manifest и соблюдай глобальный shared
  workspace invariant. Если чужой dirty/generated scope блокирует действие,
  остановись и следуй stderr hook'а только в пределах своих файлов.
- Preview bundles/manifests/index hash перечисляй в финале как локальный
  QA-output. Убирать можно только явно свои preview-generated файлы; чужой или
  неясный output не откатывай.
- Перед финалом перечисли свои source/generated файлы, проверки и риск
  параллельных изменений. Если bundle включил чужой source того же scope, скажи:
  «бандл собран из текущего состояния затронутого bundle scope».
- Для нетривиальных/multi-step web/UI задач агент создаёт «Протокол реализации»
  для ревьюера: короткий список крупных шагов, статусов и фактов проверки. После
  каждого крупного шага агент добавляет summary сделанного, риски/открытые
  вопросы и что именно ревьюеру смотреть. Для микроправок отдельный протокол не
  нужен.
- То же summary по крупным шагам агент дублирует в чат пользователю, чтобы
  ревьюер и пользователь видели один и тот же контекст.

## Execution autonomy

<!-- POLICY {"id":"shipping-runbook-required","path":"docs/operations/AGENT_SHIPPING_RUNBOOK.md","before":["staging","commit","production-build","integration","push","pr"],"grantsPermission":false} -->
<!-- POLICY {"id":"commit-only-no-push","command":"pnpm ship","requiredArgs":["--no-push"],"push":false} -->
<!-- POLICY {"id":"push-requires-grant","taskApproval":false,"allowedGrants":["direct","session-wide-scoped"]} -->
<!-- POLICY {"id":"hook-bypass-explicit-only","tokens":["--no-verify","HUSKY=0"],"requires":"explicit-exact-operation"} -->
<!-- POLICY {"id":"agent-branch-source-only","branches":["codex/*"],"generated":false,"releaseArtifacts":false} -->
<!-- POLICY {"id":"integration-never-push","command":"pnpm agents:integrate","commits":true,"push":false} -->

- Если migration/deploy прямо входят в поручение или уже явно разрешены, делай
  их сам в текущей сессии: SQL миграции через `bash scripts/db/psql.sh -f ...`,
  cloud functions через `cd yandex-cloud-functions && ./deploy-all.sh <name>`.
  Сетевые таймауты, IAM, checksum-warnings — твои проблемы, не задачи
  пользователю.
- Если пользователь поручил рабочий сквозной результат и уже явно разрешил
  необходимые migration/deploy-действия, не завершай задачу на частично
  работающем frontend или локальном preview. Сразу доведи всю цепочку до
  фактической проверки в целевой среде; остановка допустима только при реальном
  внешнем блокере, который нельзя устранить в текущей сессии.
- В дополнение к глобальному permission gate HEYS требует отдельной прямой
  команды на staging/commit, standalone/full legacy build, `pnpm push:*`,
  `pnpm ship`, integration/release artifacts, push и PR. Команда «сделай»
  разрешает source-правки, точечные проверки и локальный preview flow выше, но
  не эти действия. Разрешённый commit включает обязательные hook side effects
  только для staged scope, но не отдельный full/integration flow.
- Перед любым разрешённым staging/commit/production build/integration/push/PR
  полностью прочитай общий обязательный runbook:
  [docs/operations/AGENT_SHIPPING_RUNBOOK.md](docs/operations/AGENT_SHIPPING_RUNBOOK.md).
  Commit-only всегда выполняй через `pnpm ship "..." --no-push`; обычный
  `pnpm ship "..."` допустим только при прямом commit+push grant. Runbook не
  является разрешением на действие.
- **Git/deploy fact-check before answering.** На вопросы «ушло в push?»,
  «закоммичено?», «выложено?», «попало в main?» агент не отвечает по памяти
  своих действий. Сначала делает минимальную проверку факта:
  `git status --short --branch`, `git log --oneline --decorate --max-count=5`,
  при вопросе про remote — `git fetch origin` и повторный status, при вопросе
  про конкретные правки — `rg` / `git log -- <files>` / `git show --name-only`.
  Ответ разделяет: что сделал сам агент, что фактически есть локально, что
  фактически есть на remote.
- **Main как рабочая ветка:** если пользователь даёт прямую команду commit/push
  на `main`, агент может коммитить и пушить текущий staged/рабочий scope из
  `main` без ухода в отдельную ветку. Агент перед commit показывает/проверяет
  scope и stage'ит только согласованные файлы; `git add -A` допустим только если
  пользователь явно принимает весь dirty scope.
- На `codex/*`/agent-ветке коммить source-only. Generated/release artifacts
  создаёт только явно разрешённый collector/integration flow; он не разрешает и
  не выполняет push. Hooks fail closed: следуй stderr, не используй
  `--no-verify` или `HUSKY=0` без отдельной прямой команды пользователя.
- Проси пользователя только когда нужен выбор, существенно меняющий scope или
  необратимый результат, 2FA/hardware key, чужой доступ, destructive вне
  согласованного плана либо ещё не разрешённый push. Техническое исполнение не
  перекладывай на пользователя.

## Local dev

- **`pnpm dev:local`** — full stack (API:4001 + web:3001). Default for any
  full-stack work.
- После web/UI изменений агент запускает `pnpm dev:local`, если он ещё не
  запущен; если порт занят уже рабочим dev-server, использует существующий
  сервер и сообщает URL. Не оставлять нужную пользователю проверку на «запусти
  сам».
- `pnpm dev:web` / `pnpm dev:api` — isolated, only if API is already up
  separately. Web-only will fail sync with `ERR_CONNECTION_REFUSED:4001`.

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
клиент-видимых фич сверяйся с этим документом, но живые статусы задач обновляй
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
   `Object.keys(localStorage)`) возвращает данные всех клиентов, которые
   когда-либо логинились в этой сессии. Если код отдаёт эти данные React state
   как «meals/profile/etc for current client» или пишет их под
   `currentClientId`, это cross-client pollution. Pattern фильтра:
   `/^heys_([0-9a-f-]{36})_/i.exec(key)?.[1] === currentScope` (current =
   `HEYS.currentClientId.toLowerCase()`). Unscoped legacy keys принимаются.
   Incident 2026-06-02 #13: `loadMealsRaw` cross-key fallback в
   [apps/web/heys_day_utils.js](apps/web/heys_day_utils.js) тёк меж клиентами
   кураторов.
10. **Server резолвит canonical client_id из `context_id`, игнорирует
    browser-supplied.** Сервер выдаёт capability token `context_id` через
    `issue_write_context_by_curator/_by_session` RPC, привязанный к (curator_id,
    client_id) или (session_id, client_id). Каждый KV write несёт
    `p_context_id`; сервер валидирует через `validate_write_context()` и при
    mismatch переписывает `resolvedClientId ← context.client_id` вместо
    pollution. REST POST `/rest/client_kv_store` принимает `row.context_id`;
    `cloud._writeContextReady` закрывает boot race.

See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for full details on
each.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
