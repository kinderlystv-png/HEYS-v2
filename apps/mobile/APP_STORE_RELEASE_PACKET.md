# HEYS iOS App Store Release Packet

Дата: 2026-07-02

Документ нужен для заполнения App Store Connect перед iOS review и unlisted
request. Финальные поля в App Store Connect должен проверить владелец аккаунта
Apple Developer.

## Product Identity

| Field                | Value                                                             |
| -------------------- | ----------------------------------------------------------------- |
| App name             | HEYS                                                              |
| Bundle ID            | `com.heys.mobile`                                                 |
| SKU                  | `heys-ios`                                                        |
| Device support       | iPhone first release; iPad support only after separate QA         |
| Primary category     | Health & Fitness                                                  |
| Secondary category   | Food & Drink или Productivity                                     |
| Distribution intent  | Public App Store review, then Apple unlisted distribution request |
| Audience             | Existing HEYS users with issued access                            |
| Support URL          | `https://t.me/heyslab_support_bot`                                |
| Privacy URL          | `https://app.heyslab.ru/docs/privacy-policy.md`                   |
| Terms URL            | `https://app.heyslab.ru/docs/user-agreement.md`                   |
| Account deletion URL | `https://app.heyslab.ru/docs/account-deletion.md`                 |

## App Store Copy

### Subtitle

Питание и сопровождение HEYS

### Promotional Text

HEYS помогает вести дневник питания, видеть контекст недели и работать с
куратором в одном приложении.

### Description

HEYS помогает вести питание системно: вы фиксируете еду, режим и самочувствие, а
куратор видит картину недели и помогает удерживать понятный рабочий ритм.

В приложении доступны:

- вход в HEYS-аккаунт;
- дневник питания и связанные данные;
- безопасный доступ к web-версии HEYS внутри приложения;
- настройки аккаунта, поддержка и юридические документы;
- локальная защита сессии через Face ID или Touch ID, если вы включите её в
  настройках.

HEYS не заменяет врача, не ставит диагнозы и не назначает лечение. Приложение
работает как инструмент дневника и сопровождения питания для пользователей,
которым уже выдан доступ к HEYS.

### Keywords

питание, дневник питания, нутрициология, куратор, рацион, режим, HEYS

### What's New

Первый iOS-релиз HEYS: вход в аккаунт, защищённая мобильная сессия, доступ к
web-части HEYS, настройки, поддержка и юридические ссылки.

## Review Notes

Use this text in App Review Notes after adding real demo credentials. For a
client-facing build, provide a demo phone/PIN pair with safe sample data.

```text
HEYS is a nutrition diary and curator support app for an existing HEYS audience.
The app is intended for App Store review first. After approval, we plan to
request Apple unlisted app distribution.

Native iOS value included in this build:
- native client PIN sign-in, curator sign-in and session restore;
- secure mobile session storage with Expo SecureStore / iOS Keychain;
- optional Face ID / Touch ID unlock for an existing local session;
- controlled WebView with HEYS domain allowlist;
- one-time server-side web session exchange that sets an HttpOnly cookie without
  putting long-lived tokens into the WebView URL;
- native loading, network error, settings, support, privacy, terms and account
  deletion entry points;
- custom scheme deep links with auth guard.

The app does not provide general web browsing. Unknown or unsafe URLs are blocked
or opened outside the product WebView.

Demo account:
Client phone: [ADD_REVIEW_DEMO_PHONE]
Client PIN: [ADD_REVIEW_DEMO_PIN]
Email: [ADD_REVIEW_DEMO_EMAIL]
Password: [ADD_REVIEW_DEMO_PASSWORD]
MFA: [ADD_MFA_INSTRUCTIONS_OR_STATE_NO_MFA]

Main review path:
1. Open the app.
2. Sign in with the client demo phone and PIN.
3. Wait until the HEYS web app opens inside the controlled WebView.
4. Open Settings.
5. Check support, privacy, terms and account deletion entry points.
6. Log out.

HEYS is not a medical app. It does not diagnose, treat or prescribe medical
actions.
```

## Screenshot Set

Prepare screenshots from a real iPhone or TestFlight build.

| Slot | Screen                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | Native login screen                                             |
| 2    | HEYS diary or main web app screen after session exchange        |
| 3    | Settings with account, Face ID/Touch ID and notification status |
| 4    | Support/privacy/terms/account deletion entry points             |
| 5    | Native loading or offline/error state                           |

Do not use screenshots with personal health details from a real client. Use a
demo account with safe sample data.

## App Privacy Draft

Confirm these answers in App Store Connect before submission.

| Data type        | Likely answer                    | Notes                                                                          |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Contact Info     | Collected                        | Account email/phone can be used for account access and support.                |
| Health & Fitness | Collected                        | Nutrition, body, activity, sleep and related diary data can be stored in HEYS. |
| User Content     | Collected                        | Food photos, diary notes and support/messages can exist in the product.        |
| Identifiers      | Collected                        | User/client IDs and device identifiers for app functionality.                  |
| Diagnostics      | Confirm before submit            | Mark only if crash or diagnostic collection is enabled in the release build.   |
| Location         | Not collected unless added later | Do not enable unless product scope changes.                                    |
| Advertising Data | Not collected                    | HEYS should not use app data for third-party advertising.                      |

Use purposes: app functionality, account management, support, security and
service quality. Do not claim medical diagnosis or treatment.

## Pre-Submission Checklist

- Add final App Store screenshots.
- Add review demo credentials.
- Confirm App Store Connect device family matches the iPhone-only first release
  scope.
- Confirm whether payment model triggers IAP review.
- Confirm age rating.
- Confirm App Privacy answers against production data flows.
- Keep backend services live during review.
- Confirm `/auth/mobile/session-exchange` live happy path on iPhone.
- Confirm account deletion entry point opens and explains the in-app deletion
  path.
- Confirm release audience and provide a safe demo phone/PIN for review.
- Add Review Notes that the app is intended for unlisted distribution after
  approval.
