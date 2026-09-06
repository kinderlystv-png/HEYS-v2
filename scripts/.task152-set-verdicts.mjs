import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

/** Task 146 audit — 14 non-minor rows (task 152). Per-key only. */
const updates = [
  {
    zone: 'product-card',
    key: 'Штрихкод · состояния · 18',
    verdict: '≠',
    fact:
      'поле EAN/UPC постоянно открыто над сканером (heys_add_product_step_v1.js:3993-4006), а не за нижней кнопкой «Ввести код цифрами»; функциональный контракт ручного ввода выполнен — см. строку «Штрихкод · состояния · 17»',
    options: {
      'reason-code': 'canvas-conflict',
      'decision-ref': 'apps/web/heys_add_product_step_v1.js:3993',
    },
  },
  {
    zone: 'registration',
    key: 'Регистрация · подписано · текст',
    verdict: '≠',
    fact:
      'копия и смысл совпадают; версия «Обработка персональных данных» в продукте — 1.0 из legal registry (heys_legal_versions_v1.js:16, heys_consents_v1.js:47), кадр рисует демо «в. 1.4»',
    options: {
      'reason-code': 'logic-invariant',
      'decision-ref': 'apps/web/heys_legal_versions_v1.js:16',
    },
  },
  {
    zone: 'nutrition-tab',
    key: 'совет с заменой',
    verdict: '=',
    fact:
      'heys_day_meal_optimizer_section.js:128-141 — productCta swap рендерит «Заменить → {name}»; правило с swap в heys_meal_optimizer_v1.js:865',
  },
  {
    zone: 'app-splash',
    key: 'уменьшенное движение',
    verdict: '≠',
    fact:
      'дуга вращается с первого кадра; при prefers-reduced-motion — дыхание 1,6 с по контракту spinners «без анимации» (heys-boot-mark.css:482), а не статичный диск до 300 мс как в app-splash',
    options: {
      'reason-code': 'owner-decision',
      'decision-ref': 'docs/ui/verdicts/spinners.json:76',
    },
  },
  {
    zone: 'checkin-morning',
    key: 'Чек-ин · остальное на неделе периода · текст',
    verdict: '≠',
    fact:
      'контракт «слова на экране»: состояния «замер идёт…» нет — кадр переснимается; продукт без этой строки (rg apps/web — 0); остальная копия сведена',
    options: {
      'reason-code': 'canvas-conflict',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/checkin-morning.v4.dc.html:82',
    },
  },
  {
    zone: 'curator-edits',
    key: 'переход по строке',
    verdict: '≠',
    fact:
      'heys_curator_actions_banner_v1.js:2236-2237 — тап строки подтверждает запись на сервере при нуле видимых действий (:1902-1915); контракт data-v: «не подтверждает». Смоук curator-actions-banner.test.js',
    options: {
      'reason-code': 'logic-invariant',
      'decision-ref': 'apps/web/heys_curator_actions_banner_v1.js:2237',
    },
  },
  {
    zone: 'cycle',
    key: 'Цикл · профиль, выключение · текст',
    verdict: '=',
    fact:
      'heys_user_tab_impl_v1.js:1384-1387 — диалог «Выключить особый период?» с текстом «…цель вернётся к базовой…» как в контракте',
  },
  {
    zone: 'cycle',
    key: 'Цикл · график веса · текст',
    verdict: '≠',
    fact:
      'heys_day_stats_v1.js:4132 — заголовок «Вес · 30 дней» (reports v4), кадр cycle требует «Вес и тренд»; подпись «Пустые точки…» — пояснение канваса',
    options: {
      'reason-code': 'owner-decision',
      'decision-ref': 'apps/web/heys_day_stats_v1.js:4132',
    },
  },
  {
    zone: 'first-run',
    key: 'иконки',
    verdict: '≠',
    fact:
      'тур и desktop gate на emoji (👋🍽️📱💡), Lucide layout-grid/plus/compass/bar-chart-2/copy/smartphone/log-out в onboarding/desktop gate не рендерятся',
    options: {
      'reason-code': 'logic-invariant',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/first-run.v4.dc.html:99',
    },
  },
  {
    zone: 'first-run',
    key: 'вид · плашка «обзор пройден»',
    verdict: '≠',
    fact:
      'продуктовый finish() не монтирует .heys-undo-bar с текстом контракта; только fixture pushUndoToast',
    options: {
      'reason-code': 'logic-invariant',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/first-run.v4.dc.html:104',
    },
  },
  {
    zone: 'norm-correction',
    key: 'Pro · куратор решил не менять · 01',
    verdict: '≠',
    fact:
      'шапку понедельничной шторки рисует шторка, не карточка; пилюли состояния в шапке нет — состояние в заголовке карточки',
    options: {
      'reason-code': 'owner-decision',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/norm-correction.v4.dc.html:715',
    },
  },
  {
    zone: 'service-curator',
    key: 'фича',
    verdict: '≠',
    fact:
      'именованная строка — версия/SW/кеш/выход; кадр «Служебное · за входом куратора» — Техлог/Диагностика/Пул правил (day/_advice.js:462-533). Конфликт именованных строк vs кадра',
    options: {
      'reason-code': 'canvas-conflict',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/service-curator.v4.dc.html:6',
    },
  },
  {
    zone: 'strength-builder',
    key: 'Куратор и зал · 04',
    verdict: '≠',
    fact:
      'подзаголовок fmtTime, без «что приходит от куратора…»: heys_strength_builder_ui_v1.js:1211-1213',
    options: {
      'reason-code': 'canvas-conflict',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:3312',
    },
  },
  {
    zone: 'tab-activity',
    key: 'Актив · день собран · текст',
    verdict: '≠',
    fact:
      'копия сведена; при плане на сегодня — карточка «план назначен» (решение 31.08), а не компактная строка кадра ·16–17',
    options: {
      'reason-code': 'owner-decision',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tab-activity.v4.dc.html:558',
    },
  },
];

for (const row of updates) {
  const { was } = setVerdictKey(row.zone, row.key, {
    verdict: row.verdict,
    fact: row.fact,
    options: row.options ?? {},
  });
  console.log(`${row.zone} :: ${row.key}   ${was.v} → ${row.verdict}`);
}

console.log('done', updates.length);
