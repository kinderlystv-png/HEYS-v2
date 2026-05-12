// heys_macro_ring_view_v1.js — единый React-компонент для рендера кольца БЖУ.
// Используется DayTab, виджетами и недельным отчётом.
//
// Намеренно использует существующие CSS-классы `.macro-ring*` из
// styles/modules/100-metrics-and-graphs.css — там лежат:
//   • keyframes macroRingFillIn / macroRingOverFillIn (анимация)
//   • dark-mode правила
//   • цвета фона, точки, переменные --ring-dasharray и т.п.
// Дублировать всё это в новый namespace дорого и рискованно (есть шансы
// разъехаться с dark-mode). Дополнительный класс-маркер `.heys-macro-ring`
// добавляется на корневой <div> для идентификации (отладка, будущие стили).

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const ringPrefix = 'heys-mr-grad-';
  let gradUid = 0;

  const RING_START_OFFSET_PCT = 9; // используется и в widgets, и в weekly; для DayTab можно переопределить через customStyles
  const RING_CAP_COMP_PCT = 5;

  function buildStrokeStyle(slot, gradientId, offsetOverride) {
    const ratio = Number.isFinite(slot.ratio) ? slot.ratio : 0;
    const basePct = Math.max(0, Math.min(100, Math.round(ratio * 100)) - RING_CAP_COMP_PCT);
    const offset = Number.isFinite(offsetOverride) ? offsetOverride : RING_START_OFFSET_PCT;
    return {
      strokeDasharray: basePct + ' 100',
      '--ring-dasharray': basePct + ' 100',
      '--ring-start-offset': -offset,
      stroke: 'url(#' + gradientId + ')',
    };
  }

  function getRingDotPos(slot, offsetOverride) {
    const ratio = Number.isFinite(slot.ratio) ? slot.ratio : 0;
    const basePct = Math.max(0, Math.min(100, Math.round(ratio * 100)) - RING_CAP_COMP_PCT);
    if (basePct <= 3) return null;
    const dotPct = basePct - 3;
    const offset = Number.isFinite(offsetOverride) ? offsetOverride : RING_START_OFFSET_PCT;
    const angle = ((dotPct + offset) / 100) * Math.PI * 2;
    return {
      x: 18 + 15.5 * Math.cos(angle),
      y: 18 + 15.5 * Math.sin(angle),
    };
  }

  /**
   * Главный рендер одного кольца.
   *
   * @param {Object} props
   * @param {Object} props.slot         — данные из core: { value, target, ratio, pct, color, overflowColor, gradientStops, hasOver, overPct, kind }
   * @param {string} props.toneClass    — 'protein' | 'fat' | 'carbs' (для CSS-класса)
   * @param {string} props.label        — 'Белки' | 'Жиры' | 'Углеводы'
   * @param {string} [props.shortLabel] — 'Б' | 'Ж' | 'У' (для innerShortLabel)
   * @param {string} [props.centerMode] — 'grams' (default) | 'pct'
   * @param {boolean}[props.hideTarget] — спрятать «/ Nг» под центром
   * @param {boolean}[props.hidePercentBadge] — спрятать боковой бейдж процента
   * @param {boolean}[props.innerShortLabel]  — отрисовать «Б»/«Ж»/«У» возле центра (виджет 3×1)
   * @param {Function}[props.onClick]   — клик по кольцу (DayTab popup)
   * @param {Array}  [props.badges]     — бейджи под кольцом
   * @param {string|Function}[props.valueColor] — тонировка центрального значения
   * @param {string} [props.ariaLabel]
   * @param {Object} [props.rootStyle]  — inline-стиль корневого .macro-ring (DayTab ringButton style)
   * @param {Object} [props.valueStyle] — inline-стиль центрального значения (DayTab styles.value(color))
   * @param {boolean}[props.pulse]      — авто-пульсация если color===red (default true)
   * @param {string} [props.gradientId] — кастомный id градиента (иначе авто)
   * @param {number} [props.ringStartOffsetPct] — кастомный offset (DayTab 7, остальные 9)
   * @param {string} [props.keySuffix]  — суффикс ключа (для list внутри map)
   */
  function renderRing(props) {
    const React = global.React;
    if (!React) {
      // Если React ещё не загружен — возвращаем placeholder. Не падаем.
      return null;
    }
    const p = props || {};
    const slot = p.slot || {};
    const tone = p.toneClass || slot.kind || 'protein';
    const value = slot.value || 0;
    const target = slot.target || 0;
    const pct = slot.pct || 0;
    const color = slot.color || '#6b7280';
    const overflowColor = slot.overflowColor || '#ef4444';
    const gradStops = Array.isArray(slot.gradientStops) ? slot.gradientStops : ['#fecaca', '#ef4444'];
    const hasOver = !!slot.hasOver;
    const overPctRaw = Number.isFinite(slot.overPct) ? slot.overPct : 0;
    const overPctCapped = Math.max(0, overPctRaw - RING_CAP_COMP_PCT);

    const gradientId = p.gradientId || (ringPrefix + tone + '-' + (++gradUid));
    const offsetOverride = p.ringStartOffsetPct;

    const strokeStyle = buildStrokeStyle(slot, gradientId, offsetOverride);
    const dot = getRingDotPos(slot, offsetOverride);
    const dotColor = (slot.ratio || 0) > 1 ? '#ef4444' : '#22c55e';
    const pulseEnabled = p.pulse !== false && color === '#ef4444';

    const centerMode = p.centerMode || 'grams';
    let centerText;
    if (centerMode === 'pct') {
      centerText = Math.min(999, Math.round(pct)) + '%';
    } else {
      centerText = Math.round(value);
    }
    const targetText = (centerMode === 'grams' && !p.hideTarget && target > 0)
      ? ('/ ' + Math.round(target) + 'г')
      : null;
    const showPctBadge = !p.hidePercentBadge && centerMode === 'grams';

    const valueStyle = p.valueStyle
      || (typeof p.valueColor === 'function' ? { color: p.valueColor(color) } : (p.valueColor ? { color: p.valueColor } : undefined));

    const ringClassName = [
      'macro-ring',
      tone,
      hasOver ? 'macro-ring--over' : null,
      pulseEnabled ? 'macro-ring-pulse' : null,
    ].filter(Boolean).join(' ');

    const ariaLabel = p.ariaLabel || (p.label
      ? (p.label + ': ' + Math.round(value) + (target > 0 ? (' из ' + Math.round(target) + ' грамм') : ''))
      : undefined);

    const ringNode = React.createElement('div',
      {
        className: ringClassName,
        onClick: p.onClick,
        style: p.rootStyle,
        role: p.onClick ? 'button' : 'img',
        'aria-label': ariaLabel,
        tabIndex: p.onClick ? 0 : undefined,
      },
      React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
        React.createElement('defs', null,
          React.createElement('linearGradient',
            { id: gradientId, x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
            React.createElement('stop', { offset: '0%', stopColor: gradStops[0] }),
            React.createElement('stop', { offset: '100%', stopColor: gradStops[1] }),
          ),
        ),
        React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.5, pathLength: 100 }),
        React.createElement('circle', {
          className: 'macro-ring-fill',
          cx: 18, cy: 18, r: 15.5, pathLength: 100,
          style: strokeStyle,
        }),
        hasOver && React.createElement('circle', {
          className: 'macro-ring-fill--over',
          cx: 18, cy: 18, r: 15.5, pathLength: 100,
          style: {
            strokeDasharray: overPctCapped + ' ' + (100 - overPctCapped),
            '--over-dasharray': overPctCapped + ' ' + (100 - overPctCapped),
            '--over-offset': -(100 - overPctCapped),
            stroke: overflowColor,
          },
        }),
        dot && React.createElement('circle', {
          className: 'macro-ring-dot',
          cx: dot.x, cy: dot.y, r: 2.2,
          style: { '--macro-ring-dot': dotColor, fill: dotColor },
        }),
      ),
      React.createElement('span',
        { className: 'macro-ring-value', style: valueStyle },
        centerText,
      ),
      p.innerShortLabel && p.shortLabel
        ? React.createElement('span', { className: 'macro-ring-inner-label' }, p.shortLabel)
        : null,
      showPctBadge
        ? React.createElement('span', { className: 'widget-macros__ring-pct' }, Math.min(999, Math.round(pct)) + '%')
        : null,
    );

    const labelNode = p.label
      ? React.createElement('span', { className: 'macro-ring-label' }, p.label)
      : null;
    let targetNode = null;
    if (targetText) {
      targetNode = React.createElement('span', { className: 'macro-ring-target' }, targetText);
    } else if (p.keepEmptyTargetSlot) {
      // виджет 3×1 ожидает пустой span для layout-выравнивания
      targetNode = React.createElement('span', { className: 'macro-ring-target macro-ring-target--empty' }, ' ');
    }
    const badgesNode = (Array.isArray(p.badges) && p.badges.length > 0)
      ? React.createElement('div', { className: 'macro-ring-badges' },
          p.badges.map((b, i) => React.createElement('span',
            { key: i, className: 'macro-ring-badge', title: b && b.desc },
            b && b.emoji,
          )),
        )
      : null;

    return React.createElement('div',
      {
        key: p.keySuffix ? (tone + '-' + p.keySuffix) : undefined,
        className: 'macro-ring-item heys-macro-ring heys-macro-ring--' + tone,
      },
      ringNode,
      labelNode,
      targetNode,
      badgesNode,
    );
  }

  HEYS.MacroRings = HEYS.MacroRings || {};
  HEYS.MacroRings.renderRing = renderRing;
  HEYS.MacroRings._ringInternals = { buildStrokeStyle, getRingDotPos, RING_START_OFFSET_PCT, RING_CAP_COMP_PCT };

})(typeof window !== 'undefined' ? window : globalThis);
