# Карта системы HEYS

Это стартовая карта размещения реализации. Она намеренно описывает только
проверяемые границы верхнего уровня; подробное поведение раскрывается в
системных досье.

## Пользовательские поверхности

| Поверхность             | Расположение                           | Роль                                  |
| ----------------------- | -------------------------------------- | ------------------------------------- |
| Основное web-приложение | [`apps/web/`](../../apps/web/)         | Главный web-интерфейс HEYS            |
| Мобильное приложение    | [`apps/mobile/`](../../apps/mobile/)   | Нативная оболочка и мобильный runtime |
| Лендинг                 | [`apps/landing/`](../../apps/landing/) | Публичный сайт продукта               |
| Telegram Mini App       | [`apps/tg-mini/`](../../apps/tg-mini/) | Интерфейс внутри Telegram             |

## Общие библиотеки

| Пакет                                                  | Назначение из package manifest            |
| ------------------------------------------------------ | ----------------------------------------- |
| [`@heys/core`](../../packages/core/package.json)       | Центральная бизнес-логика и модели данных |
| [`@heys/logger`](../../packages/logger/package.json)   | Централизованное логирование              |
| [`@heys/search`](../../packages/search/package.json)   | Поиск с поддержкой опечаток               |
| [`@heys/shared`](../../packages/shared/package.json)   | Общие утилиты                             |
| [`@heys/storage`](../../packages/storage/package.json) | Хранение и синхронизация данных           |
| [`@heys/ui`](../../packages/ui/package.json)           | Переиспользуемые React-компоненты         |

## Backend и данные

- Код serverless-функций расположен в
  [`yandex-cloud-functions/`](../../yandex-cloud-functions/).
- SQL-схемы, миграции и операционные скрипты распределены между
  [`database/`](../../database/), [`scripts/db/`](../../scripts/db/) и
  каталогами миграций Cloud Functions.
- Платформенная архитектура подробно описана в
  [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), а стабильные факты web-runtime —
  в [`apps/web/ARCHITECTURE.md`](../../apps/web/ARCHITECTURE.md).

## Главный поток данных

```text
login / curator selects client
            ↓
client-scoped Store + local cache ↔ sync layer ↔ API/RPC ↔ PostgreSQL/KV
            ↓
day + profile + products
   ├─ nutrition / activity calculations
   ├─ scoring / insights / advice
   ├─ reports / backup
   └─ gamification / notifications
```

Выбор клиента задаёт границу данных для всех нижележащих систем. Product catalog
сочетает shared base и client overlay; meal item хранит snapshot для истории.
Фоновые функции читают уже сохранённые client-scoped данные и snapshots, но не
являются владельцами дневника.

## Крупные области

| Область                                 | Основное досье                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Запуск, роли и сквозной web flow        | [`HOW_HEYS_WORKS.md`](systems/HOW_HEYS_WORKS.md)                                                                                                                                     |
| Модель данных, API, sync и безопасность | [`systems/README.md`](systems/README.md) → core rows                                                                                                                                 |
| Дневник, питание и продукты             | [`NUTRITION_AND_INSULIN.md`](systems/NUTRITION_AND_INSULIN.md), [`PRODUCTS_AND_SEARCH.md`](systems/PRODUCTS_AND_SEARCH.md)                                                           |
| Аналитика, советы и игра                | [`ANALYTICS_AND_SCORING.md`](systems/ANALYTICS_AND_SCORING.md), [`ADVICE_AND_GAMIFICATION.md`](systems/ADVICE_AND_GAMIFICATION.md)                                                   |
| Куратор и подписка                      | [`CURATOR_WORKSPACE.md`](systems/CURATOR_WORKSPACE.md), [`SUBSCRIPTION_AND_PAYMENTS.md`](systems/SUBSCRIPTION_AND_PAYMENTS.md)                                                       |
| Планирование и тренировки               | [`PLANNING.md`](systems/PLANNING.md), [`TRAINING_MODES.md`](systems/TRAINING_MODES.md)                                                                                               |
| PWA, mobile, Telegram и landing         | [`PWA_OFFLINE_PUSH.md`](systems/PWA_OFFLINE_PUSH.md), [`MOBILE.md`](systems/MOBILE.md), [`TELEGRAM.md`](systems/TELEGRAM.md), [`LANDING_AND_LEADS.md`](systems/LANDING_AND_LEADS.md) |
| Operations, jobs, backup и reports      | [`INFRA_OPERATIONS.md`](systems/INFRA_OPERATIONS.md), [`BACKGROUND_JOBS.md`](systems/BACKGROUND_JOBS.md), [`BACKUP_AND_REPORTS.md`](systems/BACKUP_AND_REPORTS.md)                   |

## Как перейти от системы к коду

1. Найти нужное досье в [списке систем](systems/README.md).
2. Перейти по ссылкам на входы, данные и тесты.
3. Если матрица помечает область как частичную или непроверенную, искать
   реализацию непосредственно по названию системы, ключа, события или публичного
   символа в исходном коде.
4. Любой важный вывод перепроверить по коду или тесту перед изменением системы.
