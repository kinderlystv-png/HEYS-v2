# HEYS Development Reference

> Детальная документация для AI-агентов и разработчиков

## 📚 Reference Files

| Файл                       | Содержание                                |
| -------------------------- | ----------------------------------------- |
| [CODE_STYLE.md](./CODE_STYLE.md)           | Запрещено/Правильно, commit style         |
| [ARCHITECTURE.md](./ARCHITECTURE.md)       | Структура проекта, Yandex Cloud           |
| [CSS_GUIDE.md](./CSS_GUIDE.md)             | Tailwind, BEM, NO-TOUCH zones             |
| [STORAGE_PATTERNS.md](./STORAGE_PATTERNS.md) | localStorage, cloud sync, PIN auth      |
| [COMMON_ERRORS.md](./COMMON_ERRORS.md)     | E001-E007, RTR, debugging                 |
| [API_REFERENCE.md](./API_REFERENCE.md)     | RPC allowlist, YandexAPI, security        |
| [PROMPTS_AND_AUDIT.md](./PROMPTS_AND_AUDIT.md) | Промпты, аудит, тесты                 |

## 📊 Data & Business

| Файл                                              | Содержание                        |
| ------------------------------------------------- | --------------------------------- |
| [DATA_MODEL_REFERENCE.md](../DATA_MODEL_REFERENCE.md) | dayTot, normAbs, модели данных |
| [HEYS_BRIEF.md](../HEYS_BRIEF.md)                 | Бизнес + продукт + техника        |
| [SECURITY_RUNBOOK.md](../SECURITY_RUNBOOK.md)     | Rate-limit, GRANT/REVOKE          |

---

## 🔑 Quick Rules

1. **Отвечай по-русски**, код на английском
2. **HMR работает** — НЕ перезапускай сервер
3. **🚨 НИКОГДА НЕ ОТКАТЫВАЙ ФАЙЛЫ** без явного согласия
4. `pnpm build` — только **перед коммитом**
5. `git commit/push` — только **по запросу**

---

## 🏗️ Key Files

| Категория         | Файлы                                                              |
| ----------------- | ------------------------------------------------------------------ |
| **Core**          | `heys_app_v12.js`, `heys_core_v12.js`, `heys_day_v12.js`           |
| **Auth**          | `heys_auth_v1.js`, `heys_storage_supabase_v1.js`                   |
| **Subscriptions** | `heys_subscriptions_v1.js`, `heys_morning_checkin_v1.js`           |
| **Analytics**     | `heys_advice_v1.js`, `heys_insulin_wave_v1.js`, `heys_cycle_v1.js` |
| **Legal**         | `heys_consents_v1.js`, `heys_sms_v1.js`, `docs/legal/`             |
| **Landing**       | `apps/landing/` (Next.js 14, YandexAPI, Telegram)                  |
| **Cloud**         | `yandex-cloud-functions/heys-api-*` (7 функций)                    |
