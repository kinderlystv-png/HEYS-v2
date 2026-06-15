# 37 · SEO-калькуляторы — source-ready pass 2026-06-14

## Что сделано

- Добавлена статическая страница `/calculators/` в landing app.
- Добавлены калькуляторы:
  - TDEE и BMR по Mifflin-St Jeor;
  - BMI как справочный индекс без диагноза;
  - ориентир дефицита по темпу 0,25 / 0,5 / 0,75 кг в неделю;
  - калорийность блюда: общий вес, всего ккал, ккал на 100 г.
- Данные считаются в браузере и не отправляются на сервер.
- Copy выдержан по `apps/landing/COPY_VOICE.md`: без обещаний результата, без
  медицинских заявлений, с пояснением что это справочный ориентир.

## Source changes

- `apps/landing/src/app/calculators/page.tsx`
- `apps/landing/src/components/CalculatorsClient.tsx`
- `apps/landing/src/components/FooterSSR.tsx`

## Проверки

- `pnpm exec tsc --noEmit -p apps/landing/tsconfig.json` → PASS.
- `curl http://localhost:3003/calculators/` → HTTP 200, HTML содержит
  `Калькуляторы питания`, `TDEE`, `Калорийность блюда`, canonical
  `/calculators/`.
- Playwright smoke:
  - desktop render PASS;
  - mobile render PASS;
  - TDEE меняется `1 972 ккал` → `2 413 ккал` после изменения пола/роста/веса;
  - блюдо пересчитывается до `370 ккал` после изменения граммов.

## Не сделано сознательно

- Не выполнен production deploy landing без отдельной команды.
- Не делалась SEO-оптимизация по фактическим поисковым/конверсионным данным: это
  следующий шаг после публикации и первых переходов.
