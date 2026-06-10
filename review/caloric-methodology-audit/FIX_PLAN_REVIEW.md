# Ревью FIX_PLAN.md (B-2 / B-3) + бриф реализатору

Дата ревью: 2026-06-10. Все утверждения плана проверены по коду построчно,
численные — прогоном `verify_caloric.cjs` (путь в скрипте был захардкожен на
чужую сессию — исправлен на `__dirname`-relative, скрипт снова рабочий).

## Вердикт

План в целом корректен и направление (Option A + единая константа ATWATER)
правильное. Но **B-2 неполон**: точек нормы `/4` не 2, а **9** в 5 файлах, плюс
найден смежный баг жира `/8` и мёртвая делегация `TDEE.calcBMR`. Реализовывать —
по брифу ниже, а не по таблицам исходного плана.

## Подтверждено ✅

- `heys_day_calculations.js:74` — `(K*protPct/100)/4` ✅
- `heys_metabolic_intelligence_v1.js:807` — `(optimum*protPct)/4` (protPct в
  долях) ✅
- Приход везде net ×3: `models:581,1398,1698`;
  `add_product:2490,4238,4290,4354`; `metabolic:793` ✅
- `HEYS.TEF.ATWATER = {protein:3, carbs:4, fat:9}` существует
  (`heys_tef_v1.js:25`, экспорт `:179`) ✅
- `user_v12:898-900` и `1257-1259` — действительно Harris-Benedict
  (447.593/88.362), комментарий `:896` лжёт про Mifflin ✅; рост хранится в
  метрах → при подстановке `calcBMR` передавать `height*100` ✅
- `HEYS.TDEE.calcBMR(weight, profile)` — Mifflin, рост в см,
  `gender === 'Женский'` (`heys_tdee_v1.js:57-64`) ✅
- Математика: недобор по белку 104–172 ккал и ΔBMR 44–101 ккал подтверждены
  прогоном `verify_caloric.cjs`; `/3` даёт точное схождение; +33% = ×4/3 ✅
- Дневной optimum — на Mifflin, B-3 его не двигает ✅ (но см. находку 3: Mifflin
  там получается через fallback, а не через делегацию)
- `pi_product_picker.js:924` — уже `*3` (net), фикс не нужен ✅

## Расхождения и новые находки ❌

### 1. Точек нормы `/4` не 2, а 9 (5 файлов-источников)

| Файл:строки                                       | Что                                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heys_day_calculations.js:74`                     | в плане ✅                                                                                                                                                |
| `heys_metabolic_intelligence_v1.js:807`           | в плане ✅                                                                                                                                                |
| `heys_reports_tab_impl_v1.js:365, 512, 615, 734`  | **пропущено** — нормы в отчётах                                                                                                                           |
| `heys_yesterday_verify_v1.js:627`                 | **пропущено** — inline fallback-копия computeDailyNorms (делегация строкой выше есть, но копию выровнять)                                                 |
| `heys_day_caloric_balance_v1.js:1629, 1634, 1639` | **пропущено** — protein-debt: ккал-гэп → граммы через `/4`, при том что `avgProtPct` строкой 1619 считается через `*3`. Несостыковка внутри одной функции |

`heys_day_core_bundle_v1.js:2884` и прочие `*_bundle_v1.js` / `public/*` —
авто-генерация, руками не править (pre-commit `legacy-sync` пересоберёт).

### 2. Бонус-баг: жир `/8` в отчётах

`heys_reports_tab_impl_v1.js:365-блок, 512-блок, 615, 734` делят жир на **8**
вместо 9 (грамм-цель жира завышена на +12.5% в отчётах vs день). Перевод на
`ATWATER.fat` чинит заодно. Включить в этот же PR.

### 3. B-3, day_utils: диагноз плана неверен, реальный баг другой

- Утверждение «`prof.sex` нет в профиле» — **неверно**: `getProfile()`
  (`heys_day_utils.js:766-771`) нормализует `gender`→`sex` ('female'/'male').
  Fallback по полу корректен. **Менять fallback на `gender` нельзя** — сломает
  (в этом профиле `gender` отсутствует).
- Реальный баг: делегация `heys_day_utils.js:795` зовёт
  `HEYS.TDEE.calcBMR({...prof, weight: w})` **одним объектом**, а сигнатура —
  `(weight, profile)` → `10*object = NaN` → `r0` → 0 → результат отброшен →
  **всегда работает fallback**, делегация мертва.
- Тот же класс бага у трёх соседей, зовущих `calcBMR(profile)` одним аргументом:
  `insights/pi_calculations.js:56` (возвращает 0 наружу!),
  `insights/pi_analytics_api.js:203`, `heys_predictive_insights_v1.js:497`.
- Фикс: **overload в `heys_tdee_v1.js calcBMR`** — если первый аргумент объект,
  трактовать как profile (`weight = +profile.weight`), принимать
  `profile.sex === 'female'` как синоним `gender === 'Женский'`. Чинит все 4
  вызова разом, без правки каждого call-site.

### 4. Blast-radius: уточнение

Нормы прошлых дней пересчитываются live из stored `optimum` + `normPerc` → после
фикса грамм-цель белка **в истории тоже визуально изменится** (+33%). Это
ожидаемо (eaten не трогается), но в таблице blast-radius плана строка «Целевые
граммы белка ⬆️» относится и к прошлым дням — проговорить в whats-new не надо,
но в тестах snapshot-проверку оставить.

---

## Бриф реализатору

Принятое решение: **Option A** (норма → net `/3`), плюс B-3. Без push до явного
«пуш». Тип коммита `fix` (user-facing whats-new по `COPY_VOICE.md`).

**Шаг 1 — константа.** Источник факторов — `HEYS.TEF.ATWATER`. В каждом
файле-потребителе:
`const A = (HEYS.TEF && HEYS.TEF.ATWATER) || {protein:3, carbs:4, fat:9};` (TEF
может быть не загружен — fallback обязателен).

**Шаг 2 — B-2, все 9 точек + жир:**

- `heys_day_calculations.js:73-75`: `/4 /4 /9` → `A.carbs / A.protein / A.fat`
- `heys_metabolic_intelligence_v1.js:807`: `/4` → `A.protein`
- `heys_reports_tab_impl_v1.js:365, 512, 615, 734`: белок `/4`→`A.protein`, жир
  `/8`→`A.fat`, углеводы `/4`→`A.carbs`
- `heys_yesterday_verify_v1.js:627`: `/4` → `A.protein` (выровнять всю
  fallback-копию с computeDailyNorms)
- `heys_day_caloric_balance_v1.js:1629, 1634, 1639`: `/ 4` → `/ A.protein`
- Опционально (рекомендую, тот же PR): приходные хардкоды `3/4/9` в
  `models:581,1398,1698` и `add_product:2490,4238,4290,4354` → та же константа.
- Бандлы и `public/` не трогать руками.

**Шаг 3 — B-3:**

- `heys_user_v12.js:898-900` и `1257-1259`: inline H-B →
  `HEYS.TDEE.calcBMR(weight, { gender: profile.gender, height: h*100, age })`.
  ⚠️ рост в `user_v12` в метрах — передавать см. Комментарий `:896` оставить
  (станет правдой), убрать упоминание H-B-коэффициентов.
- `heys_tdee_v1.js:57`: добавить overload — первый аргумент-объект = profile,
  `weight` из `profile.weight`; пол: `gender==='Женский' || sex==='female'`.
- `heys_day_utils.js:787` fallback **НЕ переводить на gender** (профиль
  day_utils несёт `sex`). Делегацию `:795` оставить как есть — overload её
  оживит, fallback останется страховкой.

**Шаг 4 — тесты (gate на merge):**

1. Reconciliation: `computeDailyNorms(K, perc)` → `prot*3+carbs*4+fat*9 == K`
   (±1)
2. BMR-parity: `user_v12`-расчёт == `HEYS.TDEE.calcBMR` на м/ж профилях
3. Overload: `calcBMR({weight:80, height:175, age:30, gender:'Женский'})` > 0;
   то же с `sex:'female'`
4. Regression: `node review/caloric-methodology-audit/verify_caloric.cjs` —
   «ProteinNorm gap» = 0 на всех профилях
5. Snapshot: `savedDisplayOptimum` прошлых дней не переписывается

**Шаг 5 — выкат:** `git add <свои файлы>` (не `-A`, проверить `git status` на
чужую WIP) → `pnpm ship "fix(calc): ..."` → push только по явному «пуш».

**Ожидаемые видимые эффекты (сверить вручную после фикса):** грамм-цель белка
+33% (вкл. историю); грамм-цель жира в отчётах −11% (побочный фикс `/8`); пилюля
BMR и таймлайн цели на профиле −44…101 ккал; дневной optimum, eaten и баланс —
без изменений.
