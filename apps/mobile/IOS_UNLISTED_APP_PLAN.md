# HEYS iOS Unlisted App Implementation Runbook

Дата: 2026-07-01

## Суть

Для iOS идем не через рассылку `.ipa`, а через нормальное приложение в App
Store: собираем HEYS mobile shell на Expo/React Native, добавляем app-like
функции поверх веб-продукта, проходим App Review, запрашиваем у Apple unlisted
distribution и даем клиентам прямую ссылку на App Store.

Unlisted link решает дистрибуцию, но не приватность. Приватность и права доступа
должны оставаться внутри HEYS: auth, PIN/session, роли, client/curator context и
серверные проверки.

## Решение

Выбранный релизный канал:

- iOS production: App Store + unlisted app link.
- iOS beta: TestFlight, только для тестирования.
- Android preview: APK/AAB контур остается отдельным и не является моделью для
  iOS.

Отклоненные каналы:

| Канал                             | Почему не базовый путь                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `.ipa` файлом клиенту             | Не работает как Android APK: нужна подпись, provisioning и доверенный способ установки.                   |
| Ad Hoc                            | Подходит для ограниченного тестирования на зарегистрированных устройствах, не для клиентского production. |
| TestFlight                        | Beta-канал, не постоянная поставка клиентам.                                                              |
| Enterprise                        | Для внутренних сотрудников организации, не для внешних клиентов HEYS.                                     |
| Apple Business Manager Custom App | Хорош для B2B-организаций, но требует ABM-процесса у клиента; можно рассмотреть позже.                    |

## Текущий контур в репозитории

Факты по текущему состоянию `apps/mobile`:

- Приложение уже существует как Expo/React Native app.
- Навигация построена через `expo-router`.
- Есть `app.json`, `eas.json`, `.easignore`, Android-профили и базовые assets.
- iOS `bundleIdentifier`, `buildNumber`, `scheme` и Face ID usage description
  заданы.
- EAS-профили содержат iOS preview/production path.
- Текущий UI уже не каркас: есть boot flow, login, WebView shell и settings.
- Зависимости для controlled WebView, secure token storage, биометрии, network
  state, app metadata и push объявлены в `package.json`.
- Backend source содержит DB-backed one-time mobile session exchange routes для
  WebView cookie bridge; migration, function deploy и API Gateway update
  применены 2026-07-02.

Вывод: новый mobile-проект не нужен; кодовая база iOS release shell собрана в
`apps/mobile`, а внешний релизный контур остаётся в Apple/App Store Connect.

## Релизная архитектура

### 1. Native shell

Native shell - это не "обертка ради иконки", а слой приложения, который отвечает
за поведение iOS-продукта:

- старт приложения;
- splash/loading;
- восстановление сессии;
- login/logout;
- offline/error/maintenance states;
- settings/account;
- support/privacy/terms;
- account deletion entry point;
- app version/build diagnostics;
- controlled WebView container.

Этот слой нужен и пользователю, и App Review: приложение должно выглядеть как
app, а не как вкладка Safari.

### 2. Controlled WebView

WebView допустим для основного HEYS-интерфейса, если он контролируемый:

- открывает только allowlist HEYS-доменов;
- не показывает пользователю общий адресный браузер;
- перехватывает внешние ссылки и открывает их явно через system browser;
- не позволяет произвольные навигации на чужие домены;
- умеет показать native offline/error state;
- получает auth через безопасный session exchange, а не через long-lived token в
  query/localStorage;
- не смешивает client/curator/PIN контексты.

Планируемая зависимость: `react-native-webview`.

### 3. Auth и security

Предпочтительный контракт:

1. Native login получает mobile session у HEYS API.
2. Refresh/access token хранится в iOS Keychain через `expo-secure-store`.
3. Для WebView native app запрашивает у backend короткоживущий one-time web
   session exchange token.
4. WebView открывает HEYS URL для mobile session exchange.
5. Server выставляет HttpOnly/Secure cookie или другой web-session механизм и
   редиректит в приложение.
6. Logout чистит native secure storage, web cookies/session и серверную сессию.

Чего избегать:

- long-lived token в URL;
- token в WebView localStorage;
- token injection через JS как основной механизм;
- доверие к `client_id`, пришедшему из браузера/native слоя, как к authority;
- silent login без понятного logout.

Планируемые зависимости:

- обязательная: `expo-secure-store`;
- optional для Face ID/Touch ID unlock: `expo-local-authentication`.

Биометрия не заменяет серверную авторизацию. Она только защищает локальный
доступ к уже выданной сессии.

### 4. Deep links

Deep links нужны для app-like UX и будущих клиентских сценариев:

- открыть приглашение клиента;
- открыть экран входа/восстановления;
- открыть конкретный client/session context после auth;
- вернуться из email/payment/support flow.

Минимум для первого релиза:

- custom scheme, например `heys://`;
- universal links для production-домена, если домен и Apple Associated Domains
  готовы;
- route guard: deep link не должен открывать клиентские данные без auth.

`expo-linking` уже есть в зависимостях, но routing contract еще надо описать и
реализовать.

### 5. Offline states

Offline в первом iOS-релизе не означает "полный офлайн-редактор". Минимальный
релизный уровень:

- app стартует без белого экрана;
- показывает понятное native offline состояние;
- дает retry;
- не создает локальные writes без явного sync-контракта;
- не показывает устаревшие данные как актуальные, если это может навредить
  решению пользователя.

Полный offline-write режим - отдельная задача, потому что он затрагивает sync,
конфликты и client-scoped storage.

### 6. Push notifications

Push добавлять только при понятном продуктовом сценарии. "Чтобы было нативно" -
плохая причина.

Допустимые сценарии для первого или второго релиза:

- куратор обновил план/комментарий;
- клиенту назначено действие;
- важное напоминание по agreed schedule;
- сервисное уведомление о доступе/сессии.

Если push входит в релиз, нужны:

- `expo-notifications`;
- APNs credentials;
- backend registration device token;
- user consent/settings;
- unsubscribe/disable flow;
- privacy policy update;
- TestFlight smoke на реальном устройстве.

Если сценарий не выбран, push остается в backlog и не нужен для первого App
Review.

## App-like value checklist

Этот checklist нужен, чтобы снизить риск отказа по Apple guideline 4.2.

| Требование              | Минимум для HEYS iOS                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| Splash/icon             | Production icon, splash, display name без `dev`.                            |
| Native state management | Loading, restoring session, offline, maintenance, forbidden navigation.     |
| Controlled navigation   | WebView allowlist, external link handling, no address bar/browser behavior. |
| Auth                    | Native login/session restore/logout, secure token storage.                  |
| Deep links              | `heys://` и/или universal links с auth guard.                               |
| Account area            | Settings, support, privacy, account deletion entry point.                   |
| Security                | Keychain/SecureStore, no long-lived tokens in URL/localStorage.             |
| Optional biometrics     | Face ID/Touch ID unlock for existing local session.                         |
| Optional push           | Only with a real user-facing notification scenario.                         |
| Reviewability           | Demo account, review notes, screenshots showing real app usage.             |

## Целевые файлы и модули

Текущие файлы, которые likely будут изменены при реализации:

| Path                                     | Роль                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/mobile/package.json`               | Добавить mobile dependencies и scripts при необходимости.                                    |
| `apps/mobile/app.json`                   | iOS bundle id, build number, scheme, associated domains, permissions, icons/splash metadata. |
| `apps/mobile/eas.json`                   | iOS preview/production profiles и submit config.                                             |
| `apps/mobile/app/_layout.tsx`            | Root navigation, auth guards, app-level providers.                                           |
| `apps/mobile/app/index.tsx`              | Entry routing: restore session -> web app или login.                                         |
| `apps/mobile/app/auth/login.tsx`         | Native login flow или временная точка входа.                                                 |
| `apps/mobile/src/features/auth/api.ts`   | Auth API contract, token/session exchange.                                                   |
| `apps/mobile/src/services/api-client.ts` | API base URL, request errors, auth headers.                                                  |
| `apps/mobile/assets/*`                   | Production icon/splash/adaptive assets.                                                      |

Новые planned modules:

| Planned path                              | Назначение                                              |
| ----------------------------------------- | ------------------------------------------------------- |
| `apps/mobile/app/web/index.tsx`           | Controlled WebView screen.                              |
| `apps/mobile/app/settings/index.tsx`      | Account/settings/support/privacy/account deletion.      |
| `apps/mobile/src/features/session/`       | Secure session storage, restore, logout.                |
| `apps/mobile/src/features/webview/`       | URL allowlist, navigation policy, web session exchange. |
| `apps/mobile/src/features/deeplink/`      | Deep link parsing and auth guard.                       |
| `apps/mobile/src/features/notifications/` | Only if push scenario is approved.                      |
| `apps/mobile/src/features/biometrics/`    | Optional Face ID/Touch ID unlock.                       |
| `apps/mobile/src/shared/config/urls.ts`   | Production/staging HEYS URLs and allowlists.            |

Имена модулей можно адаптировать под финальный стиль, но функциональные границы
лучше сохранить.

## План реализации

### Фаза 0. Архитектурное решение

Цель: зафиксировать, что строим iOS App Store unlisted app, а не
IPA/TestFlight-as-production.

Конкретные изменения:

- Обновить этот runbook при смене решения.
- Зафиксировать production domain для WebView.
- Зафиксировать bundle id, например `com.heys.mobile` или другой финальный id
  без `.dev`.
- Зафиксировать, для кого первый релиз: клиент, куратор или оба.
- Решить вопрос оплаты: внешний доступ по HEYS-аккаунту или IAP review needed.

Критерий готовности:

- Есть один выбранный iOS distribution path.
- Есть owner Apple Developer account.
- Есть production/staging domain mapping.
- Есть решение, входит ли push в первый релиз.

Проверка:

- Review этого раздела владельцем продукта.
- Проверка, что App Store access не зависит от "секретности" unlisted link.

Риски:

- Если не решить оплату заранее, можно получить App Review blocker по IAP.
- Если не выбрать аудиторию, shell станет размытым и будет похож на браузер.

### Фаза 1. iOS Expo/EAS config

Цель: подготовить `apps/mobile` к iOS preview/production build.

Конкретные изменения:

- В `apps/mobile/app.json`:
  - добавить `ios.bundleIdentifier`;
  - добавить `ios.buildNumber`;
  - проверить `expo.name` и display name;
  - добавить `scheme`;
  - при готовности universal links добавить `ios.associatedDomains`;
  - проверить `icon` и `splash`.
- В `apps/mobile/eas.json`:
  - добавить iOS-specific preview profile;
  - добавить iOS-specific production profile;
  - проверить `submit.production` для App Store Connect.
- В assets:
  - заменить placeholder icon/splash на production assets, если текущие не
    финальные.

Критерий готовности:

- `app.json` содержит production iOS identity.
- `eas.json` явно поддерживает iOS production build.
- Android preview/production profiles не сломаны.

Проверка:

```bash
cd apps/mobile
npx expo config --type public
eas build --profile production --platform ios
```

Для локального smoke до EAS:

```bash
cd apps/mobile
npm run ios
```

Риски:

- EAS iOS build требует Apple credentials и может упереться в 2FA.
- Bundle id после App Store record нельзя менять без последствий для релизного
  контура.
- Нельзя использовать dev id вроде `com.heys.mobile.dev` для production app.

### Фаза 2. Native shell

Цель: сделать приложение app-like до подключения основного web flow.

Конкретные изменения:

- `app/_layout.tsx`: добавить app providers, скрыть лишние headers там, где
  нужен native shell.
- `app/index.tsx`: заменить placeholder на boot flow:
  - restore session;
  - если session valid -> `app/web`;
  - если session missing -> `app/auth/login`;
  - если network/backend issue -> native error state.
- Добавить `app/settings/index.tsx`:
  - account info;
  - logout;
  - support link;
  - privacy policy link;
  - terms link, если есть;
  - account deletion entry point;
  - app version/build.
- Добавить reusable native states:
  - loading;
  - offline;
  - maintenance;
  - unauthorized;
  - forbidden navigation.

Критерий готовности:

- App cold start не показывает пустой экран.
- Login/session restore/logout проходят через native UX.
- Настройки и support/legal entry points доступны без поиска.
- Приложение не выглядит как один WebView на весь экран без нативного поведения.

Проверка:

```bash
cd apps/mobile
npm run ios
```

Ручной smoke:

- first launch;
- failed network;
- backend unavailable;
- login screen;
- settings screen;
- logout;
- app restart.

Риски:

- Слишком тонкий shell оставит риск отказа по guideline 4.2.
- Избыточный native rewrite затянет релиз. Первый релиз должен быть shell +
  controlled WebView, не полный переписанный HEYS.

### Фаза 3. Auth и security

Цель: сделать безопасную мобильную сессию без хранения long-lived секретов в
WebView.

Конкретные изменения:

- `package.json`: добавить `expo-secure-store`.
- `src/features/session/`:
  - `saveSession`;
  - `loadSession`;
  - `clearSession`;
  - `refreshSession`;
  - `getWebSessionExchangeToken`.
- `src/features/auth/api.ts`:
  - убрать placeholder endpoint comment;
  - описать реальные login/refresh/logout/session-exchange endpoints.
- `src/services/api-client.ts`:
  - добавить auth headers из native session;
  - добавить timeout/error mapping;
  - не падать на module load только из-за отсутствия env в небоевом контексте,
    если это мешает тестам.
- Web/backend contract:
  - endpoint для one-time session exchange token;
  - token TTL;
  - single-use guarantee;
  - server-side session/cookie setup for WebView.

Критерий готовности:

- Token хранится в SecureStore/Keychain.
- Logout чистит native session и WebView session.
- WebView не получает long-lived token в query/localStorage.
- Session restore работает после app restart.
- Server, а не native/WebView, остается authority по client/context.

Проверка:

- Unit-level checks для session storage, если тестовый контур есть.
- Manual smoke:
  - login;
  - kill app;
  - reopen;
  - logout;
  - invalid token;
  - expired exchange token;
  - curator switches client context.

Риски:

- Неправильный bridge между native и web может создать session leak.
- Если WebView пишет токены в localStorage, безопасность становится слабее, чем
  в обычном web.
- Если native слой передает `client_id` как authority, можно нарушить
  server-side context invariant.

### Фаза 4. WebView integration

Цель: подключить HEYS web app как controlled product surface.

Конкретные изменения:

- `package.json`: добавить `react-native-webview`.
- `app/web/index.tsx`: WebView screen.
- `src/features/webview/allowedHosts.ts`: allowlist production/staging hosts.
- `src/features/webview/navigationPolicy.ts`:
  - allow HEYS URLs;
  - block unknown schemes;
  - open external support/legal links intentionally;
  - prevent file/data/javascript navigations unless explicitly needed.
- `src/features/webview/sessionExchange.ts`:
  - получить one-time web session token;
  - открыть exchange URL;
  - обработать success/failure redirect.
- Native error states:
  - no network;
  - auth expired;
  - forbidden URL;
  - backend maintenance.

Критерий готовности:

- WebView открывает только HEYS allowlist.
- External URL не открывается внутри product WebView без решения.
- Ошибка сети не выглядит как белый экран WebView.
- Reload/retry работает.
- Login и logout синхронизированы между native и web.

Проверка:

- Manual smoke на simulator и real iPhone:
  - successful web session;
  - reload;
  - back/forward behavior;
  - external link;
  - forbidden URL;
  - offline -> online;
  - expired web session.
- Проверка allowlist через targeted unit test или ручные test URLs.

Риски:

- Если разрешить произвольные URL, приложение станет general browser.
- Если web app рассчитывает только на browser localStorage, надо аккуратно
  согласовать с mobile session.
- Если основной web app не responsive на iPhone, App Review screenshots и UX
  будут слабыми.

### Фаза 5. Deep links

Цель: дать iOS-приложению нормальные входные сценарии, а не только ручной запуск
и логин.

Конкретные изменения:

- `app.json`: добавить `scheme`, например `heys`.
- При готовом домене:
  - настроить Associated Domains;
  - добавить apple-app-site-association на web domain.
- `src/features/deeplink/`:
  - parse incoming URL;
  - map route;
  - auth guard;
  - fallback route.

Минимальные route types:

- `heys://login`;
- `heys://open/client/<id>` или безопасный аналог без raw authority;
- `heys://support`;
- universal links для приглашений/возврата из email.

Критерий готовности:

- Deep link не открывает приватный экран без auth.
- Unknown links безопасно отклоняются.
- После login пользователь попадает в нужный безопасный target.

Проверка:

```bash
cd apps/mobile
npx uri-scheme open "heys://login" --ios
```

Ручной smoke:

- link на logout state;
- link на logged-in state;
- malformed link;
- expired invite/session link.

Риски:

- Raw client id в deep link нельзя считать правом доступа.
- Universal links требуют серверный файл и правильный domain ownership.

### Фаза 6. Optional biometrics

Цель: добавить Face ID/Touch ID только как удобный unlock локальной сессии.

Конкретные изменения:

- `package.json`: добавить `expo-local-authentication`, если фича входит в
  релиз.
- `src/features/biometrics/`:
  - capability check;
  - opt-in setting;
  - unlock before session restore;
  - fallback to password/login;
  - disable on logout.

Критерий готовности:

- Биометрия включается только пользователем.
- Отказ/ошибка Face ID не блокирует аккаунт навсегда.
- Logout отключает локальный unlock.

Проверка:

- real iPhone smoke:
  - opt in;
  - successful Face ID;
  - failed/cancelled Face ID;
  - fallback login;
  - logout.

Риски:

- Нельзя презентовать биометрию как замену auth.
- Simulator не доказывает полное поведение Face ID.

### Фаза 7. Optional push notifications

Цель: добавить push только при утвержденном продуктовом сценарии.

Конкретные изменения, если push входит в релиз:

- `package.json`: добавить `expo-notifications`.
- `app.json`: добавить iOS notification config при необходимости.
- Backend:
  - registration endpoint для device token;
  - user notification preferences;
  - unsubscribe/disable;
  - APNs/Expo notification send path;
  - audit/logging для отправок.
- `app/settings/index.tsx`: notification preferences.

Критерий готовности:

- Пользователь явно дает permission.
- Push имеет понятную пользу, не маркетинговый шум.
- Можно выключить уведомления.
- Privacy policy покрывает push/device token.

Проверка:

- real iPhone TestFlight smoke:
  - first permission prompt;
  - token registration;
  - receive notification;
  - tap notification -> correct deep link;
  - disable notifications.

Риски:

- Push почти всегда требует real device, simulator недостаточен.
- Без сценария push увеличит review/privacy scope без пользы.

### Фаза 8. App Store compliance

Цель: подготовить приложение к review без сюрпризов.

Конкретные изменения:

- App Store Connect:
  - app record;
  - app name/subtitle/description;
  - screenshots;
  - support URL;
  - privacy policy URL;
  - age rating;
  - App Privacy answers;
  - review demo credentials;
  - review notes.
- `app/settings/index.tsx`:
  - privacy policy;
  - terms;
  - support;
  - account deletion entry point.
- Copy:
  - убрать медицинские overpromise;
  - не обещать лечение/диагноз/гарантированный результат;
  - показать, что HEYS помогает вести питание/сопровождение, а не заменяет
    врача.

Review Notes должны объяснять:

- приложение предназначено для ограниченной аудитории HEYS;
- после review будет запрошен unlisted distribution;
- как reviewer войдет;
- какие сценарии проверить;
- если WebView используется, какие native функции реализованы.

Критерий готовности:

- Reviewer может пройти главный сценарий без связи с владельцем проекта.
- Account deletion можно инициировать из приложения.
- Screenshots показывают реальное использование, не только splash/login.
- App metadata не вводит в заблуждение.

Проверка:

- Dry run по App Store Connect checklist.
- Smoke с demo account.
- Проверка всех support/privacy/legal links.
- Проверка account deletion flow.

Риски:

- Account deletion blocker.
- Guideline 4.2 blocker.
- Health/nutrition wording blocker.
- IAP/payment blocker.
- Sign in with Apple risk, если появятся сторонние social login providers.

### Фаза 9. TestFlight

Цель: проверить build до production review.

Конкретные изменения:

- Загрузить build в App Store Connect.
- Настроить internal testers.
- При необходимости открыть external TestFlight для ограниченной группы.
- Завести release checklist по найденным blocker bugs.

Критерий готовности:

- Internal TestFlight smoke пройден.
- External TestFlight пройден, если нужен.
- Нет blocker bugs по login/session/WebView/offline/settings/account deletion.

Проверка:

- TestFlight install на реальном iPhone.
- Cold start.
- Login.
- Session restore.
- WebView main flow.
- Deep links.
- Offline/retry.
- Logout.
- Account deletion entry point.

Риски:

- TestFlight build может пройти beta review, но это не гарантирует production
  App Review.
- Нельзя оставлять TestFlight как постоянный канал клиентской установки.

### Фаза 10. App Review и unlisted request

Цель: получить production approval и прямую unlisted ссылку.

Конкретные изменения:

- Submit production build for App Review.
- В Review Notes указать intended unlisted distribution.
- После готовности/approval подать Apple request на unlisted app distribution.
- После approval сохранить final App Store link.
- Добавить ссылку в клиентский onboarding/playbook.

Критерий готовности:

- App Review approved.
- Apple unlisted request approved.
- App distribution method изменен на Unlisted.
- Direct App Store link проверен на iPhone.

Проверка:

- Открыть ссылку на iPhone.
- Установить app по ссылке.
- Проверить, что app не нужен через TestFlight.
- Проверить login demo/real account.

Риски:

- Apple отклонит unlisted request, если app не submitted/approved или в
  beta/prerelease.
- Apple может запросить пояснения по аудитории и назначению.
- Unlisted link можно переслать, поэтому доступ внутри app обязателен.

### Фаза 11. Клиентская выдача

Цель: дать клиенту простой установочный flow.

Конкретные изменения:

- Подготовить клиентскую инструкцию:
  - открыть App Store link;
  - установить HEYS;
  - войти по HEYS-доступу;
  - включить push/biometrics, если фича есть;
  - куда писать в поддержку.
- Добавить инструкцию в клиентский onboarding/playbook.
- Добавить support macro для типовых проблем:
  - ссылка не открывается;
  - app недоступен в регионе;
  - forgot password/PIN;
  - нет доступа к клиенту/куратору.

Критерий готовности:

- Новый клиент может установить app без TestFlight, UDID и `.ipa`.
- Доступ к данным закрыт HEYS auth/roles.
- Support понимает, как помогать с установкой.

Проверка:

- Пройти flow на чистом iPhone/Apple ID.
- Проверить региональную доступность.
- Проверить support links.

Риски:

- Если app доступен не во всех нужных регионах, часть клиентов не сможет
  установить.
- Если клиент думает, что ссылка секретная, будет ложное ощущение безопасности.

## Definition of Done для релиза

iOS unlisted release готов, когда выполнено все ниже:

- `apps/mobile` собирает iOS production build.
- `app.json` содержит production iOS identity, scheme и корректные assets.
- `eas.json` содержит понятный iOS production/submit path.
- Native shell реализует boot, loading, offline/error, settings,
  support/privacy/account deletion.
- Auth хранит mobile session в SecureStore/Keychain.
- WebView использует allowlist и не является general browser.
- Web session exchange не передает long-lived token в URL/localStorage.
- Deep links имеют auth guard.
- Logout чистит native и web session.
- Client/curator/PIN контексты не смешиваются.
- App Store metadata заполнена.
- Demo account работает для reviewer.
- Account deletion можно инициировать из app.
- TestFlight smoke пройден на реальном iPhone.
- App Review пройден.
- Apple unlisted link получен и проверен.
- Клиентская инструкция установки готова.

## Ревью фактической реализации 2026-07-01/02

| Блок                           | Статус по коду                                                                                                             | Что ещё нужно до релиза                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| iOS channel decision           | ✅ Зафиксирован App Store + unlisted path.                                                                                 | Принять бизнес-решение по аудитории и оплате/IAP.                                             |
| Expo/EAS iOS config            | ✅ `app.json` содержит `com.heys.mobile`, build number и `heys://`; `eas.json` содержит iOS profiles.                      | Apple credentials/2FA при реальной EAS iOS build.                                             |
| Native shell                   | ✅ Boot flow, login, WebView shell, settings, native loading/error states.                                                 | Smoke на iPhone/simulator с реальными аккаунтами.                                             |
| Auth/security                  | ✅ Mobile token хранится через SecureStore; logout чистит local session; WebView получает DB-backed one-time exchange URL. | Happy-path smoke с реальным curator/demo account на iPhone.                                   |
| WebView                        | ✅ Controlled WebView screen, allowlist, external link handling, blocked unsafe schemes.                                   | Проверить фактическую responsive-версию web app на iPhone.                                    |
| Deep links                     | ✅ `scheme: heys`, parser/root listener добавлены; web path идёт через exchange return URL.                                | Universal Links требуют домен и `apple-app-site-association`.                                 |
| Biometrics                     | ✅ Optional Face ID/Touch ID unlock для локальной сессии.                                                                  | Проверить на реальном iPhone.                                                                 |
| Push                           | 🟡 Permission/settings scaffold есть.                                                                                      | Нужен утверждённый продуктовый сценарий, backend token registration и APNs/Expo credentials.  |
| App Store compliance           | 🟡 В приложении есть support/privacy/terms/account deletion links; release packet и deletion guide подготовлены.           | Перенести metadata в App Store Connect, добавить screenshots, privacy labels, demo account.   |
| TestFlight/App Review/unlisted | ⬜ В коде подготовлено.                                                                                                    | Нужны Apple Developer/App Store Connect, EAS build, TestFlight, App Review, unlisted request. |
| Client rollout                 | 🟡 Клиентская инструкция подготовлена с placeholder под unlisted App Store link.                                           | Вставить финальную ссылку после Apple unlisted approval.                                      |

Главное, что не упустить: backend/gateway для `/auth/mobile/session-exchange`
задеплоен, но до релиза всё ещё нужен happy-path smoke с реальным curator/demo
account: native login -> exchange URL -> HttpOnly cookie в iOS WebView -> web
app открывается уже авторизованным.

## Что нельзя делать

- Нельзя строить iOS production-дистрибуцию через рассылку `.ipa`.
- Нельзя считать TestFlight постоянным клиентским каналом.
- Нельзя считать unlisted link приватной защитой.
- Нельзя делать "просто сайт в WebView" без native shell и app-like функций.
- Нельзя хранить long-lived token в WebView localStorage или query string.
- Нельзя открывать произвольные внешние URL внутри product WebView.
- Нельзя доверять raw `client_id` из native/WebView/deep link как праву доступа.
- Нельзя добавлять push "для галочки" без сценария, consent и настроек
  отключения.
- Нельзя обещать медицинский результат, диагноз или лечение в App Store copy.
- Нельзя обходить IAP-правила, если выбранная модель оплаты попадает под Apple
  digital goods policy.
- Нельзя трогать `apps/web/public` generated bundles как часть этой
  mobile-задачи.

## Первый практический backlog для кодера

1. ✅ Обновить `apps/mobile/app.json` под iOS production identity.
2. ✅ Добавить iOS profiles в `apps/mobile/eas.json`.
3. ✅ Проверить mobile dependencies и lockfile под EAS Build.
4. ✅ Сделать `src/features/session/` и secure session restore/logout.
5. ✅ Сделать native boot flow в `app/index.tsx`.
6. ✅ Сделать `app/web/index.tsx` с URL allowlist и native error states.
7. ✅ Сделать `app/settings/index.tsx` с support/privacy/account
   deletion/logout.
8. ✅ Реализовать backend contract для DB-backed one-time web session exchange.
9. ✅ Добавить deep link scheme и route guard.
10. ⬜ Прогнать simulator smoke.
11. ⬜ Прогнать real iPhone/TestFlight smoke.
12. ✅ Подготовить App Store metadata и Review Notes draft.

## Проверенные факты

| Claim                                                                                                                            | Source          | Verify command                                                                                                                                                                                                 | Result                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/mobile` существует как Expo/React Native app на Expo SDK 54.                                                               | local files     | `sed -n '1,220p' apps/mobile/package.json`                                                                                                                                                                     | Confirmed: dependencies include `expo ~54.0.23`, `react-native`, `expo-router`.                                                                      |
| React/RN versions совместимы с установленной Expo-версией.                                                                       | local command   | `cd apps/mobile && npx expo install --check`                                                                                                                                                                   | Confirmed: dependencies are up to date.                                                                                                              |
| iOS identity и custom scheme заданы.                                                                                             | local files     | `sed -n '1,220p' apps/mobile/app.json`                                                                                                                                                                         | Confirmed: `bundleIdentifier`, `buildNumber`, `scheme`.                                                                                              |
| EAS profiles содержат iOS config.                                                                                                | local files     | `sed -n '1,220p' apps/mobile/eas.json`                                                                                                                                                                         | Confirmed: development/preview/production include `ios`.                                                                                             |
| Native shell screens существуют.                                                                                                 | local files     | `git ls-files apps/mobile/app/web/index.tsx apps/mobile/app/settings/index.tsx`                                                                                                                                | Confirmed: WebView and settings screens are tracked.                                                                                                 |
| Account deletion entry point is not the privacy policy fallback.                                                                 | local files     | `rg -n "accountDeletionUrl                                                                                                                                                                                     | ACCOUNT_DELETION_URL" apps/mobile/app.json apps/mobile/src/shared/config/urls.ts`; `test -f apps/web/public/docs/account-deletion.md && echo exists` | Confirmed: mobile config points to dedicated account deletion instructions. |
| App Store release packet and client install guide exist.                                                                         | local files     | `test -f apps/mobile/APP_STORE_RELEASE_PACKET.md && echo release-packet`; `test -f apps/mobile/CLIENT_INSTALL_GUIDE.md && echo client-guide`                                                                   | Confirmed: metadata/review notes draft and client install guide are present.                                                                         |
| SecureStore session layer существует.                                                                                            | local files     | `sed -n '1,220p' apps/mobile/src/features/session/storage.ts`                                                                                                                                                  | Confirmed: save/load/clear session use `expo-secure-store`.                                                                                          |
| WebView navigation policy blocks unsafe schemes and allows only configured hosts.                                                | local files     | `sed -n '1,220p' apps/mobile/src/features/webview/navigation-policy.ts`                                                                                                                                        | Confirmed: blocks `file:`, `data:`, `javascript:` and uses `getAllowedWebHosts`.                                                                     |
| Deep-link web paths go through the session exchange return URL.                                                                  | local files     | `sed -n '20,45p' apps/mobile/app/web/index.tsx`; `sed -n '1,40p' apps/mobile/src/features/webview/session-exchange.ts`                                                                                         | Confirmed: WebView asks exchange for the target path and loads the exchange URL.                                                                     |
| Backend source has DB-backed one-time mobile session exchange handlers.                                                          | local files     | `rg -n "mobile_web_session_exchanges" yandex-cloud-functions/heys-api-auth/index.js`; `rg -n "handleMobileSessionExchange" yandex-cloud-functions/heys-api-auth/index.js`                                      | Confirmed: issue and consume handlers store hashed exchange tokens and mark consume.                                                                 |
| DB migration for mobile exchange tokens exists.                                                                                  | local files     | `sed -n '1,220p' database/2026-07-02_mobile_web_session_exchanges.sql`                                                                                                                                         | Confirmed: table, indexes, comments and grants are defined.                                                                                          |
| Production DB table for mobile exchange tokens exists.                                                                           | production DB   | `bash scripts/db/psql.sh -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='mobile_web_session_exchanges' ORDER BY ordinal_position;"` | Confirmed: token hash, curator, return URL, timestamps and consume fields exist.                                                                     |
| API Gateway specs expose mobile session exchange routes.                                                                         | local files     | `rg -n "/auth/mobile/session-exchange" yandex-cloud-functions/api-gateway-spec.yaml yandex-cloud-functions/api-gateway-spec-v2.yaml`                                                                           | Confirmed: routes are present in both specs.                                                                                                         |
| Live API Gateway exposes exchange endpoints.                                                                                     | live smoke      | `curl -i -X POST https://api.heyslab.ru/auth/mobile/session-exchange ...`; `curl -i "https://api.heyslab.ru/auth/mobile/session-exchange/consume?return_url=https%3A%2F%2Fapp.heyslab.ru%2F" ...`              | Confirmed: unauth issue returns 401 and consume without token returns 400.                                                                           |
| Apple unlisted apps are discoverable only by direct link and do not appear in categories/recommendations/charts/search/listings. | Apple Developer | Official docs linked below.                                                                                                                                                                                    | Confirmed in Apple Unlisted App Distribution docs.                                                                                                   |
| Apple says unlisted requests are declined if app has not been submitted to App Review or is beta/prerelease.                     | Apple Developer | Official docs linked below.                                                                                                                                                                                    | Confirmed in Apple Unlisted App Distribution docs.                                                                                                   |
| Apple guideline 4.2 requires app features/content/UI beyond a repackaged website.                                                | Apple Developer | Official guidelines linked below.                                                                                                                                                                              | Confirmed in App Review Guidelines 4.2.                                                                                                              |
| Apps with account creation must let users initiate account deletion in the app.                                                  | Apple Developer | Official support article linked below.                                                                                                                                                                         | Confirmed in Apple account deletion guidance.                                                                                                        |

## Официальные источники

- Apple: Unlisted App Distribution -
  https://developer.apple.com/support/unlisted-app-distribution/
- Apple: Set distribution methods -
  https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/
- Apple: App Review Guidelines, 4.2 Minimum Functionality -
  https://developer.apple.com/app-store/review/guidelines/
- Apple: TestFlight external testers -
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/
- Apple: Offering account deletion in your app -
  https://developer.apple.com/support/offering-account-deletion-in-your-app/
