# Аудит готовности к реализации (snapshot 2026-06-10)

Оценка в трёх контекстах: **модель данных**, **алгоритмы**, **интеграция с
`apps/web/fingers/`**. Подробный трекер изменений живёт в
[`IMPLEMENTATION_MAP.md`](IMPLEMENTATION_MAP.md) и [`KICKOFF.md`](KICKOFF.md).

## Короткий вердикт

**Рекомендатель сессии флипнут в прод (FLIP 2026-06-11, `flags.newEngine=true`
дефолт), full planner — частично.** Знаниевый слой методологии согласован; после
flip остаётся canary-наблюдение, не кодовый blocker.

| Слой                        | Статус      | Суть                                                                                                                                                                           |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Методология (части 1–10)    | 🟢 готово   | Структура и источники есть; завышенные evidence-grade снижены                                                                                                                  |
| Пул как данные (§1.2 схема) | 🟢 готово   | 36 атомов, явный `doseConfidence`, enum/source sanity под тестами                                                                                                              |
| Safety validators           | 🟡 частично | S1–S9 есть; S2 48/72+`gripGroup` исправлен; S4 режет FTL; S7 пока advisory                                                                                                     |
| Session builder / UI shapes | 🟢 готово   | 6 `doseShape` renderable; shadow metric считает non-renderable, не non-hang                                                                                                    |
| Периодизация / full planner | 🟡 частично | `periodization_engine` есть (B7): макро/мезо-план + clamp интенсивности дня по фазе; авто-`selectModel` 6.4 ✅ реализован+подключён; осталось transfer M3, полная тест-батарея |

## Что уже закрыто

- `PROTOCOL_POOL.md`: `doseConfidence: A|B|C` теперь явное поле на всех 36
  атомах; trailing-комментарий остался только визуальной подсказкой.
- `block_catalog`: атомы несут `doseConfidence`, проходят enum/source sanity;
  runtime `warmup_done` фильтруется из build-time `gates.prerequisites`, чтобы
  S9 не требовал разминку как постоянный credential профиля.
- `validators`: S1–S9 покрыты тестами; S2 теперь учитывает `high=48ч`,
  `max=72ч`, `gripGroup`, и legacy-историю без группы трактует консервативно.
- `sessionBuilder`: все 6 `doseShape` поддержаны UI; shadow-compare больше не
  считает `attempts/reps/circuit/continuous/process` renderer-risk.
- `dev:local`: Express 4 снова получает совместимый `path-to-regexp@0.1.12`;
  browser smoke на `localhost:3001` зелёный (`HEYS.Fingers.isReady`, bundle 200,
  console/page errors 0).
- `duration envelope`: beginner/no-MVC и beginner MVC cap'ятся с `max` на
  `moderate`, чтобы не выдавать короткую max-сессию вне legacy-конверта.
- `block` equipment max-envelope: `pow_rfd_pulls` исключён из pre-flip
  block-only power-slot, чтобы не раздувать сессию RFD rest'ами до принятой
  дозы.
- `S4 enforcement`: `sessionBuilder` считает `FTL_session`, прогнозирует
  `weekToDate + sessionFtl` и при `>1.10 × trailingAvg` снимает объёмные
  load-slots из текущей сессии до прохождения cap.
- `final shadow-envelope`:
  `node apps/web/fingers/methodology/tools/shadow-envelope.mjs --check` проходит
  8/8 live-like сценариев: no-records, MVC 40/65/90% BW, explicit advanced,
  `block`, `none`, S4-overload. UI-risk = 0; `block` max = 31 мин без
  `pow_rfd_pulls`; S4-overload снимает `strength-endurance` и остаётся под cap.

## Осталось после флипа `flags.newEngine=true` (FLIP 2026-06-11)

1. **Canary / наблюдение.** Флаг уже включён дефолтом (`engine_router:45`);
   наблюдать `engineRouter.lastShadowDiff`/fallback-rate; прежний `mix_engine`
   остаётся fallback, откат — `newEngine=false`.
2. **Phase-2 planning.** `periodization_engine` уже управляет интенсивностью дня
   по фазе мезоцикла и получает live-plan из UI-старта цикла. Осталось:
   forward-календарь/объяснение фаз в UI.
3. **Assessment depth.** Тест-батарея, due/retest и MVC-графики есть; runtime
   benchmark силы пальцев обновлён на Berta 2025 Table 3. Осталось:
   percentile-UI по supplementary deciles S2–S5 и более широкие non-MVC нормы.

## Definition of Done для safe rollout

- [x] S2 freshness совпадает со spec: 48/72 ч + `gripGroup` + legacy fallback.
- [x] `doseConfidence` не теряется при парсинге пула.
- [x] Shadow telemetry не помечает renderable non-hang shapes как UI risk.
- [x] Runtime `warmup_done` отделён от profile credentials в build-time S9.
- [x] Browser smoke: `dev:local`, `HEYS.Fingers.isReady`, bundle 200, errors 0.
- [x] Shadow-envelope ограничивает `block` equipment max-duration:
      `pow_rfd_pulls` не попадает в block-only pre-flip power-slot.
- [x] S4 недельный cap влияет на генерацию, а не только предупреждает.
- [x] Финальный shadow-envelope принят на live-like scripted сценариях.
