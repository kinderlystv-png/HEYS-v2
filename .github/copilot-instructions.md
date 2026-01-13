---
description: HEYS v2 — AI Development Guide v4.0.0 (Compact)
applyTo: '**/*'
---

# HEYS v2 — AI Guide (Compact)

> 🇷🇺 Ответы · EN Code · v4.0.0

## 📚 Справочники (детали вынесены)

| Тема                                   | Файл                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| Архитектура, файловая структура        | [docs/dev/ARCHITECTURE.md](../docs/dev/ARCHITECTURE.md)           |
| Стиль кода, naming, запреты            | [docs/dev/CODE_STYLE.md](../docs/dev/CODE_STYLE.md)               |
| CSS/Tailwind/BEM правила               | [docs/dev/CSS_GUIDE.md](../docs/dev/CSS_GUIDE.md)                 |
| Storage паттерны (localStorage, cloud) | [docs/dev/STORAGE_PATTERNS.md](../docs/dev/STORAGE_PATTERNS.md)   |
| Частые ошибки и решения                | [docs/dev/COMMON_ERRORS.md](../docs/dev/COMMON_ERRORS.md)         |
| API Reference (YandexAPI, RPC)         | [docs/dev/API_REFERENCE.md](../docs/dev/API_REFERENCE.md)         |
| Промпты и аудит                        | [docs/dev/PROMPTS_AND_AUDIT.md](../docs/dev/PROMPTS_AND_AUDIT.md) |
| Модель данных (dayTot, normAbs и др.)  | [docs/DATA_MODEL_REFERENCE.md](../docs/DATA_MODEL_REFERENCE.md)   |
| Бизнес + продукт + чеклисты            | [docs/HEYS_BRIEF.md](../docs/HEYS_BRIEF.md)                       |
| Безопасность при деплое                | [docs/SECURITY_RUNBOOK.md](../docs/SECURITY_RUNBOOK.md)           |

---

## 🔑 Критические правила (6 шт)

1. **Отвечай по-русски**, код на английском
2. **НЕ ОТКАТЫВАЙ ФАЙЛЫ** без явного согласия (git checkout/restore/reset) —
   другие агенты могут работать параллельно
3. **HMR работает** — НЕ перезапускай сервер без причины
4. **Tailwind first** — inline styles запрещены, CSS только в
   `styles/heys-components.css`
5. **`pnpm build`** — только перед коммитом, HMR достаточно для проверки
6. **� ОБЯЗАТЕЛЬНО после КАЖДОЙ задачи** — секция "💡 Замечено в контексте"! Без
   этой секции ответ НЕПОЛНЫЙ. См.
   [PROMPTS_AND_AUDIT.md](../docs/dev/PROMPTS_AND_AUDIT.md#-проактивные-улучшения-обязательная-секция)

---

## ✅ Чеклист перед отправкой ответа

> ⚠️ **AI: проверь КАЖДЫЙ пункт перед отправкой!**

- [ ] Задача выполнена?
- [ ] Есть секция **"💡 Замечено в контексте"**? ← 🚨 ОБЯЗАТЕЛЬНО!
  - Quick Wins (5 мин)
  - Стратегические улучшения
  - Потенциальные баги
- [ ] Код на английском, ответ на русском?

---

## 🚫 Запрещено → ✅ Правильно

| 🚫 Запрещено             | ✅ Правильно                  |
| ------------------------ | ----------------------------- |
| `console.log` напрямую   | `HEYS.analytics.trackError()` |
| `localStorage.setItem`   | `U.lsSet('heys_key', val)`    |
| `select('*')` в Supabase | `select('id, name, ...')`     |
| Inline styles в JSX      | Tailwind классы               |
| `cloud.client.rpc()`     | `HEYS.YandexAPI.rpc()`        |

---

## 🌐 Ключевые URL

| Компонент       | URL                                                              |
| --------------- | ---------------------------------------------------------------- |
| **API Gateway** | `https://api.heyslab.ru`                                         |
| **PWA**         | `https://app.heyslab.ru`                                         |
| **Landing**     | `https://heyslab.ru`                                             |
| **Database**    | `rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net:6432/heys_production` |

---

## 🚀 Quick Start

```bash
pnpm install    # Bootstrap
pnpm dev        # Dev server → localhost:3001
pnpm build      # Production build (только перед коммитом!)
```

---

## 📁 Ключевые файлы

| Категория | Файлы                                                    |
| --------- | -------------------------------------------------------- |
| Core      | `heys_app_v12.js`, `heys_core_v12.js`, `heys_day_v12.js` |
| Auth      | `heys_auth_v1.js`, `heys_storage_supabase_v1.js`         |
| Analytics | `heys_advice_v1.js`, `heys_insulin_wave_v1.js`           |
| API       | `heys_yandex_api_v1.js`                                  |

---

**Полные детали** → см. справочники выше.
