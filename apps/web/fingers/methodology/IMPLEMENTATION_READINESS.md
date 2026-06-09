# Аудит готовности к реализации (snapshot 2026-06-09)

Оценка в трёх контекстах: **модель данных**, **алгоритмы**, **интеграция с
`apps/web/fingers/`**. Подробный трекер изменений живёт в
[`IMPLEMENTATION_MAP.md`](IMPLEMENTATION_MAP.md) и [`KICKOFF.md`](KICKOFF.md).

## Короткий вердикт

**MVP-рекомендатель сессии близок к включению, но full planner ещё не готов.**
Знаниевый слой методологии в целом согласован; текущие блокеры относятся к
исполняемому контракту: недельная прогрессия/периодизация, runtime-prereq split
и полная тест-батарея.

| Слой                        | Статус      | Суть                                                                        |
| --------------------------- | ----------- | --------------------------------------------------------------------------- |
| Методология (части 1–10)    | 🟢 готово   | Структура и источники есть; завышенные evidence-grade снижены               |
| Пул как данные (§1.2 схема) | 🟢 готово   | 36 атомов, явный `doseConfidence`, enum/source sanity под тестами           |
| Safety validators           | 🟡 частично | S1–S9 есть; S2 48/72+`gripGroup` исправлен; S4/S7 пока advisory             |
| Session builder / UI shapes | 🟢 готово   | 6 `doseShape` renderable; shadow metric считает non-renderable, не non-hang |
| Периодизация / full planner | ⬜ Phase 2  | Нет `periodization_engine`, макро/мезо enforcement и полной батареи         |

## Что уже закрыто

- `PROTOCOL_POOL.md`: `doseConfidence: A|B|C` теперь явное поле на всех 36
  атомах; trailing-комментарий остался только визуальной подсказкой.
- `block_catalog`: атомы несут `doseConfidence`, проходят enum/source sanity;
  runtime `warmup_done` пока нормализуется в catalog, чтобы S9 не требовал
  разминку как постоянный credential профиля.
- `validators`: S1–S9 покрыты тестами; S2 теперь учитывает `high=48ч`,
  `max=72ч`, `gripGroup`, и legacy-историю без группы трактует консервативно.
- `sessionBuilder`: все 6 `doseShape` поддержаны UI; shadow-compare больше не
  считает `attempts/reps/circuit/continuous/process` renderer-risk.

## Осталось перед включением `flags.newEngine=true`

1. **Runtime-prereq split.** Вынести `warmup_done` из `gates.prerequisites` в
   явное runtime-поле (`requiresWarmup` / `sessionRequirements`) и убрать
   post-filter из `block_catalog`.
2. **S4 enforcement.** Сейчас недельный FTL-прогресс даёт warning; генератор ещё
   не режет объём автоматически при превышении лимита.
3. **Phase-2 planning.** Нет `periodization_engine`: deload/taper/maintenance
   описаны методологически, но не управляют генерацией недель.
4. **Assessment depth.** Бенчмарки Berta/IRCRA подключены как методология, но
   полной тест-батареи и частоты ретеста в продукте ещё нет.

## Definition of Done для safe rollout

- [x] S2 freshness совпадает со spec: 48/72 ч + `gripGroup` + legacy fallback.
- [x] `doseConfidence` не теряется при парсинге пула.
- [x] Shadow telemetry не помечает renderable non-hang shapes как UI risk.
- [ ] Runtime requirements отделены от profile credentials.
- [ ] S4 недельный cap влияет на генерацию, а не только предупреждает.
- [ ] Browser smoke: минимум `hang + reps + attempts/circuit` сессия без
      деградации UI перед flip.
