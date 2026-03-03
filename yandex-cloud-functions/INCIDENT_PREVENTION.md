# 🛡️ Предотвращение инцидентов с production API

## 📋 Что произошло (11 февраля 2026)

**Проблема**: REST API начал отдавать 502 Bad Gateway после коммита `aee255cc`

**Root Cause**:

- GitHub Actions workflow `cloud-functions-deploy.yml` провалился (26s elapsed)
- Production функция `heys-api-rest` не была переразвёрнута после изменения
  `.ycignore` файлов
- Мониторинг не обнаружил проблему сразу (работал только 09:00-23:00 MSK)
- Ручной деплой через `./deploy-all.sh heys-api-rest` исправил ситуацию

**Impact**: Клиенты не могли сохранять данные (запись в `client_kv_store`) ~1
час

---

## ✅ Внедрённые защиты (11 февраля 2026)

### 1. **24/7 мониторинг** (было: только днём)

```yaml
# БЫЛО: каждые 5 мин, 09:00-23:00 MSK
- cron: '*/5 6-20 * * *'

# СТАЛО: каждые 15 мин, круглосуточно
- cron: '*/15 * * * *'
```

**Почему 15 мин вместо 5?** Баланс между быстрым обнаружением и снижением
нагрузки на API (96 vs 288 проверок в день).

### 2. **Автоматический re-deploy** при обнаружении проблем

```yaml
- name: Auto-redeploy on API failure
  if:
    failure() && (steps.rest.outcome == 'failure' || steps.rpc.outcome ==
    'failure')
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.actions.createWorkflowDispatch({
        workflow_id: 'cloud-functions-deploy.yml',
        ref: 'main',
        inputs: { function_name: 'all' }
      });
```

**Как работает:**

- Мониторинг обнаруживает 502 на REST/RPC
- Автоматически триггерит полный re-deploy всех функций
- Отправляет Telegram alert с уведомлением о запуске re-deploy

### 3. **Расширенный deployment verification**

Добавлены проверки:

- ✅ Health endpoint (было пропущено)
- ✅ RPC endpoint
- ✅ REST endpoint (критичный — именно он падал)
- ⏱️ Явный warmup timeout перед post-deploy проверкой

### 4. **Улучшенные Telegram alerts**

- 📊 HTTP коды всех endpoints
- 🔄 Статус auto-redeploy (TRIGGERED / не нужен)
- 📝 Чёткие инструкции для ручного вмешательства

---

## 🚀 Чек-лист перед коммитом изменений API

### Локальная проверка (ОБЯЗАТЕЛЬНО)

```bash
cd yandex-cloud-functions

# 1. Валидация .env (секреты, пароли)
./validate-env.sh

# 2. Health check BEFORE deploy
./health-check.sh

# 3. Deploy changed function
./deploy-all.sh heys-api-rest  # или ./deploy-all.sh для всех

# 4. Подождать 10 секунд (warmup)
sleep 10

# 5. Verify deployment
./health-check.sh
```

**Если `health-check.sh` показывает ❌ после деплоя — НЕ КОММИТИТЬ!**

### Проверка после push в main

```bash
# Мониторинг GitHub Actions
gh run watch  # или открой https://github.com/kinderlystv-png/HEYS-v2/actions

# Если workflow провален:
1. Проверь логи: gh run view <run_id> --log
2. Если CI/CD упал — пушни фикс и снова задеплой
3. Если проверка упала — локально запусти ./deploy-all.sh
```

---

## 🔧 Ручное восстановление (если auto-deploy не сработал)

### Сценарий 1: REST endpoint 502

```bash
cd yandex-cloud-functions
./deploy-all.sh heys-api-rest
sleep 10
./health-check.sh
```

### Сценарий 2: Все endpoints 502

```bash
cd yandex-cloud-functions
./deploy-all.sh  # Все функции
sleep 10
./health-check.sh --watch  # Continuous monitoring
```

### Сценарий 3: Rollback (откат к предыдущему коммиту)

```bash
git log --oneline -5  # Найди last working commit
git reset --hard <commit_hash>
cd yandex-cloud-functions
./deploy-all.sh
git push --force
```

⚠️ **ВНИМАНИЕ**: `--force` затрёт историю для других разработчиков!

---

## 📊 Мониторинг в реальном времени

### 1. GitHub Actions Dashboard

https://github.com/kinderlystv-png/HEYS-v2/actions

**Отслеживай**:

- ✅ `API Health Monitor` — каждые 15 мин
- 🚀 `Auto-deploy Cloud Functions` — при push в main

### 2. Локальный watch mode

```bash
cd yandex-cloud-functions
./health-check.sh --watch  # Проверка каждые 30 секунд
```

### 3. Telegram бот (если настроен)

При падении API автоматически приходит:

```
🚨 HEYS API Health Check Failed

❌ One or more endpoints down
🕐 Time: 2026-02-11 10:00:00 UTC

*Health*: 200
*RPC*: 200
*REST*: 502 ← ПРОБЛЕМА
*Auth*: 401

🔄 Auto-redeploy: TRIGGERED
📝 Action: Monitor workflow or run `./deploy-all.sh` manually
```

---

## 🐛 Типичные причины 502 Bad Gateway

### 1. **Timeout/Memory issues** (наиболее частая)

- Function не успела ответить за 30s (execution_timeout)
- Исчерпана память (128-256 MB)

**Решение**: Увеличить `--memory` и `--execution-timeout` в `deploy-all.sh`

### 2. **Неправильные environment variables**

- Пустой/неправильный `PG_PASSWORD`
- Отсутствует `JWT_SECRET`

**Решение**: `./validate-env.sh` перед деплоем

### 3. **Database connection issues**

- БД недоступна (Yandex Cloud maintenance)
- Connection pool exhausted

**Решение**: Проверить статус БД в Yandex Cloud Console

### 4. **Cold start timeout**

- Функция не успела прогреться к моменту ранней проверки
- Решение: всегда ждать warmup перед `health-check.sh`

### 5. **Broken dependencies** (редко)

- Новая версия Node.js API сломала код
- Отсутствует package в `package.json`

**Решение**: Проверить логи функции в Yandex Cloud Console

---

## 📝 Извлечённые уроки

### ✅ Что сработало

1. Ручной деплой через `./deploy-all.sh` быстро исправил проблему
2. `health-check.sh` чётко показал, какой endpoint сломан
3. Логи в консоли браузера помогли быстро диагностировать 502

### ❌ Что не сработало

1. CI/CD не обнаружил проблему при деплое (проверка была недостаточной)
2. Мониторинг работал только днём — ночные проблемы могли остаться незамеченными
3. Нет автоматического rollback при провале деплоя

### 🔄 Что улучшено

1. ✅ 24/7 мониторинг вместо 09:00-23:00
2. ✅ Автоматический re-deploy при обнаружении 502
3. ✅ Расширенные проверки в CI/CD (Health + RPC + REST)
4. ✅ Единый warmup в runbook/скриптах/CI
5. ✅ Улучшенные Telegram alerts с HTTP кодами

---

## 🎯 Метрики надёжности

**Целевые показатели**:

- 🎯 Uptime: 99.9% (допустимо 43 мин downtime в месяц)
- ⚡ MTTR (Mean Time To Recovery): < 15 мин
- 🔔 MTTD (Mean Time To Detection): < 30 мин

**Текущий инцидент**:

- ⏱️ Downtime: ~1 час (REST endpoint)
- 🔔 Detection: мануальная (из браузера)
- ⚡ Recovery: ~2 мин (после запуска `./deploy-all.sh`)

**После улучшений (прогноз)**:

- 🔔 Detection: < 15 мин (автомониторинг каждые 15 мин)
- ⚡ Recovery: < 10 мин (автоматический re-deploy + warmup)
- 🎯 Uptime: 99.95%+ (благодаря auto-healing)

---

## 🔗 Полезные ссылки

- [MONITORING_QUICK_REF.md](./MONITORING_QUICK_REF.md) — быстрые команды для
  мониторинга
- [DEPLOYMENT_GUIDE.md](../docs/DEPLOYMENT_GUIDE.md) — полный процесс деплоя
- [GitHub Actions](https://github.com/kinderlystv-png/HEYS-v2/actions) — статус
  CI/CD
- [Yandex Cloud Functions Console](https://console.yandex.cloud/folders/b1gnv1a4q8i6de6atl6n/serverless/functions)
  — логи функций
