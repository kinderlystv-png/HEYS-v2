import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const dashboardSource = fs.readFileSync(
  path.resolve(__dirname, '../insights/pi_ui_dashboard.js'),
  'utf8',
).replace(/\r\n/g, '\n');
const shellSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_app_shell_v1.js'),
  'utf8',
);

describe('Insights tab v4 structure', () => {
  it('exports v4 helpers and keeps CascadeInsightsSlot listener pattern', () => {
    expect(dashboardSource).toContain('function CascadeInsightsSlot');
    expect(dashboardSource).toContain("addEventListener('heys:cascade-ready'");
    expect(dashboardSource).toContain("addEventListener('heys:postboot-lazy-ready'");
    expect(dashboardSource).toContain('function InsightsV4Header');
    expect(dashboardSource).toContain('function InsightsTodayHero');
    expect(dashboardSource).toContain('function InsightsV4Attention');
    expect(dashboardSource).toContain('function InsightsV4Patterns');
    expect(dashboardSource).toContain('_test:');
  });

  it('uses curator-first screen order and v4 title', () => {
    expect(dashboardSource).toContain("className: 'insights-tab insights-v4'");
    expect(dashboardSource).toContain("insights-v4-meta__title' }, 'Инсайты'");
    expect(dashboardSource).toContain('insights-v4-hero');
    expect(dashboardSource).toContain('Стоит внимания');
    expect(dashboardSource).toContain('Что заметили');
    expect(dashboardSource).toContain('insights-v4-detail-link');
  });

  it('lifts PriorityActions to hero and v4 main path avoids archived rings', () => {
    expect(dashboardSource).toContain('variant: \'v4\'');
    expect(dashboardSource).toContain('if (useInsightsV4 && showInsightsDetail)');
    const v4MainStart = dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary');
    const legacySectionStart = dashboardSource.indexOf('// Определяем какие секции показывать');
    const v4MainBlock = dashboardSource.slice(v4MainStart, legacySectionStart);
    expect(v4MainBlock).toContain('h(CascadeInsightsSlot');
    expect(v4MainBlock).not.toContain('TotalHealthRing');
    expect(v4MainBlock).not.toContain('HealthRingsGrid');
  });

  it('does not mount confidence footer or trend score ring on v4 main return', () => {
    const v4Block = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4) {'),
      dashboardSource.indexOf('// Определяем какие секции показывать'),
    );
    expect(v4Block).not.toContain('insights-tab__confidence');
    expect(v4Block).not.toContain('TotalHealthRing');
    expect(v4Block).not.toContain('HealthRingsGrid');
    expect(v4Block).not.toContain('WhatIfScenariosCard');
    expect(v4Block).not.toContain('MetabolicQuickStatus');
  });

  it('detail layer includes weight forecast disclaimer and thresholds table', () => {
    expect(dashboardSource).toContain('insights-v4--detail');
    expect(dashboardSource).toContain('Прогноз веса');
    expect(dashboardSource).toContain('insights-v4-detail__disclaimer');
    // «Полнота данных» заменена таблицей порогов (контракт «состав порогов»):
    // второго счётчика полноты в слое нет, счётчик один и живёт в шапке.
    expect(dashboardSource).toContain('Персональные пороги');
    const detailBlock = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4 && showInsightsDetail)'),
      dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary'),
    );
    expect(detailBlock).not.toContain('WeeklyWrap');
    expect(detailBlock).not.toContain('WeeklyReportCard');
  });

  it('v4 priority actions hide duplicate why lines', () => {
    expect(dashboardSource).toContain('!isV4 && a.why');
    expect(dashboardSource).toContain("variant: 'v4'");
  });

  // Контракт reports-insights.v4 «окно наблюдения»: чипы 7/30 внутри
  // «Что заметили», в шапке только счётчик истории.
  it('окно наблюдения 7/30 живёт внутри блока, не в шапке', () => {
    expect(dashboardSource).toContain('INSIGHTS_V4_PERIODS = [7, 30]');
    expect(dashboardSource).toContain('insights-v4-window__chip');
    expect(dashboardSource).toContain("'окно наблюдения'");
    const header = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Header'),
      dashboardSource.indexOf('function InsightsTodayHero'),
    );
    expect(header).not.toContain('period-pill');
    expect(header).not.toContain('onPeriodChange');
  });

  it('контракт «Инсайты»: похвала без кнопок, риск первым, зрелость словом', () => {
    expect(dashboardSource).toContain('Сегодня без заданий — ритм держится, вчерашний план закрыт.');
    expect(dashboardSource).toContain('buildRelapseRiskAttentionCard');
    expect(dashboardSource).toContain("'риск срыва · '");
    expect(dashboardSource).toContain("insights-v4-maturity--forecast' }, 'прогноз'");
    expect(dashboardSource).toContain('buildPatternMaturityWord');
    // Тумблер «Показать все» в v4-пути снят: PatternsList больше не зовётся
    const v4Patterns = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Patterns'),
      dashboardSource.indexOf('function InsightsV4NutritionTier'),
    );
    expect(v4Patterns).not.toContain('PatternsList');
  });

  it('контракт «до 7 дней»: заглушка-витрина вместо демо-режима и тура', () => {
    expect(dashboardSource).toContain('function InsightsV4NewUserStub');
    expect(dashboardSource).toContain('Что откроется дальше');
    expect(dashboardSource).toContain('первые предупреждения — уже работают');
    expect(dashboardSource).toContain('!useInsightsV4 && !insightsTourCompleted');
    expect(dashboardSource).not.toContain('HEYS.InsightsTour.start()');
  });

  it('контракт «Подробно»: прогноз на 30, «Что если» с порога 14, без второго счётчика', () => {
    expect(dashboardSource).toContain('weightPrediction30');
    expect(dashboardSource).toContain('historyDaysWithData >= 14');
    expect(dashboardSource).toContain('оценку дня из паттернов, а не HEYS Score');
    const detail = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4 && showInsightsDetail)'),
      dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary'),
    );
    expect(detail).not.toContain('DataCompletenessCard');
  });

  it('shell hides duplicate title and day calendar on insights tab', () => {
    expect(shellSource).toContain('isPeriodAnalyticsTab = tab === \'stats\' || tab === \'insights\'');
    expect(shellSource).not.toMatch(/showDateRow = .*tab === 'insights'/);
    expect(dashboardSource).toContain('insights-v4-meta__title');
  });
});

// Экраны «Подробно» (пакет 2026-08-29): фенотип пятью осями и таблица
// порогов с двумя числами. Оба только читают — ни кнопок, ни правки.
describe('экраны «Подробно»: фенотип и пороги', () => {
  it('фенотип: пять осей, ярус следствий, честная незаполненная ось', () => {
    expect(dashboardSource).toContain('PHENOTYPE_AXES');
    expect(dashboardSource).toContain('function InsightsV4Phenotype');
    expect(dashboardSource).toContain('Что из этого следует');
    // Оси «жиры» в движке нет — выдуманное положение не рисуем
    expect(dashboardSource).toContain("'пока не определено'");
    expect(dashboardSource).toContain('Середина шкалы — не оценка');
    // строго 30 дней
    expect(dashboardSource).toContain('считается строго на 30 днях');
  });

  it('пороги: два числа в строке, зрелость по 14 дням, экран читающий', () => {
    expect(dashboardSource).toContain('function InsightsV4Thresholds');
    expect(dashboardSource).toContain("'общий'");
    expect(dashboardSource).toContain("'ваш'");
    // до 14 дней — «наблюдение», после — «правило · 14 дней»: срок в пилюле
    // из кадра, он и объясняет, откуда взялось слово
    expect(dashboardSource).toContain("personal ? 'правило · 14 дней' : 'наблюдение'");
    expect(dashboardSource).toContain('править их не нужно');
    // ни одной кнопки внутри экранов
    const thresh = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Thresholds'),
      dashboardSource.indexOf('// Контракт «новый пользователь»'),
    );
    expect(thresh).not.toContain("h('button'");
  });

  it('пороги разделены на три яруса по источнику числа', () => {
    // Контракт «три яруса по источнику»: восемь строк под словом
    // «персональные» обещали, что система изучила восемь параметров, а
    // изучила два.
    const thresh = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Thresholds'),
      dashboardSource.indexOf('// Контракт «новый пользователь»'),
    );
    expect(thresh).toContain('Посчитано по вашим дням');
    expect(thresh).toContain('Из вашего профиля');
    expect(thresh).toContain('Пока не считаем');
    // Имя экрана обещает ровно столько, сколько есть.
    expect(thresh).toContain("'Пороги расчёта'");
    expect(thresh).not.toContain('Персональные пороги');
    // Средняя колонка называется по источнику: «ваш» у наблюдения, «расчёт» у
    // арифметики от профиля.
    expect(thresh).toContain("'ваш', 'own'");
    expect(thresh).toContain("'расчёт', 'calc'");
  });

  it('ярус выбирается свойством строки, а не местом в разметке', () => {
    // Появится детектор — строка сама переедет, и счёт «N из 8» сойдётся без
    // второй правки.
    const thresh = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Thresholds'),
      dashboardSource.indexOf('// Контракт «новый пользователь»'),
    );
    expect(thresh).toContain("ROWS.filter((r) => r.source === 'observed' && r.mine != null)");
    expect(thresh).toContain("ROWS.filter((r) => r.source === 'profile' && r.mine != null)");
    expect(thresh).toContain('ROWS.filter((r) => r.mine == null)');
    expect(thresh).toContain("observed.length + ' из ' + ROWS.length");
  });

  it('две пустоты названы каждая своей причиной', () => {
    const thresh = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Thresholds'),
      dashboardSource.indexOf('// Контракт «новый пользователь»'),
    );
    expect(thresh).toContain('нужен сигнал последствия');
    expect(thresh).toContain('нет дефицита — перебирать нечего');
    expect(thresh).toContain('insights-v4-thresh__why');
    // Третий ярус колонок не имеет вовсе.
    expect(thresh).toContain('midLabel ? h(');
  });

  it('перебор дня считается от уставки дефицита, а не выдуман', () => {
    // Норма дня = расход × (1 + d/100); превышение, после которого день
    // перестаёт быть дефицитным, равно −d/(1+d/100). При −15 % это 18 % —
    // ровно число прежней редакции контракта.
    const thresh = dashboardSource.slice(
      dashboardSource.indexOf('function InsightsV4Thresholds'),
      dashboardSource.indexOf('// Контракт «новый пользователь»'),
    );
    expect(thresh).toContain('Math.round((-deficit / (1 + deficit / 100)))');
    const overshoot = (d) => Math.round(-d / (1 + d / 100));
    expect(overshoot(-15)).toBe(18);
    expect(overshoot(-20)).toBe(25);
    // Без дефицита порога нет, и выдумывать его нельзя.
    expect(thresh).toContain('deficit < 0');
  });

  it('старые карточки фенотипа и полноты в «Подробно» не монтируются', () => {
    const detail = dashboardSource.slice(
      dashboardSource.indexOf('if (useInsightsV4 && showInsightsDetail)'),
      dashboardSource.indexOf('if (useInsightsV4) {\n        return h(InsightsErrorBoundary'),
    );
    expect(detail).not.toContain('PhenotypeExpandableCard');
    expect(detail).not.toContain('DataCompletenessCard');
    expect(detail).toContain('InsightsV4Phenotype');
    expect(detail).toContain('InsightsV4Thresholds');
  });
});
