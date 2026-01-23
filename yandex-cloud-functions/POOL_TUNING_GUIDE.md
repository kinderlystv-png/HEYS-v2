# Connection Pool Tuning Guide

## Обзор

Данное руководство помогает настроить размер connection pool для оптимальной производительности HEYS Cloud Functions под фактическую нагрузку.

## Текущая конфигурация

По умолчанию пул настроен консервативно:

```javascript
{
  max: 3,                      // Максимум 3 соединения
  idleTimeoutMillis: 10000,    // 10 секунд idle timeout
  connectionTimeoutMillis: 5000, // 5 секунд на подключение
  query_timeout: 10000         // 10 секунд на запрос
}
```

## Когда нужно тюнить пул

### Признаки недостаточного размера пула:

1. **Частые ошибки "timeout acquiring client"**
   ```
   Error: timeout acquiring client from pool
   ```

2. **Высокая утилизация пула (>80%)**
   ```bash
   # Проверить метрики
   yc serverless function logs heys-api-rpc --filter "[Pool-Metrics]"
   ```

3. **Медленные запросы в очереди**
   - `waitingCount > 0` в метриках
   - Высокий latency на endpoints

4. **Пиковые нагрузки**
   - Много одновременных запросов
   - Долгие транзакции (>1s)

### Признаки избыточного размера пула:

1. **Ошибки PostgreSQL "too many connections"**
   ```
   Error: FATAL: remaining connection slots reserved
   ```

2. **Низкая утилизация (<20%)**
   - Пул больше чем нужно
   - Лишние ресурсы на сервере БД

## Формула расчёта размера пула

### Базовая формула:

```
pool_size = (expected_concurrent_requests × avg_query_time) / 1000
```

Где:
- `expected_concurrent_requests` - ожидаемое кол-во одновременных запросов
- `avg_query_time` - средняя длительность запроса в миллисекундах

### Пример расчёта:

**Сценарий**: API endpoint с 50 RPS, средний запрос 200ms

```
pool_size = (50 × 200) / 1000 = 10 connections
```

**Важно**: Добавьте 20% запас для пиков:
```
pool_size = 10 × 1.2 = 12 connections
```

### Лимиты Yandex Managed PostgreSQL:

| План | Max Connections | Рекомендация для pool |
|------|----------------|-----------------------|
| s2.micro | 50 | 3-5 per function |
| s2.small | 100 | 5-10 per function |
| s2.medium | 200 | 10-20 per function |

**Формула для нескольких функций**:

```
pool_per_function = (total_db_connections × 0.8) / number_of_functions
```

## Пошаговая настройка

### Шаг 1: Измерьте текущую нагрузку

```bash
# Метрики пула за последний час
yc serverless function logs heys-api-rpc \
  --filter "[Pool-Metrics]" \
  --since 1h | grep utilization

# Анализ метрик
# Найти максимальную утилизацию и waiting count
```

### Шаг 2: Определите целевой размер

**Консервативный подход** (рекомендуется для старта):
- Если утилизация 60-80%: увеличить на 50%
- Если утилизация >80%: увеличить в 2 раза
- Если waiting > 0: увеличить минимум в 1.5 раза

**Агрессивный подход** (для высоконагруженных систем):
- Используйте формулу из раздела выше
- Добавьте 50% запас для пиков
- Мониторьте DB connections

### Шаг 3: Обновите конфигурацию

#### Вариант A: Через environment variable

```bash
# Добавить в deployment
yc serverless function version create \
  --function-name=heys-api-rpc \
  --environment POOL_MAX_SIZE=10 \
  ...
```

Обновить `shared/db-pool.js`:
```javascript
const poolConfig = {
  max: parseInt(process.env.POOL_MAX_SIZE || '3'),
  idleTimeoutMillis: parseInt(process.env.POOL_IDLE_TIMEOUT || '10000'),
  ...
}
```

#### Вариант B: Hardcoded (для простоты)

Изменить `shared/db-pool.js`:
```javascript
const poolConfig = {
  max: 10,  // Было: 3
  ...
}
```

### Шаг 4: Деплой и мониторинг

```bash
# Деплой обновлённой функции
cd yandex-cloud-functions/heys-api-rpc
npm install
zip -r heys-api-rpc.zip index.js package.json node_modules/ ../shared/
# Deploy via CLI or Console

# Мониторинг после деплоя
yc serverless function logs heys-api-rpc --follow --filter "[Pool-Metrics]"
```

**Следить за**:
- Utilization должна быть 40-70%
- Waiting count = 0
- Ошибок "timeout acquiring" нет

### Шаг 5: Итерация

Если после увеличения:
- Утилизация <30%: можно уменьшить на 20-30%
- Утилизация >70%: увеличить ещё на 30-50%
- Появились DB errors: превышен лимит, уменьшить

## Рекомендации по функциям

### heys-api-rpc (RPC вызовы)

**Характеристика**:
- Частые короткие запросы
- Высокий RPS
- Средний query time: 50-200ms

**Рекомендация**:
```javascript
max: 5-10  // Зависит от RPS
```

### heys-api-rest (REST API)

**Характеристика**:
- Смешанные запросы (read/write)
- Средний RPS
- Средний query time: 100-300ms

**Рекомендация**:
```javascript
max: 5-8
```

### heys-api-auth (Авторизация)

**Характеристика**:
- Редкие запросы
- Низкий RPS
- Короткий query time: 50-100ms

**Рекомендация**:
```javascript
max: 3-5  // Достаточно небольшого пула
```

### heys-api-payments (Платежи)

**Характеристика**:
- Редкие запросы
- Критичные транзакции
- Средний query time: 200-500ms

**Рекомендация**:
```javascript
max: 3-5  // Небольшой пул, но с запасом для транзакций
```

### heys-api-leads (Лиды)

**Характеристика**:
- Редкие запросы
- Простые inserts
- Короткий query time: 50-150ms

**Рекомендация**:
```javascript
max: 2-3  // Минимальный пул
```

## Advanced: Динамический sizing

Для автоматической адаптации размера пула под нагрузку:

```javascript
// shared/db-pool.js - динамический max
function calculatePoolSize() {
  const baseSize = 3;
  const loadFactor = getLoadFactor(); // 0.0 - 1.0 based on metrics
  return Math.ceil(baseSize * (1 + loadFactor));
}

// Периодическое обновление (каждые 5 минут)
setInterval(() => {
  const newSize = calculatePoolSize();
  if (newSize !== pool.options.max) {
    console.log(`[Pool] Adjusting size: ${pool.options.max} → ${newSize}`);
    // Note: pg Pool doesn't support dynamic resize
    // Need to drain and recreate pool
  }
}, 300000);
```

**⚠️ Осторожно**: Динамическое изменение требует graceful shutdown существующих соединений.

## Troubleshooting

### Проблема: "timeout acquiring client"

**Причины**:
1. Пул слишком мал для нагрузки
2. Медленные запросы блокируют пул
3. Соединения не освобождаются (leak)

**Решение**:
```bash
# 1. Проверить метрики
yc serverless function logs heys-api-rpc --filter "timeout acquiring"

# 2. Проверить query performance
# В PostgreSQL:
SELECT pid, now() - query_start as duration, query 
FROM pg_stat_activity 
WHERE state = 'active' 
ORDER BY duration DESC;

# 3. Увеличить pool size или query_timeout
```

### Проблема: "too many connections" от PostgreSQL

**Причины**:
1. Сумма всех пулов превышает DB лимит
2. Утечка соединений

**Решение**:
```bash
# 1. Проверить текущие соединения
# В PostgreSQL:
SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'heys_production';

# 2. Уменьшить размеры пулов пропорционально
# Формула: pool_per_function = (db_limit × 0.8) / function_count

# 3. Проверить на connection leaks
yc serverless function logs --filter "release\(\)" | wc -l
yc serverless function logs --filter "connect\(\)" | wc -l
# Должны быть примерно равны
```

### Проблема: Высокий latency несмотря на низкую утилизацию

**Причины**:
1. Медленные запросы в БД
2. Network latency
3. Проблемы с индексами

**Решение**:
```bash
# 1. Включить query logging
# В db-pool.js добавить:
pool.on('connect', (client) => {
  client.on('query', (query) => {
    console.log('[Query]', query.text);
  });
});

# 2. Анализ медленных запросов
# В PostgreSQL:
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

## Мониторинг и алерты

### Метрики для мониторинга:

1. **Pool utilization** - должна быть 40-70%
2. **Waiting count** - должна быть 0
3. **Query duration** - медиана <200ms
4. **Error rate** - <0.1%

### Настройка алертов (Yandex Monitoring):

```yaml
# Alert: High pool utilization
condition: pool_utilization > 80
duration: 5m
action: notify

# Alert: Connection timeout
condition: errors.timeout_acquiring > 0
duration: 1m
action: notify + escalate

# Alert: DB connection limit
condition: db_connections > (max_connections * 0.9)
duration: 5m
action: notify
```

## Чеклист оптимизации

- [ ] Измерил текущую утилизацию пула
- [ ] Рассчитал целевой размер по формуле
- [ ] Учёл лимиты Yandex Managed PostgreSQL
- [ ] Обновил конфигурацию пула
- [ ] Задеплоил изменения
- [ ] Мониторил метрики 24 часа
- [ ] Проверил отсутствие ошибок
- [ ] Настроил алерты на высокую утилизацию
- [ ] Документировал финальные значения

---

**Последнее обновление**: 2026-01-23  
**Версия**: 1.0
