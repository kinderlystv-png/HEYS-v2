# HEYS iOS Unlisted App Plan

Дата: 2026-07-01

## Суть

Рабочий путь для iOS: собрать HEYS как нормальное iOS-приложение через текущий
Expo/EAS-контур, пройти App Review, затем запросить у Apple unlisted
distribution и отправлять клиентам прямую ссылку на App Store.

Это не рассылка `.ipa` как файла. На iOS такой сценарий не подходит для
клиентского production: установка ограничена устройствами, TestFlight остается
beta-каналом, Enterprise Program предназначен для внутренних сотрудников, а не
для внешних клиентов.

## Что такое unlisted app

Unlisted app - это обычное приложение в App Store, которое:

- не показывается в поиске, категориях, чартах, рекомендациях и обычных списках
  App Store;
- открывается и устанавливается по прямой ссылке;
- обновляется через App Store как обычное приложение;
- проходит обычный App Review;
- не является приватной защитой: если ссылку переслали, страницу приложения тоже
  можно открыть.

Защиту доступа надо делать внутри HEYS: аккаунт, PIN, роли, права
клиента/куратора, серверная проверка доступа.

## Почему не просто PWA -> IPA -> клиенту

| Вариант                           | Что реально происходит                                            | Подходит для клиентов                              |
| --------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| `.ipa` напрямую                   | Нужна подпись и доверенная схема установки                        | Нет                                                |
| Ad Hoc                            | Только зарегистрированные устройства, лимиты Apple по устройствам | Нет для нормального масштаба                       |
| TestFlight                        | До 10 000 внешних тестеров, beta/review-процесс                   | Только временное тестирование                      |
| Enterprise                        | In-house distribution для сотрудников организации                 | Нет для внешних клиентов                           |
| Apple Business Manager Custom App | Частное B2B-распространение по организациям                       | Да, если клиентская организация работает через ABM |
| Unlisted App Store app            | App Store-установка по прямой ссылке                              | Да, лучший базовый вариант                         |

## Выбранная стратегия

Базовый сценарий:

1. Использовать существующее приложение `apps/mobile` как iOS-контур.
2. Не делать "голый сайт в WebView". Apple guideline 4.2 требует, чтобы
   приложение было больше, чем repackaged website.
3. Собрать app-like shell: нативный старт, авторизация/сессия, понятные
   состояния сети, настройки аккаунта, ссылка на поддержку, удаление аккаунта,
   privacy/legal entry points.
4. Основной HEYS-интерфейс на первом этапе можно открывать внутри controlled
   WebView, если оболочка дает реальную app-like ценность и не выглядит как
   браузерная вкладка.
5. Пройти TestFlight для внутренней проверки.
6. Подать production build в App Review с пометкой, что приложение предназначено
   для unlisted distribution.
7. После готовности или публикации запросить unlisted app link у Apple.
8. Клиентам отправлять App Store-ссылку, а доступ к данным закрывать
   HEYS-аккаунтом.

## Текущий стартовый контур

В проекте уже есть `apps/mobile`:

- Expo / React Native приложение;
- EAS config в `apps/mobile/eas.json`;
- Android preview APK уже описан в `apps/mobile/BUILD_README.md`;
- iOS production-конфигурация пока не доведена до релизного состояния;
- текущие экраны выглядят как ранний каркас, не как готовый клиентский app.

Вывод: начинать надо не с нового репозитория, а с доведения `apps/mobile` до iOS
release shell.

## Архитектура первого iOS-релиза

### 1. Native shell

Минимальный набор нативных экранов:

- splash/loading;
- login/session restore;
- connection error / maintenance;
- account/settings;
- support/contact;
- privacy policy / terms links;
- account deletion entry point;
- version/build diagnostics.

Зачем: это снижает риск отказа как "просто сайт в оболочке" и дает пользователю
нормальное поведение приложения.

### 2. Controlled WebView для HEYS web app

Если основной продукт остается вебом, WebView должен быть контролируемым:

- открывает только разрешенные HEYS-домены;
- не превращается в общий браузер;
- корректно обрабатывает deep links;
- показывает нативные ошибки сети;
- не хранит секреты в обычном localStorage, если используются mobile tokens;
- имеет понятный logout;
- не ломает PIN/curator/client контекст.

Технически понадобится добавить зависимость вроде `react-native-webview`, но
решение по токенам надо принять до кода.

### 3. Auth и сессии

Нельзя просто "зашить" веб-сессию без модели безопасности.

Нужны решения:

- как мобильный клиент получает токен;
- где хранит токен: предпочтительно secure storage, не plain localStorage;
- как WebView получает авторизацию: cookie, deep link token exchange или
  backend-issued mobile session;
- как инвалидируется сессия при logout;
- что происходит при смене клиента у куратора;
- как не нарушить текущий invariant: cloud/server остаются источником правды по
  client/context.

### 4. Обновления

Надо разделить два типа обновлений:

- Web-контент HEYS может обновляться на сервере без нового App Store review.
- Нативная оболочка, permissions, capabilities, auth-модель и App Store metadata
  обновляются через новую версию приложения.

Для первого релиза лучше не полагаться на сложные OTA-механизмы, пока не
закреплен App Review-контур.

## App Review readiness

Перед отправкой в Apple должны быть готовы:

- production App Store bundle id, например `com.heys.app`, не dev package;
- App Store Connect app record;
- Apple Developer Program account;
- app name, subtitle, description, keywords;
- иконка, screenshots, preview metadata;
- support URL;
- privacy policy URL;
- terms URL, если используется;
- понятная форма удаления аккаунта или запуск удаления аккаунта из приложения;
- demo account для reviewer;
- Review Notes: что это HEYS, кому предназначено, как войти, что приложение
  intended for unlisted distribution;
- privacy nutrition labels в App Store Connect;
- age rating;
- проверка медицинских/нутрициологических формулировок: без обещаний лечения,
  диагноза или медицинского результата.

Если в приложении появится сторонний social login, надо отдельно проверить
требование Sign in with Apple. Если вход только email/password или
PIN/сессионный доступ без social login, этот риск ниже.

## План работ

### Фаза 0. Решение по каналу

Результат: зафиксировано, что iOS идет через App Store unlisted, не через
рассылку `.ipa`.

Проверка готовности:

- выбран Apple Developer account;
- выбран production bundle id;
- понятна целевая аудитория: прямые клиенты HEYS, кураторы или оба сегмента;
- принято решение: приложение бесплатное, доступ монетизируется вне App Store
  через HEYS-аккаунт, либо нужна отдельная IAP-проверка.

### Фаза 1. Технический дизайн mobile shell

Результат: короткая спецификация mobile shell до кода.

Нужно описать:

- какие URL открывает WebView;
- какие URL запрещены;
- auth flow;
- logout flow;
- restore session flow;
- error states;
- account deletion flow;
- что остается нативным, а что остается вебом;
- как тестируется client/curator/PIN сценарий.

### Фаза 2. iOS config в Expo/EAS

Результат: `apps/mobile` умеет собирать iOS production build.

Ожидаемые изменения:

- добавить `ios.bundleIdentifier`;
- добавить `ios.buildNumber`;
- проверить display name;
- настроить `eas.json` для iOS production;
- настроить credentials/certificates/profiles через EAS;
- проверить, что Android APK/AAB контур не сломан.

Проверка:

```bash
cd apps/mobile
eas build --profile production --platform ios
```

Команда требует Expo/Apple credentials и может упереться в 2FA, это единственная
часть, где может понадобиться ручное подтверждение владельца аккаунта.

### Фаза 3. Реализация app-like shell

Результат: приложение выглядит и ведет себя как iOS app, а не как браузерная
вкладка.

Нужно сделать:

- нативный root layout;
- WebView screen с allowlist доменов;
- loading/offline/error screens;
- settings/account screen;
- support/privacy/legal links;
- logout;
- account deletion entry point;
- build/version display;
- basic analytics/error logging, если уже есть безопасный канал.

Проверка:

- iOS simulator smoke;
- physical iPhone smoke;
- cold start;
- login;
- session restore;
- logout;
- offline mode;
- forbidden external URL handling;
- curator/client context switch;
- PIN/client flow, если входит в релиз.

### Фаза 4. Compliance и App Store metadata

Результат: App Store Connect готов к review.

Нужно подготовить:

- App Privacy answers;
- support/privacy URLs;
- screenshots;
- description без overpromise;
- review demo credentials;
- review notes;
- возрастной рейтинг;
- список permissions и объяснений;
- проверку account deletion.

Особое внимание:

- если HEYS обрабатывает питание/здоровье, тексты не должны обещать медицинский
  эффект;
- если есть персональные данные, privacy policy должна прямо покрывать mobile
  app;
- если есть платный доступ, надо проверить, не требует ли конкретный сценарий
  Apple IAP.

### Фаза 5. TestFlight

Результат: build проверен до публичного review.

Порядок:

1. Загрузить iOS build в App Store Connect.
2. Прогнать internal TestFlight.
3. При необходимости открыть external TestFlight для ограниченной группы.
4. Закрыть blocker bugs.

TestFlight не считается каналом для постоянной клиентской поставки.

### Фаза 6. App Review и unlisted request

Результат: приложение одобрено и доступно по прямой ссылке.

Порядок:

1. Submit app for App Review.
2. В Review Notes указать, что приложение предназначено для unlisted
   distribution.
3. Убедиться, что app не beta/prerelease.
4. Подать Apple request на unlisted app distribution.
5. После подтверждения Apple сохранить прямую ссылку.
6. Добавить эту ссылку в клиентский onboarding/playbook.

Важно: Apple может отказать в unlisted request, если приложение не отправлено на
review или находится в beta/prerelease состоянии.

### Фаза 7. Клиентская выдача

Результат: клиент получает простую инструкцию установки.

Клиентский flow:

1. Клиент получает App Store link.
2. Устанавливает HEYS.
3. Входит по аккаунту/доступу HEYS.
4. Получает только свои данные и разрешенные роли.

Нельзя считать ссылку секретом. Секретом являются учетная запись, PIN/session,
серверные права и контекст клиента.

## Definition of Done

iOS unlisted release считается готовым, когда:

- `apps/mobile` собирается в iOS production build;
- build проходит smoke на реальном iPhone;
- авторизация, logout и restore session работают стабильно;
- WebView не открывает произвольные внешние домены;
- client/curator/PIN контексты не смешиваются;
- есть support/privacy/account deletion entry points;
- App Store metadata заполнена;
- TestFlight smoke пройден;
- App Review пройден;
- Apple unlisted link получен;
- клиентская инструкция установки готова.

## Основные риски

| Риск                         | Почему важен                                                 | Как снизить                                                   |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Отказ по guideline 4.2       | Apple не любит repackaged website                            | Делать native shell и app-like UX                             |
| Auth между WebView и web app | Можно сломать сессии или безопасность                        | Сначала описать token/session contract                        |
| IAP-риск                     | Apple может требовать IAP для цифрового платного функционала | До review описать модель оплаты и доступа                     |
| Health/nutrition claims      | Можно получить review/legal issues                           | Убрать медицинские обещания, оставить аккуратные формулировки |
| Account deletion             | Apple требует возможность инициировать удаление аккаунта     | Добавить entry point в app                                    |
| Ссылка не приватна           | Unlisted app доступен всем, у кого есть ссылка               | Доступ закрывать backend auth/roles                           |
| 2FA/credentials              | EAS iOS build требует Apple-доступы                          | Заранее подготовить Account Holder/Admin                      |

## Что не входит в первый релиз без отдельного решения

- Enterprise distribution;
- Ad Hoc distribution клиентам;
- Apple Business Manager Custom App;
- полноценный нативный rewrite всего HEYS;
- push notifications, если нет конкретного сценария;
- In-App Purchases, если доступ продается и учитывается вне App Store;
- App Clips;
- Apple Watch/iPad-специфичные версии.

## Официальные источники

- Apple: Unlisted App Distribution -
  https://developer.apple.com/support/unlisted-app-distribution/
- Apple: Set distribution methods -
  https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/
- Apple: App Review Guidelines, 4.2 Minimum Functionality -
  https://developer.apple.com/app-store/review/guidelines/
- Apple: TestFlight external testers -
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/
- Apple: Account deletion requirement -
  https://developer.apple.com/support/offering-account-deletion-in-your-app/
