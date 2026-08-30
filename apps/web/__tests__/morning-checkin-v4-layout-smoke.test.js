import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const DAILY_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'), 'utf8');
const PALETTE_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'), 'utf8');
const YV_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/715-yesterday-verify.css'), 'utf8');
const FIGTREE_FONT = path.resolve(__dirname, '../public/fonts/figtree/Figtree-Variable.ttf');

describe('morning check-in v4 layout vs canvas', () => {
  it('daily chrome: terracotta pills, full-width single primary, no green override', () => {
    expect(fs.existsSync(FIGTREE_FONT)).toBe(true);
    expect(PALETTE_CSS).toContain("url('/fonts/figtree/Figtree-Variable.ttf')");
    expect(DAILY_CSS).toMatch(/\.mc-progress-dots--pills \.mc-progress-dot\.active \{[\s\S]*?background: var\(--v4-sand-act, #c67139\)/);
    expect(DAILY_CSS).toContain('.mc-daily-footer-primary:only-child');
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-daily-footer-primary.mc-btn--primary');
    expect(DAILY_CSS).toContain('.mc-daily-header-caption');
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-header-spacer');
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-daily-greeting-title');
    expect(DAILY_CSS).toMatch(/\.mc-modal--daily \.mc-daily-greeting-title[\s\S]*text-align:\s*center/);
    expect(DAILY_CSS).toMatch(/\.mc-modal--daily \.mc-daily-greeting-date[\s\S]*text-align:\s*center/);
    expect(DAILY_CSS).toMatch(/mc-daily-streak-banner[\s\S]*--v4-sand-surface, #f7efe2/);
    expect(DAILY_CSS).toContain('padding: 16px 18px 0');
    // Было `padding: 14px 18px 12px` — прежние поля содержимого шага. Контракт
    // «вид шага» задаёт 16/18/0 (низ держит футер 12/18/20), поэтому проверка
    // переехала на контрактное значение выше и на футер 12/18/20.
    expect(DAILY_CSS).toMatch(/\.mc-daily-footer \{[\s\S]*?padding: 12px 18px calc\(20px/);
    expect(DAILY_CSS).toContain('border-radius: 28px');
    expect(DAILY_CSS).toContain('.mc-backdrop:has(.mc-modal--daily)');
    expect(STEPS_SRC).toContain('borderRadius: 20');
    expect(STEPS_SRC).toContain('borderRadius: 16');
    expect(DAILY_CSS).toContain('border-radius: 20px !important');
    expect(DAILY_CSS).toContain('border-radius: 16px !important');
    expect(MODAL_SRC).toContain('headerCaption');
    expect(MODAL_SRC).toContain('showHeaderBack');
    expect(MODAL_SRC).toMatch(/function registerStep[\s\S]*?showHeaderBack:/);
    expect(MODAL_SRC).toMatch(/function registerStep[\s\S]*?applyHeaderBack:/);
    expect(MODAL_SRC).toContain('applyLayerHeaderBack');
    expect(MODAL_SRC).toContain('showDailyStepBack');
    expect(MODAL_SRC).toContain('mc-header-back-icon');
    expect(MODAL_SRC).toContain('currentStepIndex > 0');
    expect(MODAL_SRC).toContain('mc-v4-scale');
  });

  it('weight screens: greeting, kilo card, week delta, first morning, estimate copy', () => {
    expect(STEPS_SRC).toContain('Вес на утро');
    expect(STEPS_SRC).toContain('Килограммы');
    // Было 186px — ширина с кадра. Контракт «капсула веса»: 212 px, радиус 22,
    // поля 13/12/16; кадр «Чек-ин · вес» рисует то же самое.
    expect(DAILY_CSS).toMatch(/\.mc-weight-kilo-card \{[\s\S]*?width:\s*212px/);
    expect(DAILY_CSS).toMatch(/\.mc-weight-kilo-card \{[\s\S]*?border-radius:\s*22px/);
    expect(DAILY_CSS).toMatch(/\.mc-weight-kilo-card \{[\s\S]*?padding:\s*13px 12px 16px/);
    expect(STEPS_SRC).toContain('кг за неделю');
    expect(STEPS_SRC).toContain('первый день недели');
    expect(STEPS_SRC).toContain('Динамика появится через неделю взвешиваний.');
    expect(STEPS_SRC).toContain('Из профиля — поправьте, если весы показывают другое');
    expect(STEPS_SRC).toContain('Серия растёт как обычно.');
    expect(STEPS_SRC).toContain('buildStepsGoalNarrative');
    expect(STEPS_SRC).toContain('Обычно вы проходите около');
    expect(STEPS_SRC).toContain('mc-steps-info-card');
    expect(STEPS_SRC).toContain('mc-note-toggle-icon');
    expect(STEPS_SRC).toContain('mc-weight-week-delta--down');
    expect(STEPS_SRC).toContain('mc-daily-greeting-title');
    expect(STEPS_SRC).toMatch(/mc-weight-pickers[\s\S]*compact: true/);
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-wheel-value--current');
    expect(DAILY_CSS).toMatch(/\.mc-modal--daily \.mc-wheel-value--current[\s\S]*#8a4a20/);
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-btn.mc-daily-footer-primary');
  });

  it('sleep / mood / steps use canvas scale, not native range or blue thumb', () => {
    expect(STEPS_SRC).toContain("variant: 'v4'");
    expect(STEPS_SRC).toContain("fill: row.kind === 'stress' ? 'act' : 'olive'");
    expect(STEPS_SRC).toContain('function sleepNormLine');
    expect(STEPS_SRC).toContain('mc-steps-hero-value');
    expect(STEPS_SRC).toContain("className: 'mc-steps-unit'");
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-steps-unit');
    expect(DAILY_CSS).toMatch(/mc-steps-unit[\s\S]*letter-spacing: 0/);
    expect(STEPS_SRC).toContain("secondaryLabelWhen: (data) => (data && data.estimated ? 'Ввести вес' : 'Не взвешивался')");
    expect(STEPS_SRC).toMatch(/CombinedSleepStepComponent[\s\S]*compact: true/);
    expect(STEPS_SRC).toMatch(/CombinedSleepStepComponent[\s\S]*mc-sleep-norm[\s\S]*mc-scale-card[\s\S]*mc-sleep-times mc-sleep-times--split/);
    expect(STEPS_SRC).toMatch(/CombinedSleepStepComponent[\s\S]*className: 'mc-scale-value'[\s\S]*React\.createElement\('b'/);
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-sleep-combined .mc-wheel-value--current');
    // Раньше верх шага держало общее правило со списком из пяти :has(...) и
    // padding-top 24px. Контракт «вид шага» даёт 16 сверху всем и 14 шагу веса,
    // поэтому общий верх задаёт .mc-step-content, а исключение осталось одно.
    expect(DAILY_CSS).toMatch(
      /\.mc-modal--daily \.mc-step-content \{[\s\S]*?padding: 16px 18px 0;/
    );
    expect(DAILY_CSS).toMatch(
      /\.mc-modal--daily \.mc-step-content:has\(\.mc-weight-step\) \{\s*padding-top: 14px;/
    );
    // Заголовок не должен прыгать между шагами: своего верха ни у одного из
    // остальных шагов мастера больше нет.
    ['mc-sleep-combined', 'mc-mood-step', 'mc-steps-step', 'mc-rest-step'].forEach((cls) => {
      expect(DAILY_CSS).not.toMatch(
        new RegExp(`\\.mc-step-content:has\\(\\.${cls}\\)[^{]*\\{[^}]*padding-top`)
      );
    });
    expect(DAILY_CSS).not.toMatch(/:has\(\.mc-sleep-combined\)\s*\{\s*padding-top: 22px/);
    expect(STEPS_SRC).toContain('mc-weight-step mc-weight-step--estimated');
    expect(STEPS_SRC).not.toContain('paddingTop: 34');
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-weight-step--estimated');
    expect(STEPS_SRC).toMatch(/CombinedSleepStepComponent[\s\S]*className: 'mc-sleep-clock'/);
    expect(STEPS_SRC).not.toMatch(/CombinedSleepStepComponent[\s\S]*className: 'mc-time-pickers'/);
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-sleep-block .mc-wheel-picker');
    expect(DAILY_CSS).toMatch(/\.mc-modal--daily \.mc-sleep-block \.mc-wheel-value[\s\S]*min-width: 0/);
    expect(STEPS_SRC).not.toMatch(/function CombinedSleepStepComponent[\s\S]*type: 'range'[\s\S]*function CombinedSleepStepComponent/);
    expect(STEPS_SRC).not.toMatch(/function CombinedSleepStepComponent[\s\S]*type: 'range'[\s\S]*registerStep\('sleep'/);
    expect(STEPS_SRC).not.toMatch(/function StepsGoalStepComponent[\s\S]*type: 'range'[\s\S]*registerStep\('stepsGoal'/);
    expect(STEPS_SRC).toContain('STEPS_GOAL_SLIDER_ANCHOR_RATIO = 2 / 3');
    expect(STEPS_SRC).toContain('valueToRatio: stepsGoalSliderValueToRatio');
    expect(STEPS_SRC).toContain('ratioToValue: stepsGoalSliderRatioToValue');
    expect(STEPS_SRC).toContain("hasStepsHistory ? 'Совет' : 'Старт'");
    expect(STEPS_SRC).toContain("className: 'mc-steps-advice-mark'");
    expect(STEPS_SRC).toContain('restoreAdvice');
    expect(DAILY_CSS).toContain('.mc-steps-advice-mark');
    expect(DAILY_CSS).toContain('cursor: pointer');
    expect(DAILY_CSS).toContain('.mc-steps-hero--custom');
  });

  it('rest and recorded match canvas buttons and empty fifth copy', () => {
    expect(STEPS_SRC).toContain('mc-pill mc-pill--choice');
    expect(STEPS_SRC).toContain('Резинки и разогрев · 6 минут');
    expect(STEPS_SRC).toContain('mc-rest-routine-actions');
    expect(STEPS_SRC).toContain("setRoutineStatus(status)");
    expect(STEPS_SRC).toContain('applyMorningActivationCheckinAnswer');
    expect(STEPS_SRC).toContain('Прошло ');
    expect(STEPS_SRC).toContain('formatMeasurementDaysAgoWords');
    expect(STEPS_SRC).toMatch(/measurementLayerHint[\s\S]*formatMeasurementDaysAgoWords/);
    expect(STEPS_SRC).toContain('buildMorningRestSparseNote');
    expect(STEPS_SRC).toContain('две ежедневные карточки: душ и рутина');
    expect(STEPS_SRC).toContain('mc-steps-refeed-row');
    // канвас: «Загрузочный день» стоит между подсказкой ползунка и сноской «План на день…»
    expect(STEPS_SRC).toMatch(/mc-steps-refeed-row[\s\S]*narrative\.footnote && React\.createElement/);
    expect(STEPS_SRC).toContain('Сдвиньте пальцем, если день будет другим');
    expect(STEPS_SRC).not.toMatch(/Сдвinьте/);
    expect(STEPS_SRC).toMatch(/showSupplementsCard\s*=\s*showSupplements\s*&&\s*planned\.length\s*>\s*0/);
    expect(STEPS_SRC).toContain('MorningRestSupplementsFlow');
    expect(STEPS_SRC).toContain('renderMorningRestSuppLayer');
    expect(STEPS_SRC).toContain('mc-supp-flow');
    expect(STEPS_SRC).toContain('Дозы и время');
    expect(STEPS_SRC).toContain("'b6', 'iodine'");
    expect(STEPS_SRC).toContain("iodine: 'Йод'");
    expect(STEPS_SRC).toContain('Курс пока пуст');
    expect(STEPS_SRC).not.toContain('В курсе нет добавок');
    expect(STEPS_SRC).toContain('isMorningRestSupplementsEnabled');
    expect(STEPS_SRC).toContain('Добавить в курс');
    expect(STEPS_SRC).toContain('mc-rest-card--supplements');
    expect(STEPS_SRC).toContain('supplementsOpen');
    expect(STEPS_SRC).toContain('mc-recorded-check');
    expect(STEPS_SRC).toContain('Норма на утро');
    expect(STEPS_SRC).toContain('resolveDailyTargets');
    expect(STEPS_SRC).not.toContain('getMorningKcal');
    expect(STEPS_SRC).toContain('Норма уточнится к вечеру по факту шагов и тренировок.');
    expect(STEPS_SRC).toContain('mc-recorded-row__mark');
    expect(STEPS_SRC).toContain('showWeightRow');
    expect(STEPS_SRC).not.toMatch(/registerStep\('checkinRecorded'[\s\S]*?disableBack:\s*true/);
    expect(DAILY_CSS).toContain('.mc-modal--daily .mc-step-content:has(.mc-recorded)');
    expect(DAILY_CSS).toContain('.mc-recorded-row__kcal');
    expect(DAILY_CSS).toContain('.mc-recorded-row__mark');
    expect(DAILY_CSS).toMatch(/\.mc-recorded \{[\s\S]*justify-content:\s*center/);
    expect(DAILY_CSS).toMatch(/\.mc-recorded \{[\s\S]*min-height:\s*100%/);
    expect(STEPS_SRC).not.toMatch(/function MorningRestStepComponent[\s\S]*mc-btn--primary[\s\S]*registerStep\('morningRest'/);
    expect(STEPS_SRC).toContain("mc-pill--choice");
    expect(STEPS_SRC).toContain('openColdLayer');
    expect(STEPS_SRC).toContain("mc-rest-step--layer");
    // Каждый лист шага — со стрелкой назад: холод, кофе, замеры, добавки.
    expect(STEPS_SRC).toContain('showHeaderBack: (data) => !!(data && (data.coldOpen === true || data.coffeeOpen === true || data.measurementsOpen === true || data.supplementsOpen === true))');
    expect(STEPS_SRC).toContain('applyHeaderBack:');
    expect(STEPS_SRC).toContain('mc-rest-cold-head');
    expect(STEPS_SRC).toContain('mc-rest-cold-streak');
    expect(STEPS_SRC).toContain("mc-rest-cold-time");
    expect(STEPS_SRC).toContain("className: 'mc-rest-cold-clock'");
    expect(STEPS_SRC).not.toMatch(/mc-rest-cold-time[\s\S]{0,220}className: 'mc-time-pickers'/);
    expect(STEPS_SRC).toContain('Убрать отметку');
    expect(STEPS_SRC).toContain('clearColdMark');
    expect(STEPS_SRC).toContain('clearMeasurementsMark');
    expect(STEPS_SRC).toContain('mc-rest-clear-mark');
    expect(STEPS_SRC).toContain('mc-rest-measure-row');
    expect(STEPS_SRC).toContain('Не сейчас');
    expect(STEPS_SRC).toContain('Пропустите — напомним через неделю.');
    expect(STEPS_SRC).toContain('openMeasurementsLayer');
    expect(STEPS_SRC).toContain('setColdClock');
    expect(STEPS_SRC).toMatch(/applyHeaderBack:[\s\S]*?next\.supplementsLayer === 'dose'[\s\S]*?next\.supplementsLayer === 'add'/);
    expect(STEPS_SRC).toMatch(/applyHeaderBack:[\s\S]*?next\.supplementsOpen = false/);
    // Было `mc-rest-overdue-kicker` — метка слева над строкой, как на кадре
    // «Чек-ин · замеры просрочены». Контракт «вид просроченной строки» ставит её
    // справа 10 px/700 и старше кадра, поэтому кикер с точкой снят.
    expect(STEPS_SRC).toContain('mc-rest-overdue-badge');
    expect(STEPS_SRC).toContain('mc-rest-consent-card');
    expect(STEPS_SRC).toContain('isMorningRestHealthConsentComplete');
    expect(STEPS_SRC).toContain('isMorningRestMeasurementsConsentOn');
    expect(STEPS_SRC).toContain('getMorningRestConsentBannerCopy');
    expect(DAILY_CSS).toContain('.mc-rest-routine-actions');
    expect(DAILY_CSS).toContain('.mc-rest-row--overdue');
    // Точки у метки больше нет: контракт описывает метку числом дней справа,
    // без иконок. См. комментарий у `mc-rest-overdue-badge` выше.
    expect(DAILY_CSS).toContain('.mc-rest-overdue-badge');
    expect(DAILY_CSS).toContain('.mc-rest-chevron--down');
    expect(DAILY_CSS).toMatch(/\.mc-rest-consent-primary[\s\S]*flex:\s*1\.5/);
    expect(DAILY_CSS).toContain('.mc-steps-info-card');
    expect(DAILY_CSS).toContain('.mc-note-toggle-icon');
    expect(DAILY_CSS).toContain('.mc-rest-consent-banner');
    expect(DAILY_CSS).toContain('.mc-steps-refeed-row');
    expect(DAILY_CSS).toContain('.mc-rest-cold-streak');
    expect(DAILY_CSS).toContain('.mc-rest-cold-time');
    expect(DAILY_CSS).toContain('.mc-rest-clear-mark');
    expect(DAILY_CSS).toContain('.mc-rest-measure-row');
    expect(DAILY_CSS).toContain('.mc-rest-card--supplements');
    expect(DAILY_CSS).toContain('.mc-rest-supp-add');
    expect(DAILY_CSS).toContain('.mc-supp-flow-foot');
    expect(DAILY_CSS).toContain('.mc-supp-flow-body');
    expect(DAILY_CSS).toContain('.mc-supp-flow-later');
    expect(DAILY_CSS).toContain('.mc-supp-flow-chip');
    expect(DAILY_CSS).toContain('.mc-rest-cold-time .mc-wheel-value--current');
    expect(DAILY_CSS).toContain('.mc-rest-cold-time .mc-time-sep');
    expect(DAILY_CSS).toMatch(/\.mc-rest-type \{[\s\S]*--v4-sand-surface-soft, #fffaf1/);
    expect(DAILY_CSS).toMatch(/\.mc-rest-type\.is-on \{[\s\S]*--v4-sand-hero, #efe3cf/);
  });

  it('yesterday: single footer, feelings four forces, pack chevron list', () => {
    expect(YESTERDAY_SRC).toContain('Вчерашний день выглядит неполным');
    expect(YESTERDAY_SRC).toContain('Дописать точно');
    expect(YESTERDAY_SRC).toContain('Как вы вчера ели?');
    expect(YESTERDAY_SRC).toContain("title: 'Не доел'");
    expect(YESTERDAY_SRC).toContain("title: 'Как надо'");
    expect(YESTERDAY_SRC).toContain('hideDailyFooter: true');
    expect(YESTERDAY_SRC).toContain('Перед чек-ином');
    expect(YESTERDAY_SRC).toContain('packPendingDaysTitle');
    expect(YESTERDAY_SRC).toContain('getFeelingsLayerTitle');
    expect(YESTERDAY_SRC).toContain('packBulkSubmitLabel');
    expect(YESTERDAY_SRC).toContain('Четыре дня остались незакрытыми');
    expect(YV_CSS).toContain('yv-pack-secondary--feelings');
    expect(YESTERDAY_SRC).toContain('openDiaryForDate');
    expect(YESTERDAY_SRC).toContain('confirmAsWrittenLabel');
    expect(YESTERDAY_SRC).toContain('packBulkCloseLabel');
    expect(YESTERDAY_SRC).toContain("'Очистить ' + spellPackCount(emptyVisibleDays.length)");
    expect(YESTERDAY_SRC).toMatch(/Массовая оценка теперь считает только эти ' \+ spellPackCount/);
    expect(YESTERDAY_SRC).toContain('yv-force');
    expect(YV_CSS).toContain('.yv-force--on');
    expect(YV_CSS).toContain('.yv-canvas-foot');
  });
});
