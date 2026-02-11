# 📢 Настройка Telegram Alerts для HEYS API Monitor

## Статус

⚠️ **Опционально** — мониторинг работает и без Telegram, но уведомления не будут
приходить.

**Текущая проблема**: GitHub Secrets не содержат `TELEGRAM_BOT_TOKEN` или
`TELEGRAM_CHAT_ID`, поэтому алерты не отправляются (401 Unauthorized).

---

## 🤖 Как настроить Telegram Alerts

### Шаг 1: Создать Telegram бота

1. Открой Telegram и найди [@BotFather](https://t.me/botfather)
2. Отправь команду `/newbot`
3. Следуй инструкциям:
   - Введи имя бота (например: `HEYS API Monitor Bot`)
   - Введи username (например: `heys_api_monitor_bot`)
4. Получи **API token** (формат: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
5. Сохрани токен — он понадобится для GitHub Secrets

### Шаг 2: Получить Chat ID

**Вариант 1: Personal chat**

```bash
# 1. Отправь боту любое сообщение (например: /start)
# 2. Получи chat_id через API:
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates

# 3. Найди в ответе:
{
  "update_id": 123456789,
  "message": {
    "chat": {
      "id": 1393964759,  ← Это твой chat_id
      ...
    }
  }
}
```

**Вариант 2: Group chat**

1. Создай группу в Telegram
2. Добавь бота в группу
3. Сделай бота администратором (права: отправка сообщений)
4. Отправь в группу любое сообщение
5. Получи chat_id:

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
# Найди "id" в "chat" (будет отрицательным для групп, например: -1001234567890)
```

### Шаг 3: Добавить секреты в GitHub

1. Открой https://github.com/kinderlystv-png/HEYS-v2/settings/secrets/actions
2. Нажми **New repository secret**
3. Добавь 2 секрета:

| Name                 | Value                     | Example                                     |
| -------------------- | ------------------------- | ------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Токен из @BotFather       | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `TELEGRAM_CHAT_ID`   | Chat ID (твой или группы) | `1393964759` или `-1001234567890`           |

4. **Save** оба секрета

### Шаг 4: Проверить работу

```bash
# Локальная проверка (подмени токены):
export TELEGRAM_BOT_TOKEN="your_token"
export TELEGRAM_CHAT_ID="your_chat_id"

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=✅ HEYS API Monitor Telegram TEST" \
  -d "parse_mode=Markdown"

# Ожидаемый ответ:
{"ok":true,"result":{...}}
```

### Шаг 5: Триггернуть тестовый алерт

```bash
# Запусти мониторинг вручную через GitHub Actions:
gh workflow run api-health-monitor.yml

# Или через web UI:
# https://github.com/kinderlystv-png/HEYS-v2/actions/workflows/api-health-monitor.yml
# → "Run workflow" → "Run workflow"
```

Если API здоров — алерт не придёт (silent success).  
Если API падает — придёт сообщение:

```
🚨 HEYS API Health Check Failed

❌ One or more endpoints down
🕐 Time: 2026-02-11 10:35:00 UTC

*Health*: 200
*RPC*: 502 ← ПРОБЛЕМА
*REST*: 200
*Auth*: 401

🔄 Auto-redeploy: TRIGGERED
📝 Action: Monitor workflow or run `./deploy-all.sh` manually
```

---

## 🔒 Безопасность

### ✅ Best Practices

1. **НЕ коммить токены в Git** — всегда используй GitHub Secrets
2. **Ревокни токен** если он скомпрометирован: @BotFather → `/mybots` → выбери
   бота → API Token → Revoke Token
3. **Ограничь права бота** — давай только send_messages permission
4. **Используй приватную группу** — не публичные чаты

### ❌ НЕ делай так:

```yaml
# ❌ НИКОГДА не хардкодь токены:
env:
  TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57"  # ПЛОХО!

# ✅ Всегда используй secrets:
env:
  TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}  # ХОРОШО!
```

---

## 🧪 Тестирование

### Локальный тест (с реальными токенами)

```bash
cd /Users/poplavskijanton/HEYS-v2/yandex-cloud-functions

# Создай временный .env для теста (НЕ коммитить!)
cat > .telegram-test.env << EOF
TELEGRAM_BOT_TOKEN="твой_токен"
TELEGRAM_CHAT_ID="твой_chat_id"
EOF

# Загрузи и протестируй:
source .telegram-test.env

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=🧪 HEYS API Monitor Test Alert" \
  -d "parse_mode=Markdown"

# Удали файл после теста:
rm .telegram-test.env
```

### GitHub Actions тест

1. Создай фейковый провал: закомментируй Health endpoint в
   `api-health-monitor.yml`
2. Закоммить, пушни
3. Дождись алерта в Telegram через ~15 мин (scheduled run)
4. Откатись к рабочей версии

---

## 🚫 Если НЕ хочешь настраивать Telegram

**Мониторинг работает и без Telegram!** Просто проверяй статус вручную:

### Вариант 1: GitHub Actions UI

https://github.com/kinderlystv-png/HEYS-v2/actions/workflows/api-health-monitor.yml

### Вариант 2: Локальный watch

```bash
cd yandex-cloud-functions
./health-check.sh --watch  # Проверка каждые 30 секунд
```

### Вариант 3: GitHub CLI

```bash
# Статус последнего запуска:
gh run list --workflow=api-health-monitor.yml --limit 1

# Логи, если провалился:
gh run view <run_id> --log
```

---

## 📊 Формат алертов

### Успешный запуск

```
# No alert (silent success)
```

### Провал API

```
🚨 HEYS API Health Check Failed

❌ One or more endpoints down
🕐 Time: 2026-02-11 10:35:00 UTC
🔗 [View Logs](https://github.com/kinderlystv-png/HEYS-v2/actions/runs/123456)

*Health*: 200
*RPC*: 502
*REST*: 200
*Auth*: 401

🔄 Auto-redeploy: TRIGGERED
📝 Action: Monitor workflow or run `./deploy-all.sh` manually if redeploy fails
```

### Успешный деплой (из `cloud-functions-deploy.yml`)

```
✅ Cloud Functions Deployed

📦 Commit: `feat: add new feature`
👤 Author: kinderlystv-png
🕐 Time: 10:30 UTC
🔗 [View Run](https://github.com/kinderlystv-png/HEYS-v2/actions/runs/123456)
```

---

## 🔗 Полезные ссылки

- **Telegram Bot API Docs**: https://core.telegram.org/bots/api
- **@BotFather**: https://t.me/botfather
- **GitHub Secrets**:
  https://github.com/kinderlystv-png/HEYS-v2/settings/secrets/actions
- **Workflow файл**:
  [.github/workflows/api-health-monitor.yml](../.github/workflows/api-health-monitor.yml)

---

## 💬 FAQ

**Q: Нужен ли Telegram для работы мониторинга?**  
A: Нет! Мониторинг работает и без Telegram. Просто алерты не будут приходить.

**Q: Можно использовать существующего бота?**  
A: Да, главное — чтобы у него был API token и доступ к chat.

**Q: Почему алерты не приходят в группу?**  
A: Убедись, что бот добавлен в группу И сделан администратором с правом отправки
сообщений.

**Q: Как отключить Telegram alerts?**  
A: Удали `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` из GitHub Secrets. Workflow
продолжит работать, но алерты не будут отправляться.

**Q: Можно настроить несколько получателей?**  
A: Да, создай группу и добавь туда всех нужных людей + бота.

---

**Updated**: 11 февраля 2026  
**Status**: ⚠️ Опционально (мониторинг работает без Telegram)
