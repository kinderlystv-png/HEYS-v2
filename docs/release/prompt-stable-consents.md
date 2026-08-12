# prompt-stable-consents

**Цель.** На `stable.heyslab.ru` вход не должен упираться в экран согласий.
Экран согласий остаётся доступным для эталонных скринов, но в readonly не гейтит
приложение и ничего не пишет. Плашка: постоянное напоминание, что это
замороженная копия и согласия не записываются.

**Контекст (проверено 12.08.2026).**

- `stable.heyslab.ru/version.json` → `hash: 36df9ce3`,
  `buildTime: 2026-08-11T13:10:56Z` (сборка **до** health-minimization).
- `app.heyslab.ru/version.json` → `hash: a7fd195a` (прод **не** откатываем).
- 12.08 purge отозвал `health_data` у клиентов. Stable (старая сборка) видит
  revoked / outdated required consent → `shouldBlockForConsents` → ConsentScreen
  → `log_consents*` → блок `READONLY_MODE` → тупик с текстом «Только чтение
  (замороженная копия)» (скрин владельца).
- Readonly уже правильный и **не ломать**:
  - hostname gate в `apps/web/index.html` (~107–121): только `stable.heyslab.ru`
    / `stable-heyslab-ru.website.yandexcloud.net`
  - белый список RPC + блок non-GET REST в `apps/web/heys_yandex_api_v1.js`
    (~37–62, ~601–603, ~696–698)
  - баннер в шапке `heys_app_shell_v1.js` (~3281–3286)

**Почему класс, а не разовый bypass.** После legal 1.11 версии документов
поднимутся снова — тот же тупик. Лечить гейт в readonly целиком.

---

## Scope

### 1. Код (в `main` — на проде инертен: `__HEYS_READONLY_MODE__` выключен)

1. **Гейт входа.** В `apps/web/heys_app_gate_flow_v1.js` (`buildConsentGate`,
   ~2741–2742 и блок ~2856+): если `window.__HEYS_READONLY_MODE__?.enabled`, то
   `shouldBlockForConsents` **не** блокирует вход в приложение. ConsentScreen
   **не** становится единственным экраном после PIN.
2. **Экран согласий остаётся открываемым** (настройки / deep-link / ручной вход
   на экран) — с него снимают эталон. На экране постоянная плашка: «Замороженная
   копия · согласия не записываются» (или близкая формулировка в том же тоне,
   что баннер шапки).
3. **Кнопка «Продолжить» / принятие** на ConsentScreen в readonly:
   - **не** вызывает `log_consents` / `log_consents_by_session` / любые пишущие
     RPC;
   - ведёт дальше так же, как успешный `onComplete` (снимает локальный gate
     state: `setNeedsConsent(false)`, `setMustBlockReconsent(false)`, чистит
     `outdatedTypes` — по существующему пути ~2863+).
4. **Не трогать** whitelist RPC / REST block / hostname gate / DEMO_MODE.
5. **Не менять** продуктовый consent-flow на `app.heyslab.ru`.

Точки для поиска (не обязательно единственные):

- `heys_app_gate_flow_v1.js` — `shouldBlockForConsents`, `buildConsentGate`
- `heys_consents_v1.js` / ConsentScreen — submit / `log_consents*`
- `heys_app_runtime_effects_v1.js` — `needsConsent` dispatch (если gate
  поднимается до ConsentScreen)

### 1a. Тупики того же класса — проверить заодно

Экран согласий пойман по симптому. Механизм ошибки общий: продвижение по флоу
зависит от успешной записи, а запись в readonly заблокирована. Поэтому пройти
взглядом остальные точки, где возможно то же самое, — первичная инициализация
профиля, онбординг после первого входа, чек-ин, любая «отметка, что шаг
пройден». Нашёл — назови, не чини молча в этой же задаче. Не нашёл — так и
напиши: «проверил, других нет» тоже результат.

### 2. Тесты

Минимум один focused unit/integration:

- при `__HEYS_READONLY_MODE__ = { enabled: true }` и `needsConsent` / outdated
  required — gate **не** держит на ConsentScreen как блокер входа;
- submit согласий в readonly **не** зовёт пишущий RPC (mock `YandexAPI.rpc` /
  аналог).

Ориентиры: `apps/web/__tests__/consent-gate-flow.test.js`,
`first-login-onboarding-guardrails.test.js`.

### 3. Dual publish (критично)

Правка в одном только `main` **не** попадёт на stable: копия заморожена на
`36df9ce3`. Если пересобрать stable от текущего `main` — получится новый дизайн
и пропадёт эталон.

Нужно:

1. Коммит в `main` (source-only ок).
2. **Отдельно** cherry-pick того же фикса на базу `36df9ce3` (или эквивалентный
   патч поверх того дерева).
3. Пересобрать и выложить **только** бакет/хост `stable.heyslab.ru`, **не**
   `heys-app` / `app.heyslab.ru`.
4. Smoke: `stable.heyslab.ru/version.json` — новый hash **поверх** линии
   `36df9ce3` (не `a7fd195a` и не текущий app).
5. Smoke UI: PIN-вход на stable → **не** застревает на согласиях; экран согласий
   открывается; плашка видна; «Продолжить» уводит в приложение без ошибки
   READONLY на `log_consents`.

Если штатного скрипта выкладки stable в репо нет — в отчёте явно: команды,
которыми выложил, и что `app.heyslab.ru/version.json` **не** изменился. В
`deploy-yandex.yml` перечислены четыре бакета, stable среди них нет: выкладка
ручная, и её команды надо записать, а не держать в голове.

**Если сборка на базе `36df9ce3` не воспроизводится** — зависимости, хеши
бандлов, что угодно — остановись и скажи. Не пересобирай stable из текущего
`main`, чтобы «хотя бы что-то выложить»: это ровно та потеря, ради
предотвращения которой задача и написана.

### 4. Документация (только если уже трогаешь release-файлы по правилу

владельца)

Владелец — единственный писатель `docs/release/release-plan.md` /
`handoff-prompts.md`. Исполнитель **не** правит их статусы сам: в отчёте текстом
«готово A5 / prompt-stable-consents», владелец внесёт.

---

## Не делать

- Откат `app.heyslab.ru` к stable.
- Skip-deploy / отключение auto-deploy на `main`.
- Пересборку stable из текущего `main` целиком.
- Ослабление write-block readonly (whitelist → blacklist, query-param для
  режима, разрешение `log_consents*` в readonly).
- Разовый hardcode «пропустить health_data» без общего readonly bypass.

---

## Критерий готово

1. На `stable.heyslab.ru` после PIN можно войти в приложение при отозванных /
   устаревших обязательных согласиях.
2. Экран согласий открывается, плашка про заморозку видна, запись согласий не
   уходит в API.
3. `app.heyslab.ru/version.json` после выкладки stable **тот же**, что до задачи
   (сейчас ориентир `a7fd195a`, перепроверить перед/после).
4. Тест(ы) зелёные; brief в чат владельцу.

**Push / deploy app:** только по прямой команде владельца. Выкладка
**stable-бакета** — часть этой задачи (это не прод-клиентский bucket).
