export const PLAN_FEED_FRAME = Object.freeze({
  zoneId: 'strength-builder',
  canvasFile: 'strength-builder.v4.dc.html',
  label: 'План в ленте дня',
  oid: 'И3',
  runtimeRootSelector: '#ui-v4-strength-plan-feed-host .sb-plan-feed',
});

export const NON_AUTOMATABLE_REASON_CODES = Object.freeze([
  'visual-composite',
  'semantic',
  'intentional-deviation',
]);

const EARLY_START_DECISION =
  'docs/ui/UI_V4_CODEX_DESIGN_DISCREPANCIES.md#strength-builder-будущий-план-нельзя-молча-начать-на-будущей-дате';

function computedStyle(selector, properties, options = {}) {
  return Object.freeze({
    kind: 'computed-style',
    selector,
    match: options.match || 'one',
    ...(options.locatorText ? { locatorText: options.locatorText } : {}),
    ...(options.expectedText ? { expectedText: options.expectedText } : {}),
    properties: Object.freeze({ ...properties }),
  });
}

function dom(selector, options = {}) {
  return Object.freeze({
    kind: 'dom',
    selector,
    match: options.match || 'one',
    ...(options.locatorText ? { locatorText: options.locatorText } : {}),
    ...(options.expectedText ? { expectedText: options.expectedText } : {}),
  });
}

function nonAutomatable(reasonCode, rationale, decisionRef) {
  return Object.freeze({
    reasonCode,
    rationale,
    ...(decisionRef ? { decisionRef } : {}),
  });
}

function contract(suffix, canvasValue, evidence) {
  return Object.freeze({
    rowIdentity: `${PLAN_FEED_FRAME.label} · ${suffix}`,
    canvasValue,
    ...evidence,
  });
}

/**
 * Explicit evidence map for Canvas frame И3. Assertions are scoped to the
 * deterministic visual-fixture root. Values remain Canvas expectations: a
 * later runner must report a mismatch rather than rewriting them from runtime.
 */
export const PLAN_FEED_DOM_CONTRACTS = Object.freeze([
  contract('01', 'шапка', {
    nonAutomatable: nonAutomatable(
      'visual-composite',
      'The ProgramPlanCard fixture starts below the day-page header; page chrome needs paired frame capture.',
    ),
  }),
  contract('02', 'направление column, зазор 3px', {
    nonAutomatable: nonAutomatable(
      'visual-composite',
      'Header column layout is outside ProgramPlanCard and cannot be attributed to its runtime root.',
    ),
  }),
  contract('03', '«Завтра, 12 августа» — имя экрана', {
    nonAutomatable: nonAutomatable(
      'visual-composite',
      'The page title is owned by the day shell, not by ProgramPlanCard.',
    ),
  }),
  contract('04', '«среда» — ключ', {
    nonAutomatable: nonAutomatable(
      'visual-composite',
      'The weekday key is owned by the day shell, not by ProgramPlanCard.',
    ),
  }),
  contract('05', 'область прокрутки', {
    nonAutomatable: nonAutomatable(
      'visual-composite',
      'Scroll ownership belongs to the surrounding day surface and requires a full-frame check.',
    ),
  }),
  contract('06', 'карточка .grp: отступ сверху 12px', {
    assertion: computedStyle(':scope > .sb-plan-card--future', { marginTop: '12px' }),
  }),
  contract('07', 'выравнивание center, зазор 10px', {
    assertion: computedStyle(':scope > .sb-plan-card--future > .sb-plan-summary', {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
    }),
  }),
  contract('08', '«B» — флекс none, ширина 34px, высота 34px, радиус 11px, фон var(--c2), выравнивание center, распределение center, шрифт 700 14px/1 Figtree, цвет var(--ac)', {
    assertion: computedStyle(':scope .sb-plan-letter', {
      flex: '0 0 auto',
      width: '34px',
      height: '34px',
      borderRadius: '11px',
      backgroundColor: 'var(--c2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '700',
      fontSize: '14px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'var(--ac)',
    }, { expectedText: 'B' }),
  }),
  contract('09', 'флекс 1, ширина от 0, направление column, зазор 3px', {
    assertion: computedStyle(':scope .sb-plan-summary-copy', {
      flex: '1 1 0%',
      minWidth: '0px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
    }),
  }),
  contract('10', '«Запланировано куратором» — шрифт 700 12.5px/1.2 Figtree, цвет var(--tx)', {
    assertion: computedStyle(':scope .sb-plan-summary-copy > b', {
      fontWeight: '700',
      fontSize: '12.5px',
      lineHeight: '1.2',
      fontFamily: 'Figtree',
      color: 'var(--tx)',
    }, { expectedText: 'Запланировано куратором' }),
  }),
  contract('11', '«День B · верх тела · Артём, 3 августа» — шрифт 500 11px/1.3 Figtree, цвет rgba(var(--ink),.56)', {
    assertion: computedStyle(':scope .sb-plan-summary-copy > .sb-plan-meta', {
      fontWeight: '500',
      fontSize: '11px',
      lineHeight: '1.3',
      fontFamily: 'Figtree',
      color: 'rgba(var(--ink),.56)',
    }, { expectedText: 'День B · верх тела · Артём, 3 августа' }),
  }),
  contract('12', '«план» — пилюля', {
    assertion: dom(':scope .sb-plan-summary > .sb-plan-badge', { expectedText: 'план' }),
  }),
  contract('13', 'направление column, зазор 6px, отступ сверху 12px', {
    assertion: computedStyle(':scope .sb-plan-exercises', {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginTop: '12px',
    }),
  }),
  contract('14', 'выравнивание baseline, зазор 10px', {
    assertion: computedStyle(':scope .sb-plan-exercises > li:not(.sb-plan-exercises-more)', {
      display: 'flex',
      alignItems: 'baseline',
      gap: '10px',
    }, { match: 'all' }),
  }),
  contract('15', '«Жим лёжа» — флекс 1, шрифт 600 12px/1.3 Figtree, цвет var(--tx)', {
    assertion: computedStyle(':scope .sb-plan-exercises > li > span', {
      flex: '1 1 0%',
      fontWeight: '600',
      fontSize: '12px',
      lineHeight: '1.3',
      fontFamily: 'Figtree',
      color: 'var(--tx)',
    }, { locatorText: 'Жим лёжа', expectedText: 'Жим лёжа' }),
  }),
  contract('16', '«4 × 8–12 · 75 кг» — моноцифры: шрифт 600 11px/1 Figtree, цвет rgba(var(--ink),.56)', {
    assertion: computedStyle(':scope .sb-plan-exercises > li > i', {
      fontWeight: '600',
      fontSize: '11px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      fontVariantNumeric: 'tabular-nums',
      color: 'rgba(var(--ink),.56)',
    }, { locatorText: '4 × 8–12 · 75 кг', expectedText: '4 × 8–12 · 75 кг' }),
  }),
  contract('17', 'зазор 7px, отступ сверху 12px', {
    assertion: computedStyle(':scope .sb-plan-actions--future', {
      display: 'flex',
      gap: '7px',
      marginTop: '12px',
    }),
  }),
  contract('18', '«Начать сейчас» — флекс 1, фон var(--acs), цвет var(--on-acs)', {
    nonAutomatable: nonAutomatable(
      'intentional-deviation',
      'Unsafe early start is intentionally absent because the owner contract has no fact-date rule.',
      EARLY_START_DECISION,
    ),
  }),
  contract('19', '«Перенести» — флекс none, поля 0 18px', {
    nonAutomatable: nonAutomatable(
      'intentional-deviation',
      'Transfer is intentionally the sole primary action after unsafe early start is removed.',
      EARLY_START_DECISION,
    ),
  }),
  contract('20', '«Неделя 2 из 4 · мезоцикл «База»» — ярус', {
    assertion: dom(':scope > .sb-plan-week-label', {
      expectedText: 'Неделя 2 из 4 · мезоцикл «База»',
    }),
  }),
  contract('21', 'карточка .grp', {
    assertion: dom(':scope > .sb-plan-week'),
  }),
  contract('22', 'зазор 5px', {
    assertion: computedStyle(':scope .sb-plan-week-days', { display: 'flex', gap: '5px' }),
  }),
  contract('23', 'флекс 1, направление column, выравнивание center, зазор 6px, фон var(--gr-bg), радиус 10px, поля 8px 0', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-done', {
      flex: '1 1 0%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: 'var(--gr-bg)',
      borderRadius: '10px',
      padding: '8px 0px',
    }),
  }),
  contract('24', '«Пн» — шрифт 600 9.5px/1 Figtree, цвет rgba(var(--ink),.56)', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-done > i', {
      fontWeight: '600',
      fontSize: '9.5px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'rgba(var(--ink),.56)',
    }, { expectedText: 'Пн' }),
  }),
  contract('25', '«✓» — шрифт 700 11px/1 Figtree, цвет var(--gr)', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-done > b', {
      fontWeight: '700',
      fontSize: '11px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'var(--gr)',
    }, { expectedText: '✓' }),
  }),
  contract('26', 'флекс 1, направление column, выравнивание center, зазор 6px, фон var(--bg), радиус 10px, поля 8px 0', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-rest', {
      flex: '1 1 0%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: 'var(--bg)',
      borderRadius: '10px',
      padding: '8px 0px',
    }, { match: 'all' }),
  }),
  contract('27', '«—» — шрифт 700 11px/1 Figtree, цвет rgba(var(--ink),.56)', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-rest > b', {
      fontWeight: '700',
      fontSize: '11px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'rgba(var(--ink),.56)',
    }, { match: 'all', expectedText: '—' }),
  }),
  contract('28', 'флекс 1, направление column, выравнивание center, зазор 6px, фон var(--c2), радиус 10px, поля 8px 0', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-assigned', {
      flex: '1 1 0%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: 'var(--c2)',
      borderRadius: '10px',
      padding: '8px 0px',
    }, { match: 'all' }),
  }),
  contract('29', '«●» — шрифт 700 11px/1 Figtree, цвет var(--ac)', {
    assertion: computedStyle(':scope .sb-plan-week-days > .is-assigned > b', {
      fontWeight: '700',
      fontSize: '11px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'var(--ac)',
    }, { match: 'all', expectedText: '●' }),
  }),
  contract('30', 'зазор 12px, перенос строк wrap, отступ сверху 10px, шрифт 600 10.5px/1 Figtree, цвет rgba(var(--ink),.56)', {
    assertion: computedStyle(':scope .sb-plan-week-legend', {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      marginTop: '10px',
      fontWeight: '600',
      fontSize: '10.5px',
      lineHeight: '1',
      fontFamily: 'Figtree',
      color: 'rgba(var(--ink),.56)',
    }),
  }),
  contract('31', 'выравнивание center, зазор 5px', {
    assertion: computedStyle(':scope .sb-plan-week-legend > span', {
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    }, { match: 'all' }),
  }),
  contract('32', 'ширина 9px, высота 9px, радиус 3px, фон var(--gr)', {
    assertion: computedStyle(':scope .sb-plan-week-legend i.is-done', {
      width: '9px',
      height: '9px',
      borderRadius: '3px',
      backgroundColor: 'var(--gr)',
    }),
  }),
  contract('33', 'ширина 9px, высота 9px, радиус 3px, фон var(--acs)', {
    assertion: computedStyle(':scope .sb-plan-week-legend i.is-assigned', {
      width: '9px',
      height: '9px',
      borderRadius: '3px',
      backgroundColor: 'var(--acs)',
    }),
  }),
  contract('34', 'ширина 9px, высота 9px, радиус 3px, фон rgba(var(--ink),.14)', {
    assertion: computedStyle(':scope .sb-plan-week-legend i.is-rest', {
      width: '9px',
      height: '9px',
      borderRadius: '3px',
      backgroundColor: 'rgba(var(--ink),.14)',
    }),
  }),
  contract('35', '«План — это назначение, а не факт: карточка заплани» — сноска', {
    assertion: dom(':scope > .sb-plan-trace', {
      expectedText: 'План — это назначение, а не факт: карточка запланированного дня не попадает ни в тоннаж, ни в счётчики, ни в движок нагрузки, пока тренировка не начата.',
    }),
  }),
  contract('текст', 'Завтра, 12 августа › среда › Запланировано куратором › День B · верх тела · Артём, 3 августа › план › Жим лёжа › 4 × 8–12 · 75 кг › Тяга штанги в наклоне › 4 × 8–12 · 60 кг › Жим гантелей сидя › 3 × 10–12 · 24 кг › Связка A · подтягивания ⇄ тяга блока › 3 раунда › и ещё 2 · всего 23 подхода › Начать сейчас › Перенести › Неделя 2 из 4 · мезоцикл «База» › Пн › Вт › Ср › Чт › Пт › Сб › Вс › сделано › назначено › день отдыха › План — это назначение, а не факт: карточка запланированного дня не попадает ни в тоннаж, ни в счётчики, ни в движок нагрузки, пока тренировка не начата.', {
    nonAutomatable: nonAutomatable(
      'semantic',
      'This is an ordered aggregate of page shell, card, week and intentional-deviation copy, not one unique runtime node.',
    ),
  }),
]);

