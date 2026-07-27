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
  `git diff` и проверки локального экрана. Полный прогон нужен, только если риск
  в типах, контрактах, бизнес-логике, сборке, роутинге, данных или безопасности
  нельзя надёжно закрыть точечно; число файлов само по себе не является
  причиной.
- Если всё же запускаешь тяжёлую проверку для маленькой правки, сначала коротко
  объясни пользователю, какой конкретный риск она закрывает.

## RuStore mobile release — общий обязательный flow

Перед RuStore build/release полностью прочитай
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

## Execution autonomy

<!-- POLICY {"id":"shipping-runbook-required","path":"docs/operations/AGENT_SHIPPING_RUNBOOK.md","before":["staging","commit","production-build","integration","push","pr"],"grantsPermission":false} -->
<!-- POLICY {"id":"commit-only-no-push","command":"pnpm ship","requiredArgs":["--no-push"],"push":false} -->
<!-- POLICY {"id":"push-requires-grant","taskApproval":false,"allowedGrants":["direct","session-wide-scoped"]} -->
<!-- POLICY {"id":"hook-bypass-explicit-only","tokens":["--no-verify","HUSKY=0"],"requires":"explicit-exact-operation"} -->
<!-- POLICY {"id":"agent-branch-source-only","branches":["claude/*"],"generated":false,"releaseArtifacts":false} -->
<!-- POLICY {"id":"integration-never-push","command":"pnpm agents:integrate","commits":true,"push":false} -->

- Если migration/deploy прямо входят в поручение или уже явно разрешены, делай
  их сам в текущей сессии: SQL миграции через `bash scripts/db/psql.sh -f ...`,
  cloud functions через `cd yandex-cloud-functions && ./deploy-all.sh <name>`.
  Сетевые таймауты, IAM, checksum-warnings — твои проблемы, не задачи
  пользователю.
- **Только по отдельной прямой команде:** staging под commit, `git commit`,
  production build (`pnpm build`), standalone/full legacy build, `pnpm ship`,
  `pnpm push:*`, integration/release artifacts, `git push`, PR и внешняя
  публикация. Approval задачи ≠ approval commit/shipping/push. Разрешённый
  commit включает обязательные hook side effects только для staged scope.
- Commit-only выполняй через `pnpm ship "..." --no-push`; обычный `pnpm ship`
  допустим только когда та же команда пользователя явно включает push. После
  commit-only спроси «пушить?». HARD invariant — push виден другим клиентам.
- Перед любым разрешённым staging/commit/production build/integration/push/PR
  полностью прочитай общий обязательный runbook:
  [docs/operations/AGENT_SHIPPING_RUNBOOK.md](docs/operations/AGENT_SHIPPING_RUNBOOK.md).
  Он описывает команды, hooks, dirty scope и worktrees, но сам не даёт
  разрешения.
- **Session-wide push grant.** Если пользователь сказал «пуш в конце» / «соберу
  пушем потом» / «копи всё, пушнём одним заходом» в начале сессии — это grant на
  ВСЮ сессию, не повторяй вопрос «пушить?» после каждого коммита. Один финальный
  push'ом в конце по явному «пуш». Зафиксируй grant как факт в ответе после
  первого коммита («ок, копим, пушу в конце») чтобы было видно что я понял
  правило. Incident 2026-06-08: 6× «пушить?» в течение часа, при том что был
  ранний grant «давай пуш уже в конце».
- Проси пользователя только когда нужен выбор, существенно меняющий scope или
  необратимый результат, 2FA/hardware key, чужой доступ, destructive вне
  согласованного плана либо ещё не разрешённый push. Техническое исполнение не
  перекладывай на пользователя.

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
4. **Если пользователь прямо попросил commit/shipping**, перечитай обязательный
   shipping-runbook из `Execution autonomy` и следуй выбранному permission flow.
   Без явной команды оставь preview-generated файлы перечисленными в финале как
   локальный QA-output.

`--files=<твои>` выбирает затронутые бандлы, но собирает их из текущего
состояния всех source-файлов этого bundle scope. Если туда попал чужой
параллельный source, явно сообщи это; несвязанные бандлы не трогай и не запускай
full `pnpm bundle:legacy` ради preview.

Preview bundles/manifests/index hash перечисляй как локальный QA-output. Убирать
можно только явно свои и больше не нужные preview-файлы; чужой или неясный
generated scope не stash/revert/delete. Если он блокирует действие, остановись и
сообщи о пересечении.

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

## Commit / shipping gate

- Перед разрешённым commit/shipping полностью прочитай общий runbook, указанный
  в `Execution autonomy`; длинная hook/worktree механика хранится только там.
- До staging проверь branch, status, staged/unstaged diff и ownership. Stage'и
  только intended scope; `git add -A` допустим лишь при явном принятии всего
  dirty scope. Перед checkout/reset также проверь локальные unpushed commits.
- Чужой или неясный WIP не stash/checkout/restore/reset/delete и не исправляй
  конфликт в нём. При пересечении остановись и сообщи scope/риск.
- Commit-only всегда сохраняет `--no-push`; push требует отдельного или ранее
  явно данного session-wide grant. Integration создаёт commits, но не push.
- На `claude/*` worktree коммить source-only; generated/release artifacts
  принадлежат явно разрешённому collector flow. Read-only параллельный аудит не
  требует worktree; независимые write-capable задачи изолируй по runbook.
- Hooks fail closed: следуй текущему stderr. Не используй `--no-verify` или
  `HUSKY=0` без отдельной прямой команды пользователя; `pnpm ship` намеренно не
  поддерживает `--no-verify`.

---

## Diagnostics

Каталог + quick reference: [DEBUGGING.md](apps/web/DEBUGGING.md).
