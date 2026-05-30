// heys_fingers_svg_anatomy_v1.js — Wave 2-B (visual).
// HEYS.Fingers.AnatomyDiagram({ highlightMuscles, showPulleys, onMuscleClick, size })
//   — единая inline SVG предплечья + кисти (palmar view, ладонью к зрителю).
// Мышцы — отдельные <path> с уникальными id; подсветка через fill={accent}/{muted}.
// Tap на мышцу — через <button>-wrapper для accessibility (aria-label).
//
// Public API:
//   HEYS.Fingers.AnatomyDiagram(props)
//     props.highlightMuscles : string[] — id мышц для подсветки
//     props.showPulleys      : bool     — показать A2/A4 связки маркерами
//     props.onMuscleClick    : (muscleId) => void
//     props.size             : px (default 240)
//
//   HEYS.Fingers.MUSCLE_INFO : Object<muscleId, {name, latin, function, injuries, sourceIds}>
//   HEYS.Fingers.MUSCLE_IDS  : string[]
//
// Идемпотентность: Fingers.AnatomyDiagram__registered.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.AnatomyDiagram__registered) return;
  Fingers.AnatomyDiagram__registered = true;

  const R = (typeof global.React !== 'undefined' && global.React) || null;
  if (!R) {
    try { console.warn('[Fingers.AnatomyDiagram] React not loaded — component unavailable until boot.'); } catch (_) {}
  }

  // ===== MUSCLE INFO (single source of truth) =====
  // sourceIds — ссылки на heys_fingers_bibliography_v1.js (Wave 2-A).
  const MUSCLE_INFO = Object.freeze({
    FDP: Object.freeze({
      name: 'Глубокий сгибатель пальцев',
      latin: 'Flexor Digitorum Profundus',
      function: 'Сгибает дистальный (DIP) сустав каждого пальца — основная сила в crimp/half-crimp хвате.',
      injuries: ['A2 pulley rupture', 'FDP avulsion (rugby finger)', 'Tendinopathy'],
      sourceIds: ['schweizer2008', 'schoffl2021'],
    }),
    FDS: Object.freeze({
      name: 'Поверхностный сгибатель пальцев',
      latin: 'Flexor Digitorum Superficialis',
      function: 'Сгибает проксимальный (PIP) сустав. В sloper и open-hand работает наравне с FDP.',
      injuries: ['FDS tendon strain', 'PIP synovitis', 'Lumbrical shift'],
      sourceIds: ['schweizer2008'],
    }),
    lumbricals: Object.freeze({
      name: 'Червеобразные мышцы',
      latin: 'Lumbricals',
      function: 'Сгибают MCP-сустав, разгибают IP. Перегружаются в pocket-хватах с неравномерной нагрузкой пальцев.',
      injuries: ['Lumbrical shift syndrome', 'Strain in pocket pulls'],
      sourceIds: ['schweizer2008'],
    }),
    brachioradialis: Object.freeze({
      name: 'Плечелучевая',
      latin: 'Brachioradialis',
      function: 'Сгибатель предплечья + supinator. Поддерживает hangboard грип через локтевой угол.',
      injuries: ['Forearm strain', 'Elbow tendinopathy'],
      sourceIds: ['horst_podcast10'],
    }),
    ECR: Object.freeze({
      name: 'Лучевой разгибатель запястья',
      latin: 'Extensor Carpi Radialis',
      function: 'Антагонист сгибателей пальцев. Слабость → pulley injury (Hörst: extensor balance критичен).',
      injuries: ['Lateral epicondylitis (climber\'s elbow)', 'Forearm overuse'],
      sourceIds: ['horst_podcast10'],
    }),
    FCR: Object.freeze({
      name: 'Лучевой сгибатель запястья',
      latin: 'Flexor Carpi Radialis',
      function: 'Сгибает запястье, ассистирует pinch и sloper хватам.',
      injuries: ['Medial epicondylitis', 'Wrist strain'],
      sourceIds: ['schweizer2008'],
    }),
    adductor_pollicis: Object.freeze({
      name: 'Приводящая мышца большого пальца',
      latin: 'Adductor Pollicis',
      function: 'Прижимает большой палец к ладони — главная мышца pinch-хвата.',
      injuries: ['Thumb CMC strain', 'Skier\'s thumb (UCL rupture)'],
      sourceIds: ['schweizer2008'],
    }),
  });

  const MUSCLE_IDS = Object.freeze(Object.keys(MUSCLE_INFO));

  Fingers.MUSCLE_INFO = MUSCLE_INFO;
  Fingers.MUSCLE_IDS = MUSCLE_IDS;

  // ===== SVG SHAPES =====
  // Кисть + предплечье, palmar view; viewBox 0 0 240 320.
  // Forearm — две parallel-полосы (radial/ulnar muscle groups) сверху; palm — overlap снизу.
  // Каждая «мышца» — это path c прозрачным fill по умолчанию; подсветка → accent fill.

  function muscleShape(d, id, isHighlighted, onClick) {
    const accent = 'var(--fingers-accent, #0066ff)';
    const muted = 'var(--fingers-muted, rgba(120, 120, 130, 0.18))';
    const fill = isHighlighted ? accent : muted;
    const opacity = isHighlighted ? 0.42 : 0.75;
    const stroke = isHighlighted ? accent : 'var(--fingers-text, #444)';
    // <path> с muscle id (для click delegation)
    return R.createElement('path', {
      key: 'muscle-' + id,
      d,
      fill,
      fillOpacity: opacity,
      stroke,
      strokeWidth: 1.2,
      strokeOpacity: isHighlighted ? 0.8 : 0.35,
      'data-muscle-id': id,
      style: onClick ? { pointerEvents: 'none' } : undefined,
    });
  }

  // Координаты мышц (упрощённые анатомические pathи).
  const MUSCLE_PATHS = Object.freeze({
    // Forearm (top part of SVG)
    brachioradialis: 'M70 30 Q60 80 70 140 L88 140 Q82 80 90 30 Z',
    FCR:             'M95 35 Q92 85 100 140 L115 140 Q110 85 113 35 Z',
    FDS:             'M118 30 Q116 90 124 145 L140 145 Q138 90 138 30 Z',
    FDP:             'M143 35 Q142 90 148 145 L162 145 Q160 90 162 35 Z',
    ECR:             'M165 30 Q170 80 168 140 L185 140 Q180 80 188 30 Z',
    // Palm/hand area (lower part)
    lumbricals:        'M95 175 Q98 195 100 215 L150 215 Q152 195 150 175 Q145 170 122 170 Q98 170 95 175 Z',
    adductor_pollicis: 'M80 200 Q72 210 75 230 Q80 240 95 235 L100 218 Q92 205 80 200 Z',
  });

  // Кисть (статичный outline): palm + 5 пальцев + wrist
  function staticHandOutline() {
    const stroke = 'var(--fingers-text, #1a1a1f)';
    const stroke05 = { stroke, strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
    return [
      // wrist (separator под предплечьем)
      R.createElement('line', { key: 'wrist', x1: 65, y1: 150, x2: 195, y2: 150, ...stroke05, strokeWidth: 1.8 }),
      // palm outline
      R.createElement('path', { key: 'palm', d: 'M82 155 L82 230 Q82 250 100 252 L160 252 Q178 250 178 230 L178 155', ...stroke05 }),
      // 5 fingers — выпрямлены вверх (от palm-top вниз)
      // thumb (короткий, сбоку)
      R.createElement('path', { key: 'thumb', d: 'M82 200 Q60 200 56 218 Q54 238 70 245', ...stroke05 }),
      // index
      R.createElement('path', { key: 'finger-i', d: 'M96 155 L96 105 Q96 100 99 100 L101 100 Q104 100 104 105 L104 155', ...stroke05 }),
      // middle
      R.createElement('path', { key: 'finger-m', d: 'M118 155 L118 90 Q118 85 121 85 L123 85 Q126 85 126 90 L126 155', ...stroke05 }),
      // ring
      R.createElement('path', { key: 'finger-r', d: 'M140 155 L140 95 Q140 90 143 90 L145 90 Q148 90 148 95 L148 155', ...stroke05 }),
      // pinky
      R.createElement('path', { key: 'finger-p', d: 'M162 155 L162 115 Q162 110 165 110 L167 110 Q170 110 170 115 L170 155', ...stroke05 }),
      // forearm outline (sides)
      R.createElement('path', { key: 'fa-l', d: 'M62 30 Q58 90 65 150', ...stroke05 }),
      R.createElement('path', { key: 'fa-r', d: 'M198 30 Q198 90 195 150', ...stroke05 }),
    ];
  }

  // Pulleys (A2/A4) — показывать опционально
  function pulleyMarkers() {
    const stroke = 'var(--fingers-accent, #0066ff)';
    const markers = [];
    // 4 пальца × 2 pulley
    // index x=100, middle x=122, ring x=144, pinky x=166
    [[100, 105], [122, 90], [144, 95], [166, 115]].forEach(([x, topY], i) => {
      // A2 — около PIP (середина пальца)
      const pipY = topY + (155 - topY) * 0.5;
      // A4 — около DIP (нижняя треть)
      const dipY = topY + (155 - topY) * 0.78;
      markers.push(R.createElement('rect', {
        key: 'a2-' + i, x: x - 3, y: pipY - 2, width: 10, height: 3,
        fill: stroke, fillOpacity: 0.85, stroke: stroke, strokeWidth: 0.8,
      }));
      markers.push(R.createElement('rect', {
        key: 'a4-' + i, x: x - 3, y: dipY - 1.5, width: 10, height: 2,
        fill: stroke, fillOpacity: 0.7, stroke: stroke, strokeWidth: 0.5,
      }));
      markers.push(R.createElement('text', {
        key: 'lbl-a2-' + i, x: x + 9, y: pipY + 1, fill: stroke, fontSize: 5, fontFamily: 'system-ui',
      }, 'A2'));
    });
    return markers;
  }

  // ===== ОСНОВНОЙ КОМПОНЕНТ =====
  Fingers.AnatomyDiagram = function AnatomyDiagram(props) {
    if (!R) return null;
    const p = props || {};
    const size = typeof p.size === 'number' ? p.size : 240;
    const highlights = Array.isArray(p.highlightMuscles) ? p.highlightMuscles : [];
    const showPulleys = !!p.showPulleys;
    const onMuscleClick = typeof p.onMuscleClick === 'function' ? p.onMuscleClick : null;

    const highlightSet = new Set(highlights);

    // Сборка мышц
    const muscleEls = MUSCLE_IDS.map((mid) => {
      const d = MUSCLE_PATHS[mid];
      if (!d) return null;
      return muscleShape(d, mid, highlightSet.has(mid), onMuscleClick);
    }).filter(Boolean);

    const svgChildren = [];
    // 1) Мышцы (под рукой — backdrop)
    svgChildren.push(...muscleEls);
    // 2) Контур кисти + предплечья (поверх)
    svgChildren.push(...staticHandOutline());
    // 3) Pulleys (опционально, сверху всего)
    if (showPulleys) svgChildren.push(...pulleyMarkers());

    const svgEl = R.createElement('svg', {
      width: size,
      height: Math.round(size * 320 / 240),
      viewBox: '0 0 240 320',
      role: 'img',
      'aria-label': 'Анатомия предплечья и кисти. Подсвечены: ' + (highlights.length ? highlights.join(', ') : 'нет'),
      className: 'fingers-fs-anatomy-svg',
      style: { display: 'block', maxWidth: '100%' },
    }, ...svgChildren);

    // Если есть обработчик — рендерим overlay-кнопки для каждой мышцы (accessible).
    if (!onMuscleClick) {
      return R.createElement('div', { className: 'fingers-fs-anatomy-wrap', style: { position: 'relative', display: 'inline-block' } }, svgEl);
    }

    // Overlay-buttons: positioned absolute поверх SVG-областей.
    // Координаты (cx,cy в SVG-системе 240×320) → перевод в % контейнера.
    const HOTSPOTS = {
      brachioradialis:  { cx: 79,  cy: 90  },
      FCR:              { cx: 104, cy: 90  },
      FDS:              { cx: 128, cy: 88  },
      FDP:              { cx: 152, cy: 90  },
      ECR:              { cx: 176, cy: 85  },
      lumbricals:       { cx: 122, cy: 195 },
      adductor_pollicis:{ cx: 86,  cy: 220 },
    };

    const buttons = MUSCLE_IDS.map((mid) => {
      const info = MUSCLE_INFO[mid];
      const hs = HOTSPOTS[mid];
      if (!hs || !info) return null;
      const leftPct = (hs.cx / 240) * 100;
      const topPct  = (hs.cy / 320) * 100;
      return R.createElement('button', {
        key: 'btn-' + mid,
        type: 'button',
        className: 'fingers-fs-anatomy-hotspot' + (highlightSet.has(mid) ? ' is-active' : ''),
        'aria-label': info.latin + ' — ' + info.name + '. ' + info.function,
        onClick: function () { onMuscleClick(mid); },
        style: {
          position: 'absolute',
          left: leftPct + '%',
          top: topPct + '%',
          transform: 'translate(-50%, -50%)',
          width: '32px',
          height: '32px',
          minHeight: '44px',
          minWidth: '44px',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        },
      });
    }).filter(Boolean);

    return R.createElement(
      'div',
      { className: 'fingers-fs-anatomy-wrap', style: { position: 'relative', display: 'inline-block', width: size } },
      svgEl,
      ...buttons,
    );
  };

})(typeof window !== 'undefined' ? window : globalThis);
