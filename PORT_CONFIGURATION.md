# HEYS Project B - Port Configuration

## Development Ports

Этот проект настроен для работы на следующих портах в режиме разработки:

### Frontend
- **Port**: 3001
- **URL**: http://localhost:3001
- **Vite Dev Server**: настроен в `apps/web/vite.config.ts`

### Backend API
- **Port**: 4001
- **URL**: http://localhost:4001
- **Server**: настроен в переменных окружения

### Database
- **Name**: projectB
- **Port**: стандартный для используемой СУБД

## Файлы конфигурации

### Environment Variables (.env)
```
PORT=3001
API_PORT=4001
DATABASE_NAME=projectB
NODE_ENV=development
VITE_PORT=3001
VITE_API_URL=http://localhost:4001
```

### Docker Ports
- Frontend: `3001:3001`
- API: `4001:4001`

## Команды запуска

### Через pnpm
```bash
# Запуск frontend на порту 3001
pnpm --filter @heys/web run dev

# Запуск всего проекта
pnpm run dev
```

### Через VS Code Tasks
- `Start Frontend (Port 3001)` - запуск только frontend
- `Start API Server (Port 4001)` - запуск только API
- `Start Full Stack (Ports 3001 & 4001)` - запуск всего проекта

### Через Docker
```bash
# Development
docker-compose up heys-dev

# Production
docker-compose up heys-web
```

## Отладка в VS Code

Настроены конфигурации отладки:
- `Launch Web App (Port 3001)` - отладка frontend
- `Launch API Server (Port 4001)` - отладка API
- `Launch Full Stack` - отладка всего проекта
- `Launch Web + API` - запуск обеих частей одновременно

## Проверка конфликтов портов

Убедитесь, что порты 3001 и 4001 свободны:

```bash
# Windows
netstat -an | findstr :3001
netstat -an | findstr :4001

# Linux/Mac
lsof -i :3001
lsof -i :4001
```

## API Proxy

Frontend настроен для проксирования API запросов:
- `/api/*` → `http://localhost:4001/*`

Это позволяет избежать CORS проблем в разработке.
