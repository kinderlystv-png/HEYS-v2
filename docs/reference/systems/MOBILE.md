# Мобильное приложение

> **Статус:** source-контракты проверены 2026-07-17<br> **Охват:** boot, session
> storage/verification, WebView exchange, navigation, deep links, logout и
> Android release gate<br> **Не подтверждено:** runtime smoke на iOS/Android,
> store publication state, biometrics на устройстве и фактический production
> exchange

## Роль приложения

Mobile — нативная оболочка Expo/React Native вокруг основного web-продукта, а не
второй независимый HEYS frontend. Пользовательский интерфейс приложения
открывается внутри controlled WebView; нативный слой отвечает за SecureStore,
биометрию, boot/network state, deep links, settings, logout и release packaging.

Отдельной native login route нет: guest, expired session, login deep link и
logout возвращают на `/web`, где показывается фирменный web-вход.

```text
Native boot
  → SecureStore session?
  → expiry / biometrics / network / server verify
  → /web
      ├─ no native session → обычный HEYS web login
      └─ native session → one-time session exchange URL
                         → HttpOnly web session → controlled WebView
```

## Владельцы ответственности

| Область                       | Точка                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Boot и session validation     | `apps/mobile/app/index.tsx`                                                         |
| WebView shell/bridge/error UI | `apps/mobile/app/web/index.tsx`                                                     |
| Native session API            | `apps/mobile/src/features/auth/api.ts`                                              |
| SecureStore                   | `apps/mobile/src/features/session/storage.ts`                                       |
| One-time web exchange         | `apps/mobile/src/features/webview/session-exchange.ts`                              |
| Navigation allowlist          | `apps/mobile/src/features/webview/navigation-policy.ts`                             |
| Deep links                    | `apps/mobile/src/features/deeplink/routes.ts`, `app/_layout.tsx`                    |
| Logout native + web cookies   | `apps/mobile/app/auth/logout.tsx`                                                   |
| Backend exchange              | `yandex-cloud-functions/heys-api-auth/index.js`                                     |
| App config/release gate       | `apps/mobile/app.json`, `scripts/build-rustore.sh`, `scripts/verify-release-apk.sh` |

## Session model

`StoredSession` содержит access token, kind (`client` или `curator`), expiry и
минимальные user metadata. Он хранится в Expo SecureStore с
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`; WebView не получает long-lived token напрямую.

Boot:

1. отсутствующая/истёкшая session очищается и открывается `/web`;
2. optional biometric unlock выполняется до network verify;
3. offline при сохранённой session показывает native error, а не запускает
   непроверенный WebView;
4. client session проверяется session-safe RPC, curator — `/auth/verify`;
5. ошибка verify очищает SecureStore и возвращает web login.

## Web session exchange

Для валидной native session приложение отправляет bearer token в
`/auth/mobile/session-exchange` вместе с return URL. Backend выдаёт
короткоживущий one-time exchange URL; WebView открывает его, backend
устанавливает web cookie и перенаправляет на разрешённый HEYS path.

Это сохраняет границу: authority остаётся на сервере, а long-lived native token
не появляется в WebView URL/localStorage. Backend contract test отдельно
проверяет, что exchange URL не содержит исходный access token.

При ошибке exchange приложение открывает unauthenticated HEYS URL и показывает
предупреждение; token в fallback не передаётся.

## Controlled navigation и deep links

- `file:`, `data:` и `javascript:` блокируются.
- HTTP(S) HEYS hosts разрешаются внутри WebView.
- Другие HTTP(S) и custom schemes открываются через системный `Linking`, если ОС
  умеет их обработать.
- `heys://login` ведёт на `/web`; settings/support — в native settings;
  остальные paths передаются в web shell и проходят session exchange.
- `originWhitelist` WebView широк, но фактическое решение принимает
  `onShouldStartLoadWithRequest` + `decideNavigation`; эти два слоя нельзя
  разъединять.

WebView внедряет небольшой bridge: добавляет в web settings действия открытия
native settings и reload. Он не является общим произвольным RPC bridge.

## Logout

Logout сначала best-effort отзывает native client/curator session, затем двумя
скрытыми WebView POST очищает оба возможных HttpOnly cookie. После обоих ответов
или четырёхсекундного fallback очищается SecureStore/cache и открывается `/web`.

## Release-контракт Android

RuStore build выполняется из изолированной временной копии `apps/mobile`, чтобы
EAS не отправлял корень монорепозитория. Artifact verifier проверяет:

- package/version floor и `heys://` scheme;
- production API в JS bundle и отсутствие private cleartext API;
- отсутствие удалённой native login route;
- отсутствие `SYSTEM_ALERT_WINDOW`;
- не-debug подпись.

`app.json` запрещает storage/overlay permissions и конфигурирует только
необходимые network permissions. Наличие release artifact в репозитории не
доказывает его текущую публикацию или соответствие source без запуска verifier.

## Инварианты

1. Web UI — единственный login UI; native duplicate login не возвращается.
2. Long-lived token хранится в SecureStore, не в WebView query/localStorage.
3. Exchange token одноразовый/короткоживущий и server-resolved.
4. Произвольный URL не открывается внутри product WebView.
5. Raw client id из deep link/WebView не является полномочием.
6. Logout очищает native session и оба типа web cookies.
7. Release build изолирован от монорепозитория и проходит artifact verifier.
8. Mobile не дублирует web business logic и data model.

## Подтверждённые слабые места и пробелы

- В `apps/mobile` есть unit tests для navigation/session, SecureStore и
  deep-link routes. При этом полный boot, logout cookie cleanup и biometrics не
  проверяются на реальном устройстве этим набором.
- `getInitialWebUrl()` принимает абсолютный HTTP(S) URL как есть, но активный
  WebView передаёт каждую навигацию в `decideNavigation`, а external/unsafe URL
  покрыты unit test. Это подтверждённый caller invariant, а не текущий обход
  allowlist: новый WebView caller обязан сохранить тот же guard.
- Logout имеет четырёхсекундный fallback: при сетевой ошибке local session будет
  очищена, но server session/cookie может остаться действительной до expiry.
- WebView navigation safety зависит от сохранения
  `onShouldStartLoadWithRequest`; один широкий `originWhitelist` сам по себе не
  является allowlist.
- `app.json` versionCode — минимальный floor для verifier; artifact с более
  высоким code проходит. Release history нельзя выводить только из config.
- Device-specific WebView cookie behavior, biometrics и external navigation
  требуют реального smoke и здесь не объявлены подтверждёнными.

## Facts Table

| ID  | Утверждение                                                              | Проверка                                                                                                                     | Статус               |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| M1  | Boot проверяет SecureStore, expiry, biometrics, network и server session | `sed -n '1,75p' apps/mobile/app/index.tsx`                                                                                   | проверено 2026-07-17 |
| M2  | Session хранится в SecureStore with device-only unlocked access          | `sed -n '1,55p' apps/mobile/src/features/session/storage.ts`                                                                 | проверено 2026-07-17 |
| M3  | WebView использует session exchange и token-free fallback                | `sed -n '80,145p' apps/mobile/app/web/index.tsx`                                                                             | проверено 2026-07-17 |
| M4  | Navigation блокирует unsafe schemes и разрешает configured hosts         | `sed -n '1,65p' apps/mobile/src/features/webview/navigation-policy.ts`                                                       | проверено 2026-07-17 |
| M5  | Login deep link и неизвестные paths идут в `/web`                        | `sed -n '1,35p' apps/mobile/src/features/deeplink/routes.ts`                                                                 | проверено 2026-07-17 |
| M6  | Backend/gateway имеют issue и consume exchange routes                    | `rg -n 'mobile/session-exchange' yandex-cloud-functions/heys-api-auth/index.js yandex-cloud-functions/api-gateway-spec.yaml` | проверено 2026-07-17 |
| M7  | Contract test не допускает исходный access token в exchange URL          | `sed -n '130,160p' yandex-cloud-functions/heys-api-auth/__tests__/mobile-session-exchange.contract.test.cjs`                 | проверено 2026-07-17 |
| M8  | Logout очищает native и web sessions с fallback                          | `sed -n '1,105p' apps/mobile/app/auth/logout.tsx`                                                                            | проверено 2026-07-17 |
| M9  | RuStore build изолирует project, verifier проверяет release invariants   | `sed -n '1,70p' apps/mobile/scripts/build-rustore.sh && sed -n '1,125p' apps/mobile/scripts/verify-release-apk.sh`           | проверено 2026-07-17 |
| M10 | Native login route отсутствует                                           | `test ! -e apps/mobile/app/auth/login.tsx`                                                                                   | проверено 2026-07-17 |
| M11 | Mobile navigation/session, SecureStore и deep links имеют unit tests     | `pnpm test:mobile:critical`                                                                                                  | проверено 2026-07-17 |
