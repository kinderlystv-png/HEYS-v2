# Протокол реализации игр в Planning

> **Статус:** реализация трёх игр завершена. Commit, push и production build не
> выполняются.

## Цель и UI-гейт

Добавить в подвкладку «Игры» три автономные мини-игры: спокойную игру на чтение,
логическую игру и лёгкую аркаду. Каталог остаётся частью Planning, а код и стили
каждой игры загружаются только после открытия её карточки.

**UI-гейт:** цель — дать понятный выбор из трёх игр; главное действие — открыть
или начать выбранную игру; слой 1 — заголовок и три карточки; слой 2 —
полноэкранная игра с доступным возвратом; критическое не скрывать — загрузку,
ошибку загрузки, паузу, результат и выход.

## Замороженный runtime-контракт

Каждый classic-script регистрирует модуль без побочных эффектов:

```js
HEYS.PlanningGames.modules[gameId] = {
  Component,
  api,
};
```

`Component` принимает `{ onExit, reducedMotion, seed? }`. Pure API не использует
DOM, timers, storage, network или listeners:

- `word-builder`: `version`, `validateContent`, `createSession({ seed })`,
  `evaluateSelection(round, selectedOptionIds)`;
- `robot-route`: `version`, `validateLevels`, `createSession({ seed })`,
  `bfsShortestPath`, `executeProgram`;
- `color-trail`: `version`, `createWorld`, `stepWorld`, `closeTrail`,
  `getTerritoryPercent`, `validateWorld`.

Общий shell владеет dialog lifecycle, фокусом, lazy-loader state и retry.
Игровой модуль владеет только своей механикой и очищает собственные timers,
listeners, observer и animation frame при размонтировании.

## Ownership

- Главный агент: `heys_planning_v1.js`, `908-planning-games.css`, общие UI- и
  navigation-тесты, Planning dossier, этот протокол, интеграция и QA.
- Word Builder: только `heys_planning_game_word_builder_v1.js`,
  `909-planning-game-word-builder.css` и его unit-тест.
- Robot Route: только `heys_planning_game_robot_route_v1.js`,
  `910-planning-game-robot-route.css` и его unit-тест.
- Color Trail: только `heys_planning_game_color_trail_v1.js`,
  `911-planning-game-color-trail.css` и его unit-тест.

## Шаги и статусы

1. **Готово:** preflight dirty-scope и архитектурный контекст проверены.
2. **Готово:** runtime-контракт, ownership и UI-гейт заморожены.
3. **Готово:** Word Builder, Robot Route и Color Trail.
4. **Готово:** каталог, fullscreen shell, lazy-loader и общие UI-тесты.
5. **Готово:** docs check, scoped bundle и local runtime QA.

## Критерии готовности

- На первом слое видны заголовок «Игры» и три разные карточки.
- Ни один игровой JS/CSS не запрашивается до клика по своей карточке.
- Карточка открывает semantic fullscreen dialog; Escape и кнопка возвращают на
  экран игр.
- После закрытия фокус возвращается на карточку, body-scroll разблокирован.
- Ошибка отдельного ресурса показывает retry и повторно грузит только упавший
  ресурс.
- Каждая игра работает без storage, сети, аналитики и фонового цикла после
  закрытия.
- На мобильном экране нет горизонтального overflow, таргет кнопки возврата не
  меньше 44 px.

## Факты проверки

- Интеграционный набор: 5 test files, 36/36 тестов прошли.
- Word Builder: JS 17 584 B raw / 4 522 B gzip; CSS 8 707 B raw.
- Robot Route: JS 22 342 B raw / 5 689 B gzip; CSS 9 902 B raw.
- Color Trail: JS 59 660 B raw / 12 487 B gzip; CSS 7 056 B raw.
- Подтверждены отсутствие eager-import/precache, storage/network/analytics и
  соответствие API v1.
- `docs:reference:check`: 153 ссылки, 18 dossier passports, ошибок нет.
- Scoped preview bundle: `postboot-3-ui-lazy.bundle.37f15e15c3a5.js` + gzip;
  manifest, public assets и `index.html` синхронны.
- Full-stack local runtime: web `localhost:3001` и API `localhost:4001/health`
  отвечают 200.
- Full-app isolated session корректно остановилась на PIN-входе; auth boundary
  не обходился. Для UI использован isolated harness с реальными source/CSS.
- Browser smoke: 1440×900 и 390×844, light/dark/reduced-motion; до клика нет
  игровых запросов, при открытии запрашиваются только JS/CSS выбранной игры,
  горизонтальный overflow отсутствует, back-action 44×44.
- Color Trail: до «Начать» RAF отсутствует, в `running` активен один RAF,
  `document.hidden` переводит в `paused` без auto-resume; после закрытия RAF,
  visibility-listener, ResizeObserver delta, scroll-lock и focus возвращаются к
  baseline.
- Color Trail использует сглаженный Canvas-рендер территории, следа и змеи.
  Высокоточная кэшированная маска убирает клеточную кромку территории, след
  строится плавной кривой, а хвост виляет по нормали движения без отдельного
  timer/RAF и замирает при `reducedMotion`. Разрез чужого открытого следа
  становится отложенным: поражение и удаление территории происходят только после
  успешного замыкания петли; более раннее возвращение соперника отменяет разрез.
  Свой след и контакт голов не вызывают скрытый reset. Отделённый разрезом
  остров территории исчезает, если он не связан с последней домашней точкой
  змеи. Ограниченный журнал текущего раунда копируется как JSON и не использует
  storage или сеть.
- QA-скриншоты: `output/playwright/planning-games-catalog-desktop.png`,
  `planning-games-catalog-mobile.png`, `planning-games-catalog-mobile-dark.png`
  и `planning-game-color-trail-mobile.png`.

## Facts Table

| Утверждение                                            | Проверка                                                                                                                                                                                                                                                                                          | Результат                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Каталог содержит три игры и API gate v1                | `rg -n "apiMethods\\                                                                                                                                                                                                                                                                              | function loadPlanningGame" apps/web/heys_planning_v1.js`                                         | ✅ три metadata-записи, проверка `Component`, `version` и методов |
| Все игровые модули регистрируются через общий контракт | `rg -n "modules\\['(word-builder\\                                                                                                                                                                                                                                                                | robot-route\\                                                                                    | color-trail)'\\]" apps/web/heys*planning_game*\*\_v1.js`          | ✅ три регистрации                                                                                                               |
| Полный точечный набор зелёный                          | `pnpm exec vitest run apps/web/__tests__/planning-home-subtab.test.js apps/web/__tests__/planning-games-ui.test.js apps/web/__tests__/planning-game-word-builder.test.js apps/web/__tests__/planning-game-robot-route.test.js apps/web/__tests__/planning-game-color-trail.test.js --no-coverage` | ✅ 5 файлов, 41/41                                                                               |
| Размеры ниже установленных бюджетов                    | `wc -c ... && gzip -c <game.js> \| wc -c`                                                                                                                                                                                                                                                         | ✅ JS 17 584 / 22 342 / 59 660 B raw; gzip 4 522 / 5 689 / 12 487 B; CSS 8 707 / 9 902 / 7 056 B |
| Игровые chunks не входят в eager config/precache       | `rg -n "planning*game*\\                                                                                                                                                                                                                                                                          | 909-planning-game\\                                                                              | 910-planning-game\\                                               | 911-planning-game" scripts/legacy-bundle-config.mjs apps/web/index.html apps/web/public/sw.js apps/web/styles/main-deferred.css` | ✅ совпадений нет |
| Scoped bundle и manifests синхронны                    | `node scripts/verify-legacy-bundles.mjs --no-fix-hint`                                                                                                                                                                                                                                            | ✅ hash `37f15e15c3a5` во всех manifest/index                                                    |
| Planning dossier корректен                             | `pnpm docs:reference:check`                                                                                                                                                                                                                                                                       | ✅ 153 ссылки, 18 passports                                                                      |
| Browser lifecycle возвращается к baseline              | isolated Playwright harness, real source/CSS                                                                                                                                                                                                                                                      | ✅ RAF 0, visibility-listeners 0, observer delta 0, scroll-lock false, фокус на карточке         |
