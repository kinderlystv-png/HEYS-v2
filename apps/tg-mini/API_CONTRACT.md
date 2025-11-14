# API Контракт для Telegram mini-app «Панель куратора»

Документация контракта API между фронтендом (`apps/tg-mini`) и backend HEYS.

## Эндпоинты

### 1. Получить список клиентов куратора

**Endpoint:** `GET /api/curator/clients`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Query параметры:**

```typescript
{
  page?: number;          // Номер страницы (по умолчанию 1)
  perPage?: number;       // Кол-во на странице (по умолчанию 20)
  search?: string;        // Поиск по имени/email
  status?: 'active' | 'paused' | 'archived' | 'all'; // Фильтр по статусу
  sortBy?: 'name' | 'lastActivity' | 'createdAt'; // Сортировка
  sortOrder?: 'asc' | 'desc'; // Порядок сортировки
}
```

**Ответ 200 OK:**

```json
{
  "clients": [
    {
      "id": "uuid",
      "name": "Иван Петров",
      "email": "ivan@example.com",
      "status": "active",
      "lastActivityAt": "2025-11-14T10:30:00Z",
      "todaySummary": {
        "calories": 1850,
        "caloriesPercent": 92.5,
        "mealsCount": 4
      },
      "profile": {
        "age": 30,
        "gender": "male",
        "weight": 75,
        "height": 180,
        "deficitPctTarget": -10
      },
      "createdAt": "2024-01-15T00:00:00Z",
      "updatedAt": "2025-11-14T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Возможные ошибки:**

- `401 Unauthorized` — не авторизован / невалидный token
- `403 Forbidden` — не является куратором
- `500 Internal Server Error` — ошибка сервера

---

### 2. Получить детальную информацию о клиенте

**Endpoint:** `GET /api/curator/clients/:clientId`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Path параметры:**

- `clientId` — UUID клиента

**Ответ 200 OK:**

```json
{
  "id": "uuid",
  "name": "Иван Петров",
  "email": "ivan@example.com",
  "status": "active",
  "lastActivityAt": "2025-11-14T10:30:00Z",
  "todaySummary": {
    "calories": 1850,
    "caloriesPercent": 92.5,
    "mealsCount": 4
  },
  "profile": {
    "age": 30,
    "gender": "male",
    "weight": 75,
    "height": 180,
    "deficitPctTarget": -10
  },
  "weekStats": {
    "avgCalories": 1920,
    "avgProtein": 110,
    "avgCarbs": 220,
    "avgFat": 65,
    "daysWithData": 7
  },
  "targetCalories": 2000,
  "curatorNotes": "Клиент хочет сбросить 5 кг к лету",
  "createdAt": "2024-01-15T00:00:00Z",
  "updatedAt": "2025-11-14T10:30:00Z"
}
```

**Возможные ошибки:**

- `401 Unauthorized`
- `403 Forbidden` — клиент не принадлежит куратору
- `404 Not Found` — клиент не найден
- `500 Internal Server Error`

---

### 3. Получить данные дня клиента

**Endpoint:** `GET /api/curator/clients/:clientId/day/:date`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Path параметры:**

- `clientId` — UUID клиента
- `date` — дата в формате `YYYY-MM-DD` (например, `2025-11-14`)

**Ответ 200 OK:**

```json
{
  "clientId": "uuid",
  "date": "2025-11-14",
  "meals": [
    {
      "id": "meal-uuid",
      "type": "breakfast",
      "time": "08:30",
      "products": [
        {
          "name": "Овсянка",
          "weight": 100,
          "calories": 350,
          "protein": 12,
          "carbs": 60,
          "fat": 6
        }
      ]
    }
  ],
  "totals": {
    "calories": 1850,
    "protein": 110,
    "carbs": 220,
    "fat": 65
  }
}
```

**Возможные ошибки:**

- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` — клиент или дата не найдены
- `500 Internal Server Error`

---

### 4. Добавить приём пищи

**Endpoint:** `POST /api/curator/clients/:clientId/day/:date/meals`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Path параметры:**

- `clientId` — UUID клиента
- `date` — дата в формате `YYYY-MM-DD`

**Тело запроса:**

```json
{
  "type": "lunch",
  "time": "13:00",
  "products": [
    {
      "name": "Куриная грудка",
      "weight": 150,
      "calories": 165,
      "protein": 31,
      "carbs": 0,
      "fat": 3.6
    }
  ]
}
```

**Ответ 201 Created:**

```json
{
  "id": "meal-uuid",
  "message": "Приём пищи добавлен"
}
```

**Возможные ошибки:**

- `400 Bad Request` — невалидные данные
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`

---

### 5. Обновить приём пищи

**Endpoint:** `PATCH /api/curator/clients/:clientId/day/:date/meals/:mealId`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Path параметры:**

- `clientId` — UUID клиента
- `date` — дата в формате `YYYY-MM-DD`
- `mealId` — UUID приёма пищи

**Тело запроса (partial):**

```json
{
  "time": "14:00",
  "products": [...]
}
```

**Ответ 200 OK:**

```json
{
  "message": "Приём пищи обновлён"
}
```

**Возможные ошибки:**

- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`

---

### 6. Удалить приём пищи

**Endpoint:** `DELETE /api/curator/clients/:clientId/day/:date/meals/:mealId`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Ответ 200 OK:**

```json
{
  "message": "Приём пищи удалён"
}
```

**Возможные ошибки:**

- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`

---

## Аутентификация

### Вариант 1: Telegram initData (для mini-app)

1. Фронтенд получает `initData` из `Telegram.WebApp.initData`.
2. Отправляет в заголовке: `X-Telegram-Init-Data: <initData>`.
3. Backend проверяет подпись HMAC с токеном бота.
4. Извлекает `user.id` из initData и ищет куратора по `telegram_user_id`.

### Вариант 2: JWT Bearer token (для веб-версии)

1. Стандартный заголовок: `Authorization: Bearer <token>`.
2. Backend проверяет валидность JWT.

---

### 7. Поиск продуктов в базе

**Endpoint:** `GET /api/products/search`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Query параметры:**

```typescript
{
  query: string;        // Поисковый запрос (обязательно)
  limit?: number;       // Макс. кол-во результатов (по умолчанию 20)
  category?: string;    // Фильтр по категории
}
```

**Ответ 200 OK:**

```json
{
  "products": [
    {
      "id": "product-uuid",
      "name": "Куриная грудка",
      "nutrition": {
        "calories": 110,
        "protein": 23,
        "carbs": 0,
        "fat": 1.2,
        "fiber": 0,
        "gi": 0
      },
      "category": "Мясо и птица",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 45
}
```

**Возможные ошибки:**

- `400 Bad Request` — пустой `query`
- `401 Unauthorized`
- `500 Internal Server Error`

---

### 8. Получить продукт по ID

**Endpoint:** `GET /api/products/:productId`

**Авторизация:** Bearer token (JWT) или проверка Telegram initData

**Path параметры:**

- `productId` — UUID продукта

**Ответ 200 OK:**

```json
{
  "product": {
    "id": "product-uuid",
    "name": "Куриная грудка",
    "nutrition": {
      "calories": 110,
      "protein": 23,
      "carbs": 0,
      "fat": 1.2,
      "fiber": 0,
      "gi": 0
    },
    "category": "Мясо и птица",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Возможные ошибки:**

- `401 Unauthorized`
- `404 Not Found` — продукт не найден
- `500 Internal Server Error`

---

## Примечания

- Все даты в формате ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`).
- Все UUID в формате `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
- Пагинация: если `total` > `perPage`, фронтенд должен показать переключатель страниц.
- Статусы клиента:
  - `active` — активно ведёт дневник
  - `paused` — на паузе (временно не ведёт)
  - `archived` — архивирован (больше не работает с куратором)

### База продуктов

- База продуктов общая для всех кураторов и клиентов (единая база HEYS).
- Поиск работает по частичному совпадению названия (например, "кури" найдёт "Куриная грудка", "Курица жареная").
- Нутриенты указаны **на 100г продукта**.
- При добавлении продукта в приём пищи куратор указывает вес в граммах, нутриенты пересчитываются пропорционально.
- Категории продуктов (примеры):
  - Мясо и птица
  - Рыба и морепродукты
  - Молочные продукты
  - Крупы и злаки
  - Овощи
  - Фрукты и ягоды
  - Орехи и семена
  - Напитки
  - Готовые блюда
  - Прочее

---

## Реализация backend

**Не реализуем на этом этапе (Итерация 3).**  
Это только контракт для согласования структуры данных между фронтендом и бэкендом.

Backend-реализацию можно добавить позже в:
- `packages/core/src/api/curator.ts` (новый файл)
- или расширить существующий API-слой в `packages/core/src/server.js`
