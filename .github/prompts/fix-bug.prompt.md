---
description: Исследование и исправление бага в production
---

# Исправление бага

## Входные данные

- Описание: `{{bugDescription}}`
- Где воспроизводится: `{{reproduction}}`
- Критичность: `{{severity}}`

## Шаги диагностики

### 1. Воспроизведение

- Открыть `app.heyslab.ru` → DevTools → Console
- Воспроизвести баг по шагам
- Записать ошибки из консоли

### 2. Поиск причины

- Искать текст ошибки в коде: `grep -rn "error text" apps/web/`
- Проверить git log затронутых файлов: `git log --oneline -5 -- <file>`
- Проверить нет ли недавних изменений: `git diff HEAD~5 -- <file>`

### 3. Локализация

- Определить: это legacy (`heys_*.js`) или modern (`src/`)?
- Если RPC: проверить `yandex-cloud-functions/heys-api-rpc/index.js` allowlist
- Если данные: проверить формат в `localStorage` (через `U.lsGet()`)
- Если UI: проверить CSS конфликты в `styles/heys-components.css`

### 4. Фикс

- Минимальное изменение, без рефакторинга
- Логирование: `console.info('[HEYS.module] описание фикса')`
- Commit: `fix: краткое описание`

## Чеклист

- [ ] Баг воспроизведён локально
- [ ] Причина найдена и понятна
- [ ] Фикс минимальный
- [ ] Нет regression в смежном функционале
- [ ] `pnpm build` проходит
- [ ] Тест на production после деплоя
