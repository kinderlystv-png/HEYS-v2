# Pre-Deployment Checklist для HEYS v2

## Overview

Этот чеклист гарантирует, что все критические аспекты приложения проверены перед
деплоем в production. Следуйте этому списку **строго** для каждого релиза.

---

## 📋 Pre-Deployment Steps

### 1. Code Quality & Testing

#### 1.1 Build & Tests

- [ ] **Build успешно:** `pnpm build` завершается без ошибок
- [ ] **All tests passing:** `pnpm test` — 650/650 тестов проходят
- [ ] **Type checking:** `pnpm type-check` — 0 TypeScript ошибок
- [ ] **Lint clean:** `pnpm lint` — 0 ESLint ошибок
- [ ] **E2E tests:** Playwright тесты проходят (если есть)

```bash
# Запустить все проверки
pnpm build
pnpm test:all
pnpm type-check
pnpm lint
```

#### 1.2 Code Review

- [ ] **PR reviewed:** Минимум 1 approval от другого developer
- [ ] **No TODO/FIXME:** Нет незавершенных TODO/FIXME комментариев
- [ ] **No debug code:** Удалены все `debugger`, `console.log` (или через
      `DEV.log`)
- [ ] **Documentation updated:** README, CHANGELOG обновлены

#### 1.3 Security Audit

- [ ] **No critical vulnerabilities:** `pnpm audit` — 0 critical/high CVEs
- [ ] **Dependencies updated:** Все security patches применены
- [ ] **Secrets removed:** Нет hardcoded secrets/API keys в коде
- [ ] **`.env` not committed:** `.env` файлы в `.gitignore`

```bash
# Security audit
pnpm audit
pnpm outdated
git grep -i "password\|secret\|token\|api_key"
```

---

### 2. Environment Configuration

#### 2.1 Environment Variables

- [ ] **`.env` файл настроен:** Скопирован из `.env.example`
- [ ] **Supabase credentials:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] **Server ports:** `PORT=3001`, `API_PORT=4001` (или production values)
- [ ] **NODE_ENV:** `NODE_ENV=production` для production build
- [ ] **Sentry DSN:** `VITE_SENTRY_DSN` настроен (если используется)

**Production .env checklist:**

```env
# ✅ Обязательные переменные
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... (ваш anon key)
NODE_ENV=production
PORT=3001
API_PORT=4001

# ✅ Опциональные
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
VITE_LOG_LEVEL=warn
VITE_ENABLE_ANALYTICS=true
```

#### 2.2 Supabase Configuration

- [ ] **Database migrations:** Все миграции применены
- [ ] **RLS policies enabled:** Row Level Security активирован для всех таблиц
- [ ] **Policies tested:** Проверена изоляция данных между клиентами
- [ ] **Indexes created:** Indexes для performance-critical queries
- [ ] **Backup configured:** Automated backups включены

```sql
-- Проверка RLS
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- Все таблицы должны иметь rowsecurity = true
```

#### 2.3 Authentication & Authorization

- [ ] **Auth providers configured:** Email/password enabled в Supabase
- [ ] **JWT expiration:** Token expiration настроен разумно (default: 1 hour)
- [ ] **Password policy:** Minimum password strength настроен
- [ ] **Email verification:** Email confirmation enabled (опционально)

---

### 3. Performance Optimization

#### 3.1 Bundle Size

- [ ] **Total bundle < 500KB:** Check build output
- [ ] **Code splitting:** Lazy loading для route components
- [ ] **Tree shaking:** Unused imports удалены
- [ ] **Compression enabled:** Gzip/Brotli compression на сервере

```bash
# Analyze bundle size
pnpm --filter @heys/web build
ls -lh apps/web/dist/assets/*.js
```

**Expected bundle sizes:**

- `react-*.js`: ~140-150KB (gzipped)
- `vendor-*.js`: ~50-70KB
- `features-*.js`: ~30-50KB
- `core-*.js`: ~20-30KB

#### 3.2 Performance Metrics

- [ ] **Lighthouse score > 90:** Performance, Accessibility, Best Practices
- [ ] **First Contentful Paint < 1.5s**
- [ ] **Time to Interactive < 3s**
- [ ] **Cumulative Layout Shift < 0.1**

```bash
# Run Lighthouse audit
pnpm lighthouse
```

#### 3.3 Caching Strategy

- [ ] **Static assets cached:** Cache headers для JS/CSS/images
- [ ] **Service Worker:** PWA manifest configured (опционально)
- [ ] **API caching:** Supabase query caching настроен
- [ ] **localStorage limits:** Проверка размера localStorage (< 5MB)

---

### 4. Security Hardening

#### 4.1 Headers & Policies

- [ ] **CSP enabled:** Content Security Policy configured
- [ ] **HTTPS only:** HTTP redirects to HTTPS
- [ ] **HSTS enabled:** Strict-Transport-Security header
- [ ] **X-Frame-Options:** `DENY` или `SAMEORIGIN`
- [ ] **X-Content-Type-Options:** `nosniff`

**Пример Nginx/Apache config:**

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline';";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
```

#### 4.2 Error Handling

- [ ] **ErrorBoundary configured:** React ErrorBoundary на топ-уровне
- [ ] **Sentry integration:** Error tracking настроен
- [ ] **Generic error messages:** Не показываем internal details пользователям
- [ ] **Logging disabled:** `console.log` только через `DEV.log` в production

#### 4.3 Data Protection

- [ ] **Input validation:** Все user inputs валидируются
- [ ] **SQL injection protected:** Parameterized queries через Supabase
- [ ] **XSS protected:** React автоматически экранирует, но проверь
      dangerouslySetInnerHTML
- [ ] **CSRF protection:** Supabase использует httpOnly cookies

---

### 5. Database & Data

#### 5.1 Database Health

- [ ] **Migrations applied:** `supabase db push` или manual migrations
- [ ] **Foreign keys valid:** Referential integrity проверена
- [ ] **Indexes optimized:** Slow queries identified и indexed
- [ ] **Data seeded:** Initial data (если нужно) загружена

```sql
-- Проверка медленных queries
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

#### 5.2 Data Validation

- [ ] **Sample data tested:** Приложение работает с реальными данными
- [ ] **Edge cases handled:** Пустые списки, null values, large datasets
- [ ] **Data migration:** Если обновление схемы, migration script работает
- [ ] **Backup tested:** Restore из backup протестирован

#### 5.3 Client Isolation

- [ ] **Multi-tenancy working:** Users видят только свои данные
- [ ] **Client switching:** Переключение между клиентами работает
- [ ] **RLS policies:** Verify изоляция через прямые SQL queries

```sql
-- Test RLS policy
SET request.jwt.claims.sub = 'test-user-id';
SELECT * FROM clients; -- Должны видеть только свои данные
```

---

### 6. Monitoring & Logging

#### 6.1 Error Tracking

- [ ] **Sentry configured:** Error reporting работает
- [ ] **Error rates monitored:** Alerts настроены для критических ошибок
- [ ] **Source maps uploaded:** Sentry может показать original source code

```bash
# Test Sentry integration
# В dev environment:
throw new Error('Test error for Sentry');
# Проверь что ошибка появилась в Sentry dashboard
```

#### 6.2 Analytics

- [ ] **Simple analytics working:** `heys_simple_analytics.js` track events
- [ ] **Performance metrics:** Slow queries, API calls logged
- [ ] **User metrics:** Session stats, active users tracked
- [ ] **Privacy compliant:** No PII logged

#### 6.3 Health Checks

- [ ] **Health endpoint:** `/api/health` returns 200 OK
- [ ] **Database connectivity:** Health check verifies DB connection
- [ ] **External services:** Supabase, Sentry reachable

```bash
# Test health endpoint
curl http://localhost:3001/api/health
# Expected: {"status": "ok", "database": "connected"}
```

---

### 7. User Experience

#### 7.1 UI/UX Testing

- [ ] **Cross-browser testing:** Chrome, Firefox, Safari
- [ ] **Mobile responsive:** iPhone, Android devices
- [ ] **Accessibility:** Screen reader compatible, keyboard navigation
- [ ] **Loading states:** Spinners, skeleton screens для async operations

#### 7.2 Feature Validation

- [ ] **Authentication flow:** Login, logout, password reset работают
- [ ] **Product search:** Search functionality корректна
- [ ] **Day tracking:** Add/edit/delete meals работает
- [ ] **Reports:** Reports generation без ошибок
- [ ] **Cloud sync:** Supabase sync работает (если online)

#### 7.3 Edge Cases

- [ ] **Offline mode:** LocalStorage fallback работает
- [ ] **Network errors:** Graceful error handling
- [ ] **Empty states:** No data states отображаются корректно
- [ ] **Large datasets:** Performance с > 1000 products tested

---

### 8. Deployment Configuration

#### 8.1 Server Configuration

- [ ] **Static files served:** Correct MIME types, compression
- [ ] **Ports configured:** Frontend (3001), API (4001) доступны
- [ ] **Reverse proxy:** Nginx/Apache настроен (если используется)
- [ ] **SSL certificate:** Valid HTTPS certificate installed

#### 8.2 CI/CD Pipeline

- [ ] **Build pipeline:** GitHub Actions/Jenkins успешно builds
- [ ] **Test automation:** Tests run в CI pipeline
- [ ] **Deployment script:** Automated deployment configured
- [ ] **Rollback plan:** Способность откатиться к предыдущей версии

```yaml
# Пример GitHub Actions workflow
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test
      - run: pnpm deploy # Your deployment command
```

#### 8.3 Post-Deployment

- [ ] **Smoke tests:** Basic functionality после deployment
- [ ] **Monitor logs:** Check Sentry, server logs первые 30 минут
- [ ] **Performance monitoring:** Lighthouse audit после deployment
- [ ] **User notification:** Если breaking changes, уведомить пользователей

---

### 9. Documentation

#### 9.1 Technical Documentation

- [ ] **README updated:** Installation, setup instructions актуальны
- [ ] **CHANGELOG:** Новые features, bug fixes documented
- [ ] **API docs:** Если есть API, endpoints documented
- [ ] **Architecture docs:** `docs/ARCHITECTURE.md` актуален

#### 9.2 User Documentation

- [ ] **User guide:** Если нужно, user manual обновлен
- [ ] **Release notes:** Changelog для пользователей
- [ ] **Known issues:** Documented в GitHub issues или docs

#### 9.3 Security Documentation

- [ ] **SECURITY.md updated:** Vulnerability reporting process актуален
- [ ] **Security audit:** Последний audit documented
- [ ] **Compliance:** GDPR, data retention policies documented (если релевантно)

---

### 10. Final Checks

#### 10.1 Pre-Launch Validation

- [ ] **All checklist items completed** ✅
- [ ] **Stakeholders notified:** Product, design, management aware
- [ ] **Backup verified:** Последний backup tested
- [ ] **Rollback tested:** Способность откатиться если что-то пойдет не так

#### 10.2 Go-Live

- [ ] **Deploy в production:** Execute deployment script
- [ ] **Monitor metrics:** Первые 30-60 минут после deployment
- [ ] **Verify functionality:** Smoke tests в production environment
- [ ] **User feedback:** Мониторим feedback channels (support, social media)

#### 10.3 Post-Launch

- [ ] **Performance review:** Lighthouse, analytics после 24 hours
- [ ] **Error rate:** Check Sentry error rate vs baseline
- [ ] **User satisfaction:** Survey, feedback, support tickets
- [ ] **Retrospective:** Team meeting для lessons learned

---

## 🚀 Deployment Commands

### Production Build

```bash
# 1. Clean previous build
pnpm clean

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Run tests
pnpm test:all

# 4. Build for production
cross-env NODE_ENV=production PORT=3001 API_PORT=4001 pnpm build

# 5. Verify build
ls -lh apps/web/dist/
```

### Health Check After Deployment

```bash
# Check server status
curl -I https://your-domain.com

# Check health endpoint
curl https://your-domain.com/api/health

# Run Lighthouse
pnpm lighthouse --url=https://your-domain.com
```

---

## 📊 Success Metrics

### Performance

- **Lighthouse Score:** > 90 (Performance, Accessibility, Best Practices)
- **Page Load Time:** < 2 seconds (3G connection)
- **Time to Interactive:** < 3 seconds

### Reliability

- **Uptime:** > 99.9%
- **Error Rate:** < 0.1% requests
- **MTTR (Mean Time to Recovery):** < 1 hour

### Security

- **Critical Vulnerabilities:** 0
- **RLS Bypass Attempts:** 0 successful
- **Data Breaches:** 0

---

## 🆘 Troubleshooting

### Common Issues

1. **Build fails:**

   ```bash
   pnpm clean
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   pnpm build
   ```

2. **Tests fail:**
   - Check environment variables
   - Verify database migrations applied
   - Check test database seed data

3. **Supabase connection errors:**
   - Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - Check Supabase dashboard for service status
   - Test connection: `curl https://your-project.supabase.co/rest/v1/`

4. **Performance degradation:**
   - Run Lighthouse audit
   - Check bundle sizes
   - Analyze Sentry performance traces

---

## 📞 Emergency Contacts

**Production Issues:**

- **On-call Engineer:** [Your contact info]
- **Supabase Support:** support@supabase.io
- **Sentry Support:** support@sentry.io

**Rollback Procedure:**

1. Revert deployment: `git revert <commit>` or restore previous Docker image
2. Clear CDN cache if applicable
3. Notify users if downtime > 5 minutes
4. Post-mortem after incident resolved

---

**Last Updated:** 2025-05-27  
**Version:** 1.0.0  
**Maintained by:** HEYS Development Team
