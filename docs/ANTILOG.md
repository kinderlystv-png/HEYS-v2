# ANTILOG — Подавление логов в продакшне

> Статус: **ЧЕРНОВИК** — задокументировано, частично уже реализовано.  
> После боевого тестирования и выравнивания политики по всем пакетам — снять
> статус черновика.

---

## Проблема

В кодовой базе HEYS v2 содержится большое количество `console.log` /
`console.info` / `console.debug` вызовов для отладки. В девелопменте они нужны.
В продакшне они:

- раскрывают внутреннюю логику приложения пользователю
- создают нагрузку на рендеринг DevTools
- засоряют консоль у реальных пользователей

**Цель:** убрать дебаг-логи из прода без удаления строк из кода.

---

## Текущее состояние (as-is)

Защита уже есть, но **неполная и несогласованная** между частями
монорепозитория.

### Что уже работает

| Место                                    | Метод                                            | Статус | Что режется             |
| ---------------------------------------- | ------------------------------------------------ | ------ | ----------------------- |
| `apps/web/vite.config.ts`                | `drop_console: true` + Terser                    | ✅     | **ВСЁ включая warn** ⚠️ |
| `apps/web/vite.config.ts`                | `pure_funcs` (log/info/debug/warn)               | ✅     | log/info/debug/warn     |
| `apps/web/scripts/strip-console-logs.js` | post-build regex, запускается после `vite build` | ✅     | `dist/insights/pi_*.js` |
| `packages/core/tsup.config.ts`           | `options.drop = ['console', 'debugger']`         | ✅     | **ВСЁ** ⚠️              |

### Что НЕ защищено

| Место                                                                                | Масштаб (console-вызовов) | Статус      |
| ------------------------------------------------------------------------------------ | ------------------------- | ----------- |
| `apps/web/public/boot-*.bundle.*.js` (legacy-бандлы, генерирует `bundle-legacy.mjs`) | ~2338                     | ❌          |
| `apps/web/public/sw.js` (Service Worker)                                             | 45                        | ❌          |
| `apps/web/insights/pi_*.js` (33 файла — исходники, dist частично покрыт strip)       | 843                       | ⚠️ частично |
| `apps/web/day/*.js` (3 файла — источник, в dist не покрыт)                           | 37                        | ❌          |
| `apps/web/advice/*.js` (7 файлов — источник, в dist не покрыт)                       | 3                         | ❌          |
| `apps/tg-mini` — нет `pure`/`drop` в vite.config                                     | —                         | ❌          |
| `packages/shared/tsup.config.ts`                                                     | —                         | ❌          |
| `packages/ui/tsup.config.ts`                                                         | —                         | ❌          |
| `packages/storage/tsup.config.ts`                                                    | —                         | ❌          |
| `packages/search/tsup.config.ts`                                                     | —                         | ❌          |
| `apps/landing/next.config.js`                                                        | —                         | ❌          |

> **Ключевой факт:** `public/boot-*.bundle.*.js` — это **pre-built бандлы**,
> сгенерированные скриптом `pnpm bundle:legacy` (`scripts/bundle-legacy.mjs`).
> Они конкатенируют `heys_*.js` напрямую без минификации и без strip-логов.
> Именно эти файлы отдаются браузеру в продакшне. Terser в
> `apps/web/vite.config.ts` их **не обрабатывает** (они лежат в `public/` и
> копируются как статика).

> **apps/web/scripts/strip-console-logs.js** чистит только
> `dist/insights/pi_*.js`. Файлы `advice/`, `day/` скопируются в `dist/` без
> обработки.

### Конфликт политики в `apps/web`

В `apps/web/vite.config.ts` сейчас стоит `drop_console: true` — это режет
**всё**, включая `console.warn`. Это противоречит нашей желаемой политике "warn
и error оставить". При внедрении нужно принять решение: оставить текущее
агрессивное удаление или перейти на точечный `pure_funcs` без `warn`.

### Service Worker — особый случай

`apps/web/public/sw.js` содержит 45 `console.log/warn` вызовов и **не
обрабатывается ни одним инструментом**. Service Worker запускается в отдельном
thread — runtime override из `<head>` на него не распространяется. Варианты:

- Добавить глобальную обёртку в `sw.js` на основе `self.location.hostname`
- Убрать логи вручную из `sw.js` (их немного и они стандартные `[SW] ...`)
- Пропустить — логи SW видны только разработчику в Chrome DevTools →
  Applications

---

## Целевая архитектура решения

Комбо из двух слоёв. Слой 1 убирает логи из скомпилированного кода, Слой 2 —
страховочная сеть для legacy-файлов, которые не проходят через сборщик.

### Целевая политика (к чему идём)

| Метод           | Прод | Дев | Причина                             |
| --------------- | ---- | --- | ----------------------------------- |
| `console.log`   | ❌   | ✅  | Только отладка                      |
| `console.info`  | ❌   | ✅  | HEYS-модульные логи (дев-онли)      |
| `console.debug` | ❌   | ✅  | Только отладка                      |
| `console.trace` | ❌   | ✅  | Только стектрейсы при отладке       |
| `console.warn`  | ✅   | ✅  | Важные предупреждения               |
| `console.error` | ✅   | ✅  | Ошибки — критически важны для прода |

> **Текущий `apps/web` агрессивнее** — там отключён и `warn`. Если такое
> поведение устраивает, оставить `drop_console: true`. Если нужен `warn` —
> убрать `drop_console` и перейти на точечный `pure_funcs` без `warn`.

---

### Слой 1 — Build-time (modern TS/JSX код)

**Как работает:** сборщик вырезает вызовы из бандла. Логов нет физически в
prod-файлах.

**Что не трогает:** legacy `heys_*.js`, `advice/*.js`, `day/*.js`,
`widgets/*.js` — они копируются как статика, минуя сборщик.

#### Вариант А: `apps/web` → Vite + Terser

Файл: [apps/web/vite.config.ts](../apps/web/vite.config.ts) (не корневой
`vite.config.ts`!).

Сейчас там уже есть агрессивная конфигурация. Целевой вариант (если хотим
сохранить `warn`):

```ts
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_debugger: true,
      // Убрать drop_console: true, если нужно сохранить warn/error
      pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
      passes: 3,
    },
  },
},
```

#### Вариант Б: `apps/tg-mini` → Vite + esbuild

Файл: [apps/tg-mini/vite.config.ts](../apps/tg-mini/vite.config.ts). Сейчас
пустой `build:` без удаления логов. Нужно добавить:

```ts
build: {
  minify: 'esbuild',
  // esbuild.drop удаляет указанные вызовы на уровне AST
  // Используем pure, чтобы не трогать warn/error
  // (drop: ['console'] режет всё — не использовать)
},
```

А в плагины или через конфиг esbuild:

```ts
esbuild: {
  pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
},
```

#### Вариант В: `packages/*` → tsup

`packages/core` уже защищён (`options.drop = ['console', 'debugger']`), но режет
**всё**. Остальные пакеты (`shared`, `ui`, `storage`, `search`) — незащищены.

Целевой вариант для `packages/shared`, `packages/ui`, `packages/storage`,
`packages/search`:

```ts
// packages/*/tsup.config.ts — добавить в esbuildOptions
esbuildOptions(options) {
  options.pure = [
    'console.log',
    'console.info',
    'console.debug',
    'console.trace',
  ];
  // Не используем options.drop = ['console'] — это режет warn и error тоже
},
```

---

### Слой 2 — Post-build скрипт (статические insights)

Уже реализован:
[apps/web/scripts/strip-console-logs.js](../apps/web/scripts/strip-console-logs.js).

Запускается после `vite build`, чистит `console.log` из `dist/insights/pi_*.js`
через regex.

**Расширить скрипт** на другие статические директории, которые Vite копирует
через `viteStaticCopy` и которые содержат логи: `advice/`, `day/` (37 вызовов в
источниках).

```js
// Директории для обработки в strip-console-logs.js (сейчас только insights):
const DIRS_TO_STRIP = [
  'dist/insights', // уже есть — 843 вызова
  'dist/advice', // TODO — 3 вызова
  'dist/day', // TODO — 37 вызовов
];
// dist/widgets — вызовов нет, можно пропустить
```

---

### Слой 2.5 — bundle-legacy.mjs (критически важно)

`scripts/bundle-legacy.mjs` генерирует `apps/web/public/boot-*.bundle.*.js` —
это **pre-built бандлы**, которые пакуют все `heys_*.js` (103 файла с 1513
console-вызовами). Vite и Terser их **не обрабатывают** — файлы копируются как
статика.

Эти бандлы — самый большой источник логов в продакшне: **~2338 вызовов всего**.

Варианты решения:

**А) Добавить strip прямо в `bundle-legacy.mjs`** (рекомендуется):

```js
// В функцию сборки бандла добавить после конкатенации:
function stripConsoleCalls(content) {
  return content.replace(
    /^\s*console\.(log|info|debug|trace)\([^)]*\);?\s*$/gm,
    '',
  );
}
// Применять перед записью итогового бандла
```

**Б) Runtime override** (Слой 3 ниже) — накрывает как страховка, но runtime
overhead.

---

### Слой 3 — Runtime override (страховочная сеть для legacy)

**Как работает:** в самом начале загрузки страницы (`<head>`, до любых скриптов)
переопределяем методы `console` на no-op. Любой `console.log` в legacy-коде,
который не попал под Слой 1 и Слой 2, тихо проваливается в пустоту.

**Важно:** `console.error` и `console.warn` ОСТАВЛЯЕМ.

```html
<!-- apps/web/index.html — первый тег в <head>, до всех других скриптов -->
<script>
  (function () {
    var isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('.local');
    if (!isLocal) {
      var noop = function () {};
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.trace = noop;
      // console.error — НЕ трогаем
      // console.warn — НЕ трогаем
    }
  })();
</script>
```

> **Альтернатива через Vite env** (обрабатывается Vite, нет в legacy-контексте):
>
> ```ts
> // apps/web/src/main.ts — самая первая строка
> if (import.meta.env.PROD) {
>   const noop = () => {};
>   console.log = noop;
>   console.info = noop;
>   console.debug = noop;
>   console.trace = noop;
> }
> ```

---

## Риски и исключения

1. **`drop_console: true` в `packages/core`** — агрессивно режет весь `console`,
   включая `error`. Это корректно для Node.js Express-пакета (там свой logger
   через pino), но нужно убедиться, что `console.error` там не используется для
   критических сообщений.

2. **Runtime override и внешние SDK** — если третьесторонние библиотеки
   используют `console.log` для диагностики (например, Telegram WebApp SDK), они
   тоже замолчат. Проблем не создаёт, но нужно знать при отладке в
   прод-окружении.

3. **Regex в `strip-console-logs.js`** — не 100% надёжен, парсит построчно.
   Многострочные `console.log(...)` не поймает. Для insights-файлов это
   нормально (там однострочные логи), но для новых статических файлов нужно
   проверять.

4. **`apps/landing` (`output: 'export'`)** — Next.js конфиг сейчас без
   `removeConsole`. При статическом экспорте SWC-трансформация
   `compiler.removeConsole` работает. Нужно проверить, что Vercel-деплой
   поднимает именно production build.

---

## Порядок внедрения (TODO)

### Шаг 0 — Принять решение по политике warn

- [ ] **Решить:** оставить `warn` в проде или нет?
  - `Да, оставить` → убрать `drop_console: true` из `apps/web/vite.config.ts`,
    оставить только `pure_funcs` без `warn`
  - `Нет, убрать` → оставить как есть в `apps/web`, распространить на остальных

### Шаг 1 — Заглушить legacy-бандлы (самая большая дыра — ~2338 вызовов)

- [ ] Добавить strip-функцию в `scripts/bundle-legacy.mjs` — убирать
      `console.log/info/debug/trace` при сборке бандлов
- [ ] Запустить `pnpm bundle:legacy` после изменения, пересобрать бандлы

### Шаг 2 — Service Worker

- [ ] Добавить в начало `apps/web/public/sw.js` обёртку:
  ```js
  if (self.location.hostname !== 'localhost') {
    const noop = () => {};
    self.console = {
      ...self.console,
      log: noop,
      info: noop,
      debug: noop,
      trace: noop,
    };
  }
  ```
  Или убрать `[SW]` логи вручную — их немного (штатный вывод установки кэша).

### Шаг 3 — Расширить post-build strip скрипт

- [ ] Расширить
      [apps/web/scripts/strip-console-logs.js](../apps/web/scripts/strip-console-logs.js)
      на `dist/advice/` (3 вызова) и `dist/day/` (37 вызовов)

### Шаг 4 — Выровнять Слой 1 по всем пакетам

- [ ] Добавить `esbuild.pure` в
      [apps/tg-mini/vite.config.ts](../apps/tg-mini/vite.config.ts)
- [ ] Добавить `esbuildOptions.pure` в
      [packages/shared/tsup.config.ts](../packages/shared/tsup.config.ts)
- [ ] Добавить `esbuildOptions.pure` в
      [packages/ui/tsup.config.ts](../packages/ui/tsup.config.ts)
- [ ] Добавить `esbuildOptions.pure` в
      [packages/storage/tsup.config.ts](../packages/storage/tsup.config.ts)
- [ ] Добавить `esbuildOptions.pure` в
      [packages/search/tsup.config.ts](../packages/search/tsup.config.ts)
- [ ] Проверить `packages/core`: `drop: ['console']` режет `error/warn` —
      пересмотреть

### Шаг 5 — Runtime override (страховочная сеть для legacy)

- [ ] Добавить inline `<script>` в `apps/web/index.html` первым тегом в `<head>`

### Шаг 6 — Покрыть landing

- [ ] Добавить `compiler.removeConsole` в
      [apps/landing/next.config.js](../apps/landing/next.config.js)

### Шаг 7 — Верификация

- [ ] Пересобрать `pnpm build` + `pnpm bundle:legacy`
- [ ] Открыть DevTools на `app.heyslab.ru` — консоль должна быть чистой
- [ ] Проверить DevTools → Application → Service Workers — логи SW не видны
- [ ] Убедиться, что `console.error` и `console.warn` видны (если такая
      политика)
- [ ] Если есть Sentry — убедиться, что ошибки доходят

---

## Бонус: Next.js (apps/landing)

Next.js 14 имеет встроенную опцию — добавить в
[apps/landing/next.config.js](../apps/landing/next.config.js):

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  compiler: {
    removeConsole: {
      exclude: ['error', 'warn'], // оставляем только error и warn
    },
  },
};
module.exports = nextConfig;
```

Это эквивалент Terser `pure_funcs`, но для SWC-компилятора Next.js.

---

## Связанные файлы

| Файл                                                                                | Статус        | Вызовов в проде | Примечание                            |
| ----------------------------------------------------------------------------------- | ------------- | --------------- | ------------------------------------- |
| [apps/web/vite.config.ts](../apps/web/vite.config.ts)                               | ✅ защищён    | ~0 (Vite src)   | Агрессивно — режет всё вкл. warn      |
| [apps/web/scripts/strip-console-logs.js](../apps/web/scripts/strip-console-logs.js) | ⚠️ частично   | —               | Post-build, только `insights/`        |
| [scripts/bundle-legacy.mjs](../scripts/bundle-legacy.mjs)                           | ❌ НЕ защищён | **~2338**       | Самая большая дыра — pre-built бандлы |
| [apps/web/public/boot-core.bundle.\*.js](../apps/web/public/)                       | ❌ НЕ защищён | **416**         | Собирается из heys\_\*.js без strip   |
| [apps/web/public/boot-app.bundle.\*.js](../apps/web/public/)                        | ❌ НЕ защищён | **228**         | —                                     |
| [apps/web/public/boot-day.bundle.\*.js](../apps/web/public/)                        | ❌ НЕ защищён | **58**          | —                                     |
| [apps/web/public/sw.js](../apps/web/public/sw.js)                                   | ❌ НЕ защищён | **45**          | Service Worker — отдельный поток      |
| [apps/web/insights/pi\_\*.js](../apps/web/insights/)                                | ⚠️ частично   | 843             | strip-console-logs.js закрывает их    |
| [apps/web/day/\*.js](../apps/web/day/)                                              | ❌ НЕ защищён | 37              | Нужно добавить в strip скрипт         |
| [apps/web/advice/\*.js](../apps/web/advice/)                                        | ❌ НЕ защищён | 3               | Нужно добавить в strip скрипт         |
| [apps/tg-mini/vite.config.ts](../apps/tg-mini/vite.config.ts)                       | ❌ не защищён | —               | esbuild.pure не задан                 |
| [packages/core/tsup.config.ts](../packages/core/tsup.config.ts)                     | ⚠️ агрессивно | ~0              | drop все (включая warn/error)         |
| [packages/shared/tsup.config.ts](../packages/shared/tsup.config.ts)                 | ❌ не защищён | —               | Нет esbuildOptions.pure               |
| [packages/ui/tsup.config.ts](../packages/ui/tsup.config.ts)                         | ❌ не защищён | —               | —                                     |
| [packages/storage/tsup.config.ts](../packages/storage/tsup.config.ts)               | ❌ не защищён | —               | —                                     |
| [packages/search/tsup.config.ts](../packages/search/tsup.config.ts)                 | ❌ не защищён | —               | —                                     |
| [apps/landing/next.config.js](../apps/landing/next.config.js)                       | ❌ не защищён | —               | Нет compiler.removeConsole            |
| [console-control.config.js](../console-control.config.js)                           | ℹ️            | —               | Node.js контекст, не браузер          |
| [log-levels.config.js](../log-levels.config.js)                                     | ℹ️            | —               | Уровни логирования (Node.js)          |
