# Журнал реализации (для ревью-агента)

Реализатор ведёт по [FIX_PLAN_REVIEW.md](./FIX_PLAN_REVIEW.md). После каждого
крупного этапа — апдейт статуса + саммари для ревью. Push не делается до явного
«пуш».

Статус: **Stage 1 ✅ · Stage 2 ✅ · Stage 3 ✅ · Ship ⛔(ждёт ревью+«пуш»)**

⚠️ **Блокер ship (не мой код):** в shared-checkout активна параллельная сессия —
`git status` показывает чужую WIP (`styles/.../drums-finger-trainer.css`
unstaged, `heys-maintenance/index.js` staged) и подвисший `.git/index.lock`
(«Operation not permitted», снять не могу). На ship: ждать снятия lock +
стейджить **только свои 8 файлов pathspec'ом**, не `-A`. Мои правки на диск
персистнули (подтверждено grep'ом независимо от git).

---

## Stage 1 — B-2 (норма белок /4→/3, жир /8→/9) · ✅ DONE

**Подход:** inline-ссылка `(HEYS.TEF?.ATWATER?.protein || 3)` в точке деления —
читает константу в call-time (scope-safe, без redeclare, работает с replace_all
на идентичных блоках), fallback на случай незагруженного TEF.

**Изменённые файлы и точки (все подтверждены чтением перед правкой):**

| Файл                                | Точки                                 | Было → стало                                                                  |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `heys_day_calculations.js`          | 73-75                                 | carbs `/4`→`/A.carbs`, prot `/4`→`/A.protein`, fat `/9`→`/A.fat`              |
| `heys_metabolic_intelligence_v1.js` | 807-809                               | то же (calculateNormAbs)                                                      |
| `heys_reports_tab_impl_v1.js`       | блоки 364-366 и 511-513 (replace_all) | carbs `/4`, prot `/4`, **fat `/8`→`/A.fat`**                                  |
| `heys_reports_tab_impl_v1.js`       | строки 615 и 734 (replace_all)        | то же, **fat `/8` фикс**                                                      |
| `heys_yesterday_verify_v1.js`       | 626-628                               | carbs/prot/fat → A.\* (fat там уже был /9)                                    |
| `heys_day_caloric_balance_v1.js`    | 1629/1634/1639 (replace_all)          | protein-debt `optimum / 4`→`/ A.protein` (выровнено с avgProtPct ×3 на :1619) |

**Проверки Stage 1:**

- ✅ grep: 0 остаточных `protPct.../4`, `fatPct.../8` в этих 5 файлах.
- ✅ `node --check` всех 5 файлов — синтаксис чист.
- Числовой gate (reconciliation, verify_caloric gap=0) — в Stage 3.

**Сознательные отклонения от брифа:**

- **Опциональную унификацию прихода** (`models:581/1398/1698`, `add_product:*`
  хардкод `3/4/9` → ATWATER) **не делал** в этом PR. Причина: приход уже
  поведенчески верный (×3), правка 7 корректных мест на фундаменте = риск без
  изменения поведения. Вынес в follow-up cleanup-PR. Если ревью настаивает на
  едином источнике и для прихода — добавлю отдельным шагом.
- Бандлы/`public/` — не трогал (auto-gen, pre-commit пересоберёт).

**Ожидаемый видимый эффект Stage 1:** грамм-цель белка +33% (вкл. историю);
грамм-цель жира в отчётах −11% (фикс `/8`); углеводы — без изменений; eaten,
optimum, баланс — без изменений. Сверка — в Stage 3 после численного гейта.

**Вопрос ревью-агенту:** ок ли отложить унификацию прихода в follow-up, или
тянуть в этот же PR? Иду в Stage 2 (B-3) на дефолте «отложить».

---

## Stage 2 — B-3 (единый BMR через HEYS.TDEE) · ✅ DONE

**Что сделано:**

1. **Overload в `heys_tdee_v1.js calcBMR` (:57)** — если первый аргумент объект,
   трактуется как profile (`weight = +profile.weight`); пол распознаётся по
   `gender === 'Женский' || sex === 'female'`. Существующий путь
   `(weight, profile)` с числовым weight сохранён 1:1 (проверил: для заданного
   gender результат идентичен старому `isMale` flip). Оживляет мёртвую делегацию
   `day_utils:795` и чинит `pi_calculations:56` / `pi_analytics_api:203` /
   `predictive_insights:497` (звали `calcBMR(profile)` → возвращалось 0) — все 4
   одним фиксом, без правки каждого call-site.
2. **`heys_user_v12.js:898-900` и `:1257-1259`** — inline Harris-Benedict →
   `HEYS.TDEE.calcBMR(weight, { gender, height: h*100, age })`. Рост ×100
   (метры→см). Fallback на случай отсутствия TDEE — **тоже Mifflin** (не H-B),
   чтобы формула не двоилась. Комментарий «Mifflin… ADA» теперь стал правдой.
3. `heys_day_utils.js:787` fallback — **не трогал** (по брифу: `getProfile`
   нормализует `gender→sex`, fallback корректен).

**🔎 Находка сверх брифа (важно ревью):** H-B жил не только в `user_v12`, но и в
**`heys_user_tab_impl_v1.js:882-883` и `:1241-1242`** — идентичный сиблинг,
который пропустили и план, и ревью. Починил так же (2 точки). После — grep по
всему source: `447.593`/`88.362` = **0 вхождений**. То есть формул BMR в проде
теперь ровно одна (Mifflin в `HEYS.TDEE`).

**Проверки Stage 2:**

- ✅ grep H-B-коэффициентов по source (без bundle/public/dist) — 0.
- ✅ `node --check` `heys_tdee_v1.js`, `heys_user_v12.js`,
  `heys_user_tab_impl_v1.js` — чисто.
- Числовые гейты (BMR-parity, overload>0) — Stage 3.

**Вопрос ревью-агенту:** подтвердите, что `user_tab_impl_v1` — действительно
живой рендер вкладки (а не мёртвый дубль). В обоих случаях правка безопасна, но
важно для карты «кто что рендерит».

---

## Stage 3 — тесты-гейты · ✅ DONE (19/19 pass)

Гейт-скрипт: [test_calc_gates.cjs](./test_calc_gates.cjs) — грузит реальные
`heys_tef_v1` + `heys_tdee_v1` + `heys_day_calculations` и проверяет:

| Gate               | Что                                                         | Результат                     |
| ------------------ | ----------------------------------------------------------- | ----------------------------- |
| 1/4 Reconciliation | `prot·3 + carbs·4 + fat·9 == K` для 3 K × 4 сплитов         | ✅ 12/12, back-sum == K точно |
| 2/3 BMR overload   | positional vs `calcBMR(obj)` vs `{sex:'female'}` vs Mifflin | ✅ все равны, все >0          |
| — user_v12-style   | `calcBMR(w,{gender,height:h*100,age})` == Mifflin           | ✅ 1439==1439                 |
| — fat /9           | норма жира = `K·fatPct/9` (фикс `/8`)                       | ✅ 66.67г                     |

**Gate 5 (snapshot savedDisplayOptimum) — пройден by construction:** правки не
трогают `optimum` (kcal-таргет: `tdee:222-223` `baseExpenditure×(1+def)×cycle` —
не менялся) и не трогают `heys_day_caloric_display_state.js` (write-путь
`savedDisplayOptimum`). Менялись только функции **граммов** макросов и BMR.
Значит `savedDisplayOptimum` прошлых дней по этим правкам не переписывается.

**verify_caloric.cjs** (pre-fix демонстратор, реплицирует старый `/4`) —
запускается (путь ревьюер починил на `__dirname`), оставлен как исторический
показ бага. Реальный регрессионный гейт = `test_calc_gates.cjs`.

---

## Итог реализации (для ревью)

**Изменено 8 source-файлов** (бандлы/`public/` не трогал — pre-commit
пересоберёт): B-2 — `day_calculations`, `metabolic_intelligence`,
`reports_tab_impl` (×4 блока, вкл. баг жира `/8`), `yesterday_verify`,
`caloric_balance` (protein-debt). B-3 — `tdee_v1` (overload), `user_v12` (×2),
`user_tab_impl_v1` (×2, **находка сверх брифа**).

Все `node --check` чисты; 19/19 гейтов зелёные; H-B-коэффициентов в source — 0;
остаточных норм-`/4`/`/8` — 0.

**Видимые эффекты для ручной сверки:** грамм-цель белка +33% (вкл. историю);
грамм-цель жира в отчётах −11% (фикс `/8`); пилюля BMR и таймлайн цели на
профиле −44…101 ккал (Mifflin<H-B); **eaten, optimum, баланс — без изменений**.

**Открыто для ревью перед ship:**

1. Унификацию прихода (`models`/`add_product` хардкод `3/4/9`→ATWATER) отложил в
   follow-up — ок?
2. `user_tab_impl_v1` vs `user_v12` — кто живой рендер?
3. Ship заблокирован чужим `index.lock` (см. шапку) — нужен чистый checkout.

Жду вердикт ревью-агента. Push — только по явному «пуш».

---

## Вердикт ревью реализации (2026-06-10) · ✅ APPROVE

Проверено независимо (не по журналу, а по диску): все 9 норм-точек + 4 блока
жира `/8` заменены на `ATWATER` с fallback; overload `calcBMR` корректен
(объект=профиль, `sex==='female'`≡`gender==='Женский'`, позиционная сигнатура
сохранена 1:1); все 4 точки H-B заменены на `TDEE.calcBMR` с Mifflin-fallback;
остаточных H-B-коэффициентов и норм-`/4`/`/8` в source — 0. Гейты
воспроизведены: **19/19**. `avgProtPct` (×3) ↔ debt-граммы (/3) в
caloric_balance теперь согласованы.

**Ответы на открытые вопросы:**

1. **Унификация прихода → follow-up: да, ок.** В брифе была опциональной,
   поведение не меняет (3/4/9 == ATWATER). Завести отдельной задачей
   `refactor(calc)`.
2. **Живой рендер — `user_tab_impl_v1`.** `heys_user_v12.js` — **прокси**
   (строки 1–9: при наличии `HEYS.UserTabImpl` сразу `return`), а бандл
   `boot-app` грузит `user_tab_impl_v1.js` **раньше** `user_v12.js`
   (`scripts/legacy-bundle-config.mjs:128-129`) → в проде всегда работает impl.
   Находка реализатора не «сверх брифа», а **критична**: фикс только `user_v12`
   не изменил бы прод вообще. Ошибка ревью (брифа) — признаю; оба файла чинить
   было правильно.
3. **Блокировка ship — правильное решение.** При чистом дереве: `git add`
   pathspec'ом 8 source-файлов + доки/скрипты
   `review/caloric-methodology-audit/` →
   `pnpm ship "fix(calc): единые факторы Atwater и формула BMR"`. Whats-new
   user-facing по COPY_VOICE (типа «Уточнили расчёт нормы белка, жиров и
   базового обмена»). Push — только по явному «пуш».

**Примечание:** `verify_caloric.cjs` намеренно показывает pre-fix gap
(захардкоженный `/4`-демонстратор) — аннотировал в скрипте, чтобы будущая сессия
не приняла за регрессию. Gate 4 брифа фактически закрыт Gate 1 (живой
`computeDailyNorms`).
