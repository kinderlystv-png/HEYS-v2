# SEC-006 — рекомендация по решению A/B (photo-bucket anonymous read)

**Дата:** 2026-06-14 **Автор:** security-агент (solo по 6Б.2 плана 22)
**Адресат:** основатель (решение A vs B) **Срок принятия решения:** до
публичного запуска (если выбран A — нужны дни рефактора; если B — 5 мин update
журнала)

---

## Сводка факта

**Состояние:** `heys-photos` bucket —
`anonymous_access_flags.read=true, list=false`.

Это значит:

- ❌ Anyone with full photo URL может скачать (открыт `GET` для anon)
- ✅ Никто не может `ls bucket` (enumeration через S3 API заблокирован)
- ✅ Никто не может `PUT` без auth (uploads через signed PUT URL с auth)

**Реальный риск:** **URL leakage** — если photo URL утечёт куда-то (логи, email,
screenshot), скачать сможет любой.

**Текущий объём:** prod-инстанс — 4 клиента, 1 день с photo references в БД
(testing-наполнение). Real-world impact at this point — минимальный.

---

## Структура photo-ключа (анализ entropy)

Из `yandex-cloud-functions/heys-api-photos/index.js:164-171`:

```
<sanitized client_id>/<sanitized date>/<sanitized meal_id>/<12-byte-randomId>.<ext>
```

Энтропия каждой компоненты:

| Компонента                                          | Значения            | Бит entropy                                       |
| --------------------------------------------------- | ------------------- | ------------------------------------------------- |
| `client_id` (UUID v4)                               | 2^122               | 122                                               |
| `date` (YYYY-MM-DD, последний год)                  | 365 ≈ 2^8.5         | 8 (низкая, attacker может перебрать)              |
| `meal_id` (base32, обычно 20-30 байт)               | 2^100 (приближение) | 100                                               |
| `randomId` (12 байт hex через `crypto.randomBytes`) | 2^96                | 96                                                |
| **Всего на полный путь**                            |                     | **~318 бит** (или ~218 если игнорировать meal_id) |

**Сравнение с brute-force:**

- Атомов во вселенной ≈ 2^265
- AES-128 key space = 2^128

**Вывод:** brute-force enumeration по перебору **невозможен в принципе**. Защита
держится не на security-by-obscurity (это plain secret), а на криптографической
непредсказуемости ключа.

---

## Вариант A — signed GET URLs

### Что делать

1. `heys-api-photos/index.js` — добавить `POST /photos/get-url` endpoint,
   который:
   - Принимает `key` (photo-путь)
   - Проверяет ownership (clientId match или curator access)
   - Возвращает signed URL с TTL ~1ч (Yandex S3 supports `GetObject` signed
     URLs)
2. Фронт — везде где `photo.url` напрямую в `<img src>`, заменить на:
   - Хранить только `key` в БД (миграция existing data)
   - Перед рендером — запросить signed URL у бекенда
   - Обновлять URL при истечении TTL
3. `yc storage bucket update heys-photos --anonymous-access-flags read=false` —
   финальный flip

### Плюсы

- Явная expiration → URL leak становится temporal (час → не критично)
- Можно отзывать access (server-side gate)
- Логи доступа централизованы (server видит каждый request)
- Защита от accidental URL sharing — share-ссылка перестаёт работать через час

### Минусы

- **Объём работы**: ~6-12 часов разработка + 2-4 часа QA
- **Frontend impact**: 5+ мест с `photo.url` (`heys_day_gallery.js:263`,
  `heys_day_hooks.js:167`, `heys_day_meal_card.js:995`,
  `heys_day_meals_bundle_v1.js:4473`, `heys_day_bundle_v1.js:8054`) — рефактор
  каждого
- **Latency**: каждый request фото = `POST /get-url` (50-200ms) перед
  `GET image` → user-visible delay при скролле gallery
- **Cache invalidation**: signed URLs уникальные → browser-cache работает только
  для текущего session/URL
- **Migration**: existing `photo.url` в БД → нужно нормализовать в `photo.key`,
  написать миграцию

### Когда A оправдан

- При больших объёмах (100+ клиентов, тысячи фото в день) — leakage риск растёт
  пропорционально количеству URLs «в обороте»
- При compliance требовании явных access logs за каждое скачивание фото (нет
  такого требования сейчас по 152-ФЗ для health-данных)
- При sharing-feature (мы не делаем sharing) — там signed URLs обязательны

---

## Вариант B — accepted-risk с инвариантом

### Что делать

1. Оставить `anonymous_access_flags.read=true` как есть
2. Документировать инвариант непредсказуемости ключа (этот файл)
3. Добавить три митигации против URL leakage:
   - **Не логировать photo URLs**: в Yandex API Gateway access logs убедиться,
     что path-параметры не пишутся (или маскируются)
   - **Cache-Control headers** на photo-responses: `private, no-store` (через S3
     object metadata при upload или через CDN config)
   - **Referrer-Policy: no-referrer** на любых страницах содержащих
     `<img src=photo.url>` (через response header или meta-tag) — чтобы URL не
     уезжал в Referer заголовок при click на сторонние ссылки
4. Update `docs/SECURITY_REVIEW.md` SEC-006 → `accepted-risk` со ссылкой на этот
   документ как обоснование

### Плюсы

- **5 минут работы** (обновить журнал + добавить 3 заголовка в response)
- **Нет latency penalty** (фронт работает как сейчас)
- **Browser cache работает** (URL стабильный)
- **Защита эквивалентная**: 318 бит entropy = практически непробиваемо для
  brute-force
- **Простая инвариант-фиксация**: «не логируй photo URLs» — легко поддерживать

### Минусы

- **URL leakage риск остаётся**: если URL попал в логи / screenshot / email —
  скачать можно навсегда (никакой expiration)
- **Защита держится на дисциплине** ребят (не логировать, не делать sharing-фичи
  без signed-URLs)
- **Нет access logs** на уровне сервера → не отследить кто-сколько-когда скачал

### Когда B оправдан

- **На текущей стадии (≤100 клиентов, малый объём фото)** — leakage риск
  минимальный
- **Нет sharing feature** → нет канала где URL «утекает» легитимно (приложение
  полу-приватное)
- **Нет compliance требования** на per-request access log (152-ФЗ требует
  журналирования _доступа к перс-данным_, но фото — это уже client-side render,
  не серверный access)
- **Time-to-launch критичен** — вариант A добавляет 1-2 дня в
  release-критическую дорогу

---

## Рекомендация (security-агент)

**Сейчас → Вариант B**, потому что:

1. **Entropy ключа достаточна** для практической защиты от brute-force (318
   бит >> любой реальный угрозы)
2. **Объём photo-данных минимален** (1 день в текущем prod) → leakage exposure
   низкий
3. **Time-to-launch**: 5 мин update + 30 мин митигации (Cache-Control +
   Referrer-Policy) vs 1-2 дня рефактора
4. **B обратим**: всегда можно перейти на A позже без потери данных (тот же
   bucket, добавить signed URL endpoint, плавная миграция)

**Конкретные шаги для B:**

1. Я обновляю `docs/SECURITY_REVIEW.md` SEC-006 → `accepted-risk` со ссылкой на
   этот документ.
2. Я добавляю `Cache-Control: private, no-store` в S3 PutObjectCommand
   (heys-api-photos:228+).
3. Я добавляю `Referrer-Policy: no-referrer` meta-tag в `apps/web/index.html`.
4. Деплой heys-api-photos.
5. Update Plan 22 §6Б.2 — статус «решено вариантом B».

**Триггеры пересмотра на Вариант A:**

- Достижение 100+ клиентов с регулярной фото-загрузкой
- Введение sharing-фичи (e.g. «поделиться рационом дня»)
- Compliance audit потребует per-request access log
- Утечка реального photo URL в логе/email (incident)

При наступлении триггера — отдельная задача (6В.X в plan 22), оценочно 1-2 дня
инженерной работы.

---

## Сценарий «отверг рекомендацию, хочу A прямо сейчас»

Если основатель хочет более строгую защиту перед запуском несмотря на trade-off:

| Шаг       | Action                                                         | Время            |
| --------- | -------------------------------------------------------------- | ---------------- |
| 1         | Endpoint `POST /photos/get-url` с ownership-check              | 2-3 ч            |
| 2         | Migration existing photo refs в БД (`url` → `key`)             | 1 ч              |
| 3         | Frontend refactor 5 мест usage `photo.url`                     | 2-3 ч            |
| 4         | TTL refresh механизм (re-fetch URL при 403)                    | 1-2 ч            |
| 5         | QA: gallery skroll, slow network, multi-tab                    | 2 ч              |
| 6         | Deploy + smoke test                                            | 1 ч              |
| 7         | `yc storage bucket update --anonymous-access-flags read=false` | 5 мин            |
| **Total** |                                                                | **~10-15 часов** |

---

## Open questions для основателя

1. **Текущий план clientele expansion**: если в ближайший квартал ожидается 100+
   клиентов с активным фото-логированием — лучше сделать A сразу, не
   возвращаться.
2. **Compliance audit**: есть ли в R0 из `маркетинг/32_ПДн_governance`
   требование к access-логам именно на чтение фото? Если да — A обязателен.
3. **Sharing feature roadmap**: в `25_Roadmap_Ф0_Ф1.md` есть feature «поделиться
   рационом»? Если да — A обязателен.

Если ответ на 1/2/3 — нет, то B оптимален.

---

## Решение основателя

- [ ] A — signed GET URLs (рефактор сейчас, ~10-15 ч)
- [ ] B — accepted-risk с митигациями (5 мин + 30 мин)
- [ ] Подожди — нужно ответить на open questions выше
