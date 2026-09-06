// ui-v4-verdicts.mjs — доступ к вердиктам контракта v4.
//
// Вердикты лежат по файлу на зону: `docs/ui/verdicts/<зона>.json`. Прежде это
// был один файл на все зоны, и он дважды за 31 августа уехал в чужой коммит
// целиком: путь в `git commit -- <путь>` указывался верно, но файл всегда
// содержал чужое незакоммиченное — снимок правится в середине разбора зоны, а
// коммитить середину нельзя. Теперь чужая работа физически не может попасть в
// чужой коммит.
//
// Путь спрятан здесь намеренно: на снимок ссылались 27 мест, и следующая
// перекладка не должна снова расходиться по ним.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
// Guard tests redirect writes to a temp copy (HEYS_VERDICT_GUARD_TEST + HEYS_VERDICTS_DIR).
export const VERDICTS_DIR = (
  process.env.HEYS_VERDICT_GUARD_TEST === '1' && process.env.HEYS_VERDICTS_DIR
)
  ? path.resolve(process.env.HEYS_VERDICTS_DIR)
  : path.join(ROOT, 'docs/ui/verdicts');

export const VERDICT_SCHEMA_VERSION = 'typed-v1';
export const ALLOWED_MISMATCH_REASON_CODES = Object.freeze([
  'logic-invariant',
  'accessibility',
  'platform',
  'canvas-conflict',
  'owner-decision',
]);
export const ALLOWED_NA_KINDS = Object.freeze([
  'handoff',
  'foreign-zone',
  'demo-only',
  'designer-removed',
]);

// Миграционный потолок, снятый перед вводом typed-v1. Он разрешает старый долг,
// но не разрешает ему расти: новая зона получает нулевой бюджет, а закрытая
// зона (`verdictSchema: "typed-v1"`) больше не может вернуться к legacy-строкам.
// При типизации зоны числа здесь только уменьшают; после полного сведения зоны
// ставят `verdictSchema: "typed-v1"` в её собственном verdict-файле.
// 3 сентября четыре зоны опущены после пересъёмки отпечатков под пакет от
// 15:18: nutrition-tab 34→31, product-card 67→58 и 76→74, tab-activity 63→62,
// tips 462→447. Это НЕ прогресс, и читать так нельзя: строки не типизировали —
// дизайнер их переписал, вердикт снялся в «?», и untyped-долг ушёл из счёта
// вместе со знанием. Не «у ≠ появился reasonCode», а «самого ≠ больше нет».
// Настоящий долг при этом вырос: 3279 строк без вердикта в двадцати зонах.
// Затянуть заморозку всё равно обязаны — храповик считает текущее состояние.
export const LEGACY_SCHEMA_BASELINE = Object.freeze({
  'app-splash': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, task 152: одна legacy «≠» сведена в «=» (4 → 3); одна типизирована
    // reasonCode — typedMismatch 0 → 1.
    // 06.09, task 163: «Стык · загрузчик · рисунок 01» bulk-closed с reasonCode —
    // mismatch 3 → 2, typedMismatch 1 → 2.
    // 06.09, package 43 agent-9: «Стык · загрузчик · рисунок 02» ink-30 tail → «=»;
    // mismatch 2 → 1.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [3, '2bec6f84d66fc9a3'],
    notApplicable: [42, 'bd8795aa1e28be3e'],
  }),
  // 3 сентября (вечер): числа те же, отпечаток другой. Пакет перевёл четыре
  // значения развилки на роль --ac2, они перестали нумероваться отдельно, и в
  // трёх кадрах сдвинулись номера — тот же долг переехал на другие строки.
  // Это не послабление: 19 и 47 не изменились.
  'checkin-morning': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 04.09: одна legacy «≠» типизирована reasonCode — долг 19 → 18.
    // 06.09, task 152: одна legacy «≠» сведена в «=» (9 → 8); одна типизирована
    // reasonCode — typedMismatch 1 → 2.
    // 06.09, проход по реестру: «Добавки · добавление · 11» — accessibility.
    // 06.09, пакет 43: «Чек-ин · остальное на неделе периода · 23» → «=»;
    // mismatch 8 → 7.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [10, '883f2b62848fe057'],
    notApplicable: [47, '19522329f4fb6522'],
  }),
  'curator-cabinet': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, package 43 agent-9: 5 legacy «≠» закрыты — 1 «=», 4 typed
    // logic-invariant; mismatch 5 → 0, typedMismatch 29 → 33.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [33, '94297aa1faae21b0'],
    notApplicable: [14, 'd5c0e5d25ec8306b'],
  }),
  'curator-edits': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [1, 'b677dfbd0d3317c7'],
    notApplicable: [29, 'f7ac9fda9e37b790'],
  }),
  cycle: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 04.09: typed-v1 gate — 4 typed «≠»; legacy 32 → 21 после типизации и снятия строк.
    // 04.09 (вечер): bde48fd79 закрыл последний «?» — legacy mismatch 21 → 20.
    // 06.09, task 152: disable CTA сведён в «=» (16 → 14); две frame-dispute
    // типизированы reasonCode — typedMismatch 4 → 5.
    // 06.09, package 43 agent-9 (5-zone): 2 legacy «≠» сведены в «=»; mismatch 2 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [15, 'a1b7427e4940bbc2'],
    notApplicable: [22, '6989dc63af608a23'],
  }),
  'date-remainders': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 06.09, проход по ?-долгу: 0 → 1. «Капсула · ночь на 21 августа · 03» —
    // кадр вернулся к стрелке 34×34 пакетом 38 (558d740b3), а именованные строки
    // той же зоны «вид капсулы» (:143) и «тач-цели» (:207) требуют 44, и код
    // держит 44. Спор внутри канваса, записан ≠ canvas-conflict с decisionRef
    // на :143. Это перевод «не смотрели» в судимое, а не новый необоснованный
    // вердикт.
    // 06.09, приёмка пакета 42: спор про 34 против 44 снят самим дизайнером —
    // верна 44, кружки подняты 6 сентября. Прежнее обоснование ≠ на «Капсула ·
    // ночь · 03» («пакет 38 откатил кадр на 34») отпало; строка пересмотрена по
    // существу и осталась ≠ уже по другому: размер сошёлся, расходится тон —
    // кадр rgba(0,0,0,.5), продукт роль --v4-ink-2 (.55), а ступени 50 % в
    // лестнице чернил нет («НЕ ЗАВОДИМ», home-widgets:168).
    // Плюс девять строк двух липких кадров («Дата · сегодня, прокручено»
    // ·45/·46/·48/·49 и «Дата · прошлый день, прокручено» ·39/·40/·41/·42/·43)
    // выведены из «—» в ≠: все девять несли один общий факт «капсулы в кадре
    // нет вовсе», а это и есть её ряд, кружки, подложка, обёртка подписи и сама
    // подпись — подложка того же кадра разобрана строкой ·47 и стоит «=».
    // Отступления названы поимённо: липкость и тень ряда — строки «порог
    // прилипания» (:170) и «вид липкого слоя» (:169); заливка и тон чужого дня —
    // «вид чужого дня» (:149); кегль подписи 12,5 — собственные кадры состояний
    // «Дата · сегодня» ·19 (:233) и «Дата · чужой день» ·19 (:327).
    // typedMismatch 1 → 10, notApplicable 270 → 260.
    // 06.09, приёмка пакета 44: «Капсула · ночь · 03» — var(--ink-2) = --v4-ink-2 → «=»;
    // typedMismatch 10 → 9.
    typedMismatch: [9, '22cfc2945ad9c0ed'],
    // 05.09: одна строка «—» получила naKind handoff — долг типизирован: 271 → 270.
    notApplicable: [260, '7fc4f9975dc981ed'],
  }),
  'food-meal': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 03.09: пакет снял четыре отступления разом — «четыре вкладки», квадрат
    // камеры в подвале, требование убрать «Повторить сегодня», а свайп из
    // строки состава убран кодом. ≠ 40 → 31, «—» 90 → 89.
    // 03.09 (вечер): строка «что отложено» получила naKind handoff — это учёт
    // пакета, а не продуктовое правило. Долг типизирован на единицу: «—» 89 → 88.
    // 04.09: typed-v1 gate — 22 typed «≠»; legacy 31 → 27.
    // 06.09, package 44 + legacy 22: 9 legacy «≠» → 0 (6→=, 5 typed «≠»);
    // typedMismatch 36 → 41.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [41, '5c00c3355b70069b'],
    notApplicable: [87, '21bc4201a8c68471'],
  }),
  gamification: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 03.09: пакет перерисовал четыре кадра церемонии и лист уровней — 60 строк
    // ушли в «?» на пересмотр, 21 строка исчезла из контракта вовсе. Долг упал
    // сам собой: ≠ 52 → 25, «—» 74 → 38. База опущена вслед за ним.
    // 04.09: 683eb9da7 закрыл 60 «?» — часть сведена в «=», часть в «—» без
    // naKind. Долг вырос относительно пониженной базы 03.09: ≠ 25 → 32,
    // «—» 38 → 54.
    // 06.09, package 43 agent-9: ·08/·33/Достижения ·32 ink-2 ladder → «=»;
    // mismatch 27 → 24.
    // 06.09, package 43 agent-9 (5-zone): 4 legacy «≠» — 3 полосы «=» (9 %
    // по строке «вид полосы достижений»), 1 typed logic-invariant (viewBox);
    // mismatch 4 → 0, typedMismatch 20 → 21.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [21, 'b3e0957d79c29014'],
    notApplicable: [53, '6ff13f721aa831ad'],
  }),
  'home-widgets': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 2 сентября: 128 -> 110. Восемнадцать строк «Разбор · … · 78» стояли
    // отступлением по чужому обоснованию (про круг 30x30 и зону нажатия), а
    // сами описывают подпись листа. Замер на живом дереве показал совпадение
    // по всем свойствам после починки Figtree — вердикт стал «=».
    // 3 сентября: notApplicable 1358 -> 1356. Строки «Смена вида · лист выбора»
    // 33 и 36 стояли «—» как адресация разметки кадра; после пересъёмки кадра
    // они называют числа превью 2×2 и карточки «До цели» и сведены с кодом.
    // 05.09: 17 legacy «≠» типизированы reasonCode — долг 71 → 54.
    // 06.09, полоса 2/4: 20 legacy «≠» сведены в «=» по факту кода — 54 → 34.
    // 06.09, package 43 agent-9 (5-zone): 7 legacy «≠» — 5 «=», 1 «?» (Вода ·28),
    // 1 typed logic-invariant (Вес ·24); mismatch 7 → 0, typedMismatch 37 → 38.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [38, '5b531b3a82026aaa'],
    notApplicable: [1356, 'b439428088a4c3d6'],
  }),
  login: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, pkg 43: 7 typed «≠» canvas-conflict по юридическому кеглю — legacy 47 → 46.
    // 06.09, package 44: «Оформление внутри приложения · 74» touch → «=» (1 → 0);
    // typedMismatch 52 → 46 после rehash пакета 44 и закрытия canvas-conflict строк.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [46, '2c4feeca8ab81a9d'],
    notApplicable: [300, '09e96c95595984f5'],
  }),
  // Зона заведена 05.09 вместе с первым разбором messenger.v4.dc.html: 4 typed «≠»
  // — это canvas-conflict по строкам, где продукт ещё не сведён с кадром.
  messenger: Object.freeze({
    typedMismatch: [0, 'e3b0c44298fc1c14'],
  }),
  'norm-correction': Object.freeze({
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [11, '49cc8221f457dea2'],
    // 05.09: одна строка «—» получила naKind handoff — долг типизирован: 37 → 36.
    // 06.09, package 43 agent-9: «строка поправки · 14» — naKind handoff;
    // legacy notApplicable 36 → 35.
    notApplicable: [35, '99a78e2e7b6a685d'],
  }),
  'nutrition-tab': Object.freeze({
    // 04.09: 9e3fc6c3d типизировал 26 legacy «≠» (31 → 5). «—» выросло 168 → 211:
    // закрытие ?-долга ea801dfbb и новые нетипизированные «—» без naKind.
    // 06.09, task 152: swap CTA сведён в «=» — legacy mismatch 1 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 06.09, проход по ?-долгу: 0 → 1. «След записи в чужой день» — строка зоны
    // называет действие бара «Отменить», а владеющий канвас undo-bar.v4.dc.html
    // («слова на экране» :74, «слово действия» :83) снял это слово 31 августа в
    // пользу «Вернуть», и код следует владельцу. ≠ canvas-conflict с decisionRef
    // на undo-bar:83; остальное в строке (текст «Записано в …», 6 с, оба пути
    // записи, капсула на открытом дне) сошлось.
    typedMismatch: [1, '69e78db8bfe74645'],
    notApplicable: [211, 'c56b7bc960bb40c0'],
  }),
  'product-card': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 04.09: e96ffbe90 закрыл 16 «?» rehash-долга — 12→=, 2→—, 2→≠; legacy 58→60, «—» 74→76.
    // 05.09: 35af29731 закрыл ещё 7 «?» того же rehash-долга — mismatch 58→59, «—» 72→76.
    // Рост записан, а не заморожен обратно: это перевод «не смотрели» в судимое,
    // а не появление нового необоснованного вердикта. Отдельный долг зоны при этом
    // назван вслух: у всех 76 «—» нет naKind, а разных фактов на «—» — 26 из 76.
    // 06.09, task 152: одна legacy «≠» сведена в «=» (59 → 58); одна типизирована
    // reasonCode — typedMismatch 0 → 1.
    // 06.09, package 44 + legacy 22: 13 legacy «≠» → 0 (9→=, 6 typed «≠»);
    // typedMismatch 42 → 48.
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 06.09 (вечер): 1 -> 4. Закрыт ?-долг после пакета 5 сентября. Шесть строк
    // «рисунок» пакет привёл к продукту (14 → 17), они стали «=»; три остались
    // отступлением — крест очистки кода и крест удаления порции нарисованы
    // типографским «×», а выбранная карточка «Вредности» взяла песочно-закреплённую
    // роль и не следует синему набору.
    // 06.09, package 43: typed «≠» «Правка · основные · 02» — typedMismatch 4 → 5.
    typedMismatch: [48, 'bfae40c92455cac9'],
    notApplicable: [74, '8b09da5915e34f96'],
  }),
  'pwa-update': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, полоса 2/4: 6 legacy «≠» сведены в «=» по факту кода — 10 → 4.
    // 06.09, package 43 agent-9: три «рисунок 02» spinner tail ink-30 → «=»;
    // mismatch 4 → 1.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [1, 'edfb76352cd2cb1a'],
    notApplicable: [47, '55f97943665ec79d'],
  }),
  questionnaire: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, package 44: touch-target строки ·17 (шаг 3 и 5) → «=»; platform/accessibility
    // типизация ·18–21 и четырёх «рисунок» chevron — mismatch 10 → 0, typed 34 → 39.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [39, '836b30faad6d653a'],
    notApplicable: [7, '18a813a161685464'],
  }),
  registration: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 04.09: Phase1-2 re-review — 2 audit «?» закрыты в «=» (8467957d7, 116a79e09); legacy 67→65.
    // 05.09: 27 legacy «≠» типизированы reasonCode — долг 65 → 38.
    // 06.09, task 152: одна legacy «≠» сведена в «=» (38 → 37); одна типизирована
    // reasonCode — typedMismatch 1 → 2.
    // 06.09, package 43 (reg+hw): ink-лестница — «согласия · 17», «подпись · 15» и
    // 12 tone-строк ≠→=; typed «согласия · 19/20», «Документ · 20», «сохранение · 04»;
    // «Профиль · отзыв · 17» снята дизайнером — legacy mismatch 31→27, typed 2→6,
    // notApplicable 28→27.
    // 06.09, package 44 (registration): 26 tone/role строк → «=»; legacy 10 untyped
    // ≠ разобраны: 2 контраст дорожки → «=», 6 «исчезло» → «?», сон · текст → typed
    // logic-invariant; согласия · 18 canvas-conflict; 2 строки сняты дизайнером.
    // mismatch 10 → 0, typedMismatch 23 → 20.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [20, '24522ebb8228769d'],
    notApplicable: [27, '187e35940cf3b166'],
  }),
  'reports-insights': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 03.09 (вечер): две строки получили naKind handoff — «сведение зоны ·
    // вердикт» и «канон в чужом файле», обе про состояние разбора, а не про
    // продукт. Долг типизирован на две: «—» 136 → 134.
    // 06.09, приёмка пакета 42: «Визуал v4 · Отчёты · 105» … typedMismatch 17 → 18.
    // 06.09, пакет 43: «27», «37», «рисунок 16», «риск срыва · 17» → «=»;
    // «Инсайты · 63» — новый typed ≠ (min-height); mismatch 124 → 120,
    // typedMismatch 18 → 19.
    // 06.09, пакет 43 tail: «Инсайты · ярус Питание · 06» → typed ≠ (meal-rec);
    // typedMismatch 19 → 20.
    // 06.09: 34 legacy «≠» без reasonCode разобраны построчно
    // (scripts/.reports-insights-legacy-34-apply.mjs): 6 → «=», 2 → «?»,
    // 7 → «—» designer-removed, 19 typed «≠»; mismatch 34 → 0,
    // typedMismatch 106 → 125.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [125, 'a6dabb6fedb02be6'],
    notApplicable: [131, '6754e4d70d6ce812'],
  }),
  'service-curator': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, task 152: одна legacy «≠» сведена в «=» (2 → 1); одна типизирована
    // reasonCode — typedMismatch 0 → 1.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [2, 'b360becf15443345'],
    notApplicable: [10, '1a79551c98be8a55'],
  }),
  'settings-system': Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 04.09: ad762ae20 — 4 stale «≠» → «?», 2 «≠» typed reasonCode.
    // Legacy untyped: 13 → 9 (11 total «≠», из них 2 typed-v1).
    // 06.09, пакет 44 + touch: «вид тумблера, список · 10» → «=»; mismatch 2 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [7, 'f000e1ef6e3321d7'],
    notApplicable: [22, '2cbc7eba0ddc099c'],
  }),
  spinners: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, пакет 44 + legacy contrast: две legacy «≠» типизированы
    // canvas-conflict («долгий старт · 03», «вторая неудача · 03»); mismatch 2 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 06.09: 0 -> 13. Массовое закрытие по решению дизайнера — «расхождение
    // видно, принято без разбора». Форму назвал он сам, чтобы «=» не стало
    // ложным доказательством совпадения кадра и кода.
    // 06.09 (вечер), проход по ?-долгу: 13 → 14. «Вид знака» — все числа строки
    // коду совпали (50/2,6 с кругом .28 в index.html:1575, 26/2,75 с хвостом в
    // heys_loading_progress_v1.js:25-34, крест в обеих ветках), расходится одна
    // фраза «третьей геометрии нет»: размеров три, и третий — 18 в кнопке.
    // Соседняя строка того же канваса «вид знака в кнопке» (:127) 6 сентября
    // назвала все три и сказала «верен код». ≠ canvas-conflict с decisionRef
    // на :127 — спор внутри канваса, а не необоснованный вердикт.
    // 06.09, пакет 44: «вторая неудача · 07» canvas-conflict; typedMismatch 26 → 28.
    typedMismatch: [28, '3ce2b620f6ce2101'],
    notApplicable: [33, '2f00fa5302804302'],
  }),
  'strength-builder': Object.freeze({
    // 3 сентября: notApplicable 98 -> 97. Строка «отношение к канону называет
    // сам кадр» типизирована naKind: 'handoff' — она про разметку пакета и его
    // собственную проверку, а не про продукт; новая строка того же долга
    // канваса заведена сразу типизированной.
    // 04.09: Г1 CycleScreen — 34 строк «Программа · цикл · 01–33» + «вид · экран цикла»
    // legacy mismatch 170→0; typedMismatch 169→136 после закрытия цикла;
    // 136→214 после G2 kernel handoff batch (typed-v1 ≠ без смены ключей).
    // 05.09: reverse-coverage aggregate frames + JSON repair — typedMismatch 214→201
    // (13 typed «≠» сведены в «=» при пересмотре кадров пакета 04.09).
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 05.09: полосы 1/3/4 свели М1, М2/М3 и бейджи единиц В3 — 27 typed «≠»
    // стали «=» по факту кода, не по правке числа. Храповик едет только вниз.
    // 05.09: 58 строк «≠» вернулись в «?» — их факт говорил «нужна построчная
    // сверка», то есть вердикт не проверяли. По правилам зоны это вопрос, а не
    // установленное отличие. Храповик едет вниз вслед за фактом: 171 → 113.
    // 05.09, задача 86: 68 строк «?» разобраны построчно и типизированы —
    // typedMismatch 113 → 181. Рост записан, но НЕ означает «сведено»: факт
    // 58 из них говорит, что трёх полноэкранных исходов Л10–Л12 в продукте
    // нет вовсе (heys_strength_proposal_ui_v1.js экспортирует ProposalCard/
    // Review/Outcome, полноэкранные экраны не монтируются). Класс разбора —
    // canvas-conflict-feature, предложение «мы починим кодом»: это наш
    // невыполненный код, а не спор с дизайнером и не долг вердиктов.
    // 05.09, задача 92: экраны Л10–Л12 построены (a90b5dbb1), 55 строк из тех
    // 68 стали «=» по факту кода. Храповик едет вниз: 181 → 102. Это и есть
    // разница между «функционал не закрыт» и «сведено» — первое чинится
    // кодом, и после починки порог обязан упасть, а не остаться про запас.
    // 05.09: 21 typed «≠» сведены в «=» по факту кода — долг 102 → 81.
    // 06.09, полоса 2/4: одна typed «≠» сведена в «=» по факту кода — 81 → 80.
    // 06.09, package 43 strength-builder: два typed «≠» сведены в «=» (спокойнее ·44
    // панель, итоги ·58 «Готово»); один новый «≠» итоги ·57 «В шаблоны» нет в коде.
    // typedMismatch 80 → 79. Три designer-removed ключа сняты rehash — notApplicable
    // 105 → 103.
    typedMismatch: [79, 'd4db647909a38ba2'],
    notApplicable: [103, 'fcfec8ca6a782006'],
  }),
  // Зона заведена 05.09 вместе с первым разбором: прежде записи не было, и
  // порог по всем категориям считался нулевым. 24 типизированных «≠» — это
  // legacy-экран подписки до v4: heys_paywall_v1.js держит blur(4px) и
  // var(--bg-primary), heys_subscriptions_v1.js — инлайновые #f9fafb radius 12
  // вместо карточки --c1 radius 20, иконки эмодзи вместо набора. Строки несут
  // адрес в коде, но зона НЕ сведена: остальные 214 стоят «?» честно и
  // разбираются построчно полосами 2/3/4, а не пакетом.
  subscription: Object.freeze({
    // 05.09, вечер: 24 → 78. Полосы 2/4/5 разобрали кадры пакетов A и C, и
    // строки legacy-экрана стали типизированными. Рост честный, но «78» не
    // означает «проверено»: шесть строк того же набора ссылались на код,
    // которого в файле уже нет (#f9fafb, blur(4px), var(--v4-hero)) — экран
    // свели ПОСЛЕ того, как вердикт написали. Они возвращены в «?», в счёт не
    // входят. Остальные 49 из 78 вообще не называют файл со строкой — это
    // отдельный долг адресов, он назван в задаче полосам.
    // 05.09: 28 typed «≠» сведены в «=» по факту кода — долг 78 → 50.
    // 06.09: разбор 24 «?» зоны. Одна новая typed «≠» — «Подписка · проверьте
    // заказ · 08»: контракт просит чернила 50 %, у лестницы набора такой
    // ступени нет (62/56/55/45/38/30), элемент берёт ближайшую 55 %, красить
    // литералом мимо палитры запрещено — тот же случай, что решение № 49.
    // Долг 51 → 52.
    // 06.09, приёмка пакета 42 в зоне: восемь дефектов кода починены, и двенадцать
    // typed «≠» сведены в «=» по факту кода с замером chromium на обоих наборах —
    // полоса баннера и её пилюля (01-04), те же четыре строки в кадре тоста,
    // корпус тоста (07, 08) и обе прозаические строки «вид · баннер сверху» /
    // «вид · тост на действии». Одна новая: «вид · экран подписки · пробный
    // период» — проза строки просит число дней 34 px, а решение владельца
    // 5 сентября («срок подписки») требует дату 26 px, по которой нарисованы
    // кадр и код. Долг 52 → 41.
    // 06.09, package 43: «Проверьте заказ · 08» ink-2 = продукт — typed 41 → 40.
    typedMismatch: [40, 'c974d197e836c730'],
  }),
  'tab-activity': Object.freeze({
    // 06.09, полоса 2/4: 43 legacy «≠» типизированы reasonCode — mismatch 43 → 0,
    // typedMismatch 1 → 31. Это учёт типизации, не новый необоснованный вердикт.
    // 06.09, package 43 agent-9: «Актив · шаги оценены · 10» ink-2 pill → «=»;
    // typedMismatch 29 → 28.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [28, 'adfbd0ea39f3e76d'],
    notApplicable: [62, 'b3191bb9fbbd6910'],
  }),
  tips: Object.freeze({
    // 06.09, вечер: 344 legacy «≠» типизированы owner-decision по критерию
    // дизайнера (см. UI_V4_FINDINGS_HISTORY#legacy-mismatch-owner-decision-2026-09-06).
    // Разбор — scripts/ui-v4-classify-legacy-mismatch.mjs; вердикт остался «≠».
    // 06.09, legacy touch: «Настройки советов · 09» — canvas-conflict; mismatch 1 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    // 06.09: 0 -> 2. Тот же класс, что у spinners: принято без разбора
    // решением дизайнера, вердикт «≠» с owner-decision.
    // 06.09 (вечер): 2 -> 13. Закрыт ?-долг после пакета 5 сентября: боксы значков
    // шапки разобраны построчно, и одиннадцать строк оказались отступлением —
    // девять по правому полю -8px у ползунков (продукт ставит только
    // margin-block:-14px) и две по открытому состоянию лампочки, которого в коде
    // нет. Рост записан, а не заморожен: это перевод «не смотрели» в судимое.
    // 06.09, приёмка пакета 42: 13 -> 2 и 426 -> 20. Числа упали не потому, что
    // долг закрыли: дизайнер снял из шапки десяти кадров полосу уровня и группу
    // значков и удалил скрытый ряд-дубликат, зона ужалась 700 -> 378 строк, и
    // 322 вердикта уехали вместе со строками, к которым относились (272 «—»,
    // 46 «=», 4 typed «≠» — все четыре были палитровыми копиями «… (2)»).
    // Остальные одиннадцать typed «≠» описывали ползунки и лампочку шапки; после
    // сдвига нумерации те же ключи называют другие элементы, и одиннадцать из
    // них разобраны заново в «=» по факту кода. Долг «—» ушёл иначе: 152 строки
    // пересмотрены и получили naKind (foreign-zone / demo-only / handoff) — это
    // типизация, а не исчезновение. Настоящий остаток зоны назван вслух: 6 строк
    // стоят «?» — «области нажатия», глиф крестика плашки, галочка листа первого
    // совета (две строки), ручка листа и состав ряда кнопок плашки; все шесть
    // ждут дизайнера, записи в docs/ui/UI_V4_FINDINGS.md.
    // 06.09, пакет 44 + legacy touch: «Настройки советов · 09» typed canvas-conflict;
    // typedMismatch 5 → 6.
    typedMismatch: [6, 'a288c63f94557aa0'],
    notApplicable: [20, '39987a10df8b26dc'],
  }),
  'undo-bar': Object.freeze({
    // 03.09: пакет привёл кадры к продукту — во всех трёх «Отмена · … · 09»
    // кнопка теперь «Вернуть», как в коде. Два ≠ сняты, база 3 → 1.
    // 06.09, package 43 agent-9: legacy «≠» типизирован owner-decision; mismatch 1 → 0.
    mismatch: [0, 'e3b0c44298fc1c14'],
    typedMismatch: [1, 'e79b034f829f4aa3'],
    notApplicable: [27, '35eb1b183e2143b5'],
  }),
  'water-add': Object.freeze({
    // Долг ушёл в ноль 2 сентября: обе строки «раскладка плитки» и
    // «вид · плитка воды 1×1» переведены в typed-v1 с reasonCode
    // owner-decision — решение владельца вернуло раскладку кадра.
    mismatch: [0, 'e3b0c44298fc1c14'],
    notApplicable: [43, 'b5fdbc4c25b420fc'],
  }),
});

const MISMATCH_REASON_CODE_SET = new Set(ALLOWED_MISMATCH_REASON_CODES);
const NA_KIND_SET = new Set(ALLOWED_NA_KINDS);
const LEGACY_MISMATCH_ROW_KEYS = Object.freeze(['v', 'f', 'h']);
const TYPED_MISMATCH_ROW_KEYS = Object.freeze([
  'v',
  'f',
  'h',
  'reasonCode',
  'decisionRef',
  'evidence',
]);
const TYPED_MISMATCH_ROW_KEY_SET = new Set(TYPED_MISMATCH_ROW_KEYS);
const DECISION_REF_PLACEHOLDER =
  /^(?:-|—|none|null|n\/a|na|tbd|todo|pending|unknown|нет|неизвестно)$/i;

function mismatchRowExtraKeys(row, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return Object.keys(row || {}).filter((key) => !allowed.has(key));
}

/**
 * Классифицирует строку с v === «≠» по форме записи.
 * Неизвестная форма не пропускается молча — возвращает kind для fail-closed.
 */
export function classifyMismatchVerdictRow(row) {
  const hasReasonCode = hasOwn(row, 'reasonCode');
  const hasDecisionRef = hasOwn(row, 'decisionRef');
  const hasNaKind = hasOwn(row, 'naKind');

  if (hasNaKind) {
    return { form: 'neq-with-naKind', extraKeys: hasNaKind ? ['naKind'] : [] };
  }

  if (hasReasonCode || hasDecisionRef) {
    const extraKeys = mismatchRowExtraKeys(row, TYPED_MISMATCH_ROW_KEYS);
    if (extraKeys.length) {
      return { form: 'typed-v1-extra-keys', extraKeys };
    }
    if (!hasReasonCode || !hasDecisionRef) {
      return {
        form: 'typed-v1-partial',
        missing: !hasReasonCode ? ['reasonCode'] : ['decisionRef'],
      };
    }
    if (hasOwn(row, 'evidence') && !Array.isArray(row.evidence)) {
      return { form: 'typed-v1-invalid-evidence', extraKeys: ['evidence'] };
    }
    return { form: 'typed-v1' };
  }

  const extraKeys = mismatchRowExtraKeys(row, LEGACY_MISMATCH_ROW_KEYS);
  if (extraKeys.length) {
    return { form: 'legacy-extra-keys', extraKeys };
  }
  if (!hasOwn(row, 'f')) {
    return { form: 'legacy-missing-f' };
  }
  return { form: 'legacy' };
}

function hasOwn(row, field) {
  return Object.prototype.hasOwnProperty.call(row || {}, field);
}

function markdownAnchor(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * decisionRef — не произвольная метка, а проверяемый адрес решения в repo:
 * `path/to/file.md:42` либо `path/to/file.md#heading-anchor`.
 */
export function resolveDecisionRef(value, root = ROOT) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || DECISION_REF_PLACEHOLDER.test(text) || path.isAbsolute(text)) {
    return { ok: false, kind: 'invalid-format' };
  }

  const lineMatch = text.match(/^(.+):(\d+)$/);
  const anchorAt = lineMatch ? -1 : text.lastIndexOf('#');
  const relative = lineMatch ? lineMatch[1] : anchorAt > 0 ? text.slice(0, anchorAt) : '';
  const anchor = anchorAt > 0 ? text.slice(anchorAt + 1) : '';
  if (!relative || (!lineMatch && !anchor) || relative.includes('\\')) {
    return { ok: false, kind: 'invalid-format' };
  }

  const file = path.resolve(root, relative);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!file.startsWith(rootPrefix) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { ok: false, kind: 'missing-target' };
  }

  const source = fs.readFileSync(file, 'utf8');
  if (lineMatch) {
    const line = Number(lineMatch[2]);
    const lines = source.split(/\r?\n/).length;
    return line >= 1 && line <= lines
      ? { ok: true, kind: 'line', file, line }
      : { ok: false, kind: 'missing-line', file, line };
  }

  let decodedAnchor;
  try {
    decodedAnchor = decodeURIComponent(anchor);
  } catch {
    return { ok: false, kind: 'invalid-anchor' };
  }
  const headingExists = source.split(/\r?\n/).some((line) => {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    return match && markdownAnchor(match[1]) === decodedAnchor;
  });
  const htmlAnchorExists = new RegExp(
    `(?:id|name)=["']${escapeRegExp(decodedAnchor)}["']`,
    'i',
  ).test(source);
  return headingExists || htmlAnchorExists
    ? { ok: true, kind: 'anchor', file, anchor: decodedAnchor }
    : { ok: false, kind: 'missing-anchor', file, anchor: decodedAnchor };
}

export function legacyVerdictKeysDigest(keys) {
  return crypto
    .createHash('sha256')
    .update([...keys].sort().join('\n'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Проверяет typed-v1 и возвращает одновременно ошибки и измеримый legacy-долг.
 * `baseline` параметризован для unit-тестов; production всегда использует
 * зафиксированный LEGACY_SCHEMA_BASELINE.
 */
export function inspectVerdictSchema(
  data,
  { zoneIds = null, baseline = LEGACY_SCHEMA_BASELINE } = {},
) {
  const problems = [];
  const legacyByZone = {};

  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;

    const closed = zone?.verdictSchema === VERDICT_SCHEMA_VERSION;
    if (hasOwn(zone, 'verdictSchema') && !closed) {
      problems.push({
        zoneId,
        key: null,
        kind: 'invalid-schema-version',
        value: zone?.verdictSchema,
      });
    }

    const legacyKeys = { mismatch: [], typedMismatch: [], notApplicable: [] };
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      const verdict = row?.v;
      const hasReasonCode = hasOwn(row, 'reasonCode');
      const hasDecisionRef = hasOwn(row, 'decisionRef');
      const hasNaKind = hasOwn(row, 'naKind');

      if (verdict === '≠') {
        const shape = classifyMismatchVerdictRow(row);
        if (shape.form === 'legacy' || shape.form === 'legacy-missing-f') {
          legacyKeys.mismatch.push(key);
        } else if (
          shape.form === 'typed-v1' ||
          shape.form === 'typed-v1-partial' ||
          hasReasonCode ||
          hasDecisionRef
        ) {
          if (shape.form === 'typed-v1-extra-keys' || shape.form === 'neq-with-naKind') {
            problems.push({
              zoneId,
              key,
              kind: 'unknown-mismatch-form',
              form: shape.form,
              extraKeys: shape.extraKeys,
              missing: shape.missing,
            });
            continue;
          }
          if (!hasReasonCode) {
            problems.push({ zoneId, key, kind: 'invalid-reason-code', value: row?.reasonCode });
          } else if (!MISMATCH_REASON_CODE_SET.has(row?.reasonCode)) {
            problems.push({ zoneId, key, kind: 'invalid-reason-code', value: row?.reasonCode });
          }
          if (!hasDecisionRef) {
            problems.push({
              zoneId,
              key,
              kind: 'invalid-decision-ref',
              value: row?.decisionRef,
              resolution: 'invalid-format',
            });
          } else {
            const decision = resolveDecisionRef(row?.decisionRef);
            if (!decision.ok) {
              problems.push({
                zoneId,
                key,
                kind: 'invalid-decision-ref',
                value: row?.decisionRef,
                resolution: decision.kind,
              });
            }
          }
          if (shape.form === 'typed-v1') {
            legacyKeys.typedMismatch.push(key);
          }
        } else {
          problems.push({
            zoneId,
            key,
            kind: 'unknown-mismatch-form',
            form: shape.form,
            extraKeys: shape.extraKeys,
            missing: shape.missing,
          });
        }
        continue;
      }

      if (verdict === '—') {
        if (!hasNaKind) {
          legacyKeys.notApplicable.push(key);
        } else if (!NA_KIND_SET.has(row?.naKind)) {
          problems.push({ zoneId, key, kind: 'invalid-na-kind', value: row?.naKind });
        }
        if (hasReasonCode || hasDecisionRef) {
          problems.push({ zoneId, key, kind: 'unexpected-mismatch-decision' });
        }
        continue;
      }

      if (hasReasonCode || hasDecisionRef || hasNaKind) {
        problems.push({ zoneId, key, kind: 'unexpected-schema-fields', verdict });
      }
    }

    const legacy = {
      mismatch: legacyKeys.mismatch.length,
      typedMismatch: legacyKeys.typedMismatch.length,
      notApplicable: legacyKeys.notApplicable.length,
    };
    legacyByZone[zoneId] = legacy;
    const empty = [0, legacyVerdictKeysDigest([])];
    const allowance = closed
      ? { mismatch: empty, typedMismatch: empty, notApplicable: empty }
      : {
          mismatch: empty,
          typedMismatch: empty,
          notApplicable: empty,
          ...(baseline[zoneId] || {}),
        };
    for (const field of ['mismatch', 'typedMismatch', 'notApplicable']) {
      if (closed && field === 'typedMismatch') continue;
      const [allowedCount = 0, allowedDigest = empty[1]] = allowance[field] || empty;
      const actualDigest = legacyVerdictKeysDigest(legacyKeys[field]);
      if (legacy[field] !== allowedCount || actualDigest !== allowedDigest) {
        problems.push({
          zoneId,
          key: null,
          kind:
            legacy[field] > allowedCount
              ? 'legacy-baseline-exceeded'
              : legacy[field] < allowedCount
                ? 'legacy-baseline-must-decrease'
                : 'legacy-baseline-keys-changed',
          category: field,
          actual: legacy[field],
          allowed: allowedCount,
          actualDigest,
          allowedDigest,
        });
      }
    }
  }

  return { problems, legacyByZone };
}

/** Имя файла зоны. Зона — идентификатор канваса, без путей и расширений. */
export function zonePath(zoneId) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(zoneId || ''))) {
    throw new Error(`Недопустимый id зоны: «${zoneId}»`);
  }
  return path.join(VERDICTS_DIR, `${zoneId}.json`);
}

export function listZoneIds() {
  if (!fs.existsSync(VERDICTS_DIR)) return [];
  return fs
    .readdirSync(VERDICTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function readZone(zoneId) {
  const file = zonePath(zoneId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Все зоны разом — в той же форме, что отдавал прежний общий снимок
 * (`{ zones: { id: … } }`), чтобы читателям не пришлось менять код.
 */
export function readAllZones() {
  const zones = {};
  for (const id of listZoneIds()) {
    const zone = readZone(id);
    if (zone) zones[id] = zone;
  }
  return { zones };
}

/** Same-directory temp + rename — readers never see a half-written zone file. */
function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
}

const ZONE_LOCK_DISABLED = process.env.HEYS_VERDICT_DISABLE_ZONE_LOCK === '1';
const ZONE_RMW_DELAY_MS = Number(process.env.HEYS_VERDICT_RMW_DELAY_MS || 0);

function zoneLockPath(zoneId) {
  return path.join(VERDICTS_DIR, `.${zoneId}.json.write.lock`);
}

function sleepSync(ms) {
  if (ms <= 0) return;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    // Sync spin — scripts only; keeps RMW window open for guard tests.
  }
}

function readZoneLockPayload(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

function isStaleZoneLock(lockPath) {
  const payload = readZoneLockPayload(lockPath);
  if (!payload?.pid) return true;
  if (payload.time && Date.now() - payload.time > 120_000) return true;
  try {
    process.kill(payload.pid, 0);
    return false;
  } catch {
    return true;
  }
}

function acquireZoneWriteLock(zoneId, { timeoutMs = 60_000 } = {}) {
  if (ZONE_LOCK_DISABLED) return null;
  const lockPath = zoneLockPath(zoneId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, time: Date.now() }), 'utf8');
      return { lockPath, fd };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (isStaleZoneLock(lockPath)) {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Another writer may have won the race — retry.
        }
        continue;
      }
      sleepSync(5 + Math.floor(Math.random() * 10));
    }
  }
  throw new Error(`Не удалось захватить lock зоны «${zoneId}» за ${timeoutMs}ms`);
}

function releaseZoneWriteLock(handle) {
  if (!handle) return;
  try {
    fs.closeSync(handle.fd);
  } catch {
    // ignore close failure
  }
  try {
    fs.unlinkSync(handle.lockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/** Cross-process mutex for one zone file's read-modify-write cycle. */
export function withZoneWriteLock(zoneId, fn, { timeoutMs = 60_000 } = {}) {
  const handle = acquireZoneWriteLock(zoneId, { timeoutMs });
  try {
    return fn();
  } finally {
    releaseZoneWriteLock(handle);
  }
}

function maybeRmwDelay() {
  if (process.env.HEYS_VERDICT_GUARD_TEST === '1' && ZONE_RMW_DELAY_MS > 0) {
    sleepSync(ZONE_RMW_DELAY_MS);
  }
}

/** Re-read zone on disk, mutate one row, write — merges concurrent key updates. */
function writeZoneRowMutation(zoneId, key, mutateRow) {
  const fresh = readZone(zoneId);
  if (!fresh?.rows?.[key]) throw new Error(`Строки «${key}» в зоне «${zoneId}» нет.`);
  mutateRow(fresh.rows[key], fresh);
  writeZone(zoneId, fresh);
}

export function writeZone(zoneId, zone) {
  fs.mkdirSync(VERDICTS_DIR, { recursive: true });
  writeFileAtomic(zonePath(zoneId), `${JSON.stringify(zone, null, 2)}\n`);
}

const VALID_VERDICTS = new Set(['=', '≠', '?', '—']);

/** Mutate one row's verdict fields (does not read/write zone file). */
export function applyVerdictToRow(row, { verdict, fact, options = {} }, root = ROOT) {
  if (!VALID_VERDICTS.has(verdict)) throw new Error(`Вердикт «${verdict}» не из набора = ≠ ? —`);
  if (!fact) throw new Error('Факт обязателен: назовите доказательство или причину неизвестности.');

  const reasonCode = options['reason-code'];
  const decisionRef = options['decision-ref'];
  const naKind = options['na-kind'];

  if (verdict === '≠') {
    if (!MISMATCH_REASON_CODE_SET.has(reasonCode)) {
      throw new Error(`Для ≠ нужен --reason-code: ${ALLOWED_MISMATCH_REASON_CODES.join(', ')}`);
    }
    const decision = resolveDecisionRef(decisionRef, root);
    if (!decision.ok) {
      throw new Error(`Для ≠ нужен разрешимый --decision-ref (получено: ${decisionRef || 'пусто'})`);
    }
    if (naKind) throw new Error('--na-kind допустим только для —');
  } else if (verdict === '—') {
    if (!NA_KIND_SET.has(naKind)) {
      throw new Error(`Для — нужен --na-kind: ${ALLOWED_NA_KINDS.join(', ')}`);
    }
    if (reasonCode || decisionRef) throw new Error('--reason-code/--decision-ref допустимы только для ≠');
  } else if (reasonCode || decisionRef || naKind) {
    throw new Error('Typed-поля допустимы только для ≠ или —');
  }

  row.v = verdict;
  row.f = fact;
  delete row.reasonCode;
  delete row.decisionRef;
  delete row.naKind;
  if (verdict === '≠') {
    row.reasonCode = reasonCode;
    row.decisionRef = decisionRef;
  } else if (verdict === '—') {
    row.naKind = naKind;
  }
  return row;
}

export const STALE_HANDOFF_SKIP_MESSAGE = 'строка уже сведена позже, пропущена';

const SETTLED_VERDICTS = new Set(['=', '≠', '—']);

/**
 * Handoff apply guard: overwrite a live row only when it is still «?» or the handoff
 * snapshot `h` matches the live row (idempotent re-apply). Otherwise skip stale payload.
 *
 * @param {object|null|undefined} liveRow
 * @param {string} handoffVerdict verdict from handoff payload (`v` / recommend)
 * @param {{ allowDowngrade?: boolean, handoffH?: string|null, handoff?: boolean }} opts
 * @returns {{ skip: boolean, reason?: string, message?: string }}
 */
export function shouldSkipStaleHandoff(liveRow, handoffVerdict, {
  allowDowngrade = false,
  handoffH,
  handoff = handoffH != null,
} = {}) {
  if (allowDowngrade) return { skip: false };

  const liveV = liveRow?.v;
  if (liveV === '?') return { skip: false };

  const liveH = liveRow?.h;
  if (handoffH != null && handoffH === liveH) return { skip: false };

  if (handoff || handoffH != null) {
    if (SETTLED_VERDICTS.has(liveV)) {
      return {
        skip: true,
        reason: handoffH != null && handoffH !== liveH ? 'row-settled-later' : 'stale-handoff-settled',
        message: STALE_HANDOFF_SKIP_MESSAGE,
      };
    }
    return { skip: false };
  }

  // Legacy path (callers without handoff flag): neq-audit «≠» must not downgrade live «=».
  if (handoffVerdict === '≠' && liveV === '=') {
    return {
      skip: true,
      reason: 'stale-handoff-neq-over-eq',
      message: STALE_HANDOFF_SKIP_MESSAGE,
    };
  }
  return { skip: false };
}

/**
 * Etalon: fresh readZone → mutate one key → writeZone. Use for every batch verdict write.
 * Handoff re-runs: pass `{ handoff: true, handoffH }` — settled rows with a newer `h` are skipped.
 */
export function setVerdictKey(zoneId, key, patch, opts = {}) {
  return withZoneWriteLock(zoneId, () => {
    const {
      root = ROOT,
      skipIf,
      dryRun = false,
      handoffH,
      handoff = handoffH != null,
      allowDowngrade = false,
    } = opts;
    const zone = readZone(zoneId);
    if (!zone) throw new Error(`Зоны «${zoneId}» нет.`);
    const row = zone.rows[key];
    if (!row) throw new Error(`Строки «${key}» в зоне «${zoneId}» нет.`);
    if (skipIf?.(row)) return { skipped: true, reason: 'skipIf', was: { v: row.v, f: row.f, h: row.h } };

    const guard = shouldSkipStaleHandoff(row, patch.verdict, { allowDowngrade, handoffH, handoff });
    if (guard.skip) {
      return {
        skipped: true,
        reason: guard.reason,
        message: guard.message,
        was: { v: row.v, f: row.f, h: row.h },
      };
    }

    const was = { v: row.v, f: row.f, h: row.h };
    applyVerdictToRow(row, patch, root);
    maybeRmwDelay();
    if (!dryRun) {
      writeZoneRowMutation(zoneId, key, (targetRow) => applyVerdictToRow(targetRow, patch, root));
    }
    return { skipped: false, was, now: { v: row.v, f: row.f, h: row.h } };
  });
}

/**
 * Fresh read → mutate one row (any fields, e.g. rehash `h`) → write.
 */
export function patchZoneRow(zoneId, key, mutator, { dryRun = false } = {}) {
  return withZoneWriteLock(zoneId, () => {
    const zone = readZone(zoneId);
    if (!zone?.rows?.[key]) throw new Error(`Строки «${key}» в зоне «${zoneId}» нет.`);
    const before = JSON.stringify(zone.rows[key]);
    mutator(zone.rows[key], zone);
    const changed = JSON.stringify(zone.rows[key]) !== before;
    maybeRmwDelay();
    if (changed && !dryRun) {
      writeZoneRowMutation(zoneId, key, (targetRow, freshZone) => mutator(targetRow, freshZone));
    }
    return { changed, row: zone.rows[key] };
  });
}

/** Delete one verdict row with fresh read before write (rehash «gone» keys). */
export function deleteZoneRow(zoneId, key, { dryRun = false } = {}) {
  return withZoneWriteLock(zoneId, () => {
    const zone = readZone(zoneId);
    if (!zone?.rows?.[key]) return { deleted: false };
    delete zone.rows[key];
    maybeRmwDelay();
    if (!dryRun) {
      const fresh = readZone(zoneId);
      if (!fresh?.rows?.[key]) return { deleted: false };
      delete fresh.rows[key];
      writeZone(zoneId, fresh);
    }
    return { deleted: true };
  });
}
