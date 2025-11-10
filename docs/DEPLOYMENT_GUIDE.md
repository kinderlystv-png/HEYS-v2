# 🚀 Руководство по развертыванию HEYS

## 📋 Обзор развертывания

Данное руководство описывает полный процесс развертывания HEYS в production
environment. Система использует современный CI/CD pipeline с автоматическими
проверками качества и безопасности.

**Целевая среда**: Production  
**Архитектура**: Microservices + Monorepo  
**Платформа**: Vercel (Frontend) + Railway (Backend) + Supabase (Database)

---

## 🏗️ Предварительные требования

### Системные требования

```bash
# Локальная среда разработки
Node.js: 20.x LTS
pnpm: 8.x
Docker: 24.x
Git: 2.40+

# Production инфраструктура
CPU: 2+ cores
RAM: 4GB+
Storage: 50GB+ SSD
Network: 1Gbps+
```

### Аккаунты и сервисы

- ✅ **GitHub**: Repository access и Actions
- ✅ **Vercel**: Frontend deployment
- ✅ **Railway**: Backend hosting
- ✅ **Supabase**: Database и Auth
- ✅ **Cloudflare**: DNS и CDN (опционально)

---

## ⚙️ Настройка Environment Variables

### Frontend (.env.production)

```bash
# API Configuration
VITE_API_URL=https://api-production.heys.app
VITE_API_VERSION=v1

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Analytics & Monitoring
VITE_SENTRY_DSN=https://your-sentry-dsn
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX

# Security
VITE_APP_ENV=production
VITE_ENABLE_DEVTOOLS=false
```

### Backend (.env.production)

```bash
# Server Configuration
NODE_ENV=production
PORT=4001
API_PORT=4001

# Database
DATABASE_URL=postgresql://user:password@host:5432/heys_production
DATABASE_NAME=heys_production

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Security
JWT_SECRET=your_strong_jwt_secret_here
CORS_ORIGIN=https://heys.app,https://www.heys.app
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
SENTRY_DSN=https://your-backend-sentry-dsn
LOG_LEVEL=warn
```

---

## 🔧 Локальная подготовка

### 1. Клонирование и установка

```bash
# Клонирование репозитория
git clone https://github.com/your-org/heys.git
cd heys

# Установка зависимостей
pnpm install

# Проверка зависимостей
pnpm audit --fix
```

### 2. Настройка базы данных

```bash
# Запуск локальной БД (для тестирования)
docker-compose up -d postgres

# Применение миграций
pnpm run db:migrate:deploy

# Заполнение тестовыми данными (опционально)
pnpm run db:seed
```

### 3. Проверка качества кода

```bash
# Линтинг и форматирование
pnpm run lint
pnpm run format

# TypeScript проверка
pnpm run type-check

# Запуск тестов
pnpm run test:all

# Проверка безопасности
pnpm run security:audit
```

### 4. Локальная сборка и тестирование

```bash
# Сборка всех пакетов
pnpm run build

# Локальный запуск production-версии
pnpm run start:prod

# Проверка работоспособности
curl http://localhost:4001/health
curl http://localhost:3001 # Frontend
```

---

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow

#### 1. Quality Gate

```yaml
# .github/workflows/ci.yml
name: Continuous Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint & Format Check
        run: |
          pnpm run lint
          pnpm run format:check

      - name: Type Check
        run: pnpm run type-check

      - name: Unit Tests
        run: pnpm run test:unit

      - name: Security Audit
        run: pnpm audit --audit-level moderate
```

#### 2. Integration Tests

```yaml
integration-tests:
  needs: quality-check
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_PASSWORD: postgres
      options: >-
        --health-cmd pg_isready --health-interval 10s --health-timeout 5s
        --health-retries 5
  steps:
    - name: Integration Tests
      run: pnpm run test:integration

    - name: E2E Tests
      run: pnpm run test:e2e
```

#### 3. Security Scanning

```yaml
security-scan:
  needs: quality-check
  runs-on: ubuntu-latest
  steps:
    - name: Dependency Vulnerability Scan
      uses: github/codeql-action/analyze@v2

    - name: Security Code Analysis
      run: pnpm run security:scan

    - name: Penetration Testing
      run: pnpm run security:pentest
```

#### 4. Build & Deploy

```yaml
deploy:
  needs: [quality-check, integration-tests, security-scan]
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - name: Build Production
      run: pnpm run build:prod

    - name: Deploy Frontend to Vercel
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'

    - name: Deploy Backend to Railway
      uses: railway-deploy-action@v1
      with:
        api-token: ${{ secrets.RAILWAY_TOKEN }}
        service: heys-api
```

---

## 🌐 Production Deployment

### 1. Frontend Deployment (Vercel)

#### Конфигурация проекта

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/web/package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

#### Развертывание

```bash
# Автоматическое развертывание через GitHub Actions
# Или ручное развертывание:

# Установка Vercel CLI
npm i -g vercel

# Логин и настройка
vercel login
vercel --cwd apps/web

# Production deployment
vercel --prod --cwd apps/web
```

### 2. Backend Deployment (Railway)

#### Конфигурация Railway

```toml
# railway.toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install && pnpm run build:core"

[deploy]
startCommand = "node packages/core/dist/server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[environments.production]
PORT = 4001
NODE_ENV = "production"
```

#### Environment Setup

```bash
# Установка Railway CLI
curl -fsSL https://railway.app/install.sh | sh

# Логин
railway login

# Создание проекта
railway project:create heys-api

# Настройка переменных окружения
railway variables:set NODE_ENV=production
railway variables:set PORT=4001
railway variables:set DATABASE_URL="your_database_url"

# Развертывание
railway up
```

### 3. Database Setup (Supabase)

#### Создание проекта

```bash
# Установка Supabase CLI
npm install -g supabase

# Логин
supabase login

# Создание проекта
supabase projects create heys-production

# Генерация типов TypeScript
supabase gen types typescript --project-id your-project-id > types/supabase.ts
```

#### Настройка схемы БД

```sql
-- Выполните в Supabase SQL Editor
-- Файл: supabase_full_setup.sql

-- Создание основных таблиц
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Включение Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Создание политик безопасности
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);
```

---

## 🔒 Security Configuration

### 1. SSL/TLS Certificate

```bash
# Автоматическое управление через Vercel/Railway
# Или настройка через Cloudflare

# Проверка SSL конфигурации
curl -I https://heys.app
curl -I https://api.heys.app
```

### 2. Security Headers

```javascript
// packages/core/src/middleware/security.ts
import helmet from 'helmet';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://your-project.supabase.co'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);
```

### 3. Rate Limiting

```javascript
// Rate limiting configuration
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
});

app.use('/api/', limiter);
```

---

## 📊 Monitoring & Health Checks

### 1. Health Check Endpoints

```typescript
// packages/core/src/routes/health.ts
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
  });
});

app.get('/health/detailed', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    supabase: await checkSupabase(),
  };

  res.json({
    status: 'ok',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

### 2. Application Monitoring

```javascript
// Sentry integration
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Custom metrics
import { trackPerformance } from '@heys/monitoring';

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    trackPerformance('api_request', duration, {
      method: req.method,
      route: req.route?.path,
      status: res.statusCode,
    });
  });

  next();
});
```

### 3. Uptime Monitoring

```bash
# Настройка внешнего мониторинга
# UptimeRobot, Pingdom, или аналоги

# Endpoints для мониторинга:
https://heys.app                    # Frontend
https://api.heys.app/health         # Backend health
https://api.heys.app/health/detailed # Detailed status
```

---

## 🔄 Post-Deployment Checklist

### Функциональная проверка

```bash
✅ Frontend доступен по HTTPS
✅ API endpoints отвечают корректно
✅ Аутентификация работает
✅ База данных подключена
✅ SSL сертификаты валидны
✅ Security headers установлены
✅ Rate limiting активен
✅ Monitoring настроен
✅ Backup стратегия реализована
✅ Error tracking работает
```

### Performance Testing

```bash
# Load testing с Artillery
npm install -g artillery

# Создание сценария нагрузочного тестирования
# artillery-config.yml
artillery run artillery-config.yml

# Lighthouse performance audit
npx lighthouse https://heys.app --view

# Core Web Vitals check
npx web-vitals-measure https://heys.app
```

### Security Validation

```bash
# SSL Labs test
https://www.ssllabs.com/ssltest/analyze.html?d=heys.app

# Security headers check
https://securityheaders.com/?q=heys.app

# OWASP ZAP security scan
docker run -t owasp/zap2docker-stable zap-baseline.py -t https://heys.app
```

---

## 🚨 Rollback Process

### Automatic Rollback

```yaml
# GitHub Actions - Automatic rollback on failure
- name: Health Check Post-Deploy
  run: |
    sleep 30
    curl -f https://api.heys.app/health || exit 1
    curl -f https://heys.app || exit 1

- name: Rollback on Failure
  if: failure()
  run: |
    # Rollback to previous Vercel deployment
    vercel --token=${{ secrets.VERCEL_TOKEN }} rollback

    # Rollback Railway deployment
    railway rollback
```

### Manual Rollback

```bash
# Vercel rollback
vercel rollback --token=your_token

# Railway rollback
railway rollback

# Database migration rollback (если необходимо)
pnpm run db:migrate:rollback
```

---

## 📈 Scaling Strategy

### Horizontal Scaling

```javascript
// Load balancing через Railway
// Автоматическое масштабирование на основе CPU/Memory

// Конфигурация autoscaling
{
  "autoscaling": {
    "min_instances": 2,
    "max_instances": 10,
    "cpu_threshold": 70,
    "memory_threshold": 80
  }
}
```

### Database Scaling

```sql
-- Supabase автоматически управляет:
-- Read replicas для read queries
-- Connection pooling
-- Automated backups

-- Мониторинг производительности БД
SELECT * FROM pg_stat_activity
WHERE state = 'active';
```

---

## 🔧 Troubleshooting

### Общие проблемы и решения

#### Frontend не загружается

```bash
# Проверка статуса Vercel
vercel logs --app=heys-frontend

# Проверка DNS
nslookup heys.app

# Проверка CDN кеша
curl -I https://heys.app
```

#### API недоступен

```bash
# Проверка статуса Railway
railway logs

# Проверка health endpoint
curl https://api.heys.app/health

# Проверка database connectivity
railway run --service=heys-api psql $DATABASE_URL -c "SELECT 1"
```

#### Проблемы с аутентификацией

```bash
# Проверка Supabase статуса
curl https://your-project.supabase.co/rest/v1/

# Проверка JWT токенов
# Использовать jwt.io для декодирования токенов

# Проверка CORS настроек
curl -H "Origin: https://heys.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     https://api.heys.app/auth/login
```

---

## 📞 Контакты и поддержка

**DevOps Team**: devops@heys.app  
**Emergency Hotline**: +1-XXX-XXX-XXXX (24/7)  
**Status Page**: https://status.heys.app

**Documentation**: https://docs.heys.app  
**GitHub Issues**: https://github.com/your-org/heys/issues

---

_Руководство по развертыванию обновлено: 2 сентября 2025_  
_Версия: 3.0.0_  
_Готовность к production: ✅ Проверено_
