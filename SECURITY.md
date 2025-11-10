# Security Policy

## Overview

HEYS v2 — это web-приложение для учета питания с фокусом на безопасность данных
пользователей. Проект использует Supabase для хранения данных с Row Level
Security (RLS) политиками и следует современным практикам безопасности.

## Supported Versions

Мы поддерживаем только последнюю версию HEYS v2 с security patches:

| Version | Supported          |
| ------- | ------------------ |
| 13.x    | :white_check_mark: |
| < 13.0  | :x:                |

## Reporting a Vulnerability

### Процедура отчета

Если вы обнаружили уязвимость безопасности, **НЕ создавайте публичный issue**.
Вместо этого:

1. **Email:** Отправьте описание на security@heys-app.example.com (замените на
   актуальный email)
2. **Приватный issue:** Создайте приватный security advisory в GitHub
3. **Telegram:** Свяжитесь с мейнтейнером напрямую

### Что включить в отчет

- **Описание уязвимости:** Подробное описание проблемы
- **Шаги воспроизведения:** Как воспроизвести проблему
- **Версия:** Версия HEYS и окружение (браузер, OS)
- **Потенциальный impact:** Какие данные/функциональность затронуты
- **Proof of Concept:** Если возможно, предоставьте PoC код

### Response Timeline

- **Подтверждение:** В течение 48 часов с момента получения
- **Анализ:** Оценка серьезности в течение 7 дней
- **Патч:** Критические уязвимости — в течение 14 дней, средние — 30 дней
- **Disclosure:** Публичное раскрытие после выпуска патча

## Security Features

### Authentication & Authorization

1. **Supabase Auth:**
   - JWT-based authentication
   - Email/password authentication с secure hashing
   - Session management с automatic token refresh
   - Cookie-based authentication для безопасности

2. **Row Level Security (RLS):**

   ```sql
   -- Пример RLS политики для таблицы clients
   CREATE POLICY "Users can access only their client data"
   ON clients FOR ALL
   USING (auth.uid() = user_id);
   ```

3. **Multi-tenancy:**
   - Изоляция данных между клиентами через `client_id`
   - Все запросы автоматически фильтруются по текущему клиенту

### Data Security

1. **Encryption:**
   - Data at rest: Encrypted в Supabase (AES-256)
   - Data in transit: HTTPS only, TLS 1.2+
   - localStorage: Sensitive data НЕ хранятся в plain text

2. **Input Validation:**
   - XSS prevention: React автоматически экранирует JSX
   - SQL Injection: Используем Supabase parameterized queries
   - Content Security Policy (CSP) в production build

3. **Sensitive Data Handling:**

   ```javascript
   // ❌ Плохо: Логирование sensitive data
   console.log('User password:', password);

   // ✅ Хорошо: No sensitive data в логах
   DEV.log('User authenticated:', { userId: user.id });
   ```

### Infrastructure Security

1. **Environment Variables:**
   - API keys и secrets в `.env` файлах (не в git)
   - Production secrets через environment variables
   - `.env.example` для документации

2. **Dependencies:**
   - Regular security audits: `pnpm audit`
   - Automated updates через Dependabot
   - Lockfile (`pnpm-lock.yaml`) для reproducible builds

3. **Build Security:**
   - Minification и obfuscation в production
   - Source maps только в hidden mode
   - `console.log` удаляются в production через Terser

## Best Practices for Developers

### Code Security

1. **Never commit secrets:**

   ```bash
   # Проверить перед коммитом
   git diff --staged | grep -i "password\|secret\|token\|key"
   ```

2. **Use DEV.log for debugging:**

   ```javascript
   // ✅ Автоматически отключается в production
   DEV.log('[DEBUG] User data:', userData);
   ```

3. **Validate user input:**

   ```typescript
   // ✅ Всегда валидируй и санитизируй
   const sanitized = validator.escape(userInput);
   ```

4. **Avoid eval and Function():**

   ```javascript
   // ❌ Опасно
   eval(userCode);

   // ✅ Безопасно
   JSON.parse(userJSON); // С try-catch
   ```

### Database Security

1. **Always use RLS policies:**
   - Каждая таблица должна иметь RLS policies
   - Тестируйте policies с разными пользователями
   - См. `database_clients_rls_policies.sql`

2. **Use parameterized queries:**

   ```typescript
   // ✅ Supabase автоматически параметризует
   const { data } = await supabase
     .from('products')
     .select('*')
     .eq('client_id', clientId);
   ```

3. **Limit data exposure:**

   ```typescript
   // ❌ Плохо: Возвращает все поля
   .select('*')

   // ✅ Хорошо: Только нужные поля
   .select('id, name, kcal100')
   ```

### API Security

1. **Rate Limiting:**
   - Supabase имеет встроенный rate limiting
   - Custom rate limiting для critical endpoints

2. **CORS Configuration:**
   - Whitelist только trusted origins
   - Настройка в Supabase dashboard

3. **Error Handling:**

   ```typescript
   // ❌ Плохо: Exposing internal details
   throw new Error(`SQL error: ${dbError}`);

   // ✅ Хорошо: Generic error messages
   throw new Error('Failed to fetch data');
   ```

## Security Testing

### Pre-deployment Checklist

См. `PRE_DEPLOY_CHECKLIST.md` для полного списка проверок.

**Ключевые проверки:**

- [ ] `pnpm audit` shows no critical/high vulnerabilities
- [ ] All environment variables configured
- [ ] RLS policies tested для всех таблиц
- [ ] CSP headers настроены
- [ ] HTTPS enabled (production)
- [ ] Error boundary catches production errors
- [ ] Sentry configured для error tracking

### Automated Security Scans

```bash
# Vulnerability scanning
pnpm audit

# Dependency check
pnpm outdated

# Type checking (catches некоторые security issues)
pnpm type-check

# Lint для security patterns
pnpm lint
```

### Manual Security Testing

1. **Authentication Testing:**
   - Пробуем доступ к данным других пользователей
   - Проверяем session expiration
   - Тестируем password reset flow

2. **Authorization Testing:**
   - Verify RLS policies работают корректно
   - Тестируем с разными ролями пользователей
   - Проверяем client isolation

3. **Input Validation:**
   - Пробуем XSS payloads
   - SQL injection attempts
   - CSRF attacks

## Incident Response

### В случае security incident:

1. **Немедленные действия:**
   - Изолировать affected системы
   - Rotate credentials/tokens
   - Notify affected users

2. **Investigation:**
   - Анализ logs (Supabase + Sentry)
   - Определить scope breach
   - Document timeline

3. **Remediation:**
   - Deploy security patch
   - Update dependencies
   - Implement additional safeguards

4. **Post-mortem:**
   - Document lessons learned
   - Update security policies
   - Improve monitoring

## Compliance & Standards

- **GDPR Considerations:** Если приложение используется в EU
- **Data Retention:** Настройка retention policies в Supabase
- **Audit Logs:** Supabase автоматически логирует database access

## Security Resources

### Documentation

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [React Security Best Practices](https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml)

### Internal Documentation

- `database_clients_rls_policies.sql` — RLS policies examples
- `PRE_DEPLOY_CHECKLIST.md` — Pre-deployment security checklist
- `.env.example` — Environment variables template

### Tools

- **Dependency scanning:** `pnpm audit`, Dependabot
- **Static analysis:** ESLint с security rules
- **Error tracking:** Sentry (production)
- **Performance monitoring:** `heys_simple_analytics.js`

## Contact

**Security Team:**

- Email: security@heys-app.example.com (replace with actual)
- GitHub: [@maintainer-username](https://github.com/maintainer-username)

**Bug Bounty Program:** Currently not available. Security research conducted
responsibly is appreciated.

---

**Last Updated:** 2025-05-27  
**Version:** 1.0.0
