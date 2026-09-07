#!/usr/bin/env node
/** Package 47 acceptance — home-widgets, checkin-morning, subscription, date-remainders. */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import {
  assertForeignRowsUnchanged,
  snapshotForeignRowStrings,
} from './lib/handoff-batch-apply.mjs';

const ROWS = {
  'home-widgets': [
    ['вид плитки', '=', '730-widgets-dashboard.css .widget — radius 16, padding 11px; hero calories 14px; kicker/value/unit по строке'],
    ['вид · кольца БЖУ', '=', '730-widgets-dashboard.css .widget-macros__ring — svg 46, stroke 5, gap 6; widgets-bd-sheet-canvas-razbor'],
    ['вид · столбики шагов', '=', '730-widgets-dashboard.css .widget-steps__bar — 7 столбиков, gap 3, radius 2 top'],
    ['вид · риск-радар', '=', '730-widgets-dashboard.css .widget-relapse-risk — label 24/600, segments 6px gap 4'],
    ['вид · инсулиновая волна', '=', '730-widgets-dashboard.css .widget-v4-wave — domes #e6cfa8, baseline ink 10%'],
    ['вид · полоса клетчатки и белка', '=', '730-widgets-dashboard.css .widget-v4-track — height 4, radius 999, fill --gr2'],
    ['волна · ночная оценка', '=', 'heys_widgets_ui_v1.js insulin wave night state + 730-widgets .widget-v4-wave--night'],
    ['вид · значок вместо эмодзи', '=', 'heys_widgets_ui_v1.js WidgetGlyph 15×15 stroke 2.75 --ac'],
    ['вид счётчика места', '=', 'heys_widgets_ui_v1.js widget-v4-catalog__budget — 11px/600 ink-3, без полосы'],
    ['шапка листа', '=', '730-widgets-dashboard.css .widget-bd-sheet__title 15/700 + close 30px --c1'],
    ['герой листа', '=', '730-widgets-dashboard.css .widget-bd-sheet__hero — kicker 10/700, num 44/600'],
    ['подпись метрики', '=', '730-widgets-dashboard.css .widget-bd-sheet__metric-label 11/600 ink-4'],
    ['разбор числами', '=', '730-widgets-dashboard.css .widget-bd-sheet__stats — rows 11/500, gap 16 от графика'],
    ['строка нормы', '=', '730-widgets-dashboard.css .widget-bd-sheet__norm 11.5/500 ink-2 margin-top 14'],
    ['кофеин без данных', '=', 'heys_widgets_ui_v1.js caffeine field — «нет данных» ink-4 до первого ввода'],
    ['Шторка · Вода · 28', '=', '730-widgets-dashboard.css:14922-14937 .widget-v4-water-rhythm flex-end gap 4 h24; __body margin-top auto — кадр переснят под продукт (ОТВЕТ-22 Q8)'],
    ['удаление', '=', 'ОТВЕТ-22 Q6: heys_widgets_ui_v1.js tryEditRemoveTap в editMode → onRemove; 730-widgets delete-btn 22px pointer-events none accessory'],
    ['нажатие', '=', '730-widgets-dashboard.css .widgets-quick-pencil__host::after inset -2px — inner host variant B (ОТВЕТ-22 Q6)'],
  ],
  'checkin-morning': [
    ['вид пилюли-ответа', '=', 'apps/web/styles/modules/610-checkin-morning.css — pill 700 ink-2 inset border 1.5'],
    ['вид кнопок футера', '=', '610-checkin-morning.css .checkin-footer__btn primary 48/acs + secondary flex 1 ink-2'],
    ['вид развилки', '=', '610-checkin-morning.css .checkin-branch — header ink-4 11/600, cards gap 16'],
    ['вид карточки сводки', '=', '610-checkin-morning.css .checkin-summary-card — c1 r20 p16, rows baseline gap 13'],
    ['вид строк-ответов', '=', '610-checkin-morning.css .checkin-outcome-row — primary 48 acs, ghost ink-3 44'],
    ['вид дорожки', '=', '610-checkin-morning.css .checkin-slider — track 4px, thumb 44px, 3 fill steps (31 авг решение)'],
    ['вид строки значения над дорожкой', '=', '610-checkin-morning.css .checkin-slider__label 12.5/700 + value 13/700 ac'],
    ['капсула веса', '=', '610-checkin-morning.css .checkin-weight-capsule — wheels 212 r22 padding 13/12/16'],
    ['вид карточки шага', '=', '610-checkin-morning.css .checkin-step-card — hero 54/600 ac, answers как outcome rows'],
    ['вид · резервный вопрос после еды', '=', 'heys_checkin_v1.js centered dialog layer, не bottom sheet (3 сент владелец)'],
    ['календарь в резервном вопросе', '=', 'heys_checkin_v1.js вставляет tab-activity calendar block по контракту'],
    ['вид · причина пропуска', '=', '610-checkin-morning.css .checkin-skip-reason — pills как outcome rows'],
    ['замеры на неделе периода', '=', '610-checkin-morning.css .checkin-week-measures — 7 cells ink-3 9.5/600'],
    ['вид плашки согласия', '=', '610-checkin-morning.css .checkin-consent — tint card r18 p14'],
    ['вид поля поиска', '=', '610-checkin-morning.css .checkin-search — min-height 44, ink-2 placeholder'],
  ],
  subscription: [
    ['вид · подписка в настройках', '=', 'heys_user_tab_impl_v1.js settings row «Подписка» 13/600 + meta 12/600 ink-2'],
    ['вид · экран подписки · пробный период', '=', 'heys_subscriptions_v1.js:1310-1323 formatSubscriptionHeadlineDate 26/800; 735-ui-v4-subscription.css .sub-screen__headline'],
    ['вид · экран подписки · активна', '=', 'то же headline date по строке «срок подписки» 5 сент — не «N дней»'],
    ['вид · экран подписки · только чтение', '=', 'heys_subscriptions_v1.js:1289-1305 readonly card --tint + CTA support'],
    ['вид · приветствие', '=', 'heys_trial_queue_v1.js welcome modal — 19/700 title, без эмодзи'],
    ['вид · баннер сверху', '=', 'heys_subscriptions_v1.js trial banner --tint sticky, CTA acs/on-acs 12/700'],
    ['вид · контакт поддержки', '=', 'heys_subscriptions_v1.js support modal lock 44 tint'],
    ['вид · тарифы', '=', 'heys_paywall_v1.js tariffs modal — cards 56min r18, trial block --c2'],
    ['вид · карточка тарифа', '=', '735-ui-v4-subscription.css .paywall-plan — r18 inset border, badge -9px'],
    ['вид · блок пробного периода', '=', 'heys_paywall_v1.js trial queue card states 44px buttons'],
    ['вид · проверьте заказ', '=', 'heys_paywall_v1.js order review modal --c1 card r18'],
    ['отмена и возврат', '=', 'heys_subscriptions_v1.js cancel copy 12.5/500 ink-2 в footer screen'],
  ],
  'date-remainders': [
    ['вид шторки календаря', '=', '000-base:8277-8306 sheet r26 p18/16/16 handle 38×4; legend 9.5/700 ink-4; month-nav 44 margin 0 — гейт date-remainders-v4-canvas-razbor'],
    ['вид клетки', '=', '000-base:8319-8407 cell 42×44 r14 num 12.5 dot 4 gap 3 selected --c2; date-remainders-v4-cell.test.js'],
  ],
};

function applyZone(zoneId, rows) {
  const keys = new Set(rows.map((r) => r[0]));
  const before = snapshotForeignRowStrings(readZone(zoneId).rows, keys);
  for (const [key, verdict, fact] of rows) {
    const result = setVerdictKey(zoneId, key, { verdict, fact });
    if (result.skipped) throw new Error(`${zoneId} :: ${key} skipped: ${result.reason}`);
    console.log(`${zoneId} :: ${key} → ${verdict}`);
  }
  assertForeignRowsUnchanged(before, readZone(zoneId).rows);
}

for (const [zoneId, rows] of Object.entries(ROWS)) {
  applyZone(zoneId, rows);
}
console.log('package47 four zones verdicts applied');
