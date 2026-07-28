# GenDA tests

Изолированный статический тренажёр из двух офтальмологических тестов по 100
вопросов. Приложение не использует HEYS API, авторизацию, cookies или базу
данных. Прогресс хранится только в `localStorage` текущего origin с префиксом
`heys:genda-tests:v1`.

## Локальная работа

```bash
npm run prepare:data
npm run validate:data
npm test
npm run build
npm run serve
```

Сборщик данных по умолчанию читает канонический файл
`/Users/poplavskijanton/Documents/Doctor/Банк_врачебных_тестов_офтальмология_КАНОН.json`.
Другой каталог можно передать через `GENDA_SOURCE_ROOT`.

## Публикация

В `dist/` создаётся полностью автономный статический сайт. `index.html` должен
отдаваться без долгого кэша, а файлы в `assets/` — с `immutable`. Публиковать
только в отдельный origin `genda.heyslab.ru`; существующие HEYS buckets и домены
не являются target этого приложения.
