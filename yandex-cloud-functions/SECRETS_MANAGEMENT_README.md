# 🔐 Централизованное управление секретами для Cloud Functions

## Проблема

- Пароли и секреты разбросаны по разным функциям
- При изменении пароля нужно обновлять каждую функцию вручную
- Риск опечаток и несоответствия секретов
- Сложно отследить, где какой пароль используется

## Решение

✅ **Централизованный `.env` файл** + deployment скрипт

---

## 🚀 Быстрый старт

### 1. Настройка секретов (ОДИН РАЗ)

```bash
cd yandex-cloud-functions

# Скопировать шаблон
cp .env.example .env

# Отредактировать .env — заполнить актуальные значения
nano .env
```

### 2. Деплой функций

```bash
# 🚀 Деплой ВСЕХ функций с актуальными секретами
./deploy-all.sh

# 🎯 Деплой одной функции
./deploy-all.sh heys-api-leads
./deploy-all.sh heys-api-rpc
./deploy-all.sh heys-api-auth
```

---

## 📁 Структура

```
yandex-cloud-functions/
├── .env                    # ✅ Актуальные секреты (НЕ в git!)
├── .env.example            # 📝 Шаблон для команды
├── deploy-all.sh           # 🚀 Централизованный deployment
├── heys-api-rpc/
├── heys-api-rest/
├── heys-api-auth/
├── heys-api-leads/
├── heys-api-sms/
└── heys-api-health/
```

---

## 🔐 Что в .env

```bash
# PostgreSQL (главная БД)
PG_PASSWORD=heys007670

# JWT / Session (обязательно для RPC/Auth)
JWT_SECRET=your_jwt_secret_here
SESSION_SECRET=your_session_secret_here

# Telegram (уведомления)
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx

# SMS (sms.ru)
SMS_API_KEY=xxx
```

---

## ⚠️ Безопасность

1. ✅ `.env` **УЖЕ В .gitignore** — никогда не попадет в git
2. ✅ Скрипт автоматически проверяет наличие всех обязательных переменных
3. ✅ Пароль маскируется в выводе: `heys...7670`
4. ❌ **НЕ коммитить** `.env` файл
5. ❌ **НЕ передавать** `.env` через мессенджеры (только через secure channels)

---

## 🔄 Как обновить пароль БД

**СТАРЫЙ СПОСОБ** (❌ много шагов, risk of errors):

```bash
# 1. Deploy heys-api-rpc с новым паролем
yc serverless function version create --function-name heys-api-rpc --environment PG_PASSWORD=NEW_PASSWORD ...

# 2. Deploy heys-api-rest с новым паролем
yc serverless function version create --function-name heys-api-rest --environment PG_PASSWORD=NEW_PASSWORD ...

# 3. Deploy heys-api-auth... (забыли?)
# 4. Deploy heys-api-leads... (опечатка в пароле?)
```

**НОВЫЙ СПОСОБ** (✅ один командa):

```bash
# 1. Обновить пароль в .env
nano .env
# PG_PASSWORD=NEW_PASSWORD

# 2. Деплой ВСЕХ функций разом
./deploy-all.sh

# ✅ Гарантия: все функции получат одинаковый пароль!
```

---

## 🎯 Примеры использования

### Деплой после обновления пароля БД

```bash
# 1. Изменить пароль в .env
echo 'PG_PASSWORD=new_secure_password' >> .env

# 2. Деплой всех функций, использующих БД
./deploy-all.sh heys-api-rpc
./deploy-all.sh heys-api-rest
./deploy-all.sh heys-api-auth
./deploy-all.sh heys-api-leads

# Или одной командой:
./deploy-all.sh
```

### Деплой после обновления Telegram токена

```bash
# 1. Обновить токен в .env
nano .env  # TELEGRAM_BOT_TOKEN=new_token

# 2. Деплой функций, использующих Telegram
./deploy-all.sh heys-api-leads
./deploy-all.sh heys-api-auth
```

---

## 📊 Какие функции используют какие секреты

| Функция         | PG  | JWT/Session | Telegram | SMS |
| --------------- | --- | ----------- | -------- | --- |
| heys-api-rpc    | ✅  | ✅          | ❌       | ❌  |
| heys-api-rest   | ✅  | ❌          | ❌       | ❌  |
| heys-api-auth   | ✅  | ✅          | ✅       | ❌  |
| heys-api-leads  | ✅  | ❌          | ✅       | ❌  |
| heys-api-sms    | ❌  | ❌          | ❌       | ✅  |
| heys-api-health | ❌  | ❌          | ❌       | ❌  |

---

## 🔮 Будущее: Yandex Lockbox

**Следующий шаг**: Миграция на Yandex Lockbox (managed secrets service)

Преимущества:

- ✅ Ротация секретов без правки `.env` и без плейнтекста в env функций (⚠️ но
  **не** без redeploy: тёплые контейнеры кешируют overlay до рестарта — см.
  LOCKBOX_MIGRATION_GUIDE.md → «Ротация секретов»)
- ✅ Audit trail всех изменений
- ✅ Granular access control через IAM
- ✅ Версионирование секретов

📖 См. [LOCKBOX_MIGRATION_GUIDE.md](LOCKBOX_MIGRATION_GUIDE.md)

---

## 🆘 Troubleshooting

### Ошибка: `.env file not found`

```bash
cp .env.example .env
nano .env  # Заполнить актуальные значения
```

### Ошибка: `PG_PASSWORD is not set`

```bash
# Проверить .env
cat .env | grep PG_PASSWORD

# Должно быть:
# PG_PASSWORD=heys007670
```

### Проверить текущие пароли во всех функциях

```bash
for func in heys-api-rpc heys-api-rest heys-api-auth heys-api-leads; do
  echo "=== $func ==="
  version_id=$(yc serverless function version list --function-name $func --limit 1 --format json | jq -r '.[0].id')
  yc serverless function version get $version_id --format json | jq -r '.environment.PG_PASSWORD'
done
```

---

## ✅ Checklist: Первая настройка

- [ ] Скопировать `.env.example` → `.env`
- [ ] Заполнить все обязательные переменные в `.env`
- [ ] Убедиться, что `.env` в `.gitignore`
- [ ] Протестировать: `./deploy-all.sh heys-api-health`
- [ ] Если OK — деплой остальных: `./deploy-all.sh`
- [ ] Проверить работу: форма заявки на https://heyslab.ru/#trial

---

**Создано**: 10 февраля 2026  
**Автор**: GitHub Copilot + Anton  
**Цель**: Стабилизировать управление секретами до миграции на Lockbox
