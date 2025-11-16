# ⚠️ ИНСТРУКЦИЯ: Telegram Mode Setup

## Проблема
Vite proxy НЕ работает когда mini-app открывается через Telegram (ngrok).
Нужен прямой доступ к API через отдельный ngrok туннель.

## Решение

### 1. Запусти API ngrok в отдельном терминале:
```bash
ngrok http 4001
```

**Скопируй URL**, например: `https://abc123-xyz.ngrok-free.dev`

### 2. Обнови `.env.telegram`:
```bash
VITE_API_URL=https://abc123-xyz.ngrok-free.dev
VITE_USE_CLIENT_MOCKS=false
```

### 3. Перезапусти mini-app:
```bash
pnpm run dev:tg-mini
```

### 4. Проверь в Telegram:
- @heys_curator_bot
- Нажми 🐛 Debug Console
- Должен быть лог: `HTTP Request url: https://abc123...ngrok-free.dev/api/...`

## Быстрый старт (3 терминала):

**Terminal 1: API Server**
```bash
pnpm run dev:api
```

**Terminal 2: API Ngrok**
```bash
ngrok http 4001
# Скопируй URL → обнови VITE_API_URL
```

**Terminal 3: Mini-app Ngrok**
```bash
ngrok http 3002 --domain=tressy-cotyledonoid-vergie.ngrok-free.dev
```

**Terminal 4: Mini-app Dev**
```bash
pnpm run dev:tg-mini
```

---

## Альтернатива: Моки (для быстрого теста)

```bash
# .env.telegram
VITE_USE_CLIENT_MOCKS=true
```

Это позволит протестировать UI без настройки API.
