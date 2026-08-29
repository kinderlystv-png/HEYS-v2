// Тест сверки зоны «Отчёты и Инсайты» с канвасом reports-insights.v4.dc.html.
// Эталон метода — nutrition-v4-canvas-geometry.test.js: таблица пар
// «класс кадра → правило продуктового CSS», нормализация форм записи и
// поимённый список отступлений. Тест читает сам канвас, поэтому расхождение
// всплывает при правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const canvasPath = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html'
);
const canvas = fs.readFileSync(canvasPath, 'utf8').replace(/\r\n/g, '\n');
const insightsCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/734-ui-v4-insights.css'), 'utf8');
const reportsCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/733-ui-v4-reports.css'), 'utf8');

// Правило класса из <style> канваса.
function canvasRule(className) {
  const m = canvas.match(new RegExp('\\n\\s*\\.' + className + '\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

// Значение свойства из продуктового CSS-блока по имени класса.
function cssBlock(css, selector) {
  const m = css.match(new RegExp('\\.' + selector + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

function prop(block, name) {
  if (!block) return null;
  const m = block.match(new RegExp('(?:^|;|\\n)\\s*' + name + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}

// Нормализация форм записи: «.16em» ↔ «0.16em» (и после «:», и после пробела).
const norm = (v) => (v == null ? null : String(v).replace(/(^|[\s:(])\.(\d)/g, '$10.$2').trim());

describe('Отчёты и Инсайты v4 — сверка с канвасом', () => {
  it('канвас на месте и держит контракт зоны', () => {
    expect(canvas).toContain('data-contract');
    // Пакет 2026-08-29 (вторая пересборка): 59 строк — +демо-режим и пять
    // строк яруса «Неделя к неделе».
    expect(canvas.match(/data-v="/g).length).toBeGreaterThanOrEqual(59);
  });

  it('ярус «Неделя к неделе»: место, состав, неполные дни, вид', () => {
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    // место: между «Динамикой» и «Днями»
    expect(stats).toContain('function ReportsV4Weeks');
    const bottom = stats.slice(
      stats.indexOf('function ReportsTabV4Bottom'),
      stats.indexOf('function ReportsTabV4('),
    );
    expect(bottom.indexOf('ReportsV4Weeks(')).toBeLessThan(bottom.indexOf("'Дни'"));
    // состав и «не предсказывает»
    expect(stats).toContain('закрытые недели · только измеренное');
    expect(stats).toContain('function buildWeeklyRows');
    // Подпись под таблицей — из кадра: объясняет прочерк Score и счёт дней.
    expect(stats).toContain('Score считается по 30-дневной серии');
    // неполные дни — общим счётчиком зоны
    expect(stats).toContain('HEYS.DisciplineMatrix.hasAnyData');
    expect(stats).toContain("row.filledDays + ' из 7'");
    // вид: колонки 56 / 40 / 26, пилюля, разделители
    const kcal = cssBlock(reportsCss, 'reports-v4-weeks__head-kcal,\\s*\\n\\.reports-v4-weeks__kcal');
    expect(prop(kcal, 'width')).toBe('56px');
    const weight = cssBlock(reportsCss, 'reports-v4-weeks__head-weight,\\s*\\n\\.reports-v4-weeks__weight');
    expect(prop(weight, 'width')).toBe('40px');
    const score = cssBlock(reportsCss, 'reports-v4-weeks__head-score,\\s*\\n\\.reports-v4-weeks__score');
    expect(prop(score, 'width')).toBe('26px');
    const wrap = cssBlock(reportsCss, 'reports-v4-weeks');
    expect(prop(wrap, 'border-radius')).toBe('20px');
    expect(prop(wrap, 'padding')).toContain('2px 16px');
    const partial = cssBlock(reportsCss, 'reports-v4-weeks__partial');
    expect(prop(partial, 'padding')).toBe('3px 6px');
    expect(prop(partial, 'font')).toContain('9px');
  });

  it('ярус .tier: 10px/700, разрядка .16em — в обеих вкладках', () => {
    const tier = canvasRule('tier');
    expect(tier).toContain('font:700 10px');
    expect(norm(tier)).toContain('letter-spacing:0.16em');
    for (const [css, sel] of [[insightsCss, 'insights-v4-tier'], [reportsCss, 'reports-v4-tier']]) {
      const block = cssBlock(css, sel);
      expect(prop(block, 'font-size')).toBe('10px');
      expect(prop(block, 'font-weight')).toBe('700');
      expect(norm(prop(block, 'letter-spacing'))).toBe('0.16em');
      expect(prop(block, 'text-transform')).toBe('uppercase');
    }
  });

  it('карточка .grp: радиус 20, поля 16 — карточки яруса «Питание»', () => {
    const grp = canvasRule('grp');
    expect(grp).toContain('border-radius:20px');
    expect(grp).toContain('padding:16px');
    const card = cssBlock(insightsCss, 'insights-v4-nutrition__card');
    expect(prop(card, 'border-radius')).toBe('20px');
    expect(prop(card, 'padding')).toBe('16px');
  });

  it('список .cd: радиус 20, поля 2/16 — списки заглушки', () => {
    const cd = canvasRule('cd');
    expect(cd).toContain('padding:2px 16px');
    for (const sel of ['insights-v4-stub__fill', 'insights-v4-stub__ladder']) {
      const block = cssBlock(insightsCss, sel);
      expect(prop(block, 'border-radius')).toBe('20px');
      expect(prop(block, 'padding')).toContain('2px 16px');
    }
  });

  it('строка .row: 12.5px, поля 13/0, линия чернил 7%', () => {
    const row = canvasRule('row');
    expect(row).toContain('padding:13px 0');
    expect(row).toContain('12.5px');
    const fill = cssBlock(insightsCss, 'insights-v4-stub__fill-row');
    expect(prop(fill, 'padding')).toBe('13px 0');
    expect(prop(fill, 'font')).toContain('12.5px');
    const patterns = cssBlock(insightsCss, 'insights-v4-patterns__row');
    expect(prop(patterns, 'padding')).toBe('13px 0');
  });

  it('шапка карточки .mvH: 10.5px/600, чернила 55%, без капса', () => {
    const mvH = canvas.match(/\.mvH b\{([^}]*)\}/);
    expect(mvH && mvH[1]).toContain('10.5px');
    const head = cssBlock(insightsCss, 'insights-v4-nutrition__head');
    expect(prop(head, 'font')).toContain('10.5px');
    expect(prop(head, 'text-transform')).toBe(null);
    expect(prop(head, 'color')).toContain('0.55');
  });

  it('строка БЖУ .mrow: имя 96, число 58 вправо, полоса 8px', () => {
    const mrowB = canvas.match(/\.mrow b\{([^}]*)\}/);
    expect(mrowB && mrowB[1]).toContain('width:96px');
    const name = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-name');
    expect(prop(name, 'width')).toBe('96px');
    const kcal = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-kcal');
    expect(prop(kcal, 'min-width')).toBe('58px');
    const mbar = canvasRule('mbar');
    expect(mbar).toContain('height:8px');
    const bar = cssBlock(insightsCss, 'insights-v4-nutrition__bzhu-bar');
    expect(prop(bar, 'height')).toBe('8px');
  });

  it('чип окна: высота 34, радиус 999 (контракт «вид · окно и бейджи»)', () => {
    const chip = cssBlock(insightsCss, 'insights-v4-window__chip');
    expect(prop(chip, 'min-height')).toBe('34px');
    expect(prop(chip, 'border-radius')).toBe('999px');
  });

  it('бейдж зрелости: 9px/700 моноширинным, поля 4/7, радиус 999', () => {
    const badge = cssBlock(insightsCss, 'insights-v4-maturity');
    expect(prop(badge, 'font')).toContain('9px');
    expect(prop(badge, 'font')).toContain('ui-monospace');
    expect(prop(badge, 'padding')).toBe('4px 7px');
    expect(prop(badge, 'border-radius')).toBe('999px');
  });

  it('матрица дисциплины: имя 11px шириной 88, полоса 8px радиусом 999', () => {
    const name = cssBlock(reportsCss, 'reports-v4-discipline__name');
    expect(prop(name, 'width')).toBe('88px');
    expect(prop(name, 'font')).toContain('11px');
    const bar = cssBlock(reportsCss, 'reports-v4-discipline__bar');
    expect(prop(bar, 'height')).toBe('8px');
    expect(prop(bar, 'border-radius')).toBe('999px');
  });

  // Поимённый список отступлений — канон:
  // docs/implementation/REPORTS_INSIGHTS_V4_IMPLEMENTATION_2026-08-29.md.
  // Снятие любого пункта = правка кода + правка этого списка в одном заходе.
  it('отступления названы и не разрастаются молча', () => {
    // 2026-08-29, четвёртый заход: Δ питания снята (план прошлых дней
    // считается движком через HEYS.dayNorm), «лента дней» снята как
    // ошибочно записанная — спарклайн и так начинает с первого дня с едой
    // и периодом не ограничен (heys_day_sparkline_data_v1.js).
    // Пакет 2026-08-29 (четвёртая пересборка) принёс раздел копии.
    // Отступление одно: пять образцов переписаны, остальные 21 тип ждут
    // переписывания по ним — эмодзи в v4 срезается, но телеграфный тон
    // остаётся. Список обязан совпадать с вердиктами «≠» в снимке.
    const DEVIATIONS = ['запреты копии'];

    const verdicts = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../../docs/ui/ui-v4-contract-verdicts.json'), 'utf8'));
    const notEqual = Object.entries(verdicts.zones['reports-insights'].rows)
      .filter(([, row]) => row.v === '≠')
      .map(([key]) => key);
    expect(notEqual).toEqual(DEVIATIONS);
  });

  it('пакет 3: формы чисел планера, прочерк Score, «плановых», счётчик', () => {
    const card = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');
    // белок — вилка ±5 с округлением до 5; углеводы — потолок; ккал — точка
    expect(card).toContain("'белок ' + lo + '–' + hi + ' г'");
    expect(card).toContain("'углеводы до '");
    expect(card).toContain("'≈ ' + round10(v4Kcal) + ' ккал'");
    expect(card).not.toContain('spread(');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    expect(stats).toContain("' плановых'");
    expect(stats).toContain("reports-v4-weeks__score' + (row.score == null ? ' is-empty'");
    expect(stats).toContain('те, что вы сами отметили «не заполнял»');
    const empty = cssBlock(reportsCss, 'reports-v4-weeks__score\\.is-empty');
    expect(prop(empty, 'color')).toContain('v4-ink-30');
  });

  it('четвёртый заход: план прошлых дней и «N из M» у счётных', () => {
    const matrix = fs.readFileSync(
      path.resolve(__dirname, '../heys_discipline_matrix_v1.js'), 'utf8');
    expect(matrix).toContain('function resolveDayPlan');
    expect(matrix).toContain('HEYS.dayNorm && HEYS.dayNorm.resolve');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    // План прошлого дня подставляется и в Δ матрицы, и в колонку недель
    expect(stats.match(/resolvePlan\(/g).length).toBeGreaterThanOrEqual(2);
    const timing = fs.readFileSync(
      path.resolve(__dirname, '../insights/patterns/timing.js'), 'utf8');
    expect(timing).toContain('matchedDays: lateDates.size');
  });

  it('третий заход: v4-планер, время в «Ритме», «Как посчитано»', () => {
    const card = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_meal_rec_card.js'), 'utf8');
    expect(card).toContain("variant === 'v4'");
    expect(card).toContain('Что съесть сейчас');
    expect(card).toContain('Как посчитано');
    expect(card).toContain('_lastPlan');
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_dashboard.js'), 'utf8');
    expect(dashboard).toContain("variant: 'v4'");
    expect(dashboard).toContain('Следующий приём лучше до ');
    // Вид планера по кадру: чип 26px обводкой 1.5px, кнопка 44/14
    const chip = cssBlock(insightsCss, 'meal-rec-v4__chip');
    expect(prop(chip, 'height')).toBe('26px');
    expect(prop(chip, 'box-shadow')).toContain('1.5px');
    const cta = cssBlock(insightsCss, 'meal-rec-v4__cta');
    expect(prop(cta, 'min-height')).toBe('44px');
    expect(prop(cta, 'border-radius')).toBe('14px');
    const wrap = cssBlock(insightsCss, 'meal-rec-card--v4');
    expect(prop(wrap, 'border-radius')).toBe('20px');
    expect(prop(wrap, 'padding')).toBe('16px');
  });

  it('второй заход: экран Score, вес фикс-30, лист долга — в коде', () => {
    const cascade = fs.readFileSync(
      path.resolve(__dirname, '../heys_cascade_card_v1.js'), 'utf8');
    expect(cascade).toContain('heys-score-screen');
    expect(cascade).toContain('доли одного числа, сумма = ');
    const stats = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
    expect(stats).toContain("'Вес · 30 дней'");
    expect(stats).toContain('screenMode: true');
    expect(stats).toContain('дни особого периода в тренд не входят');
    expect(stats).toContain('!useReportsV4 && monthForecast');
    const dayImpl = fs.readFileSync(
      path.resolve(__dirname, '../heys_day_tab_impl_v1.js'), 'utf8');
    expect(dayImpl).toContain('chartPeriod: 31');
    const dashboard = fs.readFileSync(
      path.resolve(__dirname, '../insights/pi_ui_dashboard.js'), 'utf8');
    expect(dashboard).toContain('InsightsV4DebtSheet');
    expect(dashboard).toContain('Как считается долг');
  });
});
