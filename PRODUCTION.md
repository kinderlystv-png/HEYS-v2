# HEYS Production Deployment Guide

## 🚀 Фаза 4: Продакшн-готовность

Этот документ описывает процесс развертывания HEYS в production окружении.

## 🐳 Docker Deployment

### Быстрый старт

```bash
# Сборка и запуск
pnpm run docker:build
pnpm run docker:run

# Или через docker-compose
pnpm run docker:compose:up
```

### Development режим

```bash
# Сборка dev образа
pnpm run docker:build:dev

# Запуск с hot reload
pnpm run docker:compose:dev
```

## 📋 Команды для production

### Build & Test

```bash
pnpm run test:all          # Все тесты с покрытием
pnpm run build:packages    # Сборка пакетов
pnpm run build:apps        # Сборка приложений
pnpm run type-check        # Проверка типов
```

### Docker операции

```bash
pnpm run docker:build      # Сборка production образа
pnpm run docker:run        # Запуск контейнера
pnpm run docker:compose:up # Запуск через compose
```

### Мониторинг

```bash
pnpm run healthcheck       # Проверка здоровья
pnpm run monitoring:start  # Запуск мониторинга
pnpm run monitoring:check  # Единоразовая проверка
pnpm run monitoring:metrics # Показать метрики
```

### Deployment

```bash
pnpm run deploy           # Полный деплой в production
```

## 🏗️ Архитектура

### Multi-stage Docker build

- **Base**: Node.js 18 Alpine + pnpm
- **Development**: Для разработки с hot reload
- **Builder**: Сборка проекта и тесты
- **Production**: Минимальный образ для продакшн

### CI/CD Pipeline

- **Test**: Линтинг, типы, unit и E2E тесты
- **Build**: Сборка Docker образа
- **Deploy**: Автоматический деплой на main

## 🔍 Мониторинг

### Health Checks

Приложение предоставляет эндпоинты для проверки состояния:

- `/health` - основной health check
- `/api/status` - статус API

### Метрики

- Время ответа
- Статус эндпоинтов
- История проверок
- Алерты при проблемах

## 📊 Логирование

### Файлы логов

- `deployment.log` - логи деплоя
- `monitoring.log` - логи мониторинга
- `metrics.json` - метрики производительности

## 🚨 Алерты

Настройте переменные окружения для алертов:

```bash
export ALERT_EMAIL="admin@heys.app"
export ALERT_WEBHOOK="https://hooks.slack.com/..."
```

## ☸️ Kubernetes (опционально)

Для развертывания в Kubernetes:

```bash
kubectl apply -f k8s/deployment.yaml
```

## 🔒 Безопасность

### Docker Security

- Непривилегированный пользователь
- Минимальный Alpine образ
- Проверка зависимостей

### Runtime Security

- Health checks
- Resource limits
- Graceful shutdown

## 📈 Производительность

### Оптимизации

- Multi-stage builds
- Layer caching
- Dependency optimization
- Production-only dependencies

### Мониторинг производительности

- Response time tracking
- Resource usage metrics
- Error rate monitoring

## 🔧 Настройка окружения

### Переменные окружения

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
```

### Docker Compose переменные

```bash
DOCKER_USERNAME=your-dockerhub-username
DOCKER_PASSWORD=your-dockerhub-password
```

## 📝 Логи и отладка

### Просмотр логов контейнера

```bash
docker logs heys-web
docker-compose logs -f heys-web
```

### Отладка в контейнере

```bash
docker exec -it heys-web sh
```

## 🔄 Backup и Recovery

### Создание бэкапа

```bash
# Экспорт метрик
pnpm run monitoring:metrics > backup/metrics-$(date +%Y%m%d).json

# Backup логов
cp deployment.log monitoring.log backup/
```

## 📞 Поддержка

При проблемах с deployment:

1. Проверьте логи: `docker logs`
2. Запустите health check: `pnpm run healthcheck`
3. Проверьте метрики: `pnpm run monitoring:metrics`
4. Перезапустите: `pnpm run docker:compose:down && pnpm run docker:compose:up`

## 🎯 Готовность к продакшн

Checklist перед деплоем:

- [ ] Все тесты проходят (110/110)
- [ ] Coverage > 85%
- [ ] E2E тесты работают
- [ ] Docker образ собирается
- [ ] Health checks работают
- [ ] Мониторинг настроен
- [ ] CI/CD pipeline готов
- [ ] Логирование настроено
- [ ] Алерты настроены

---

🎉 **HEYS готов к production deployment!**
