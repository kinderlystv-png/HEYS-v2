# Выгрузки условий получателей — 13.08.2026

Приложения к оценке правового режима и документу о риске по ч. 14 ст. 12. Язык —
официальные русские версии, где они есть. Юрист язык не требовал; английский
канон получателя для подписи и вычитки не нужен.

| Файл                                     | Источник                                                                                               | Язык                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-telegram-privacy.pdf`                | https://telegram.org/privacy/ru                                                                        | русский: текст официальной страницы на 13.08; Chrome headless с `/ru` печатал английский оригинал, поэтому PDF собран из снятого русского текста той же страницы |
| `02-telegram-tos.pdf`                    | https://telegram.org/tos/ru                                                                            | то же                                                                                                                                                            |
| `03-google-privacy.pdf`                  | https://policies.google.com/privacy?hl=ru                                                              | русский, официальная страница                                                                                                                                    |
| `04-google-web-push.mdn.pdf`             | https://developer.mozilla.org/ru/docs/Web/API/Push_API                                                 | русский, MDN                                                                                                                                                     |
| `05-apple-privacy.pdf`                   | https://www.apple.com/legal/privacy/ru/                                                                | русский, официальная страница                                                                                                                                    |
| `06-apple-safari-web-push.pdf`           | https://webkit.org/blog/12945/meet-web-push-for-safari/                                                | английский: у Apple/WebKit нет официальной русской страницы этого описания                                                                                       |
| `07-ripe-org-tmi5.txt`                   | https://rest.db.ripe.net/ripe/organisation/ORG-TMI5-RIPE.json                                          | запись RIPE на 13.08.2026: почтовый адрес Telegram Messenger Inc. в политике не указан                                                                           |
| `08-google-play-telegram-publisher.txt`  | https://play.google.com/store/apps/details?id=org.telegram.messenger                                   | карточка издателя на 13.08.2026: Telegram FZ-LLC, Al Habtoor Business Tower, Дубай; не адрес контролёра Messenger Inc.                                           |
| `09-rkn-st12-confirmation-100383874.png` | https://pd.rkn.gov.ru/cross-border-transmission/form2/?action=preview&rid=100383874&randvalue=17974226 | квитанция портала: уведомление передано, номер 100383874, ключ 17974226; кнопка «PDF версия» на портале не работает (404 на `action="./"`), не нажимать повторно |

Firebase DPA и Apple Developer Program License Agreement не выгружались:
оператор ими не пользуется, это прямо сказано в оценке.

Страница Apple `/legal/privacy/ru/` на дату выгрузки раскрывается заголовками;
полный текст той же политики — по ссылке «Скачайте копию» на этой странице.
